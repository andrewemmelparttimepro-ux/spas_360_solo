import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMigrationCallback } from '../_lib/migration-callback.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleMigrationCallback('jobber', req, res);
}
