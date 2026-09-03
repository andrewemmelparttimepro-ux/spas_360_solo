import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { worksheetPrintDocument } from '../src/lib/workbookPrint.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Owners Corner sheet printing', () => {
  it('prints only the open sheet as a landscape, self-contained document', () => {
    const html = worksheetPrintDocument({
      workbookName: '2024 Major Unit Deals',
      sheetName: 'Export Summary',
      columns: [1, 2],
      rows: [1, 2],
      columnLabel: column => column === 1 ? 'A' : 'B',
      columnWidthPx: column => column === 1 ? 100 : 300,
      cellText: (row, column) => `${row}<${column}>`,
      cellStyle: (row) => row === 1 ? { fontWeight: 700, backgroundColor: '#fff2cc', textAlign: 'center' } : {},
      printedAt: new Date('2026-09-03T14:00:00Z'),
    });
    assert.match(html, /<title>2024 Major Unit Deals — Export Summary<\/title>/);
    assert.match(html, /@page \{ size: letter landscape/);
    assert.match(html, /<col style="width:25\.000%"><col style="width:75\.000%">/);
    assert.match(html, /<td style="background-color:#fff2cc;font-weight:700;text-align:center">1&lt;1&gt;<\/td>/);
    assert.doesNotMatch(html, /Sheet2|tabs/);
  });

  it('exposes a print button in the open-workbook toolbar that targets the active sheet', async () => {
    const component = await read('src/components/OwnerWorkbookLibrary.tsx');
    assert.match(component, /aria-label=\{`Print sheet \$\{worksheet\.name\}`\}/);
    assert.match(component, /window\.open\('', '_blank'/);
    assert.match(component, /sheetName: worksheet\.name/);
    assert.match(component, /printWorksheetDocument\(html, printWindow\)/);
  });
});
