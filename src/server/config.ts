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

// Determine runtime JWT Secret
let runtimeJwtSecret = process.env.FOOD_AUTH_SECRET;
if (!runtimeJwtSecret || runtimeJwtSecret.trim().length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[TumpangFood Security] FOOD_AUTH_SECRET belum disetel (minimal 32 karakter). Menggunakan kunci aman kriptografi sementara.');
  }
  runtimeJwtSecret = crypto.randomBytes(32).toString('hex');
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_food_db.json')
  : path.join(process.cwd(), 'tumpang_food_db.json');

// Security & Authentication Configuration
let runtimeAdminPassword = process.env.FOOD_ADMIN_PASSWORD;
if (!runtimeAdminPassword && process.env.NODE_ENV !== 'production') {
  runtimeAdminPassword = 'TumpangGoAdmin#2026';
} else if (!runtimeAdminPassword) {
  runtimeAdminPassword = '';
}
let runtimeAdminEmail = process.env.FOOD_ADMIN_EMAIL || 'tumpanggo@gmail.com';

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

  const portVal = parseInt(process.env.PORT || process.env.FOOD_PORT || '3000', 10);
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
  port: parseInt(process.env.PORT || process.env.FOOD_PORT || '3000', 10),
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
let runtimeShopAdminPassword = process.env.SHOP_ADMIN_PASSWORD;
if (!runtimeShopAdminPassword && process.env.NODE_ENV !== 'production') {
  runtimeShopAdminPassword = 'TumpangShopAdmin#2026';
} else if (!runtimeShopAdminPassword) {
  runtimeShopAdminPassword = '';
}
let runtimeShopAuthSecret = process.env.SHOP_AUTH_SECRET;
if (!runtimeShopAuthSecret || runtimeShopAuthSecret.trim().length < 32) {
  runtimeShopAuthSecret = runtimeJwtSecret;
}

export const shopConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  localDbFile: shopDbFile,
  jwtSecret: runtimeShopAuthSecret || 'shop_secret_fallback_key_min_32_chars_ok',
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
