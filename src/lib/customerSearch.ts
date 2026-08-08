export type CustomerName = {
  first_name?: string | null;
  last_name?: string | null;
};

export function normalizeCustomerNameQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Brandon's customer lookup contract: the query must be an exact prefix of
 * the first name, last name, or the displayed "first last" name. Substring
 * matches are intentionally excluded so unrelated customers never appear
 * above the requested name.
 */
export function matchesCustomerNamePrefix(customer: CustomerName, rawQuery: string): boolean {
  const query = normalizeCustomerNameQuery(rawQuery);
  if (!query) return true;

  const first = normalizeCustomerNameQuery(customer.first_name ?? '');
  const last = normalizeCustomerNameQuery(customer.last_name ?? '');
  const full = normalizeCustomerNameQuery(`${first} ${last}`);

  return first.startsWith(query) || last.startsWith(query) || full.startsWith(query);
}

export function filterCustomersByNamePrefix<T extends CustomerName>(customers: readonly T[], rawQuery: string): T[] {
  const query = normalizeCustomerNameQuery(rawQuery);
  if (!query) return [...customers];
  return customers.filter(customer => matchesCustomerNamePrefix(customer, query));
}
