import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  DownloadCloud,
  ExternalLink,
  Loader2,
  Plug,
  RotateCcw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

type Provider = 'hubspot' | 'jobber';
type RunStatus = 'queued' | 'running' | 'awaiting_review' | 'completed' | 'failed' | 'cancelled';

type Connection = {
  id: string;
  provider: Provider;
  status: 'connected' | 'needs_reauth' | 'disconnected' | 'error';
  external_account_name: string | null;
  external_account_id: string | null;
  connected_at: string;
  last_scan_at: string | null;
  last_error: string | null;
  configured: boolean;
};

type MigrationRun = {
  id: string;
  connection_id: string | null;
  source_run_id: string | null;
  run_type: 'scan' | 'import' | 'rollback';
  provider: Provider;
  status: RunStatus;
  phase: string;
  progress: number;
  totals: Record<string, number | Record<string, number>>;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type StatusResponse = {
  providers: Record<Provider, { configured: boolean }>;
  connections: Connection[];
  runs: MigrationRun[];
};

type Preview = {
  run: MigrationRun;
  objects: Record<string, Record<string, number>>;
  issues: string[];
  record_count: number;
};

const PROVIDERS: Array<{ id: Provider; name: string; description: string; color: string }> = [
  { id: 'hubspot', name: 'HubSpot', description: 'Customers, companies, deals, activities, tasks, and supporting CRM records.', color: 'text-orange-300 bg-orange-500/10 border-orange-500/25' },
  { id: 'jobber', name: 'Jobber', description: 'Clients, service jobs, requests, quotes, invoices, and source history.', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
];

const TERMINAL = new Set<RunStatus>(['awaiting_review', 'completed', 'failed', 'cancelled']);
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const when = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never';

export default function MigrationCenter() {
  const { profile, session } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Provider, Preview>>>({});
  const [busy, setBusy] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const driving = useRef(new Set<string>());

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!session?.access_token) throw new Error('Your session expired. Sign in again.');
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(init.headers || {}),
      },
    });
    if (response.status === 204) return {} as T;
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || `Migration request failed (${response.status})`);
    return data;
  }, [session?.access_token]);

  const loadPreview = useCallback(async (provider: Provider, runId: string) => {
    try {
      const preview = await api<Preview>(`/api/migrations/preview?run_id=${encodeURIComponent(runId)}`);
      if (mounted.current) setPreviews(current => ({ ...current, [provider]: preview }));
    } catch {
      // The status view remains useful if preview details cannot be loaded yet.
    }
  }, [api]);

  const loadStatus = useCallback(async () => {
    const next = await api<StatusResponse>('/api/migrations/status');
    if (!mounted.current) return next;
    setStatus(next);
    setError(null);
    for (const provider of PROVIDERS) {
      const scan = next.runs.find(run => run.provider === provider.id && run.run_type === 'scan' && run.status === 'awaiting_review');
      if (scan) void loadPreview(provider.id, scan.id);
    }
    return next;
  }, [api, loadPreview]);

  const driveRun = useCallback(async (initial: MigrationRun) => {
    if (driving.current.has(initial.id)) return;
    driving.current.add(initial.id);
    setBusy(initial.provider);
    let run = initial;
    try {
      while (mounted.current && !TERMINAL.has(run.status)) {
        const result = await api<{ run: MigrationRun }>('/api/migrations/process', {
          method: 'POST',
          body: JSON.stringify({ run_id: run.id }),
        });
        run = result.run;
        setStatus(current => current ? {
          ...current,
          runs: [run, ...current.runs.filter(item => item.id !== run.id)],
        } : current);
        if (!TERMINAL.has(run.status)) await wait(450);
      }
      await loadStatus();
      if (run.status === 'awaiting_review') {
        await loadPreview(run.provider, run.id);
        toast(`${run.provider === 'hubspot' ? 'HubSpot' : 'Jobber'} scan is ready to review`, 'success');
      } else if (run.status === 'completed') {
        toast(`${titleCase(run.run_type)} completed and reconciled`, 'success');
      } else if (run.status === 'failed') {
        throw new Error(run.error || 'Migration run failed');
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'Migration run failed';
      if (mounted.current) setError(message);
      toast(message, 'error');
      await loadStatus().catch(() => undefined);
    } finally {
      driving.current.delete(initial.id);
      if (mounted.current) setBusy(current => current === initial.provider ? null : current);
    }
  }, [api, loadPreview, loadStatus, toast]);

  useEffect(() => {
    mounted.current = true;
    if (profile?.role !== 'owner_manager') return () => { mounted.current = false; };
    const params = new URLSearchParams(window.location.search);
    const migration = params.get('migration');
    const provider = params.get('provider');
    if (migration === 'connected') toast(`${provider === 'jobber' ? 'Jobber' : 'HubSpot'} connected. You can scan it now.`, 'success');
    if (migration === 'error') toast(params.get('message') || 'The provider connection was not completed', 'error');
    if (migration) {
      params.delete('migration'); params.delete('provider'); params.delete('message');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
    loadStatus()
      .then(next => {
        for (const run of next.runs.filter(item => item.status === 'queued' || item.status === 'running')) void driveRun(run);
      })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Could not load Migration Center'))
      .finally(() => mounted.current && setLoading(false));
    return () => { mounted.current = false; };
  }, [driveRun, loadStatus, profile?.role, toast]);

  const connections = useMemo(() => Object.fromEntries((status?.connections || []).map(connection => [connection.provider, connection])) as Partial<Record<Provider, Connection>>, [status]);

  const connect = async (provider: Provider) => {
    setBusy(provider); setError(null);
    try {
      const result = await api<{ url: string }>('/api/migrations/authorize', {
        method: 'POST', body: JSON.stringify({ provider, return_to: '/settings#migration-center' }),
      });
      window.location.assign(result.url);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Could not start authorization';
      setError(message); toast(message, 'error'); setBusy(null);
    }
  };

  const start = async (provider: Provider, action: 'scan' | 'import' | 'rollback', sourceRunId?: string) => {
    if (action === 'import' && !window.confirm('Import the reviewed source records into SPAS 360 now? Every change will be recorded for rollback.')) return;
    if (action === 'rollback' && !window.confirm('Roll back only the records changed by this import? Current unrelated SPAS 360 data will be left alone.')) return;
    setBusy(provider); setError(null);
    try {
      const result = await api<{ run: MigrationRun }>('/api/migrations/start', {
        method: 'POST', body: JSON.stringify({ action, provider, source_run_id: sourceRunId }),
      });
      setStatus(current => current ? { ...current, runs: [result.run, ...current.runs] } : current);
      await driveRun(result.run);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Could not start migration';
      setError(message); toast(message, 'error'); setBusy(null);
    }
  };

  const disconnect = async (provider: Provider) => {
    if (!window.confirm(`Disconnect ${provider === 'hubspot' ? 'HubSpot' : 'Jobber'}? Existing scan and import reports will be retained.`)) return;
    setBusy(provider);
    try {
      await api('/api/migrations/disconnect', { method: 'POST', body: JSON.stringify({ provider }) });
      await loadStatus();
      toast('Provider disconnected and stored tokens were removed', 'success');
    } catch (disconnectError) {
      const message = disconnectError instanceof Error ? disconnectError.message : 'Could not disconnect provider';
      setError(message); toast(message, 'error');
    } finally { setBusy(null); }
  };

  if (profile?.role !== 'owner_manager') return null;

  return (
    <section id="migration-center" className="rounded-xl border border-brand-500/25 bg-ink-900 shadow-sm overflow-hidden">
      <div className="border-b border-ink-700 bg-gradient-to-r from-brand-500/10 via-transparent to-transparent p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
            <DownloadCloud className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink-100">Move existing data into SPAS 360</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
              Connect each system securely, scan without changing SPAS 360, review the exact counts and exceptions, then approve an auditable import with rollback.
            </p>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Owner only
          </span>
        </div>
      </div>

      <div className="space-y-4 p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading secure connections…</div>
        ) : (
          PROVIDERS.map(provider => {
            const connection = connections[provider.id];
            const providerRuns = (status?.runs || []).filter(run => run.provider === provider.id);
            const activeRun = providerRuns.find(run => run.status === 'queued' || run.status === 'running');
            const latestScan = providerRuns.find(run => run.run_type === 'scan' && run.status === 'awaiting_review');
            const latestImport = providerRuns.find(run => run.run_type === 'import' && run.status === 'completed');
            const preview = previews[provider.id];
            const configured = status?.providers[provider.id].configured ?? false;
            const connected = connection?.status === 'connected';
            const isBusy = busy === provider.id;
            const importFailures = Number(latestImport?.totals.failed || 0);
            const importedRecords = Number(latestImport?.totals.imported || 0);
            return (
              <article key={provider.id} className="rounded-xl border border-ink-700 bg-ink-950/70 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${provider.color}`}>
                    <Database className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-100">{provider.name}</h3>
                      {connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Connected</span>
                      ) : connection?.status === 'needs_reauth' ? (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Reconnect needed</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{provider.description}</p>
                    {connection && connected && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
                        <span className="text-ink-300">{connection.external_account_name || `${provider.name} account`}</span>
                        <span>Last scan: {when(connection.last_scan_at)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {!connected ? (
                      <button
                        onClick={() => connect(provider.id)} disabled={!configured || isBusy}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                        {configured ? `Connect ${provider.name}` : 'Connector setup required'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => start(provider.id, 'scan')} disabled={isBusy || Boolean(activeRun)}
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                          {latestScan ? 'Scan again' : 'Scan account'}
                        </button>
                        <button onClick={() => disconnect(provider.id)} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs font-medium text-ink-400 hover:border-red-500/30 hover:text-red-300 disabled:opacity-50">
                          <Unplug className="h-3.5 w-3.5" /> Disconnect
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {activeRun && (
                  <div className="mt-4 rounded-lg border border-brand-500/20 bg-brand-500/5 p-3">
                    <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium text-brand-200"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {titleCase(activeRun.phase)}</span><span className="font-mono text-brand-300">{activeRun.progress}%</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${activeRun.progress}%` }} /></div>
                  </div>
                )}

                {latestScan && preview && (
                  <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900 p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-200"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Read-only preview ready</p>
                        <p className="mt-1 text-[11px] text-ink-500">{preview.record_count.toLocaleString()} source records preserved · {preview.issues.length} review item{preview.issues.length === 1 ? '' : 's'}</p>
                      </div>
                      <button onClick={() => start(provider.id, 'import', latestScan.id)} disabled={isBusy || Boolean(activeRun)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-ink-950 hover:bg-emerald-400 disabled:opacity-50">
                        <DownloadCloud className="h-3.5 w-3.5" /> Approve and import
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Object.entries(preview.objects).slice(0, 12).map(([objectType, dispositions]) => (
                        <div key={objectType} className="rounded-lg border border-ink-800 bg-ink-950 px-2.5 py-2">
                          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-500">{titleCase(objectType)}</p>
                          <p className="mt-0.5 font-mono text-sm text-ink-200">{Object.values(dispositions).reduce((sum, count) => sum + count, 0).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    {preview.issues.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                        <p className="font-semibold">Review before cutover</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-100/80">{preview.issues.slice(0, 4).map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}

                {latestImport && (
                  <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs ${importFailures > 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-emerald-500/15 bg-emerald-500/5'}`}>
                    <span className={`flex items-center gap-2 ${importFailures > 0 ? 'text-amber-200' : 'text-emerald-200'}`}>
                      {importFailures > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      {importFailures > 0
                        ? `Import finished with ${importedRecords.toLocaleString()} imported and ${importFailures.toLocaleString()} exception${importFailures === 1 ? '' : 's'}`
                        : `Last import reconciled ${when(latestImport.completed_at)}`}
                    </span>
                    <button onClick={() => start(provider.id, 'rollback', latestImport.id)} disabled={isBusy || Boolean(activeRun)} className="inline-flex items-center gap-1.5 text-ink-400 hover:text-amber-300 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Roll back this import</button>
                  </div>
                )}

                {!configured && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300/80"><AlertTriangle className="h-3.5 w-3.5" /> NDAI must finish the provider app registration before this connector can authorize an account.</p>
                )}
                {connection?.last_error && <p className="mt-3 text-[11px] text-red-300">{connection.last_error}</p>}
              </article>
            );
          })
        )}
        <div className="flex items-start gap-2 rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-500">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Each provider shows its own permission screen. SPAS 360 never receives Brandon’s passwords, never writes during a scan, and keeps unsupported source records in the migration ledger instead of silently dropping them.
        </div>
      </div>
    </section>
  );
}
