import type { VercelRequest, VercelResponse } from '@vercel/node';

const envValue = (value: string | undefined) => (value || '').trim();
const ELEVENLABS_API_KEY = envValue(process.env.ELEVENLABS_API_KEY);
const ELEVENLABS_VOICE_ID = envValue(process.env.ELEVENLABS_VOICE_ID) || 'pNInz6obpgDQGcFmaJgB';
const ARI_FORWARD_SECRET = envValue(process.env.ARI_FORWARD_SECRET);
const SUPABASE_URL = envValue(process.env.VITE_SUPABASE_URL);
const SUPABASE_ANON = envValue(process.env.VITE_SUPABASE_ANON_KEY);

const SPEECH_WINDOW_MS = 10 * 60 * 1000;
const MAX_SPEECH_REQUESTS = 80;
const speechWindows = new Map<string, { count: number; resetAt: number }>();

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
  const current = speechWindows.get(key);
  if (!current || current.resetAt <= now) {
    speechWindows.set(key, { count: 1, resetAt: now + SPEECH_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_SPEECH_REQUESTS;
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

function speechText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/```[\s\S]*?```/g, ' I included a code block in the written transcript. ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5_000);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Voice is not configured' });

  const isForwardFace = constantTimeEqual(header(req.headers['x-ari-forward-secret']), ARI_FORWARD_SECRET);
  let callerKey: string;
  if (isForwardFace) {
    const ip = header(req.headers['x-forwarded-for']).split(',')[0]?.trim() || 'unknown';
    callerKey = `forward:${ip}`;
  } else {
    const userID = await authenticatedUserID(header(req.headers.authorization));
    if (!userID) return res.status(401).json({ error: 'Invalid or expired session' });
    callerKey = `user:${userID}`;
  }

  if (overLimit(callerKey)) return res.status(429).json({ error: 'Voice is busy. Please wait a moment.' });
  const text = speechText(req.body?.text);
  if (!text) return res.status(400).json({ error: 'Speech text is required' });

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}/stream?output_format=mp3_44100_128&enable_logging=false`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.46,
            similarity_boost: 0.78,
            style: 0.18,
            use_speaker_boost: true,
            speed: 1.03,
          },
        }),
      },
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'Ari could not speak that response' });
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) return res.status(502).json({ error: 'Ari returned empty speech audio' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    return res.status(200).send(audio);
  } catch {
    return res.status(502).json({ error: 'Ari could not speak that response' });
  }
}
