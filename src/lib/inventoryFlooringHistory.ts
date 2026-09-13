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

export function inventoryHistoryDescription(entry: Pick<InventoryHistoryEntry, 'event_type' | 'before_designation' | 'after_designation'>): string {
  const designation = (value: string | null) => value?.trim() || 'Not designated';
  if (entry.event_type === 'created') {
    return entry.after_designation === null ? 'Inventory created' : `Inventory created · ${designation(entry.after_designation)}`;
  }
  return `Flooring changed: ${designation(entry.before_designation)} → ${designation(entry.after_designation)}`;
}
