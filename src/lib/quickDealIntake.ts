export const DEAL_SHOPPING_OPTIONS = [
  'Hot Tubs', 'Swim Spas', 'Saunas', 'Game Room', 'Pools',
  'Patio Furniture', 'Gazebo', 'Massage Chair', 'Other',
] as const;

export function dealShoppingInterests(selected: readonly string[], details: string): string[] | null {
  const values = [...new Set([...selected, details.trim()].filter(Boolean))];
  return values.length ? values : null;
}
