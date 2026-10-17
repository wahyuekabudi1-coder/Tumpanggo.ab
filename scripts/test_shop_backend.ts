/**
 * Comprehensive Backend and Database Test Script for Tumpang Shop - Part 4 & Part 5
 * Uses native Node http server and fetch (no external testing libraries required).
 * 
 * Validates:
 * 1. Modul ShopDatabase terisolasi dari FoodDatabase
 * 2. API /api/shop/* (Kategori, Produk, Config, Order, Shipping)
 * 3. Validasi harga & stok di backend (termasuk variasi, pengurangan stok, dan pemulihan saat batal)
 * 4. Pemisahan PaymentStatus dan OrderStatus
 * 5. Proteksi pesanan ganda (Idempotency key & window deduplication)
 * 6. Keamanan pelacakan pesanan (Privacy guard dengan nomor WhatsApp pemesan)
 * 7. Isolasi autentikasi Shop Admin vs Food Admin
 * 8. Modul Pengiriman Khusus Tumpang Shop (Lokal & Internasional China -> Indonesia)
 * 9. Adapter Kurir Modular, Riwayat Tracking, dan Zero-Fabrication Flags
 * 10. Independensi status pengiriman terhadap status pembayaran
 * 11. Isolasi penuh dari sistem driver Tumpang Food
 */

import http from 'http';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { shopDb } from '../src/server/shopDb';
import { shopConfig, foodConfig } from '../src/server/config';
import { createAuthToken } from '../src/server/auth';
import { ShopOrderStatus, ShopPaymentStatus, ShopShipmentStatus, ShopShipmentScope } from '../src/types/shop';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 MEMULAI PENGUJIAN BACKEND & DATABASE TUMPANG SHOP (PART 4 & 5)');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Test server running on ${baseUrl}\n`);

  try {
    // 1. Inisialisasi Database
    console.log('--- 1. Uji Inisialisasi Database & Isolasi Data ---');
    await Promise.all([foodDb.ensureInitialized(), shopDb.ensureInitialized()]);

    const initialFoodMerchantsCount = foodDb.getMerchants().length;
    const initialFoodDriversCount = foodDb.getDrivers().length;
    const initialShopProductsCount = shopDb.getProducts().length;

    assert(initialFoodMerchantsCount > 0, 'FoodDatabase memiliki merchant food yang utuh', `Count: ${initialFoodMerchantsCount}`);
    assert(initialShopProductsCount > 0, 'ShopDatabase memiliki produk sembako/toko yang utuh', `Count: ${initialShopProductsCount}`);

    // 2. Uji Autentikasi Terisolasi Shop Admin vs Food Admin
    console.log('\n--- 2. Uji Isolasi Autentikasi Admin ---');
    const resFoodLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: foodConfig.adminEmail, 
        password: foodConfig.adminPassword,
        role: 'ADMIN'
      })
    });
    const foodAuthData = await resFoodLogin.json();
    const foodToken = foodAuthData.token;
    assert(resFoodLogin.status === 200 && !!foodToken, 'Food Admin berhasil login ke endpoint Food');

    const resShopLogin = await fetch(`${baseUrl}/api/shop/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: shopConfig.adminEmail, password: shopConfig.adminPassword })
    });
    const shopAuthData = await resShopLogin.json();
    const shopToken = shopAuthData.token;
    assert(resShopLogin.status === 200 && !!shopToken, 'Shop Admin berhasil login ke endpoint Shop');

    // Uji proteksi silang: Food token tidak boleh mengakses endpoint administrasi Shop
    const resCrossAuth = await fetch(`${baseUrl}/api/shop/config`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${foodToken}`
      },
      body: JSON.stringify({ storeName: 'Hacked Name' })
    });
    assert(resCrossAuth.status === 403, 'Food Admin DITOLAK saat mencoba mengubah konfigurasi Shop (403 Forbidden)');

    // 3. Uji Endpoint Publik Shop
    console.log('\n--- 3. Uji Endpoint Publik Shop ---');
    const resCategories = await fetch(`${baseUrl}/api/shop/categories`);
    const categoriesData = await resCategories.json();
    assert(resCategories.status === 200 && Array.isArray(categoriesData) && categoriesData.length > 0, 'GET /api/shop/categories mengembalikan daftar kategori aktif');

    const resProducts = await fetch(`${baseUrl}/api/shop/products`);
    const productsData = await resProducts.json();
    assert(resProducts.status === 200 && Array.isArray(productsData) && productsData.length > 0, 'GET /api/shop/products mengembalikan daftar produk aktif');

    const resConfig = await fetch(`${baseUrl}/api/shop/config`);
    const configData = await resConfig.json();
    assert(resConfig.status === 200 && typeof configData.storeName === 'string', 'GET /api/shop/config mengembalikan konfigurasi toko');

    // 4. Uji Validasi Server-Side Pesanan Belanja (Pricing, Stok, Keranjang Kosong, dsb.)
    console.log('\n--- 4. Uji Validasi Server-Side Pemesanan (Part 4) ---');
    
    // a. Keranjang Kosong
    const resEmptyCart = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Budi Santoso',
        customerPhone: '081234567890',
        deliveryAddress: 'Jl. Raya Tumpang No. 12',
        customerDistrict: 'Kecamatan Tumpang',
        items: []
      })
    });
    assert(resEmptyCart.status === 400, 'Validasi pesanan dengan keranjang kosong ditolak (400)');

    // b. Data Customer Tidak Lengkap (Nomor telepon kurang dari 9 digit)
    const resInvalidPhone = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Budi',
        customerPhone: '1234',
        deliveryAddress: 'Jl. Melati',
        customerDistrict: 'Kecamatan Tumpang',
        items: [{ productId: productsData[0].id, quantity: 1 }]
      })
    });
    assert(resInvalidPhone.status === 400, 'Validasi nomor telepon pelanggan tidak valid ditolak (400)');

    // c. Pesanan melebihi stok yang tersedia
    const targetProd = productsData[0];
    const resExceedStock = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Budi Santoso',
        customerPhone: '081234567890',
        deliveryAddress: 'Jl. Raya Tumpang No. 12',
        customerDistrict: 'Kecamatan Tumpang',
        items: [{ productId: targetProd.id, quantity: targetProd.stock + 500 }]
      })
    });
    assert(resExceedStock.status === 400, 'Pesanan dengan kuantitas melebihi stok produk ditolak (400)');

    // 5. Uji Checkout Berhasil & Perhitungan Harga Server-Side
    console.log('\n--- 5. Uji Pembuatan Pesanan Sah & Perhitungan Harga ---');
    const orderQty = 2;
    const initialProductStock = targetProd.stock;
    const idempotencyKey = `req_${Date.now()}_test_01`;

    const validOrderPayload = {
      customerName: 'Ahmad Dahlan',
      customerPhone: '081299990002',
      deliveryAddress: 'Jl. Jeruk No. 44, RT 02 RW 01',
      customerDistrict: 'Kecamatan Tumpang',
      shippingMethod: 'INSTANT',
      deliveryNotes: 'Titipkan ke pos satpam jika tidak ada orang',
      clientRequestId: idempotencyKey,
      items: [
        {
          productId: targetProd.id,
          quantity: orderQty,
          variationId: targetProd.variations?.[0]?.id,
          optionId: targetProd.variations?.[0]?.options[0]?.id
        }
      ]
    };

    const resCreateOrder = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validOrderPayload)
    });
    const createdOrder = await resCreateOrder.json();

    assert(resCreateOrder.status === 201, 'Pesanan belanja sah berhasil dibuat (201 Created)');
    assert(typeof createdOrder.orderNumber === 'string' && createdOrder.orderNumber.startsWith('TS-'), `Nomor pesanan unik dihasilkan: ${createdOrder.orderNumber}`);
    assert(createdOrder.paymentStatus === ShopPaymentStatus.UNPAID, 'Status awal pembayaran adalah UNPAID (belum lunas)');
    assert(createdOrder.orderStatus === ShopOrderStatus.NEW, 'Status awal alur pesanan adalah NEW');
    assert(createdOrder.subtotal > 0, `Subtotal produk dihitung ulang di backend: Rp ${createdOrder.subtotal.toLocaleString('id-ID')}`);
    assert(createdOrder.deliveryFee === configData.defaultDeliveryFee, `Tarif ongkir diambil dari config toko backend: Rp ${createdOrder.deliveryFee.toLocaleString('id-ID')}`);
    assert(createdOrder.total === createdOrder.subtotal + createdOrder.deliveryFee + createdOrder.serviceFee + createdOrder.uniqueCode, 'Total akhir merupakan akumulasi subtotal + ongkir + biaya layanan + kode unik');

    // Cek stok produk langsung berkurang
    const updatedProd = shopDb.getProductById(targetProd.id);
    assert(updatedProd?.stock === initialProductStock - orderQty, `Stok produk berkurang otomatis dari ${initialProductStock} menjadi ${updatedProd?.stock}`);

    // d. Uji Idempotensi (Mencegah Pesanan Ganda dari Klik Berulang)
    const resDuplicateOrder = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validOrderPayload)
    });
    const duplicateData = await resDuplicateOrder.json();
    assert(resDuplicateOrder.status === 201 && duplicateData.id === createdOrder.id, 'Idempotensi aktif: Pengiriman ulang dengan clientRequestId yang sama mengembalikan pesanan yang sudah ada tanpa menduplikasi data atau mengurangi stok');

    // 6. Uji Alur Pembayaran & Perubahan Status Pesanan
    console.log('\n--- 6. Uji Alur Verifikasi Pembayaran & Perubahan Status ---');
    // a. Customer unggah bukti transfer
    const resUploadProof = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/payment-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        paymentProof: 'https://example.com/receipt-proof.jpg',
        customerPhone: '081299990002'
      })
    });
    const proofData = await resUploadProof.json();
    assert(resUploadProof.status === 200 && proofData.paymentStatus === ShopPaymentStatus.WAITING_VERIFICATION, 'Upload bukti bayar mengubah paymentStatus menjadi WAITING_VERIFICATION (belum lunas)');
    assert(proofData.orderStatus === ShopOrderStatus.NEW, 'orderStatus tetap NEW sampai diverifikasi admin');

    // b. Admin Shop verifikasi pembayaran sah -> paymentStatus PAID & orderStatus PROCESSING
    const resVerifyPay = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/verify-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ approved: true })
    });
    const verifyData = await resVerifyPay.json();
    assert(resVerifyPay.status === 200 && verifyData.paymentStatus === ShopPaymentStatus.PAID && verifyData.orderStatus === ShopOrderStatus.PROCESSING, 'Verifikasi bayar sah oleh admin mengubah paymentStatus -> PAID dan orderStatus -> PROCESSING');

    // 7. Uji Keamanan Pelacakan Pesanan (Privacy Guard)
    console.log('\n--- 7. Uji Keamanan Pelacakan Pesanan (Privacy Guard) ---');
    // a. Akses lacak tanpa menyertakan nomor WhatsApp -> harus ditolak (403)
    const resTrackNoPhone = await fetch(`${baseUrl}/api/shop/orders/track/${createdOrder.orderNumber}`);
    assert(resTrackNoPhone.status === 403, 'Akses lacak tanpa parameter nomor WhatsApp ditolak (403)');

    // b. Akses lacak dengan nomor WhatsApp salah -> harus ditolak (404)
    const resTrackWrongPhone = await fetch(`${baseUrl}/api/shop/orders/track/${createdOrder.orderNumber}?phone=089999999999`);
    assert(resTrackWrongPhone.status === 404, 'Akses lacak dengan nomor WhatsApp tidak cocok ditolak (404)');

    // c. Akses lacak dengan nomor WhatsApp yang sah -> harus berhasil (200)
    const resTrackValid = await fetch(`${baseUrl}/api/shop/orders/track/${createdOrder.orderNumber}?phone=081299990002`);
    const trackValidData = await resTrackValid.json();
    assert(resTrackValid.status === 200 && trackValidData.id === createdOrder.id, 'Akses lacak dengan nomor pesanan & nomor WhatsApp sah berhasil (200)');

    // ==========================================
    // 8. UJI MODUL PENGIRIMAN & TRACKING (PART 5)
    // ==========================================
    console.log('\n--- 8. Uji Modul Pengiriman & Tracking Tumpang Shop (Part 5) ---');

    // a. Opsi Pengiriman Modular (GET /api/shop/shipping/options)
    const resShipOptions = await fetch(`${baseUrl}/api/shop/shipping/options`);
    const shipOptions = await resShipOptions.json();
    assert(resShipOptions.status === 200 && Array.isArray(shipOptions), 'GET /api/shop/shipping/options mengembalikan daftar opsi pengiriman');

    const hasLocalOption = shipOptions.some((o: any) => o.scope === 'LOCAL' && o.courierCode === 'TUMPANG_LOCAL');
    const hasDomesticExpedition = shipOptions.some((o: any) => o.scope === 'LOCAL' && o.courierCode === 'DOMESTIC_EXPEDITION');
    const hasChinaCrossBorder = shipOptions.some((o: any) => o.scope === 'INTERNATIONAL' && o.courierCode === 'CHINA_ID_CROSSBORDER');

    assert(hasLocalOption, 'Tersedia opsi pengiriman lokal Tumpang');
    assert(hasDomesticExpedition, 'Tersedia opsi ekspedisi domestik');
    assert(hasChinaCrossBorder, 'Tersedia opsi pengiriman internasional China 🇨🇳 → Indonesia 🇮🇩');

    // Zero-fabrication check: pastikan kurir pihak ketiga yang belum punya live API ditandai false
    const chinaOption = shipOptions.find((o: any) => o.scope === 'INTERNATIONAL');
    assert(chinaOption?.isLiveApiIntegrated === false, 'Opsi impor China menandai isLiveApiIntegrated = false (tanpa rekayasa status API)');

    // b. Proteksi Otorisasi Admin Pengiriman
    console.log('\n--- 8.1 Uji Otorisasi Admin Pengiriman ---');
    // Request tanpa auth -> 401
    const resUnauthShip = await fetch(`${baseUrl}/api/shop/admin/shipments`);
    assert(resUnauthShip.status === 401, 'GET /api/shop/admin/shipments tanpa token ditolak (401)');

    // Request dengan food admin token -> 403
    const resFoodShip = await fetch(`${baseUrl}/api/shop/admin/shipments`, {
      headers: { 'Authorization': `Bearer ${foodToken}` }
    });
    assert(resFoodShip.status === 403, 'GET /api/shop/admin/shipments dengan token Food Admin ditolak (403)');

    // Request dengan shop admin token -> 200
    const resAdminShipments = await fetch(`${baseUrl}/api/shop/admin/shipments`, {
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    const adminShipmentsData = await resAdminShipments.json();
    assert(resAdminShipments.status === 200 && Array.isArray(adminShipmentsData), 'GET /api/shop/admin/shipments dengan Shop Admin token berhasil (200)');

    // c. Pembuatan Pengiriman Internasional (China -> Indonesia)
    console.log('\n--- 8.2 Uji Pembuatan Pengiriman Internasional China → ID ---');
    const chinaOrderPayload = {
      customerName: 'Siti Rahmawati',
      customerPhone: '081288887777',
      deliveryAddress: 'Dusun Glagah, RT 01 RW 04',
      customerDistrict: 'Kecamatan Tumpang',
      shippingMethod: 'CHINA_AIR_EXPRESS',
      deliveryNotes: 'Barang pecah belah, mohon bubble wrap tebal',
      clientRequestId: `req_china_${Date.now()}`,
      items: [
        {
          productId: targetProd.id,
          quantity: 1
        }
      ]
    };

    const resChinaOrder = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chinaOrderPayload)
    });
    const chinaOrder = await resChinaOrder.json();
    assert(resChinaOrder.status === 201, 'Pesanan dengan jalur internasional China berhasil dibuat');
    assert(chinaOrder.shipment?.scope === 'INTERNATIONAL', 'Lingkup pengiriman pesanan disetel ke INTERNATIONAL');
    assert(chinaOrder.shipment?.originCountry === 'CN' && chinaOrder.shipment?.destinationCountry === 'ID', 'Rute negara asal = CN dan negara tujuan = ID');
    assert(chinaOrder.shipment?.trackingNumber.startsWith('CN-ID'), `Nomor resi internasional berformat rapi: ${chinaOrder.shipment?.trackingNumber}`);
    assert(chinaOrder.shipment?.isEstimateVerified === false, 'Estimasi kedatangan berstatus unverified (belum terhubung API live)');

    const internationalShipmentId = chinaOrder.shipment.id;

    // d. Pembaruan Status Pengiriman Berkelanjutan & Riwayat Tracking
    console.log('\n--- 8.3 Uji Perubahan Status & Riwayat Pelacakan Paket ---');
    
    // Status 1: ARRIVED_INDONESIA
    const resUpdatePort = await fetch(`${baseUrl}/api/shop/admin/shipments/${internationalShipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        status: ShopShipmentStatus.ARRIVED_INDONESIA,
        location: 'Bandara Internasional Soekarno-Hatta (CGK)',
        description: 'Pesawat kargo mendarat. Kontainer paket diturunkan ke terminal kargo bandara.'
      })
    });
    const portData = await resUpdatePort.json();
    assert(resUpdatePort.status === 200 && portData.status === ShopShipmentStatus.ARRIVED_INDONESIA, 'Status pengiriman diubah ke ARRIVED_INDONESIA');
    assert(portData.statusLabel === 'Tiba di Indonesia', 'Label status dalam Bahasa Indonesia: "Tiba di Indonesia"');

    // Status 2: CUSTOMS_CLEARANCE
    const resUpdateCustoms = await fetch(`${baseUrl}/api/shop/admin/shipments/${internationalShipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        status: ShopShipmentStatus.CUSTOMS_CLEARANCE,
        location: 'Kantor Bea & Cukai KPU Tanjung Priok / CGK',
        description: 'Verifikasi dokumen kepabeanan manifest impor dan pemeriksaan pajak impor.'
      })
    });
    const customsData = await resUpdateCustoms.json();
    assert(resUpdateCustoms.status === 200 && customsData.status === ShopShipmentStatus.CUSTOMS_CLEARANCE, 'Status pengiriman diubah ke CUSTOMS_CLEARANCE');

    // Status 3: TRANSFERRED_LOCAL_COURIER
    const resUpdateLocal = await fetch(`${baseUrl}/api/shop/admin/shipments/${internationalShipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        status: ShopShipmentStatus.TRANSFERRED_LOCAL_COURIER,
        location: 'Hub Distribusi Domestik Surabaya / Malang',
        description: 'Paket diserahkan ke kurir domestik menuju hub pengantaran Tumpang.'
      })
    });
    const localCourierData = await resUpdateLocal.json();
    assert(resUpdateLocal.status === 200 && localCourierData.status === ShopShipmentStatus.TRANSFERRED_LOCAL_COURIER, 'Status diubah ke TRANSFERRED_LOCAL_COURIER');

    // Status 4: OUT_FOR_DELIVERY
    const resUpdateDelivery = await fetch(`${baseUrl}/api/shop/admin/shipments/${internationalShipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        status: ShopShipmentStatus.OUT_FOR_DELIVERY,
        location: 'Kecamatan Tumpang, Malang',
        description: 'Kurir sedang membawa paket menuju alamat Dusun Glagah.'
      })
    });
    const deliveryData = await resUpdateDelivery.json();
    assert(resUpdateDelivery.status === 200 && deliveryData.status === ShopShipmentStatus.OUT_FOR_DELIVERY, 'Status diubah ke OUT_FOR_DELIVERY');

    // Status 5: DELIVERED
    const resUpdateDelivered = await fetch(`${baseUrl}/api/shop/admin/shipments/${internationalShipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        status: ShopShipmentStatus.DELIVERED,
        location: 'Alamat Penerima Dusun Glagah, Tumpang',
        description: 'Paket berhasil diterima oleh Ibu Siti Rahmawati.'
      })
    });
    const deliveredData = await resUpdateDelivered.json();
    assert(resUpdateDelivered.status === 200 && deliveredData.status === ShopShipmentStatus.DELIVERED, 'Status akhir diubah ke DELIVERED');
    assert(deliveredData.trackingHistory.length >= 6, `Riwayat pelacakan mencatat seluruh riwayat tahapan (${deliveredData.trackingHistory.length} tahapan tersimpan)`);

    // e. Independensi Status Pembayaran terhadap Status Pengiriman (Requirement 9)
    console.log('\n--- 8.4 Uji Independensi Status Pembayaran vs Pengiriman ---');
    const checkedChinaOrder = shopDb.getOrderById(chinaOrder.id);
    assert(checkedChinaOrder?.paymentStatus === ShopPaymentStatus.UNPAID, 'Status pembayaran TETAP UNPAID meskipun status pengiriman paket sudah DELIVERED');
    assert(checkedChinaOrder?.orderStatus === ShopOrderStatus.COMPLETED, 'Status fisik pesanan diperbarui menjadi COMPLETED saat paket terkirim');

    // f. Uji Pelacakan Publik / Pelanggan oleh Customer (Privacy Guard)
    console.log('\n--- 8.5 Uji Pelacakan Nomor Resi oleh Pelanggan ---');
    const trackingNo = chinaOrder.shipment.trackingNumber;

    // Tanpa phone -> ditolak (403)
    const resTrackResiNoPhone = await fetch(`${baseUrl}/api/shop/shipping/track/${trackingNo}`);
    assert(resTrackResiNoPhone.status === 403, 'GET /api/shop/shipping/track/:resi tanpa nomor WhatsApp ditolak (403)');

    // Phone salah -> ditolak (403)
    const resTrackResiWrongPhone = await fetch(`${baseUrl}/api/shop/shipping/track/${trackingNo}?phone=089912345678`);
    assert(resTrackResiWrongPhone.status === 403, 'GET /api/shop/shipping/track/:resi dengan nomor WhatsApp yang tidak cocok ditolak (403)');

    // Phone benar -> 200
    const resTrackResiSuccess = await fetch(`${baseUrl}/api/shop/shipping/track/${trackingNo}?phone=081288887777`);
    const trackingResult = await resTrackResiSuccess.json();
    assert(resTrackResiSuccess.status === 200 && trackingResult.trackingNumber === trackingNo, 'Pelanggan dapat melacak status resi paketnya dengan nomor WhatsApp yang sah');
    assert(trackingResult.trackingHistory.length >= 6, 'Pelanggan dapat melihat seluruh linimasa perjalanan paket');

    // 9. Uji Pemulihan Stok Saat Pembatalan Pesanan
    console.log('\n--- 9. Uji Pemulihan Stok Saat Pembatalan ---');
    const stockBeforeCancel = shopDb.getProductById(targetProd.id)?.stock || 0;
    const resCancel = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ status: ShopOrderStatus.CANCELLED, reason: 'Pengujian pengembalian stok' })
    });
    const cancelData = await resCancel.json();
    assert(resCancel.status === 200 && cancelData.orderStatus === ShopOrderStatus.CANCELLED, 'Status pesanan berhasil diubah menjadi CANCELLED');

    const stockAfterCancel = shopDb.getProductById(targetProd.id)?.stock || 0;
    assert(stockAfterCancel === stockBeforeCancel + orderQty, `Stok produk pulih kembali (+${orderQty}) menjadi ${stockAfterCancel}`);

    // 10. Uji Dashboard Admin Tumpang Shop (Part 6)
    console.log('\n--- 10. Uji Dashboard Admin Tumpang Shop (Part 6) ---');

    // 10.1 Login & Sesi Auth /api/shop/auth/me
    const resAuthMeValid = await fetch(`${baseUrl}/api/shop/auth/me`, {
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    const authMeData = await resAuthMeValid.json();
    assert(resAuthMeValid.status === 200 && authMeData.user?.role === 'SHOP_ADMIN', 'GET /api/shop/auth/me dengan token sah mengembalikan profil SHOP_ADMIN');

    const resAuthMeNoToken = await fetch(`${baseUrl}/api/shop/auth/me`);
    assert(resAuthMeNoToken.status === 401, 'GET /api/shop/auth/me tanpa token ditolak (401 Unauthorized)');

    // 10.2 Metrik Dashboard Statistik & Stok Menipis
    const resMetrics = await fetch(`${baseUrl}/api/shop/reports/summary`, {
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    const metricsData = await resMetrics.json();
    assert(resMetrics.status === 200 && typeof metricsData.totalRevenue === 'number', 'GET /api/shop/reports/summary mengembalikan total omzet dan metrik toko');
    assert(Array.isArray(metricsData.lowStockList) && typeof metricsData.lowStockProducts === 'number', 'Metrik mendeteksi daftar stok produk menipis');

    // 10.3 CRUD Kategori Toko
    console.log('\n--- 10.1 Uji CRUD Kategori Admin ---');
    const newCategoryPayload = {
      name: 'Herbal Semeru',
      slug: 'herbal-semeru',
      description: 'Jamu tradisional dan rempah pilihan lereng Semeru',
      icon: 'Leaf',
      isActive: true
    };
    const resCreateCat = await fetch(`${baseUrl}/api/shop/categories`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify(newCategoryPayload)
    });
    const createdCat = await resCreateCat.json();
    assert(resCreateCat.status === 201 && createdCat.name === newCategoryPayload.name, 'Admin berhasil membuat kategori baru (201)');

    const resUpdateCat = await fetch(`${baseUrl}/api/shop/categories/${createdCat.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ name: 'Herbal & Rempah Semeru' })
    });
    const updatedCat = await resUpdateCat.json();
    assert(resUpdateCat.status === 200 && updatedCat.name === 'Herbal & Rempah Semeru', 'Admin berhasil memperbarui kategori (200)');

    const resDeleteCat = await fetch(`${baseUrl}/api/shop/categories/${createdCat.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    assert(resDeleteCat.status === 200, 'Admin berhasil menghapus kategori (200)');

    // 10.4 CRUD Produk Toko (Foto, SKU, Variasi, Harga, Stok)
    console.log('\n--- 10.2 Uji CRUD Produk & Variasi Admin ---');
    const newProductPayload = {
      name: 'Madu Hutan Semeru Asli',
      sku: 'TS-HNY-001',
      categoryId: categoriesData[0].id,
      description: 'Madu murni tawon klanceng hutan lereng Semeru',
      basePrice: 65000,
      stock: 25,
      unit: 'botol',
      images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500'],
      variations: [
        {
          id: 'var_kemasan',
          name: 'Ukuran Kemasan',
          options: [
            { id: 'opt_250ml', name: '250ml', priceDelta: 0, stock: 15 },
            { id: 'opt_500ml', name: '500ml', priceDelta: 45000, stock: 10 }
          ]
        }
      ],
      isActive: true
    };

    const resCreateProd = await fetch(`${baseUrl}/api/shop/products`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify(newProductPayload)
    });
    const createdProd = await resCreateProd.json();
    assert(resCreateProd.status === 201 && createdProd.sku === 'TS-HNY-001', 'Admin berhasil membuat produk baru lengkap dengan SKU & variasi (201)');

    const resUpdateProd = await fetch(`${baseUrl}/api/shop/products/${createdProd.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        basePrice: 68000,
        stock: 30
      })
    });
    const updatedProdData = await resUpdateProd.json();
    assert(resUpdateProd.status === 200 && updatedProdData.basePrice === 68000 && updatedProdData.stock === 30, 'Admin berhasil memperbarui harga dan stok produk (200)');

    const resDeleteProd = await fetch(`${baseUrl}/api/shop/products/${createdProd.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    assert(resDeleteProd.status === 200, 'Admin berhasil menghapus produk (200)');

    // 10.5 Pengaturan Toko, QRIS, & Tarif
    console.log('\n--- 10.3 Uji Pengaturan Toko, QRIS & Tarif ---');
    const resUpdateConfig = await fetch(`${baseUrl}/api/shop/config`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({
        storeName: 'Toko Sembako Tumpang Go Utama',
        isOpen: true,
        defaultDeliveryFee: 4000,
        serviceFee: 1000,
        minOrderAmount: 10000,
        qrisImage: 'https://example.com/test-qris.jpg'
      })
    });
    const updatedConfig = await resUpdateConfig.json();
    assert(resUpdateConfig.status === 200 && updatedConfig.storeName === 'Toko Sembako Tumpang Go Utama', 'Admin berhasil memperbarui pengaturan toko & QRIS (200)');

    // 10.6 Laporan Transaksi Berdasarkan Rentang Tanggal
    console.log('\n--- 10.4 Uji Laporan Transaksi per Tanggal ---');
    const resReport = await fetch(`${baseUrl}/api/shop/reports/transactions?startDate=2026-01-01&endDate=2026-12-31`, {
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    const reportResponse = await resReport.json();
    assert(resReport.status === 200 && typeof reportResponse.summary?.totalRevenue === 'number', 'GET /api/shop/reports/transactions mengembalikan omzet lunas dan rangkuman');
    assert(Array.isArray(reportResponse.orders), 'Laporan transaksi menyertakan daftar pesanan yang difilter');

    // 10.7 Uji Penolakan Otorisasi RBAC (Keamanan)
    console.log('\n--- 10.5 Uji Keamanan Otorisasi RBAC ---');
    const resCrossProduct = await fetch(`${baseUrl}/api/shop/products`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${foodToken}`
      },
      body: JSON.stringify(newProductPayload)
    });
    assert(resCrossProduct.status === 403, 'Food Admin DITOLAK membuat produk Shop (403 Forbidden)');

    const resCrossReport = await fetch(`${baseUrl}/api/shop/reports/transactions`, {
      headers: { 'Authorization': `Bearer ${foodToken}` }
    });
    assert(resCrossReport.status === 403, 'Food Admin DITOLAK mengakses laporan transaksi Shop (403 Forbidden)');

    // 11. Uji Isolasi Menyeluruh Tumpang Food
    console.log('\n--- 11. Uji Isolasi Menyeluruh Tumpang Food ---');
    const finalFoodMerchantsCount = foodDb.getMerchants().length;
    const finalFoodDriversCount = foodDb.getDrivers().length;

    assert(finalFoodMerchantsCount === initialFoodMerchantsCount, 'Jumlah merchant Tumpang Food tidak terpengaruh');
    assert(finalFoodDriversCount === initialFoodDriversCount, 'Jumlah driver Tumpang Food TIDAK TERPENGARUH oleh sistem pengiriman Shop');

    const resFoodHealth = await fetch(`${baseUrl}/api/health`);
    assert(resFoodHealth.status === 200, 'Health check Tumpang Food tetap berstatus 200 OK');

  } catch (err: any) {
    console.error('CRITICAL ERROR DURING TESTS:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`📊 HASIL PENGUJIAN: ${passed} BERHASIL | ${failed} GAGAL`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
