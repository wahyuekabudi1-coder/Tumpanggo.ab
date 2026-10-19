/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Server Core
 * Encapsulates Express server setup, Vite dev middleware, static file serving, and runtime injection.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables early (.env and .env.local)
dotenv.config();
const localEnv = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv, override: true });
}

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './app';
import { foodDb } from './db';
import { foodConfig, artopayConfig, reloadEnv } from './config';

export { app };

export async function startServer() {
  const PORT = foodConfig.port;

  // Initialize and synchronize isolated Tumpang Food database asynchronously
  foodDb.init().catch(err => {
    console.error('[TumpangFood Server] Failed to synchronize Firestore on boot:', err);
  });

  // Vite development middleware vs production static distribution
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasDist) {
    console.log('[TumpangFood Server] Starting Vite development server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    
    // Mount Vite dev server middlewares
    app.use(vite.middlewares);

    // Explicit fallback handler for all client-side navigation routes
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        reloadEnv();
        const pubKey = artopayConfig.publicKey || '';
        const isSandbox = artopayConfig.environment !== 'production';
        const clientConfigScript = 
          `<script id="arto-pay-sdk-script" data-client-key="${pubKey}" data-sandbox="${isSandbox}"></script>\n` +
          `    <script>\n` +
          `      window.__ARTOPAY_PUBLIC_KEY__ = ${JSON.stringify(pubKey)};\n` +
          `      window.VITE_ARTOPAY_PUBLIC_KEY = ${JSON.stringify(pubKey)};\n` +
          `      window.__ARTOPAY_SANDBOX__ = ${isSandbox};\n` +
          `      window.__ARTOPAY_ENVIRONMENT__ = ${JSON.stringify(artopayConfig.environment)};\n` +
          `    </script>`;

        template = template.replace(
          /<script id="arto-pay-sdk-script"[^>]*><\/script>\s*<script>[\s\S]*?<\/script>/,
          clientConfigScript
        );
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    console.log('[TumpangFood Server] Serving production static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint API tidak ditemukan' });
        return;
      }
      try {
        const prodIndexPath = path.join(distPath, 'index.html');
        let template = fs.readFileSync(prodIndexPath, 'utf-8');
        reloadEnv();
        const pubKey = artopayConfig.publicKey || '';
        const isSandbox = artopayConfig.environment !== 'production';
        const clientConfigScript = 
          `<script id="arto-pay-sdk-script" data-client-key="${pubKey}" data-sandbox="${isSandbox}"></script>\n` +
          `    <script>\n` +
          `      window.__ARTOPAY_PUBLIC_KEY__ = ${JSON.stringify(pubKey)};\n` +
          `      window.VITE_ARTOPAY_PUBLIC_KEY = ${JSON.stringify(pubKey)};\n` +
          `      window.__ARTOPAY_SANDBOX__ = ${isSandbox};\n` +
          `      window.__ARTOPAY_ENVIRONMENT__ = ${JSON.stringify(artopayConfig.environment)};\n` +
          `    </script>`;

        template = template.replace(
          /<script id="arto-pay-sdk-script"[^>]*><\/script>\s*<script>[\s\S]*?<\/script>/,
          clientConfigScript
        );
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, foodConfig.host, () => {
    console.log(`[TumpangFood Server] Tumpang Food Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
