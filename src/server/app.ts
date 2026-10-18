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

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[TumpangFood Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Terjadi kesalahan internal pada server Tumpang Food.'
  });
});
