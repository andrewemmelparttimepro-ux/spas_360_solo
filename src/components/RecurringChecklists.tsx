import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarCheck2, Camera, Plus, Power, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';
import { WEEKDAY_LABELS, checklistItemsFromText, describeWeekdays, formatDueTime } from '@/lib/recurringChecklists';
import type { DelegatedChecklistTemplate, Profile } from '@/types/database';

type Person = Pick<Profile, 'id' | 'first_name' | 'last_name'>;
type TemplateRow = DelegatedChecklistTemplate & { assignee: Person | Person[] | null };

const name = (person: Person | Person[] | null | undefined) => {
  const row = Array.isArray(person) ? person[0] : person;
  return row ? `${row.first_name} ${row.last_name}`.trim() : 'Teammate';
};

const field = 'rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:ring-2 focus:ring-brand-500';

/**
 * Opening and closing lists that regenerate every morning as delegated tasks,
 * so the clock-out gate catches whatever was left undone. Owner-only.
 */
export default function RecurringChecklists() {
  const { profile, locations } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: '', assigned_to: '', location_id: '', due_time: '17:00', weekdays: [1, 2, 3, 4, 5, 6] as number[], items: '', proof_required: false });
  const isOwner = profile?.role === 'owner_manager';

  const load = useCallback(async () => {
    if (!profile || !isOwner) { setIsLoading(false); return; }
    const [templatesRes, staffRes] = await Promise.all([
      supabase.from('delegated_checklist_templates').select('*, assignee:assigned_to(id, first_name, last_name)').eq('org_id', profile.org_id).order('created_at'),
      supabase.from('profiles').select('id, first_name, last_name').eq('org_id', profile.org_id).neq('id', THRAWN_PROFILE_ID).order('first_name'),
    ]);
    if (!templatesRes.error) setTemplates((templatesRes.data ?? []) as unknown as TemplateRow[]);
    if (!staffRes.error) setStaff((staffRes.data ?? []) as Person[]);
    setIsLoading(false);
  }, [profile, isOwner]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => templates.filter(template => template.active).length, [templates]);

  const toggleWeekday = (day: number) => setDraft(current => ({
    ...current,
    weekdays: current.weekdays.includes(day) ? current.weekdays.filter(value => value !== day) : [...current.weekdays, day].sort(),
  }));

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const items = checklistItemsFromText(draft.items);
    if (!draft.name.trim() || !draft.assigned_to || items.length === 0 || draft.weekdays.length === 0) {
      toast('Give the checklist a name, a teammate, at least one item, and at least one day.', 'warning');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('delegated_checklist_templates').insert({
      org_id: profile.org_id,
      name: draft.name.trim(),
      assigned_to: draft.assigned_to,
      created_by: profile.id,
      location_id: draft.location_id || null,
      items,
      weekdays: draft.weekdays,
      due_time: draft.due_time,
      proof_required: draft.proof_required,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${draft.name.trim()} will be delegated every ${describeWeekdays(draft.weekdays)} at ${formatDueTime(draft.due_time)}.`, 'success');
    setDraft(current => ({ ...current, name: '', items: '' }));
    void load();
  };

  const toggleActive = async (template: TemplateRow) => {
    const { error } = await supabase.from('delegated_checklist_templates').update({ active: !template.active }).eq('id', template.id);
    if (error) { toast(error.message, 'error'); return; }
    setTemplates(current => current.map(item => item.id === template.id ? { ...item, active: !template.active } : item));
  };

  const remove = async (template: TemplateRow) => {
    if (!window.confirm(`Delete the "${template.name}" checklist? Tasks already created stay.`)) return;
    const { error } = await supabase.from('delegated_checklist_templates').delete().eq('id', template.id);
    if (error) { toast(error.message, 'error'); return; }
    setTemplates(current => current.filter(item => item.id !== template.id));
  };

  const runNow = async () => {
    const { data, error } = await supabase.rpc('generate_recurring_checklists');
    if (error) { toast(error.message, 'error'); return; }
    toast(data ? `Created ${data} task${data === 1 ? '' : 's'} for today.` : 'Today\'s checklists were already created.', 'success');
    void load();
  };

  if (!isOwner) return null;

  return (
    <section aria-labelledby="recurring-checklists-title" className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
      <header className="flex flex-col gap-2 border-b border-ink-700 bg-ink-850/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="recurring-checklists-title" className="flex items-center gap-2 text-lg font-bold text-ink-100"><CalendarCheck2 className="h-5 w-5 text-amber-500" /> Recurring Checklists</h2>
          <p className="mt-1 text-xs text-ink-500">Opening and closing lists that land in Delegated Tasks every morning at 5:00 AM. Nobody clocks out past an unfinished one. {activeCount} active.</p>
        </div>
        <button type="button" onClick={() => void runNow()} className="rounded-lg border border-ink-600 px-3 py-2 text-xs font-bold text-ink-200 hover:bg-ink-800">Create today's tasks now</button>
      </header>

      <form onSubmit={create} className="grid gap-3 border-b border-ink-700 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-start">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">Checklist name
          <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Minot closing" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">Assign to
          <select value={draft.assigned_to} onChange={event => setDraft(current => ({ ...current, assigned_to: event.target.value }))} className={field}>
            <option value="">Select teammate</option>
            {staff.map(person => <option key={person.id} value={person.id}>{name(person)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">Due by
            <input type="time" value={draft.due_time} onChange={event => setDraft(current => ({ ...current, due_time: event.target.value }))} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">Store
            <select value={draft.location_id} onChange={event => setDraft(current => ({ ...current, location_id: event.target.value }))} className={field}>
              <option value="">Any</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 lg:mt-5"><Plus className="h-4 w-4" /> Save checklist</button>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400 lg:col-span-3">Items (one per line)
          <textarea rows={3} value={draft.items} onChange={event => setDraft(current => ({ ...current, items: event.target.value }))} placeholder={'Lock the showroom doors\nCount the till\nTurn off the display spas'} className={`${field} resize-y`} />
        </label>
        <div className="flex flex-col gap-2 lg:col-span-1">
          <span className="text-xs font-semibold text-ink-400">Days</span>
          <div className="flex flex-wrap gap-1" aria-label="Weekdays">
            {WEEKDAY_LABELS.map((label, index) => {
              const day = index + 1;
              const on = draft.weekdays.includes(day);
              return <button key={day} type="button" aria-pressed={on} onClick={() => toggleWeekday(day)} className={`rounded-md px-2 py-1 text-xs font-bold ${on ? 'bg-amber-500 text-white' : 'bg-ink-800 text-ink-400 hover:text-ink-100'}`}>{label}</button>;
            })}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-400">
            <input type="checkbox" checked={draft.proof_required} onChange={event => setDraft(current => ({ ...current, proof_required: event.target.checked }))} className="h-4 w-4 rounded border-ink-600 text-amber-500" />
            <Camera className="h-3.5 w-3.5" /> Require a photo on each item
          </label>
        </div>
      </form>

      <div className="space-y-2 p-4">
        {isLoading ? <p className="py-4 text-center text-sm text-ink-500">Loading checklists…</p> : templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-700 px-3 py-6 text-center text-sm text-ink-500">No recurring checklists yet. Start with a closing list for each store.</p>
        ) : templates.map(template => (
          <article key={template.id} className={`flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-850/70 p-3 sm:flex-row sm:items-start sm:justify-between ${template.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-100">{template.name} <span className="font-normal text-ink-500">→ {name(template.assignee)}</span></p>
              <p className="text-xs text-ink-500">{describeWeekdays(template.weekdays)} · due {formatDueTime(template.due_time)}{template.location_id ? ` · ${locations.find(location => location.id === template.location_id)?.name ?? 'store'}` : ''}{template.proof_required ? ' · photo required' : ''}{template.last_generated_on ? ` · last created ${template.last_generated_on}` : ' · not created yet'}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-300">{template.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void toggleActive(template)} className="inline-flex items-center gap-1 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs font-bold text-ink-200 hover:bg-ink-800"><Power className="h-3.5 w-3.5" /> {template.active ? 'Pause' : 'Resume'}</button>
              <button type="button" aria-label={`Delete ${template.name}`} onClick={() => void remove(template)} className="rounded-lg border border-ink-600 p-2 text-ink-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
