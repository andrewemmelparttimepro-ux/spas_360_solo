import { useState, useEffect, useCallback } from 'react';
import { X, Check, UserCheck, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

/**
 * Guided new-customer flow: chips + progressive steps, every earlier answer
 * stays re-selectable. Creates contact → deal → mandatory follow-up task,
 * with duplicate detection by phone/name so nobody double-enters a customer.
 */

const SOURCES = ['Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other'] as const;
const INTERESTS = ['Hot Tub', 'Swim Spa', 'Sauna', 'Cold Plunge', 'Game Room', 'Parts & Chemicals'] as const;
const PRIORITIES = [
  { value: 'High', label: 'High', hint: 'Could close within a week' },
  { value: 'Medium', label: 'Medium', hint: 'Closing in 2–4 weeks' },
  { value: 'Low', label: 'Low', hint: 'Long-term nurture' },
] as const;

interface DupeMatch { id: string; first_name: string; last_name: string; phone: string }

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors',
        done ? 'bg-brand-500 text-white' : 'bg-ink-800 text-ink-400'
      )}>
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </span>
      <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
    </div>
  );
}

function Chip({ active, onClick, children, hint }: { active: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-all text-left',
        active
          ? 'bg-brand-500/15 border-brand-500 text-brand-300'
          : 'bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-300'
      )}
    >
      {children}
      {hint && <span className={cn('block text-[11px] font-normal mt-0.5', active ? 'text-brand-400/80' : 'text-ink-500')}>{hint}</span>}
    </button>
  );
}

const inputClass = 'w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-sm text-ink-100 placeholder-ink-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 transition-all';

export default function NewCustomerWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: (dealId: string | null) => void }) {
  const { profile, user } = useAuth();
  const { toast } = useToast();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dupe, setDupe] = useState<DupeMatch | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState<string | null>(null);
  const [followupDate, setFollowupDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [firstNote, setFirstNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Duplicate detection — Brandon's double-entry pain, caught at the source
  const checkDupe = useCallback(async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 && !(first && last)) { setDupe(null); return; }
    let q = supabase.from('contacts').select('id, first_name, last_name, phone').limit(1);
    if (digits.length >= 7) {
      q = q.ilike('phone', `%${digits.slice(-7)}%`);
    } else {
      q = q.ilike('first_name', first).ilike('last_name', last);
    }
    const { data } = await q;
    setDupe(data?.[0] ?? null);
    if (!data?.[0]) setUseExisting(false);
  }, [phone, first, last]);

  useEffect(() => {
    const t = setTimeout(checkDupe, 400);
    return () => clearTimeout(t);
  }, [checkDupe]);

  const step1Done = useExisting || (first.trim().length > 0 && last.trim().length > 0 && phone.trim().length >= 7);
  const step2Done = source !== null;
  const step3Done = interests.length > 0;
  const step4Done = priority !== null;
  const step5Done = followupDate.length > 0;
  const canCreate = step1Done && step2Done && step3Done && step4Done && step5Done && !saving;

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const handleCreate = async () => {
    if (!profile || !user || !canCreate) return;
    setSaving(true);
    try {
      // 1. Contact — reuse the existing record if the dupe check matched
      let contactId = useExisting ? dupe!.id : null;
      let contactFirst = useExisting ? dupe!.first_name : first.trim();
      if (!contactId) {
        const { data, error } = await supabase.from('contacts').insert({
          org_id: profile.org_id,
          location_id: profile.location_id ?? null,
          first_name: first.trim(),
          last_name: last.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          lead_source: source,
          customer_type: 'Lead',
          assigned_to: user.id,
        }).select('id, first_name').single();
        if (error) throw new Error(error.message);
        contactId = data.id;
        contactFirst = data.first_name;
      }

      // 2. Deal — lands in the first pipeline stage
      const { data: stage, error: stageErr } = await supabase
        .from('pipeline_stages').select('id').eq('org_id', profile.org_id).order('position').limit(1).single();
      if (stageErr || !stage) throw new Error('No pipeline stages configured');
      const title = `${useExisting ? dupe!.last_name : last.trim()} – ${interests[0]}`;
      const { data: deal, error: dealErr } = await supabase.from('deals').insert({
        org_id: profile.org_id,
        contact_id: contactId,
        stage_id: stage.id,
        title,
        amount: amount ? parseFloat(amount) : null,
        priority,
        lead_source: source,
        product_interest: interests,
        assigned_to: user.id,
        location_id: profile.location_id ?? null,
        position: 0,
      }).select('id').single();
      if (dealErr) throw new Error(dealErr.message);

      // 3. Mandatory follow-up task — every lead gets one, no exceptions
      const { error: taskErr } = await supabase.from('tasks').insert({
        org_id: profile.org_id,
        assigned_to: user.id,
        created_by: user.id,
        contact_id: contactId,
        deal_id: deal.id,
        title: `Follow up with ${contactFirst}`,
        due_at: `${followupDate}T09:00:00`,
        priority: priority === 'High' ? 'High' : priority === 'Low' ? 'Low' : 'Medium',
        status: 'Pending',
        task_type: 'Follow-up',
      });
      if (taskErr) throw new Error(taskErr.message);

      // 4. Optional first note
      if (firstNote.trim()) {
        await supabase.from('notes').insert({
          contact_id: contactId, deal_id: deal.id, body: firstNote.trim(), created_by: user.id,
        });
      }

      toast(`${contactFirst} added — follow-up scheduled`, 'success');
      onCreated?.(deal.id);
      onClose();
    } catch (err) {
      toast(`Couldn't create customer: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-ink-900 border border-ink-700 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-ink-700 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ink-100">New Customer</h2>
            <p className="text-xs text-ink-500 mt-0.5">Guided clicks — every answer stays changeable.</p>
          </div>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Step 1 — who */}
          <section>
            <StepHeader n={1} title="Who is this?" done={step1Done} />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="First name *" value={first} onChange={e => setFirst(e.target.value)} className={inputClass} disabled={useExisting} />
              <input placeholder="Last name *" value={last} onChange={e => setLast(e.target.value)} className={inputClass} disabled={useExisting} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Phone *" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} disabled={useExisting} />
              <input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} disabled={useExisting} />
            </div>
            {dupe && (
              <div className={cn(
                'mt-3 px-3.5 py-2.5 rounded-lg border text-sm flex items-center justify-between gap-3',
                useExisting ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              )}>
                <span className="flex items-center gap-2 min-w-0">
                  {useExisting ? <UserCheck className="w-4 h-4 shrink-0" /> : <Phone className="w-4 h-4 shrink-0" />}
                  <span className="truncate">
                    {useExisting
                      ? <>Using existing customer <strong>{dupe.first_name} {dupe.last_name}</strong></>
                      : <><strong>{dupe.first_name} {dupe.last_name}</strong> ({dupe.phone}) already exists</>}
                  </span>
                </span>
                <button
                  onClick={() => setUseExisting(v => !v)}
                  className="text-xs font-semibold underline underline-offset-2 shrink-0 hover:opacity-80"
                >
                  {useExisting ? 'Create new instead' : 'Use existing'}
                </button>
              </div>
            )}
          </section>

          {/* Step 2 — source */}
          <section>
            <StepHeader n={2} title="How did they find us?" done={step2Done} />
            <div className="flex flex-wrap gap-2">
              {SOURCES.map(s => <Chip key={s} active={source === s} onClick={() => setSource(s)}>{s}</Chip>)}
            </div>
          </section>

          {/* Step 3 — interest */}
          <section>
            <StepHeader n={3} title="What are they interested in?" done={step3Done} />
            <div className="flex flex-wrap gap-2 mb-3">
              {INTERESTS.map(i => <Chip key={i} active={interests.includes(i)} onClick={() => toggleInterest(i)}>{i}</Chip>)}
            </div>
            <input placeholder="Estimated value $ (optional)" type="number" value={amount} onChange={e => setAmount(e.target.value)} className={cn(inputClass, 'max-w-[220px]')} />
          </section>

          {/* Step 4 — priority */}
          <section>
            <StepHeader n={4} title="How hot is this lead?" done={step4Done} />
            <div className="grid grid-cols-3 gap-2">
              {PRIORITIES.map(p => (
                <Chip key={p.value} active={priority === p.value} onClick={() => setPriority(p.value)} hint={p.hint}>{p.label}</Chip>
              ))}
            </div>
          </section>

          {/* Step 5 — mandatory follow-up */}
          <section>
            <StepHeader n={5} title="First follow-up (required)" done={step5Done} />
            <p className="text-xs text-ink-500 mb-3 -mt-1 ml-9">Every lead gets a follow-up — no customer falls through the cracks.</p>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={followupDate} onChange={e => setFollowupDate(e.target.value)} className={inputClass} />
              <input placeholder="Quick note (optional)" value={firstNote} onChange={e => setFirstNote(e.target.value)} className={inputClass} />
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-ink-700 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-300 hover:bg-ink-800 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-5 py-2 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
          >
            {saving ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
