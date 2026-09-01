import type { Cell, CellValue, Workbook, Worksheet } from 'exceljs';
import type { CSSProperties } from 'react';

export const OWNER_WORKBOOK_BUCKET = 'owner-workbooks';
export const OWNER_WORKBOOK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const INVENTORY_PROFITS_FOLDER = 'inventory-profits';
export const MCHL_MAJOR_UNIT_SALES_FOLDER = 'mchl-major-unit-sales';
export const INVENTORY_PROFITS_SOURCE_SHA = 'e18ee4ac7288dc0896a150fcaeb779273dab7e91ac7b44c833b2e69d5fa379a1';
export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;
export const MAX_VISIBLE_ROWS = 250;
export const MAX_VISIBLE_COLUMNS = 80;

export type OwnerWorkbookFolder = typeof INVENTORY_PROFITS_FOLDER | typeof MCHL_MAJOR_UNIT_SALES_FOLDER;

export type OwnerWorkbookRecord = {
  id: string;
  org_id: string;
  folder_key: OwnerWorkbookFolder;
  display_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  source_sha256: string;
  current_sha256: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export function isXlsxFile(file: Pick<File, 'name' | 'size'>): boolean {
  return file.size > 0 && file.size <= MAX_WORKBOOK_BYTES && file.name.toLowerCase().endsWith('.xlsx');
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function storagePath(orgId: string, folder: OwnerWorkbookFolder): string {
  return `${orgId}/${folder}/${crypto.randomUUID()}.xlsx`;
}

export function normalizeWorkbookName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('.xlsx') ? trimmed : `${trimmed}.xlsx`;
}

export function duplicateWorkbookName(existingNames: string[], originalName: string): string {
  const stem = originalName.replace(/\.xlsx$/i, '');
  const names = new Set(existingNames.map(name => name.toLocaleLowerCase()));
  let copyNumber = 1;
  while (true) {
    const suffix = copyNumber === 1 ? ' copy' : ` copy ${copyNumber}`;
    const candidate = `${stem}${suffix}.xlsx`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
    copyNumber += 1;
  }
}

export function setCellBackground(cell: Cell, hex: string | null): void {
  if (!hex) {
    cell.fill = { type: 'pattern', pattern: 'none' };
    return;
  }
  const normalized = hex.replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) throw new Error('Cell background must be a six-digit hex color.');
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${normalized}` } };
}

export function columnLabel(columnNumber: number): string {
  let value = columnNumber;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function cellEditorValue(value: CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('formula' in value) return `=${value.formula}`;
    if ('sharedFormula' in value) return `=${value.sharedFormula}`;
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return String(value.error);
  }
  return String(value);
}

export function setCellEditorValue(cell: Cell, raw: string): void {
  const previous = cell.value;
  if (raw.startsWith('=')) {
    cell.value = { formula: raw.slice(1) };
    return;
  }
  if (!raw) {
    cell.value = null;
    return;
  }
  const dateFormatted = /[dmy]/i.test(cell.numFmt ?? '') && /\d{4}-\d{2}-\d{2}/.test(raw);
  if (previous instanceof Date || dateFormatted) {
    const date = new Date(`${raw}T00:00:00`);
    cell.value = Number.isNaN(date.getTime()) ? raw : date;
    return;
  }
  const numeric = /^-?(?:\d+|\d*\.\d+)$/.test(raw) && !/^0\d+/.test(raw);
  if ((typeof previous === 'number' || numeric) && Number.isFinite(Number(raw))) {
    cell.value = Number(raw);
    return;
  }
  if (typeof previous === 'boolean' && /^(true|false)$/i.test(raw)) {
    cell.value = raw.toLowerCase() === 'true';
    return;
  }
  cell.value = raw;
}

export function visibleGridSize(worksheet: Worksheet): { rows: number; columns: number; clipped: boolean } {
  const rows = Math.max(1, Math.min(worksheet.rowCount, MAX_VISIBLE_ROWS));
  const columns = Math.max(1, Math.min(worksheet.columnCount, MAX_VISIBLE_COLUMNS));
  return {
    rows,
    columns,
    clipped: worksheet.rowCount > MAX_VISIBLE_ROWS || worksheet.columnCount > MAX_VISIBLE_COLUMNS,
  };
}

export function markWorkbookForRecalculation(workbook: Workbook): void {
  workbook.calcProperties.fullCalcOnLoad = true;
}

const INDEXED_COLORS: Record<number, string> = {
  0: '#000000', 1: '#FFFFFF', 2: '#FF0000', 3: '#00FF00', 4: '#0000FF', 5: '#FFFF00', 6: '#FF00FF', 7: '#00FFFF',
  8: '#000000', 9: '#FFFFFF', 10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00', 14: '#FF00FF', 15: '#00FFFF',
};

function colorCss(color: { argb?: string; indexed?: number; theme?: number } | undefined): string | undefined {
  if (color?.argb?.length === 8) return `#${color.argb.slice(2)}`;
  if (color?.indexed != null) return INDEXED_COLORS[color.indexed];
  if (color?.theme === 0) return '#FFFFFF';
  if (color?.theme === 1) return '#000000';
  return undefined;
}

export function cellStyle(cell: Cell): CSSProperties {
  return {
    color: colorCss(cell.font?.color),
    backgroundColor: cell.fill?.type === 'pattern' && cell.fill.pattern !== 'none'
      ? colorCss(cell.fill.fgColor)
      : undefined,
    fontWeight: cell.font?.bold ? 700 : undefined,
    fontStyle: cell.font?.italic ? 'italic' : undefined,
    textAlign: cell.alignment?.horizontal === 'center' || cell.alignment?.horizontal === 'right'
      ? cell.alignment.horizontal
      : 'left',
  };
}
