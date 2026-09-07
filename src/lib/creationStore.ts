interface CreationStoreInput {
  selectedLocationId: string | null;
  customerLocationId?: string | null;
  activeLocationId?: string | null;
  profileLocationId?: string | null;
  locations: readonly { id: string }[];
}

/** Derive defaults until the user chooses; hydration never overwrites that choice. */
export function resolveCreationStore({ selectedLocationId, customerLocationId, activeLocationId, profileLocationId, locations }: CreationStoreInput): string {
  const available = (id: string | null | undefined): id is string => !!id && locations.some(location => location.id === id);
  // An unavailable explicit choice requires reselection, never silent reassignment.
  if (selectedLocationId !== null) return available(selectedLocationId) ? selectedLocationId : '';
  return [customerLocationId, activeLocationId, profileLocationId].find(available) ?? '';
}
