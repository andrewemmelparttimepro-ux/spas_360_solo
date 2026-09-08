import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { bearerToken, isProductionSupabaseUrl } from '../_lib/inventory-profits-access.js';
import { authorizeHistoricalSales, historicalSalesMonth, historicalSalesSourceId, HISTORICAL_SALES_FOLDER, MINOT_LOCATION_ID, readHistoricalSales, verifyHistoricalSalesBytes } from '../_lib/historical-sales.js';

// The workbook remains private to Owners Corner. Dashboard users receive only
// the same tenant's monthly sales aggregate, never workbook bytes or commissions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const period = historicalSalesMonth(month);
  if (!period) return res.status(400).json({ error: 'Choose a valid historical sales month.' });
  const token = bearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });
  const url = (process.env.VITE_SUPABASE_URL || '').trim();
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!isProductionSupabaseUrl(url) || !anon || !serviceKey) return res.status(500).json({ error: 'Historical sales are not configured.' });
  const deadline = AbortSignal.timeout(18_000);
  const boundedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init, signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
  });
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };
  const caller = createClient(url, anon, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } } });
  try {
    const authorization = await authorizeHistoricalSales(token, {
      verifyUser: async accessToken => {
        const { data, error } = await caller.auth.getUser(accessToken);
        return error ? null : data.user?.id ?? null;
      },
      loadProfile: async userId => {
        const { data, error } = await caller.from('profiles').select('id,org_id,role').eq('id', userId).single();
        return error ? null : data;
      },
    });
    if (authorization.ok === false) return res.status(authorization.status).json({ error: authorization.error });
    const orgId = authorization.orgId;
    const sourceId = historicalSalesSourceId(orgId, period.year);
    if (!sourceId) return res.status(200).json({ month, locationId: MINOT_LOCATION_ID, sales: null });
    const service = createClient(url, serviceKey, options);
    const { data: record, error } = await service.from('owner_workbooks')
      .select('storage_path,file_size_bytes,current_sha256')
      .eq('org_id', orgId)
      .eq('folder_key', HISTORICAL_SALES_FOLDER)
      // Workbook renames are harmless; duplicates never inflate the total.
      .eq('id', sourceId)
      .maybeSingle();
    if (error) throw new Error('Historical sales could not load.');
    if (!record) throw new Error('The historical sales workbook is missing.');
    if (!record.storage_path.startsWith(`${orgId}/${HISTORICAL_SALES_FOLDER}/`)
      || Number(record.file_size_bytes) <= 0 || Number(record.file_size_bytes) > 20 * 1024 * 1024) throw new Error('Historical sales source could not be verified.');
    const { data: file, error: downloadError } = await service.storage.from('owner-workbooks').download(record.storage_path);
    if (downloadError || !file) throw new Error('The historical sales workbook could not load.');
    const bytes = Buffer.from(await file.arrayBuffer());
    verifyHistoricalSalesBytes(bytes, record);
    const sales = await readHistoricalSales(bytes, month);
    // A known annual source with a missing month is not evidence of zero sales.
    if (!sales) throw new Error('The historical sales workbook is missing this month.');
    return res.status(200).json({ month, locationId: MINOT_LOCATION_ID, sales });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Historical sales could not load.' });
  }
}
