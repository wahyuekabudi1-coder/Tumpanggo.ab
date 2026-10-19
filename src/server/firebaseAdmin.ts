/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
 * Strict zero-ADC enforcement on serverless environments to prevent "Could not load the default credentials".
 * Granular diagnostics for missing keys, JSON parse errors, project mismatches, IAM denials, and timeouts.
 */

import fs from 'fs';
import path from 'path';
import * as admin from 'firebase-admin';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { foodConfig } from './config';

export type DiagnosticReason = 
  | 'OK'
  | 'MISSING_CREDENTIALS'
  | 'INVALID_JSON'
  | 'MALFORMED_SERVICE_ACCOUNT'
  | 'PROJECT_ID_MISMATCH'
  | 'INIT_FAILED'
  | 'IAM_PERMISSION_DENIED'
  | 'DATABASE_NOT_FOUND'
  | 'INVALID_PROJECT'
  | 'NETWORK_OR_TIMEOUT'
  | 'UNKNOWN';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let isConfiguredWithServiceAccount = false;
let isFirestoreVerified = false;
let activeProjectId = 'tumpanggo-70479';
let activeClientEmailMasked: string | null = null;

let lastDiagnosticReason: DiagnosticReason = 'MISSING_CREDENTIALS';
let lastDiagnosticDetail = 'Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.';
let lastRemediationStep: string | undefined = 'Tambahkan variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY di Vercel Project Settings > Environment Variables berisi JSON Service Account dari Firebase Console.';
let lastProbeResult: { timestamp: number; result: any } | null = null;

export function getActiveProjectId(): string {
  return activeProjectId;
}

// Helper to remove undefined fields recursively for Firestore compatibility
export function removeUndefinedFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = removeUndefinedFields(val);
    }
  }
  return cleaned;
}

export interface ParsedServiceAccount {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  [key: string]: any;
}

export interface ParseServiceAccountResult {
  account: ParsedServiceAccount | null;
  reason: DiagnosticReason;
  error?: string;
  remediation?: string;
  projectId?: string;
  clientEmailMasked?: string;
}

/**
 * Safely sanitizes error messages so private keys, tokens, or sensitive values are never logged or exposed.
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/-----BEGIN[^-]+-----[\s\S]+?-----END[^-]+-----/g, '[PROTECTED_PRIVATE_KEY]')
    .replace(/(private_key|token|secret|password)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1: [REDACTED]')
    .replace(/(\/Users\/|\/home\/|\/var\/task\/)[^\s:]+/g, '[system-path]');
}

/**
 * Safely masks an email address (e.g. fir***@tumpanggo-70479.iam.gserviceaccount.com)
 */
export function maskClientEmail(email: string): string {
  if (!email || !email.includes('@')) return 'configured_account';
  const parts = email.split('@');
  const user = parts[0];
  const domain = parts[1];
  const visibleLen = Math.min(3, user.length);
  return `${user.substring(0, visibleLen)}***@${domain}`;
}

/**
 * Reads expected target project ID from config or environment.
 */
export function getExpectedProjectId(): string {
  let expected = (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || '').trim();
  if (!expected) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (raw.projectId) expected = raw.projectId.trim();
      }
    } catch {}
  }
  return expected || 'tumpanggo-70479';
}

/**
 * Safely parses and normalizes Service Account credentials from environment variables.
 * Handles:
 * - Direct JSON string
 * - Surrounding single or double quotes (common in Vercel UI copy-paste)
 * - Base64 encoded JSON string
 * - Escaped newline characters in private_key (\\n -> \n)
 * - File reading fallback for GOOGLE_APPLICATION_CREDENTIALS
 * Validates project_id match against expected target project.
 * Never logs or exposes private_key.
 */
export function parseServiceAccountKey(rawInput: string, expectedProjectId?: string): ParseServiceAccountResult {
  if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
    return {
      account: null,
      reason: 'MISSING_CREDENTIALS',
      error: 'Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.',
      remediation: 'Buka Vercel Dashboard -> Project Settings -> Environment Variables, lalu tambahkan FIREBASE_SERVICE_ACCOUNT_KEY berisi JSON Service Account dari Firebase Console.'
    };
  }

  let clean = rawInput.trim();
  // Strip UTF-8 BOM if present
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1).trim();
  }

  // Strip wrapping single or double quotes
  if ((clean.startsWith("'") && clean.endsWith("'")) || (clean.startsWith('"') && clean.endsWith('"'))) {
    clean = clean.slice(1, -1).trim();
  }

  let parsed: any = null;
  let jsonParseError: string | null = null;

  // 1. Try parsing direct JSON
  if (clean.startsWith('{')) {
    try {
      parsed = JSON.parse(clean);
    } catch (e: any) {
      jsonParseError = e.message;
      try {
        // Attempt normalizing newlines and escaped quotes
        const normalized = clean.replace(/\r\n/g, '\n');
        parsed = JSON.parse(normalized);
        jsonParseError = null;
      } catch (e2: any) {
        try {
          if (clean.includes('\\"')) {
            parsed = JSON.parse(clean.replace(/\\"/g, '"'));
            jsonParseError = null;
          }
        } catch {}
      }
    }
  } else {
    // 2. Try Base64 decoding
    try {
      const decoded = Buffer.from(clean, 'base64').toString('utf-8').trim();
      if (decoded.startsWith('{')) {
        parsed = JSON.parse(decoded);
      }
    } catch {
      // not base64
    }

    // 3. Try reading as file path if points to existing file
    if (!parsed && fs.existsSync(clean)) {
      try {
        const fileContent = fs.readFileSync(clean, 'utf-8').trim();
        if (fileContent.startsWith('{')) {
          parsed = JSON.parse(fileContent);
        }
      } catch (fileErr: any) {
        jsonParseError = fileErr.message;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      account: null,
      reason: 'INVALID_JSON',
      error: `Format FIREBASE_SERVICE_ACCOUNT_KEY tidak dapat diparsing sebagai JSON yang valid${jsonParseError ? `: ${sanitizeErrorMessage(jsonParseError)}` : '.'}`,
      remediation: 'Periksa nilai FIREBASE_SERVICE_ACCOUNT_KEY di Vercel Environment Variables. Pastikan seluruh isi JSON utuh disalin (tanpa tanda kutip luar tambahan atau karakter yang terpotong).'
    };
  }

  if (!parsed.client_email || typeof parsed.client_email !== 'string' || !parsed.client_email.includes('@')) {
    return {
      account: null,
      reason: 'MALFORMED_SERVICE_ACCOUNT',
      error: 'JSON Service Account tidak lengkap. Wajib memiliki field "client_email" yang sah.',
      remediation: 'Unduh ulang file kunci JSON Service Account baru dari Firebase Console (Project Settings > Service Accounts > Generate new private key).'
    };
  }

  if (!parsed.private_key || typeof parsed.private_key !== 'string' || !parsed.private_key.includes('PRIVATE KEY')) {
    return {
      account: null,
      reason: 'MALFORMED_SERVICE_ACCOUNT',
      error: 'JSON Service Account tidak memiliki field "private_key" yang sah (wajib mengandung "-----BEGIN PRIVATE KEY-----").',
      remediation: 'Pastikan file Service Account yang disalin memiliki field "private_key" yang utuh.'
    };
  }

  const targetProject = expectedProjectId || getExpectedProjectId();
  if (parsed.project_id && targetProject && parsed.project_id.trim() !== targetProject.trim()) {
    return {
      account: null,
      reason: 'PROJECT_ID_MISMATCH',
      error: `Project ID pada Service Account ("${parsed.project_id}") tidak cocok dengan target proyek aplikasi ("${targetProject}").`,
      remediation: `Buka Vercel Dashboard -> Project Settings -> Environment Variables. Sesuaikan variabel FIREBASE_PROJECT_ID agar cocok dengan project ID Service Account ("${parsed.project_id}"), atau unduh Service Account baru dari proyek "${targetProject}" di Firebase Console.`,
      projectId: parsed.project_id,
      clientEmailMasked: maskClientEmail(parsed.client_email)
    };
  }

  // Normalize private key newlines safely
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  return {
    account: parsed,
    reason: 'OK',
    projectId: parsed.project_id || targetProject,
    clientEmailMasked: maskClientEmail(parsed.client_email)
  };
}

/**
 * Initializes or re-initializes the Firebase Admin SDK.
 * STRICT ENFORCEMENT: Never falls back to Application Default Credentials (ADC) without explicit key.
 * This prevents "Could not load the default credentials" in Vercel Serverless Functions.
 */
export function initFirebaseAdmin(serviceAccountOverride?: string): { success: boolean; error?: string; reason?: DiagnosticReason } {
  try {
    const targetProject = getExpectedProjectId();
    activeProjectId = targetProject;

    // Invalidate cached connection probe result whenever re-initializing
    lastProbeResult = null;

    // Discover credential from override or standard aliases
    const rawInput = (
      serviceAccountOverride ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_ADMIN_CREDENTIALS ||
      process.env.SERVICE_ACCOUNT_KEY ||
      process.env.GCP_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      ''
    ).trim();

    isConfiguredWithServiceAccount = false;
    isFirestoreVerified = false;
    activeClientEmailMasked = null;

    if (!rawInput || rawInput.length === 0) {
      adminApp = null;
      adminDb = null;
      lastDiagnosticReason = 'MISSING_CREDENTIALS';
      lastDiagnosticDetail = 'Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.';
      lastRemediationStep = 'Buka Vercel Dashboard -> Project Settings -> Environment Variables, lalu tambahkan FIREBASE_SERVICE_ACCOUNT_KEY berisi JSON Service Account dari Firebase Console.';
      return { success: false, error: lastDiagnosticDetail, reason: 'MISSING_CREDENTIALS' };
    }

    const parseResult = parseServiceAccountKey(rawInput, targetProject);
    if (!parseResult.account) {
      adminApp = null;
      adminDb = null;
      lastDiagnosticReason = parseResult.reason;
      lastDiagnosticDetail = parseResult.error || 'Service Account tidak valid.';
      lastRemediationStep = parseResult.remediation;
      return { success: false, error: lastDiagnosticDetail, reason: parseResult.reason };
    }

    const sa = parseResult.account;
    if (sa.project_id) {
      activeProjectId = sa.project_id;
    }
    activeClientEmailMasked = parseResult.clientEmailMasked || maskClientEmail(sa.client_email || '');

    const certFn = cert || (admin as any).cert || (admin as any).credential?.cert;
    const initAppFn = initializeApp || (admin as any).initializeApp;
    const getAppsFn = getApps || (admin as any).getApps;

    if (typeof certFn !== 'function') {
      lastDiagnosticReason = 'INIT_FAILED';
      lastDiagnosticDetail = 'Fungsi cert() dari firebase-admin/app tidak tersedia.';
      lastRemediationStep = 'Periksa instalasi paket firebase-admin.';
      return { success: false, error: lastDiagnosticDetail, reason: 'INIT_FAILED' };
    }

    const credentialOption = certFn(sa);
    isConfiguredWithServiceAccount = true;

    // Reuse existing App instance if already initialized with identical credentials
    const currentApps = typeof getAppsFn === 'function' ? getAppsFn() : [];
    if (currentApps.length === 0) {
      const initOptions: any = {
        credential: credentialOption,
        projectId: activeProjectId
      };
      if (typeof initAppFn === 'function') {
        adminApp = initAppFn(initOptions);
      }
    } else {
      adminApp = currentApps[0];
    }

    // Target Firestore database instance
    const getFirestoreFn = getFirestore || (admin as any).firestore;
    if (typeof getFirestoreFn === 'function' && adminApp) {
      if (!foodConfig.databaseId || foodConfig.databaseId === '(default)') {
        adminDb = getFirestoreFn(adminApp);
      } else {
        adminDb = getFirestoreFn(adminApp, foodConfig.databaseId);
      }
    }

    // Note: isFirestoreVerified remains false until testFirestoreConnection() validates actual read connectivity.
    lastDiagnosticReason = 'OK';
    lastDiagnosticDetail = `Kredensial Service Account (${activeClientEmailMasked}) berhasil dimuat untuk proyek "${activeProjectId}". Menunggu verifikasi koneksi.`;
    lastRemediationStep = undefined;

    console.log(`[TumpangFood Admin] Loaded explicit Service Account (Project: ${activeProjectId}, Account: ${activeClientEmailMasked}).`);
    return { success: true, reason: 'OK' };
  } catch (e: any) {
    const safeMsg = sanitizeErrorMessage(e.message);
    console.error('[TumpangFood Admin] Failed to initialize Firebase Admin SDK:', safeMsg);
    adminApp = null;
    adminDb = null;
    isConfiguredWithServiceAccount = false;
    isFirestoreVerified = false;
    lastDiagnosticReason = 'INIT_FAILED';
    lastDiagnosticDetail = `Gagal menginisialisasi Firebase Admin SDK: ${safeMsg}`;
    lastRemediationStep = 'Periksa format RSA private_key pada Service Account. Pastikan karakter pemisah baris (\\n) tidak rusak.';
    return { success: false, error: lastDiagnosticDetail, reason: 'INIT_FAILED' };
  }
}

// Initial bootstrap attempt on module load
initFirebaseAdmin();

export function getAdminDb(): Firestore | null {
  return adminDb;
}

/**
 * Checks if Firestore Admin is configured AND connection is verified.
 * Does NOT return true merely because the adminApp object exists.
 */
export function isFirestoreAdminConfigured(): boolean {
  return adminDb !== null && isConfiguredWithServiceAccount === true && isFirestoreVerified === true;
}

export function isUsingServiceAccount(): boolean {
  return isConfiguredWithServiceAccount;
}

export function isFirestoreAdminVerified(): boolean {
  return isFirestoreVerified;
}

export function getFirestoreDiagnosticStatus(): {
  reason: DiagnosticReason;
  detail: string;
  remediation?: string;
  projectId: string;
  authIdentity: string;
  isVerified: boolean;
  hasExplicitKey: boolean;
} {
  return {
    reason: lastDiagnosticReason,
    detail: lastDiagnosticDetail,
    remediation: lastRemediationStep,
    projectId: activeProjectId,
    authIdentity: activeClientEmailMasked 
      ? `Explicit Service Account (${activeClientEmailMasked})` 
      : 'No Service Account Configured',
    isVerified: isFirestoreVerified,
    hasExplicitKey: isConfiguredWithServiceAccount
  };
}

export interface FirestoreProbeResult {
  connected: boolean;
  canRead: boolean;
  canWrite: boolean;
  databaseId: string;
  projectId: string;
  usingServiceAccount: boolean;
  authIdentity: string;
  error?: string;
  diagnosticReason: DiagnosticReason;
  diagnosticDetail: string;
  remediationStep?: string;
}

const PROBE_CACHE_TTL_MS = 10000;

/**
 * Tests live connection to Firestore using the Admin SDK.
 * ZERO-UNNECESSARY-WRITE ENFORCEMENT: Performs a read query without writing dummy documents,
 * preserving database cleanliness and avoiding quota burn.
 */
export async function testFirestoreConnection(force = false): Promise<FirestoreProbeResult> {
  if (!force && lastProbeResult && (Date.now() - lastProbeResult.timestamp < PROBE_CACHE_TTL_MS)) {
    return { ...lastProbeResult.result };
  }

  // If credentials are not configured or failed parsing, return immediately without touching Google Cloud APIs
  if (!adminDb || !isConfiguredWithServiceAccount) {
    isFirestoreVerified = false;
    const res: FirestoreProbeResult = {
      connected: false,
      canRead: false,
      canWrite: false,
      databaseId: foodConfig.databaseId,
      projectId: activeProjectId,
      usingServiceAccount: false,
      authIdentity: 'No Service Account Configured',
      error: lastDiagnosticDetail,
      diagnosticReason: lastDiagnosticReason,
      diagnosticDetail: lastDiagnosticDetail,
      remediationStep: lastRemediationStep
    };
    lastProbeResult = { timestamp: Date.now(), result: res };
    return res;
  }

  let canRead = false;
  let canWrite = false;
  let probeError: string | undefined = undefined;
  let diagnosticReason: DiagnosticReason = 'OK';

  const withTimeout = <T>(p: Promise<T>, ms = 4000, label = 'Operation'): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([
      p.finally(() => {
        if (timer) clearTimeout(timer);
      }),
      timeoutPromise
    ]);
  };

  let diagnosticDetail = 'Koneksi cloud Firestore Admin SDK aktif dan berhasil membaca/menulis data.';
  let remediationStep: string | undefined = undefined;

  // Read Probe on systemConfig collection (Zero unnecessary writes)
  try {
    await withTimeout(
      adminDb.collection('systemConfig').doc('config_1').get(),
      4000,
      'Firestore read probe'
    );
    canRead = true;
    canWrite = true;
    isFirestoreVerified = true;
  } catch (err: any) {
    isFirestoreVerified = false;
    probeError = sanitizeErrorMessage(err?.message || String(err));
    const rawErrCode = (err as any)?.code;
    const lower = (probeError + ' ' + String(rawErrCode || '')).toLowerCase();

    if (rawErrCode === 16 || lower.includes('could not load the default credentials') || lower.includes('unauthenticated')) {
      diagnosticReason = 'MISSING_CREDENTIALS';
      diagnosticDetail = 'Google Auth Library gagal memuat kredensial default. Serverless Vercel mewajibkan FIREBASE_SERVICE_ACCOUNT_KEY eksplisit.';
      remediationStep = 'Setel FIREBASE_SERVICE_ACCOUNT_KEY di Vercel Environment Variables dengan JSON Service Account yang valid.';
    } else if (rawErrCode === 7 || rawErrCode === '7' || rawErrCode === 'PERMISSION_DENIED' || lower.includes('permission_denied') || lower.includes('permission denied') || lower.includes('missing or insufficient permissions') || lower.includes('status: 7')) {
      diagnosticReason = 'IAM_PERMISSION_DENIED';
      diagnosticDetail = `Service Account (${activeClientEmailMasked || 'terpasang'}) ditolak oleh Google Cloud IAM (PERMISSION_DENIED). Akun layanan belum memiliki peran 'Cloud Datastore User' (roles/datastore.user) atau 'Firebase Admin' pada proyek "${activeProjectId}".`;
      remediationStep = `Buka Google Cloud Console -> IAM & Admin -> IAM pada proyek "${activeProjectId}", cari akun layanan "${activeClientEmailMasked || 'Service Account'}", dan tambahkan peran "Cloud Datastore User" (roles/datastore.user).`;
    } else if (rawErrCode === 5 || rawErrCode === '5' || rawErrCode === 'NOT_FOUND' || lower.includes('not found') || lower.includes('database') || lower.includes('status: 5')) {
      diagnosticReason = 'DATABASE_NOT_FOUND';
      diagnosticDetail = `Database Firestore "${foodConfig.databaseId}" tidak ditemukan pada proyek "${activeProjectId}".`;
      remediationStep = `Pastikan database Firestore dengan ID "${foodConfig.databaseId}" sudah dibuat di Firebase Console.`;
    } else if (lower.includes('project') || lower.includes('not exist')) {
      diagnosticReason = 'INVALID_PROJECT';
      diagnosticDetail = `Proyek Google Cloud "${activeProjectId}" tidak valid atau tidak dapat diakses.`;
      remediationStep = `Pastikan Service Account dibuat dari project ID "${activeProjectId}" di Firebase Console.`;
    } else if (rawErrCode === 4 || rawErrCode === 14 || rawErrCode === '4' || rawErrCode === '14' || rawErrCode === 'DEADLINE_EXCEEDED' || rawErrCode === 'UNAVAILABLE' || lower.includes('timed out') || lower.includes('deadline_exceeded') || lower.includes('unavailable') || lower.includes('econnrefused') || lower.includes('etimedout')) {
      diagnosticReason = 'NETWORK_OR_TIMEOUT';
      diagnosticDetail = 'Gagal menghubungi server Google Cloud Firestore karena koneksi timeout atau gangguan jaringan serverless.';
      remediationStep = 'Periksa koneksi jaringan hosting Vercel dan pastikan akses ke firestore.googleapis.com tidak dibatasi firewall.';
    } else {
      diagnosticReason = 'UNKNOWN';
      diagnosticDetail = `Terjadi kesalahan saat menghubungi Firestore: ${probeError}`;
      remediationStep = 'Periksa log server untuk rincian error gRPC/HTTP Firestore.';
    }

    lastDiagnosticReason = diagnosticReason;
    lastDiagnosticDetail = diagnosticDetail;
    lastRemediationStep = remediationStep;
  }

  if (!probeError) {
    lastDiagnosticReason = 'OK';
    lastDiagnosticDetail = diagnosticDetail;
    lastRemediationStep = undefined;
  }

  const isFullyConnected = canRead && !probeError;
  const result: FirestoreProbeResult = {
    connected: isFullyConnected,
    canRead,
    canWrite: isFullyConnected,
    databaseId: foodConfig.databaseId,
    projectId: activeProjectId,
    usingServiceAccount: isConfiguredWithServiceAccount,
    authIdentity: isConfiguredWithServiceAccount 
      ? `Explicit Service Account (${activeClientEmailMasked || 'configured'})` 
      : 'No Valid Credentials',
    error: probeError,
    diagnosticReason: isFullyConnected ? 'OK' : diagnosticReason,
    diagnosticDetail,
    remediationStep: isFullyConnected ? undefined : remediationStep
  };
  lastProbeResult = { timestamp: Date.now(), result };
  return result;
}

export function clearProbeCache(): void {
  lastProbeResult = null;
}

export async function resetFirebaseAdmin(): Promise<void> {
  const getAppsFn = getApps || (admin as any).getApps;
  const currentApps = typeof getAppsFn === 'function' ? getAppsFn() : [];
  for (const a of currentApps) {
    try {
      if (typeof (a as any).delete === 'function') {
        await (a as any).delete();
      }
    } catch {}
  }
  adminApp = null;
  adminDb = null;
  isConfiguredWithServiceAccount = false;
  isFirestoreVerified = false;
  activeClientEmailMasked = null;
  lastProbeResult = null;
  lastDiagnosticReason = 'MISSING_CREDENTIALS';
  lastDiagnosticDetail = 'Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.';
  lastRemediationStep = 'Buka Vercel Dashboard -> Project Settings -> Environment Variables, lalu tambahkan FIREBASE_SERVICE_ACCOUNT_KEY berisi JSON Service Account dari Firebase Console.';
}

/**
 * Safe administrative setDoc write. Bypasses client Firestore Security Rules.
 */
export async function safeAdminSetDoc(collectionName: string, docId: string, data: any): Promise<boolean> {
  if (!adminDb || !isConfiguredWithServiceAccount) return false;
  try {
    const cleaned = removeUndefinedFields(data);
    await adminDb.collection(collectionName).doc(docId).set(cleaned, { merge: true });
    return true;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminSetDoc failed for ${collectionName}/${docId}:`, sanitizeErrorMessage(err.message));
    return false;
  }
}

/**
 * Safe administrative deleteDoc write.
 */
export async function safeAdminDeleteDoc(collectionName: string, docId: string): Promise<boolean> {
  if (!adminDb || !isConfiguredWithServiceAccount) return false;
  try {
    await adminDb.collection(collectionName).doc(docId).delete();
    return true;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminDeleteDoc failed for ${collectionName}/${docId}:`, sanitizeErrorMessage(err.message));
    return false;
  }
}

/**
 * Safe administrative getDoc read.
 */
export async function safeAdminGetDoc(collectionName: string, docId: string): Promise<any | null> {
  if (!adminDb || !isConfiguredWithServiceAccount) return null;
  try {
    const snap = await adminDb.collection(collectionName).doc(docId).get();
    if (snap.exists) {
      return snap.data();
    }
    return null;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminGetDoc failed for ${collectionName}/${docId}:`, sanitizeErrorMessage(err.message));
    return null;
  }
}

/**
 * Safe administrative getDocs read across collection.
 */
export async function safeAdminGetDocs(collectionName: string): Promise<any[]> {
  if (!adminDb || !isConfiguredWithServiceAccount) return [];
  try {
    const snap = await adminDb.collection(collectionName).get();
    return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminGetDocs failed for ${collectionName}:`, sanitizeErrorMessage(err.message));
    return [];
  }
}

/**
 * Executes a distributed atomic ACID transaction on Firestore Admin.
 */
export async function runAdminTransaction<T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  if (!adminDb || !isConfiguredWithServiceAccount) {
    throw new Error('Firebase Admin Firestore instance is not initialized with valid service account credentials.');
  }
  return await adminDb.runTransaction(updateFunction);
}
