import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { MENTION_RE } from '@/lib/mentions';

// Renders a stored body with mention tokens as inline chips:
// customers link to their card (violet — the CRM color), teammates get a brand
// chip, Ari gets his sparkle. Plain text passes through untouched; the parent
// keeps whitespace-pre-wrap so documents stay readable.
export default function MentionText({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(<Fragment key={i++}>{body.slice(last, idx)}</Fragment>);
    const [, label, kind, id] = m;
    if (kind === 'customer' && id) {
      parts.push(
        <Link
          key={i++}
          to={`/customers/${id}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center px-1.5 py-px rounded-md bg-violet-500/15 text-violet-300 font-semibold hover:bg-violet-500/25 transition-colors"
        >
          @{label}
        </Link>
      );
    } else if (kind === 'user') {
      parts.push(
        <span key={i++} className="inline-flex items-center px-1.5 py-px rounded-md bg-brand-500/15 text-brand-300 font-semibold">
          @{label}
        </span>
      );
    } else {
      parts.push(
        <span key={i++} className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-md bg-brand-500/20 text-brand-300 font-semibold">
          <Sparkles className="w-3 h-3" />Ari
        </span>
      );
    }
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push(<Fragment key={i++}>{body.slice(last)}</Fragment>);
  return <>{parts}</>;
}
