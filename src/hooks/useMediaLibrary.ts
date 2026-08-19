import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  MEDIA_LIBRARY_POST_ID,
  mediaLibraryKind,
  type MediaLibraryKind,
} from '@/lib/mediaLibrary';
import { requestLibraryDeletion } from '@/lib/libraryDeletion';

const BUCKET = 'fix-it-files';
const SIGNED_URL_SECONDS = 10 * 60;

interface MediaLibraryRow {
  id: string;
  name: string;
  mime_type: string | null;
  size: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface MediaLibraryAsset {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  storagePath: string | null;
  createdAt: string;
  kind: MediaLibraryKind;
  previewUrl: string;
}

export interface UseMediaLibraryResult {
  assets: MediaLibraryAsset[];
  isLoading: boolean;
  error: string | null;
  unavailableCount: number;
  canDelete: boolean;
  refresh: () => Promise<void>;
  download: (asset: MediaLibraryAsset) => Promise<void>;
  deleteAsset: (asset: MediaLibraryAsset) => Promise<void>;
}

const makeDownload = (url: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export function useMediaLibrary(): UseMediaLibraryResult {
  const { profile, session } = useAuth();
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailableCount, setUnavailableCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!profile?.org_id) {
      setAssets([]);
      setUnavailableCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Confirm the one authorized source post belongs to the signed-in user's
    // organization before reading any attachment metadata.
    const { data: sourcePost, error: postError } = await supabase
      .from('fix_it_posts')
      .select('id')
      .eq('id', MEDIA_LIBRARY_POST_ID)
      .eq('org_id', profile.org_id)
      .maybeSingle();

    if (postError || !sourcePost) {
      setAssets([]);
      setUnavailableCount(0);
      setError('The saved media library is not available for this organization.');
      setIsLoading(false);
      return;
    }

    const { data, error: attachmentError } = await supabase
      .from('fix_it_attachments')
      .select('id,name,mime_type,size,storage_path,created_at')
      .eq('post_id', MEDIA_LIBRARY_POST_ID)
      .eq('org_id', profile.org_id)
      .eq('purpose', 'report')
      .is('comment_id', null)
      .order('created_at', { ascending: true });

    if (attachmentError) {
      setAssets([]);
      setUnavailableCount(0);
      setError('Saved media could not be loaded. Please try again.');
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as MediaLibraryRow[];
    const paths = [...new Set(rows.flatMap(row => row.storage_path ? [row.storage_path] : []))];
    const signedByPath = new Map<string, string>();

    if (paths.length > 0) {
      const { data: signedRows, error: signingError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS);

      if (!signingError) {
        for (const item of signedRows ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      }
    }

    const nextAssets = rows.map(row => ({
      id: row.id,
      name: row.name || 'Untitled item',
      mimeType: row.mime_type ?? '',
      size: row.size,
      storagePath: row.storage_path,
      createdAt: row.created_at,
      kind: mediaLibraryKind(row.name, row.mime_type ?? ''),
      previewUrl: row.storage_path ? signedByPath.get(row.storage_path) ?? '' : '',
    }));
    const unavailable = nextAssets.filter(asset => !asset.previewUrl).length;

    setAssets(nextAssets);
    setUnavailableCount(unavailable);
    setError(null);
    setIsLoading(false);
  }, [profile?.org_id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const download = useCallback(async (asset: MediaLibraryAsset) => {
    if (!asset.storagePath) throw new Error('This item is not available to download.');
    const { data, error: signingError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.storagePath, SIGNED_URL_SECONDS, { download: asset.name });
    if (signingError || !data?.signedUrl) throw new Error('The download could not be prepared. Please try again.');
    makeDownload(data.signedUrl);
  }, []);

  const deleteAsset = useCallback(async (asset: MediaLibraryAsset) => {
    if (profile?.role !== 'owner_manager' || !session?.access_token) {
      throw new Error('Only an owner / manager can delete saved files.');
    }
    await requestLibraryDeletion(
      { kind: 'media_attachment', id: asset.id, name: asset.name },
      session.access_token,
    );
    await refresh();
  }, [profile?.role, refresh, session?.access_token]);

  return {
    assets,
    isLoading,
    error,
    unavailableCount,
    canDelete: profile?.role === 'owner_manager',
    refresh,
    download,
    deleteAsset,
  };
}
