/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Audit Verification Test Suite
 * Automated tests for RBAC, merchant isolation, expired payments, atomic settlements, and persistence.
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 MEMULAI AUDIT VERIFIKASI PASCA-REFAKTORISASI');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  // ----------------------------------------------------
  // TEST SUITE 1: AUTHENTICATION & ROLE AUTHORIZATION
  // ----------------------------------------------------
  console.log('📦 1. PENGUJIAN AUTENTIKASI DAN OTORISASI (RBAC)');

  // 1.1 Admin Login with valid credentials
  const adminLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      password: 'TumpangGoAdmin#2026',
      role: 'ADMIN'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200 && !!adminLoginData.token, 'Admin login dengan kredensial valid berhasil');
  const adminToken = adminLoginData.token;

  // 1.2 Admin Login with invalid credentials
  const adminBadRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      password: 'WrongPassword123',
      role: 'ADMIN'
    })
  });
  assert(adminBadRes.status === 401, 'Admin login dengan password salah ditolak (HTTP 401)');

  // 1.3 Merchant Login
  // Find a registered merchant
  const merchantsRes = await fetch(`${BASE_URL}/api/merchants`);
  const merchants = await merchantsRes.json();
  const m1 = merchants[0]; // e.g. m1
  const m2 = merchants[1]; // e.g. m2

  // Login m1 (default hashed password is m1123 from initial seed, or its actual password)
  const m1LoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: m1.email || m1.phone,
      password: m1.id + '123',
      role: 'MERCHANT'
    })
  });
  const m1LoginData = await m1LoginRes.json();
  assert(m1LoginRes.status === 200 && !!m1LoginData.token, `Merchant ${m1.name} login dengan kredensial sah berhasil`);
  const m1Token = m1LoginData.token;

  // Login m2
  const m2LoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: m2.email || m2.phone,
      password: m2.id + '123',
      role: 'MERCHANT'
    })
  });
  const m2LoginData = await m2LoginRes.json();
  assert(m2LoginRes.status === 200 && !!m2LoginData.token, `Merchant ${m2.name} login berhasil`);
  const m2Token = m2LoginData.token;

  // 1.4 Test Driver Login
  const driversRes = await fetch(`${BASE_URL}/api/drivers`);
  const drivers = await driversRes.json();
  const d1 = drivers[0];

  const d1LoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: d1.phone,
      password: d1.id + '123',
      role: 'DRIVER'
    })
  });
  const d1LoginData = await d1LoginRes.json();
  assert(d1LoginRes.status === 200 && !!d1LoginData.token, `Driver ${d1.name} login dengan kredensial sah berhasil`);
  const d1Token = d1LoginData.token;

  // 1.5 Sensitive endpoint protection: Unauthenticated access to /api/settlements
  const unauthSetRes = await fetch(`${BASE_URL}/api/settlements`);
  assert(unauthSetRes.status === 401, 'Endpoint sensitif /api/settlements menolak request tanpa token (HTTP 401)');

  // 1.6 Merchant attempting Admin route: Merchant accessing /api/settlements
  const merchantOnAdminRes = await fetch(`${BASE_URL}/api/settlements`, {
    headers: { Authorization: `Bearer ${m1Token}` }
  });
  assert(merchantOnAdminRes.status === 403, 'Merchant dilarang mengakses endpoint khusus Admin /api/settlements (HTTP 403)');

  // ----------------------------------------------------
  // TEST SUITE 2: MERCHANT ISOLATION
  // ----------------------------------------------------
  console.log('\n📦 2. PENGUJIAN ISOLASI DATA MERCHANT (MULTI-TENANCY)');

  // 2.1 Merchant 1 accessing Merchant 2's orders
  const m1OnM2OrdersRes = await fetch(`${BASE_URL}/api/merchants/${m2.id}/orders`, {
    headers: { Authorization: `Bearer ${m1Token}` }
  });
  assert(m1OnM2OrdersRes.status === 403, `Merchant ${m1.id} DITOLAK saat membaca pesanan Merchant ${m2.id} (HTTP 403)`);

  // 2.2 Merchant 1 modifying Merchant 2's store profile
  const m1UpdateM2Res = await fetch(`${BASE_URL}/api/merchants/${m2.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${m1Token}`
    },
    body: JSON.stringify({ name: 'Hacked Name by M1' })
  });
  assert(m1UpdateM2Res.status === 403, `Merchant ${m1.id} DITOLAK saat mencoba modifikasi profil Merchant ${m2.id} (HTTP 403)`);

  // 2.3 Merchant 1 adding a menu item into Merchant 2's catalog
  const m1AddM2MenuRes = await fetch(`${BASE_URL}/api/merchants/${m2.id}/menu`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${m1Token}`
    },
    body: JSON.stringify({ name: 'Illegal Menu Item', price: 99999, available: true })
  });
  assert(m1AddM2MenuRes.status === 403, `Merchant ${m1.id} DITOLAK saat menambahkan menu ke toko Merchant ${m2.id} (HTTP 403)`);

  // 2.4 Merchant 1 accessing their OWN orders
  const m1OwnOrdersRes = await fetch(`${BASE_URL}/api/merchants/${m1.id}/orders`, {
    headers: { Authorization: `Bearer ${m1Token}` }
  });
  assert(m1OwnOrdersRes.status === 200, `Merchant ${m1.id} BERHASIL membaca pesanan miliknya sendiri (HTTP 200)`);

  // ----------------------------------------------------
  // TEST SUITE 3: EXPIRED PAYMENT VALIDATION
  // ----------------------------------------------------
  console.log('\n📦 3. PENGUJIAN VALIDASI PEMBAYARAN KEDALUWARSA');

  // 3.1 Create a test order
  const m1MenuRes = await fetch(`${BASE_URL}/api/merchants/${m1.id}/menu`);
  const m1Menu = await m1MenuRes.json();
  const testMenuItem = m1Menu[0];

  const createOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: m1.id,
      customerName: 'Budi Tester',
      customerPhone: '081299990001',
      deliveryAddress: 'Jl. Raya Tumpang No. 12',
      latitude: -7.9812,
      longitude: 112.6315,
      preOrderDate: '2026-10-15',
      items: [{ menuItemId: testMenuItem.id, quantity: 2 }]
    })
  });
  const createdOrder = await createOrderRes.json();
  assert(createOrderRes.status === 201 && createdOrder.id, `Pesanan baru dibuat (ID: ${createdOrder.id})`);

  // 3.2 Manually set paymentExpiresAt to the past (simulating expired payment window)
  const expireOrderRes = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      paymentExpiresAt: new Date(Date.now() - 60000).toISOString() // 1 minute in the past
    })
  });
  assert(expireOrderRes.status === 200, 'Simulasi waktu batas pembayaran disetel ke masa lalu (kedaluwarsa)');

  // 3.3 Customer tries to upload payment proof for expired order
  const uploadExpiredRes = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}/upload-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentProof: 'https://images.unsplash.com/photo-test-receipt.jpg'
    })
  });
  const uploadExpiredData = await uploadExpiredRes.json();
  assert(
    uploadExpiredRes.status === 400 && uploadExpiredData.error.includes('kedaluwarsa'),
    'Unggah bukti pembayaran untuk pesanan kedaluwarsa DITOLAK (HTTP 400)'
  );

  // 3.4 Verify order status became EXPIRED
  const checkExpiredRes = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}`);
  const checkExpiredData = await checkExpiredRes.json();
  assert(checkExpiredData.status === 'EXPIRED', 'Status pesanan secara otomatis berubah menjadi EXPIRED di database');

  // 3.5 Accidental Admin verification of EXPIRED order without late-payment override
  const adminAccidentalVerifyRes = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: 'PAYMENT_VERIFIED'
    })
  });
  assert(
    adminAccidentalVerifyRes.status === 400,
    'Verifikasi admin biasa terhadap pesanan EXPIRED dicegah secara tidak sengaja (HTTP 400)'
  );

  // 3.6 Admin late payment override with explicit flag
  const adminLateApprovalRes = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: 'PAYMENT_VERIFIED',
      overrideExpired: true,
      cancelReason: 'Pembayaran terlambat telah dikonfirmasi manual oleh admin via mutasi bank'
    })
  });
  assert(
    adminLateApprovalRes.status === 200,
    'Verifikasi admin dengan persetujuan eksplisit late-payment (overrideExpired: true) berhasil (HTTP 200)'
  );

  // ----------------------------------------------------
  // TEST SUITE 4: ATOMIC SETTLEMENT & RACE CONDITION PREVENTION
  // ----------------------------------------------------
  console.log('\n📦 4. PENGUJIAN SETTLEMENT ATOMIK & RACE CONDITION (PERMINTAAN PARALEL)');

  // 4.1 Create test completed orders for settlement
  const ordA = await (await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: m1.id,
      customerName: 'Tester A',
      customerPhone: '081200000001',
      deliveryAddress: 'Jl. Uji A',
      latitude: -7.981,
      longitude: 112.631,
      preOrderDate: '2026-10-15',
      items: [{ menuItemId: testMenuItem.id, quantity: 1 }]
    })
  })).json();

  const ordB = await (await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: m1.id,
      customerName: 'Tester B',
      customerPhone: '081200000002',
      deliveryAddress: 'Jl. Uji B',
      latitude: -7.981,
      longitude: 112.631,
      preOrderDate: '2026-10-15',
      items: [{ menuItemId: testMenuItem.id, quantity: 2 }]
    })
  })).json();

  // Complete both orders via Admin
  await fetch(`${BASE_URL}/api/orders/${ordA.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'COMPLETED' })
  });
  await fetch(`${BASE_URL}/api/orders/${ordB.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'COMPLETED' })
  });

  console.log(`  ℹ️  2 Pesanan COMPLETED disiapkan untuk settlement: ${ordA.id}, ${ordB.id}`);

  // 4.2 Fire 10 concurrent requests at the exact same millisecond trying to settle ordA and ordB
  console.log('  ⚡ Menjalankan 10 permintaan paralel pembuatan settlement secara serentak...');
  const parallelPromises = Array.from({ length: 10 }).map((_, i) =>
    fetch(`${BASE_URL}/api/settlements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        merchantId: m1.id,
        merchantName: m1.name,
        orderIds: [ordA.id, ordB.id]
      })
    })
  );

  const parallelResults = await Promise.all(parallelPromises);
  const statusCodes = parallelResults.map(r => r.status);
  const successCount = statusCodes.filter(s => s === 201).length;
  const rejectedCount = statusCodes.filter(s => s === 400).length;

  console.log(`  📊 Hasil 10 permintaan paralel: Berhasil (201): ${successCount}, Ditolak (400): ${rejectedCount}`);
  assert(
    successCount === 1 && rejectedCount === 9,
    'Uji Race Condition: TEPAT 1 request berhasil dan 9 request lainnya ditolak atomik (tidak terjadi pencairan ganda)'
  );

  // 4.3 Verify orders now have isSettled = true
  const verifySettledOrdA = await (await fetch(`${BASE_URL}/api/orders/${ordA.id}`)).json();
  const verifySettledOrdB = await (await fetch(`${BASE_URL}/api/orders/${ordB.id}`)).json();
  assert(
    verifySettledOrdA.isSettled === true && verifySettledOrdB.isSettled === true,
    'Status isSettled kedua pesanan tersimpan konsisten (isSettled: true)'
  );

  // ----------------------------------------------------
  // TEST SUITE 5: DATA PERSISTENCE & BACKUP
  // ----------------------------------------------------
  console.log('\n📦 5. PENGUJIAN PERSISTENSI DAN BACKUP DATABASE');

  const fs = await import('fs');
  const path = await import('path');
  const dbFile = path.join(process.cwd(), 'tumpang_food_db.json');
  const backupFile = path.join(process.cwd(), 'tumpang_food_db.json.backup.json');

  assert(fs.existsSync(dbFile), 'Database utama tumpang_food_db.json tersedia dan aktif');
  assert(fs.existsSync(backupFile), 'File snapshot pemulihan tumpang_food_db.json.backup.json berhasil dibuat');

  const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  assert(
    Array.isArray(dbData.settlements) && dbData.settlements.length > 0,
    `Persistensi data settlement terverifikasi di file disk (${dbData.settlements.length} settlement tercatat)`
  );

  console.log('\n====================================================');
  console.log(`🏁 HASIL AKHIR PENGUJIAN: ${passedCount} PASS, ${failedCount} FAIL`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
