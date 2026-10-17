/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication & RBAC Authorization Module
 * Provides password hashing, token creation/verification, and strict security middleware.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { foodConfig, shopConfig } from './config';

export interface AuthUser {
  userId: string;
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'SHOP_ADMIN';
  email?: string;
  entityId?: string; // Merchant ID or Driver ID
  scope?: 'food' | 'shop';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Hash password using PBKDF2 with random salt.
 * Output format: "pbkdf2$iterations$salt$hash"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

/**
 * Verify password against stored hash or plaintext password.
 * Returns { valid: boolean, needsRehash: boolean }
 */
export function verifyPassword(password: string, storedHash?: string): { valid: boolean; needsRehash: boolean } {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return { valid: false, needsRehash: false };
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];
    const derived = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(originalHash, 'hex'));
    return { valid, needsRehash: false };
  }

  // Legacy match
  const valid = password.trim() === storedHash.trim();
  return { valid, needsRehash: valid };
}

/**
 * Create HMAC-SHA256 signed JWT token.
 */
export function createAuthToken(user: AuthUser, expiresInHours = 72): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', foodConfig.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Create HMAC-SHA256 signed JWT token specifically for Tumpang Shop Admin.
 */
export function createShopAuthToken(user: AuthUser, expiresInHours = 72): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      scope: 'shop',
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', shopConfig.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify signed token and return AuthUser.
 * Checks both Food and Shop cryptographic signatures securely.
 */
export function verifyAuthToken(token: string): AuthUser | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    // Check with food secret first
    const foodSig = crypto
      .createHmac('sha256', foodConfig.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    let isValid = false;
    if (signature.length === foodSig.length) {
      isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(foodSig));
    }

    // If not matching food secret, verify with isolated shop secret
    if (!isValid && shopConfig.jwtSecret) {
      const shopSig = crypto
        .createHmac('sha256', shopConfig.jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');
      if (signature.length === shopSig.length) {
        isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(shopSig));
      }
    }

    if (!isValid) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      userId: data.userId,
      role: data.role,
      email: data.email,
      entityId: data.entityId,
      scope: data.scope
    };
  } catch {
    return null;
  }
}

/**
 * Strict authorization middleware for Tumpang Shop Administrator.
 * Only accepts authenticated users with role 'SHOP_ADMIN'.
 * Food admin credentials cannot access Shop endpoints.
 */
export function requireShopAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Akses ditolak: Autentikasi Admin Tumpang Shop diperlukan. Silakan login terlebih dahulu.' });
  }

  if (user.role !== 'SHOP_ADMIN') {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Administrator Tumpang Shop yang memiliki hak akses untuk tindakan ini.' });
  }

  next();
}

/**
 * Express middleware to authenticate token from headers.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']);
  }

  if (token) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = verified;
    }
  }

  next();
}

/**
 * Check if an email has administrative privileges
 */
export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (
    e === foodConfig.adminEmail ||
    e === 'sawahjayagroup@gmail.com' ||
    e === 'sawahjayatrans@gmail.com' ||
    e === 'admin' ||
    e.endsWith('@tumpanggo.com')
  );
}

/**
 * Strict role-based access control middleware
 */
export function requireRole(allowedRoles: Array<'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'SHOP_ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN') {
      return next(); // Admin has universal access
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: `Akses ditolak: Peran ${user.role} tidak memiliki izin untuk tindakan ini.` });
    }

    next();
  };
}

/**
 * Restrict merchant operations strictly to the verified store owner or admin.
 * Verifies against req.user.entityId from the cryptographically signed token.
 */
export function requireMerchantOwner(paramName = 'merchantId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetMerchantId = req.params[paramName] || req.params.merchantId || req.params.id || req.body[paramName];
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN') {
      return next();
    }

    if (user.role === 'MERCHANT' && (user.entityId === targetMerchantId || user.userId === targetMerchantId)) {
      return next();
    }

    return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses atau memodifikasi data toko ini.' });
  };
}

/**
 * Restrict driver operations strictly to the verified driver themselves or admin.
 */
export function requireDriverSelf(paramName = 'driverId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetDriverId = req.params[paramName] || req.params.driverId || req.params.id || req.body[paramName];
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN') {
      return next();
    }

    if (user.role === 'DRIVER' && (user.entityId === targetDriverId || user.userId === targetDriverId)) {
      return next();
    }

    return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk tugas kurir ini.' });
  };
}
