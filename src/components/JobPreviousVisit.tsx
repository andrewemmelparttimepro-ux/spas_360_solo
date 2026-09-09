import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Snapshot = Record<string, unknown>;
interface PreviousVisit {
  source_job_id: string;
  source_status: string;
  job_snapshot: Snapshot;
  inventory_snapshot: Snapshot[];
  parts_snapshot: Snapshot[];
  assignments_snapshot: Snapshot[];
}
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export default function JobPreviousVisit({ jobId }: { jobId: string }) {
  const [visit, setVisit] = useState<PreviousVisit | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setVisit(null);
    setError(false);
    void supabase.from('job_visit_copies').select('*').eq('new_job_id', jobId).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setVisit(data as unknown as PreviousVisit | null);
      setError(Boolean(error));
    });
    return () => { active = false; };
  }, [jobId]);

  if (error) return <p role="alert" className="text-sm text-amber-600">Previous visit details could not load. Reopen this job to retry.</p>;
  if (!visit) return null;
  const amount = visit.job_snapshot.amount_to_collect;
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink-100">Previous visit</h2>
        <Link to={`/service/${visit.source_job_id}`} className="font-semibold text-brand-400 hover:underline">View original job and work history</Link>
      </div>
      <p className="mt-2">Details, notes and photos were carried forward. The following records describe the previous visit.</p>
      {amount != null && <p className="mt-2 font-semibold">Previous amount to collect: ${Number(amount).toLocaleString()}. Review and enter an amount for this visit if needed.</p>}
      {visit.inventory_snapshot.length > 0 && <div className="mt-3">
        <h3 className="font-semibold text-ink-200">Inventory from previous visit</h3>
        <ul className="mt-1 space-y-1">{visit.inventory_snapshot.map((item, index) => <li key={text(item.id) || index} className="break-words">{[item.brand, item.product, item.model, item.color_finish].map(text).filter(Boolean).join(' · ')}{item.sku ? ` · SKU ${text(item.sku)}` : ''}</li>)}</ul>
      </div>}
      {visit.parts_snapshot.length > 0 && <div className="mt-3">
        <h3 className="font-semibold text-ink-200">Parts from previous visit</h3>
        <ul className="mt-1 space-y-2">{visit.parts_snapshot.map((part, index) => <li key={text(part.id) || index} className="break-words">
          <p>{[part.part_number, part.description, part.status].map(text).filter(Boolean).join(' · ')}</p>
          {part.notes && <p className="whitespace-pre-wrap text-xs text-ink-500">{text(part.notes)}</p>}
        </li>)}</ul>
      </div>}
      {visit.assignments_snapshot.length > 0 && <p className="mt-3">Previous technicians: {visit.assignments_snapshot.map(item => text(item.name) || text(item.user_id)).join(', ')}</p>}
    </section>
  );
}
