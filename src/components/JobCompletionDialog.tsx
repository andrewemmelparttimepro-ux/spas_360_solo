import { useRef, useState } from 'react';
import { useModal } from '@/hooks/useModal';
import { supabase } from '@/lib/supabase';

export interface JobCompletionResult { job_id: string; new_visit_id: string | null }

export default function JobCompletionDialog({ jobId, jobTitle, onClose, onCompleted }: {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  onCompleted: (result: JobCompletionResult) => void | Promise<void>;
}) {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, dialogProps } = useModal(() => { if (!busy.current) onClose(); });

  const complete = async (newVisit: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const { data, error: failure } = await supabase.rpc('complete_job_visit', {
        p_job_id: jobId, p_new_visit: newVisit,
      });
      if (failure) throw failure;
      const result = data as unknown as JobCompletionResult;
      if (!result?.job_id || (newVisit && !result.new_visit_id)) throw new Error('Completion was not confirmed. Retry to check the same visit.');
      await onCompleted(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (failure as { message?: string })?.message || 'Completion was not confirmed. Retry to check the same visit.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div ref={dialogRef} {...dialogProps} aria-labelledby="complete-job-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl">
        <h2 id="complete-job-title" className="text-lg font-bold text-ink-100">Complete this visit?</h2>
        <p className="mt-2 break-words text-sm font-semibold text-ink-200">{jobTitle}</p>
        <p className="mt-2 text-sm text-ink-400">Close the job, or complete this visit and add a follow-up to Unscheduled with its details, notes and photos.</p>
        <p className="mt-2 text-xs text-ink-500">Previous work and any amount to collect stay available for reference. Review the amount before collecting for the new visit.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" disabled={saving} onClick={() => void complete(false)} className="rounded-lg bg-[#374151] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Close job'}</button>
          <button type="button" disabled={saving} onClick={() => void complete(true)} className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Schedule New Visit</button>
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 disabled:opacity-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
