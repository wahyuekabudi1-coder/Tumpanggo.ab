/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Express Application
 * Decoupled and modular backend application assembly.
 */

import express from 'express';
import { foodDb } from './db';
import { shopDb } from './shopDb';
import { foodConfig } from './config';
import { isFirestoreAdminConfigured, isUsingServiceAccount, testFirestoreConnection, getFirestoreDiagnosticStatus } from './firebaseAdmin';
import { authenticateToken } from './auth';
import { authRouter } from './routes/authRoutes';
import { merchantRouter } from './routes/merchantRoutes';
import { driverRouter } from './routes/driverRoutes';
import { orderRouter } from './routes/orderRoutes';
import { adminRouter } from './routes/adminRoutes';
import { shopRouter } from './routes/shopRoutes';
import { artopayRouter } from './routes/artopayRoutes';

export const app = express();

// Safe Request Diagnostics & Tracking Middleware
app.use((req: any, res, next) => {
  const reqId = req.headers['x-request-id'] || 'req_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  req.id = String(reqId);
  res.setHeader('X-Request-Id', req.id);

  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const logFn = status >= 500 ? console.error : (status >= 400 ? console.warn : console.log);
      logFn(`[API] [${req.id}] ${req.method} ${req.path} -> ${status} (${duration}ms)`);
    });
  }
  next();
});

// Global body parsers (limit 15mb for base64 image uploads)
app.use(express.json({
  limit: '15mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf-8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy asynchronous database synchronization middleware for Serverless & Cold-Starts
app.use(async (req, res, next) => {
  try {
    await Promise.all([
      foodDb.ensureInitialized(),
      shopDb.ensureInitialized()
    ]);
  } catch (err: any) {
    console.warn('[TumpangFood Database Sync Warning]', err?.message || err);
  }
  next();
});

// Attach user authentication from tokens or headers
app.use(authenticateToken);

// Health check endpoint - Distinguishes server process vitality from database readiness
app.get('/api/health', async (req, res) => {
  try {
    const [foodStorageStatus, shopStorageStatus] = await Promise.all([
      foodDb.getStorageStatus(),
      shopDb.getStorageStatus()
    ]);
    const isHealthy = foodStorageStatus.liveCloudConnected;
    const isProd = foodConfig.isProduction;

    res.status(isProd && !isHealthy ? 503 : 200).json({
      status: isHealthy ? 'healthy' : (isProd ? 'database_disconnected' : 'ok_development_resilient_mode'),
      server: 'online',
      database: isHealthy ? 'connected' : 'disconnected',
      system: 'tumpang-go-ecosystem',
      environment: process.env.NODE_ENV || 'development',
      diagnosticReason: foodStorageStatus.diagnosticReason,
      diagnosticDetail: foodStorageStatus.diagnosticDetail,
      remediationStep: foodStorageStatus.remediationStep,
      foodDatabase: foodStorageStatus,
      shopDatabase: shopStorageStatus,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[TumpangFood Health Check Error]', err);
    res.status(500).json({
      status: 'error',
      server: 'online',
      database: 'error',
      system: 'tumpang-food',
      error: 'Health check diagnostic encountered an internal error.',
      timestamp: new Date().toISOString()
    });
  }
});

// Dedicated Firestore Connection Probe endpoint for on-demand validation
app.get('/api/health/firestore-probe', async (req, res) => {
  try {
    const probe = await testFirestoreConnection();
    res.status(probe.connected ? 200 : 503).json({
      system: 'tumpang-food',
      probeOrigin: 'Dedicated Admin SDK Diagnostic Probe',
      result: probe,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[TumpangFood Probe Error]', err);
    res.status(500).json({
      system: 'tumpang-food',
      error: err.message || 'Diagnostic probe error',
      timestamp: new Date().toISOString()
    });
  }
});

// Mount decoupled routers
app.use('/api', authRouter);
app.use('/api/merchants', merchantRouter);
app.use('/api/drivers', driverRouter);
app.use('/api/orders', orderRouter);
app.use('/api', adminRouter);
app.use('/api/shop', shopRouter);
app.use('/api/artopay', artopayRouter);

// 404 handler for unhandled API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} tidak ditemukan.` });
});

// Global Error Handler with Safe Internal Diagnostics
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (req as any).id || 'req_unknown';
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  
  // Log internal diagnostic details safely to server console only (never to browser)
  console.error(`[TumpangFood Server Error] [ReqID: ${reqId}] ${req.method} ${req.originalUrl} -> HTTP ${status}`);
  if (err.stack) {
    console.error(`[TumpangFood StackTrace] [ReqID: ${reqId}]:\n${err.stack}`);
  } else {
    console.error(`[TumpangFood ErrorDetails] [ReqID: ${reqId}]:`, err);
  }

  // Provide safe, user-friendly frontend message without exposing sensitive internals
  let safeMessage = 'Terjadi kesalahan internal pada server Tumpang Food.';
  if (status === 404) {
    safeMessage = err.message || 'Data atau endpoint tidak ditemukan.';
  } else if (status === 400 || status === 422) {
    safeMessage = err.message || 'Permintaan tidak valid.';
  } else if (status === 401 || status === 403) {
    safeMessage = err.message || 'Akses tidak diizinkan.';
  } else if (req.path === '/api/merchants' || req.path.startsWith('/api/merchants')) {
    safeMessage = 'Gagal memuat daftar toko kuliner dari database server.';
  }

  res.status(status).json({
    error: safeMessage,
    code: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    requestId: reqId
  });
});
