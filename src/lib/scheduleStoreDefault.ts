type ScheduleStoreEntry = {
  navigationKey: string;
  previousEntry: string | null;
  profile: { id: string; location_id: string | null } | null;
  locations: readonly { id: string }[];
  authLoading: boolean;
  allStores: boolean;
};

/** Apply the home store once per normal Schedule arrival, after auth hydration. */
export function scheduleStoreDefault(input: ScheduleStoreEntry): { entry: string; locationId: string | null } | null {
  if (input.authLoading || !input.profile || input.allStores) return null;
  const entry = `${input.navigationKey}:${input.profile.id}`;
  if (input.previousEntry === entry) return null;
  const home = input.profile.location_id;
  return {
    entry,
    locationId: home && input.locations.some(location => location.id === home) ? home : null,
  };
}
