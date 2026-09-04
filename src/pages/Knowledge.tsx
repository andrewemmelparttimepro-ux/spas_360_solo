import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, ExternalLink, FileKey2, Files, FileText, Search, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { filterKnowledgeDocuments } from '@/lib/knowledgeDocuments';
import { confirmLibraryDeletion, requestLibraryDeletion, type LibraryDeleteKind } from '@/lib/libraryDeletion';

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

type PartsPdfResource = {
  key: string;
  postId: string;
  attachmentId: string;
  displayName: string;
  attachment: PartsPdfAttachment | null;
  loading: boolean;
  opening: boolean;
  error: string | null;
};

type PartsPdfAttachment = {
  id: string;
  post_id: string;
  name: string;
  mime_type: string | null;
  size: string | null;
  storage_path: string | null;
  purpose: string;
};

const PARTS_PDF_BUCKET = 'fix-it-files';
const PARTS_PDF_RESOURCES = [
  {
    key: 'sun-parts-2016',
    postId: '3bc7f944-5dcc-4c66-9382-b70cd07964d3',
    attachmentId: 'da51ac8d-0368-40a5-b196-3824aa33e4e5',
    displayName: 'Sun Parts 2016 +',
  },
  {
    key: 'sundance-parts-2015-volume-1',
    postId: '85507a1f-9b9e-487c-b7fb-0dd359ca4bfa',
    attachmentId: 'e5a191d6-942c-4750-8d7e-79003e545bf6',
    displayName: 'Sundance Parts 2015 Volume 1',
  },
] as const;

const initialPartsPdfResources = (loading: boolean): PartsPdfResource[] => PARTS_PDF_RESOURCES.map(resource => ({
  ...resource,
  attachment: null,
  loading,
  opening: false,
  error: null,
}));

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

const formatAttachmentSize = (size: string | null) => {
  if (!size) return '';
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return size;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Knowledge({ defaultType = 'all', pageTitle = 'Knowledge' }: { defaultType?: string; pageTitle?: 'Knowledge' | 'Documents' }) {
  const { profile, session } = useAuth();
  const isPartsView = defaultType === 'parts_catalog';
  const isDocumentsView = pageTitle === 'Documents';
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [type, setType] = useState(params.get('type') ?? defaultType);
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partsPdfs, setPartsPdfs] = useState<PartsPdfResource[]>(() => initialPartsPdfResources(isPartsView));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const deleteInFlight = useRef(false);
  const selectedChunk = params.get('chunk');
  const canDeletePartsFiles = isPartsView && profile?.role === 'owner_manager';

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

  useEffect(() => {
    if (!isPartsView) {
      setPartsPdfs(initialPartsPdfResources(false));
      return;
    }
    if (!profile) return;

    let cancelled = false;
    const loadPartsPdfs = async () => {
      setPartsPdfs(initialPartsPdfResources(true));
      const resources = (await Promise.all(PARTS_PDF_RESOURCES.map(async resource => {
        const { data, error } = await supabase
          .from('fix_it_attachments')
          .select('id,post_id,name,mime_type,size,storage_path,purpose')
          .eq('id', resource.attachmentId)
          .eq('post_id', resource.postId)
          .eq('org_id', profile.org_id)
          .eq('purpose', 'report')
          .maybeSingle();

        const attachment = data as PartsPdfAttachment | null;
        if (!error && !attachment) return null;
        const unavailable = !attachment || attachment.mime_type !== 'application/pdf' || !attachment.storage_path;
        return {
          ...resource,
          attachment: unavailable ? null : attachment,
          loading: false,
          opening: false,
          error: error
            ? `${resource.displayName} could not be loaded. Reload this page to try again.`
            : unavailable ? `${resource.displayName} is currently unavailable.` : null,
        } satisfies PartsPdfResource;
      }))).filter(Boolean) as PartsPdfResource[];

      if (!cancelled) setPartsPdfs(resources);
    };

    void loadPartsPdfs();
    return () => { cancelled = true; };
  }, [isPartsView, profile]);

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

  const visibleDocuments = useMemo(() => filterKnowledgeDocuments(documents, type), [documents, type]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, KnowledgeDocument[]>();
    for (const document of visibleDocuments) {
      const key = document.manufacturer ?? 'SPAS 360';
      groups.set(key, [...(groups.get(key) ?? []), document]);
    }
    return [...groups.entries()];
  }, [visibleDocuments]);

  const openSource = async (document: KnowledgeDocument | KnowledgeResult) => {
    if (document.source_url) { window.open(document.source_url, '_blank', 'noopener,noreferrer'); return; }
    const full = documents.find(item => item.id === ('document_id' in document ? document.document_id : document.id));
    if (!full?.storage_bucket || !full.storage_path) return;
    const { data, error } = await supabase.storage.from(full.storage_bucket).createSignedUrl(full.storage_path, 120);
    if (error) setLoadError(error.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const openPartsPdf = async (resource: PartsPdfResource) => {
    if (!resource.attachment?.storage_path || resource.opening) return;
    const pendingWindow = window.open('about:blank', '_blank');
    if (pendingWindow) pendingWindow.opener = null;
    setPartsPdfs(current => current.map(item => item.key === resource.key
      ? { ...item, opening: true, error: null }
      : item));

    const { data, error } = await supabase.storage
      .from(PARTS_PDF_BUCKET)
      .createSignedUrl(resource.attachment.storage_path, 120);

    if (error || !data?.signedUrl) {
      pendingWindow?.close();
      setPartsPdfs(current => current.map(item => item.key === resource.key
        ? { ...item, opening: false, error: `${resource.displayName} could not be opened. Please try again.` }
        : item));
      return;
    }
    setPartsPdfs(current => current.map(item => item.key === resource.key
      ? { ...item, opening: false }
      : item));
    if (pendingWindow) pendingWindow.location.replace(data.signedUrl);
    else window.location.assign(data.signedUrl);
  };

  const deletePartsFile = async (kind: LibraryDeleteKind, id: string, name: string) => {
    if (!canDeletePartsFiles || deleteInFlight.current || !session?.access_token) return;
    if (!confirmLibraryDeletion(name)) return;
    deleteInFlight.current = true;
    setDeletingId(id);
    setDeleteError(null);
    setDeleteNotice(null);
    try {
      await requestLibraryDeletion({ kind, id, name }, session.access_token);
      if (kind === 'parts_attachment') {
        setPartsPdfs(current => current.filter(resource => resource.attachment?.id !== id));
      } else {
        setDocuments(current => current.filter(document => document.id !== id));
        setResults(current => current.filter(result => result.document_id !== id));
      }
      setDeleteNotice(`${name} was deleted.`);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'The file could not be deleted. Please try again.');
    } finally {
      deleteInFlight.current = false;
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-500">{isDocumentsView ? 'Dealership document library' : 'Ari verified source library'}</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100">
            {isDocumentsView ? <Files className="h-6 w-6 text-brand-500" /> : <BookOpen className="h-6 w-6 text-brand-500" />}
            {isPartsView ? 'Parts' : pageTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">{isPartsView ? 'Open private manufacturer catalogs or search verified parts literature by part number, model, and year.' : isDocumentsView ? 'Open and search the dealership’s verified manuals, warranties, technical bulletins, and other staff documents.' : 'Search exact part numbers, service procedures, model details, warranties, and manufacturer manuals. Results retain their source and page.'}</p>
        </div>
        {/* Reassurance, not decoration — these read as quiet footnotes, not controls */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-500">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Verified sources</span>
          <span className="inline-flex items-center gap-1"><FileKey2 className="h-3.5 w-3.5" />Staff documents stay private</span>
        </div>
      </header>

      {deleteNotice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{deleteNotice}</div>}
      {deleteError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{deleteError}</div>}

      {isPartsView && (
        <section aria-labelledby="parts-pdf-heading" className="rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-500">Parts PDF library</p>
            <h2 id="parts-pdf-heading" className="mt-0.5 text-sm font-bold text-ink-100">Manufacturer catalogs</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {partsPdfs.map(resource => (
              <article key={resource.key} className="rounded-xl border border-ink-800 bg-ink-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="rounded-xl bg-brand-500/15 p-2.5 text-brand-500"><FileText className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-ink-100">{resource.displayName}</h3>
                      <p className="mt-1 text-xs text-ink-500">
                        {resource.loading ? 'Loading the private catalog…' : resource.attachment ? `PDF${formatAttachmentSize(resource.attachment.size) ? ` · ${formatAttachmentSize(resource.attachment.size)}` : ''} · Signed access expires after opening` : 'Catalog access is unavailable.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void openPartsPdf(resource); }}
                      disabled={resource.loading || !resource.attachment || resource.opening || deletingId === resource.attachment?.id}
                      aria-label={`Open ${resource.displayName} PDF`}
                      className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-2.5 text-xs font-bold text-brand-400 transition-colors enabled:hover:border-brand-400 enabled:hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resource.loading ? 'Loading…' : resource.opening ? 'Opening…' : 'Open PDF'}
                      {!resource.loading && !resource.opening && <ExternalLink className="ml-1.5 inline h-3.5 w-3.5" />}
                    </button>
                    {canDeletePartsFiles && resource.attachment && (
                      <button
                        type="button"
                        onClick={() => { void deletePartsFile('parts_attachment', resource.attachment!.id, resource.displayName); }}
                        disabled={deletingId !== null}
                        aria-label={`Delete ${resource.displayName}`}
                        title={`Delete ${resource.displayName}`}
                        className="rounded-xl border border-ink-700 px-3 py-2.5 text-xs font-bold text-ink-500 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === resource.attachment.id ? 'Deleting…' : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
                {resource.error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{resource.error}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              aria-label="Search documents"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Part number, model, error code, procedure…"
              className="w-full rounded-xl border border-ink-700 bg-ink-950 py-2.5 pl-10 pr-3 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-brand-500"
            />
          </label>
          <select aria-label="Document type" value={type} onChange={event => setType(event.target.value)} className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-200 outline-none focus:border-brand-500">
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
            <article id={`knowledge-${result.chunk_id}`} key={result.chunk_id} className={cn('rounded-2xl border bg-ink-900 p-4 shadow-sm', selectedChunk === result.chunk_id ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-ink-700')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-400">{result.doc_type.replaceAll('_', ' ')}</span>
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', result.access_scope === 'staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{result.access_scope}</span>
                    {result.part_numbers?.slice(0, 6).map(part => <code key={part} className="rounded bg-ink-950 px-1.5 py-0.5 text-[11px] text-violet-300">{part}</code>)}
                  </div>
                  <h3 className="text-sm font-bold text-ink-100">{result.heading ?? result.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{result.citation_label ?? result.title}{pages(result) ? ` · ${pages(result)}` : ''}</p>
                </div>
                {(result.source_url || documents.some(doc => doc.id === result.document_id && doc.storage_path)) && (
                  <button onClick={() => openSource(result)} className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-ink-300 hover:border-brand-500 hover:text-brand-400">Open source <ExternalLink className="ml-1 inline h-3 w-3" /></button>
                )}
              </div>
              <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-ink-400">{result.content}</p>
              {result.models && result.models.length > 0 && <p className="mt-3 text-[11px] text-ink-500">Indexed models: {result.models.slice(0, 10).join(' · ')}</p>}
            </article>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-ink-400">Indexed source library</h2>
            <p className="mt-1 text-xs text-ink-500">{visibleDocuments.length} active source{visibleDocuments.length === 1 ? '' : 's'}; staff-only literature is never available to the public chat.</p>
          </div>
          {visibleDocuments.length === 0 && <p className="text-sm text-ink-400">No active sources match this document type.</p>}
          {groupedDocuments.map(([manufacturer, docs]) => (
            <div key={manufacturer} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <h3 className="mb-3 text-sm font-bold text-ink-200">{manufacturer}</h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {docs.map(document => (
                  <div key={document.id} className="flex items-stretch gap-2">
                    <button onClick={() => openSource(document)} disabled={!document.source_url && !document.storage_path} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-ink-800 bg-ink-950/60 p-3 text-left transition-colors enabled:hover:border-brand-500 disabled:cursor-default">
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-ink-200">{document.title}</span>
                        {/* revision "0" is import filler, not information */}
                        <span className="mt-1 block text-[10px] uppercase tracking-wider text-ink-500">{document.doc_type.replaceAll('_', ' ')}{document.revision && document.revision !== '0' ? ` · ${document.revision}` : ''}</span>
                      </span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', document.access_scope === 'staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{document.access_scope}</span>
                    </button>
                    {canDeletePartsFiles && document.storage_bucket === 'ari-knowledge-sources' && document.storage_path && (
                      <button
                        type="button"
                        onClick={() => { void deletePartsFile('knowledge_document', document.id, document.title); }}
                        disabled={deletingId !== null}
                        aria-label={`Delete ${document.title}`}
                        title={`Delete ${document.title}`}
                        className="rounded-xl border border-ink-700 px-3 text-ink-500 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
