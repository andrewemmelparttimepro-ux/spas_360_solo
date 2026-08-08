// Durable rate limiting backed by Postgres (public.consume_rate_limit).
// In-memory Maps reset on every cold start and never share state between
// serverless instances — these limits actually hold.

const envValue = (value: string | undefined, fallback = '') => (value || fallback).trim();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Consume one unit against `key`'s window. Fails OPEN on infrastructure errors
 * (availability beats strictness for staff tools) but logs loudly.
 */
export async function consumeRateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const supabaseUrl = envValue(process.env.VITE_SUPABASE_URL);
  const serviceKey = envValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    console.error('ratelimit: missing Supabase env — allowing request');
    return { allowed: true, retryAfterSeconds: 0 };
  }
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      console.error('ratelimit: rpc failed', resp.status, await resp.text().catch(() => ''));
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const body = (await resp.json()) as { allowed?: boolean; retry_after_seconds?: number };
    return {
      allowed: body.allowed !== false,
      retryAfterSeconds: Number(body.retry_after_seconds) || 0,
    };
  } catch (err) {
    console.error('ratelimit: error — allowing request', err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** First hop of x-forwarded-for — good enough to bucket anonymous website visitors. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw ?? '').split(',')[0].trim() || 'unknown';
}
