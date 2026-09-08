import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { authorizeHistoricalSales, historicalSalesMonth, historicalSalesSourceId, readHistoricalSales, verifyHistoricalSalesBytes } from '../api/_lib/historical-sales.ts';

async function source(edit?: (sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('September 2025 - Major Unit Sal');
  sheet.getCell('C2').value = 'Sales Person';
  sheet.getCell('D2').value = 'Customer';
  sheet.getCell('E2').value = 'Selling Price';
  let row = 4;
  for (const [name, amounts] of [
    ['Alex', [10995, 5495, 11495, 14995, 5995, 16995, 9995, 9747]],
    ['Grace', [13995]], ['Ben', [5795, 4495]], ['Brandon', [9747, 12695]],
  ] as [string, number[]][]) {
    sheet.getCell(`A${row}`).value = name;
    sheet.getCell(`E${row}`).value = { formula: `SUM(E${row + 1}:E${row + amounts.length})`, result: 999999 };
    row += 1;
    for (const amount of amounts) {
      sheet.getCell(`C${row}`).value = name;
      sheet.getCell(`D${row}`).value = 'Example Customer';
      sheet.getCell(`E${row}`).value = amount;
      sheet.getCell(`G${row}`).value = amount - 100;
      row += 1;
    }
  }
  // Template and total rows must not inflate sale detail.
  sheet.getCell('A21').value = 'All';
  sheet.getCell('E21').value = { formula: 'SUM(E22:E31)' };
  sheet.getCell('C22').value = 'All';
  sheet.getCell('A32').value = 'Grand Total';
  sheet.getCell('E32').value = 132439;
  edit?.(sheet, workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('September source selling prices reconcile without double counting subtotals, split sales or net prices', async () => {
  assert.deepEqual(await readHistoricalSales(await source(), '2025-09'), { total: 132439, missingAmounts: 0 });
});

test('unassigned customer sales still count; blank templates do not, and missing amounts stay visible', async () => {
  const bytes = await source(sheet => {
    sheet.getCell('C2').value = 'Salesperson';
    sheet.getCell('D35').value = 'Unassigned Customer';
    sheet.getCell('E35').value = 10.25;
    sheet.getCell('D36').value = 'Missing Amount Customer';
    sheet.getCell('D37').value = 'Zero Amount Customer';
    sheet.getCell('E37').value = 0;
  });
  assert.deepEqual(await readHistoricalSales(bytes, '2025-09'), { total: 132449.25, missingAmounts: 1 });
});

test('month and year are exact, and duplicate matching sheets fail rather than double count', async () => {
  assert.equal(await readHistoricalSales(await source(), '2026-09'), null);
  assert.equal(await readHistoricalSales(await source(), '2025-08'), null);
  await assert.rejects(readHistoricalSales(await source((sheet, book) => {
    sheet.name = 'May 2025 - Major Unit Sales';
    book.addWorksheet('May 2025 - Major Unit Sale');
  }), '2025-05'), /more than one/);
  for (const value of ['2025-00', '2025-13', '25-09', ['2025-09'], '2025-09-01', '1999-09']) assert.equal(historicalSalesMonth(value), null);
});

test('wrong column meaning and uncalculated selling-price formulas fail visibly', async () => {
  await assert.rejects(readHistoricalSales(await source(sheet => { sheet.getCell('E2').value = 'Commission'; }), '2025-09'), /format/);
  await assert.rejects(readHistoricalSales(await source(sheet => { sheet.getCell('E5').value = { formula: '10000+995', result: 10995 }; }), '2025-09'), /selling price/);
});

test('downloaded source bytes must match the current version hash and size', async () => {
  const bytes = await source();
  const metadata = { file_size_bytes: bytes.length, current_sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.doesNotThrow(() => verifyHistoricalSalesBytes(bytes, metadata));
  assert.throws(() => verifyHistoricalSalesBytes(Buffer.from('another source'), metadata), /changed/);
  assert.throws(() => verifyHistoricalSalesBytes(bytes, { ...metadata, file_size_bytes: bytes.length + 1 }), /changed/);
  assert.throws(() => verifyHistoricalSalesBytes(bytes, { ...metadata, current_sha256: '0'.repeat(64) }), /changed/);
});

test('the historical source follows its immutable record only for the verified tenant and year', () => {
  const org = '00000000-0000-0000-0000-000000000001';
  assert.equal(historicalSalesSourceId(org, 2025), '27084e31-8428-4558-8f6a-da0e1f3e2d53');
  assert.equal(historicalSalesSourceId(org, 2026), null);
  assert.equal(historicalSalesSourceId('another-tenant', 2025), null);
});

test('authorization rejects missing/invalid sessions before reading a profile', async () => {
  let reads = 0;
  const dependencies = { verifyUser: async () => null, loadProfile: async () => { reads += 1; return null; } };
  for (const token of [null, 'invalid']) {
    const result = await authorizeHistoricalSales(token, dependencies);
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.status, 401);
  }
  assert.equal(reads, 0);
});

test('authorization uses the verified user tenant and denies technicians, missing profiles and mismatched users', async () => {
  for (const role of ['owner_manager', 'service_manager', 'salesperson']) {
    const result = await authorizeHistoricalSales('session', {
      verifyUser: async () => 'user-a',
      loadProfile: async id => { assert.equal(id, 'user-a'); return { id, org_id: 'tenant-a', role }; },
    });
    assert.deepEqual(result, { ok: true, orgId: 'tenant-a' });
  }
  for (const profile of [null,
    { id: 'user-a', org_id: 'tenant-a', role: 'technician' },
    { id: 'user-b', org_id: 'tenant-b', role: 'owner_manager' },
    { id: 'user-a', org_id: null, role: 'owner_manager' },
  ]) {
    const result = await authorizeHistoricalSales('session', { verifyUser: async () => 'user-a', loadProfile: async () => profile });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.status, 403);
  }
});
