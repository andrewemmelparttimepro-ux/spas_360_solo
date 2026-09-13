import { useEffect, useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { inventoryHistoryActor, inventoryHistoryDescription, type InventoryHistoryEntry } from '@/lib/inventoryFlooringHistory';

/** Mounted only while an inventory row is expanded. Reads the permanent server ledger. */
export function InventoryFlooringHistory({ itemId, refreshKey }: { itemId: string; refreshKey?: string }) {
  const [entries, setEntries] = useState<InventoryHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const allEntries: InventoryHistoryEntry[] = [];
        for (let from = 0; ; from += 1000) {
          const result = await supabase.from('inventory_flooring_history')
            .select('id, event_type, occurred_at, actor_id, actor_name, before_designation, after_designation, source')
            .eq('inventory_item_id', itemId)
            .order('occurred_at', { ascending: true }).order('id', { ascending: true })
            .range(from, from + 999);
          if (result.error) throw result.error;
          allEntries.push(...result.data as InventoryHistoryEntry[]);
          if (result.data.length < 1000) break;
        }
        if (!cancelled) setEntries(allEntries);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'History could not be loaded. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchHistory();
    return () => { cancelled = true; };
  }, [itemId, refreshKey, retry]);

  return (
    <section aria-label="Inventory creation and flooring history" className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-left text-sm font-normal text-ink-300">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink-100">Creation &amp; flooring history</h3>
        <button type="button" aria-label="Refresh inventory history" onClick={() => setRetry(value => value + 1)} className="rounded-md p-1 text-ink-400 hover:text-ink-100"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <p className="mt-1 text-xs text-ink-400">Permanent history. Entries cannot be edited or deleted.</p>
      {isLoading ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-ink-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading history…</p>
      ) : error ? (
        <p role="alert" className="mt-3 text-red-300">{error}</p>
      ) : entries.length ? (
        <ol className="mt-3 space-y-3">
          {entries.map(entry => (
            <li key={entry.id} className="border-l-2 border-amber-500/50 pl-3">
              <p className="font-medium text-ink-100">{inventoryHistoryDescription(entry)}</p>
              <p className="mt-0.5 text-xs text-ink-300">{inventoryHistoryActor(entry)} · <time dateTime={entry.occurred_at}>{new Date(entry.occurred_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })}</time></p>
              {entry.source === 'legacy_record' && <p className="mt-1 text-xs text-ink-400">Original recorded creation time; the creator and initial flooring were not recorded.</p>}
              {entry.source === 'audit_log' && <p className="mt-1 text-xs text-ink-400">Recovered from recorded activity.</p>}
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-ink-400">No recorded history is available for this item.</p>}
    </section>
  );
}
