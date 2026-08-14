// Durable rate limiting backed by Postgres (public.consume_rate_limit).
// In-memory Maps reset on every cold start and never share state between
// serverless instances — these limits actually hold.

const envValue = (value: string | undefined, fallback = '') => (value || fallback).trim();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Staff tools may remain available during a limiter outage. Public or
   * consequential endpoints must use the default fail-closed behavior. */
  failOpen?: boolean;
}

/**
 * Consume one unit against `key`'s window. Infrastructure failures fail closed
 * unless the caller explicitly identifies an authenticated staff-only path.
 */
export async function consumeRateLimit(key: string, max: number, windowSeconds: number, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const unavailable = (): RateLimitResult => ({
    allowed: options.failOpen === true,
    retryAfterSeconds: options.failOpen === true ? 0 : 30,
  });
  const supabaseUrl = envValue(process.env.VITE_SUPABASE_URL);
  const serviceKey = envValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    console.error('ratelimit: missing Supabase env', { failOpen: options.failOpen === true });
    return unavailable();
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
      return unavailable();
    }
    const body = (await resp.json()) as { allowed?: boolean; retry_after_seconds?: number };
    return {
      allowed: body.allowed !== false,
      retryAfterSeconds: Number(body.retry_after_seconds) || 0,
    };
  } catch (err) {
    console.error('ratelimit: infrastructure error', { failOpen: options.failOpen === true, detail: err instanceof Error ? err.message : String(err) });
    return unavailable();
  }
}

/** First hop of x-forwarded-for — good enough to bucket anonymous website visitors. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw ?? '').split(',')[0].trim() || 'unknown';
}
