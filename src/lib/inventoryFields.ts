const FLOORING_STATUS =
  /^(?:(.*?)\s+)?(Wells Fargo|WF|TCCU(?:\s+Minot)?|MCHL(?:\s+TCCU)?|Consignment(?:\s+from\s+.+)?|Paid Off(?:\s+by\s+.+)?|Spas Etc(?:\s+TCCU)?|Spas TCCU)$/i;

const ORDER_REFERENCE = /^order(?:ed)?(?:\b|(?=[#:/-]))/i;
const NON_SERIAL_PLACEHOLDER =
  /^(?:pending|serial\s+pending|awaiting\s+serial(?:\s+number)?|tbd|tba|unknown|n\/?a|not\s+(?:assigned|available)|no\s+serial(?:\s+number)?)$/i;

export type InventorySerialAndFlooring = {
  serial: string;
  flooring: string;
};

export const splitSerialAndFlooring = (sku: string | null): InventorySerialAndFlooring => {
  const value = (sku ?? '').trim();
  const quoted = value.match(/^(.*?)\s*["“](.+?)["”]\s*$/);
  if (quoted) return { serial: quoted[1].trim(), flooring: quoted[2].trim() };

  const knownFlooring = value.match(FLOORING_STATUS);
  return knownFlooring
    ? { serial: (knownFlooring[1] ?? '').trim(), flooring: knownFlooring[2].trim() }
    : { serial: value, flooring: '' };
};

export const serialNumberForDisplay = (serial: string) => {
  const value = serial.trim();
  return ORDER_REFERENCE.test(value) || NON_SERIAL_PLACEHOLDER.test(value) ? '' : value;
};

export const joinSerialAndFlooring = (serial: string, flooring: string) =>
  flooring.trim() ? `${serial.trim()} "${flooring.trim()}"`.trim() : serial.trim();

const CUSTOMER_SEGMENT = /((?:^|·)\s*Customer:\s*)(.*?)(?=\s*·|$)/i;

export const INVENTORY_STATIONARY_CHOICES = ['Stock', 'Need To Order', 'On Order'] as const;
export type InventoryStationaryChoice = typeof INVENTORY_STATIONARY_CHOICES[number];

export type InventoryCustomerStockSelection =
  | { kind: 'customer'; customerId: string; customerName: string }
  | { kind: 'stationary'; value: InventoryStationaryChoice };

export const inventoryCustomerOrStock = (
  notes: string | null,
  customerId: string | null,
  currentCustomerName?: string | null,
) => {
  const assignedCustomer = currentCustomerName?.trim();
  if (customerId && assignedCustomer) return assignedCustomer;

  const importedCustomer = notes?.match(CUSTOMER_SEGMENT)?.[2]?.trim();
  if (importedCustomer) {
    return importedCustomer.toUpperCase() === 'STOCK' ? 'Stock' : importedCustomer;
  }
  return customerId ? 'Customer' : 'Stock';
};

export const updateInventoryCustomerOrStock = (
  notes: string | null,
  value: string,
) => {
  const storedValue = value.trim();
  const customerOrStock = !storedValue || storedValue.toUpperCase() === 'STOCK'
    ? 'STOCK'
    : storedValue;
  const currentNotes = notes ?? '';
  const match = CUSTOMER_SEGMENT.exec(currentNotes);

  if (!match || match.index === undefined) {
    return currentNotes
      ? `${currentNotes} · Customer: ${customerOrStock}`
      : `Customer: ${customerOrStock}`;
  }

  const valueStart = match.index + match[1].length;
  const valueEnd = valueStart + match[2].length;
  const suffix = currentNotes.slice(valueEnd);
  const separator = suffix.startsWith('·') ? ' ' : '';
  return `${currentNotes.slice(0, valueStart)}${customerOrStock}${separator}${suffix}`;
};

export const inventoryCustomerStockUpdate = (
  notes: string | null,
  selection: InventoryCustomerStockSelection,
) => {
  const customerId = selection.kind === 'customer' ? selection.customerId : null;
  const label = selection.kind === 'customer' ? selection.customerName.trim() : selection.value;
  return {
    customer_id: customerId,
    notes: updateInventoryCustomerOrStock(notes, label),
  };
};
