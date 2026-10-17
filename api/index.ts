import type { IncomingMessage, ServerResponse } from 'http';
import { app } from './_app.cjs';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}

export { app };

