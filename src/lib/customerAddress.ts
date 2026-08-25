const MISSING_ADDRESS = 'Not provided';

/**
 * Display the stored mailing address without inventing missing components.
 * Multi-line entries are compacted for the table while retaining every line.
 */
export function formatCustomerAddress(address: string | null | undefined): string {
  if (address == null) return MISSING_ADDRESS;
  const lines = address.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines.join(', ') : MISSING_ADDRESS;
}
