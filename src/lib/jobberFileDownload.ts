export type JobberFilePart = { storage_path: string; size: number; sha256: string };

const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');

export async function assembleJobberFile(parts: JobberFilePart[], expected: { size: number; sha256: string; contentType: string }, load: (path: string) => Promise<ArrayBuffer>, progress: (bytes: number) => void) {
  if (!parts.length || parts.some(part => !Number.isSafeInteger(part.size) || part.size <= 0) || parts.reduce((sum, part) => sum + part.size, 0) !== expected.size) throw new Error('The original file archive is incomplete.');
  const buffers: ArrayBuffer[] = [];
  let received = 0;
  for (const part of parts) {
    const bytes = await load(part.storage_path);
    if (bytes.byteLength !== part.size || await digest(bytes) !== part.sha256) throw new Error('The original file did not pass verification. Please retry.');
    buffers.push(bytes); received += bytes.byteLength; progress(received);
  }
  const blob = new Blob(buffers, { type: expected.contentType });
  if (await digest(await blob.arrayBuffer()) !== expected.sha256) throw new Error('The original file did not pass verification. Please retry.');
  return blob;
}
