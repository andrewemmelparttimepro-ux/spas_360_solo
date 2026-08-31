import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  authorizeInventoryProfits,
  bearerToken,
  inventoryProfitsHeaders,
  isProductionSupabaseUrl,
  type InventoryProfitsProfile,
} from '../_lib/inventory-profits-access.js';

const WORKBOOK_PATH = fileURLToPath(new URL('../_assets/Inventory Profits.xlsx', import.meta.url));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnon = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseAnon || !isProductionSupabaseUrl(supabaseUrl)) {
    return res.status(500).json({ error: 'Inventory Profits delivery is not configured' });
  }

  const token = bearerToken(req.headers.authorization);
  const caller = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const authorization = await authorizeInventoryProfits(token, {
    verifyUser: async accessToken => {
      const { data, error } = await caller.auth.getUser(accessToken);
      return error ? null : data.user?.id ?? null;
    },
    loadProfile: async userId => {
      const { data, error } = await caller.from('profiles')
        .select('id,org_id,role')
        .eq('id', userId)
        .single();
      return error ? null : data as InventoryProfitsProfile;
    },
  });
  if (authorization.ok === false) return res.status(authorization.status).json({ error: authorization.error });

  const workbook = await readFile(WORKBOOK_PATH);
  for (const [name, value] of Object.entries(inventoryProfitsHeaders(workbook.length))) {
    res.setHeader(name, value);
  }
  return res.status(200).send(workbook);
}
