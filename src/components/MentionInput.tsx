import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { PickedMention } from '@/lib/mentions';

// The @ composer used everywhere (team chat, deal/customer notes, Ari chat).
// Type "@" → popup lists Ari, the team, and live customer search. The textarea
// shows friendly "@First Last" text; picked mentions ride along in a ref and
// become tokens at send time via composeMentionBody().

interface MenuItem {
  kind: 'user' | 'customer' | 'ari';
  id?: string;
  label: string;
  sub?: string;
}

interface Props {
  value: string;
  onValueChange: (v: string) => void;
  /** Mutable list of mentions picked this session — pass to composeMentionBody on send, then reset to []. */
  picked: React.MutableRefObject<PickedMention[]>;
  /** Fired on Enter (without Shift) when the mention menu is closed. */
  onSubmit?: () => void;
  allowAri?: boolean;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** Chat-style auto-grow up to maxHeight px. */
  autoSize?: boolean;
  maxHeight?: number;
  className?: string;
  menuDirection?: 'up' | 'down';
  autoFocus?: boolean;
}

export default function MentionInput({
  value, onValueChange, picked, onSubmit,
  allowAri = true, placeholder, disabled, rows = 1,
  autoSize = false, maxHeight = 100, className,
  menuDirection = 'up', autoFocus,
}: Props) {
  const { profile } = useAuth();
  const [team, setTeam] = useState<{ id: string; first_name: string; last_name: string; role: string }[]>([]);
  const [customerHits, setCustomerHits] = useState<{ id: string; first_name: string; last_name: string; phone: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null); // null = menu closed
  const [anchor, setAnchor] = useState(0); // index of the '@' being completed
  const [selected, setSelected] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile?.org_id) return;
    supabase.from('profiles').select('id, first_name, last_name, role').eq('org_id', profile.org_id).order('first_name')
      .then(({ data }) => setTeam(data ?? []));
  }, [profile?.org_id]);

  // Live customer search while a mention query is open
  useEffect(() => {
    if (query === null || query.trim().length < 2) { setCustomerHits([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    debounceRef.current = setTimeout(async () => {
      const head = q.split(/\s+/)[0];
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .or(`first_name.ilike.%${head}%,last_name.ilike.%${head}%,phone.ilike.%${head}%`)
        .limit(8);
      const ql = q.toLowerCase();
      setCustomerHits((data ?? []).filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(ql) || c.phone.includes(q)
      ).slice(0, 5));
    }, 180);
  }, [query]);

  const items: MenuItem[] = useMemo(() => {
    if (query === null) return [];
    const ql = query.toLowerCase();
    const out: MenuItem[] = [];
    if (allowAri && ('ari'.startsWith(ql) || ql === '')) {
      out.push({ kind: 'ari', label: 'Ari', sub: 'AI Sales Assistant — does the work right here' });
    }
    for (const m of team) {
      if (m.id === profile?.id) continue;
      const full = `${m.first_name} ${m.last_name}`;
      if (ql === '' || full.toLowerCase().includes(ql)) {
        out.push({ kind: 'user', id: m.id, label: full, sub: m.role.replace('_', ' ') });
        if (out.length >= 7) break;
      }
    }
    for (const c of customerHits) {
      out.push({ kind: 'customer', id: c.id, label: `${c.first_name} ${c.last_name}`, sub: c.phone });
    }
    return out;
  }, [query, allowAri, team, customerHits, profile?.id]);

  useEffect(() => { setSelected(0); }, [query]);

  const closeMenu = useCallback(() => setQuery(null), []);

  const detectQuery = useCallback((text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) { closeMenu(); return; }
    const q = upto.slice(at + 1);
    const boundaryOk = at === 0 || /[\s([{]/.test(upto[at - 1]);
    if (!boundaryOk || q.length > 24 || q.includes('\n')) { closeMenu(); return; }
    setAnchor(at);
    setQuery(q);
  }, [closeMenu]);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el || !autoSize) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, [autoSize, maxHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(e.target.value);
    detectQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
    resize();
  };

  const pick = (item: MenuItem) => {
    const el = taRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = value.slice(0, anchor) + '@' + item.label + ' ' + value.slice(caret);
    onValueChange(next);
    if (!picked.current.some(p => p.kind === item.kind && p.id === item.id && p.label === item.label)) {
      picked.current.push({ kind: item.kind, id: item.id, label: item.label });
    }
    closeMenu();
    const newCaret = anchor + item.label.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(newCaret, newCaret);
      resize();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && items.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => (s + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => (s - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[selected]); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      {query !== null && items.length > 0 && (
        <div
          className={cn(
            'absolute left-0 z-50 w-72 max-w-[90vw] bg-ink-850 border border-ink-700 rounded-xl shadow-2xl overflow-hidden',
            menuDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          )}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {items.map((item, idx) => (
              <button
                key={`${item.kind}:${item.id ?? 'ari'}`}
                onMouseDown={e => { e.preventDefault(); pick(item); }}
                onMouseEnter={() => setSelected(idx)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  idx === selected ? 'bg-brand-500/15' : 'hover:bg-ink-800'
                )}
              >
                {item.kind === 'ari' ? (
                  <span className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-brand-400" />
                  </span>
                ) : item.kind === 'user' ? (
                  <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {item.label.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-full bg-violet-500/15 text-violet-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {item.label.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-100 truncate">{item.label}</span>
                  {item.sub && <span className="block text-[10px] text-ink-500 capitalize truncate">{item.sub}</span>}
                </span>
                {item.kind === 'customer' && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-violet-400/80 shrink-0">Customer</span>
                )}
              </button>
            ))}
          </div>
          <p className="px-3 py-1.5 border-t border-ink-800 text-[10px] text-ink-500">↑↓ to choose · Enter to insert</p>
        </div>
      )}
      <textarea
        ref={taRef}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={e => detectQuery(value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onBlur={() => setTimeout(closeMenu, 150)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={className}
      />
    </div>
  );
}
