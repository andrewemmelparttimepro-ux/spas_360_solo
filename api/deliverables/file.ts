import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  return raw?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}
function callerClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
    return res.status(500).json({ error: 'Artifact delivery is not configured' });
  }

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'A valid deliverable id is required' });

  const caller = callerClient(token);
  const { data: userData } = await caller.auth.getUser(token);
  if (!userData.user?.id) return res.status(401).json({ error: 'Invalid or expired session' });

  const { data: deliverable, error } = await caller
    .from('agent_deliverables')
    .select('id, status, storage_bucket, storage_path, file_name, mime_type, file_size_bytes')
    .eq('id', id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not authorize artifact access' });
  if (!deliverable) return res.status(404).json({ error: 'Artifact not found' });
  if (deliverable.status !== 'ready' || !deliverable.storage_bucket || !deliverable.storage_path) {
    return res.status(409).json({ error: 'This artifact is not ready for delivery' });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const expiresIn = 300;
  const { data: signed, error: signedError } = await service.storage
    .from(deliverable.storage_bucket)
    .createSignedUrl(deliverable.storage_path, expiresIn, {
      download: typeof req.query.download === 'string' && req.query.download === '1'
        ? deliverable.file_name || true
        : false,
    });
  if (signedError || !signed?.signedUrl) return res.status(500).json({ error: 'Could not open the artifact file' });

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    url: signed.signedUrl,
    file_name: deliverable.file_name,
    mime_type: deliverable.mime_type,
    file_size_bytes: deliverable.file_size_bytes,
    expires_in: expiresIn,
  });
}
