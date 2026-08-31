import type { Contact, InventoryItem, JobStatus } from '@/types/database';

export type InventoryCustomerSummary = Pick<
  Contact,
  'id' | 'first_name' | 'last_name' | 'phone' | 'customer_type'
>;

export type InventoryDealAssignmentRow = {
  id: string;
  inventory_item_id: string | null;
  contact: InventoryCustomerSummary | null;
};

export type InventoryDealAssignment = {
  dealId: string;
  customer: InventoryCustomerSummary;
};

export type InventoryWithDealAssignment = InventoryItem & {
  customer: InventoryCustomerSummary | null;
  locations?: { name: string } | null;
  job?: { id: string; status: JobStatus } | null;
  dealAssignment: InventoryDealAssignment | null;
};

/**
 * A deal's inventory_item_id is the authoritative reservation while the deal is
 * active. Surface its contact on Inventory without copying a second customer
 * value client-side and risking a partially applied two-row update.
 */
export function mergeInventoryDealAssignments(
  items: Array<InventoryItem & {
    customer: InventoryCustomerSummary | null;
    locations?: { name: string } | null;
  }>,
  assignments: InventoryDealAssignmentRow[],
): InventoryWithDealAssignment[] {
  const byInventoryItemId = new Map<string, InventoryDealAssignment>();

  for (const assignment of assignments) {
    if (!assignment.inventory_item_id || !assignment.contact) continue;
    byInventoryItemId.set(assignment.inventory_item_id, {
      dealId: assignment.id,
      customer: assignment.contact,
    });
  }

  return items.map(item => ({
    ...item,
    dealAssignment: byInventoryItemId.get(item.id) ?? null,
  }));
}

export function effectiveInventoryCustomer(item: InventoryWithDealAssignment) {
  return item.dealAssignment?.customer ?? item.customer;
}

export function hasManagedInventoryAssignment(item: Pick<
  InventoryWithDealAssignment,
  'dealAssignment' | 'deal_id' | 'job_id'
>) {
  return item.dealAssignment !== null || item.deal_id !== null || item.job_id !== null;
}

export function isAvailableInventoryStock(item: InventoryWithDealAssignment) {
  return item.status === 'In Stock'
    && item.customer_id === null
    && !hasManagedInventoryAssignment(item);
}

export function isCompletedDealSaleInventory(item: Pick<
  InventoryWithDealAssignment,
  'status' | 'dealAssignment' | 'job'
>) {
  return item.status === 'Sold'
    && item.dealAssignment !== null
    && item.job?.status === 'Completed';
}
