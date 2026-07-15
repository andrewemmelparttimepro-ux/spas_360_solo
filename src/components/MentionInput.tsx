import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Mic, Square, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';
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
  /** Realtime clean dictation. Enabled by default on every SPAS 360 composer. */
  voiceEnabled?: boolean;
}

export default function MentionInput({
  value, onValueChange, picked, onSubmit,
  allowAri = true, placeholder, disabled, rows = 1,
  autoSize = false, maxHeight = 100, className,
  menuDirection = 'up', autoFocus, voiceEnabled = true,
}: Props) {
  const { profile } = useAuth();
  const [team, setTeam] = useState<{ id: string; first_name: string; last_name: string; role: string }[]>([]);
  const [customerHits, setCustomerHits] = useState<{ id: string; first_name: string; last_name: string; phone: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null); // null = menu closed
  const [anchor, setAnchor] = useState(0); // index of the '@' being completed
  const [selected, setSelected] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = useVoiceDictation({ value, onValueChange, disabled: !!disabled || !voiceEnabled });

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
      {voiceEnabled && (voice.active || voice.error) && (
        <div className={cn(
          'absolute right-0 bottom-full mb-1.5 z-[60] flex items-center gap-2 rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-md',
          voice.error
            ? 'border-red-500/40 bg-red-950/95 text-red-100'
            : 'border-brand-500/35 bg-ink-900/95 text-ink-100'
        )} role="status" aria-live="polite">
          {!voice.error && (
            <span className="voice-live-bars" aria-hidden="true"><i /><i /><i /></span>
          )}
          <span className="text-[11px] font-semibold whitespace-nowrap">
            {voice.error
              ? voice.error
              : voice.state === 'connecting'
                ? 'Starting microphone…'
                : voice.state === 'finalizing'
                  ? 'Finishing your thought…'
                  : 'Listening · speak naturally'}
          </span>
          {voice.error ? (
            <button type="button" onClick={voice.clearError} className="p-0.5 text-red-300 hover:text-white" aria-label="Dismiss voice error"><X className="w-3.5 h-3.5" /></button>
          ) : (
            <button type="button" onClick={voice.cancel} className="text-[10px] font-bold uppercase tracking-wide text-ink-400 hover:text-white">Cancel</button>
          )}
        </div>
      )}
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
        readOnly={voice.active}
        autoFocus={autoFocus}
        className={cn(className, voiceEnabled && 'voice-composer-input')}
      />
      {voiceEnabled && (
        <button
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => { void (voice.active ? voice.stop() : voice.start()); }}
          disabled={disabled || voice.state === 'connecting' || voice.state === 'finalizing'}
          className={cn(
            'absolute right-1.5 bottom-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:cursor-wait',
            voice.state === 'listening'
              ? 'border-red-400/60 bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.14)]'
              : voice.error
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-ink-700 bg-ink-900 text-ink-400 hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-300'
          )}
          aria-label={voice.state === 'listening' ? 'Stop voice dictation' : 'Start voice dictation'}
          title={voice.state === 'listening' ? 'Stop dictation' : 'Talk instead of typing'}
        >
          {voice.state === 'listening' ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
