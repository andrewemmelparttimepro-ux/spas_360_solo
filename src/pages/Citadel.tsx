import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Copy, FileText, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AriArtifactCard from '@/components/AriArtifactCard';
import type { AgentDeliverable } from '@/hooks/useAgentChat';

type CitadelItem = AgentDeliverable & {
  content: string;
  content_format: string | null;
  delivery_channels: string[] | null;
};

export default function Citadel() {
  const [items, setItems] = useState<CitadelItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('agent_deliverables')
      .select('id, title, kind, content, content_format, delivery_channels, status, artifact_format, file_name, mime_type, file_size_bytes, missing_fields, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    setItems((data ?? []) as CitadelItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`web-citadel-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_deliverables' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(item => `${item.title} ${item.kind} ${item.content}`.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">Canonical cloud workspace</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100"><Building2 className="h-6 w-6 text-violet-400" />Citadel</h1>
          <p className="mt-1 text-sm text-ink-500">Every Ari output lives here in real time on every signed-in device.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search titles or content…" className="w-full rounded-xl border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-500" />
        </label>
      </div>

      {loading ? (
        <div className="flex min-h-80 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-ink-700 border-t-violet-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-900/50 text-center">
          <FileText className="mb-3 h-9 w-9 text-ink-600" />
          <p className="font-semibold text-ink-300">No Citadel outputs match</p>
          <p className="mt-1 text-xs text-ink-500">Ask Ari for a brief, one-pager, PDF, proposal, or sales tool.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map(item => item.artifact_format ? (
            <AriArtifactCard key={item.id} artifact={item} />
          ) : (
            <article key={item.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-sm">
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-100">{item.title}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-500">{item.kind.replaceAll('_', ' ')} · {new Date(item.created_at).toLocaleString()}</p>
                </div>
                <button onClick={() => navigator.clipboard.writeText(item.content)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-800 hover:text-ink-200" title="Copy output"><Copy className="h-4 w-4" /></button>
              </div>
              <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-ink-400">{item.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
