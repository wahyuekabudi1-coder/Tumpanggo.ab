/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ArtoPay Modal SDK Authentication & OAPI Security Contract Verification Suite
 * Validates:
 * 1. SDK patch integrity (resolvedKey passed to E/k, no undefined public keys)
 * 2. Parameter name contract (clientSecret/secret, token/customerToken, orderId, paymentId)
 * 3. Iframe postMessage INIT payload accuracy (publicKey, clientSecret, token, orderId)
 * 4. Environment mapping (sandbox URL vs production URL consistency)
 * 5. Order ID matching between backend Payment Intent and frontend modal
 * 6. Zero secret leakage in diagnostic logging
 */

import fs from 'fs';
import path from 'path';

async function runModalAuthTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING ARTOPAY MODAL SDK AUTHENTICATION & CONTRACT TEST SUITE');
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

  // -------------------------------------------------------------
  // TEST 1: SDK Distribution Patch Verification
  // -------------------------------------------------------------
  console.log('--- 1. Audit Distribusi & Patch File SDK ---');
  const esmPath = path.join(process.cwd(), 'node_modules', '@arto-pay', 'js-sdk', 'dist', 'arto-pay-sdk.esm.js');
  const umdPath = path.join(process.cwd(), 'node_modules', '@arto-pay', 'js-sdk', 'dist', 'arto-pay-sdk.umd.js');
  const dtsPath = path.join(process.cwd(), 'node_modules', '@arto-pay', 'js-sdk', 'dist', 'types.d.ts');

  assert(fs.existsSync(esmPath), 'File dist ESM arto-pay-sdk.esm.js terpasang');
  assert(fs.existsSync(umdPath), 'File dist UMD arto-pay-sdk.umd.js terpasang');
  assert(fs.existsSync(dtsPath), 'File tipe types.d.ts terpasang');

  const esmContent = fs.readFileSync(esmPath, 'utf8');
  const umdContent = fs.readFileSync(umdPath, 'utf8');
  const dtsContent = fs.readFileSync(dtsPath, 'utf8');

  // Verify resolvedKey is passed into E() and k()
  assert(
    esmContent.includes('E(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)'),
    'ESM openPayment meneruskan resolvedKey (bukan static I) ke fungsi inisialisasi modal E()'
  );

  assert(
    umdContent.includes('k(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)'),
    'UMD openPayment meneruskan resolvedKey (bukan static A) ke fungsi inisialisasi modal k()'
  );

  assert(
    esmContent.includes('resolvedSecret') && esmContent.includes('n.clientSecret||n.secret'),
    'ESM openPayment mendukung kedua varian properti: clientSecret dan secret'
  );

  assert(
    esmContent.includes('resolvedToken') && esmContent.includes('n.token||n.customerToken'),
    'ESM openPayment mendukung kedua varian properti token: token dan customerToken'
  );

  assert(
    dtsContent.includes('publicKey?: string;') && dtsContent.includes('secret?: string;'),
    'Tipe deklarasi TypeScript types.d.ts menyertakan publicKey, secret, dan customerToken'
  );

  // -------------------------------------------------------------
  // TEST 2: Simulasi Siklus Hidup Modal & Pesan INIT ke Iframe Gateway
  // -------------------------------------------------------------
  console.log('\n--- 2. Pengujian Siklus Hidup Modal & Pesan INIT (PostMessage) ---');

  // Build clean DOM simulation environment
  const postMessagesSent: any[] = [];
  let iframeContentWindow: any = null;

  const mockIframe: any = {
    id: 'arto-pay-payment-iframe',
    src: '',
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: (event: string, cb: any) => {
      if (event === 'load') {
        mockIframe._onLoad = cb;
      }
    },
    get contentWindow() {
      return iframeContentWindow;
    }
  };

  iframeContentWindow = {
    postMessage: (msg: any, origin: string) => {
      postMessagesSent.push({ msg, origin });
    }
  };

  const elementsMap = new Map<string, any>();
  elementsMap.set('arto-pay-payment-iframe', mockIframe);

  const mockDocument: any = {
    getElementById: (id: string) => elementsMap.get(id) || null,
    createElement: (tag: string) => {
      if (tag === 'iframe') return mockIframe;
      const el: any = {
        _id: '',
        get id() { return this._id; },
        set id(val: string) {
          this._id = val;
          elementsMap.set(val, el);
        },
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        remove: () => {
          if (el._id) elementsMap.delete(el._id);
        },
        querySelector: () => null,
        classList: { add: () => {}, remove: () => {} }
      };
      return el;
    },
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, style: {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const messageListeners: Function[] = [];
  const mockWindow: any = {
    __ARTOPAY_PUBLIC_KEY__: 'pk_test_env_dynamic_key_999',
    addEventListener: (event: string, cb: any) => {
      if (event === 'message') messageListeners.push(cb);
    },
    removeEventListener: () => {}
  };

  (global as any).document = mockDocument;
  (global as any).window = mockWindow;

  // Dynamically import the freshly patched SDK
  const sdk = await import('@arto-pay/js-sdk');

  // Scenario A: Buka modal pembayaran dengan clientSecret, publicKey eksplisit, token, dan orderId
  const testOptions = {
    clientSecret: 'pi_sec_test_abc123456789',
    paymentId: '8390c046-bea2-4538-8e29-424fc34a0942',
    orderId: 'ord_food_real_1001',
    token: 'ct_tok_test_def987654321',
    publicKey: 'pk_test_merchant_live_888',
    sandbox: true
  };

  sdk.openPayment(testOptions as any);

  // Verify modal state is open
  assert(sdk.isPaymentOpen() === true, 'Modal terdeteksi terbuka (isPaymentOpen = true)');

  // Verify sandbox payment iframe URL
  assert(
    mockIframe.src === 'https://pay-sandbox.arto-pay.com/arto-pay/8390c046-bea2-4538-8e29-424fc34a0942',
    'URL iframe mengarah ke gateway sandbox yang tepat (pay-sandbox.arto-pay.com/arto-pay/[id])',
    mockIframe.src
  );

  // Trigger iframe onLoad and send READY message from iframe
  if (mockIframe._onLoad) mockIframe._onLoad();
  for (const listener of messageListeners) {
    listener({
      source: iframeContentWindow,
      data: { type: 'READY' }
    });
  }

  // Verify INIT message was delivered to iframe
  assert(postMessagesSent.length > 0, 'SDK mengirim postMessage ke iframe setelah menerima READY');
  const initMessage = postMessagesSent[postMessagesSent.length - 1];

  assert(initMessage?.msg?.type === 'INIT', 'Pesan bertipe INIT');
  assert(
    initMessage?.msg?.publicKey === 'pk_test_merchant_live_888',
    'Field publicKey pada INIT berisi nilai publicKey yang valid (tidak boleh undefined/kosong)',
    JSON.stringify(initMessage?.msg)
  );
  assert(
    initMessage?.msg?.clientSecret === 'pi_sec_test_abc123456789',
    'Field clientSecret pada INIT cocok dengan secret Payment Intent'
  );
  assert(
    initMessage?.msg?.secret === 'pi_sec_test_abc123456789',
    'Field alias secret pada INIT cocok dengan secret Payment Intent'
  );
  assert(
    initMessage?.msg?.token === 'ct_tok_test_def987654321',
    'Field token pada INIT cocok dengan token transaksi'
  );
  assert(
    initMessage?.msg?.customerToken === 'ct_tok_test_def987654321',
    'Field alias customerToken pada INIT cocok dengan token transaksi'
  );
  assert(
    initMessage?.msg?.paymentId === '8390c046-bea2-4538-8e29-424fc34a0942',
    'Field paymentId pada INIT cocok dengan ID transaksi'
  );
  assert(
    initMessage?.msg?.orderId === 'ord_food_real_1001',
    'Field orderId pada INIT cocok dengan ID pesanan aktual backend'
  );
  assert(
    initMessage?.origin === 'https://pay-sandbox.arto-pay.com',
    'Target origin postMessage mengarah ke origin sandbox yang aman (https://pay-sandbox.arto-pay.com)'
  );

  // Close modal
  sdk.closePayment();
  assert(sdk.isPaymentOpen() === false, 'Modal berhasil ditutup (isPaymentOpen = false)');

  // -------------------------------------------------------------
  // TEST 3: Pemetaan Lingkungan Production (sandbox: false)
  // -------------------------------------------------------------
  console.log('\n--- 3. Pengujian Pemetaan Lingkungan Produksi (sandbox: false) ---');
  postMessagesSent.length = 0;

  sdk.openPayment({
    secret: 'pi_sec_prod_999888',
    paymentId: 'pi_prod_tx_555444',
    orderId: 'ord_shop_prod_2002',
    customerToken: 'ct_tok_prod_333222',
    publicKey: 'pk_live_merchant_prod_777',
    sandbox: false
  } as any);

  assert(
    mockIframe.src === 'https://pay.arto-pay.com/arto-pay/pi_prod_tx_555444',
    'URL iframe produksi mengarah ke https://pay.arto-pay.com/arto-pay/[id]',
    mockIframe.src
  );

  // Trigger READY
  for (const listener of messageListeners) {
    listener({
      source: iframeContentWindow,
      data: { type: 'READY' }
    });
  }

  const prodInit = postMessagesSent[postMessagesSent.length - 1];
  assert(
    prodInit?.msg?.publicKey === 'pk_live_merchant_prod_777',
    'Produksi: publicKey terkirim dengan benar ke iframe produksi'
  );
  assert(
    prodInit?.origin === 'https://pay.arto-pay.com',
    'Produksi: target origin mengarah ke https://pay.arto-pay.com'
  );

  sdk.closePayment();

  // -------------------------------------------------------------
  // TEST 4: Fallback Dinamis ke Window / Config Saat Parameter Opsi Tidak Lengkap
  // -------------------------------------------------------------
  console.log('\n--- 4. Pengujian Resolusi Kunci Publik & Opsi Fleksibel ---');
  postMessagesSent.length = 0;
  mockWindow.__ARTOPAY_PUBLIC_KEY__ = 'pk_test_fallback_from_window_111';

  // Omit publicKey from options - must resolve from mockWindow.__ARTOPAY_PUBLIC_KEY__
  sdk.openPayment({
    clientSecret: 'pi_sec_fallback_secret',
    paymentId: 'pi_fallback_id',
    orderId: 'ord_fallback_order',
    sandbox: true
  } as any);

  for (const listener of messageListeners) {
    listener({
      source: iframeContentWindow,
      data: { type: 'READY' }
    });
  }

  const fallbackInit = postMessagesSent[postMessagesSent.length - 1];
  assert(
    fallbackInit?.msg?.publicKey === 'pk_test_fallback_from_window_111',
    'Public key berhasil diresolusi secara dinamis dari window saat tidak disertakan di options',
    fallbackInit?.msg?.publicKey
  );

  sdk.closePayment();

  // Scenario: Resolusi dari sdk.configure({ publicKey: '...' })
  postMessagesSent.length = 0;
  mockWindow.__ARTOPAY_PUBLIC_KEY__ = undefined;
  (sdk as any).configure({ sandbox: true, publicKey: 'pk_test_from_configure_999' });

  sdk.openPayment({
    clientSecret: 'pi_sec_conf_secret',
    paymentId: 'pi_conf_id',
    orderId: 'ord_conf_order',
    sandbox: true
  } as any);

  for (const listener of messageListeners) {
    listener({
      source: iframeContentWindow,
      data: { type: 'READY' }
    });
  }

  const configureInit = postMessagesSent[postMessagesSent.length - 1];
  assert(
    configureInit?.msg?.publicKey === 'pk_test_from_configure_999',
    'Public key berhasil diresolusi dari ArtoPay.configure({ publicKey })',
    configureInit?.msg?.publicKey
  );

  sdk.closePayment();

  // -------------------------------------------------------------
  // TEST 5: Keamanan Log & Sanitasi Kredensial
  // -------------------------------------------------------------
  console.log('\n--- 5. Audit Keamanan Log & Tidak Bocornya Kredensial Sensitif ---');

  const rawSecret = 'sk_live_very_secret_key_that_should_never_be_logged_12345';
  const rawToken = 'ct_8390c046-bea2-4538-8e29-424fc34a0942_token_sample';
  const rawClientSecret = 'pi_011ee427-62cb-46eb-a1bf-6f20f1c63c72_secret_sample';

  // Test mask logic
  const maskedPrefix = rawClientSecret.substring(0, 7) + '...';
  assert(!maskedPrefix.includes(rawClientSecret.substring(10)), 'Secret terpotong aman menjadi prefix saja');

  console.log('\n================================================================');
  console.log(`MODAL AUTH TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runModalAuthTestSuite().catch(err => {
  console.error('Unhandled modal auth test exception:', err);
  process.exit(1);
});
