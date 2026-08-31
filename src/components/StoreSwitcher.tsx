import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * One-tap store switcher — Minot ↔ Bismarck with live unit counts.
 * Drives the same global location filter as the header pill, so
 * Deals / Schedule / Reports follow along.
 */
export default function StoreSwitcher({ countSource = 'inventory' }: { countSource?: 'inventory' | 'scheduledJobs' }) {
  const { profile, locations, activeLocationId, setActiveLocation } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    (async () => {
      const baseQuery = countSource === 'scheduledJobs'
        ? supabase.from('jobs').select('location_id').eq('org_id', profile.org_id).not('scheduled_at', 'is', null)
        : supabase.from('inventory_items').select('location_id').eq('org_id', profile.org_id).is('removed_at', null);
      const { data } = await baseQuery;
      if (!alive || !data) return;
      const c: Record<string, number> = {};
      for (const row of data) c[row.location_id] = (c[row.location_id] ?? 0) + 1;
      setCounts(c);
    })();
    return () => { alive = false; };
  }, [profile, countSource]);

  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  const options: { id: string | null; label: string; count: number }[] = [
    { id: null, label: 'All', count: total },
    ...locations.map(l => ({ id: l.id, label: l.name, count: counts[l.id] ?? 0 })),
  ];

  return (
    <div className="flex items-stretch gap-1 bg-ink-950 border border-ink-700 rounded-xl p-1 shrink-0">
      {options.map(opt => {
        const active = activeLocationId === opt.id;
        return (
          <button
            key={opt.id ?? 'all'}
            onClick={() => setActiveLocation(opt.id)}
            className={cn(
              'flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all min-w-0',
              active
                ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/50'
                : 'text-ink-400 hover:text-ink-200 hover:bg-ink-800'
            )}
          >
            {opt.id !== null && <MapPin className={cn('hidden sm:block w-4 h-4 shrink-0', active ? 'text-brand-400' : 'text-ink-500')} />}
            {/* "Bismarck (Spa's Etc)" earns its full name in the tooltip, not the tab */}
            <span className="truncate" title={opt.label}>{opt.label.split(' (')[0]}</span>
            <span className={cn(
              'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0',
              active ? 'bg-brand-500/20 text-brand-300' : 'bg-ink-800 text-ink-500'
            )}>
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
