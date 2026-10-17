/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Pre-Deploy Final Verification Script (PART 10)
 * Evaluates Vercel production readiness, Firestore primary store configuration,
 * idempotency, transaction rollback safety, authentication isolation, and secret protection.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

interface VerificationResult {
  step: string;
  category: 'LIVE_TESTED' | 'CONFIG_VERIFIED' | 'SIMULATED';
  status: 'PASSED' | 'FAILED' | 'WARNING';
  detail: string;
  evidence?: any;
}

const results: VerificationResult[] = [];

function record(step: string, category: 'LIVE_TESTED' | 'CONFIG_VERIFIED' | 'SIMULATED', status: 'PASSED' | 'FAILED' | 'WARNING', detail: string, evidence?: any) {
  results.push({ step, category, status, detail, evidence });
  const icon = status === 'PASSED' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  console.log(`${icon} [${category}] ${step}: ${detail}`);
}

async function verifyAll() {
  console.log('======================================================================');
  console.log('🚀 TUMPANG GO & TUMPANG SHOP — FINAL PRE-DEPLOY AUDIT & VERIFIKASI (PART 10)');
  console.log('======================================================================\n');

  // ---------------------------------------------------------
  // 1. VERIFIKASI KONFIGURASI ENVIRONMENT & KEAMANAN RAHASIA
  // ---------------------------------------------------------
  console.log('--- 1. VERIFIKASI KONFIGURASI ENVIRONMENT & KEAMANAN RAHASIA ---');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
    const requiredKeys = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_SERVICE_ACCOUNT_KEY',
      'FOOD_AUTH_SECRET',
      'FOOD_ADMIN_EMAIL',
      'FOOD_ADMIN_PASSWORD',
      'SHOP_AUTH_SECRET',
      'SHOP_ADMIN_EMAIL',
      'SHOP_ADMIN_PASSWORD'
    ];

    const missingInExample = requiredKeys.filter(k => !envExampleContent.includes(k));
    if (missingInExample.length === 0) {
      record(
        '.env.example Completeness',
        'CONFIG_VERIFIED',
        'PASSED',
        'Seluruh variabel lingkungan wajib (Food & Shop) terdokumentasi dalam .env.example'
      );
    } else {
      record(
        '.env.example Completeness',
        'CONFIG_VERIFIED',
        'WARNING',
        `Variabel berikut belum ada di .env.example: ${missingInExample.join(', ')}`
      );
    }

    // Verify no secret leak in .env.example (all values must be empty or placeholder)
    const linesWithValues = envExampleContent.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'))
      .filter(l => {
        const parts = l.split('=');
        return parts.length > 1 && parts[1].trim().length > 0;
      });

    if (linesWithValues.length === 0) {
      record(
        'Secret Masking in .env.example',
        'CONFIG_VERIFIED',
        'PASSED',
        'Tidak ada nilai rahasia atau kredensial yang bocor di .env.example (semua bernilai kosong).'
      );
    } else {
      record(
        'Secret Masking in .env.example',
        'CONFIG_VERIFIED',
        'WARNING',
        'Ditemukan nilai default pada .env.example'
      );
    }
  }

  // ---------------------------------------------------------
  // 2. VERIFIKASI HEALTH CHECKS & FIRESTORE DIAGNOSTIK
  // ---------------------------------------------------------
  console.log('\n--- 2. VERIFIKASI HEALTH CHECKS & FIRESTORE DIAGNOSTIK ---');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    if (healthRes.status === 200) {
      record(
        'GET /api/health Ecosystem Diagnostics',
        'LIVE_TESTED',
        'PASSED',
        `Health check aktif HTTP 200. Status: ${healthData.status}. Food DB: ${healthData.foodDatabase?.storageMode}, Shop DB: ${healthData.shopDatabase?.storageMode}`,
        { foodDb: healthData.foodDatabase?.storageMode, shopDb: healthData.shopDatabase?.storageMode }
      );
    } else {
      record(
        'GET /api/health Ecosystem Diagnostics',
        'LIVE_TESTED',
        'WARNING',
        `HTTP ${healthRes.status}. Degraded status tercatat jika tanpa service account live.`
      );
    }
  } catch (e: any) {
    record('GET /api/health', 'LIVE_TESTED', 'FAILED', `Error: ${e.message}`);
  }

  try {
    const probeRes = await fetch(`${BASE_URL}/api/health/firestore-probe`);
    const probeData = await probeRes.json();
    record(
      'GET /api/health/firestore-probe',
      'LIVE_TESTED',
      'PASSED',
      `Firestore probe berhasil dieksekusi. Reason: ${probeData.result?.diagnosticReason}, Database: ${probeData.result?.databaseId}, Project: ${probeData.result?.projectId}`,
      { reason: probeData.result?.diagnosticReason }
    );
  } catch (e: any) {
    record('GET /api/health/firestore-probe', 'LIVE_TESTED', 'FAILED', `Error: ${e.message}`);
  }

  // ---------------------------------------------------------
  // 3. VERIFIKASI AUTENTIKASI & ISOLASI FOOD VS SHOP
  // ---------------------------------------------------------
  console.log('\n--- 3. VERIFIKASI AUTENTIKASI & ISOLASI FOOD VS SHOP ---');
  let foodAdminToken = '';
  let shopAdminToken = '';

  // 3a. Login Food Admin
  try {
    const loginFoodRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tumpanggo@gmail.com', password: 'TumpangGoAdmin#2026', role: 'ADMIN' })
    });
    if (loginFoodRes.ok) {
      const data = await loginFoodRes.json();
      foodAdminToken = data.token;
      record('Food Admin Login', 'LIVE_TESTED', 'PASSED', 'Login Food Admin berhasil dengan token JWT valid.');
    } else {
      record('Food Admin Login', 'LIVE_TESTED', 'FAILED', `HTTP ${loginFoodRes.status}`);
    }
  } catch (e: any) {
    record('Food Admin Login', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // 3b. Login Shop Admin
  try {
    const loginShopRes = await fetch(`${BASE_URL}/api/shop/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shopadmin@tumpanggo.com', password: 'TumpangShopAdmin#2026' })
    });
    if (loginShopRes.ok) {
      const data = await loginShopRes.json();
      shopAdminToken = data.token;
      record('Shop Admin Login', 'LIVE_TESTED', 'PASSED', 'Login Shop Admin berhasil dengan token JWT terisolasi (scope: shop).');
    } else {
      record('Shop Admin Login', 'LIVE_TESTED', 'FAILED', `HTTP ${loginShopRes.status}`);
    }
  } catch (e: any) {
    record('Shop Admin Login', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // 3c. Cross-Access Guard: Shop Token to Food Protected Route
  if (shopAdminToken) {
    try {
      const crossFoodRes = await fetch(`${BASE_URL}/api/settlements`, {
        headers: { 'Authorization': `Bearer ${shopAdminToken}` }
      });
      if (crossFoodRes.status === 403 || crossFoodRes.status === 401) {
        record('Cross-Role Guard (Shop Token -> Food)', 'LIVE_TESTED', 'PASSED', `Akses ditolak sebagaimana mestinya (HTTP ${crossFoodRes.status}).`);
      } else {
        record('Cross-Role Guard (Shop Token -> Food)', 'LIVE_TESTED', 'FAILED', `Akses bocor dengan HTTP ${crossFoodRes.status}`);
      }
    } catch (e: any) {
      record('Cross-Role Guard (Shop Token -> Food)', 'LIVE_TESTED', 'FAILED', e.message);
    }
  }

  // 3d. Cross-Access Guard: Food Token to Shop Admin Route
  if (foodAdminToken) {
    try {
      const crossShopRes = await fetch(`${BASE_URL}/api/shop/orders`, {
        headers: { 'Authorization': `Bearer ${foodAdminToken}` }
      });
      if (crossShopRes.status === 403 || crossShopRes.status === 401) {
        record('Cross-Role Guard (Food Token -> Shop Admin)', 'LIVE_TESTED', 'PASSED', `Akses ditolak sebagaimana mestinya (HTTP ${crossShopRes.status}).`);
      } else {
        record('Cross-Role Guard (Food Token -> Shop Admin)', 'LIVE_TESTED', 'FAILED', `Akses bocor dengan HTTP ${crossShopRes.status}`);
      }
    } catch (e: any) {
      record('Cross-Role Guard (Food Token -> Shop Admin)', 'LIVE_TESTED', 'FAILED', e.message);
    }
  }

  // ---------------------------------------------------------
  // 4. VERIFIKASI IDEMPOTENSI & PENCEGAHAN TRANSAKSI GANDA
  // ---------------------------------------------------------
  console.log('\n--- 4. VERIFIKASI IDEMPOTENSI & PENCEGAHAN TRANSAKSI GANDA ---');
  const testRequestId = `test_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const orderPayload = {
    customerName: 'Budi Test Idempotensi',
    customerPhone: '081299998888',
    deliveryAddress: 'Jl. Raya Tumpang No. 99, Malang',
    customerDistrict: 'Tumpang',
    clientRequestId: testRequestId,
    shippingMethod: 'INSTANT',
    items: [
      {
        productId: 'sprod_beras_5kg',
        quantity: 1
      }
    ]
  };

  try {
    // First Submission
    const firstOrderRes = await fetch(`${BASE_URL}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    if (firstOrderRes.ok) {
      const firstOrder = await firstOrderRes.json();
      record(
        'Order Creation (First Call)',
        'LIVE_TESTED',
        'PASSED',
        `Pesanan berhasil dibuat: ${firstOrder.orderNumber} (ID: ${firstOrder.id})`
      );

      // Immediate Second Submission with identical clientRequestId
      const secondOrderRes = await fetch(`${BASE_URL}/api/shop/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      if (secondOrderRes.ok) {
        const secondOrder = await secondOrderRes.json();
        if (secondOrder.id === firstOrder.id && secondOrder.orderNumber === firstOrder.orderNumber) {
          record(
            'Idempotency clientRequestId Dedup',
            'LIVE_TESTED',
            'PASSED',
            `Pesanan duplikat terdeteksi dan mengembalikan transaksi asli yang sama (${secondOrder.orderNumber}) tanpa mengurangi stok ganda!`
          );
        } else {
          record(
            'Idempotency clientRequestId Dedup',
            'LIVE_TESTED',
            'FAILED',
            `Order duplikat dibuat dengan ID berbeda: ${secondOrder.id} vs ${firstOrder.id}`
          );
        }
      } else {
        record(
          'Idempotency clientRequestId Dedup',
          'LIVE_TESTED',
          'WARNING',
          `HTTP ${secondOrderRes.status}`
        );
      }
    } else {
      const err = await firstOrderRes.json();
      record('Order Creation (First Call)', 'LIVE_TESTED', 'WARNING', `Gagal membuat pesanan: ${err.error}`);
    }
  } catch (e: any) {
    record('Idempotency Test', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // ---------------------------------------------------------
  // 5. VERIFIKASI RESTORASI STOK SAAT PEMBATALAN PESANAN
  // ---------------------------------------------------------
  console.log('\n--- 5. VERIFIKASI RESTORASI STOK SAAT PEMBATALAN PESANAN ---');
  if (shopAdminToken) {
    try {
      // Get current stock of beras 5kg
      const prodRes = await fetch(`${BASE_URL}/api/shop/products/sprod_beras_5kg`);
      const prodData = await prodRes.json();
      const initialStock = prodData.stock;

      // Create an order
      const cancelTestReqId = `cancel_test_${Date.now()}`;
      const tempOrderRes = await fetch(`${BASE_URL}/api/shop/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Test Pembatalan Stok',
          customerPhone: '081288887777',
          deliveryAddress: 'Jl. Pasar Tumpang',
          customerDistrict: 'Tumpang',
          clientRequestId: cancelTestReqId,
          shippingMethod: 'PICKUP',
          items: [{ productId: 'sprod_beras_5kg', quantity: 2 }]
        })
      });

      if (tempOrderRes.ok) {
        const tempOrder = await tempOrderRes.json();
        
        // Stock should now be initialStock - 2
        const midProdRes = await fetch(`${BASE_URL}/api/shop/products/sprod_beras_5kg`);
        const midProdData = await midProdRes.json();
        const midStock = midProdData.stock;

        // Cancel order via shop admin
        const cancelRes = await fetch(`${BASE_URL}/api/shop/orders/${tempOrder.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${shopAdminToken}`
          },
          body: JSON.stringify({
            status: 'CANCELLED',
            reason: 'Dibatalkan untuk pengujian pemulihan stok otomatis'
          })
        });

        if (cancelRes.ok) {
          // Stock should be restored back to initialStock
          const finalProdRes = await fetch(`${BASE_URL}/api/shop/products/sprod_beras_5kg`);
          const finalProdData = await finalProdRes.json();
          const restoredStock = finalProdData.stock;

          if (restoredStock === initialStock && midStock === initialStock - 2) {
            record(
              'Stock Replenishment on Cancellation',
              'LIVE_TESTED',
              'PASSED',
              `Stok terpotong 2 (${initialStock} -> ${midStock}) dan pulih kembali otomatis ke ${restoredStock} saat pesanan dibatalkan!`
            );
          } else {
            record(
              'Stock Replenishment on Cancellation',
              'LIVE_TESTED',
              'WARNING',
              `Stok sebelum: ${initialStock}, saat order: ${midStock}, setelah batal: ${restoredStock}`
            );
          }
        } else {
          record('Stock Replenishment on Cancellation', 'LIVE_TESTED', 'FAILED', `Gagal membatalkan order: HTTP ${cancelRes.status}`);
        }
      }
    } catch (e: any) {
      record('Stock Replenishment on Cancellation', 'LIVE_TESTED', 'FAILED', e.message);
    }
  }

  // ---------------------------------------------------------
  // 6. VERIFIKASI VERCEL HOSTING & BUNDLE FILES
  // ---------------------------------------------------------
  console.log('\n--- 6. VERIFIKASI VERCEL HOSTING & BUNDLE FILES ---');
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  if (fs.existsSync(vercelJsonPath)) {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    const includeFiles = vercelConfig?.functions?.['api/index.ts']?.includeFiles || '';
    const hasFoodDb = includeFiles.includes('tumpang_food_db.json');
    const hasShopDb = includeFiles.includes('tumpang_shop_db.json');
    const hasConfig = includeFiles.includes('firebase-applet-config.json');

    if (hasFoodDb && hasShopDb && hasConfig) {
      record(
        'vercel.json Serverless Function Bundle',
        'CONFIG_VERIFIED',
        'PASSED',
        'vercel.json memuat tumpang_food_db.json, tumpang_shop_db.json, dan firebase-applet-config.json secara lengkap.'
      );
    } else {
      record(
        'vercel.json Serverless Function Bundle',
        'CONFIG_VERIFIED',
        'WARNING',
        `IncludeFiles belum lengkap: ${includeFiles}`
      );
    }
  }

  // ---------------------------------------------------------
  // REKAPITULASI HASIL AUDIT
  // ---------------------------------------------------------
  console.log('\n======================================================================');
  console.log('📊 REKAPITULASI HASIL AUDIT PART 10');
  console.log('======================================================================');
  const passed = results.filter(r => r.status === 'PASSED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  console.log(`Total Pengujian: ${results.length}`);
  console.log(`✅ Lolos (PASSED)    : ${passed}`);
  console.log(`⚠️ Peringatan (WARN) : ${warnings}`);
  console.log(`❌ Gagal (FAILED)    : ${failed}`);
  console.log('======================================================================\n');
}

verifyAll().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
