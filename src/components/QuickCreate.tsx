import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, Wrench, ChevronRight } from 'lucide-react';
import NewCustomerWizard from '@/components/NewCustomerWizard';

/**
 * The dashboard's "+ New" — one button, both sides of the business.
 * Routes into the flows that already exist: the guided customer wizard
 * (in place), or the New Job modal (navigates to Schedule and auto-opens it,
 * smart defaults applied). After a customer is created, we land on Deals with
 * the fresh card pulsing — attention always points at the next step.
 */
export default function QuickCreate({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'choose' | 'customer'>('choose');

  if (mode === 'customer') {
    return (
      <NewCustomerWizard
        onClose={onClose}
        onCreated={(dealId) => {
          // IKEA loop from anywhere: go see the card you just built
          navigate('/deals', { state: { highlight: dealId } });
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-ink-900 border border-ink-700 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 border-b border-ink-700 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-100">Create</h2>
            <p className="text-xs text-ink-500 mt-0.5">Which side of the business?</p>
          </div>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-2.5">
          <button
            onClick={() => setMode('customer')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-ink-950 border border-ink-700 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all text-left group"
          >
            <span className="p-2.5 rounded-[10px] bg-violet-500/15 shrink-0">
              <Users className="w-5 h-5 text-violet-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink-100">New Customer</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500 bg-ink-900 border border-ink-700 rounded px-1.5 py-0.5">Sales</span>
              </span>
              <span className="block text-xs text-ink-500 mt-0.5">Guided intake — contact, deal & follow-up in one pass</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          <button
            onClick={() => { onClose(); navigate('/service', { state: { openNew: true } }); }}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-ink-950 border border-ink-700 hover:border-brand-500/50 hover:bg-brand-500/10 transition-all text-left group"
          >
            <span className="p-2.5 rounded-[10px] bg-brand-500/15 shrink-0">
              <Wrench className="w-5 h-5 text-brand-400" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink-100">New Job</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500 bg-ink-900 border border-ink-700 rounded px-1.5 py-0.5">Service</span>
              </span>
              <span className="block text-xs text-ink-500 mt-0.5">Repair, delivery, install — schedule it or queue it</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
