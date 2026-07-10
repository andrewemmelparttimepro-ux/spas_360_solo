import { createNotification } from '@/hooks/useNotifications';

// ─── The @ system ────────────────────────────────────────────────────────────
// One token grammar shared by team chat, deal/customer notes, and Ari chat:
//   @[Brandon Solem](user:<uuid>)   → teammate: mention chip + notification
//   @[Roger Wyant](customer:<uuid>) → customer: violet chip linking to their card
//   @[Ari](ari)                     → summons the AI assistant in place
// Tokens live in the stored body; the composer shows friendly "@Name" text and
// MentionText renders the chips.

export type MentionKind = 'user' | 'customer' | 'ari';

export interface PickedMention {
  kind: MentionKind;
  id?: string; // absent for ari
  label: string;
}

export const MENTION_RE = /@\[([^\]\n]+)\]\((ari|user|customer)(?::([0-9a-fA-F-]{36}))?\)/g;

export function mentionToken(m: PickedMention): string {
  return m.kind === 'ari' ? '@[Ari](ari)' : `@[${m.label}](${m.kind}:${m.id})`;
}

export interface ParsedMentions {
  users: { id: string; label: string }[];
  customers: { id: string; label: string }[];
  ari: boolean;
}

export function parseMentions(body: string): ParsedMentions {
  const users: { id: string; label: string }[] = [];
  const customers: { id: string; label: string }[] = [];
  let ari = false;
  for (const m of body.matchAll(MENTION_RE)) {
    const [, label, kind, id] = m;
    if (kind === 'ari') ari = true;
    else if (kind === 'user' && id && !users.some(u => u.id === id)) users.push({ id, label });
    else if (kind === 'customer' && id && !customers.some(c => c.id === id)) customers.push({ id, label });
  }
  return { users, customers, ari };
}

/** Tokens → plain "@Name" text (previews, notifications, chat history for the LLM). */
export function stripMentions(body: string): string {
  return body.replace(MENTION_RE, (_, label) => `@${label}`);
}

/** Tokens → LLM-friendly text; customer mentions carry their UUID so Ari can
 *  jump straight to get_contact_details without searching. */
export function toAgentText(body: string): string {
  return body.replace(MENTION_RE, (_, label, kind, id) =>
    kind === 'customer' ? `@${label} [customer_id: ${id}]` : `@${label}`
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The composer shows "@Brandon Solem"; at send time the picked mentions still
 *  present in the text are swapped for tokens (longest label first so
 *  "Brandon S" never eats "Brandon Solem"). */
export function composeMentionBody(text: string, picked: PickedMention[]): string {
  let out = text;
  const unique = [...new Map(picked.map(p => [`${p.kind}:${p.id ?? ''}:${p.label}`, p])).values()]
    .sort((a, b) => b.label.length - a.label.length);
  for (const p of unique) {
    out = out.replace(new RegExp(`@${escapeRe(p.label)}(?![\\w])`, 'g'), mentionToken(p));
  }
  return out;
}

/** Notify every mentioned teammate. Returns the ids notified (so callers can
 *  skip them in their own generic notifications). */
export async function notifyMentionedUsers(opts: {
  body: string;
  senderId: string;
  senderName: string;
  contextLabel: string; // "Wyant – Hot Tub" / "Main"
  link: string;
  onlyIds?: string[]; // restrict to e.g. thread participants
}): Promise<string[]> {
  const { users } = parseMentions(opts.body);
  const preview = stripMentions(opts.body);
  const targets = users
    .map(u => u.id)
    .filter(id => id !== opts.senderId)
    .filter(id => !opts.onlyIds || opts.onlyIds.includes(id));
  await Promise.all(targets.map(id => createNotification(id, {
    type: 'mention',
    title: `${opts.senderName} mentioned you · ${opts.contextLabel}`,
    body: preview.length > 100 ? preview.slice(0, 100) + '…' : preview,
    link: opts.link,
  })));
  return targets;
}

// A note written BY Ari starts with his own mention token — the notes UI keys
// off this to render the Ari treatment (bot header + copy button).
export const ARI_NOTE_PREFIX = '@[Ari](ari) ';
export const isAriNote = (body: string) => body.startsWith(ARI_NOTE_PREFIX);
export const ariNoteBody = (body: string) => body.slice(ARI_NOTE_PREFIX.length);
