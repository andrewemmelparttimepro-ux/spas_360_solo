import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, ChevronLeft, ChevronRight, Search, Plus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import NewCustomerWizard from '@/components/NewCustomerWizard';

const typeColors: Record<string, string> = {
  Lead: 'bg-purple-500/15 text-purple-300',
  Prospect: 'bg-amber-500/15 text-amber-300',
  Customer: 'bg-emerald-500/15 text-emerald-300',
  'Past Customer': 'bg-ink-800 text-ink-400',
};

/**
 * Admin rail — quick contact access, docked right, collapsed by default.
 * Desktop only; the mobile drawer keeps a Contacts link to the full page.
 */
export default function AdminRail() {
  const [open, setOpen] = useState(() => localStorage.getItem('spas360.adminRail') === 'open');
  const [showWizard, setShowWizard] = useState(false);
  const { profile } = useAuth();
  const { contacts, searchQuery, setSearchQuery, refresh } = useContacts();
  const navigate = useNavigate();

  // Techs live in the schedule — no admin chrome for them
  if (profile?.role === 'technician') return null;

  const toggle = () => {
    setOpen(o => {
      localStorage.setItem('spas360.adminRail', o ? 'closed' : 'open');
      return !o;
    });
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-l border-ink-700 bg-ink-900 shrink-0 transition-[width] duration-200 ease-out overflow-hidden',
        open ? 'w-[300px]' : 'w-12'
      )}
    >
      {open ? (
        <>
          <div className="h-12 px-3 flex items-center justify-between border-b border-ink-700 shrink-0">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-100">
              <Contact className="w-4 h-4 text-brand-400" />
              Contacts
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500 bg-ink-950 border border-ink-700 rounded px-1.5 py-0.5">Admin</span>
            </span>
            <button onClick={toggle} className="p-1 text-ink-500 hover:text-ink-300 rounded" aria-label="Collapse contacts panel">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2.5 border-b border-ink-800 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search contacts…"
                className="w-full pl-8 pr-3 py-1.5 bg-ink-950 border border-ink-700 rounded-lg text-[13px] text-ink-100 placeholder-ink-500 outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-[13px] font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Customer
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 ? (
              <p className="text-xs text-ink-500 text-center py-8 px-4">No contacts yet</p>
            ) : contacts.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/contacts/${c.id}`)}
                className="w-full text-left px-3 py-2.5 border-b border-ink-800/60 hover:bg-ink-800 transition-colors flex items-center gap-2.5"
              >
                <span className="w-7 h-7 rounded-full bg-brand-500/15 text-brand-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {(c.first_name?.[0] ?? '') + (c.last_name?.[0] ?? '')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink-100 truncate">{c.first_name} {c.last_name}</span>
                  <span className="block text-[11px] text-ink-500 truncate">{c.phone}</span>
                </span>
                <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0', typeColors[c.customer_type] ?? 'bg-ink-800 text-ink-400')}>
                  {c.customer_type}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => navigate('/contacts')}
            className="shrink-0 flex items-center justify-center gap-1.5 py-2.5 border-t border-ink-700 text-[12px] font-medium text-ink-400 hover:text-brand-400 transition-colors"
          >
            Open full view <ExternalLink className="w-3 h-3" />
          </button>
        </>
      ) : (
        <button
          onClick={toggle}
          className="flex-1 flex flex-col items-center gap-2 pt-3 text-ink-500 hover:text-brand-400 hover:bg-ink-800/50 transition-colors"
          aria-label="Expand contacts panel"
          title="Contacts"
        >
          <ChevronLeft className="w-4 h-4" />
          <Contact className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl] mt-1">Contacts</span>
        </button>
      )}

      {showWizard && <NewCustomerWizard onClose={() => setShowWizard(false)} onCreated={() => refresh()} />}
    </aside>
  );
}
