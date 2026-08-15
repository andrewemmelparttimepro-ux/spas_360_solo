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
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
    return res.status(500).json({ error: 'Password setup is not configured' });
  }

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 10) {
    return res.status(400).json({ error: 'Use at least 10 characters.' });
  }

  const caller = callerClient(token);
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.id) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (user.app_metadata?.must_change_password !== true) {
    return res.status(409).json({ error: 'This account does not require password setup.' });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const appMetadata = {
    ...user.app_metadata,
    must_change_password: false,
    password_changed_at: new Date().toISOString(),
  };
  const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: appMetadata,
  });
  if (updateError) {
    return res.status(400).json({ error: updateError.message || 'Could not update your password.' });
  }

  return res.status(200).json({ complete: true });
}
