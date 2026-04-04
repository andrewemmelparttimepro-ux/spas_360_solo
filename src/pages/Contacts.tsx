import { Plus, Search, Filter, Phone, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useContacts } from '@/hooks/useContacts';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const typeColors: Record<string, string> = {
  'Lead': 'bg-amber-100 text-amber-800',
  'Prospect': 'bg-blue-100 text-blue-800',
  'Customer': 'bg-emerald-100 text-emerald-800',
  'Past Customer': 'bg-slate-100 text-slate-600',
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
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-500 mt-1">{contacts.length} total contacts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Contact
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">New Contact</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First Name" value={newContact.first_name} onChange={e => setNewContact({...newContact, first_name: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="Last Name" value={newContact.last_name} onChange={e => setNewContact({...newContact, last_name: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              </div>
              <input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact({...newContact, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <input placeholder="Email (optional)" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newContact.customer_type} onChange={e => setNewContact({...newContact, customer_type: e.target.value as 'Lead'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Lead</option><option>Prospect</option><option>Customer</option><option>Past Customer</option>
                </select>
                <select value={newContact.lead_source} onChange={e => setNewContact({...newContact, lead_source: e.target.value as 'Walk-in'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Walk-in</option><option>Website</option><option>Referral</option><option>Ad</option><option>Phone</option><option>Event</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newContact.first_name || !newContact.phone} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Create Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 outline-none"
            />
          </div>
          <button className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Users className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">No contacts yet</p>
            <p className="text-sm mt-1">Create your first contact to get started</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-white sticky top-0">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <Link to={`/contacts/${c.id}`} className="text-sm font-medium text-sky-600 hover:text-sky-900">
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="p-4 text-sm text-slate-600 flex items-center">
                      <Phone className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                      {c.phone}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {c.email ? (
                        <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1.5 text-slate-400" />{c.email}</span>
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", typeColors[c.customer_type] ?? 'bg-slate-100 text-slate-600')}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-500">{c.lead_source}</td>
                    <td className="p-4 text-sm text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
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
