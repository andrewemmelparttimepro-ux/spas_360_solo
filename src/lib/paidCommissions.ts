export const PAID_COMMISSION_SALESPEOPLE = [
  'Alex',
  'Ben',
  'Grace',
  'Bryson',
  'David',
  'Bad',
] as const;

export type PaidCommissionSalesperson = typeof PAID_COMMISSION_SALESPEOPLE[number];

export interface PaidCommissionValues {
  paidOn: string;
  customerName: string;
  saleAmount: number;
  commissionPercentage: number;
}

export interface PaidCommissionDateRange {
  startDate: string;
  endDate: string;
}

export function paidCommissionDateValid(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function paidCommissionDateRangeValid(range: PaidCommissionDateRange) {
  return paidCommissionDateValid(range.startDate)
    && paidCommissionDateValid(range.endDate)
    && range.startDate <= range.endDate;
}

export function commissionMonthDate(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : null;
}

export function shiftCommissionMonth(month: string, delta: number) {
  const start = commissionMonthDate(month);
  if (!start) return month;
  const [year, monthNumber] = start.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function commissionAmount(saleAmount: number, percentage: number) {
  if (!Number.isFinite(saleAmount) || !Number.isFinite(percentage)) return 0;
  return Math.round((saleAmount * percentage / 100 + Number.EPSILON) * 100) / 100;
}

export function paidCommissionValuesValid(values: PaidCommissionValues) {
  return paidCommissionDateValid(values.paidOn)
    && values.customerName.trim().length > 0
    && values.customerName.trim().length <= 200
    && Number.isFinite(values.saleAmount)
    && values.saleAmount > 0
    && Number.isFinite(values.commissionPercentage)
    && values.commissionPercentage >= 0
    && values.commissionPercentage <= 100;
}

export function paidCommissionTotal(rows: Array<{ commission_amount: number | string }>) {
  return Math.round(rows.reduce((total, row) => total + Number(row.commission_amount || 0), 0) * 100) / 100;
}
