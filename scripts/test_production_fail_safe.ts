/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verifies that in production mode, transactions fail safely when Firestore is unreachable.
 * Proves that unpersisted transactions are NOT silently committed to local JSON.
 */

import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { OrderStatus } from '../src/types';

async function testProductionFailSafe() {
  console.log('🧪 Menguji Fail-Safe Mode Produksi saat Firestore Cloud Offline...');

  // Temporarily simulate production mode
  const originalIsProduction = foodConfig.isProduction;
  (foodConfig as any).isProduction = true;

  const initialOrderCount = foodDb.getOrders().length;

  try {
    // Attempt to create order in production when Firestore returns PERMISSION_DENIED
    await foodDb.createOrder({
      merchantId: 'm1',
      customerName: 'Fail-Safe Tester',
      customerPhone: '081299991111',
      deliveryAddress: 'Jl. Uji Fail Safe',
      latitude: -7.98,
      longitude: 112.63,
      preOrderDate: '2026-10-12',
      items: [{ menuItemId: 'menu_1', quantity: 1 }]
    });

    console.error('❌ [FAIL] createOrder seharusnya ditolak pada mode produksi jika cloud write gagal!');
    process.exit(1);
  } catch (err: any) {
    console.log(`  ✅ [PASS] createOrder ditolak secara aman: "${err.message}"`);
  }

  // Verify rollback: local order count MUST NOT increase
  const currentOrderCount = foodDb.getOrders().length;
  if (currentOrderCount === initialOrderCount) {
    console.log(`  ✅ [PASS] Rollback terverifikasi: jumlah pesanan lokal tidak bertambah (${currentOrderCount} pesanan). Data palsu tidak disimpan.`);
  } else {
    console.error('❌ [FAIL] Rollback gagal: pesanan lokal bertambah meskipun cloud write gagal!');
    process.exit(1);
  }

  // Restore configuration
  (foodConfig as any).isProduction = originalIsProduction;
  console.log('🏁 Uji Fail-Safe Mode Produksi SELESAI DENGAN SUKSES!\n');
}

testProductionFailSafe().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
