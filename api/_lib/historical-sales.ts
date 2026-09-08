import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';

export const MINOT_LOCATION_ID = '00000000-0000-0000-0000-000000000010';
export const HISTORICAL_SALES_FOLDER = 'mchl-major-unit-sales';

// This human-designated source is identified by its stable row, not its editable
// display name. Other years/tenants retain their recorded-deal comparison until
// an authoritative historical source is explicitly connected for them.
export function historicalSalesSourceId(orgId: string, year: number): string | null {
  return orgId === '00000000-0000-0000-0000-000000000001' && year === 2025
    ? '27084e31-8428-4558-8f6a-da0e1f3e2d53' : null;
}

export type HistoricalSales = { total: number; missingAmounts: number };

export function historicalSalesMonth(value: unknown): { year: number; monthName: string } | null {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) return null;
  return { year, monthName: new Date(`${value}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) };
}

function text(cell: ExcelJS.Cell): string {
  return cell.text.trim().replace(/\s+/g, ' ');
}

/** Read sale detail once. Salesperson SUM rows and grand totals are not sales.
 * Split sales retain their individual allocated selling prices, as in the source.
 * Cached subtotal formulas are deliberately not relied upon after workbook edits.
 */
export async function readHistoricalSales(bytes: Buffer, month: string): Promise<HistoricalSales | null> {
  const period = historicalSalesMonth(month);
  if (!period) throw new Error('Choose a valid historical sales month.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const prefix = `${period.monthName} ${period.year} - Major Unit Sal`;
  const matches = workbook.worksheets.filter(sheet => sheet.name.startsWith(prefix));
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('The historical sales month has more than one worksheet.');
  const sheet = matches[0];
  if (!/^sales\s*person$/i.test(text(sheet.getCell('C2'))) || text(sheet.getCell('D2')) !== 'Customer' || text(sheet.getCell('E2')) !== 'Selling Price') {
    throw new Error('The historical sales worksheet format could not be verified.');
  }

  let cents = 0;
  let missingAmounts = 0;
  sheet.eachRow((row, index) => {
    if (index <= 3) return;
    // Source subtotal rows have their label in A; sale detail has a customer
    // in D. Some real sales have no salesperson, which does not erase revenue.
    if (text(row.getCell(1)) || !text(row.getCell(4))) return;
    const value = row.getCell(5).value;
    if (value === null || value === undefined || value === '') { missingAmounts += 1; return; }
    // Selling-price formulas need explicit support before they can be trusted;
    // ExcelJS does not recalculate cached formula results.
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('A historical selling price could not be verified.');
    }
    cents += Math.round(value * 100);
  });
  return { total: cents / 100, missingAmounts };
}

export async function authorizeHistoricalSales(token: string | null, dependencies: {
  verifyUser: (token: string) => Promise<string | null>;
  loadProfile: (userId: string) => Promise<{ id: string; org_id: string | null; role: string | null } | null>;
}): Promise<{ ok: true; orgId: string } | { ok: false; status: 401 | 403; error: string }> {
  if (!token) return { ok: false, status: 401, error: 'Missing authorization' };
  const userId = await dependencies.verifyUser(token);
  if (!userId) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const profile = await dependencies.loadProfile(userId);
  // Matches the dealership sales read boundary, including the restrictive
  // technician_office_block policy on deals. No requested org is ever accepted.
  if (profile?.id !== userId || !profile?.org_id || !['owner_manager', 'service_manager', 'salesperson'].includes(profile.role ?? '')) {
    return { ok: false, status: 403, error: 'Dealership sales access is required.' };
  }
  return { ok: true, orgId: profile.org_id };
}

export function verifyHistoricalSalesBytes(bytes: Buffer, metadata: { file_size_bytes: number; current_sha256: string }) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes.length !== Number(metadata.file_size_bytes)
    || createHash('sha256').update(bytes).digest('hex') !== metadata.current_sha256) {
    throw new Error('The historical sales workbook changed. Please retry.');
  }
}
