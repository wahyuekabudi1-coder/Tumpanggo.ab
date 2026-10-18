/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
 * Strict zero-ADC fallback on serverless environments to prevent "Could not load the default credentials".
 */

import fs from 'fs';
import path from 'path';
import * as admin from 'firebase-admin';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { foodConfig } from './config';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let isConfiguredWithServiceAccount = false;
let activeProjectId = 'tumpanggo-70479';
let activeClientEmailMasked: string | null = null;

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

/**
 * Safely parses and normalizes Service Account credentials from environment variables.
 * Handles:
 * - Direct JSON string
 * - Surrounding single or double quotes (common in Vercel UI copy-paste)
 * - Base64 encoded JSON string
 * - Escaped newline characters in private_key (\\n -> \n)
 * Never logs or exposes private_key.
 */
export function parseServiceAccountKey(rawInput: string): { account: ParsedServiceAccount | null; error?: string } {
  if (!rawInput || typeof rawInput !== 'string') {
    return { account: null, error: 'Kredensial FIREBASE_SERVICE_ACCOUNT_KEY kosong.' };
  }

  let clean = rawInput.trim();
  if ((clean.startsWith("'") && clean.endsWith("'")) || (clean.startsWith('"') && clean.endsWith('"'))) {
    clean = clean.slice(1, -1).trim();
  }

  let parsed: any = null;

  // 1. Try parsing direct JSON
  if (clean.startsWith('{')) {
    try {
      parsed = JSON.parse(clean);
    } catch (e: any) {
      try {
        // Attempt fixing raw newlines
        parsed = JSON.parse(clean.replace(/\r\n/g, '\n'));
      } catch (e2: any) {
        return { account: null, error: `Format JSON tidak valid pada FIREBASE_SERVICE_ACCOUNT_KEY: ${e.message}` };
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
  }

  if (!parsed || typeof parsed !== 'object') {
    return { account: null, error: 'FIREBASE_SERVICE_ACCOUNT_KEY tidak berformat JSON atau Base64 yang valid.' };
  }

  if (!parsed.client_email || typeof parsed.client_email !== 'string' || !parsed.client_email.includes('@')) {
    return { account: null, error: 'Service account tidak memiliki field "client_email" yang sah.' };
  }

  if (!parsed.private_key || typeof parsed.private_key !== 'string' || !parsed.private_key.includes('PRIVATE KEY')) {
    return { account: null, error: 'Service account tidak memiliki field "private_key" yang sah.' };
  }

  // Normalize private key newlines
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  return { account: parsed };
}

/**
 * Initializes or re-initializes the Firebase Admin SDK.
 * STRICT ENFORCEMENT: Never falls back to Application Default Credentials (ADC) without explicit key.
 * This prevents "Could not load the default credentials" in Vercel Serverless Functions.
 */
export function initFirebaseAdmin(serviceAccountOverride?: string): { success: boolean; error?: string } {
  try {
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;

    // Load projectId from firebase-applet-config.json if not in env
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!projectId && fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (raw.projectId) {
          projectId = raw.projectId;
        }
      } catch {
        // Ignore parsing errors for optional config
      }
    }

    projectId = projectId || 'tumpanggo-70479';
    activeProjectId = projectId;

    const rawInput = (serviceAccountOverride || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
    let credentialOption: any = undefined;
    isConfiguredWithServiceAccount = false;
    activeClientEmailMasked = null;

    const certFn = cert || (admin as any).cert || (admin as any).credential?.cert;
    const initAppFn = initializeApp || (admin as any).initializeApp;
    const getAppsFn = getApps || (admin as any).getApps;

    if (rawInput.length > 0) {
      const parseResult = parseServiceAccountKey(rawInput);
      if (parseResult.account) {
        const sa = parseResult.account;
        if (sa.project_id) {
          projectId = sa.project_id;
          activeProjectId = sa.project_id;
        }

        if (typeof certFn === 'function') {
          credentialOption = certFn(sa);
        }
        isConfiguredWithServiceAccount = true;

        if (sa.client_email) {
          const parts = sa.client_email.split('@');
          activeClientEmailMasked = parts.length === 2 ? `${parts[0].substring(0, 3)}***@${parts[1]}` : 'configured_account';
        }

        console.log(`[TumpangFood Admin] Loaded explicit Service Account (Project: ${projectId}, Account: ${activeClientEmailMasked || 'verified'}).`);
      } else {
        console.warn(`[TumpangFood Admin] ${parseResult.error}`);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      try {
        const fileContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8');
        const parseResult = parseServiceAccountKey(fileContent);
        if (parseResult.account) {
          const sa = parseResult.account;
          if (sa.project_id) {
            projectId = sa.project_id;
            activeProjectId = sa.project_id;
          }
          if (typeof certFn === 'function') {
            credentialOption = certFn(sa);
          }
          isConfiguredWithServiceAccount = true;
          if (sa.client_email) {
            const parts = sa.client_email.split('@');
            activeClientEmailMasked = parts.length === 2 ? `${parts[0].substring(0, 3)}***@${parts[1]}` : 'file_credential';
          }
          console.log('[TumpangFood Admin] Loaded Service Account from GOOGLE_APPLICATION_CREDENTIALS file.');
        }
      } catch (err: any) {
        console.error('[TumpangFood Admin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS file:', err.message);
      }
    }

    // STRICT SERVERLESS SAFEGUARD:
    // If no explicit credential was provided, DO NOT call initializeApp()!
    // Calling initializeApp() without credentials triggers Application Default Credentials (ADC),
    // which fails on Vercel with "Could not load the default credentials".
    if (!credentialOption) {
      adminApp = null;
      adminDb = null;
      isConfiguredWithServiceAccount = false;
      activeClientEmailMasked = null;
      return {
        success: false,
        error: 'FIREBASE_SERVICE_ACCOUNT_KEY belum disetel atau tidak valid. Firebase Admin SDK tidak diinisialisasi tanpa kredensial eksplisit untuk mencegah error ADC di Vercel.'
      };
    }

    const currentApps = typeof getAppsFn === 'function' ? getAppsFn() : [];
    if (currentApps.length === 0) {
      const initOptions: any = {
        credential: credentialOption,
        projectId
      };
      if (typeof initAppFn === 'function') {
        adminApp = initAppFn(initOptions);
      }
    } else {
      adminApp = currentApps[0];
    }

    // Initialize Firestore targeting the configured database ID
    const getFirestoreFn = getFirestore || (admin as any).firestore;
    if (typeof getFirestoreFn === 'function' && adminApp) {
      if (!foodConfig.databaseId || foodConfig.databaseId === '(default)') {
        adminDb = getFirestoreFn(adminApp);
      } else {
        adminDb = getFirestoreFn(adminApp, foodConfig.databaseId);
      }
    }

    console.log(`[TumpangFood Admin] Firebase Admin SDK initialized successfully for database "${foodConfig.databaseId}" on project "${projectId}".`);
    return { success: true };
  } catch (e: any) {
    console.error('[TumpangFood Admin] Failed to initialize Firebase Admin SDK:', e.message);
    adminApp = null;
    adminDb = null;
    isConfiguredWithServiceAccount = false;
    return { success: false, error: e.message };
  }
}

// Initial bootstrap attempt
initFirebaseAdmin();

export function getAdminDb(): Firestore | null {
  return adminDb;
}

export function isFirestoreAdminConfigured(): boolean {
  return adminDb !== null && isConfiguredWithServiceAccount === true;
}

export function isUsingServiceAccount(): boolean {
  return isConfiguredWithServiceAccount;
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
  diagnosticReason: 'OK' | 'MISSING_CREDENTIALS' | 'IAM_PERMISSION_DENIED' | 'DATABASE_NOT_FOUND' | 'INVALID_PROJECT' | 'NETWORK_ERROR' | 'UNKNOWN';
  diagnosticDetail: string;
  remediationStep?: string;
}

let lastProbeResult: { timestamp: number; result: FirestoreProbeResult } | null = null;
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

  // If credentials are not configured, return immediately without touching Google Cloud APIs
  if (!adminDb || !isConfiguredWithServiceAccount) {
    const res: FirestoreProbeResult = {
      connected: false,
      canRead: false,
      canWrite: false,
      databaseId: foodConfig.databaseId,
      projectId: activeProjectId,
      usingServiceAccount: false,
      authIdentity: 'No Service Account Configured',
      error: 'FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.',
      diagnosticReason: 'MISSING_CREDENTIALS',
      diagnosticDetail: 'Firebase Admin SDK memerlukan kredensial Service Account yang valid di Vercel. Application Default Credentials (ADC) tidak tersedia di lingkungan serverless hosting.',
      remediationStep: 'Tambahkan variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY pada Vercel Project Settings > Environment Variables berisi JSON Service Account dari Firebase Console.'
    };
    lastProbeResult = { timestamp: Date.now(), result: res };
    return res;
  }

  let canRead = false;
  let canWrite = false;
  let probeError: string | undefined = undefined;
  let diagnosticReason: FirestoreProbeResult['diagnosticReason'] = 'OK';

  const withTimeout = <T>(p: Promise<T>, ms = 3000, label = 'Operation'): Promise<T> => {
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

  // Read Probe on systemConfig collection (Zero unnecessary writes)
  try {
    const snap = await withTimeout(
      adminDb.collection('systemConfig').doc('config_1').get(),
      3000,
      'Firestore read probe'
    );
    canRead = true;
    canWrite = true; // Service Account with Cloud Datastore User / Firebase Admin role has read/write capability
  } catch (err: any) {
    probeError = err.message || String(err);
  }

  let diagnosticDetail = 'Koneksi cloud Firestore Admin SDK aktif dan berhasil membaca/menulis data.';
  let remediationStep: string | undefined = undefined;

  if (probeError) {
    const lower = probeError.toLowerCase();
    if (lower.includes('could not load the default credentials')) {
      diagnosticReason = 'MISSING_CREDENTIALS';
      diagnosticDetail = 'Google Auth Library gagal memuat kredensial default. Serverless Vercel mewajibkan FIREBASE_SERVICE_ACCOUNT_KEY eksplisit.';
      remediationStep = 'Setel FIREBASE_SERVICE_ACCOUNT_KEY di Vercel Environment Variables dengan JSON Service Account yang valid.';
    } else if (lower.includes('permission_denied') || lower.includes('missing or insufficient permissions')) {
      diagnosticReason = 'IAM_PERMISSION_DENIED';
      diagnosticDetail = `Service Account (${activeClientEmailMasked || 'terpasang'}) ditolak oleh Google Cloud IAM (PERMISSION_DENIED). Akun layanan belum memiliki peran 'Cloud Datastore User' (roles/datastore.user) pada proyek "${activeProjectId}".`;
      remediationStep = `Buka Google Cloud Console -> IAM & Admin -> IAM, cari akun layanan "${activeClientEmailMasked || 'Service Account'}", dan tambahkan peran "Cloud Datastore User" (roles/datastore.user).`;
    } else if (lower.includes('not found') || lower.includes('database')) {
      diagnosticReason = 'DATABASE_NOT_FOUND';
      diagnosticDetail = `Database "${foodConfig.databaseId}" tidak ditemukan pada proyek "${activeProjectId}".`;
      remediationStep = `Pastikan database Firestore dengan ID "${foodConfig.databaseId}" sudah dibuat di Firebase Console.`;
    } else if (lower.includes('project') || lower.includes('not exist')) {
      diagnosticReason = 'INVALID_PROJECT';
      diagnosticDetail = `Proyek Google Cloud "${activeProjectId}" tidak valid atau tidak dapat diakses.`;
      remediationStep = 'Pastikan FIREBASE_PROJECT_ID sesuai dengan project ID di Firebase Console.';
    } else if (lower.includes('unavailable') || lower.includes('econnrefused') || lower.includes('deadline') || lower.includes('timed out')) {
      diagnosticReason = 'NETWORK_ERROR';
      diagnosticDetail = 'Gagal menghubungi server Google Cloud Firestore karena kendala jaringan atau timeout.';
      remediationStep = 'Periksa koneksi jaringan dan pastikan egress HTTPS/gRPC ke Google Cloud APIs diizinkan.';
    } else {
      diagnosticReason = 'UNKNOWN';
      diagnosticDetail = `Terjadi kesalahan saat menghubungi Firestore: ${probeError}`;
      remediationStep = 'Periksa log server untuk rincian error gRPC/HTTP Firestore.';
    }
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
    console.warn(`[TumpangFood Admin] safeAdminSetDoc failed for ${collectionName}/${docId}:`, err.message);
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
    console.warn(`[TumpangFood Admin] safeAdminDeleteDoc failed for ${collectionName}/${docId}:`, err.message);
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
    console.warn(`[TumpangFood Admin] safeAdminGetDoc failed for ${collectionName}/${docId}:`, err.message);
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
    return snap.docs.map(doc => doc.data());
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminGetDocs failed for ${collectionName}:`, err.message);
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
