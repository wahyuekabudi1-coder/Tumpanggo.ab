/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Server Entry Point
 * Mounts the decoupled Tumpang Food Express app and integrates Vite middlewares.
 */

import path from 'path';
import fs from 'fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './src/server/app';
import { foodDb } from './src/server/db';
import { foodConfig } from './src/server/config';

export { app };

async function startServer() {
  const PORT = foodConfig.port;

  // Initialize and synchronize isolated Tumpang Food database
  foodDb.init().catch(err => {
    console.error('[TumpangFood Server] Failed to synchronize Firestore on boot:', err);
  });

  // Vite development middleware vs production static distribution
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasDist) {
    console.log('[TumpangFood Server] Starting Vite development server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[TumpangFood Server] Serving production static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, foodConfig.host, () => {
    console.log(`[TumpangFood Server] Tumpang Food Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
