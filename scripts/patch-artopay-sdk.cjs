const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const envPublicKey = (process.env.VITE_ARTOPAY_PUBLIC_KEY || process.env.ARTOPAY_PUBLIC_KEY || '').trim();
const envKeyExpr = envPublicKey ? JSON.stringify(envPublicKey) : 'undefined';

const tgzPath = path.join(__dirname, '..', 'arto-pay-js-sdk-1.0.4.tgz');
const sdkDistDir = path.join(__dirname, '..', 'node_modules', '@arto-pay', 'js-sdk', 'dist');
const esmFile = path.join(sdkDistDir, 'arto-pay-sdk.esm.js');
const umdFile = path.join(sdkDistDir, 'arto-pay-sdk.umd.js');
const dtsFile = path.join(sdkDistDir, 'types.d.ts');

if (!fs.existsSync(sdkDistDir)) {
  console.log('[ArtoPay SDK Patch] node_modules/@arto-pay/js-sdk not present, skipping patch.');
  process.exit(0);
}

// 1. Restore pristine files from tarball if available to ensure deterministic, idempotent patching
if (fs.existsSync(tgzPath)) {
  try {
    const esmPristine = cp.execSync(`tar -xOf "${tgzPath}" package/dist/arto-pay-sdk.esm.js`).toString();
    fs.writeFileSync(esmFile, esmPristine, 'utf8');
    const umdPristine = cp.execSync(`tar -xOf "${tgzPath}" package/dist/arto-pay-sdk.umd.js`).toString();
    fs.writeFileSync(umdFile, umdPristine, 'utf8');
    const dtsPristine = cp.execSync(`tar -xOf "${tgzPath}" package/dist/types.d.ts`).toString();
    fs.writeFileSync(dtsFile, dtsPristine, 'utf8');
    console.log('[ArtoPay SDK Patch] Restored pristine SDK files from arto-pay-js-sdk-1.0.4.tgz.');
  } catch (err) {
    console.warn('[ArtoPay SDK Patch] Warning reading pristine tarball:', err.message);
  }
}

// 2. Patch ESM distribution
if (fs.existsSync(esmFile)) {
  let esmCode = fs.readFileSync(esmFile, 'utf8');

  // 2.1 Replace static currentScript client-key extraction with dynamic helper
  esmCode = esmCode.replace(
    /null===\([A-Za-z0-9_$]+=document\.currentScript\)\|\|void 0===[A-Za-z0-9_$]+\?void 0:[A-Za-z0-9_$]+\.getAttribute\("data-client-key"\)/g,
    `typeof document !== "undefined" ? (document.currentScript?.getAttribute("data-client-key") || (document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") && !document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%") ? document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") : undefined) || (typeof window !== "undefined" ? (window.__ARTOPAY_PUBLIC_KEY__ || window.VITE_ARTOPAY_PUBLIC_KEY) : undefined) || ${envKeyExpr}) : undefined`
  );

  // 2.2 Guard top-level document.currentScript for data-sandbox
  esmCode = esmCode.replace(
    /null===\([A-Za-z0-9_$]+=document\.currentScript\)\|\|void 0===[A-Za-z0-9_$]+\?void 0:[A-Za-z0-9_$]+\.getAttribute\("data-sandbox"\)/g,
    'typeof document !== "undefined" ? (document.currentScript?.getAttribute("data-sandbox")) : undefined'
  );

  // 2.3 Comprehensive openPayment handler rewrite in ESM
  const targetA = `function A(n){if(t())return void console.warn("[arto-pay/js-sdk] Payment modal is already open");const{clientSecret:o,paymentId:a,token:r,onSuccess:i,onPending:d,onError:l,onClose:c,sandbox:u=!1,orderId:p}=n;if(!o)throw new Error("[arto-pay/js-sdk] Payment clientSecret is required");if(!a)throw new Error("[arto-pay/js-sdk] Payment paymentId is required");if(!p)throw new Error("[arto-pay/js-sdk] Payment orderId is required");if(!I)throw new Error("[arto-pay/js-sdk] Payment publicKey is required");var m;s({sandbox:u}),m={onSuccess:i,onPending:d,onError:l,onClose:c},e.callbacks=m,E(o,a,I,r,p)}`;

  const replacementA = `function A(n){if(t())return void console.warn("[arto-pay/js-sdk] Payment modal is already open");const cbSuccess=n&&n.onSuccess;const cbPending=n&&n.onPending;const cbError=n&&n.onError;const cbClose=n&&n.onClose;const resolvedSecret=(n&&(n.clientSecret||n.secret))||"";if(!resolvedSecret)throw new Error("[arto-pay/js-sdk] Payment clientSecret is required");const resolvedPaymentId=(n&&(n.paymentId||n.paymentIntentId||n.id))||"";if(!resolvedPaymentId)throw new Error("[arto-pay/js-sdk] Payment paymentId is required");const resolvedOrderId=(n&&(n.orderId||n.order_id))||"";if(!resolvedOrderId)throw new Error("[arto-pay/js-sdk] Payment orderId is required");const resolvedToken=(n&&(n.token||n.customerToken))||undefined;const dynamicKey=(typeof window!=="undefined"?(window.__ARTOPAY_PUBLIC_KEY__||window.VITE_ARTOPAY_PUBLIC_KEY||(document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")&&!document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%")?document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key"):undefined)):undefined);const resolvedKey=(n&&(n.publicKey||n.clientKey))||dynamicKey||I||${envKeyExpr};if(!resolvedKey)throw new Error("[arto-pay/js-sdk] Payment publicKey is required");const isOptionSandbox=(n&&typeof n.sandbox==="boolean")?n.sandbox:undefined;const isScriptSandbox=(typeof document!=="undefined"&&document.getElementById("arto-pay-sdk-script")?.getAttribute("data-sandbox")==="false"?false:undefined);const isWindowSandbox=(typeof window!=="undefined"&&typeof window.__ARTOPAY_SANDBOX__==="boolean")?window.__ARTOPAY_SANDBOX__:undefined;const resolvedSandbox=isOptionSandbox!==undefined?isOptionSandbox:(isWindowSandbox!==undefined?isWindowSandbox:(isScriptSandbox!==undefined?isScriptSandbox:true));s({sandbox:resolvedSandbox});e.callbacks={onSuccess:cbSuccess,onPending:cbPending,onError:cbError,onClose:cbClose};E(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)}`;

  if (esmCode.includes(targetA)) {
    esmCode = esmCode.replace(targetA, replacementA);
  } else {
    // Regex fallback if whitespace differs
    esmCode = esmCode.replace(
      /function A\(n\)\{if\(t\(\)\)return void console\.warn\("\[arto-pay\/js-sdk\] Payment modal is already open"\);[\s\S]+?E\([^)]+\)\}/,
      replacementA
    );
  }

  // 2.4 Sanity check for ESM
  if (!esmCode.includes('E(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)')) {
    throw new Error('[ArtoPay SDK Patch] Fatal: Failed to patch E() call with resolvedKey in ESM distribution!');
  }

  fs.writeFileSync(esmFile, esmCode, 'utf8');
  console.log(`[ArtoPay SDK Patch] Successfully patched ESM: ${esmFile}`);
}

// 3. Patch UMD distribution
if (fs.existsSync(umdFile)) {
  let umdCode = fs.readFileSync(umdFile, 'utf8');

  umdCode = umdCode.replace(
    /null===\([A-Za-z0-9_$]+=document\.currentScript\)\|\|void 0===[A-Za-z0-9_$]+\?void 0:[A-Za-z0-9_$]+\.getAttribute\("data-client-key"\)/g,
    `typeof document !== "undefined" ? (document.currentScript?.getAttribute("data-client-key") || (document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") && !document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%") ? document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") : undefined) || (typeof window !== "undefined" ? (window.__ARTOPAY_PUBLIC_KEY__ || window.VITE_ARTOPAY_PUBLIC_KEY) : undefined) || ${envKeyExpr}) : undefined`
  );

  umdCode = umdCode.replace(
    /null===\([A-Za-z0-9_$]+=document\.currentScript\)\|\|void 0===[A-Za-z0-9_$]+\?void 0:[A-Za-z0-9_$]+\.getAttribute\("data-sandbox"\)/g,
    'typeof document !== "undefined" ? (document.currentScript?.getAttribute("data-sandbox")) : undefined'
  );

  const targetT = `function T(n){if(o())return void console.warn("[arto-pay/js-sdk] Payment modal is already open");const{clientSecret:e,paymentId:a,token:r,onSuccess:i,onPending:d,onError:s,onClose:c,sandbox:u=!1,orderId:p}=n;if(!e)throw new Error("[arto-pay/js-sdk] Payment clientSecret is required");if(!a)throw new Error("[arto-pay/js-sdk] Payment paymentId is required");if(!p)throw new Error("[arto-pay/js-sdk] Payment orderId is required");if(!A)throw new Error("[arto-pay/js-sdk] Payment publicKey is required");var m;l({sandbox:u}),m={onSuccess:i,onPending:d,onError:s,onClose:c},t.callbacks=m,k(e,a,A,r,p)}`;

  const replacementT = `function T(n){if(o())return void console.warn("[arto-pay/js-sdk] Payment modal is already open");const cbSuccess=n&&n.onSuccess;const cbPending=n&&n.onPending;const cbError=n&&n.onError;const cbClose=n&&n.onClose;const resolvedSecret=(n&&(n.clientSecret||n.secret))||"";if(!resolvedSecret)throw new Error("[arto-pay/js-sdk] Payment clientSecret is required");const resolvedPaymentId=(n&&(n.paymentId||n.paymentIntentId||n.id))||"";if(!resolvedPaymentId)throw new Error("[arto-pay/js-sdk] Payment paymentId is required");const resolvedOrderId=(n&&(n.orderId||n.order_id))||"";if(!resolvedOrderId)throw new Error("[arto-pay/js-sdk] Payment orderId is required");const resolvedToken=(n&&(n.token||n.customerToken))||undefined;const dynamicKey=(typeof window!=="undefined"?(window.__ARTOPAY_PUBLIC_KEY__||window.VITE_ARTOPAY_PUBLIC_KEY||(document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")&&!document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%")?document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key"):undefined)):undefined);const resolvedKey=(n&&(n.publicKey||n.clientKey))||dynamicKey||A||${envKeyExpr};if(!resolvedKey)throw new Error("[arto-pay/js-sdk] Payment publicKey is required");const isOptionSandbox=(n&&typeof n.sandbox==="boolean")?n.sandbox:undefined;const isScriptSandbox=(typeof document!=="undefined"&&document.getElementById("arto-pay-sdk-script")?.getAttribute("data-sandbox")==="false"?false:undefined);const isWindowSandbox=(typeof window!=="undefined"&&typeof window.__ARTOPAY_SANDBOX__==="boolean")?window.__ARTOPAY_SANDBOX__:undefined;const resolvedSandbox=isOptionSandbox!==undefined?isOptionSandbox:(isWindowSandbox!==undefined?isWindowSandbox:(isScriptSandbox!==undefined?isScriptSandbox:true));l({sandbox:resolvedSandbox});t.callbacks={onSuccess:cbSuccess,onPending:cbPending,onError:cbError,onClose:cbClose};k(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)}`;

  if (umdCode.includes(targetT)) {
    umdCode = umdCode.replace(targetT, replacementT);
  } else {
    umdCode = umdCode.replace(
      /function T\(n\)\{if\(o\(\)\)return void console\.warn\("\[arto-pay\/js-sdk\] Payment modal is already open"\);[\s\S]+?k\([^)]+\)\}/,
      replacementT
    );
  }

  if (!umdCode.includes('k(resolvedSecret,resolvedPaymentId,resolvedKey,resolvedToken,resolvedOrderId)')) {
    throw new Error('[ArtoPay SDK Patch] Fatal: Failed to patch k() call with resolvedKey in UMD distribution!');
  }

  fs.writeFileSync(umdFile, umdCode, 'utf8');
  console.log(`[ArtoPay SDK Patch] Successfully patched UMD: ${umdFile}`);
}

// 4. Patch types.d.ts to recognize publicKey, secret, customerToken on OpenPaymentOptions
if (fs.existsSync(dtsFile)) {
  let dtsCode = fs.readFileSync(dtsFile, 'utf8');
  const targetOptions = `export interface OpenPaymentOptions extends PaymentCallbacks {
    token?: string;
    clientSecret: string;
    paymentId: string;
    sandbox?: boolean;
    orderId: string;
}`;
  const replacementOptions = `export interface OpenPaymentOptions extends PaymentCallbacks {
    token?: string;
    customerToken?: string;
    clientSecret: string;
    secret?: string;
    paymentId: string;
    paymentIntentId?: string;
    sandbox?: boolean;
    orderId: string;
    publicKey?: string;
    clientKey?: string;
}`;
  if (dtsCode.includes(targetOptions)) {
    dtsCode = dtsCode.replace(targetOptions, replacementOptions);
    fs.writeFileSync(dtsFile, dtsCode, 'utf8');
    console.log(`[ArtoPay SDK Patch] Successfully patched types: ${dtsFile}`);
  }
}

console.log('[ArtoPay SDK Patch] All SDK patches applied and verified successfully.');
