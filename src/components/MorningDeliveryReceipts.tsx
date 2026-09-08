import { useState } from 'react';
import { supabase } from '@/lib/supabase';
type Receipt = { id: string; day: string; to_email: string; status: string; provider_event: string | null; provider_checked_at: string | null; verification_error?: string; error: string | null };
export default function MorningDeliveryReceipts() {
  const [rows,setRows] = useState<Receipt[]>([]);
  const [error,setError] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const check = async () => {
    setBusy(true);setError(null);
    try {
      const {data} = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in again to read delivery receipts.');
      const response = await fetch('/api/owners/morning-email?receipts=1', { headers: {Authorization:`Bearer ${data.session.access_token}`}, signal:AbortSignal.timeout(100_000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Receipts unavailable.');
      setRows(body.receipts);
    } catch (e) {setError(e instanceof Error ? e.message : 'Receipt check failed.');}
    finally {setBusy(false);}
  };
  return <details><summary className="cursor-pointer text-sm font-semibold text-ink-100">Morning email receipts</summary><p className="my-2 text-xs text-ink-500">Check provider status without sending an email. Accepted means the provider accepted the request; delivered means the recipient mail server accepted it, not that a person read it.</p><button disabled={busy} onClick={() => void check()} className="rounded-lg border border-ink-700 px-3 py-2 text-sm text-ink-100">{busy ? 'Checking receipts…' : 'Check recent receipts'}</button>{error && <p role="alert" className="text-sm text-amber-600">{error}</p>}<div className="mt-2 space-y-2">{rows.map(row=><div key={row.id} className="rounded-lg bg-ink-950 p-3 text-xs text-ink-400"><p>{row.day} · {row.to_email}</p><p>{row.provider_event ?? (row.status === 'sent' ? 'Accepted · delivery not verified' : row.status)}</p>{row.provider_checked_at && <p>Checked {new Date(row.provider_checked_at).toLocaleString()}</p>}{(row.verification_error || row.error) && <p className="text-amber-600">{row.verification_error || row.error}</p>}</div>)}</div></details>;
}
