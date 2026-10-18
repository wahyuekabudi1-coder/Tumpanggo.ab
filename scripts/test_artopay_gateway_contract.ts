/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ArtoPay Gateway Response Contract & Diagnostic Test Suite
 * Validates the 6 mandatory gateway response scenarios specified in Langkah 5:
 * 
 * 1. Respons gateway sukses dengan URL checkout (Root field)
 * 2. Respons gateway sukses dengan URL di dalam nested object (Nested envelope)
 * 3. Respons sukses tanpa URL checkout (Official ArtoPay contract: HTTP 200, but no checkoutUrl)
 * 4. Respons gagal dari gateway (HTTP 4xx / 5xx error response)
 * 5. Respons non-JSON (HTML / plain text error)
 * 6. Respons dengan URL yang tidak valid (Invalid scheme, relative path, or empty string)
 */

import {
  ArtoPayService,
  extractArtoPayCheckoutUrl,
  extractArtoPayTransactionId,
  findArtoPayTransactionIdField,
  findArtoPayCheckoutUrlField
} from '../src/lib/artopay';

async function runGatewayContractTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING ARTOPAY GATEWAY CONTRACT & DIAGNOSTIC TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // Helper to create a mock fetch
  function createMockFetch(status: number, body: string, contentType = 'application/json') {
    return async () => ({
      status,
      ok: status >= 200 && status < 300,
      headers: {
        get: (h: string) => {
          if (h.toLowerCase() === 'content-type') return contentType;
          return null;
        }
      },
      text: async () => body,
      json: async () => JSON.parse(body)
    } as any);
  }

  // -------------------------------------------------------------
  // SKENARIO 1: Respons gateway sukses dengan URL checkout
  // -------------------------------------------------------------
  console.log('--- 1. Respons Gateway Sukses dengan URL Checkout (Root) ---');
  const mockSuccessRoot = {
    id: 'pi_root_success_001',
    checkoutUrl: 'https://pay.arto-pay.com/arto-pay/checkout/chk_root_001',
    status: 'created',
    amount: '25000'
  };
  const mockFetch1 = createMockFetch(200, JSON.stringify(mockSuccessRoot));

  try {
    const res1 = await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_001',
      amount: 25000,
      currency: 'IDR',
      customerName: 'Customer Satu',
      customerPhone: '081234567890',
      serviceType: 'FOOD',
      customFetch: mockFetch1
    });

    assert(res1.success === true, 'Sesi transaksi payment link berhasil dibuat');
    assert(res1.paymentIntentId === 'pi_root_success_001', 'ID transaksi diekstraksi dengan benar (pi_root_success_001)');
    assert(res1.checkoutUrl === 'https://pay.arto-pay.com/arto-pay/checkout/chk_root_001', 'URL checkout resmi diekstraksi dari root');
    assert(findArtoPayTransactionIdField(mockSuccessRoot) === 'id', 'Helper mendeteksi field ID transaksi pada "id"');
    assert(findArtoPayCheckoutUrlField(mockSuccessRoot) === 'checkoutUrl', 'Helper mendeteksi field checkout URL pada "checkoutUrl"');
  } catch (e: any) {
    assert(false, 'Harus berhasil membuat payment intent dengan URL checkout root', e.message);
  }

  // -------------------------------------------------------------
  // SKENARIO 2: Respons gateway sukses dengan URL di dalam nested object
  // -------------------------------------------------------------
  console.log('\n--- 2. Respons Gateway Sukses dengan URL di Dalam Nested Object ---');
  const mockSuccessNested = {
    responseCode: '2000000',
    responseMessage: 'Success',
    responseData: {
      id: 'pi_nested_success_002',
      paymentUrl: 'https://pay.arto-pay.com/arto-pay/checkout/chk_nested_002',
      status: 'created',
      amount: '50000'
    }
  };
  const mockFetch2 = createMockFetch(200, JSON.stringify(mockSuccessNested));

  try {
    const res2 = await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_002',
      amount: 50000,
      currency: 'IDR',
      customerName: 'Customer Dua',
      customerPhone: '081234567891',
      serviceType: 'SHOP',
      customFetch: mockFetch2
    });

    assert(res2.success === true, 'Sesi transaksi nested berhasil dibuat');
    assert(res2.paymentIntentId === 'pi_nested_success_002', 'ID transaksi nested diekstraksi dengan benar');
    assert(res2.checkoutUrl === 'https://pay.arto-pay.com/arto-pay/checkout/chk_nested_002', 'URL checkout diekstraksi dari nested responseData.paymentUrl');
    assert(findArtoPayTransactionIdField(mockSuccessNested) === 'responseData.id', 'Helper mendeteksi path field ID pada "responseData.id"');
    assert(findArtoPayCheckoutUrlField(mockSuccessNested) === 'responseData.paymentUrl', 'Helper mendeteksi path field checkout URL pada "responseData.paymentUrl"');
  } catch (e: any) {
    assert(false, 'Harus berhasil mengekstrak URL checkout dari nested envelope', e.message);
  }

  // -------------------------------------------------------------
  // SKENARIO 3: Respons sukses tanpa URL checkout (Kontrak Aktual ArtoPay)
  // -------------------------------------------------------------
  console.log('\n--- 3. Respons Sukses Tanpa URL Checkout (Kontrak ArtoPay Aktual) ---');
  // Exactly mirrors the real response returned by api-sandbox.arto-pay.com/v1.1/payment-intents
  const mockRealArtoPayContract = {
    responseCode: '2002700',
    responseMessage: 'Success',
    responseData: {
      id: '8390c046-bea2-4538-8e29-424fc34a0942',
      amount: '15000',
      currency: 'IDR',
      customerToken: 'ct_8390c046-bea2-4538-8e29-424fc34a0942_token_sample',
      secret: 'pi_011ee427-62cb-46eb-a1bf-6f20f1c63c72_secret_sample',
      status: 'created',
      createdAt: '2026-10-18T16:04:47.266142Z'
    }
  };
  const mockFetch3 = createMockFetch(200, JSON.stringify(mockRealArtoPayContract));

  // 1. Uji Kontrak Standar SDK Modal (Tanpa Mewajibkan checkoutUrl)
  try {
    const res3 = await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_003',
      amount: 15000,
      currency: 'IDR',
      customerName: 'Customer Tiga',
      customerPhone: '081234567892',
      serviceType: 'FOOD',
      customFetch: mockFetch3
    });

    assert(res3.success === true, 'Sesi modal SDK berhasil dibuat tanpa mewajibkan checkoutUrl');
    assert(res3.paymentIntentId === '8390c046-bea2-4538-8e29-424fc34a0942', 'ID transaksi modal diekstraksi dengan benar (8390c046...)');
    assert(res3.clientSecret === 'pi_011ee427-62cb-46eb-a1bf-6f20f1c63c72_secret_sample', 'Payment intent client secret diekstraksi untuk modal SDK');
    assert(res3.customerToken === 'ct_8390c046-bea2-4538-8e29-424fc34a0942_token_sample', 'Customer token diekstraksi untuk modal SDK');
    assert(res3.checkoutUrl === '', 'checkoutUrl bernilai kosong tanpa membuat URL tebakan/palsu');
    assert(
      findArtoPayCheckoutUrlField(mockRealArtoPayContract) === null,
      'Helper mendeteksi ketiadaan checkout URL (return null)'
    );
    assert(
      extractArtoPayCheckoutUrl(mockRealArtoPayContract) === null,
      'Extractor checkout URL mengembalikan null tanpa membuat URL tebakan/palsu'
    );
  } catch (e: any) {
    assert(false, 'Harus berhasil membuat sesi transaksi untuk modal SDK resmi', e.message);
  }

  // 2. Uji Penolakan jika Alur Secara Eksplisit Mewajibkan Hosted Payment Link (requireHostedCheckoutUrl)
  try {
    await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_003_hosted_only',
      amount: 15000,
      currency: 'IDR',
      customerName: 'Customer Tiga',
      customerPhone: '081234567892',
      serviceType: 'FOOD',
      requireHostedCheckoutUrl: true,
      customFetch: mockFetch3
    });
    assert(false, 'Harus menolak saat requireHostedCheckoutUrl diaktifkan namun gateway tidak menyediakan link');
  } catch (e: any) {
    assert(
      e.message.includes('tidak memuat URL checkout resmi'),
      'Backend menolak transaksi saat requireHostedCheckoutUrl aktif tanpa link resmi',
      e.message
    );
    assert(
      e.message.includes('8390c046'),
      'Pesan diagnostik mencatat ID transaksi yang berhasil dibuat di gateway',
      e.message
    );
    assert(
      e.message.includes('HTTP 200'),
      'Pesan diagnostik membedakan status HTTP 200 dengan ketiadaan payment link',
      e.message
    );
  }

  // -------------------------------------------------------------
  // SKENARIO 4: Respons gagal dari gateway (HTTP 4xx / 5xx)
  // -------------------------------------------------------------
  console.log('\n--- 4. Respons Gagal Dari Gateway (HTTP 4xx / 5xx) ---');
  const mockGatewayError = {
    responseCode: '4001002',
    responseMessage: 'Invalid merchant business unit credentials or inactive merchant account',
    error: 'Bad Request'
  };
  const mockFetch4 = createMockFetch(400, JSON.stringify(mockGatewayError));

  try {
    await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_004',
      amount: 30000,
      currency: 'IDR',
      customerName: 'Customer Empat',
      customerPhone: '081234567893',
      serviceType: 'FOOD',
      customFetch: mockFetch4
    });
    assert(false, 'Harus melempar error saat gateway mengembalikan HTTP 400');
  } catch (e: any) {
    assert(
      e.message.includes('HTTP 400') && e.message.includes('Invalid merchant business unit credentials'),
      'Error gateway HTTP 400 ditangani dengan detail pesan bisnis resmi',
      e.message
    );
  }

  // -------------------------------------------------------------
  // SKENARIO 5: Respons non-JSON (HTML / Plain Text)
  // -------------------------------------------------------------
  console.log('\n--- 5. Respons Non-JSON Dari Gateway ---');
  const htmlError = '<html><head><title>502 Bad Gateway</title></head><body>502 Bad Gateway</body></html>';
  const mockFetch5 = createMockFetch(502, htmlError, 'text/html');

  try {
    await ArtoPayService.createPaymentIntent({
      orderId: 'ord_test_005',
      amount: 45000,
      currency: 'IDR',
      customerName: 'Customer Lima',
      customerPhone: '081234567894',
      serviceType: 'SHOP',
      customFetch: mockFetch5
    });
    assert(false, 'Harus melempar error saat gateway mengembalikan respons non-JSON');
  } catch (e: any) {
    assert(
      e.message.includes('non-JSON') && e.message.includes('HTTP 502'),
      'Respons non-JSON ditangani dengan aman tanpa crash parsing',
      e.message
    );
  }

  // -------------------------------------------------------------
  // SKENARIO 6: Respons dengan URL yang tidak valid
  // -------------------------------------------------------------
  console.log('\n--- 6. Respons Dengan URL Yang Tidak Valid ---');
  const invalidUrlCandidates = [
    { name: 'String kosong', payload: { id: 'pi_inv_1', checkoutUrl: '' } },
    { name: 'Spasi saja', payload: { id: 'pi_inv_2', checkoutUrl: '    ' } },
    { name: 'Relative path', payload: { id: 'pi_inv_3', checkoutUrl: '/checkout/pay' } },
    { name: 'Skema non-HTTP', payload: { id: 'pi_inv_4', checkoutUrl: 'javascript:alert(1)' } },
    { name: 'Teks acak', payload: { id: 'pi_inv_5', checkoutUrl: 'invalid-url-string' } }
  ];

  for (const item of invalidUrlCandidates) {
    const extracted = extractArtoPayCheckoutUrl(item.payload);
    assert(extracted === null, `URL tidak valid (${item.name}) ditolak dan diekstrak sebagai null`);

    const mockFetchBadUrl = createMockFetch(200, JSON.stringify(item.payload));
    try {
      await ArtoPayService.createPaymentIntent({
        orderId: `ord_inv_${item.payload.id}`,
        amount: 20000,
        currency: 'IDR',
        customerName: 'Invalid Tester',
        customerPhone: '081234567895',
        serviceType: 'FOOD',
        customFetch: mockFetchBadUrl
      });
      assert(false, `Harus menolak transaksi dengan URL tidak valid: ${item.name}`);
    } catch (e: any) {
      assert(
        e.message.includes('tidak memuat URL checkout resmi'),
        `Transaksi dengan URL tidak valid (${item.name}) ditolak dengan pesan yang sesuai`
      );
    }
  }

  console.log('\n================================================================');
  console.log(`CONTRACT TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runGatewayContractTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
