export type InventoryHistoryEntry = {
  id: string;
  event_type: 'created' | 'flooring_changed';
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  before_designation: string | null;
  after_designation: string | null;
  source: 'server' | 'audit_log' | 'legacy_record';
};

export function inventoryHistoryActor(entry: Pick<InventoryHistoryEntry, 'actor_id' | 'actor_name' | 'source'>): string {
  if (entry.actor_name?.trim()) return entry.actor_name.trim();
  if (entry.actor_id) return `User ${entry.actor_id}`;
  return entry.source === 'server' ? 'System / no signed-in user' : 'Creator or actor not recorded';
}

/** Display labels only: ledger values remain exactly as originally recorded. */
function inventoryHistoryDesignation(value: string | null): string {
  const recorded = value?.trim() || 'Not designated';
  switch (recorded) {
    case 'MCHL TCCU': return 'Minot TCCU';
    case 'Spas Etc TCCU': return 'Bismarck TCCU';
    case 'Wells Fargo Minot': return 'Minot Wells Fargo';
    case 'Wells Fargo Bismarck': return 'Bismarck Wells Fargo';
    default: return recorded;
  }
}

export function inventoryHistoryDescription(entry: Pick<InventoryHistoryEntry, 'event_type' | 'before_designation' | 'after_designation' | 'actor_id' | 'actor_name' | 'source'>): string {
  if (entry.event_type === 'created') {
    return entry.after_designation === null ? 'Inventory created' : `Inventory created · ${inventoryHistoryDesignation(entry.after_designation)}`;
  }
  const change = `changed the inventory flooring status from "${inventoryHistoryDesignation(entry.before_designation)}" to "${inventoryHistoryDesignation(entry.after_designation)}".`;
  const actor = entry.actor_name?.trim() || entry.actor_id;
  if (actor) return `User ${actor} ${change}`;
  const actorContext = entry.source === 'server' ? 'No signed-in user was recorded.' : 'The actor was not recorded.';
  return `The inventory flooring status changed from "${inventoryHistoryDesignation(entry.before_designation)}" to "${inventoryHistoryDesignation(entry.after_designation)}". ${actorContext}`;
}
