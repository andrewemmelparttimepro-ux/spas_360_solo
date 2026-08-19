import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  deleteStoredLibraryItem,
  supabaseLibraryDeletionStore,
  type LibraryDeleteKind,
} from '../_lib/library-deletion.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const KINDS = new Set<LibraryDeleteKind>(['media_attachment', 'parts_attachment', 'knowledge_document']);

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  return raw?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
    return res.status(500).json({ error: 'Library deletion is not configured' });
  }

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });
  const kind = typeof req.body?.kind === 'string' ? req.body.kind as LibraryDeleteKind : null;
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!kind || !KINDS.has(kind) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'A valid saved file is required' });
  }

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user?.id) return res.status(401).json({ error: 'Invalid or expired session' });
  const { data: profile, error: profileError } = await caller.from('profiles')
    .select('org_id,role').eq('id', auth.user.id).single();
  if (profileError || !profile?.org_id) return res.status(403).json({ error: 'No SPAS 360 profile is attached to this login' });
  if (profile.role !== 'owner_manager') {
    return res.status(403).json({ error: 'Only an owner / manager can delete saved files' });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await deleteStoredLibraryItem(
    supabaseLibraryDeletionStore(service),
    kind,
    id,
    profile.org_id as string,
  );
  if (result.state === 'deleted') return res.status(200).json(result);
  if (result.state === 'partial') return res.status(409).json(result);
  return res.status(result.retryable ? 502 : 404).json(result);
}
