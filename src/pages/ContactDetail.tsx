import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Edit2, Save, X, Plus } from 'lucide-react';
import { useContact } from '@/hooks/useContacts';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState } from 'react';

export default function ContactDetail() {
  const { id } = useParams();
  const { contact, isLoading } = useContact(id);
  const { notes, createNote } = useNotes({ contactId: id });
  const { tasks, createTask, completeTask } = useTasks({ contactId: id });
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <p className="text-lg">Contact not found</p>
        <Link to="/contacts" className="text-sky-500 text-sm mt-2 hover:underline">Back to Contacts</Link>
      </div>
    );
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createNote(newNote, { contactId: contact.id });
    setNewNote('');
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({
      title: newTaskTitle,
      contact_id: contact.id,
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      priority: 'Medium',
      status: 'Pending',
    });
    setNewTaskTitle('');
    setShowTaskForm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link to="/contacts" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{contact.first_name} {contact.last_name}</h1>
          <div className="flex items-center space-x-4 mt-1 text-sm text-slate-500">
            <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1" />{contact.phone}</span>
            {contact.email && <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1" />{contact.email}</span>}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          contact.customer_type === 'Customer' ? 'bg-emerald-100 text-emerald-800' :
          contact.customer_type === 'Lead' ? 'bg-amber-100 text-amber-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {contact.customer_type}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact Details</h2>
          <div className="space-y-4">
            <DetailRow label="Phone" value={contact.phone} />
            <DetailRow label="Secondary Phone" value={contact.phone_secondary ?? '—'} />
            <DetailRow label="Email" value={contact.email ?? '—'} />
            <DetailRow label="Address" value={contact.mailing_address ?? '—'} />
            <DetailRow label="Lead Source" value={contact.lead_source} />
            <DetailRow label="Tags" value={contact.tags?.join(', ') || '—'} />
            <DetailRow label="Created" value={new Date(contact.created_at).toLocaleDateString()} />
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Notes</h2>
            <div className="flex space-x-3 mb-4">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                placeholder="Add a note..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400"
              />
              <button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">
                Add
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No notes yet</p>
              ) : notes.map((n) => (
                <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-800">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Tasks</h2>
              <button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center">
                <Plus className="w-4 h-4 mr-1" /> Add Task
              </button>
            </div>
            {showTaskForm && (
              <div className="flex space-x-3 mb-4">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                  placeholder="Task title..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400"
                  autoFocus
                />
                <button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No tasks yet</p>
              ) : tasks.map((t) => (
                <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <input
                    type="checkbox"
                    checked={t.status === 'Completed'}
                    onChange={() => t.status !== 'Completed' && completeTask(t.id)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3"
                  />
                  <span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {t.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(t.due_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}
