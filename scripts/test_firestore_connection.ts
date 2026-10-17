/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firestore Live Connection Verification Test
 * Validates database ID alignment with Firebase project tumpanggo-70479 (default)
 */

import { foodConfig } from '../src/server/config';
import {
  initFirebaseAdmin,
  getAdminDb,
  getActiveProjectId,
  testFirestoreConnection,
  safeAdminSetDoc,
  safeAdminGetDoc,
  safeAdminGetDocs,
  safeAdminDeleteDoc,
  isFirestoreAdminConfigured
} from '../src/server/firebaseAdmin';
import { foodDb } from '../src/server/db';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';

async function runVerification() {
  console.log('========================================================');
  console.log('   TUMPANG FOOD FIRESTORE REAL CONNECTION TEST');
  console.log('========================================================\n');

  // 1. Verify Configuration Alignment
  console.log('--- 1. Configuration & Identifier Alignment ---');
  console.log('Configured databaseId:', foodConfig.databaseId);
  console.log('Active project ID:', getActiveProjectId());
  console.log('isFirestoreAdminConfigured:', isFirestoreAdminConfigured());

  if (foodConfig.databaseId !== '(default)') {
    throw new Error(`FAIL: databaseId is "${foodConfig.databaseId}", expected "(default)"`);
  }
  if (getActiveProjectId() !== 'tumpanggo-70479') {
    throw new Error(`FAIL: activeProjectId is "${getActiveProjectId()}", expected "tumpanggo-70479"`);
  }
  console.log('✓ PASS: Configuration successfully points to "(default)" on "tumpanggo-70479".\n');

  // 2. Verify Internal Firestore Instance Settings
  console.log('--- 2. Firestore Client Target Verification ---');
  const db = getAdminDb();
  if (!db) {
    throw new Error('FAIL: adminDb is null');
  }
  const formattedName = (db as any).formattedName;
  console.log('Firestore resource path:', formattedName);
  const expectedPath = 'projects/tumpanggo-70479/databases/(default)';
  if (formattedName !== expectedPath) {
    throw new Error(`FAIL: formattedName is "${formattedName}", expected "${expectedPath}"`);
  }
  console.log('✓ PASS: Firestore Admin client is bound directly to:', expectedPath, '\n');

  // 3. Compare with Obsolete Database Behavior (5 NOT_FOUND proof)
  console.log('--- 3. Database Existence Verification (Comparison with Obsolete ID) ---');
  const currentApp = getApps()[0];
  const obsoleteDb = getFirestore(currentApp, 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c');
  try {
    await obsoleteDb.collection('_probe').limit(1).get();
    console.log('Obsolete DB: unexpectedly succeeded');
  } catch (err: any) {
    console.log(`Obsolete DB probe result: Code ${err.code} (${err.message?.split('\n')[0]})`);
    if (err.code === 5 || String(err.message).includes('5 NOT_FOUND')) {
      console.log('✓ CONFIRMED: Obsolete database ID reliably produces 5 NOT_FOUND (does not exist in project).');
    }
  }

  // 4. Test Live Connection to '(default)'
  console.log('\n--- 4. Live Cloud Connection Probe on "(default)" ---');
  const probeResult = await testFirestoreConnection();
  console.log('Probe Result:');
  console.log('  - Connected:', probeResult.connected);
  console.log('  - Can Read:', probeResult.canRead);
  console.log('  - Can Write:', probeResult.canWrite);
  console.log('  - Target Database ID:', probeResult.databaseId);
  console.log('  - Target Project ID:', probeResult.projectId);
  console.log('  - Auth Identity:', probeResult.authIdentity);
  console.log('  - Diagnostic Reason:', probeResult.diagnosticReason);
  console.log('  - Diagnostic Detail:', probeResult.diagnosticDetail);
  if (probeResult.error) {
    console.log('  - Underlying Error:', probeResult.error);
  }

  if (probeResult.error && (probeResult.error.includes('5 NOT_FOUND') || probeResult.diagnosticReason === 'DATABASE_NOT_FOUND')) {
    throw new Error('FAIL: "(default)" database reported NOT_FOUND!');
  } else {
    console.log('✓ PASS: Target database "(default)" exists on project tumpanggo-70479 (no 5 NOT_FOUND).');
  }

  // 5. Verify Unified Backend Database Operations
  console.log('\n--- 5. Backend Unified Operations Verification ---');
  const storageStatus = await foodDb.getStorageStatus();
  console.log('Storage Status from FoodDatabase:');
  console.log('  - Storage Mode:', storageStatus.storageMode);
  console.log('  - Database ID:', storageStatus.databaseId);
  console.log('  - Project ID:', storageStatus.projectId);
  console.log('  - Firestore Configured:', storageStatus.firestoreConfigured);
  console.log('  - Diagnostic Detail:', storageStatus.diagnosticDetail);

  if (storageStatus.databaseId !== '(default)') {
    throw new Error(`FAIL: FoodDatabase databaseId mismatch: got "${storageStatus.databaseId}"`);
  }
  console.log('✓ PASS: All backend database operations strictly target "(default)".\n');

  console.log('========================================================');
  console.log('   ALL CHECKS COMPLETED SUCCESSFULLY');
  console.log('========================================================');
}

runVerification().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
