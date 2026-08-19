import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, ExternalLink, FileKey2, Search, ShieldCheck, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type KnowledgeResult = {
  chunk_id: string;
  document_id: string;
  title: string;
  doc_type: string;
  manufacturer: string | null;
  revision: string | null;
  heading: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
  part_numbers: string[] | null;
  models: string[] | null;
  source_url: string | null;
  citation_label: string | null;
  access_scope: 'staff' | 'public';
  rank: number;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  doc_type: string;
  manufacturer: string | null;
  revision: string | null;
  access_scope: 'staff' | 'public';
  source_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  verified_at: string | null;
  review_due_at: string | null;
  status: string;
};

const TYPES = [
  ['all', 'All sources'],
  ['parts_catalog', 'Parts catalogs'],
  ['service_manual', 'Service manuals'],
  ['owner_manual', "Owner's manuals"],
  ['warranty', 'Warranties'],
  ['technical_bulletin', 'Technical bulletins'],
] as const;

const pages = (result: Pick<KnowledgeResult, 'page_start' | 'page_end'>) => {
  if (!result.page_start) return '';
  return `p. ${result.page_start}${result.page_end && result.page_end !== result.page_start ? `–${result.page_end}` : ''}`;
};

export default function Knowledge({ defaultType = 'all' }: { defaultType?: string }) {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [type, setType] = useState(params.get('type') ?? defaultType);
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedChunk = params.get('chunk');

  const loadDocuments = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('id,title,doc_type,manufacturer,revision,access_scope,source_url,storage_bucket,storage_path,verified_at,review_due_at,status')
      .eq('org_id', profile.org_id)
      .eq('status', 'active')
      .order('manufacturer', { ascending: true, nullsFirst: false })
      .order('title');
    if (error) setLoadError(error.message);
    else setDocuments((data ?? []) as KnowledgeDocument[]);
  }, [profile]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const search = useCallback(async (needle: string, selectedType: string) => {
    if (!profile || needle.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc('search_knowledge_v2', {
      p_org: profile.org_id,
      p_query: needle.trim(),
      p_doc_types: selectedType === 'all' ? null : [selectedType],
      p_limit: 25,
      p_access_scope: 'staff',
    });
    if (error) { setLoadError(error.message); setResults([]); }
    else setResults((data ?? []) as KnowledgeResult[]);
    setSearching(false);
  }, [profile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams(current => {
        const next = new URLSearchParams(current);
        if (query.trim()) next.set('q', query.trim()); else next.delete('q');
        if (type !== 'all') next.set('type', type); else next.delete('type');
        next.delete('chunk');
        return next;
      }, { replace: true });
      search(query, type);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, type, search, setParams]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, KnowledgeDocument[]>();
    for (const document of documents) {
      const key = document.manufacturer ?? 'SPAS 360';
      groups.set(key, [...(groups.get(key) ?? []), document]);
    }
    return [...groups.entries()];
  }, [documents]);

  const openSource = async (document: KnowledgeDocument | KnowledgeResult) => {
    if (document.source_url) { window.open(document.source_url, '_blank', 'noopener,noreferrer'); return; }
    const full = documents.find(item => item.id === ('document_id' in document ? document.document_id : document.id));
    if (!full?.storage_bucket || !full.storage_path) return;
    const { data, error } = await supabase.storage.from(full.storage_bucket).createSignedUrl(full.storage_path, 120);
    if (error) setLoadError(error.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">Ari verified source library</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100"><BookOpen className="h-6 w-6 text-cyan-400" />Knowledge</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">Search exact part numbers, service procedures, model details, warranties, and manufacturer manuals. Results retain their source and page.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-300"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Verified sources</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-300"><FileKey2 className="mr-1 inline h-3.5 w-3.5" />Staff documents stay private</span>
        </div>
      </header>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Part number, model, error code, procedure…"
              className="w-full rounded-xl border border-ink-700 bg-ink-950 py-2.5 pl-10 pr-3 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-cyan-500"
            />
          </label>
          <select value={type} onChange={event => setType(event.target.value)} className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-200 outline-none focus:border-cyan-500">
            {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">For compatibility questions, include the model, model year, and serial-number context whenever possible.</p>
      </section>

      {loadError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">Knowledge search could not complete: {loadError}</div>}

      {query.trim().length >= 2 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-ink-400">{searching ? 'Searching…' : `${results.length} verified match${results.length === 1 ? '' : 'es'}`}</h2>
          </div>
          {!searching && results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-900/50 py-14 text-center">
              <Wrench className="mx-auto mb-3 h-8 w-8 text-ink-600" />
              <p className="font-semibold text-ink-300">No verified answer found</p>
              <p className="mt-1 text-xs text-ink-500">Try the exact part number, a broader model name, or remove the source filter.</p>
            </div>
          ) : results.map(result => (
            <article id={`knowledge-${result.chunk_id}`} key={result.chunk_id} className={cn('rounded-2xl border bg-ink-900 p-4 shadow-sm', selectedChunk === result.chunk_id ? 'border-cyan-400 ring-2 ring-cyan-500/20' : 'border-ink-700')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">{result.doc_type.replaceAll('_', ' ')}</span>
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', result.access_scope === 'staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{result.access_scope}</span>
                    {result.part_numbers?.slice(0, 6).map(part => <code key={part} className="rounded bg-ink-950 px-1.5 py-0.5 text-[11px] text-violet-300">{part}</code>)}
                  </div>
                  <h3 className="text-sm font-bold text-ink-100">{result.heading ?? result.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{result.citation_label ?? result.title}{pages(result) ? ` · ${pages(result)}` : ''}</p>
                </div>
                {(result.source_url || documents.some(doc => doc.id === result.document_id && doc.storage_path)) && (
                  <button onClick={() => openSource(result)} className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-ink-300 hover:border-cyan-500 hover:text-cyan-300">Open source <ExternalLink className="ml-1 inline h-3 w-3" /></button>
                )}
              </div>
              <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-ink-400">{result.content}</p>
              {result.models && result.models.length > 0 && <p className="mt-3 text-[11px] text-ink-600">Indexed models: {result.models.slice(0, 10).join(' · ')}</p>}
            </article>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-ink-400">Indexed source library</h2>
            <p className="mt-1 text-xs text-ink-600">{documents.length} active source{documents.length === 1 ? '' : 's'}; staff-only literature is never available to the public chat.</p>
          </div>
          {groupedDocuments.map(([manufacturer, docs]) => (
            <div key={manufacturer} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <h3 className="mb-3 text-sm font-bold text-ink-200">{manufacturer}</h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {docs.map(document => (
                  <button key={document.id} onClick={() => openSource(document)} disabled={!document.source_url && !document.storage_path} className="flex items-start gap-3 rounded-xl border border-ink-800 bg-ink-950/60 p-3 text-left transition-colors enabled:hover:border-cyan-600 disabled:cursor-default">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink-200">{document.title}</span>
                      <span className="mt-1 block text-[10px] uppercase tracking-wider text-ink-600">{document.doc_type.replaceAll('_', ' ')}{document.revision ? ` · ${document.revision}` : ''}</span>
                    </span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', document.access_scope === 'staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{document.access_scope}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
