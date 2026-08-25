export const MEDIA_LIBRARY_POST_ID = 'bb5d7e0d-8aca-4ac8-890a-108f8f6133e3';

export type MediaLibraryKind = 'image' | 'pdf' | 'document';

const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

export function mediaLibraryKind(name: string, mimeType: string): MediaLibraryKind {
  const mime = mimeType.toLowerCase();
  const ext = extension(name);
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(ext)) {
    return 'image';
  }
  return 'document';
}

/**
 * SVG files stay retrievable but are not embedded in the page. This avoids
 * treating uploaded active XML content as ordinary raster imagery.
 */
export function isSafeMediaPreview(name: string, mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  const ext = extension(name);
  if (mime === 'image/svg+xml' || ext === 'svg') return false;
  return [
    'image/avif',
    'image/bmp',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
  ].includes(mime) || ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(ext);
}

/**
 * Camera rolls and AirDrop hand us names like
 * "03BDDF11-EF6C-4628-BDD8-8AA7442EB34C-5664-0000067016F96592.GIF".
 * Nobody recognizes a file by that — show "Photo · 03BDDF11" and keep the full
 * name in the tooltip/download. Human-given names just lose their extension.
 */
export function mediaLibraryDisplayName(name: string, kind: MediaLibraryKind): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').trim();
  if (!base) return name;
  const machineNamed = /^[0-9a-f]{8}[0-9a-f-]{12,}$/i.test(base.replace(/[_\s]/g, '-'));
  if (machineNamed) {
    const label = kind === 'image' ? 'Photo' : kind === 'pdf' ? 'PDF' : 'File';
    return `${label} · ${base.slice(0, 8).toUpperCase()}`;
  }
  return base;
}

export function formatMediaLibrarySize(value: string | null): string {
  if (!value) return '';
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return value;
  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}
