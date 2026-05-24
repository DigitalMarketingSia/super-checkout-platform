import type { VercelRequest, VercelResponse } from '@vercel/node';
import healthHandler from '../src/core/api/health.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return healthHandler(req, res);
}
