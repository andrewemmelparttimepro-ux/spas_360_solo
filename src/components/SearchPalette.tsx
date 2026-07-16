import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { Search, Contact, Users, Wrench, Package, CornerDownLeft, Plus, LayoutDashboard, Handshake, MessageSquare, BarChart3, Settings, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Hit {
  id: string;
  kind: 'contact' | 'deal' | 'job' | 'inventory';
  primary: string;
  secondary: string;
  link: string;
}

const KIND_META = {
  contact: { icon: Contact, label: 'Customers' },
  deal: { icon: Handshake, label: 'Deals' },
  job: { icon: Wrench, label: 'Jobs' },
  inventory: { icon: Package, label: 'Inventory' },
} as const;

// ⌘K is also the do-things palette: create records and jump pages without
// touching the mouse. Shown as the default list; filtered while typing.
interface Action {
  label: string;
  sub: string;
  icon: typeof Plus;
  keywords: string;
  run: (navigate: NavigateFunction) => void;
}

const ACTIONS: Action[] = [
  { label: 'New Customer', sub: 'Guided wizard — contact, deal, follow-up', icon: Plus, keywords: 'new customer create add lead wizard', run: n => n('/customers', { state: { openWizard: true } }) },
  { label: 'New Service Job', sub: 'Opens the job form on the Schedule', icon: Wrench, keywords: 'new job create service repair delivery schedule', run: n => n('/service', { state: { openNew: true } }) },
  { label: 'Go to Dashboard', sub: 'Manager overview', icon: LayoutDashboard, keywords: 'dashboard home kpi', run: n => n('/dashboard') },
  { label: 'Go to Customers', sub: 'The CRM card wall', icon: Users, keywords: 'customers contacts crm cards', run: n => n('/customers') },
  { label: 'Go to Deals', sub: 'Pipeline board', icon: Handshake, keywords: 'deals pipeline kanban sales', run: n => n('/deals') },
  { label: 'Go to Inventory', sub: 'Tubs, saunas, stock', icon: Package, keywords: 'inventory stock units tubs', run: n => n('/inventory') },
  { label: 'Go to Schedule', sub: 'Service calendar', icon: Wrench, keywords: 'schedule service calendar jobs', run: n => n('/service') },
  { label: 'Go to Inbox', sub: 'Team chat + customer texts', icon: MessageSquare, keywords: 'inbox comms communication messages chat sms texts', run: n => n('/communication') },
  { label: 'Go to Reports', sub: 'Revenue, pipeline, aging', icon: BarChart3, keywords: 'reports analytics revenue', run: n => n('/reports') },
  { label: 'Go to Settings', sub: 'Profile, team, notifications', icon: Settings, keywords: 'settings team invite notifications profile', run: n => n('/settings') },
];

/** ⌘K global search across contacts, deals, jobs, and inventory. */
export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!profile || q.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    const term = `%${q.trim()}%`;
    const [contacts, deals, jobs, inventory] = await Promise.all([
      supabase.from('contacts').select('id, first_name, last_name, phone, customer_type')
        .eq('org_id', profile.org_id)
        .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
        .limit(5),
      supabase.from('deals').select('id, title, amount, contacts:contact_id(first_name, last_name)')
        .eq('org_id', profile.org_id).ilike('title', term).limit(5),
      supabase.from('jobs').select('id, title, status')
        .eq('org_id', profile.org_id).ilike('title', term).limit(5),
      supabase.from('inventory_items').select('id, product, sku, brand, status')
        .eq('org_id', profile.org_id)
        .or(`product.ilike.${term},sku.ilike.${term},brand.ilike.${term}`)
        .limit(5),
    ]);

    const results: Hit[] = [
      ...(contacts.data ?? []).map((c) => ({
        id: c.id, kind: 'contact' as const,
        primary: `${c.first_name} ${c.last_name}`,
        secondary: `${c.phone} · ${c.customer_type}`,
        link: `/customers/${c.id}`,
      })),
      ...(deals.data ?? []).map((d) => {
        const contact = d.contacts as unknown as { first_name: string; last_name: string } | null;
        return {
          id: d.id, kind: 'deal' as const,
          primary: d.title,
          secondary: `$${(Number(d.amount) || 0).toLocaleString()}${contact ? ` · ${contact.first_name} ${contact.last_name}` : ''}`,
          link: `/deals/${d.id}`,
        };
      }),
      ...(jobs.data ?? []).map((j) => ({
        id: j.id, kind: 'job' as const,
        primary: j.title,
        secondary: j.status,
        link: `/service/${j.id}`,
      })),
      ...(inventory.data ?? []).map((i) => ({
        id: i.id, kind: 'inventory' as const,
        primary: i.product,
        secondary: `${i.sku}${i.brand ? ` · ${i.brand}` : ''} · ${i.status}`,
        link: `/inventory/${i.id}`,
      })),
    ];
    setHits(results);
    setSearching(false);
  }, [profile]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const go = (hit: Hit) => { navigate(hit.link); onClose(); };
  const runAction = (a: Action) => { a.run(navigate); onClose(); };

  const q = query.trim().toLowerCase();
  const matchedActions = q.length === 0
    ? ACTIONS
    : ACTIONS.filter(a => a.label.toLowerCase().includes(q) || a.keywords.includes(q));

  const grouped = (['contact', 'deal', 'job', 'inventory'] as const)
    .map(kind => ({ kind, items: hits.filter(h => h.kind === kind) }))
    .filter(g => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[12vh] px-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter') {
          if (hits[0]) go(hits[0]);
          else if (matchedActions[0]) runAction(matchedActions[0]);
        }
      }}
    >
      <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 border-b border-ink-700">
          <Search className="w-4 h-4 text-ink-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search customers, deals, jobs, inventory…"
            className="flex-1 py-3.5 bg-transparent text-sm text-ink-100 placeholder-ink-500 outline-none"
          />
          <kbd className="text-[10px] font-mono text-ink-500 bg-ink-950 border border-ink-700 rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {/* Actions — the default list, filtered as you type */}
          {matchedActions.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500 flex items-center gap-1">
                <Zap className="w-3 h-3 text-brand-400" /> Actions
              </div>
              {matchedActions.slice(0, q.length === 0 ? 10 : 4).map(a => (
                <button
                  key={a.label}
                  onClick={() => runAction(a)}
                  className="w-full text-left px-4 py-2.5 hover:bg-ink-800 transition-colors flex items-center gap-3 group"
                >
                  <a.icon className="w-4 h-4 text-ink-500 group-hover:text-brand-400 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-100 truncate">{a.label}</span>
                    <span className="block text-xs text-ink-500 truncate">{a.sub}</span>
                  </span>
                  <CornerDownLeft className="w-3.5 h-3.5 text-ink-600 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {query.trim().length < 2 ? (
            matchedActions.length === 0 && <p className="text-xs text-ink-500 text-center py-8">Type to search or run an action</p>
          ) : searching && hits.length === 0 ? (
            <p className="text-xs text-ink-500 text-center py-8">Searching…</p>
          ) : hits.length === 0 && matchedActions.length === 0 ? (
            <p className="text-xs text-ink-500 text-center py-8">No matches for “{query}”</p>
          ) : grouped.map(group => (
            <div key={group.kind}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                {KIND_META[group.kind].label}
              </div>
              {group.items.map(hit => {
                const Icon = KIND_META[hit.kind].icon;
                return (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    onClick={() => go(hit)}
                    className="w-full text-left px-4 py-2.5 hover:bg-ink-800 transition-colors flex items-center gap-3 group"
                  >
                    <Icon className="w-4 h-4 text-ink-500 group-hover:text-brand-400 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-100 truncate">{hit.primary}</span>
                      <span className="block text-xs text-ink-500 truncate">{hit.secondary}</span>
                    </span>
                    <CornerDownLeft className="w-3.5 h-3.5 text-ink-600 opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
