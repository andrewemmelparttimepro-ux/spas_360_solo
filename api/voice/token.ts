import type { VercelRequest, VercelResponse } from '@vercel/node';

const envValue = (value: string | undefined) => (value || '').trim();
const ELEVENLABS_API_KEY = envValue(process.env.ELEVENLABS_API_KEY);
const ARI_FORWARD_SECRET = envValue(process.env.ARI_FORWARD_SECRET);
const SUPABASE_URL = envValue(process.env.VITE_SUPABASE_URL);
const SUPABASE_ANON = envValue(process.env.VITE_SUPABASE_ANON_KEY);

const TOKEN_WINDOW_MS = 10 * 60 * 1000;
const MAX_TOKENS_PER_WINDOW = 30;
const tokenWindows = new Map<string, { count: number; resetAt: number }>();

function header(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function overLimit(key: string): boolean {
  const now = Date.now();
  const current = tokenWindows.get(key);
  if (!current || current.resetAt <= now) {
    tokenWindows.set(key, { count: 1, resetAt: now + TOKEN_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_TOKENS_PER_WINDOW;
}

async function authenticatedUserID(authHeader: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON || !authHeader) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: unknown };
    return typeof user.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Voice is not configured' });

  const forwardSecret = header(req.headers['x-ari-forward-secret']);
  const isForwardFace = constantTimeEqual(forwardSecret, ARI_FORWARD_SECRET);
  let callerKey: string;

  if (isForwardFace) {
    const ip = header(req.headers['x-forwarded-for']).split(',')[0]?.trim() || 'unknown';
    callerKey = `forward:${ip}`;
  } else {
    const authHeader = header(req.headers.authorization);
    const userID = await authenticatedUserID(authHeader);
    if (!userID) return res.status(401).json({ error: 'Invalid or expired session' });
    callerKey = `user:${userID}`;
  }

  if (overLimit(callerKey)) {
    return res.status(429).json({ error: 'Voice has started several times. Please wait a moment and try again.' });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    const body = (await response.json().catch(() => ({}))) as { token?: unknown };
    if (!response.ok || typeof body.token !== 'string' || !body.token) {
      return res.status(502).json({ error: 'Voice transcription is unavailable right now' });
    }
    return res.status(200).json({ token: body.token, expires_in: 900 });
  } catch {
    return res.status(502).json({ error: 'Voice transcription is unavailable right now' });
  }
}
