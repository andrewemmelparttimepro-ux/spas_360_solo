import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface JobPhoto {
  id: string;
  job_id: string;
  storage_path: string;
  caption: string | null;
  photo_type: string;
  created_by: string;
  created_at: string;
  url: string;
}

export const PHOTO_TYPES = ['General', 'Proof of Delivery', 'Damage', 'Serial Number', 'Before', 'After'] as const;

const BUCKET = 'job-photos';

/**
 * Re-encode to a bandwidth-friendly JPEG (max 1600px) so a 12MP jobsite photo
 * doesn't eat the tech's data plan. Falls back to the original file if the
 * browser can't decode it.
 */
async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82)
    );
  } catch {
    return file;
  }
}

export function useJobPhotos(jobId: string | undefined) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!jobId) return;
    const { data } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    setPhotos((data ?? []).map((p) => ({
      ...p,
      url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
    })));
  }, [jobId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const uploadPhoto = useCallback(async (file: File, photoType: string, caption?: string) => {
    if (!jobId || !user) return { error: 'Not signed in' };
    setIsUploading(true);
    try {
      const blob = await compressImage(file);
      const path = `${jobId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });
      if (upErr) return { error: upErr.message };

      const { error: dbErr } = await supabase.from('job_photos').insert({
        job_id: jobId,
        storage_path: path,
        photo_type: photoType,
        caption: caption || null,
        created_by: user.id,
      });
      if (dbErr) {
        await supabase.storage.from(BUCKET).remove([path]); // don't orphan the file
        return { error: dbErr.message };
      }
      await fetchPhotos();
      return { error: null };
    } finally {
      setIsUploading(false);
    }
  }, [jobId, user, fetchPhotos]);

  const deletePhoto = useCallback(async (photo: JobPhoto) => {
    const { error } = await supabase.from('job_photos').delete().eq('id', photo.id);
    if (!error) {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
      await fetchPhotos();
    }
    return { error: error?.message ?? null };
  }, [fetchPhotos]);

  return { photos, isUploading, uploadPhoto, deletePhoto, refresh: fetchPhotos };
}
