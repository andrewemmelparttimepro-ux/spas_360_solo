import { createHash } from 'node:crypto';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function summaryHash(summary: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(summary))).digest('hex');
}
export function reusableNarration(cached: { source_hash?: string | null; created_at?: string; narration?: string } | null, hash: string, now = Date.now()): boolean {
  if (!cached?.narration || cached.source_hash !== hash || /\b(you|your|yours)\b/i.test(cached.narration)) return false;
  const age = now - Date.parse(cached.created_at ?? '');
  return Number.isFinite(age) && age >= 0 && age < 15 * 60_000;
}
