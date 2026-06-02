import type { VercelRequest, VercelResponse } from '@vercel/node';
import configHandler from '../src/core/api/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return configHandler(req, res);
}
