import { useEffect, useMemo, useState } from 'react';
import { X, Handshake, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { Contact, DealLeadSource, DealPriority, PipelineStage } from '@/types/database';
import { useModal } from '@/hooks/useModal';
import { filterCustomersByNamePrefix } from '@/lib/customerSearch';

// Quick deal creation for an existing customer. Customer-specific entry points
// preselect that customer; the Deals page uses the same form with customer search.
// Every deal leaves with a follow-up task. No exceptions.

type QuickDealContact = Contact & { assigned?: { first_name: string; last_name: string } | null };
type DealOwner = { id: string; first_name: string; last_name: string };
const UNSELECTED_OWNER = '__select_owner__';

const PRIORITIES: { value: DealPriority; label: string }[] = [
  { value: 'High', label: 'High — close in a week' },
  { value: 'Medium', label: 'Medium — 2–4 weeks' },
  { value: 'Low', label: 'Low — nurture' },
];
function nextLocalDate(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const LEAD_SOURCE_OPTIONS = [
  { label: 'Facebook', storedValue: 'Facebook' },
  { label: 'Google', storedValue: 'Google' },
  { label: 'Radio', storedValue: 'Radio' },
  { label: 'Tv', storedValue: 'Tv' },
  { label: 'Website', storedValue: 'Website' },
  { label: 'Referral', storedValue: 'Referral' },
  { label: 'Called In', storedValue: 'Called In' },
  { label: 'Walk-In', storedValue: 'Walk-In' },
  { label: 'Off-Site Show/Event', storedValue: 'Off-Site Show/Event' },
] as const satisfies readonly { label: string; storedValue: DealLeadSource }[];
type DealLeadSourceChoice = (typeof LEAD_SOURCE_OPTIONS)[number]['label'];

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
  contactId?: string;
  stageId?: string; // pre-picked when the card was dropped on a stage column
  onClose: () => void;
  onCreated?: (dealId: string) => void;
}) {
  const { dialogRef, dialogProps } = useModal(onClose);
  const { profile, user, activeLocationId } = useAuth();
  const { toast } = useToast();
  const [contact, setContact] = useState<QuickDealContact | null>(null);
  const [customers, setCustomers] = useState<QuickDealContact[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(!contactId);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stage, setStage] = useState<string>(stageId ?? '');
  const [dealOwners, setDealOwners] = useState<DealOwner[]>([]);
  const [dealOwner, setDealOwner] = useState(UNSELECTED_OWNER);
  const [interest, setInterest] = useState('');
  const [leadSource, setLeadSource] = useState<DealLeadSourceChoice>('Walk-In');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [amount, setAmount] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [priority, setPriority] = useState<DealPriority>('Medium');
  const [nextActivityDate, setNextActivityDate] = useState(nextLocalDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    const loadCustomers = async () => {
      if (contactId) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*, assigned:assigned_to(first_name, last_name)')
          .eq('id', contactId)
          .single();
        if (cancelled) return;
        if (error) {
          console.error('QuickDeal: contact load failed', error);
          toast('Could not load that customer', 'error');
          onClose();
          return;
        }
        const selected = data as QuickDealContact;
        setContact(selected);
        setDealOwner(selected.assigned_to ?? user?.id ?? UNSELECTED_OWNER);
        return;
      }

      setCustomersLoading(true);
      const pageSize = 1000;
      const allCustomers: QuickDealContact[] = [];
      for (let from = 0; ; from += pageSize) {
        let query = supabase
          .from('contacts')
          .select('*, assigned:assigned_to(first_name, last_name)')
          .eq('org_id', profile.org_id)
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (activeLocationId) query = query.eq('location_id', activeLocationId);
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          console.error('QuickDeal: customer list load failed', error);
          toast('Could not load the customer list', 'error');
          setCustomersLoading(false);
          return;
        }
        const page = (data ?? []) as QuickDealContact[];
        allCustomers.push(...page);
        if (page.length < pageSize) break;
      }
      if (!cancelled) {
        const seen = new Set<string>();
        setCustomers(allCustomers.filter(customer => !seen.has(customer.id) && (seen.add(customer.id), true)));
        setCustomersLoading(false);
      }
    };

    void loadCustomers();
    void supabase.from('pipeline_stages').select('*').eq('org_id', profile.org_id).order('position')
      .then(({ data }) => {
        if (cancelled) return;
        const open = (data ?? []).filter(s => !s.is_won && !s.is_lost);
        setStages(open);
        if (!stageId && open.length > 0) setStage(open[0].id);
      });
    void supabase.from('profiles')
      .select('id, first_name, last_name')
      .eq('org_id', profile.org_id)
      .in('role', ['owner_manager', 'service_manager', 'salesperson'])
      .order('first_name')
      .then(({ data }) => {
        if (cancelled) return;
        setDealOwners((data ?? []) as DealOwner[]);
        if (!contactId) setDealOwner(user?.id ?? UNSELECTED_OWNER);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, profile?.org_id, activeLocationId]);

  // Auto-title mirrors the wizard's "{Last} – {interest}" ritual; backs off once hand-edited
  useEffect(() => {
    if (titleTouched || !contact) return;
    const trimmedInterest = interest.trim();
    setTitle(trimmedInterest ? `${contact.last_name} – ${trimmedInterest}` : '');
  }, [interest, contact, titleTouched]);

  const canCreate = useMemo(
    () => !!contact && !!stage && dealOwner !== UNSELECTED_OWNER && title.trim().length > 0 && nextActivityDate.length > 0 && expectedCloseDate.length > 0,
    [contact, stage, dealOwner, title, nextActivityDate, expectedCloseDate]
  );

  const matchingCustomers = useMemo(
    () => filterCustomersByNamePrefix(customers, customerSearch).slice(0, 8),
    [customers, customerSearch]
  );
  const selectedDealOwner = useMemo(
    () => dealOwners.find(owner => owner.id === dealOwner) ?? null,
    [dealOwners, dealOwner]
  );

  const chooseCustomer = (selection: QuickDealContact) => {
    setContact(selection);
    setDealOwner(selection.assigned_to ?? user?.id ?? UNSELECTED_OWNER);
    setCustomerSearch(`${selection.first_name} ${selection.last_name}`.trim());
  };

  const handleCreate = async () => {
    if (!profile || !user || !contact || !canCreate || saving) return;
    setSaving(true);
    try {
      const storedLeadSource = LEAD_SOURCE_OPTIONS.find(option => option.label === leadSource)?.storedValue;
      if (!storedLeadSource) throw new Error('Choose a lead source');

      // Default to the customer's salesperson, while honoring the explicit Deal Owner field.
      const creditTo = dealOwner;
      const enteredByOther = creditTo !== user.id;

      const { data: deal, error: dealErr } = await supabase.from('deals').insert({
        org_id: profile.org_id,
        contact_id: contact.id,
        stage_id: stage,
        title: title.trim(),
        amount: amount ? parseFloat(amount) : null,
        priority,
        lead_source: storedLeadSource,
        product_interest: interest.trim() ? [interest.trim()] : null,
        expected_close_date: expectedCloseDate,
        assigned_to: creditTo,
        location_id: contact.location_id ?? profile.location_id ?? null,
        position: 0,
      }).select('id').single();
      if (dealErr) throw new Error(dealErr.message);

      // Mandatory follow-up — every deal gets one, no exceptions
      const { error: taskErr } = await supabase.from('tasks').insert({
        org_id: profile.org_id,
        assigned_to: creditTo,
        created_by: user.id,
        contact_id: contact.id,
        deal_id: deal.id,
        title: `Follow up with ${contact.first_name}`,
        due_at: `${nextActivityDate}T09:00:00`,
        priority: priority === 'High' ? 'High' : priority === 'Low' ? 'Low' : 'Medium',
        status: 'Pending',
        task_type: 'Follow-up',
      });
      if (taskErr) {
        // Do not leave an active deal behind without the required next activity.
        await supabase.from('deals').delete().eq('id', deal.id);
        throw new Error(taskErr.message);
      }

      if (enteredByOther) {
        await supabase.from('notifications').insert({
          user_id: creditTo, type: 'deal',
          title: `New deal assigned to you: ${title.trim()}`,
          body: `Entered by ${profile.first_name} ${profile.last_name}.`,
          link: `/deals/${deal.id}`,
        });
      }

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
      <div ref={dialogRef} {...dialogProps} aria-label="New deal" className="bg-ink-900 border border-ink-700 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col outline-none">
        <div className="px-6 pt-5 pb-4 border-b border-ink-700 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-100 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-brand-400" />
              New Deal{contact ? ` — ${contact.first_name} ${contact.last_name}` : ''}
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {selectedDealOwner
                ? `Deal owner: ${selectedDealOwner.first_name} ${selectedDealOwner.last_name}`
                : 'Lands on the pipeline with a follow-up already set'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {contactId && !contact ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5 overflow-y-auto">
            {!contactId && (
              <div>
                <label htmlFor="deal-customer-search" className="block text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">
                  Existing Customer *
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    id="deal-customer-search"
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setContact(null); }}
                    placeholder="Start typing a customer name…"
                    aria-label="Search existing customers"
                    autoComplete="off"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950">
                  {customersLoading ? (
                    <p className="px-3 py-3 text-xs text-ink-500">Loading customer list…</p>
                  ) : matchingCustomers.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-ink-500">No matching customers.</p>
                  ) : matchingCustomers.map(customer => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => chooseCustomer(customer)}
                      aria-pressed={contact?.id === customer.id}
                      className={cn(
                        'block w-full border-b border-ink-800 px-3 py-2 text-left last:border-b-0 hover:bg-brand-500/10',
                        contact?.id === customer.id && 'bg-brand-500/15'
                      )}
                    >
                      <span className="block text-sm font-semibold text-ink-200">{customer.first_name} {customer.last_name}</span>
                      <span className="block text-[11px] text-ink-500">{customer.phone} · {customer.customer_type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="deal-interest" className="block text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">
                What are they shopping for?
              </label>
              <input
                id="deal-interest"
                value={interest}
                onChange={e => setInterest(e.target.value)}
                placeholder="e.g. Sundance Aspen or a replacement cover"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="deal-lead-source" className="block text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">
                Lead Source
              </label>
              <select
                id="deal-lead-source"
                value={leadSource}
                onChange={e => setLeadSource(e.target.value as DealLeadSourceChoice)}
                className={inputClass}
                required
              >
                {LEAD_SOURCE_OPTIONS.map(option => (
                  <option key={option.label} value={option.label}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Deal Title *</p>
              <input value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} placeholder="e.g. Wyant – Hot Tub" className={inputClass} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Stage *</p>
                <select value={stage} onChange={e => setStage(e.target.value)} className={inputClass}>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Deal Owner *</p>
                <select value={dealOwner} onChange={e => setDealOwner(e.target.value)} className={inputClass}>
                  <option value={UNSELECTED_OWNER} disabled>Select an owner</option>
                  {dealOwners.map(owner => <option key={owner.id} value={owner.id}>{owner.first_name} {owner.last_name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Set Next Activity Date *</p>
                <input type="date" value={nextActivityDate} onChange={e => setNextActivityDate(e.target.value)} className={inputClass} required />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Projected $ Amount</p>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Optional" className={inputClass} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Priority</p>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map(p => <Chip key={p.value} active={priority === p.value} onClick={() => setPriority(p.value)}>{p.label}</Chip>)}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Expected close date *</p>
              <input type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} className={inputClass} />
              <p className="mt-1.5 text-[11px] text-ink-500">Required for an honest pipeline forecast; leave the deal uncreated if the date is not known yet.</p>
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
