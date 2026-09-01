import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import {
  cellEditorValue,
  columnLabel,
  duplicateWorkbookName,
  duplicateWorksheet,
  markWorkbookForRecalculation,
  moveWorksheet,
  normalizeWorkbookName,
  normalizeWorksheetName,
  renameDefaultWorksheetToCovana,
  renameWorksheet,
  resizedWorksheetColumnWidth,
  resizedWorksheetRowHeight,
  setCellBackground,
  setCellEditorValue,
  setWorksheetSelectionBackground,
  sortOwnerWorkbooks,
  worksheetFitScale,
  worksheetGridWidth,
} from '../src/lib/ownerWorkbooks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url));

function formulaCount(workbook: ExcelJS.Workbook): number {
  let count = 0;
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
      if (cell.type === ExcelJS.ValueType.Formula) count += 1;
    }));
  }
  return count;
}

describe('owner workbook library', () => {
  it('defines an owner-only private bucket and tenant-scoped metadata policies', async () => {
    const [migrationBytes, controlsMigrationBytes, deleteMigrationBytes, componentBytes, pageBytes, privateSource] = await Promise.all([
      read('supabase/migrations/20260831234029_add_owner_workbook_library.sql'),
      read('supabase/migrations/20260901000635_allow_owner_workbook_rename.sql'),
      read('supabase/migrations/20260901163251_allow_owner_workbook_delete.sql'),
      read('src/components/OwnerWorkbookLibrary.tsx'),
      read('src/pages/OwnersCorner.tsx'),
      read('api/_assets/Inventory Profits.xlsx'),
    ]);
    const migration = migrationBytes.toString('utf8');
    const controlsMigration = controlsMigrationBytes.toString('utf8');
    const deleteMigration = deleteMigrationBytes.toString('utf8');
    const component = componentBytes.toString('utf8');
    const page = pageBytes.toString('utf8');

    assert.equal(createHash('sha256').update(privateSource).digest('hex'), 'e18ee4ac7288dc0896a150fcaeb779273dab7e91ac7b44c833b2e69d5fa379a1');
    await assert.rejects(read('public/Inventory Profits.xlsx'), /ENOENT/);
    await assert.rejects(read('api/_assets/2020 Major Unit Deals.xlsx'), /ENOENT/);
    assert.match(migration, /create table public\.owner_workbooks/);
    assert.match(migration, /'owner-workbooks',[\s\S]*false,[\s\S]*20971520/);
    assert.match(migration, /folder_key in \('inventory-profits', 'mchl-major-unit-sales'\)/);
    assert.match(migration, /for select to authenticated[\s\S]*public\.auth_role\(\)\) = 'owner_manager'/);
    assert.match(migration, /for insert to authenticated[\s\S]*created_by = \(select auth\.uid\(\)\)/);
    assert.match(migration, /owner_workbooks_storage_update[\s\S]*for update to authenticated[\s\S]*with check/);
    assert.match(controlsMigration, /grant update \(display_name\) on table public\.owner_workbooks to authenticated/);
    assert.match(deleteMigration, /create policy owner_workbooks_delete on public\.owner_workbooks[\s\S]*for delete to authenticated[\s\S]*org_id = \(select public\.auth_org\(\)\)[\s\S]*public\.auth_role\(\)\) = 'owner_manager'/);
    assert.match(deleteMigration, /grant delete on table public\.owner_workbooks to authenticated/);
    assert.doesNotMatch(migration, /to anon/);
    assert.match(page, /profile\?\.role === 'owner_manager'[\s\S]*<OwnerWorkbookLibrary \/>/);
    assert.match(component, /MCHL Major Unit Sales/);
    assert.match(component, /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
    assert.match(component, /\.storage\.from\(OWNER_WORKBOOK_BUCKET\)\.upload/);
    assert.match(component, /\.storage[\s\S]*\.from\(OWNER_WORKBOOK_BUCKET\)[\s\S]*\.createSignedUrl\(record\.storage_path, 60\)/);
    assert.match(component, /fetch\(signed\.signedUrl, \{ cache: 'no-store' \}\)/);
    assert.match(component, /\.storage\.from\(OWNER_WORKBOOK_BUCKET\)\.update/);
    assert.match(component, /window\.setTimeout\([\s\S]*1200/);
    assert.match(component, /workbook\.worksheets\.map/);
    assert.doesNotMatch(component, /type="number"/);
    assert.match(component, /Resize column \$\{columnLabel\(column\)\}/);
    assert.match(component, /Resize row \$\{row\}/);
    assert.match(component, /cursor-col-resize/);
    assert.match(component, /cursor-row-resize/);
    assert.match(component, /Duplicate sheet/);
    assert.match(component, /Rename sheet \$\{sheet\.name\}/);
    assert.match(component, /draggable=\{renamingSheetId !== sheet\.id\}/);
    assert.match(component, /Selection background/);
    assert.match(component, /selectedWorksheetCell\?\.fill\?\.type/);
    assert.match(component, /Select column \$\{columnLabel\(column\)\}/);
    assert.match(component, /Select row \$\{row\}/);
    assert.match(component, /style=\{\{ zoom: fitScale \}\}/);
    assert.match(component, /setWorksheetSelectionBackground\(worksheet, selection, color\)/);
    assert.match(component, /\.copy\(record\.storage_path, path\)/);
    assert.match(component, /copiedSha !== record\.current_sha256/);
    assert.match(component, /copiedBytes\.byteLength !== record\.file_size_bytes/);
    assert.match(component, /source_sha256: copiedSha/);
    assert.match(component, /current_sha256: copiedSha/);
    assert.match(component, /display_name: displayName/);
    assert.match(component, /Delete workbook\?/);
    assert.match(component, /Confirm delete/);
    assert.match(component, /onClick=\{\(\) => setDeleteTarget\(null\)\}/);
    assert.match(component, /\.remove\(\[target\.storage_path\]\)/);
    assert.match(component, /\.from\('owner_workbooks'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('id', target\.id\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(component, /The stored workbook changed\. Reload the page before deleting it\./);
    assert.match(component, /target\.storage_path,[\s\S]*storedBytes,[\s\S]*upsert: false/);
    assert.doesNotMatch(component, /Autosaved version/);
  });

  it('round-trips formulas and styles when one real workbook cell changes', async () => {
    const source = await read('api/_assets/Inventory Profits.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(source);
    assert.equal(workbook.worksheets.length, 6);
    assert.equal(formulaCount(workbook), 436);

    const sheet = workbook.worksheets[0];
    const formulaCell = sheet.getCell('G4');
    const formulaBefore = cellEditorValue(formulaCell.value);
    const styleBefore = structuredClone(formulaCell.style);
    const editable = sheet.getCell('A2');
    setCellEditorValue(editable, 'Autosave fidelity test');
    sheet.getRow(2).height = 42;
    sheet.getColumn(1).width = 24;
    setCellBackground(editable, '#38BDF8');
    markWorkbookForRecalculation(workbook);
    assert.equal(workbook.calcProperties.fullCalcOnLoad, true);

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    assert.equal(formulaCount(reopened), 436);
    assert.equal(cellEditorValue(reopened.worksheets[0].getCell('G4').value), formulaBefore);
    assert.deepEqual(reopened.worksheets[0].getCell('G4').style, styleBefore);
    assert.equal(reopened.worksheets[0].getCell('A2').value, 'Autosave fidelity test');
    assert.equal(reopened.worksheets[0].getRow(2).height, 42);
    assert.equal(reopened.worksheets[0].getColumn(1).width, 24);
    assert.deepEqual(reopened.worksheets[0].getCell('A2').fill, {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF38BDF8' },
    });
  });

  it('keeps formulas editable and renders spreadsheet column labels', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet');
    const cell = sheet.getCell('B2');
    setCellEditorValue(cell, '=SUM(A1:A5)');
    assert.equal(cellEditorValue(cell.value), '=SUM(A1:A5)');
    setCellEditorValue(sheet.getCell('A1'), '1250.50');
    assert.equal(sheet.getCell('A1').value, 1250.5);
    setCellEditorValue(sheet.getCell('A2'), '00125');
    assert.equal(sheet.getCell('A2').value, '00125');
    assert.deepEqual([1, 26, 27, 52, 53].map(columnLabel), ['A', 'Z', 'AA', 'AZ', 'BA']);
    assert.equal(normalizeWorkbookName('  Major Unit Deals 2021  '), 'Major Unit Deals 2021.xlsx');
    assert.equal(normalizeWorkbookName('Named.xlsx'), 'Named.xlsx');
    assert.equal(duplicateWorkbookName(
      ['2020 Major Unit Deals.xlsx', '2020 Major Unit Deals copy.xlsx'],
      '2020 Major Unit Deals.xlsx',
    ), '2020 Major Unit Deals copy 2.xlsx');
  });

  it('sorts year-prefixed workbooks newest-first with deterministic fallback ordering', () => {
    const record = (id: string, displayName: string, createdAt = '2026-09-01T00:00:00.000Z') => ({
      id,
      display_name: displayName,
      created_at: createdAt,
    });
    const input = [
      record('non-year-10', 'Archive 10.xlsx'),
      record('2022', '2022 Major Unit Deals.xlsx'),
      record('2025', '2025 Major Unit Deals 2.xlsx'),
      record('non-year-2', 'Archive 2.xlsx'),
      record('2020', '2020 Major Unit Deals.xlsx'),
      record('2024', '2024 Major Unit Deals.xlsx'),
      record('2021', '2021 Major Unit Deals.xlsx'),
      record('2023', '2023 Major Unit Deals.xlsx'),
      record('embedded-year', 'Archive 2026.xlsx'),
      record('same-newer', 'Reference.xlsx', '2026-09-02T00:00:00.000Z'),
      record('same-older', 'Reference.xlsx', '2026-09-01T00:00:00.000Z'),
    ];

    assert.deepEqual(sortOwnerWorkbooks(input).map(workbook => workbook.id), [
      '2025',
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
      'non-year-2',
      'non-year-10',
      'embedded-year',
      'same-newer',
      'same-older',
    ]);
    assert.deepEqual(input.map(workbook => workbook.id), [
      'non-year-10',
      '2022',
      '2025',
      'non-year-2',
      '2020',
      '2024',
      '2021',
      '2023',
      'embedded-year',
      'same-newer',
      'same-older',
    ]);
  });

  it('renames the default tab, allows validated sheet names, duplicates full contents beside the source, and reorders tabs', async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet('Sheet1');
    const second = workbook.addWorksheet('Sales');
    first.getCell('A1').value = 'Covana profit';
    first.getCell('B2').value = { formula: 'SUM(1,2)' };
    first.getCell('B2').font = { bold: true, color: { argb: 'FF123456' } };
    first.getColumn(2).width = 27;
    first.getRow(2).height = 41;
    first.mergeCells('C3:D3');
    first.getCell('C3').value = 'merged';

    assert.equal(renameDefaultWorksheetToCovana(workbook), true);
    assert.equal(first.name, 'Covana');
    assert.equal(renameDefaultWorksheetToCovana(workbook), false);
    assert.equal(renameWorksheet(workbook, second, ' Sales 2026 '), 'Sales 2026');
    assert.equal(normalizeWorksheetName(' Covana Covers '), 'Covana Covers');
    assert.throws(() => renameWorksheet(workbook, second, 'Covana'), /already exists/);
    assert.throws(() => normalizeWorksheetName('Bad/Name'), /cannot contain/);

    const copy = duplicateWorksheet(workbook, first);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Covana', 'Covana copy', 'Sales 2026']);
    assert.equal(copy.getCell('A1').value, 'Covana profit');
    assert.equal(cellEditorValue(copy.getCell('B2').value), '=SUM(1,2)');
    assert.deepEqual(copy.getCell('B2').font, first.getCell('B2').font);
    assert.equal(copy.getColumn(2).width, 27);
    assert.equal(copy.getRow(2).height, 41);
    assert.equal(copy.getCell('C3').isMerged, true);

    assert.equal(moveWorksheet(workbook, second.id, 0), 0);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Sales 2026', 'Covana', 'Covana copy']);

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    assert.deepEqual(reopened.worksheets.map(sheet => sheet.name), ['Sales 2026', 'Covana', 'Covana copy']);
    const reopenedCopy = reopened.getWorksheet('Covana copy');
    assert.ok(reopenedCopy);
    assert.equal(reopenedCopy.getCell('A1').value, 'Covana profit');
    assert.equal(cellEditorValue(reopenedCopy.getCell('B2').value), '=SUM(1,2)');
    assert.deepEqual(reopenedCopy.getCell('B2').font, first.getCell('B2').font);
    assert.equal(reopenedCopy.getCell('C3').isMerged, true);
  });

  it('converts pointer movement at scaled row and column boundaries into bounded workbook sizes', () => {
    assert.equal(resizedWorksheetColumnWidth(20, 35, 1), 25);
    assert.equal(resizedWorksheetColumnWidth(20, 17.5, 0.5), 25);
    assert.equal(resizedWorksheetColumnWidth(4, -100, 1), 3);
    assert.equal(resizedWorksheetColumnWidth(79, 100, 1), 80);
    assert.equal(resizedWorksheetRowHeight(20, 12.5, 1), 30);
    assert.equal(resizedWorksheetRowHeight(20, 6.25, 0.5), 30);
    assert.equal(resizedWorksheetRowHeight(13, -100, 1), 12);
    assert.equal(resizedWorksheetRowHeight(239, 100, 1), 240);
  });

  it('fits a worksheet to the available pane without rewriting stored column widths', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fit');
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 30;
    const naturalWidth = worksheetGridWidth(sheet, 2);
    assert.equal(naturalWidth, 390);
    assert.equal(worksheetFitScale(780, naturalWidth), 1);
    assert.equal(worksheetFitScale(197, naturalWidth), 0.5);
    assert.equal(worksheetFitScale(100, naturalWidth), 0.35);
    assert.equal(sheet.getColumn(1).width, 20);
    assert.equal(sheet.getColumn(2).width, 30);
  });

  it('applies row and column fill changes to the whole used sheet and preserves them on reopen', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Selection');
    sheet.getCell('C3').value = 'used range';
    setWorksheetSelectionBackground(sheet, { kind: 'row', row: 2 }, '#38BDF8');
    setWorksheetSelectionBackground(sheet, { kind: 'column', column: 3 }, '#D9EAD3');

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    const reopenedSheet = reopened.getWorksheet('Selection');
    assert.ok(reopenedSheet);
    const rowFill = reopenedSheet.getCell('A2').fill;
    const columnFill = reopenedSheet.getCell('C1').fill;
    const overlapFill = reopenedSheet.getCell('C2').fill;
    assert.equal(rowFill.type, 'pattern');
    assert.equal(rowFill.type === 'pattern' ? rowFill.fgColor?.argb : undefined, 'FF38BDF8');
    assert.equal(columnFill.type, 'pattern');
    assert.equal(columnFill.type === 'pattern' ? columnFill.fgColor?.argb : undefined, 'FFD9EAD3');
    assert.equal(overlapFill.type === 'pattern' ? overlapFill.fgColor?.argb : undefined, 'FFD9EAD3');

    setWorksheetSelectionBackground(reopenedSheet, { kind: 'column', column: 3 }, null);
    const clearedFill = reopenedSheet.getCell('C1').fill;
    assert.equal(clearedFill.type, 'pattern');
    assert.equal(clearedFill.type === 'pattern' ? clearedFill.pattern : undefined, 'none');
  });
});
