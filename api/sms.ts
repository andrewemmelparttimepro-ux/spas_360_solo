import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Outbound SMS: the app posts {to, body}, we verify the caller's Supabase JWT,
 * then send through Twilio from the business number. The client records the
 * message row itself (RLS-scoped) after a successful send.
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM; // e.g. +17019299194
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;

/** Normalize a stored phone ("701-555-1001") to E.164 (+17015551001). */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length > 10) return `+${digits}`;
  return null;
}

export async function sendText(to: string, body: string): Promise<
  { ok: true; sid: string; status: string } |
  { ok: false; statusCode: number; error: string; configurationGap?: boolean }
> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return {
      ok: false,
      statusCode: 500,
      error: 'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.',
      configurationGap: true,
    };
  }
  const e164 = toE164(to);
  if (!e164) return { ok: false, statusCode: 400, error: `Can't parse phone number "${to}"` };

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: e164, From: TWILIO_FROM, Body: body.trim() }),
    }
  );
  const data = await twilioRes.json();
  if (!twilioRes.ok) {
    return { ok: false, statusCode: twilioRes.status, error: data?.message ?? 'Twilio send failed' };
  }
  return { ok: true, sid: data.sid, status: data.status };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the Supabase JWT — only signed-in staff can use the business number
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SUPABASE_ANON) return res.status(401).json({ error: 'Missing authorization' });
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!authRes.ok) return res.status(401).json({ error: 'Invalid session' });

  const { to, body } = req.body as { to?: string; body?: string };
  if (!to || !body?.trim()) return res.status(400).json({ error: 'Missing to/body' });
  const result = await sendText(to, body);
  if ('error' in result) return res.status(result.statusCode).json({ error: result.error });
  return res.status(200).json({ sid: result.sid, status: result.status });
}
