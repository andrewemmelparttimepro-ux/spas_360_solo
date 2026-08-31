import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, UserCheck, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useModal } from '@/hooks/useModal';
import { normalizeCustomerAddress } from '@/lib/customerAddress';

/**
 * Guided new-customer flow: chips + progressive steps, every earlier answer
 * stays re-selectable. Creates contact → deal → mandatory follow-up task,
 * with duplicate detection by phone/name so nobody double-enters a customer.
 */

const SOURCES = ['Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other'] as const;
const INTERESTS = [
  'Hot Tubs',
  'Swim Spas',
  'Saunas',
  'Game Room',
  'Pools',
  'Patio Furniture',
  'Gazebo',
  'Massage Chair',
  'Other',
] as const;
const PRIORITIES = [
  { value: 'High', label: 'High', hint: 'Could close within a week' },
  { value: 'Medium', label: 'Medium', hint: 'Closing in 2–4 weeks' },
  { value: 'Low', label: 'Low', hint: 'Long-term nurture' },
] as const;

interface DupeMatch {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  customer_type: string;
  assigned_to: string | null;
  assigned?: { first_name: string; last_name: string } | null;
}

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

export default function NewCustomerWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: (dealId: string | null) => void | Promise<void> }) {
  const { dialogRef, dialogProps } = useModal(onClose);
  const { profile, user, activeLocationId } = useAuth();
  const { toast } = useToast();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [matches, setMatches] = useState<DupeMatch[]>([]);
  const [existing, setExisting] = useState<DupeMatch | null>(null); // chosen existing customer
  const navigate = useNavigate();
  const [source, setSource] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState<string | null>(null);
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [followupDate, setFollowupDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [firstNote, setFirstNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Live typeahead — existing customers surface as you type (name or phone)
  const searchMatches = useCallback(async () => {
    if (existing) return; // already locked onto one
    const digits = phone.replace(/\D/g, '');
    const name = (first + last).trim();
    if (digits.length < 3 && name.length < 2) { setMatches([]); return; }
    const { data } = await supabase.rpc('find_contact_duplicates', {
      p_phone: phone || null,
      p_email: email || null,
      p_first_name: first || null,
      p_last_name: last || null,
      p_limit: 4,
    });
    setMatches((data as unknown as DupeMatch[]) ?? []);
  }, [phone, email, first, last, existing]);

  useEffect(() => {
    const t = setTimeout(searchMatches, 300);
    return () => clearTimeout(t);
  }, [searchMatches]);

  const step1Done = !!existing || (first.trim().length > 0 && last.trim().length > 0 && phone.trim().length >= 7);
  const step2Done = source !== null;
  const step3Done = interests.length > 0;
  const step4Done = priority !== null && expectedCloseDate.length > 0;
  const step5Done = followupDate.length > 0;
  const doneCount = [step1Done, step2Done, step3Done, step4Done, step5Done].filter(Boolean).length;
  const canCreate = step1Done && step2Done && step3Done && step4Done && step5Done && !saving;

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const handleCreate = async () => {
    if (!profile || !user || !canCreate) return;
    setSaving(true);
    try {
      const creationLocationId = activeLocationId ?? profile.location_id ?? null;

      // 1. Contact — reuse the existing record if one was selected
      let contactId = existing ? existing.id : null;
      let contactFirst = existing ? existing.first_name : first.trim();
      if (!contactId) {
        const { data, error } = await supabase.rpc('create_contact_guarded', {
          p_first_name: first.trim(),
          p_last_name: last.trim(),
          p_phone: phone.trim(),
          p_email: email.trim() || null,
          p_lead_source: source,
          p_location_id: creationLocationId,
          p_assigned_to: user.id,
          p_customer_type: 'Lead',
        });
        if (error) throw new Error(error.message);
        const result = data as { created?: boolean; contact?: { id: string; first_name: string }; duplicates?: DupeMatch[] } | null;
        if (!result?.created || !result.contact) {
          setMatches(result?.duplicates ?? []);
          toast('An exact phone or email match already exists. Choose that customer before creating the deal.', 'error');
          return;
        }
        const createdContactId = result.contact.id;
        const mailingAddress = normalizeCustomerAddress(address);
        if (mailingAddress) {
          const { data: savedContact, error: addressError } = await supabase
            .from('contacts')
            .update({ mailing_address: mailingAddress })
            .eq('id', createdContactId)
            .eq('org_id', profile.org_id)
            .select('id, mailing_address')
            .single();
          if (addressError) throw new Error(`Customer was created, but the address could not be saved: ${addressError.message}`);
          if (savedContact?.mailing_address !== mailingAddress) throw new Error('Customer was created, but the saved address could not be verified');
        }
        contactId = createdContactId;
        contactFirst = result.contact.first_name;
      }

      // 2. Deal — lands in the first pipeline stage
      const { data: stage, error: stageErr } = await supabase
        .from('pipeline_stages').select('id').eq('org_id', profile.org_id).order('position').limit(1).single();
      if (stageErr || !stage) throw new Error('No pipeline stages configured');
      // Commission stays with the customer's salesperson; the person entering gets logged
      const creditTo = existing?.assigned_to ?? user.id;
      const enteredByOther = creditTo !== user.id;
      const title = `${existing ? existing.last_name : last.trim()} – ${interests[0]}`;
      const { data: deal, error: dealErr } = await supabase.from('deals').insert({
        org_id: profile.org_id,
        contact_id: contactId,
        stage_id: stage.id,
        title,
        amount: amount ? parseFloat(amount) : null,
        priority,
        lead_source: source,
        product_interest: interests,
        expected_close_date: expectedCloseDate,
        assigned_to: creditTo,
        location_id: creationLocationId,
        position: 0,
      }).select('id').single();
      if (dealErr) throw new Error(dealErr.message);

      // Entered on someone else's customer → notify the assigned salesperson.
      // The database audit trail records who created the deal; customer Notes
      // remain reserved for notes a teammate intentionally adds.
      if (enteredByOther && existing) {
        await supabase.from('notifications').insert({
          user_id: creditTo, type: 'deal',
          title: `New deal on your customer: ${title}`,
          body: `Entered by ${profile.first_name} ${profile.last_name} — credited to you.`,
          link: `/deals/${deal.id}`,
        });
      }

      // 3. Mandatory follow-up task — every lead gets one, no exceptions
      const { error: taskErr } = await supabase.from('tasks').insert({
        org_id: profile.org_id,
        assigned_to: creditTo,
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
      // The caller's post-create refresh is the handoff to customer search.
      // Wait for it so the wizard cannot disappear while the old list is still visible.
      await onCreated?.(deal.id);
      onClose();
    } catch (err) {
      toast(`Couldn't create customer: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div ref={dialogRef} {...dialogProps} aria-label="New customer" className="bg-ink-900 border border-ink-700 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col outline-none">
        <div className="px-6 pt-5 pb-4 border-b border-ink-700 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-100">New Customer</h2>
              <p className="text-xs text-ink-500 mt-0.5">Guided clicks — every answer stays changeable.</p>
            </div>
            <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          {/* Endowed progress: the follow-up step is genuinely pre-completed, so this never starts at 0% */}
          <div className="mt-3.5">
            <div className="flex justify-between items-baseline text-[10px] font-semibold mb-1.5">
              <span className="text-ink-400">{doneCount} of 5 complete</span>
              {step5Done && doneCount < 5 && <span className="text-brand-400">Follow-up already set for you ✓</span>}
            </div>
            <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${(doneCount / 5) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Step 1 — who */}
          <section>
            <StepHeader n={1} title="Who is this?" done={step1Done} />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="First name *" value={first} onChange={e => setFirst(e.target.value)} className={inputClass} disabled={!!existing} />
              <input placeholder="Last name *" value={last} onChange={e => setLast(e.target.value)} className={inputClass} disabled={!!existing} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Phone *" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} disabled={!!existing} />
              <input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} disabled={!!existing} />
            </div>
            <label className="mt-3 block" htmlFor="new-customer-address">
              <span className="mb-1.5 block text-[11px] font-semibold text-ink-400">Customer Address (Optional)</span>
              <textarea
                id="new-customer-address"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Street, city, state, ZIP"
                rows={2}
                className={cn(inputClass, 'resize-y')}
                disabled={!!existing}
              />
            </label>

            {/* Locked onto an existing customer */}
            {existing && (
              <div className="mt-3 px-3.5 py-2.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-sm flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0 text-emerald-300">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    <strong>{existing.first_name} {existing.last_name}</strong>
                    {existing.assigned && <> · {existing.assigned.first_name} {existing.assigned.last_name}'s customer — they keep the commission</>}
                  </span>
                </span>
                <button onClick={() => setExisting(null)} className="text-xs font-semibold text-emerald-300 underline underline-offset-2 shrink-0 hover:opacity-80">
                  Unlink
                </button>
              </div>
            )}

            {/* Live matches while typing — click the name to open their card */}
            {!existing && matches.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <p className="px-3.5 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Already in the system?
                </p>
                {matches.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5 border-t border-amber-500/10 hover:bg-amber-500/10 transition-colors">
                    <button
                      onClick={() => { onClose(); navigate(`/customers/${m.id}`); }}
                      className="min-w-0 flex-1 text-left group"
                      title="Open customer card"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100 group-hover:text-brand-300 group-hover:underline underline-offset-2">
                        {m.first_name} {m.last_name}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </span>
                      <span className="block text-xs text-ink-500 truncate">
                        {m.phone} · {m.customer_type}
                        {m.assigned && <> · assigned to {m.assigned.first_name} {m.assigned.last_name}</>}
                      </span>
                    </button>
                    <button
                      onClick={() => { setExisting(m); setMatches([]); }}
                      className="text-xs font-bold text-brand-300 bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
                    >
                      Use for this deal
                    </button>
                  </div>
                ))}
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
            <label className="block max-w-[220px]" htmlFor="new-customer-estimated-value">
              <span className="mb-1.5 block text-[11px] font-semibold text-ink-400">Estimated Value (Optional)</span>
              <input id="new-customer-estimated-value" placeholder="$" type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} />
            </label>
          </section>

          {/* Step 4 — priority and an explicit forecast date */}
          <section>
            <StepHeader n={4} title="How hot is this lead, and when could it close?" done={step4Done} />
            <div className="grid grid-cols-3 gap-2">
              {PRIORITIES.map(p => (
                <Chip key={p.value} active={priority === p.value} onClick={() => setPriority(p.value)} hint={p.hint}>{p.label}</Chip>
              ))}
            </div>
            <div className="mt-3 max-w-[240px]">
              <label className="block text-[11px] font-semibold text-ink-400 mb-1.5" htmlFor="new-customer-expected-close">
                Expected close date *
              </label>
              <input
                id="new-customer-expected-close"
                type="date"
                value={expectedCloseDate}
                onChange={e => setExpectedCloseDate(e.target.value)}
                className={inputClass}
              />
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
