/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Server Universal Entry Point
 * Detects runtime environment:
 * - In Production (or plain "node server.ts"): Loads pre-compiled production bundle (dist/server.cjs)
 * - In Development ("tsx server.ts"): Executes src/server/serverCore.ts with Vite middleware
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const _url = import.meta.url;
const _require = createRequire(_url);
const _filename = fileURLToPath(_url);
const _dirname = path.dirname(_filename);
const distServer = path.resolve(_dirname, 'dist', 'server.cjs');

let app: any;

// If pre-bundled dist/server.cjs exists and we are running under production or plain node, run bundled server directly
if (fs.existsSync(distServer) && (process.env.NODE_ENV === 'production' || !process.env.TSX_VERSION)) {
  const prodMod = _require(distServer);
  app = prodMod.app || prodMod;
} else {
  // Development mode under tsx
  const devMod = await import('./src/server/serverCore');
  app = devMod.app;
}

export { app };
