import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../src/server/app';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Unhandled Error]', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Terjadi kesalahan pada serverless handler.', code: 'SERVERLESS_HANDLER_ERROR' }));
    }
  }
}

export { app };


