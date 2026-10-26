import { HttpError } from '../utils/errors.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
    return res.status(415).json({ error: 'Unsupported request encoding' });
  }
  if (['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) {
    return res.status(503).json({ error: 'Database unavailable' });
  }
  // Log only safe classifications, never query text, credentials or request bodies.
  console.error('Request failed', { name: error.name, code: error.code });
  return res.status(500).json({ error: 'Internal server error' });
}
