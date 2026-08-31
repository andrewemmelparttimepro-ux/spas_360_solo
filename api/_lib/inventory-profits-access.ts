export const INVENTORY_PROFITS_FILENAME = 'Inventory Profits.xlsx';
export const INVENTORY_PROFITS_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PRODUCTION_SUPABASE_PROJECT_REF = 'kxyqgkimcdxvfkceoixs';

export type InventoryProfitsProfile = {
  id: string;
  org_id: string | null;
  role: string | null;
};

type AuthorizationDependencies = {
  verifyUser: (token: string) => Promise<string | null>;
  loadProfile: (userId: string) => Promise<InventoryProfitsProfile | null>;
};

export type InventoryProfitsAuthorization =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; status: 401 | 403; error: string };

export function bearerToken(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export function isProductionSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export async function authorizeInventoryProfits(
  token: string | null,
  dependencies: AuthorizationDependencies,
): Promise<InventoryProfitsAuthorization> {
  if (!token) return { ok: false, status: 401, error: 'Missing authorization' };
  const userId = await dependencies.verifyUser(token);
  if (!userId) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const profile = await dependencies.loadProfile(userId);
  if (!profile?.org_id || profile.id !== userId) {
    return { ok: false, status: 403, error: 'No SPAS 360 profile is attached to this login' };
  }
  if (profile.role !== 'owner_manager') {
    return { ok: false, status: 403, error: 'Only an owner / manager can download Inventory Profits' };
  }
  return { ok: true, userId, orgId: profile.org_id };
}

export function inventoryProfitsHeaders(contentLength: number): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Type': INVENTORY_PROFITS_MIME,
    'Content-Disposition': `attachment; filename="${INVENTORY_PROFITS_FILENAME}"; filename*=UTF-8''Inventory%20Profits.xlsx`,
    'Content-Length': String(contentLength),
  };
}
