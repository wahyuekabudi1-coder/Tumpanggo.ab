/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
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

/**
 * Initializes or re-initializes the Firebase Admin SDK.
 * Supports raw JSON, Base64 JSON, and handles PEM newline normalization safely without leaking credentials.
 */
export function initFirebaseAdmin(serviceAccountOverride?: string): { success: boolean; error?: string } {
  try {
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;

    // Try loading projectId from firebase-applet-config.json if not present in env
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
      try {
        let cleanRaw = rawInput;
        if ((cleanRaw.startsWith("'") && cleanRaw.endsWith("'")) || (cleanRaw.startsWith('"') && cleanRaw.endsWith('"'))) {
          cleanRaw = cleanRaw.slice(1, -1);
        }

        let parsed: any = null;
        if (cleanRaw.startsWith('{')) {
          parsed = JSON.parse(cleanRaw);
        } else {
          try {
            const decoded = Buffer.from(cleanRaw, 'base64').toString('utf-8');
            if (decoded.trim().startsWith('{')) {
              parsed = JSON.parse(decoded);
            }
          } catch {
            // Not base64 JSON
          }
        }

        if (parsed && typeof parsed === 'object') {
          // Normalize PEM private key newlines (frequent cause of Invalid PEM error in hosting providers)
          if (parsed.private_key && typeof parsed.private_key === 'string') {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
          }

          if (parsed.project_id) {
            projectId = parsed.project_id;
            activeProjectId = parsed.project_id;
          }

          if (typeof certFn === 'function') {
            credentialOption = certFn(parsed);
          }
          isConfiguredWithServiceAccount = true;

          // Safe masked client email for diagnostics without leaking private keys
          if (parsed.client_email && typeof parsed.client_email === 'string') {
            const parts = parsed.client_email.split('@');
            if (parts.length === 2) {
              const userPart = parts[0];
              const domainPart = parts[1];
              activeClientEmailMasked = `${userPart.substring(0, 3)}***@${domainPart}`;
            } else {
              activeClientEmailMasked = 'configured_service_account';
            }
          }

          console.log(`[TumpangFood Admin] Loaded Service Account (Project: ${projectId}, ServiceAccount: ${activeClientEmailMasked || 'verified'}).`);
        } else {
          console.warn('[TumpangFood Admin] FIREBASE_SERVICE_ACCOUNT_KEY is present but could not be parsed as valid JSON.');
        }
      } catch (err: any) {
        console.error('[TumpangFood Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      try {
        const fileContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.private_key && typeof parsed.private_key === 'string') {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        if (typeof certFn === 'function') {
          credentialOption = certFn(parsed);
        }
        if (parsed.project_id) {
          projectId = parsed.project_id;
          activeProjectId = parsed.project_id;
        }
        isConfiguredWithServiceAccount = true;
        activeClientEmailMasked = parsed.client_email ? `${parsed.client_email.substring(0, 3)}***` : 'file_credential';
        console.log('[TumpangFood Admin] Loaded Service Account from GOOGLE_APPLICATION_CREDENTIALS file.');
      } catch (err: any) {
        console.error('[TumpangFood Admin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS file:', err.message);
      }
    }

    const currentApps = typeof getAppsFn === 'function' ? getAppsFn() : [];
    if (currentApps.length === 0) {
      const initOptions: any = { projectId };
      if (credentialOption) {
        initOptions.credential = credentialOption;
      }
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

    console.log(`[TumpangFood Admin] Firebase Admin SDK initialized for database "${foodConfig.databaseId}" on project "${projectId}".`);
    return { success: true };
  } catch (e: any) {
    console.error('[TumpangFood Admin] Failed to initialize Firebase Admin SDK:', e.message);
    adminApp = null;
    adminDb = null;
    return { success: false, error: e.message };
  }
}

// Initial bootstrap
initFirebaseAdmin();

export function getAdminDb(): Firestore | null {
  return adminDb;
}

export function isFirestoreAdminConfigured(): boolean {
  return adminDb !== null;
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

/**
 * Tests live connection to Firestore using the Admin SDK.
 * Probes both read and write operations on an isolated test document (_systemConnectionProbe)
 * without touching customer or merchant business data.
 * Accurately diagnoses whether errors stem from IAM permissions, missing credentials, or database mismatch.
 */
let lastProbeResult: { timestamp: number; result: FirestoreProbeResult } | null = null;
const PROBE_CACHE_TTL_MS = 15000;

export async function testFirestoreConnection(force = false): Promise<FirestoreProbeResult> {
  if (!force && lastProbeResult && (Date.now() - lastProbeResult.timestamp < PROBE_CACHE_TTL_MS)) {
    return { ...lastProbeResult.result };
  }

  const probeId = `probe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let canRead = false;
  let canWrite = false;
  let probeError: string | undefined = undefined;
  let diagnosticReason: FirestoreProbeResult['diagnosticReason'] = 'OK';

  if (!adminDb) {
    const res: FirestoreProbeResult = {
      connected: false,
      canRead: false,
      canWrite: false,
      databaseId: foodConfig.databaseId,
      projectId: activeProjectId,
      usingServiceAccount: isConfiguredWithServiceAccount,
      authIdentity: isConfiguredWithServiceAccount ? 'ServiceAccount' : 'Sandbox-ADC',
      error: 'Firebase Admin Firestore belum terinisialisasi.',
      diagnosticReason: 'MISSING_CREDENTIALS',
      diagnosticDetail: 'Firebase Admin SDK belum berhasil diinisialisasi karena ketiadaan konfigurasi dasar.',
      remediationStep: 'Periksa file firebase-applet-config.json dan setel variabel lingkungan FIREBASE_PROJECT_ID.'
    };
    lastProbeResult = { timestamp: Date.now(), result: res };
    return res;
  }

  const probeRef = adminDb.collection('_systemConnectionProbe').doc(probeId);

  const withTimeout = <T>(p: Promise<T>, ms = 2500, label = 'Operation'): Promise<T> => {
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

  // 1. Write Probe on dedicated test document
  try {
    await withTimeout(
      probeRef.set({
        ping: true,
        timestamp: new Date().toISOString(),
        probeOrigin: 'TumpangFood Health Check'
      }),
      2500,
      'Firestore write probe'
    );
    canWrite = true;
  } catch (err: any) {
    probeError = err.message || String(err);
  }

  // 2. Read Probe
  if (canWrite) {
    try {
      const snap = await withTimeout(probeRef.get(), 2000, 'Firestore read probe');
      canRead = snap.exists;
      // Clean up test document immediately
      await probeRef.delete().catch(() => {});
    } catch (err: any) {
      probeError = probeError || err.message;
    }
  } else {
    // Attempt read on systemConfig to see if read access is permitted
    try {
      const snap = await withTimeout(adminDb.collection('systemConfig').doc('config_1').get(), 2000, 'Firestore fallback read');
      canRead = snap.exists;
    } catch (err: any) {
      probeError = err.message || String(err);
    }
  }

  // 3. Diagnose root cause
  let diagnosticDetail = 'Koneksi cloud Firestore Admin SDK aktif dan berhasil membaca/menulis data.';
  let remediationStep: string | undefined = undefined;

  if (probeError) {
    const lower = probeError.toLowerCase();
    if (lower.includes('permission_denied') || lower.includes('missing or insufficient permissions')) {
      if (!isConfiguredWithServiceAccount) {
        diagnosticReason = 'MISSING_CREDENTIALS';
        diagnosticDetail = `Kredensial Service Account belum disetel di lingkungan produksi (FIREBASE_SERVICE_ACCOUNT_KEY kosong). Server menggunakan Application Default Credentials (ADC) bawaan container sandbox yang tidak memiliki izin IAM pada proyek "${activeProjectId}".`;
        remediationStep = 'Generate Service Account JSON Key pada Google Cloud / Firebase Console (IAM & Admin -> Service Accounts), lalu masukkan isi JSON ke variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY.';
      } else {
        diagnosticReason = 'IAM_PERMISSION_DENIED';
        diagnosticDetail = `Service Account (${activeClientEmailMasked || 'terpasang'}) ditolak oleh Google Cloud IAM (HTTP/gRPC 7 PERMISSION_DENIED). Akun layanan tersebut belum memiliki hak akses peran 'Cloud Datastore User' (roles/datastore.user) atau 'Firebase Admin' pada proyek "${activeProjectId}".`;
        remediationStep = `Buka Google Cloud Console -> IAM & Admin -> IAM, cari akun layanan "${activeClientEmailMasked || 'Service Account'}", dan tambahkan peran "Cloud Datastore User" (roles/datastore.user).`;
      }
    } else if (lower.includes('not found') || lower.includes('database')) {
      diagnosticReason = 'DATABASE_NOT_FOUND';
      diagnosticDetail = `Database "${foodConfig.databaseId}" tidak ditemukan pada proyek "${activeProjectId}". Pastikan database Firestore dengan ID tersebut sudah dibuat.`;
      remediationStep = `Buat database Firestore dengan ID "${foodConfig.databaseId}" di Firebase Console atau Google Cloud Console Firestore Databases.`;
    } else if (lower.includes('project') || lower.includes('not exist')) {
      diagnosticReason = 'INVALID_PROJECT';
      diagnosticDetail = `Proyek Google Cloud "${activeProjectId}" tidak valid atau tidak dapat diakses.`;
      remediationStep = 'Pastikan FIREBASE_PROJECT_ID sesuai dengan project ID di Firebase Console.';
    } else if (lower.includes('unavailable') || lower.includes('econnrefused') || lower.includes('deadline')) {
      diagnosticReason = 'NETWORK_ERROR';
      diagnosticDetail = 'Gagal menghubungi server Google Cloud Firestore karena kendala jaringan atau timeout.';
      remediationStep = 'Periksa koneksi jaringan server dan pastikan firewall mengizinkan egress HTTPS/gRPC ke Google Cloud APIs.';
    } else {
      diagnosticReason = 'UNKNOWN';
      diagnosticDetail = `Terjadi kesalahan saat menghubungi Firestore: ${probeError}`;
      remediationStep = 'Periksa log server untuk rincian error gRPC/HTTP Firestore.';
    }
  }

  const isFullyConnected = canRead && canWrite;
  const result: FirestoreProbeResult = {
    connected: isFullyConnected,
    canRead,
    canWrite,
    databaseId: foodConfig.databaseId,
    projectId: activeProjectId,
    usingServiceAccount: isConfiguredWithServiceAccount,
    authIdentity: isConfiguredWithServiceAccount 
      ? `Custom Service Account (${activeClientEmailMasked || 'configured'})` 
      : 'Default Sandbox Container ADC (No IAM on Project)',
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
  if (!adminDb) return false;
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
  if (!adminDb) return false;
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
  if (!adminDb) return null;
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
  if (!adminDb) return [];
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
  if (!adminDb) {
    throw new Error('Firebase Admin Firestore instance is not initialized.');
  }
  return await adminDb.runTransaction(updateFunction);
}
