/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Safeguards Verification Script
 * Validates fail-safe behavior when Firestore is disconnected in production mode.
 */

import { validateProductionEnvironment } from '../src/server/config';
import { testFirestoreConnection } from '../src/server/firebaseAdmin';

async function runProductionSafeguardTests() {
  console.log('====================================================');
  console.log('🛡️  PENGUJIAN KEAMANAN MODE PRODUKSI & FAIL-SAFE');
  console.log('====================================================\n');

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

  // 1. Production Config Validation Test
  console.log('📦 1. VALIDASI KONFIGURASI PRODUKSI TANPA KREDENSIAL');
  const prevSecret = process.env.FOOD_AUTH_SECRET;
  const prevKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  delete process.env.FOOD_AUTH_SECRET;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  const validationWithoutCreds = validateProductionEnvironment();
  assert(
    !validationWithoutCreds.isValid && validationWithoutCreds.errors.some(e => e.includes('FOOD_AUTH_SECRET')),
    'Penolakan startup jika FOOD_AUTH_SECRET belum disetel'
  );
  assert(
    !validationWithoutCreds.isValid && validationWithoutCreds.errors.some(e => e.includes('FIREBASE_SERVICE_ACCOUNT_KEY')),
    'Penolakan startup jika FIREBASE_SERVICE_ACCOUNT_KEY belum disetel'
  );

  // Restore env
  if (prevSecret) process.env.FOOD_AUTH_SECRET = prevSecret;
  if (prevKey) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = prevKey;

  // 2. Live Cloud Connection Probe Test
  console.log('\n📦 2. PENGUJIAN PROBE KONEKSI CLOUD DOKUMEN UJI KHUSUS');
  const probeResult = await testFirestoreConnection();
  console.log('  🔍 Hasil Probe:', {
    connected: probeResult.connected,
    canRead: probeResult.canRead,
    canWrite: probeResult.canWrite,
    databaseId: probeResult.databaseId,
    projectId: probeResult.projectId,
    usingServiceAccount: probeResult.usingServiceAccount,
    diagnosticReason: probeResult.diagnosticReason
  });

  assert(
    probeResult.diagnosticReason === 'MISSING_CREDENTIALS',
    'Diagnostik akurat mendeteksi ketiadaan kredensial Service Account (MISSING_CREDENTIALS)'
  );
  assert(
    typeof probeResult.diagnosticDetail === 'string' && probeResult.diagnosticDetail.length > 20,
    'Keterangan diagnostik detail menyertakan panduan teknis'
  );
  assert(
    typeof probeResult.remediationStep === 'string' && probeResult.remediationStep.includes('FIREBASE_SERVICE_ACCOUNT_KEY'),
    'Langkah perbaikan (remediation step) mengarahkan pemilik proyek dengan tepat'
  );

  console.log('\n====================================================');
  console.log(`🏁 HASIL TEST FAIL-SAFE: ${passed} PASS, ${failed} FAIL`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runProductionSafeguardTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
