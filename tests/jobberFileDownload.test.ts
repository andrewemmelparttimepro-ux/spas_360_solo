import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assembleJobberFile } from '../src/lib/jobberFileDownload.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const originals = [new Uint8Array([0, 255, 31, 20]), new Uint8Array([91, 0, 2])];
const parts = originals.map((bytes, i) => ({ storage_path: `private/part-${i}`, size: bytes.byteLength, sha256: hash(bytes) }));
const expected = { size: 7, sha256: hash(new Uint8Array(originals.flatMap(bytes => [...bytes]))), contentType: 'video/mp4' };
const load = async (path: string) => originals[Number(path.split('-').at(-1))].slice().buffer;

test('downloads reproduce every original binary byte and report progress', async () => {
  const progress: number[] = [];
  const blob = await assembleJobberFile(parts, expected, load, size => progress.push(size));
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [0, 255, 31, 20, 91, 0, 2]);
  assert.equal(blob.type, 'video/mp4');
  assert.deepEqual(progress, [4, 7]);
});
test('corrupt, missing, and reordered parts never produce a downloadable original', async () => {
  await assert.rejects(assembleJobberFile(parts.slice(0, 1), expected, load, () => {}), /incomplete/);
  await assert.rejects(assembleJobberFile(parts, expected, async () => new Uint8Array([1, 2, 3, 4]).buffer, () => {}), /verification/);
  await assert.rejects(assembleJobberFile([...parts].reverse(), expected, load, () => {}), /verification/);
});
