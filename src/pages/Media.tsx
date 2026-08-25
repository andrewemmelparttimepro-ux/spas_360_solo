import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Images,
  LockKeyhole,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMediaLibrary, type MediaLibraryAsset } from '@/hooks/useMediaLibrary';
import { formatMediaLibrarySize, isSafeMediaPreview, mediaLibraryDisplayName } from '@/lib/mediaLibrary';
import { confirmLibraryDeletion } from '@/lib/libraryDeletion';

function AssetPreview({ asset }: { asset: MediaLibraryAsset }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [asset.previewUrl]);

  if (asset.previewUrl && isSafeMediaPreview(asset.name, asset.mimeType) && !failed) {
    return (
      <img
        src={asset.previewUrl}
        alt={asset.name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    );
  }

  const Icon = asset.kind === 'image' ? FileImage : FileText;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-500">
      <Icon className="h-10 w-10" />
      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">
        {asset.kind === 'pdf' ? 'PDF' : asset.kind === 'image' ? 'Image' : 'Document'}
      </span>
    </div>
  );
}

function MediaCard({
  asset,
  onDownload,
  onDelete,
}: {
  asset: MediaLibraryAsset;
  onDownload: (asset: MediaLibraryAsset) => Promise<void>;
  onDelete?: (asset: MediaLibraryAsset) => Promise<void>;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInFlight = useRef(false);
  const size = formatMediaLibrarySize(asset.size);

  const startDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload(asset);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'The download could not be prepared.');
    } finally {
      setDownloading(false);
    }
  };

  const startDelete = async () => {
    if (!onDelete || deleteInFlight.current || !confirmLibraryDeletion(asset.name)) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(asset);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'The file could not be deleted. Please try again.');
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-sm">
      {asset.previewUrl ? (
        <a
          href={asset.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${asset.name}`}
          className="block aspect-[4/3] border-b border-ink-700 bg-ink-950/70 p-3 transition-opacity hover:opacity-90"
        >
          <AssetPreview asset={asset} />
        </a>
      ) : (
        <div className="aspect-[4/3] border-b border-ink-700 bg-ink-950/70 p-3">
          <AssetPreview asset={asset} />
        </div>
      )}
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold leading-snug text-ink-100" title={asset.name}>{mediaLibraryDisplayName(asset.name, asset.kind)}</h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {asset.kind === 'pdf' ? 'PDF document' : asset.kind === 'image' ? 'Image' : 'Document'}{size ? ` · ${size}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {asset.previewUrl ? (
            <a
              href={asset.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-ink-200 transition-colors hover:border-brand-400 hover:text-brand-500"
              aria-label={`Open ${asset.name}`}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          ) : (
            <span className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-ink-600">Unavailable</span>
          )}
          <button
            type="button"
            onClick={startDownload}
            disabled={!asset.storagePath || downloading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Download ${asset.name}`}
          >
            <Download className="h-3.5 w-3.5" /> {downloading ? 'Preparing…' : 'Download'}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => { void startDelete(); }}
              disabled={deleting}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-ink-700 px-2.5 text-ink-500 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Delete ${asset.name}`}
              title={`Delete ${asset.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {downloadError && <p role="alert" className="text-xs text-red-600">{downloadError}</p>}
        {deleteError && <p role="alert" className="text-xs text-red-400">{deleteError}</p>}
      </div>
    </article>
  );
}

export default function Media() {
  const { assets, isLoading, error, unavailableCount, canDelete, refresh, download, deleteAsset } = useMediaLibrary();
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const handleDelete = async (asset: MediaLibraryAsset) => {
    await deleteAsset(asset);
    setDeleteNotice(`${asset.name} was deleted.`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-500">Saved images and documents</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100">
            <Images className="h-6 w-6 text-brand-500" />
            Media
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Open or download dealership images, PDFs, and reference documents from one private library.
          </p>
        </div>
        {!isLoading && assets.length > 0 && (
          <span className="rounded-full border border-ink-700 bg-ink-950 px-3 py-1.5 text-xs font-bold text-ink-400">
            {assets.length} saved item{assets.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
        Files stay private. Access links are temporary and created only while you are signed in.
      </p>

      {deleteNotice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{deleteNotice}</div>}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {!error && unavailableCount > 0 && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          {unavailableCount} item{unavailableCount === 1 ? '' : 's'} could not be opened right now. Their names remain listed below; refresh to try again.
        </div>
      )}

      {isLoading ? (
        <section aria-label="Loading saved media" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-ink-700 bg-ink-900" />
          ))}
        </section>
      ) : !error && assets.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-ink-700 bg-ink-900/60 py-14 text-center">
          <FileImage className="mx-auto mb-3 h-9 w-9 text-ink-600" />
          <h2 className="font-bold text-ink-300">No saved media yet</h2>
          <p className="mt-1 text-sm text-ink-500">Images and documents added to this library will appear here.</p>
        </section>
      ) : !error ? (
        <section aria-label="Saved media library" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map(asset => (
            <MediaCard
              key={asset.id}
              asset={asset}
              onDownload={download}
              onDelete={canDelete ? handleDelete : undefined}
            />
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-brand-500/15 p-3 text-brand-500"><Wrench className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink-100">Service job media</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
              Photos tied to a delivery, damage report, serial number, or customer property remain with their service job.
            </p>
            <Link to="/service" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
              Open Schedule <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
