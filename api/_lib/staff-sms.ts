import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Staff text Ari from their own phones. A teammate is recognised by the mobile
 * number on their profile (Settings → Team & Permissions). Their text runs
 * through the ordinary Ari runtime as THEM — same tools, same RLS, same
 * Citadel archive — using a short-lived session minted for that one request.
 */

export interface StaffProfile {
  id: string;
  org_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export function last10Digits(phone: string): string {
  return String(phone ?? '').replace(/\D/g, '').slice(-10);
}

export function staffPhoneMatches(profilePhone: string | null | undefined, from: string): boolean {
  const mine = last10Digits(profilePhone ?? '');
  return mine.length === 10 && mine === last10Digits(from);
}

export function findStaffByPhone<T extends Pick<StaffProfile, 'phone'>>(roster: T[], from: string): T | null {
  return roster.find(person => staffPhoneMatches(person.phone, from)) ?? null;
}

/** Text-message friendly: no markdown furniture, bounded length. */
export function smsReplyText(content: string, max = 1400): string {
  const text = String(content ?? '')
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[a-z]*\n?/gi, ''))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\[(.+?)\]\((?:[^)]+)\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return 'Done.';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Mint a real session for the teammate (magic-link hash → verifyOtp), without ever touching a password. */
export async function mintStaffAccessToken(
  serviceClient: SupabaseClient,
  anonClient: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message ?? 'Could not mint a staff session');
  const { data: verified, error: verifyError } = await anonClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  const accessToken = verified?.session?.access_token;
  if (verifyError || !accessToken) throw new Error(verifyError?.message ?? 'Could not verify the staff session');
  return accessToken;
}

export function makeClients(supabaseUrl: string, anonKey: string, serviceKey: string): { service: SupabaseClient; anon: SupabaseClient } {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return {
    service: createClient(supabaseUrl, serviceKey, options),
    anon: createClient(supabaseUrl, anonKey, options),
  };
}

export async function askAriAsStaff(origin: string, accessToken: string, message: string): Promise<string> {
  const response = await fetch(`${origin}/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ message: `[Text message from my phone] ${message}` }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null) as { message?: { content?: string }; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? `Ari returned HTTP ${response.status}`);
  return payload?.message?.content ?? '';
}
