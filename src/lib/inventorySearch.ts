import { effectiveInventoryCustomer, type InventoryWithDealAssignment } from './inventoryDealAssignment.ts';

/** Search the same customer that Inventory displays, including deal reservations. */
export function inventoryMatchesSearch(item: InventoryWithDealAssignment, query: string): boolean {
  const needle = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!needle) return true;
  const customer = effectiveInventoryCustomer(item);
  return [item.sku, item.product, item.category,
    customer ? `${customer.first_name} ${customer.last_name}` : null,
  ].some(value => value?.replace(/\s+/g, ' ').toLocaleLowerCase().includes(needle));
}

/** Never search a silently truncated inventory or reservation list. */
export async function loadInventoryPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error('Inventory response was incomplete.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
