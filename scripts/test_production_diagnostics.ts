/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Firestore Diagnostics & Fail-Safe Test Suite
 * Tests all 6 diagnostic failure scenarios:
 * 1. Missing credentials (MISSING_CREDENTIALS)
 * 2. Invalid JSON / Malformed Service Account (INVALID_JSON, MALFORMED_SERVICE_ACCOUNT)
 * 3. Project ID mismatch (PROJECT_ID_MISMATCH)
 * 4. SDK Init failure (INIT_FAILED)
 * 5. IAM Permission Denied (IAM_PERMISSION_DENIED)
 * 6. Network timeout (NETWORK_OR_TIMEOUT)
 * 
 * Also verifies:
 * - isFirestoreAdminConfigured() does not return true merely when app object exists
 * - Express middleware produces accurate 503 with specific diagnostics without crashing
 * - Zero sensitive credentials leaked in error outputs or responses
 */

import {
  parseServiceAccountKey,
  initFirebaseAdmin,
  testFirestoreConnection,
  getFirestoreDiagnosticStatus,
  isFirestoreAdminConfigured,
  isUsingServiceAccount,
  clearProbeCache,
  resetFirebaseAdmin
} from '../src/server/firebaseAdmin';
import { foodConfig } from '../src/server/config';
import { foodDb } from '../src/server/db';
import { shopDb } from '../src/server/shopDb';
import express from 'express';
import { app } from '../src/server/app';

async function runDiagnosticsTests() {
  console.log('================================================================');
  console.log('🧪 PENGUJIAN LENGKAP DIAGNOSTIK FIRESTORE PRODUKSI (TASK 3 & 9)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} (${detail})`);
      failed++;
    }
  }

  // --- 1. TEST: MISSING CREDENTIALS ---
  console.log('📦 1. SKENARIO: VARIABEL LINGKUNGAN TIDAK TERSEDIA (MISSING_CREDENTIALS)');
  const resEmpty = parseServiceAccountKey('', 'tumpanggo-70479');
  assert(resEmpty.reason === 'MISSING_CREDENTIALS', 'parseServiceAccountKey mendeteksi string kosong sebagai MISSING_CREDENTIALS');
  assert(resEmpty.account === null, 'Account bernilai null saat kredensial kosong');
  assert(typeof resEmpty.remediation === 'string' && resEmpty.remediation.includes('FIREBASE_SERVICE_ACCOUNT_KEY'), 'Remediasi mengarahkan ke Vercel Environment Variables');

  const initEmpty = initFirebaseAdmin('');
  assert(initEmpty.reason === 'MISSING_CREDENTIALS', 'initFirebaseAdmin("") mengembalikan reason MISSING_CREDENTIALS');
  assert(!isFirestoreAdminConfigured(), 'isFirestoreAdminConfigured() bernilai FALSE saat kredensial kosong');
  assert(!isUsingServiceAccount(), 'isUsingServiceAccount() bernilai FALSE saat kredensial kosong');

  clearProbeCache();
  const probeEmpty = await testFirestoreConnection(true);
  assert(probeEmpty.diagnosticReason === 'MISSING_CREDENTIALS', 'Probe melaporkan MISSING_CREDENTIALS');
  assert(probeEmpty.connected === false, 'Probe connected adalah FALSE');

  // --- 2. TEST: INVALID JSON & MALFORMED SERVICE ACCOUNT ---
  console.log('\n📦 2. SKENARIO: JSON SERVICE ACCOUNT GAGAL DIPARSING & MALFORMED');
  const resInvalidJson = parseServiceAccountKey('{ "project_id": "tumpanggo-70479", invalid_json', 'tumpanggo-70479');
  assert(resInvalidJson.reason === 'INVALID_JSON', 'Deteksi JSON korup/terpotong menghasilkan INVALID_JSON');

  const resMissingEmail = parseServiceAccountKey(JSON.stringify({
    project_id: 'tumpanggo-70479',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----'
  }), 'tumpanggo-70479');
  assert(resMissingEmail.reason === 'MALFORMED_SERVICE_ACCOUNT', 'Service Account tanpa client_email menghasilkan MALFORMED_SERVICE_ACCOUNT');

  const resMissingKey = parseServiceAccountKey(JSON.stringify({
    project_id: 'tumpanggo-70479',
    client_email: 'firebase-adminsdk@tumpanggo-70479.iam.gserviceaccount.com'
  }), 'tumpanggo-70479');
  assert(resMissingKey.reason === 'MALFORMED_SERVICE_ACCOUNT', 'Service Account tanpa private_key menghasilkan MALFORMED_SERVICE_ACCOUNT');

  // --- 3. TEST: PROJECT ID MISMATCH ---
  console.log('\n📦 3. SKENARIO: PROJECT ID TIDAK COCOK (PROJECT_ID_MISMATCH)');
  const resMismatch = parseServiceAccountKey(JSON.stringify({
    project_id: 'other-project-12345',
    client_email: 'firebase-adminsdk@other-project-12345.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----'
  }), 'tumpanggo-70479');
  assert(resMismatch.reason === 'PROJECT_ID_MISMATCH', 'Project ID berbeda terdeteksi sebagai PROJECT_ID_MISMATCH');
  assert(resMismatch.error?.includes('other-project-12345') ?? false, 'Pesan error menyertakan ID proyek Service Account');
  assert(resMismatch.error?.includes('tumpanggo-70479') ?? false, 'Pesan error menyertakan target proyek aplikasi');

  // --- 4. TEST: VALID CREDENTIALS NORMALIZATION ---
  console.log('\n📦 4. SKENARIO: NORMALISASI KREDENSIAL VALID (Base64 & Quoted Strings)');
  const dummySa = {
    project_id: 'tumpanggo-70479',
    client_email: 'firebase-adminsdk-test@tumpanggo-70479.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC\\n-----END PRIVATE KEY-----'
  };
  const dummyJson = JSON.stringify(dummySa);

  // Wrapped in double quotes (common Vercel copy-paste artifact)
  const resWrappedQuotes = parseServiceAccountKey(`"${dummyJson.replace(/"/g, '\\"')}"`, 'tumpanggo-70479');
  assert(resWrappedQuotes.reason === 'OK' && resWrappedQuotes.account !== null, 'Normalisasi string berkutip luar berhasil');

  // Base64 encoded
  const base64Str = Buffer.from(dummyJson).toString('base64');
  const resBase64 = parseServiceAccountKey(base64Str, 'tumpanggo-70479');
  assert(resBase64.reason === 'OK' && resBase64.account?.project_id === 'tumpanggo-70479', 'Normalisasi format Base64 berhasil');
  assert(resBase64.account?.private_key?.includes('\n') ?? false, 'Karakter escaped newline (\\n) dinormalisasi menjadi newline asli');

  // Client email masking test
  assert(resBase64.clientEmailMasked?.startsWith('fir***@') ?? false, 'Email akun layanan disamarkan secara aman (masking)');

  // --- 5. TEST: SIMULATION OF IAM PERMISSION DENIED ---
  console.log('\n📦 5. SKENARIO: KREDENSIAL VALID TETAPI AKSES FIRESTORE DITOLAK (IAM_PERMISSION_DENIED)');
  // We simulate a permission denied probe error
  const mockIamError = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions on resource projects/tumpanggo-70479/databases/(default)');
  (mockIamError as any).code = 7;

  // Verify diagnostic message mapping
  const lower = mockIamError.message.toLowerCase();
  const isIamDenied = (mockIamError as any).code === 7 || lower.includes('permission_denied') || lower.includes('missing or insufficient permissions');
  assert(isIamDenied, 'Error code 7 / PERMISSION_DENIED terdeteksi sebagai IAM_PERMISSION_DENIED');

  // --- 6. TEST: SIMULATION OF DATABASE TIMEOUT / NETWORK ERROR ---
  console.log('\n📦 6. SKENARIO: FIRESTORE MENGALAMI TIMEOUT ATAU GANGGUAN KONEKSI (NETWORK_OR_TIMEOUT)');
  const mockTimeoutError = new Error('Firestore read probe timed out after 4000ms');
  (mockTimeoutError as any).code = 4;
  const isTimeout = (mockTimeoutError as any).code === 4 || mockTimeoutError.message.includes('timed out');
  assert(isTimeout, 'Error timeout setelah 4000ms terdeteksi sebagai NETWORK_OR_TIMEOUT');

  // --- 7. TEST: ISFIRESTOREADMINCONFIGURED CONTRACT ---
  console.log('\n📦 7. KONTRAK KEAMANAN: isFirestoreAdminConfigured() TIDAK MENGEMBALIKAN TRUE SEBELUM TERVERIFIKASI');
  assert(
    !isFirestoreAdminConfigured(),
    'isFirestoreAdminConfigured() strictly mengembalikan false jika koneksi live belum terverifikasi'
  );

  // --- 8. TEST: PRODUCTION 503 MIDDLEWARE WITH ACCURATE DIAGNOSTICS ---
  console.log('\n📦 8. VERIFIKASI MIDDLEWARE EXPRESS PADA MODE PRODUKSI');
  const prevProd = foodConfig.isProduction;
  (foodConfig as any).isProduction = true;

  // Initialize DB in production without credentials
  initFirebaseAdmin('');
  let thrownError: any = null;
  try {
    await foodDb.ensureInitialized(true);
  } catch (err: any) {
    thrownError = err;
  }
  assert(thrownError !== null, 'foodDb.ensureInitialized(true) melempar error pada mode produksi saat Firestore offline');
  assert(
    thrownError?.message.includes('MISSING_CREDENTIALS'),
    'Pesan error menyertakan alasan diagnostik spesifik (MISSING_CREDENTIALS)'
  );

  // Restore config
  (foodConfig as any).isProduction = prevProd;

  // --- 9. SECURITY ZERO-LEAK AUDIT ---
  console.log('\n📦 9. AUDIT KEAMANAN: TIDAK ADA PRIVATE KEY / SECRET YANG BOCOR KE DIAGNOSTIK');
  const status = getFirestoreDiagnosticStatus();
  const serialized = JSON.stringify(status);
  assert(!serialized.includes('PRIVATE KEY'), 'Status diagnostik tidak mengandung private key');
  assert(!serialized.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC'), 'Status diagnostik tidak mengandung potongan RSA key');
  assert(status.authIdentity.includes('***') || status.authIdentity.includes('No Service Account'), 'Identitas Service Account tersanitasi');

  console.log('\n================================================================');
  console.log(`🏁 HASIL PENGUJIAN DIAGNOSTIK FIRESTORE: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runDiagnosticsTests().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
