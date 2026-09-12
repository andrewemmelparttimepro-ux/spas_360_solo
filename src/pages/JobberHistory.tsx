import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { JobberRecordDetails } from '@/components/JobberRecordDetails';

type HistorySummary = {
  addresses?: string[];
  phones?: { number: string; primary?: boolean }[];
  billing_address?: string | null;
  note_count?: number; visit_count?: number; file_count?: number;
  emails?: { address: string; description?: string; primary?: boolean }[];
  company_name?: string | null;
  property_count?: number;
  total?: number | null;
  job_type?: string;
  start_at?: string | null;
  completed_at?: string | null;
  next_visit?: { date?: string } | null;
  tags?: { label?: string; name?: string }[];
};

export type JobberHistoryRow = {
  id: string; contact_id: string | null; source_account_name: string; source_account_key: string;
  record_kind: string; source_id: string; source_client_id: string;
  source_number: string | null; source_url: string | null;
  title: string; client_name: string; source_status: string | null;
  occurred_at: string | null; source_updated_at: string | null; captured_at: string;
  summary: HistorySummary; coverage: string; match_status: string; match_reason: string;
  candidate_contact_ids?: string[];
  raw?: unknown;
};

const FIELDS = 'id,contact_id,source_account_name,source_account_key,record_kind,source_id,source_client_id,source_number,source_url,title,client_name,source_status,occurred_at,source_updated_at,captured_at,summary,coverage,match_status,match_reason';
const KINDS: Record<string, string> = { job: 'Jobs', client: 'Customers', visit: 'Visits', property: 'Properties', quote: 'Quotes', request: 'Requests', invoice: 'Invoices', payment: 'Payments', product: 'Products and services', expense: 'Expenses', timesheet: 'Timesheets', task: 'Tasks', user: 'Staff', account: 'Account information', tax_rate: 'Tax rates', custom_field: 'Custom fields', vehicle: 'Vehicles', payout: 'Payouts', expense_document: 'Expense documents', expense_upload: 'Expense uploads', marketing_task: 'Marketing tasks', marketing_item: 'Marketing history', event: 'Calendar events', assessment: 'Assessments', communication: 'Communications' };
const OWNER_KINDS = new Set(['user', 'timesheet', 'account', 'payout', 'expense_document', 'expense_upload', 'communication']);
const recordTitle = (row: JobberHistoryRow) => row.record_kind === 'property' ? row.summary.addresses?.[0] || 'Property' : row.title;
const PAGE_SIZE = 50;
const control = 'rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200';
const date = (value?: string | null) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not captured';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(value));
};
const status = (value?: string | null) => value ? value.replaceAll('_', ' ') : 'Not applicable';

function Coverage({ coverage }: { coverage?: string }) {
  return <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
    {coverage === 'summary' ? 'This record currently contains a summary. Detailed history is being imported.' : 'Imported Jobber history. Daily scheduling remains in Schedule; open work and balances require reconciliation before cutover.'}
  </p>;
}

export default function JobberHistory() {
  const { id } = useParams();
  return id ? <HistoryDetail id={id} /> : <HistoryList />;
}

function HistoryList() {
  const { profile, activeLocationId, locations, setActiveLocation } = useAuth();
  const [params, setParams] = useSearchParams();
  const contactId = params.get('contact');
  const sourceClient = params.get('source_client');
  const sourceAccount = params.get('account');
  const kind = KINDS[params.get('kind') || ''] ? params.get('kind')! : 'job';
  const review = params.get('review') === '1';
  const [search, setSearch] = useState(params.get('q') || '');
  const [query, setQuery] = useState(search);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<JobberHistoryRow[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(0); }, [query, kind, review, contactId, sourceClient, sourceAccount, activeLocationId]);
  useEffect(() => {
    if (!profile) return;
    let current = true;
    setBusy(true); setError(null);
    let request = supabase.from('jobber_history').select(FIELDS, { count: 'exact' })
      .eq('org_id', profile.org_id).eq('record_kind', kind)
      .order('occurred_at', { ascending: false, nullsFirst: false }).order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (activeLocationId) request = request.eq('location_id', activeLocationId);
    if (contactId) request = request.eq('contact_id', contactId);
    if (sourceClient && sourceAccount) request = request.eq('source_client_id', sourceClient).eq('source_account_key', sourceAccount);
    if (review) request = request.eq('match_status', 'review');
    if (query) request = request.ilike('search_text', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
    void request.then(result => {
      if (!current) return;
      if (result.error) { setError('Could not load Jobber history. Please retry.'); setRows([]); setCount(0); }
      else { setRows((result.data || []) as JobberHistoryRow[]); setCount(result.count || 0); }
      setBusy(false);
    });
    return () => { current = false; };
  }, [profile, activeLocationId, contactId, sourceClient, sourceAccount, kind, review, query, page, retry]);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setPage(0); setParams(next);
  };
  return <div className="max-w-6xl mx-auto space-y-4 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-ink-100">Jobber History</h1><p className="mt-1 text-sm text-ink-400">Customer, service and sales history from both stores.</p></div>
      <Link className="text-sm text-brand-300 hover:underline" to={contactId ? `/customers/${contactId}` : '/customers'}>{contactId ? 'Back to customer' : 'Customers'}</Link>
    </div>
    <Coverage />
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="History store" className={control} value={activeLocationId || ''} onChange={e => setActiveLocation(e.target.value || null)}>
        <option value="">Both stores</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select aria-label="Record type" className={control} value={kind} onChange={e => update('kind', e.target.value)}>{Object.entries(KINDS).filter(([value]) => profile?.role === 'owner_manager' || !OWNER_KINDS.has(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Customer matching" className={control} value={review ? '1' : ''} onChange={e => update('review', e.target.value || null)}><option value="">All records</option><option value="1">Customer match needs review</option></select>
      <label className="relative flex-1 min-w-52"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" /><input aria-label="Search Jobber history" placeholder="Name, number, phone, address or note" value={search} onChange={e => setSearch(e.target.value)} className={`${control} w-full pl-9`} /></label>
    </div>
    {contactId && <p className="text-sm text-ink-400">Showing history linked to this customer. <button className="text-brand-300 hover:underline" onClick={() => update('contact', null)}>Show all customers</button></p>}
    {sourceClient && sourceAccount && <p className="text-sm text-ink-400">Showing records for this Jobber customer. <Link className="text-brand-300 hover:underline" to="/jobber-history">Show all customers</Link></p>}
    <div aria-live="polite" className="text-sm text-ink-400">{busy ? 'Loading history…' : `${count.toLocaleString()} ${KINDS[kind].toLowerCase()}${review ? ' needing a customer match' : ''}`}</div>
    {error && <div role="alert" className="text-red-300">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {!busy && !error && rows.length === 0 && <p className="rounded-xl border border-ink-700 p-8 text-center text-ink-400">No captured records match these filters.</p>}
    <div className={`space-y-2 ${busy ? 'opacity-50' : ''}`}>
      {rows.map(row => <Link key={row.id} to={`/jobber-history/${row.id}`} className="block rounded-xl border border-ink-700 bg-ink-900 p-4 hover:border-brand-500">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold text-ink-100">{row.source_number && <span className="text-ink-400">#{row.source_number} · </span>}{recordTitle(row)}</h2><span className="text-xs text-ink-400">{row.source_account_name}</span></div>
        <p className="mt-1 text-sm text-ink-300">{kind === 'job' || kind === 'communication' ? `${row.client_name} · ` : ''}<span className="capitalize">{status(row.source_status)}</span></p>
        {row.summary.addresses?.length ? <p className="mt-1 text-sm text-ink-400">{row.summary.addresses.join(' • ')}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">{row.occurred_at && <span>Date: {date(row.occurred_at)} CT</span>}<span className={row.match_status === 'review' ? 'text-amber-300' : 'text-emerald-400'}>{row.contact_id ? 'Linked to SPAS customer' : row.match_status === 'not_applicable' ? 'Store record' : 'Customer match needs review'}</span></div>
      </Link>)}
    </div>
    <div className="flex items-center justify-between gap-3 text-sm text-ink-400">
      <button className={`${control} disabled:opacity-40`} disabled={busy || page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
      <span>{count ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count.toLocaleString()}` : '0 records'}</span>
      <button className={`${control} disabled:opacity-40`} disabled={busy || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage(p => p + 1)}>Next</button>
    </div>
  </div>;
}

function HistoryDetail({ id }: { id: string }) {
  const { profile } = useAuth();
  const [row, setRow] = useState<JobberHistoryRow | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [message, setMessage] = useState('Loading record…');
  useEffect(() => {
    if (!profile) return;
    let current = true;
    setRow(null); setCandidates([]); setMessage('Loading record…');
    void (async () => {
      const result = await supabase.from('jobber_history').select(`${FIELDS},candidate_contact_ids,raw`).eq('org_id', profile.org_id).eq('id', id).maybeSingle();
      if (!current) return;
      if (result.error || !result.data) { setMessage('This record could not be loaded. Return to Jobber History and try again.'); return; }
      const record = result.data as JobberHistoryRow;
      setRow(record);
      if (record.match_status === 'review' && record.candidate_contact_ids?.length) {
        const response = await supabase.from('contacts').select('id,first_name,last_name').eq('org_id', profile.org_id).in('id', record.candidate_contact_ids);
        if (current) setCandidates(response.data || []);
      }
    })();
    return () => { current = false; };
  }, [id, profile]);
  if (!row) return <div className="space-y-4"><Link className="text-brand-300" to="/jobber-history">Back to Jobber History</Link><p role="status">{message}</p></div>;
  const customer = row.record_kind === 'client';
  return <div className="max-w-4xl mx-auto space-y-5 pb-8">
    <Link to="/jobber-history" className="inline-flex items-center gap-2 text-sm text-brand-300"><ArrowLeft className="h-4 w-4" />Jobber History</Link>
    <div><p className="text-sm text-ink-400">{row.source_account_name} · {KINDS[row.record_kind] || row.record_kind}{row.source_number ? ` #${row.source_number}` : ''}</p><h1 className="mt-1 text-2xl font-bold text-ink-100">{recordTitle(row)}</h1></div>
    <Coverage coverage={row.coverage} />
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-3">
      <h2 className="text-lg font-semibold">{row.client_name}</h2>
      {row.contact_id ? <Link className="text-brand-300 hover:underline" to={`/customers/${row.contact_id}`}>Open SPAS customer</Link> : row.match_status === 'not_applicable' ? <p className="text-ink-400">Store history record</p> : <p className="text-amber-300">Customer match needs review. This record is preserved here while the match is confirmed.</p>}
      <p className="text-sm text-ink-400">{row.match_status === 'created' ? 'Linked to a customer imported from Jobber.' : row.match_reason}</p>
      {candidates.length > 0 && <div className="text-sm"><p className="text-ink-400">Possible existing customers:</p><ul className="mt-1 space-y-1">{candidates.map(c => <li key={c.id}><Link className="text-brand-300 hover:underline" to={`/customers/${c.id}`}>{c.first_name} {c.last_name}</Link></li>)}</ul></div>}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-sm">
        <div><dt className="text-ink-500">Jobber status</dt><dd className="mt-1 capitalize">{row.source_status ? status(row.source_status) : 'Not applicable'}</dd></div>
        {row.record_kind === 'job' && <div><dt className="text-ink-500">Job type</dt><dd className="mt-1">{row.summary.job_type === 'ONE_OFF' ? 'One-off' : row.summary.job_type === 'RECURRING' ? 'Recurring' : 'Not captured'}</dd></div>}
        {(customer || row.record_kind === 'job' || Boolean(row.summary.addresses?.length)) && <div className="sm:col-span-2"><dt className="text-ink-500">Service / property address</dt><dd className="mt-1">{row.summary.addresses?.length ? row.summary.addresses.map((a, i) => <p key={i}>{a}</p>) : 'Not captured'}</dd></div>}
        {customer ? <>
          <div><dt className="text-ink-500">Email</dt><dd className="mt-1">{row.summary.emails?.length ? row.summary.emails.map((e, i) => <p key={i}>{e.address}{e.primary ? ' (primary)' : ''}</p>) : 'Not captured'}</dd></div>
          <div><dt className="text-ink-500">Phone</dt><dd className="mt-1">{row.summary.phones?.length ? row.summary.phones.map((p, i) => <p key={i}>{p.number}{p.primary ? ' (primary)' : ''}</p>) : row.coverage === 'summary' ? 'Pending detailed export' : 'Not recorded'}</dd></div>
          {row.summary.billing_address && <div className="sm:col-span-2"><dt className="text-ink-500">Billing address</dt><dd className="mt-1">{row.summary.billing_address}</dd></div>}
          {row.summary.company_name && <div className="sm:col-span-2"><dt className="text-ink-500">Jobber company field</dt><dd className="mt-1 whitespace-pre-wrap">{row.summary.company_name}</dd></div>}
          <div><dt className="text-ink-500">Properties listed in Jobber</dt><dd className="mt-1">{row.summary.property_count ?? 'Not captured'} · {row.summary.addresses?.length || 0} addresses captured</dd></div>
          <div><dt className="text-ink-500">Updated in Jobber</dt><dd className="mt-1">{date(row.source_updated_at)} CT</dd></div>
        </> : <>
          {row.summary.start_at && <div><dt className="text-ink-500">Start (Central time)</dt><dd className="mt-1">{date(row.summary.start_at)}</dd></div>}
          {row.summary.completed_at && <div><dt className="text-ink-500">Completed (Central time)</dt><dd className="mt-1">{date(row.summary.completed_at)}</dd></div>}
          {row.summary.next_visit?.date && <div><dt className="text-ink-500">Next visit shown in captured list</dt><dd className="mt-1">{date(row.summary.next_visit.date)}</dd></div>}
          {row.summary.total != null && <div><dt className="text-ink-500">Recorded total</dt><dd className="mt-1">{row.summary.total == null ? 'Not captured' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.summary.total)}<p className="mt-1 text-xs text-ink-500">Historical amount; balance due has not been reconciled.</p></dd></div>}
        </>}
      </dl>
    </section>
    <section className="rounded-xl border border-ink-700 p-5 space-y-2 text-sm text-ink-400">
      <p>Captured {date(row.captured_at)} CT from {row.source_account_name}.</p>
      {row.source_url && <a className="inline-flex items-center gap-2 text-brand-300 hover:underline" href={row.source_url} target="_blank" rel="noreferrer">{row.record_kind === 'communication' ? 'Open communications report in Jobber' : 'Open original in Jobber'}<ExternalLink className="h-4 w-4" /></a>}
      <p className="text-xs">The original link requires access to this store in Jobber.</p>
    </section>
    <JobberRecordDetails raw={row.raw} title={recordTitle(row)} />
    {customer && row.contact_id && <Link className="inline-block text-brand-300 hover:underline" to={`/jobber-history?contact=${row.contact_id}`}>View this customer's imported jobs</Link>}
    {!row.contact_id && customer && <Link className="inline-block text-brand-300 hover:underline" to={`/jobber-history?source_client=${encodeURIComponent(row.source_id)}&account=${row.source_account_key}`}>View this customer's captured jobs</Link>}
  </div>;
}

export function JobberHistoryPanel({ contactId }: { contactId: string }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<JobberHistoryRow[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!profile || profile.role === 'technician') return;
    let current = true;
    void supabase.from('jobber_history').select(FIELDS, { count: 'exact' }).eq('org_id', profile.org_id).eq('contact_id', contactId)
      .order('occurred_at', { ascending: false, nullsFirst: false }).order('id').limit(5).then(result => {
        if (!current) return;
        setError(Boolean(result.error)); setRows((result.data || []) as JobberHistoryRow[]); setCount(result.count || 0);
      });
    return () => { current = false; };
  }, [contactId, profile]);
  if (!error && !count) return null;
  return <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Jobber History {count ? `(${count})` : ''}</h2><Link className="text-sm text-brand-300 hover:underline" to={`/jobber-history?contact=${contactId}`}>View history</Link></div>
    <p className="mt-2 text-xs text-ink-400">Imported Jobber records. Open a record to see its captured details and files.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-300">History could not be loaded. Open View history to retry.</p> : <ul className="mt-3 divide-y divide-ink-800">{rows.map(row => <li key={row.id} className="py-2"><Link className="text-sm text-brand-300 hover:underline" to={`/jobber-history/${row.id}`}>{row.source_number ? `#${row.source_number} · ` : `${row.record_kind === 'client' ? 'Customer' : KINDS[row.record_kind] || row.record_kind} · `}{recordTitle(row)}</Link><p className="mt-0.5 text-xs text-ink-500 capitalize">{row.source_account_name} · {status(row.source_status)}</p>{row.summary.addresses?.length ? <p className="mt-1 text-xs text-ink-400">Service address: {row.summary.addresses.join(' • ')}</p> : null}</li>)}</ul>}
  </section>;
}
