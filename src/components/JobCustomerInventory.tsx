import { Link } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { useCustomerInventory } from '@/hooks/useCustomerInventory';
import { customerInventoryLabel } from '@/lib/customerInventory';

export default function JobCustomerInventory({ customerId }: { customerId: string }) {
  const { items, loading, error, refresh } = useCustomerInventory(customerId);
  return (
    <section aria-label="Customer inventory" data-job-customer-inventory className="mt-2 min-w-0 text-sm text-ink-300">
      <h2 className="flex items-center gap-1.5 font-medium">
        <Boxes className="h-4 w-4 shrink-0" />Customer inventory
        {!loading && !error && items.length > 0 && <span className="text-ink-400">({items.length})</span>}
      </h2>
      <p className="mt-1 text-xs text-ink-400">Units linked through this customer’s inventory, sales or service. Open a unit for its current status.</p>
      {loading ? <p className="mt-1 text-xs text-ink-400">Loading customer inventory…</p>
        : error ? <p role="alert" className="mt-1 text-xs text-amber-400">{error} <button type="button" onClick={() => void refresh()} className="underline">Retry</button></p>
          : items.length === 0 ? <p className="mt-1 text-xs text-ink-400">No inventory attached to this customer.</p>
            : <ul className="mt-1 space-y-1 pl-[22px]">
              {items.map(item => <li key={item.id} className="min-w-0 [overflow-wrap:anywhere]"><Link to={`/inventory/${item.id}`} className="text-brand-500 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">{customerInventoryLabel(item)}</Link></li>)}
            </ul>}
    </section>
  );
}
