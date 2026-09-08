import {useState,useEffect,useMemo} from 'react';
import {Search,ChevronDown,Check} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Contact} from '@/types/database';
import {filterCustomersByNamePrefix} from '@/lib/customerSearch';

type ScheduleCustomer = Pick<Contact, 'id' | 'first_name' | 'last_name' | 'phone'>;

function customerLabel(customer: ScheduleCustomer) {
  return `${customer.first_name} ${customer.last_name}`.trim();
}

export default function CustomerCombobox({
  customers,
  selectedId,
  onSelect,
}: {
  customers: ScheduleCustomer[];
  selectedId: string;
  onSelect: (customerId: string) => void;
}) {
  const selected = useMemo(
    () => customers.find(customer => customer.id === selectedId) ?? null,
    [customers, selectedId],
  );
  const selectedLabel = selected ? customerLabel(selected) : '';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  // A selected customer's label is display text, not an active filter. Opening
  // the field still exposes the complete paginated customer list.
  const effectiveQuery = selected && query === selectedLabel ? '' : query;
  const matches = useMemo(
    () => filterCustomersByNamePrefix(customers, effectiveQuery),
    [customers, effectiveQuery],
  );

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(matches.length - 1, 0)));
  }, [matches.length]);

  const choose = (customer: ScheduleCustomer) => {
    onSelect(customer.id);
    setQuery(customerLabel(customer));
    setOpen(false);
  };

  const listboxId = 'new-job-customer-options';
  const activeCustomer = open ? matches[activeIndex] : undefined;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          type="text"
          role="combobox"
          aria-label="Customer *"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeCustomer ? `new-job-customer-${activeCustomer.id}` : undefined}
          autoComplete="off"
          placeholder="Select or search customers *"
          value={query}
          onFocus={event => {
            setOpen(true);
            setActiveIndex(0);
            if (selected) event.currentTarget.select();
          }}
          onBlur={() => setOpen(false)}
          onChange={event => {
            setQuery(event.target.value);
            if (selectedId) onSelect('');
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(index => Math.min(index + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(index => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && activeCustomer) {
              event.preventDefault();
              choose(activeCustomer);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setQuery(selectedLabel);
              setOpen(false);
            }
          }}
          className="w-full rounded-lg border border-ink-700 py-2 pl-9 pr-9 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Matching customers"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 shadow-xl"
        >
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-500">No matching customers.</p>
          ) : matches.map((customer, index) => (
            <button
              id={`new-job-customer-${customer.id}`}
              key={customer.id}
              type="button"
              role="option"
              aria-selected={customer.id === selectedId}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(customer)}
              className={cn(
                'flex w-full items-center justify-between gap-3 border-b border-ink-800 px-3 py-2 text-left last:border-b-0',
                index === activeIndex ? 'bg-brand-500/15' : 'hover:bg-brand-500/10',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink-200">{customerLabel(customer)}</span>
                {customer.phone && <span className="block truncate text-[11px] text-ink-500">{customer.phone}</span>}
              </span>
              {customer.id === selectedId && <Check className="h-4 w-4 shrink-0 text-brand-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

