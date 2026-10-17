const fs = require('fs');
const path = require('path');

const envPublicKey = (process.env.VITE_ARTOPAY_PUBLIC_KEY || process.env.ARTOPAY_PUBLIC_KEY || '').trim();
const envKeyExpr = envPublicKey ? JSON.stringify(envPublicKey) : 'undefined';

const targetFiles = [
  path.join(__dirname, '..', 'node_modules', '@arto-pay', 'js-sdk', 'dist', 'arto-pay-sdk.esm.js'),
  path.join(__dirname, '..', 'node_modules', '@arto-pay', 'js-sdk', 'dist', 'arto-pay-sdk.umd.js')
];

targetFiles.forEach(file => {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');

    // 1. Ensure dynamic public key fallback lookup
    code = code.replace(
      /null===\(S=document\.currentScript\)\|\|void 0===S\?void 0:S\.getAttribute\("data-client-key"\)/g,
      `typeof document !== "undefined" ? (document.currentScript?.getAttribute("data-client-key") || (document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") && !document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%") ? document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") : undefined) || (typeof window !== "undefined" ? (window.__ARTOPAY_PUBLIC_KEY__ || window.VITE_ARTOPAY_PUBLIC_KEY) : undefined) || ${envKeyExpr}) : undefined`
    );

    // 2. Ensure openPayment / $ accepts direct publicKey or dynamic lookup
    code = code.replace(
      /if\(!I\)throw new Error\("\[arto-pay\/js-sdk\] Payment publicKey is required"\);/g,
      `const resolvedKey = n.publicKey || I || (typeof window !== "undefined" ? (window.__ARTOPAY_PUBLIC_KEY__ || window.VITE_ARTOPAY_PUBLIC_KEY || (document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") && !document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key")?.startsWith("%") ? document.getElementById("arto-pay-sdk-script")?.getAttribute("data-client-key") : undefined)) : undefined) || ${envKeyExpr}; if(!resolvedKey) throw new Error("[arto-pay/js-sdk] Payment publicKey is required");`
    );

    code = code.replace(
      /,k\(o,r,I,a,p\)/g,
      ',k(o,r,resolvedKey,a,p)'
    );

    fs.writeFileSync(file, code, 'utf8');
    console.log(`[ArtoPay SDK Patch] Successfully patched ${file}`);
  }
});
