import { Plus, Search, Filter, Phone, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useContacts } from '@/hooks/useContacts';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const typeColors: Record<string, string> = {
  'Lead': 'bg-amber-500/15 text-amber-300',
  'Prospect': 'bg-brand-500/15 text-brand-300',
  'Customer': 'bg-emerald-500/15 text-emerald-300',
  'Past Customer': 'bg-ink-950 text-ink-300',
};

export default function Contacts() {
  const { contacts, isLoading, searchQuery, setSearchQuery, createContact } = useContacts();
  const [showCreate, setShowCreate] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', phone: '', email: '', customer_type: 'Lead' as const, lead_source: 'Walk-in' as const });

  const handleCreate = async () => {
    await createContact(newContact);
    setShowCreate(false);
    setNewContact({ first_name: '', last_name: '', phone: '', email: '', customer_type: 'Lead', lead_source: 'Walk-in' });
  };

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Contacts</h1>
          <p className="text-sm text-ink-400 mt-1">{contacts.length} total contacts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Contact
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-ink-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <h2 className="text-lg font-semibold text-ink-100 mb-4">New Contact</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First Name" value={newContact.first_name} onChange={e => setNewContact({...newContact, first_name: e.target.value})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
                <input placeholder="Last Name" value={newContact.last_name} onChange={e => setNewContact({...newContact, last_name: e.target.value})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              </div>
              <input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact({...newContact, phone: e.target.value})} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <input placeholder="Email (optional)" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newContact.customer_type} onChange={e => setNewContact({...newContact, customer_type: e.target.value as 'Lead'})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option>Lead</option><option>Prospect</option><option>Customer</option><option>Past Customer</option>
                </select>
                <select value={newContact.lead_source} onChange={e => setNewContact({...newContact, lead_source: e.target.value as 'Walk-in'})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option>Walk-in</option><option>Website</option><option>Referral</option><option>Ad</option><option>Phone</option><option>Event</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-ink-300 hover:bg-ink-800 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newContact.first_name || !newContact.phone} className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50">Create Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-ink-700 flex items-center justify-between bg-ink-950">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="w-full pl-9 pr-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>
          <button className="flex items-center text-sm font-medium text-ink-300 hover:text-ink-100">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-500">
            <Users className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">No contacts yet</p>
            <p className="text-sm mt-1">Create your first contact to get started</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-900 sticky top-0">
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Type</th>
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Source</th>
                  <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-800 transition-colors">
                    <td className="p-4">
                      <Link to={`/contacts/${c.id}`} className="text-sm font-medium text-brand-400 hover:text-brand-300">
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="p-4 text-sm text-ink-300 flex items-center">
                      <Phone className="w-3.5 h-3.5 mr-1.5 text-ink-500" />
                      {c.phone}
                    </td>
                    <td className="p-4 text-sm text-ink-400">
                      {c.email ? (
                        <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1.5 text-ink-500" />{c.email}</span>
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", typeColors[c.customer_type] ?? 'bg-ink-950 text-ink-300')}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-ink-400">{c.lead_source}</td>
                    <td className="p-4 text-sm text-ink-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Users(props: { className?: string }) {
  return <MapPin {...props} />;
}
