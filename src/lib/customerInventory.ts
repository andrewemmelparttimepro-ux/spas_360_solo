import { serialNumberForDisplay, splitSerialAndFlooring } from './inventoryFields.ts';

export type CustomerInventoryItem = {
  id: string;
  brand: string | null;
  model: string | null;
  product: string;
  color_finish: string | null;
  sku: string | null;
  customer_id: string | null;
  job: { contact_id: string } | null;
  deal: { contact_id: string } | null;
  reservations: { contact_id: string }[];
};

// Match Inventory's effective customer: a deal reservation takes precedence
// over direct ownership. Legacy job/deal links fill in only an unassigned owner.
export function customerInventoryForDisplay(
  customerId: string,
  groups: CustomerInventoryItem[][],
): CustomerInventoryItem[] {
  const items = new Map<string, CustomerInventoryItem>();
  for (const group of groups) {
    for (const item of group) {
      const reservations = item.reservations ?? [];
      const belongs = reservations.length
        ? reservations.every(reservation => reservation.contact_id === customerId)
        : item.customer_id
          ? item.customer_id === customerId
          : item.deal
            ? item.deal.contact_id === customerId
            : item.job?.contact_id === customerId;
      if (belongs) items.set(item.id, item);
    }
  }
  return [...items.values()].sort((a, b) => customerInventoryLabel(a).localeCompare(customerInventoryLabel(b)) || a.id.localeCompare(b.id));
}

export function customerInventoryLabel(item: CustomerInventoryItem): string {
  const name = [item.brand, item.model || item.product, item.color_finish].filter(Boolean).join(' · ') || 'Inventory unit';
  const serial = serialNumberForDisplay(splitSerialAndFlooring(item.sku).serial);
  return `${name} · Serial: ${serial || 'Unknown'}`;
}
