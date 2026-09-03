import type { CSSProperties } from 'react';

export interface PrintableSheet {
  workbookName: string;
  sheetName: string;
  columns: number[];
  rows: number[];
  columnLabel: (column: number) => string;
  columnWidthPx: (column: number) => number;
  cellText: (row: number, column: number) => string;
  cellStyle: (row: number, column: number) => CSSProperties;
  printedAt?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineStyle(style: CSSProperties): string {
  const parts: string[] = [];
  if (style.color) parts.push(`color:${style.color}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style:${style.fontStyle}`);
  if (style.textAlign) parts.push(`text-align:${style.textAlign}`);
  return parts.join(';');
}

/**
 * Only the sheet that is open gets printed — never the neighbouring tabs. The
 * document is self-contained HTML, sized to landscape Letter, and the table
 * scales to the page width so wide sheets stay on one sheet of paper across.
 */
export function worksheetPrintDocument(sheet: PrintableSheet): string {
  const printedAt = sheet.printedAt ?? new Date();
  const totalWidth = sheet.columns.reduce((sum, column) => sum + sheet.columnWidthPx(column), 0) || 1;
  const cols = sheet.columns
    .map(column => `<col style="width:${((sheet.columnWidthPx(column) / totalWidth) * 100).toFixed(3)}%">`)
    .join('');
  const head = sheet.columns.map(column => `<th>${escapeHtml(sheet.columnLabel(column))}</th>`).join('');
  const body = sheet.rows.map(row => {
    const cells = sheet.columns.map(column => {
      const text = sheet.cellText(row, column);
      const style = inlineStyle(sheet.cellStyle(row, column));
      return `<td${style ? ` style="${style}"` : ''}>${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr><th>${row}</th>${cells}</tr>`;
  }).join('');
  const title = `${sheet.workbookName} — ${sheet.sheetName}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font: 10px/1.25 -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: #101827; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 6px; }
  header h1 { font-size: 14px; margin: 0; }
  header p { margin: 0; color: #4b5563; font-size: 9px; }
  table { border-collapse: collapse; table-layout: fixed; width: 100%; }
  th, td { border: 1px solid #9ca3af; padding: 2px 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: top; }
  thead th, tbody th { background: #e5e7eb; color: #374151; font-weight: 700; text-align: center; }
  tbody th { width: 28px; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p>Printed ${escapeHtml(printedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))} · SPAS 360 Owners Corner</p>
</header>
<table>
  <colgroup><col style="width:28px">${cols}</colgroup>
  <thead><tr><th></th>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>
</body>
</html>`;
}

/** Open the document in a print window; the window must be opened synchronously in the click. */
export function printWorksheetDocument(html: string, printWindow: Window | null): boolean {
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const run = () => {
    printWindow.focus();
    printWindow.print();
  };
  if (printWindow.document.readyState === 'complete') setTimeout(run, 50);
  else printWindow.addEventListener('load', run, { once: true });
  return true;
}
