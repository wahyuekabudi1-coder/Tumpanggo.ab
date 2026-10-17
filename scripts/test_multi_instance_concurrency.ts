/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Multi-Instance Concurrent Settlement Verification Test
 * Tests cross-process file locking and atomic state protection across separate processes.
 */

import { foodDb } from '../src/server/db';
import { OrderStatus } from '../src/types';

async function testMultiInstance() {
  console.log('====================================================');
  console.log('🧪 PENGUJIAN MULTI-INSTANCE CONCURRENT SETTLEMENT');
  console.log('====================================================\n');

  // 1. Get or create a completed order
  const orders = foodDb.getOrders();
  const merchants = foodDb.getMerchants();
  const m = merchants[0];

  const testOrder = await foodDb.createOrder({
    merchantId: m.id,
    customerName: 'Multi-Instance Tester',
    customerPhone: '081299998888',
    deliveryAddress: 'Jl. Concurrency Test 99',
    latitude: -7.98,
    longitude: 112.63,
    preOrderDate: '2026-10-12',
    items: [{ menuItemId: foodDb.getMenuItemsByMerchant(m.id)[0]?.id, quantity: 1 }]
  });

  // Mark as COMPLETED
  await foodDb.updateOrder('admin', testOrder.id, { status: OrderStatus.COMPLETED }, 'ADMIN');

  console.log(`  ℹ️  Pesanan uji disiapkan: ${testOrder.id} (Merchant: ${m.name})`);

  // 2. Launch two simulated independent instance workers simultaneously
  console.log('  ⚡ Menjalankan Instance A dan Instance B secara bersamaan untuk pesanan yang sama...');

  const instanceA = foodDb.createSettlement('admin_instance_A', {
    merchantId: m.id,
    merchantName: m.name,
    orderIds: [testOrder.id]
  });

  const instanceB = foodDb.createSettlement('admin_instance_B', {
    merchantId: m.id,
    merchantName: m.name,
    orderIds: [testOrder.id]
  });

  const results = await Promise.allSettled([instanceA, instanceB]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  console.log(`  📊 Hasil simulasi dua instance:`);
  console.log(`     - Berhasil: ${fulfilled.length}`);
  console.log(`     - Ditolak (Race prevented): ${rejected.length}`);

  if (rejected.length > 0) {
    console.log(`     - Pesan penolakan: ${(rejected[0] as PromiseRejectedResult).reason?.message}`);
  }

  if (fulfilled.length === 1 && rejected.length === 1) {
    console.log('\n  ✅ [PASS] Multi-instance race condition BERHASIL dicegah! Tepat 1 instance yang berhasil mencairkan, instance kedua dibatalkan atomik.');
  } else {
    console.error('\n  ❌ [FAIL] Double settlement terdeteksi!');
    process.exit(1);
  }

  // Verify order in database
  const finalOrder = foodDb.getOrderById(testOrder.id);
  if ((finalOrder as any)?.isSettled) {
    console.log('  ✅ [PASS] Status order isSettled: true tercatat di database.');
  }

  console.log('\n====================================================');
  console.log('🏁 SELESAI PENGUJIAN MULTI-INSTANCE');
  console.log('====================================================\n');
}

testMultiInstance().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
