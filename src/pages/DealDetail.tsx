import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Calendar, CalendarClock, User, Plus, Save, X, Pencil, Bot, Clock3 } from 'lucide-react';
import { useDeal } from '@/hooks/usePipeline';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Deal, DealPriority } from '@/types/database';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import MentionInput from '@/components/MentionInput';
import MentionText from '@/components/MentionText';
import { composeMentionBody, parseMentions, notifyMentionedUsers, isAriNote, ariNoteBody, stripMentions, ARI_NOTE_PREFIX, type PickedMention } from '@/lib/mentions';
import { runAriMention } from '@/agent/ariTasks';
import { friendlyAgentError } from '@/agent/run';
import AriNoteCard from '@/components/AriNoteCard';
import type { AriOutputFormat } from '@/lib/ariExport';
import {
  defaultFollowUpInputValue,
  formatFollowUpDue,
  getFollowUpState,
  summarizeDealFollowUps,
} from '@/lib/followUp';

const priorityColors: Record<DealPriority, string> = { High: 'bg-red-500/15 text-red-300', Medium: 'bg-amber-500/15 text-amber-300', Low: 'bg-brand-500/15 text-brand-300' };

function EditableField({ label, value, field, onSave, icon: Icon, type = 'text', options, prefix, bold, color }: { label: string; value: string | number | null; field: string; onSave: (u: Partial<Deal>) => Promise<void>; icon?: React.ElementType; type?: 'text' | 'number' | 'select' | 'date'; options?: string[]; prefix?: string; bold?: boolean; color?: string; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  const commit = async () => { if (draft === String(value ?? '')) { setEditing(false); return; } setSaving(true); const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft || null); await onSave({ [field]: parsed } as Partial<Deal>); setSaving(false); setEditing(false); };
  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };
  const display = value != null && value !== '' ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : (type === 'date' ? new Date(String(value)).toLocaleDateString() : String(value))) : '\u2014';
  if (editing) {
    const inputClass = 'px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30 w-full';
    return (<div className="flex items-center text-sm">{Icon && <Icon className="w-4 h-4 mr-2 text-ink-500 shrink-0" />}{type === 'select' ? <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass}>{options?.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input ref={inputRef as React.RefObject<HTMLInputElement>} type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass} />}</div>);
  }
  return (<div onClick={() => setEditing(true)} className={cn('flex items-center text-sm cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30 transition-colors group', bold && 'text-lg font-bold', color)} title="Click to edit">{Icon && <Icon className="w-4 h-4 mr-2 text-ink-500 shrink-0" />}<span className="flex-1">{display}</span><Pencil className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" /></div>);
}

function EditablePriority({ value, onSave }: { value: DealPriority; onSave: (u: Partial<Deal>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (editing) return (<select ref={ref} value={value} onChange={async e => { await onSave({ priority: e.target.value as DealPriority }); setEditing(false); }} onBlur={() => setEditing(false)} className="px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30"><option>High</option><option>Medium</option><option>Low</option></select>);
  return (<span onClick={() => setEditing(true)} className={cn('px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider cursor-pointer hover:ring-2 hover:ring-brand-500/30 transition-all group inline-flex items-center gap-1', priorityColors[value])} title="Click to change priority">{value}<Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" /></span>);
}

export default function DealDetail() {
  const { id } = useParams();
  const { deal, isLoading, updateDeal } = useDeal(id);
  const { notes, createNote } = useNotes({ dealId: id });
  const { tasks, createTask, completeTask } = useTasks({ dealId: id });
  const { toast } = useToast();
  const { profile } = useAuth();
  const [newNote, setNewNote] = useState('');
  const pickedRef = useRef<PickedMention[]>([]);
  const [ariBusy, setAriBusy] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueAt, setNewTaskDueAt] = useState(() => defaultFollowUpInputValue());
  const [newTaskPriority, setNewTaskPriority] = useState<DealPriority>('Medium');
  const taskSectionRef = useRef<HTMLDivElement>(null);

  const saveDeal = async (updates: Partial<Deal>) => { await updateDeal(updates); toast('Deal updated'); };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  if (!deal) return <div className="flex flex-col items-center justify-center h-full text-ink-500"><p>Deal not found</p><Link to="/deals" className="text-brand-400 text-sm mt-2 hover:underline">Back to Deals</Link></div>;

  const contact = deal.contact as { first_name: string; last_name: string; phone: string } | undefined;
  const nextFollowUp = summarizeDealFollowUps(tasks).get(deal.id);
  const nextFollowUpState = getFollowUpState(nextFollowUp);
  const openTaskCount = tasks.filter(task => task.status !== 'Completed').length;

  const openTaskComposer = () => {
    setShowTaskForm(true);
    window.requestAnimationFrame(() => taskSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !profile) return;
    const body = composeMentionBody(newNote, pickedRef.current);
    pickedRef.current = [];
    setNewNote('');
    await createNote(body, { dealId: deal.id });

    const senderName = `${profile.first_name} ${profile.last_name}`;
    await notifyMentionedUsers({
      body,
      senderId: profile.id,
      senderName,
      contextLabel: deal.title,
      link: `/deals/${deal.id}`,
    });

    // @Ari: hand him the deal packet, post his work back as a note
    if (parseMentions(body).ari && !ariBusy) {
      setAriBusy(true);
      try {
        const result = await runAriMention({ surface: 'deal', entityId: deal.id, request: body, requesterName: senderName });
        await createNote(ARI_NOTE_PREFIX + result, { dealId: deal.id });
        toast('Ari finished — his work is in the notes', 'success');
      } catch (err) {
        toast(friendlyAgentError((err as Error).message ?? ''), 'error');
      } finally {
        setAriBusy(false);
      }
    }
  };

  const replyToAri = async (request: string, outputFormat: AriOutputFormat, previousOutput: string) => {
    if (!profile || ariBusy) return null;
    setAriBusy(true);
    try {
      await createNote(`↳ Reply to Ari${outputFormat === 'note' ? '' : ` · ${outputFormat.toUpperCase()}`}: ${request}`, { dealId: deal.id });
      const result = await runAriMention({
        surface: 'deal',
        entityId: deal.id,
        request,
        requesterName: `${profile.first_name} ${profile.last_name}`,
        previousOutput,
        outputFormat,
      });
      await createNote(ARI_NOTE_PREFIX + result, { dealId: deal.id });
      toast(outputFormat === 'note' ? 'Ari replied here' : `Ari replied — building the ${outputFormat.toUpperCase()}`, 'success');
      return result;
    } catch (err) {
      toast(friendlyAgentError((err as Error).message ?? ''), 'error');
      return null;
    } finally {
      setAriBusy(false);
    }
  };
  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !newTaskDueAt) {
      toast('Add a follow-up label and due date', 'error');
      return;
    }

    const dueAt = new Date(newTaskDueAt);
    if (Number.isNaN(dueAt.getTime())) {
      toast('Choose a valid follow-up date', 'error');
      return;
    }

    const title = newTaskTitle.trim();
    const created = await createTask({
      title,
      description: `Next activity for ${deal.title}`,
      deal_id: deal.id,
      contact_id: deal.contact_id,
      assigned_to: deal.assigned_to,
      due_at: dueAt.toISOString(),
      priority: newTaskPriority,
      status: 'Pending',
      task_type: 'Sales Follow-Up',
    });

    if (!created) {
      toast('Follow-up could not be scheduled', 'error');
      return;
    }

    await createNote(
      `📅 Next task set: ${title}\nDue ${dueAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`,
      { dealId: deal.id },
    );
    setNewTaskTitle('');
    setNewTaskDueAt(defaultFollowUpInputValue());
    setNewTaskPriority('Medium');
    setShowTaskForm(false);
    toast('Next activity scheduled', 'success');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/deals" className="p-2 hover:bg-ink-800 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-ink-400" /></Link>
        <div className="flex-1"><h1 className="text-xl sm:text-2xl font-bold text-ink-100">{deal.title}</h1>{contact && <Link to={`/customers/${deal.contact_id}`} className="text-sm text-brand-400 hover:text-brand-400 mt-1 inline-block">{contact.first_name} {contact.last_name} Â· {contact.phone}</Link>}</div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Priority</span>
          <EditablePriority value={deal.priority} onSave={saveDeal} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Deal Information</h2><span className="text-[10px] text-ink-500">Click any value to edit</span></div>
          <div className="space-y-4">
            <EditableField label="Amount" value={deal.amount} field="amount" onSave={saveDeal} icon={DollarSign} type="number" prefix="$" bold color="text-ink-100" />
            <EditableField label="Expected Close" value={deal.expected_close_date} field="expected_close_date" onSave={saveDeal} icon={Calendar} type="date" />
            <div className={cn(
              'rounded-xl border p-3',
              nextFollowUpState === 'missing' || nextFollowUpState === 'overdue'
                ? 'border-red-500/30 bg-red-500/10'
                : nextFollowUpState === 'today'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-brand-500/30 bg-brand-500/10',
            )}>
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                <CalendarClock className="h-3.5 w-3.5" /> Next activity
              </p>
              <p className={cn(
                'mt-2 text-sm font-semibold',
                nextFollowUpState === 'missing' || nextFollowUpState === 'overdue'
                  ? 'text-red-300'
                  : nextFollowUpState === 'today'
                    ? 'text-amber-300'
                    : 'text-brand-300',
              )}>
                {formatFollowUpDue(nextFollowUp)}
              </p>
              <p className="mt-1 truncate text-xs text-ink-400">{nextFollowUp?.title ?? 'This lead needs a dated next step.'}</p>
            </div>
            <div className="flex items-center text-sm text-ink-300"><User className="w-4 h-4 mr-2 text-ink-500" />Source: {deal.lead_source}</div>
            {deal.product_interest && deal.product_interest.length > 0 && <div><p className="text-xs text-ink-500 mb-1">Products of Interest</p><div className="flex flex-wrap gap-1">{deal.product_interest.map(p => <span key={p} className="px-2 py-0.5 bg-ink-950 text-ink-300 rounded text-xs">{p}</span>)}</div></div>}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Notes & Activity</h2>
              <button onClick={openTaskComposer} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
                <CalendarClock className="h-4 w-4" /> Set next task
              </button>
            </div>
            <div className="flex items-start space-x-3 mb-4">
              <MentionInput
                value={newNote}
                onValueChange={setNewNote}
                picked={pickedRef}
                onSubmit={handleAddNote}
                menuDirection="down"
                placeholder="Add a note… @ mentions a teammate, customer, or Ari"
                className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500 resize-none bg-transparent"
              />
              <button onClick={handleAddNote} className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg font-medium hover:bg-brand-600 shrink-0">Add</button>
            </div>
            {ariBusy && (
              <div className="flex items-center gap-2.5 p-3 mb-3 rounded-lg bg-brand-500/10 border border-brand-500/30">
                <Bot className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-sm text-brand-300 font-medium">Ari is on it — pulling the deal packet and doing the work…</span>
                <span className="flex space-x-1 ml-auto">
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            )}
            <div className="space-y-3 max-h-[34rem] overflow-y-auto">{notes.length === 0 && !ariBusy ? <p className="text-sm text-ink-500 text-center py-4">No notes yet</p> : notes.map(n => isAriNote(n.body) ? (
              <AriNoteCard
                key={n.id}
                note={n}
                contextTitle={deal.title}
                preparedFor={contact ? `${contact.first_name} ${contact.last_name}` : undefined}
                disabled={ariBusy}
                onReply={replyToAri}
              />
            ) : (
              <div key={n.id} className="p-3 bg-ink-950 rounded-lg border border-ink-800">
                <p className="text-sm text-ink-100 whitespace-pre-wrap"><MentionText body={n.body} /></p>
                <p className="text-xs text-ink-500 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
              </div>
            ))}</div>
          </div>
          <div ref={taskSectionRef} className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Follow-Up Tasks</h2>
                <p className="mt-1 text-xs text-ink-500">{openTaskCount} open · earliest due date drives Next activity</p>
              </div>
              <button onClick={openTaskComposer} className="text-sm text-brand-400 hover:text-brand-300 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button>
            </div>
            {showTaskForm && (
              <div id="follow-up-task-form" className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_210px_130px]">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-ink-400">What should happen next?</span>
                    <input
                      value={newTaskTitle}
                      onChange={event => setNewTaskTitle(event.target.value)}
                      onKeyDown={event => event.key === 'Enter' && handleAddTask()}
                      placeholder="Call, text, send quote, schedule visit…"
                      className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500"
                      autoFocus
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-ink-400">Due date & time</span>
                    <input
                      type="datetime-local"
                      value={newTaskDueAt}
                      onChange={event => setNewTaskDueAt(event.target.value)}
                      className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-ink-400">Priority</span>
                    <select
                      value={newTaskPriority}
                      onChange={event => setNewTaskPriority(event.target.value as DealPriority)}
                      className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500"
                    >
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button onClick={() => setShowTaskForm(false)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-ink-200">
                    <X className="h-4 w-4" /> Cancel
                  </button>
                  <button onClick={handleAddTask} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
                    <Save className="h-4 w-4" /> Schedule follow-up
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <button onClick={openTaskComposer} className="w-full rounded-xl border border-dashed border-red-500/30 bg-red-500/5 px-4 py-5 text-center text-sm font-medium text-red-300 transition hover:bg-red-500/10">
                  No next activity scheduled — set the salesperson’s next step
                </button>
              ) : tasks.map(task => {
                const completed = task.status === 'Completed';
                const overdue = !completed && new Date(task.due_at).getTime() < Date.now();
                return (
                  <div key={task.id} className={cn(
                    'flex items-center gap-3 rounded-lg border p-3',
                    completed ? 'border-ink-800 bg-ink-950/60' : overdue ? 'border-red-500/30 bg-red-500/5' : 'border-ink-800 bg-ink-950',
                  )}>
                    <input
                      type="checkbox"
                      checked={completed}
                      onChange={() => !completed && completeTask(task.id)}
                      className="h-4 w-4 rounded border-ink-600 text-brand-400"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', completed ? 'line-through text-ink-500' : 'font-medium text-ink-100')}>{task.title}</p>
                      <p className={cn('mt-1 flex items-center gap-1 text-xs', overdue ? 'text-red-300' : 'text-ink-500')}>
                        <Clock3 className="h-3 w-3" />
                        {overdue ? 'Overdue · ' : ''}{new Date(task.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <span className="rounded-full border border-ink-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{task.priority}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
