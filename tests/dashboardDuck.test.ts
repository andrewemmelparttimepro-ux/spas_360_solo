import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(path, 'utf8');

test('Dashboard uses the supplied duck asset at a larger responsive size', async () => {
  const dashboard = await read('src/pages/Dashboard.tsx');

  assert.match(dashboard, /src="\/mchl-duck-dashboard\.png"/);
  assert.match(dashboard, /alt="Magic City Home Leisure duck logo"/);
  assert.match(
    dashboard,
    /h-16 w-24[^"]*sm:h-\[72px\] sm:w-28/,
    'the duck slot should be visibly larger than the previous h-14 welcome logo',
  );
  assert.match(dashboard, /h-16 w-24[^"\n]*bg-transparent/);
  assert.doesNotMatch(dashboard, /h-16 w-24[^"\n]*bg-white/);
  assert.doesNotMatch(dashboard, /logo_storage_path|logoUrl|ari-assets/);
});

test('the Dashboard derivative removes only the edge-connected white matte', async () => {
  const [sourcePng, dashboardPng] = await Promise.all([
    readFile('public/mchl-duck.png'),
    readFile('public/mchl-duck-dashboard.png'),
  ]);

  assert.equal(sourcePng.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(
    createHash('sha256').update(sourcePng).digest('hex'),
    'befdd14abe712bdc580bf785ce828964489c88204d362a6420440afa2b91c37f',
    'the supplied opaque artwork remains untouched for other logo uses',
  );
  assert.equal(
    createHash('sha256').update(dashboardPng).digest('hex'),
    '4860a0d58f390422f84d02fcf73d09a54b12893a2a0265d27a4203627fb669a7',
  );
  assert.deepEqual(
    [dashboardPng.readUInt32BE(16), dashboardPng.readUInt32BE(20), dashboardPng[24], dashboardPng[25]],
    [512, 640, 8, 6],
    'the Dashboard derivative remains an 8-bit RGBA PNG at source dimensions',
  );
});
