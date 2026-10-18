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
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy asynchronous database synchronization middleware for Serverless & Cold-Starts
app.use(async (req, res, next) => {
  try {
    await Promise.all([
      foodDb.ensureInitialized(),
      shopDb.ensureInitialized()
    ]);
    next();
  } catch (err: any) {
    if (foodConfig.isProduction && req.path.startsWith('/api') && !req.path.startsWith('/api/health')) {
      const diag = getFirestoreDiagnosticStatus();
      const sanitizedDetail = typeof err?.message === 'string'
        ? err.message.replace(/(\/Users\/|\/home\/|\/var\/task\/)[^\s]+/g, '[system-path]')
        : 'Database connection failed';

      // Distinguish the exact cause in user-facing message
      let userFacingError = 'Layanan database Cloud Firestore belum terhubung.';
      switch (diag.reason) {
        case 'MISSING_CREDENTIALS':
          userFacingError = 'Layanan database Cloud Firestore belum terhubung: Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.';
          break;
        case 'INVALID_JSON':
          userFacingError = 'Layanan database Cloud Firestore belum terhubung: Format FIREBASE_SERVICE_ACCOUNT_KEY di Vercel tidak dapat diparsing sebagai JSON yang valid.';
          break;
        case 'MALFORMED_SERVICE_ACCOUNT':
          userFacingError = 'Layanan database Cloud Firestore belum terhubung: JSON Service Account tidak lengkap (wajib memiliki field client_email dan private_key yang sah).';
          break;
        case 'PROJECT_ID_MISMATCH':
          userFacingError = `Layanan database Cloud Firestore belum terhubung: Project ID pada Service Account tidak cocok dengan target proyek aplikasi ("${diag.projectId}").`;
          break;
        case 'IAM_PERMISSION_DENIED':
          userFacingError = 'Layanan database Cloud Firestore ditolak oleh Google Cloud IAM (PERMISSION_DENIED): Akun layanan belum memiliki peran Cloud Datastore User (roles/datastore.user).';
          break;
        case 'DATABASE_NOT_FOUND':
          userFacingError = `Layanan database Cloud Firestore belum terhubung: Database Firestore ("${foodConfig.databaseId}") tidak ditemukan pada proyek "${diag.projectId}".`;
          break;
        case 'NETWORK_OR_TIMEOUT':
          userFacingError = 'Layanan database Cloud Firestore mengalami batas waktu koneksi (TIMEOUT) atau gangguan jaringan saat menghubungi server Google Cloud.';
          break;
        case 'INIT_FAILED':
          userFacingError = 'Layanan database Cloud Firestore belum terhubung: Gagal menginisialisasi Firebase Admin SDK dengan kredensial yang diberikan.';
          break;
        default:
          userFacingError = `Layanan database Cloud Firestore belum terhubung: ${diag.detail || 'Koneksi database tidak tersedia.'}`;
      }

      return res.status(503).json({
        error: userFacingError,
        code: 'DATABASE_UNAVAILABLE',
        reason: diag.reason,
        detail: sanitizedDetail,
        remediation: diag.remediation,
        projectId: diag.projectId,
        authIdentity: diag.authIdentity,
        timestamp: new Date().toISOString()
      });
    }
    next();
  }
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
