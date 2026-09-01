import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import {
  cellEditorValue,
  columnLabel,
  markWorkbookForRecalculation,
  setCellEditorValue,
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
    const [migrationBytes, componentBytes, pageBytes, privateSource] = await Promise.all([
      read('supabase/migrations/20260831234029_add_owner_workbook_library.sql'),
      read('src/components/OwnerWorkbookLibrary.tsx'),
      read('src/pages/OwnersCorner.tsx'),
      read('api/_assets/Inventory Profits.xlsx'),
    ]);
    const migration = migrationBytes.toString('utf8');
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
    markWorkbookForRecalculation(workbook);
    assert.equal(workbook.calcProperties.fullCalcOnLoad, true);

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    assert.equal(formulaCount(reopened), 436);
    assert.equal(cellEditorValue(reopened.worksheets[0].getCell('G4').value), formulaBefore);
    assert.deepEqual(reopened.worksheets[0].getCell('G4').style, styleBefore);
    assert.equal(reopened.worksheets[0].getCell('A2').value, 'Autosave fidelity test');
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
  });
});
