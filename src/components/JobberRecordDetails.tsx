import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const nodes = (value: unknown): ObjectValue[] => {
  const list = Array.isArray(value) ? value : object(value).nodes;
  return Array.isArray(list) ? list.map(object) : [];
};
const when = (value: unknown) => {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(raw)) : 'Not recorded';
};
const money = (value: unknown) => typeof value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : '—';
const section = 'rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-3';

export function JobberRecordDetails({ raw, title }: { raw: unknown; title: string }) {
  const archive = object(raw);
  const record = object(archive.jobber_api);
  const notes = nodes(record.notes);
  const lines = nodes(record.lineItems);
  const files = nodes(archive.files);
  const visits = nodes(archive.visits);
  const links = nodes(archive.links);
  const customFields = nodes(record.customFields || record.customFieldValues);
  const payments = nodes(archive.payments);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const fileKey = files.map(f => text(f.storage_path) + '|' + text(f.preview_storage_path)).join('\n');

  useEffect(() => {
    let current = true;
    setSigned({}); setFileError(null);
    const paths = [...new Set(fileKey.split('\n').flatMap(line => line.split('|')).filter(Boolean))];
    if (!paths.length) return;
    void (async () => {
      const urls: Record<string, string> = {};
      for (let offset = 0; offset < paths.length; offset += 100) {
        const result = await supabase.storage.from('jobber-history').createSignedUrls(paths.slice(offset, offset + 100), 3600);
        if (result.error || result.data?.some(item => item.error || !item.signedUrl)) {
          if (current) setFileError('Some files could not be opened. Retry to refresh access.');
        }
        for (const item of result.data || []) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
      if (current) setSigned(urls);
    })();
    return () => { current = false; };
  }, [fileKey, retry]);

  const downloadUrl = (file: ObjectValue) => {
    const value = signed[text(file.storage_path)];
    if (!value) return undefined;
    const url = new URL(value);
    url.searchParams.set('download', text(file.file_name));
    return url.href;
  };
  const exportRecord = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${title.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 80)}-jobber-history.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!Object.keys(record).length) return null;
  return <>
    {links.length > 0 && <section className={section}><h2 className="font-semibold">Related history</h2><ul className="space-y-2">{links.map(link => <li key={text(link.id)}><Link className="text-brand-300 hover:underline" to={`/jobber-history/${text(link.id)}`}>{text(link.label)}</Link></li>)}</ul></section>}
    {[record.instructions, record.message, record.description].some(value => text(value)) && <section className={section}><h2 className="font-semibold">Details</h2>{[...new Set([record.instructions, record.message, record.description].map(text).filter(Boolean))].map((value, i) => <p key={i} className="whitespace-pre-wrap break-words text-sm text-ink-200">{value}</p>)}</section>}
    {customFields.length > 0 && <section className={section}><h2 className="font-semibold">Additional information</h2><dl className="grid gap-3 sm:grid-cols-2">{customFields.map((field, i) => <div key={i}><dt className="text-xs text-ink-400">{text(field.label)}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{Object.entries(field).filter(([key]) => key.startsWith('value')).map(([, value]) => typeof value === 'object' ? JSON.stringify(value) : String(value)).join(' · ')}</dd></div>)}</dl></section>}
    {lines.length > 0 && <section className={section}><h2 className="font-semibold">Line items ({lines.length})</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-400"><th className="py-2">Item</th><th className="px-3">Quantity</th><th className="px-3">Unit price</th><th className="text-right">Total</th></tr></thead><tbody>{lines.map((line, i) => <tr key={text(line.id) || i} className="border-t border-ink-700"><td className="py-3"><p>{text(line.name)}</p><p className="whitespace-pre-wrap text-xs text-ink-400">{text(line.description)}</p></td><td className="px-3">{text(line.quantity ?? line.qty)}</td><td className="px-3">{money(line.unitPrice)}</td><td className="text-right">{money(line.totalPrice)}</td></tr>)}</tbody></table></div></section>}
    {visits.length > 0 && <section className={section}><h2 className="font-semibold">Visits ({visits.length})</h2><ul className="divide-y divide-ink-700">{visits.map((visit, i) => <li key={text(visit.id) || i} className="py-3"><p className="text-sm font-medium">{text(visit.title) || 'Visit'}</p><p className="mt-1 text-xs text-ink-400">{when(visit.startAt)} CT · {text(visit.visitStatus).replaceAll('_', ' ')}</p>{text(visit.instructions) && <p className="mt-2 whitespace-pre-wrap text-sm">{text(visit.instructions)}</p>}{text(visit.history_id) && <Link className="mt-2 inline-block text-sm text-brand-300" to={`/jobber-history/${text(visit.history_id)}`}>Open visit history</Link>}</li>)}</ul></section>}
    {'notes' in record && <section className={section}><h2 className="font-semibold">Notes ({notes.length})</h2>{notes.length ? <ul className="space-y-4">{notes.map((note, i) => <li key={text(note.id) || i} className="rounded-lg border border-ink-700 p-4"><p className="text-xs text-ink-400">{when(note.createdAt)} CT{note.pinned ? ' · Pinned' : ''}{text(note.__typename) === 'ClientNote' ? ' · Customer note' : ''}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-200">{text(note.message) || '(Attachment note)'}</p>{text(note.lastEditedAt) && <p className="mt-2 text-xs text-ink-500">Edited {when(note.lastEditedAt)} CT</p>}</li>)}</ul> : <p className="text-sm text-ink-400">No notes were returned for this record.</p>}</section>}
    {('noteAttachments' in record || files.length > 0) && <section className={section}><h2 className="font-semibold">Photos and files ({files.length})</h2>{fileError && <p role="alert" className="text-sm text-amber-300">{fileError} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry files</button></p>}{files.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{files.map((file, i) => {
      const path = text(file.storage_path);
      const preview = text(file.preview_storage_path) || (/^image\/(jpeg|png|webp|gif|avif)$/.test(text(file.content_type)) ? path : '');
      return <article key={text(file.id) || i} className="overflow-hidden rounded-lg border border-ink-700">{preview && signed[preview] && <a href={signed[preview]} target="_blank" rel="noreferrer"><img loading="lazy" src={signed[preview]} alt={text(file.file_name)} className="h-40 w-full bg-ink-950 object-contain" /></a>}<div className="space-y-2 p-3"><p className="break-words text-xs">{text(file.file_name)}</p><p className="text-xs text-ink-500">{typeof file.file_size === 'number' ? `${(file.file_size / 1024).toFixed(1)} KB` : ''}</p>{path ? signed[path] ? <a className="text-sm text-brand-300 hover:underline" href={downloadUrl(file)} target="_blank" rel="noreferrer">Download original</a> : <span className="text-xs text-ink-400">Preparing file access…</span> : <p className="text-xs text-amber-300">Original file has not been copied yet.</p>}</div></article>;
    })}</div> : <p className="text-sm text-ink-400">No attachments were returned for this record.</p>}</section>}
    {payments.length > 0 && <section className={section}><h2 className="font-semibold">Recorded payments ({payments.length})</h2><ul className="space-y-2 text-sm">{payments.map((payment, i) => <li key={text(payment.id) || i}>{when(payment.entryDate)} CT · {money(payment.rawAmount ?? payment.amount)} · {text(payment.paymentType)}</li>)}</ul></section>}
    <section className={section}><h2 className="font-semibold">Source record</h2><p className="text-sm text-ink-400">The captured record preserves additional source fields and associations.</p><button className="text-sm text-brand-300 hover:underline" onClick={exportRecord}>Download captured record</button><details><summary className="cursor-pointer text-xs text-ink-400">View captured fields</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-ink-950 p-3 text-xs">{JSON.stringify(record, null, 2)}</pre></details></section>
  </>;
}
