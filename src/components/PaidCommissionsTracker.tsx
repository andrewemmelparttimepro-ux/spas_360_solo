import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { usePaidCommissions } from '@/hooks/usePaidCommissions';
import {
  PAID_COMMISSION_SALESPEOPLE,
  commissionAmount,
  paidCommissionTotal,
  paidCommissionValuesValid,
  shiftCommissionMonth,
  type PaidCommissionSalesperson,
  type PaidCommissionValues,
} from '@/lib/paidCommissions';
import type { PaidCommission } from '@/types/database';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percentage = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const inputClass = 'w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40';

interface EditorState {
  salesperson: PaidCommissionSalesperson;
  entry: PaidCommission | null;
}

function currentMonth() {
  return format(new Date(), 'yyyy-MM');
}

export function PaidCommissionsTracker() {
  const [month, setMonth] = useState(currentMonth);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const commissions = usePaidCommissions(month);
  const monthLabel = format(new Date(`${month}-01T12:00:00`), 'MMMM yyyy');
  const bySalesperson = useMemo(() => new Map(PAID_COMMISSION_SALESPEOPLE.map(name => [
    name,
    commissions.entries.filter(entry => entry.salesperson_name === name),
  ])), [commissions.entries]);

  const chooseMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setEditor(null);
  };

  return (
    <section aria-labelledby="paid-commissions-heading" className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="paid-commissions-heading" className="text-lg font-bold text-ink-100">Paid Commissions</h2>
          <p className="mt-1 text-sm text-ink-500">Track each paid sale by salesperson. Commission amounts and totals calculate automatically.</p>
        </div>
        <div className="flex items-center gap-2" aria-label="Paid commissions month navigation">
          <button type="button" aria-label="Previous commission month" onClick={() => chooseMonth(shiftCommissionMonth(month, -1))} className="rounded-lg border border-ink-700 bg-ink-950 p-2 text-ink-300 hover:border-brand-500"><ChevronLeft className="h-4 w-4" /></button>
          <label className="sr-only" htmlFor="paid-commissions-month">Commission month</label>
          <input id="paid-commissions-month" aria-label="Commission month" type="month" value={month} onChange={event => chooseMonth(event.target.value || currentMonth())} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm font-bold text-ink-100" />
          <button type="button" aria-label="Next commission month" onClick={() => chooseMonth(shiftCommissionMonth(month, 1))} className="rounded-lg border border-ink-700 bg-ink-950 p-2 text-ink-300 hover:border-brand-500"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-500">{monthLabel}</p>
      {commissions.error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">Paid commissions could not be updated. ({commissions.error})</p>}
      {commissions.isLoading ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading paid commissions…</p>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {PAID_COMMISSION_SALESPEOPLE.map(salesperson => (
            <SalespersonCommissionSection
              key={salesperson}
              salesperson={salesperson}
              entries={bySalesperson.get(salesperson) ?? []}
              editor={editor?.salesperson === salesperson ? editor : null}
              onAdd={() => setEditor({ salesperson, entry: null })}
              onEdit={entry => setEditor({ salesperson, entry })}
              onCancel={() => setEditor(null)}
              onSave={async values => {
                const saved = await commissions.saveEntry({ ...values, salespersonName: salesperson }, editor?.entry?.id);
                if (saved) setEditor(null);
                return saved;
              }}
              onDelete={commissions.deleteEntry}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SalespersonCommissionSection({ salesperson, entries, editor, onAdd, onEdit, onCancel, onSave, onDelete }: {
  salesperson: PaidCommissionSalesperson;
  entries: PaidCommission[];
  editor: EditorState | null;
  onAdd: () => void;
  onEdit: (entry: PaidCommission) => void;
  onCancel: () => void;
  onSave: (values: PaidCommissionValues) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const total = paidCommissionTotal(entries);
  return (
    <article className="overflow-hidden rounded-xl border border-ink-700 bg-ink-950/50">
      <header className="flex items-center justify-between gap-3 bg-ink-950 px-4 py-3">
        <div>
          <h3 className="font-bold text-ink-100">{salesperson}</h3>
          <p className="text-xs text-ink-500">{entries.length} {entries.length === 1 ? 'paid sale' : 'paid sales'}</p>
        </div>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add sale</button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Sale amount</th><th className="px-3 py-2 text-right">Commission %</th><th className="px-3 py-2 text-right">Commission</th><th className="w-20 px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {entries.map(entry => <tr key={entry.id} className="border-t border-ink-800 text-ink-300"><td className="px-3 py-2 font-medium text-ink-100">{entry.customer_name}</td><td className="px-3 py-2 text-right">{currency.format(Number(entry.sale_amount))}</td><td className="px-3 py-2 text-right">{percentage.format(Number(entry.commission_percentage))}%</td><td className="px-3 py-2 text-right font-bold text-ink-100">{currency.format(Number(entry.commission_amount))}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${entry.customer_name} commission`} onClick={() => onEdit(entry)} className="rounded p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Delete ${entry.customer_name} commission`} disabled={deletingId === entry.id} onClick={async () => { if (!window.confirm(`Delete ${entry.customer_name}'s paid commission?`)) return; setDeletingId(entry.id); await onDelete(entry.id); setDeletingId(null); }} className="rounded p-1.5 text-ink-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">{deletingId === entry.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div></td></tr>)}
            {!entries.length && <tr><td colSpan={5} className="px-3 py-7 text-center text-sm text-ink-500">No paid commissions entered.</td></tr>}
          </tbody>
          <tfoot><tr className="border-t border-ink-700 bg-ink-950 font-bold text-ink-100"><td colSpan={3} className="px-3 py-3 text-right">{salesperson} total</td><td className="px-3 py-3 text-right">{currency.format(total)}</td><td /></tr></tfoot>
        </table>
      </div>
      {editor && <CommissionEditor key={editor.entry?.id ?? `${salesperson}-new`} entry={editor.entry} onCancel={onCancel} onSave={onSave} />}
    </article>
  );
}

function CommissionEditor({ entry, onCancel, onSave }: { entry: PaidCommission | null; onCancel: () => void; onSave: (values: PaidCommissionValues) => Promise<boolean> }) {
  const [customerName, setCustomerName] = useState(entry?.customer_name ?? '');
  const [saleAmount, setSaleAmount] = useState(entry ? String(entry.sale_amount) : '');
  const [commissionPercentage, setCommissionPercentage] = useState(entry ? String(entry.commission_percentage) : '');
  const [saving, setSaving] = useState(false);
  const values = { customerName, saleAmount: Number(saleAmount), commissionPercentage: Number(commissionPercentage) };
  const valid = commissionPercentage.trim() !== '' && paidCommissionValuesValid(values);
  return (
    <form className="space-y-3 border-t border-ink-700 bg-ink-900 p-4" onSubmit={async event => { event.preventDefault(); if (!valid) return; setSaving(true); const saved = await onSave(values); if (!saved) setSaving(false); }}>
      <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-ink-100">{entry ? 'Edit paid sale' : 'Add paid sale'}</h4><button type="button" aria-label="Close commission editor" onClick={onCancel} className="rounded p-1 text-ink-500 hover:text-ink-200"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink-400">Customer name<input autoFocus aria-label="Commission customer name" value={customerName} maxLength={200} onChange={event => setCustomerName(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
        <label className="text-xs font-semibold text-ink-400">Sale amount<input aria-label="Commission sale amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={saleAmount} onChange={event => setSaleAmount(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
        <label className="text-xs font-semibold text-ink-400">Commission %<input aria-label="Commission percentage" type="number" min="0" max="100" step="0.0001" inputMode="decimal" value={commissionPercentage} onChange={event => setCommissionPercentage(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">Commission amount: <strong className="text-ink-100">{currency.format(commissionAmount(values.saleAmount, values.commissionPercentage))}</strong></p>
        <div className="flex gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-3 py-2 text-xs font-bold text-ink-300">Cancel</button><button type="submit" disabled={!valid || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{entry ? 'Save changes' : 'Add paid sale'}</button></div>
      </div>
    </form>
  );
}
