import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(path, 'utf8');

test('Dashboard uses the supplied duck asset at a larger responsive size', async () => {
  const dashboard = await read('src/pages/Dashboard.tsx');

  assert.match(dashboard, /src="\/mchl-duck\.png"/);
  assert.match(dashboard, /alt="Magic City Home Leisure duck logo"/);
  assert.match(
    dashboard,
    /h-16 w-24[^"]*sm:h-\[72px\] sm:w-28/,
    'the duck slot should be visibly larger than the previous h-14 welcome logo',
  );
  assert.doesNotMatch(dashboard, /logo_storage_path|logoUrl|ari-assets/);
});

test('the committed duck asset is the reviewed lossless derivative', async () => {
  const duck = await readFile('public/mchl-duck.png');

  assert.equal(duck.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(duck.readUInt32BE(16), 512);
  assert.equal(duck.readUInt32BE(20), 640);
  assert.equal(
    createHash('sha256').update(duck).digest('hex'),
    'befdd14abe712bdc580bf785ce828964489c88204d362a6420440afa2b91c37f',
  );
});
