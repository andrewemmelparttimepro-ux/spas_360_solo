import { useEffect, useMemo, useState } from 'react';
import { X, Handshake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { Contact, DealPriority, PipelineStage } from '@/types/database';

// Quick deal creation for a KNOWN customer — the fast lane next to the full
// NewCustomerWizard. Same doctrine: commission stays with the customer's
// assigned salesperson, and every deal leaves with a follow-up task. No exceptions.

const INTERESTS = ['Hot Tub', 'Swim Spa', 'Sauna', 'Cold Plunge', 'Game Room', 'Parts & Chemicals'] as const;
const PRIORITIES: { value: DealPriority; label: string }[] = [
  { value: 'High', label: 'High — close in a week' },
  { value: 'Medium', label: 'Medium — 2–4 weeks' },
  { value: 'Low', label: 'Low — nurture' },
];
const FOLLOW_UPS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
] as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
        active ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200'
      )}
    >
      {children}
    </button>
  );
}

export default function QuickDealModal({ contactId, stageId, onClose, onCreated }: {
  contactId: string;
  stageId?: string; // pre-picked when the card was dropped on a stage column
  onClose: () => void;
  onCreated?: (dealId: string) => void;
}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [contact, setContact] = useState<(Contact & { assigned?: { first_name: string; last_name: string } | null }) | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stage, setStage] = useState<string>(stageId ?? '');
  const [interests, setInterests] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState<DealPriority>('Medium');
  const [followUpDays, setFollowUpDays] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('contacts').select('*, assigned:assigned_to(first_name, last_name)').eq('id', contactId).single()
      .then(({ data, error }) => {
        if (error) { console.error('QuickDeal: contact load failed', error); toast('Could not load that customer', 'error'); onClose(); return; }
        setContact(data as typeof contact);
      });
    supabase.from('pipeline_stages').select('*').eq('org_id', profile.org_id).order('position')
      .then(({ data }) => {
        const open = (data ?? []).filter(s => !s.name.startsWith('Closed'));
        setStages(open);
        if (!stageId && open.length > 0) setStage(open[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, profile?.org_id]);

  // Auto-title mirrors the wizard's "{Last} – {interest}" ritual; backs off once hand-edited
  useEffect(() => {
    if (titleTouched || !contact) return;
    setTitle(interests.length > 0 ? `${contact.last_name} – ${interests[0]}` : '');
  }, [interests, contact, titleTouched]);

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const canCreate = useMemo(() => !!contact && !!stage && title.trim().length > 0, [contact, stage, title]);

  const handleCreate = async () => {
    if (!profile || !user || !contact || !canCreate || saving) return;
    setSaving(true);
    try {
      // Commission integrity: credit the customer's salesperson, log the enterer
      const creditTo = contact.assigned_to ?? user.id;
      const enteredByOther = creditTo !== user.id;

      const { data: deal, error: dealErr } = await supabase.from('deals').insert({
        org_id: profile.org_id,
        contact_id: contact.id,
        stage_id: stage,
        title: title.trim(),
        amount: amount ? parseFloat(amount) : null,
        priority,
        lead_source: contact.lead_source,
        product_interest: interests.length > 0 ? interests : null,
        assigned_to: creditTo,
        location_id: contact.location_id ?? profile.location_id ?? null,
        position: 0,
      }).select('id').single();
      if (dealErr) throw new Error(dealErr.message);

      if (enteredByOther) {
        const assignedName = contact.assigned ? `${contact.assigned.first_name} ${contact.assigned.last_name}` : 'the assigned salesperson';
        await supabase.from('notes').insert({
          contact_id: contact.id, deal_id: deal.id,
          body: `✏️ Deal entered by ${profile.first_name} ${profile.last_name} — credited to ${assignedName} (assigned salesperson).`,
          created_by: user.id,
        });
        await supabase.from('notifications').insert({
          user_id: creditTo, type: 'deal',
          title: `New deal on your customer: ${title.trim()}`,
          body: `Entered by ${profile.first_name} ${profile.last_name} — credited to you.`,
          link: `/deals/${deal.id}`,
        });
      }

      // Mandatory follow-up — every deal gets one, no exceptions
      const due = new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000);
      const dueDate = due.toISOString().slice(0, 10);
      const { error: taskErr } = await supabase.from('tasks').insert({
        org_id: profile.org_id,
        assigned_to: creditTo,
        created_by: user.id,
        contact_id: contact.id,
        deal_id: deal.id,
        title: `Follow up with ${contact.first_name}`,
        due_at: `${dueDate}T09:00:00`,
        priority: priority === 'High' ? 'High' : priority === 'Low' ? 'Low' : 'Medium',
        status: 'Pending',
        task_type: 'Follow-up',
      });
      if (taskErr) throw new Error(taskErr.message);

      toast(`Deal created for ${contact.first_name} — follow-up scheduled`, 'success');
      onCreated?.(deal.id);
      onClose();
    } catch (err) {
      toast(`Couldn't create deal: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-ink-900 border border-ink-700 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-ink-700 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-100 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-brand-400" />
              New Deal{contact ? ` — ${contact.first_name} ${contact.last_name}` : ''}
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {contact?.assigned
                ? `Credited to ${contact.assigned.first_name} ${contact.assigned.last_name} (assigned salesperson)`
                : 'Lands on the pipeline with a follow-up already set'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {!contact ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5 overflow-y-auto">
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">What are they shopping for?</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map(i => <Chip key={i} active={interests.includes(i)} onClick={() => toggleInterest(i)}>{i}</Chip>)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Deal title *</p>
                <input value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} placeholder="e.g. Wyant – Hot Tub" className={inputClass} />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Amount ($)</p>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Optional" className={inputClass} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Stage</p>
              <select value={stage} onChange={e => setStage(e.target.value)} className={inputClass}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Priority</p>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map(p => <Chip key={p.value} active={priority === p.value} onClick={() => setPriority(p.value)}>{p.label}</Chip>)}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Follow-up (required)</p>
              <div className="flex flex-wrap gap-2">
                {FOLLOW_UPS.map(f => <Chip key={f.days} active={followUpDays === f.days} onClick={() => setFollowUpDays(f.days)}>{f.label}</Chip>)}
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-ink-700 shrink-0 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-400 hover:text-ink-200">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
