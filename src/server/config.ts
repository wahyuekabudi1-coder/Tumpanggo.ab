/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Configuration Module
 * Isolates runtime environment variables, database identifiers, and system defaults.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

// Determine runtime JWT Secret
let runtimeJwtSecret = (process.env.FOOD_AUTH_SECRET || '').trim();
if (!runtimeJwtSecret || runtimeJwtSecret.length < 32) {
  runtimeJwtSecret = 'dev_secret_fallback_do_not_use_in_prod_min_32_characters_long';
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_food_db.json')
  : path.join(process.cwd(), 'tumpang_food_db.json');

// Security & Authentication Configuration
let runtimeAdminPassword = (process.env.FOOD_ADMIN_PASSWORD || 'TumpangGoAdmin#2026').trim();
let runtimeAdminEmail = (process.env.FOOD_ADMIN_EMAIL || 'tumpanggo@gmail.com').trim().toLowerCase();

function resolveServerPort(): number {
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (process.env.FOOD_PORT) {
    const parsed = parseInt(process.env.FOOD_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

// Production Strict Verification
export function validateProductionEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const secret = process.env.FOOD_AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    errors.push('FOOD_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter.');
  } else if (secret.includes('dev_secret_fallback') || secret.includes('fallback_do_not_use')) {
    errors.push('FOOD_AUTH_SECRET tidak boleh menggunakan string fallback/development pada mode produksi.');
  }

  const adminEmail = process.env.FOOD_ADMIN_EMAIL;
  if (!adminEmail || !adminEmail.includes('@')) {
    errors.push('FOOD_ADMIN_EMAIL wajib disetel dengan alamat email yang sah.');
  }

  const adminPassword = process.env.FOOD_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim().length < 8) {
    errors.push('FOOD_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter.');
  } else if (adminPassword === 'TumpangGoAdmin#2026') {
    errors.push('FOOD_ADMIN_PASSWORD tidak boleh menggunakan kata sandi default/contoh ("TumpangGoAdmin#2026") pada mode produksi.');
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;
  if (!projectId) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        projectId = raw.projectId;
      }
    } catch {}
  }
  if (!projectId || projectId.trim().length === 0) {
    errors.push('FIREBASE_PROJECT_ID wajib disetel pada lingkungan produksi.');
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount || serviceAccount.trim().length === 0) {
    errors.push('FIREBASE_SERVICE_ACCOUNT_KEY wajib disetel untuk otentikasi Firebase Admin SDK pada lingkungan produksi.');
  } else {
    // Validate format without leaking contents
    const raw = serviceAccount.trim();
    let parsed: any = null;
    try {
      let cleanRaw = raw;
      if ((cleanRaw.startsWith("'") && cleanRaw.endsWith("'")) || (cleanRaw.startsWith('"') && cleanRaw.endsWith('"'))) {
        cleanRaw = cleanRaw.slice(1, -1);
      }
      if (cleanRaw.startsWith('{')) {
        parsed = JSON.parse(cleanRaw);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(raw)) {
        parsed = JSON.parse(fs.readFileSync(raw, 'utf-8'));
      } else {
        const decoded = Buffer.from(cleanRaw, 'base64').toString('utf-8');
        if (decoded.trim().startsWith('{')) {
          parsed = JSON.parse(decoded);
        }
      }
    } catch {
      // Ignored here, checked below
    }

    if (!parsed || typeof parsed !== 'object') {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY tidak berformat JSON atau Base64 yang valid.');
    } else if (!parsed.client_email || !parsed.private_key) {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY wajib memiliki field "client_email" dan "private_key".');
    }
  }

  const shopSecret = process.env.SHOP_AUTH_SECRET;
  if (!shopSecret || shopSecret.trim().length < 32) {
    errors.push('SHOP_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter untuk Tumpang Shop.');
  } else if (shopSecret.includes('shop_secret_fallback') || shopSecret.includes('fallback_key')) {
    errors.push('SHOP_AUTH_SECRET tidak boleh menggunakan string fallback/development pada mode produksi.');
  }

  const shopAdminEmail = process.env.SHOP_ADMIN_EMAIL;
  if (!shopAdminEmail || !shopAdminEmail.includes('@')) {
    errors.push('SHOP_ADMIN_EMAIL wajib disetel dengan alamat email yang sah untuk Tumpang Shop.');
  }

  const shopAdminPassword = process.env.SHOP_ADMIN_PASSWORD;
  if (!shopAdminPassword || shopAdminPassword.trim().length < 8) {
    errors.push('SHOP_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter untuk Tumpang Shop.');
  } else if (shopAdminPassword === 'TumpangShopAdmin#2026') {
    errors.push('SHOP_ADMIN_PASSWORD tidak boleh menggunakan kata sandi default/contoh ("TumpangShopAdmin#2026") pada mode produksi.');
  }

  const portVal = resolveServerPort();
  if (isNaN(portVal) || portVal < 1 || portVal > 65535) {
    errors.push('PORT atau FOOD_PORT harus berupa angka port TCP yang valid (1-65535).');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

if (process.env.NODE_ENV === 'production') {
  const check = validateProductionEnvironment();
  if (!check.isValid) {
    console.warn(`[TumpangFood Security] Peringatan konfigurasi produksi:\n- ${check.errors.join('\n- ')}`);
  }
}

export const foodConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  // Server port
  port: resolveServerPort(),
  host: '0.0.0.0',
  isServerless,

  // Database settings
  databaseId: (() => {
    const rawEnv = (process.env.FOOD_DATABASE_ID || '').trim();
    if (rawEnv && rawEnv !== 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c') {
      return rawEnv;
    }
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (rawConfig.firestoreDatabaseId && rawConfig.firestoreDatabaseId !== 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c') {
          return rawConfig.firestoreDatabaseId;
        }
      }
    } catch {}
    return '(default)';
  })(),
  localDbFile,
  legacyDbFile: path.join(process.cwd(), 'tumpang_db.json'),
  
  // Security & Authentication
  jwtSecret: runtimeJwtSecret || 'dev_secret_fallback_do_not_use_in_prod',
  adminEmail: runtimeAdminEmail.toLowerCase(),
  adminPassword: runtimeAdminPassword,
  
  // System operational defaults
  defaults: {
    serviceFee: 2000,
    deliveryFeePerKm: 1500,
    defaultDeliveryFee: 5000,
    commissionPercent: 10,
    paymentExpiryMinutes: 10,
    qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  }
};

// --- TUMPANG SHOP ISOLATED CONFIGURATION ---
const shopDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_shop_db.json')
  : path.join(process.cwd(), 'tumpang_shop_db.json');

const runtimeShopAdminEmail = (process.env.SHOP_ADMIN_EMAIL || 'shopadmin@tumpanggo.com').toLowerCase().trim();
let runtimeShopAdminPassword = (process.env.SHOP_ADMIN_PASSWORD || 'TumpangShopAdmin#2026').trim();
let runtimeShopAuthSecret = (process.env.SHOP_AUTH_SECRET || '').trim();
if (!runtimeShopAuthSecret || runtimeShopAuthSecret.length < 32) {
  runtimeShopAuthSecret = 'shop_secret_fallback_dev_min_32_characters_ok';
}

export const shopConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  localDbFile: shopDbFile,
  jwtSecret: runtimeShopAuthSecret || (process.env.NODE_ENV === 'production' ? '' : 'shop_secret_fallback_dev_min_32_characters_ok'),
  adminEmail: runtimeShopAdminEmail,
  adminPassword: runtimeShopAdminPassword,
  collections: {
    config: 'shop_config',
    categories: 'shop_categories',
    products: 'shop_products',
    orders: 'shop_orders',
    shipments: 'shop_shipments',
    auditLogs: 'shop_audit_logs',
  },
  defaults: {
    storeName: 'Tumpang Shop Mart',
    storeAddress: 'Area Pasar Tumpang, Kec. Tumpang, Malang',
    storePhone: '081234567890',
    isOpen: true,
    qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
    defaultDeliveryFee: 4000,
    serviceFee: 1500,
    minOrderAmount: 10000,
    paymentExpiryMinutes: 30,
  }
};

export function reloadEnv() {
  dotenv.config();
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true });
  }
}

// --- ARTOPAY UNIFIED PAYMENT GATEWAY CONFIGURATION ---
export const artopayConfig = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  get environment(): 'sandbox' | 'production' {
    const env = (process.env.ARTOPAY_ENVIRONMENT || process.env.ARTOPAY_ENV || 'sandbox').toLowerCase().trim();
    return env === 'production' ? 'production' : 'sandbox';
  },
  get apiKey(): string {
    let key = (process.env.ARTOPAY_API_KEY || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get secretKey(): string {
    let key = (process.env.ARTOPAY_SECRET_KEY || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get publicKey(): string {
    let key = (
      process.env.ARTOPAY_PUBLIC_KEY || 
      process.env.VITE_ARTOPAY_PUBLIC_KEY || 
      process.env.ARTOPAY_CLIENT_KEY || 
      process.env.VITE_ARTOPAY_CLIENT_KEY || 
      ''
    ).trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    if (key.startsWith('%') || key.includes('%VITE_') || key === 'undefined' || key === 'null') {
      return '';
    }
    return key;
  },
  get webhookSecret(): string {
    let key = (process.env.ARTOPAY_WEBHOOK_SECRET || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get businessUnitCode(): string {
    let key = (process.env.ARTOPAY_BUSINESS_UNIT_CODE || process.env.ARTOPAY_BUSINESS_UNIT || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get baseUrl(): string {
    const defaultApiUrl = this.environment === 'production'
      ? 'https://api.arto-pay.com'
      : 'https://api-sandbox.arto-pay.com';
    return (process.env.ARTOPAY_API_BASE_URL || process.env.ARTOPAY_BASE_URL || defaultApiUrl).trim();
  },
  get payBaseUrl(): string {
    const defaultPayUrl = this.environment === 'production'
      ? 'https://pay.arto-pay.com/arto-pay'
      : 'https://pay-sandbox.arto-pay.com/arto-pay';
    return (process.env.ARTOPAY_PAY_URL || defaultPayUrl).trim();
  },
  defaultExpiryMinutes: 15
};

