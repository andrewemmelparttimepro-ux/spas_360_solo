-- Tech field capture: job photos (metadata + storage bucket) + time clock uses
-- the existing time_entries table. Applied to project kxyqgkimcdxvfkceoixs 2026-07-05.

CREATE TABLE job_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  photo_type TEXT NOT NULL DEFAULT 'General'
    CHECK (photo_type IN ('General', 'Proof of Delivery', 'Damage', 'Serial Number', 'Before', 'After')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_photos_job ON job_photos(job_id);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY jp_read ON job_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.org_id = auth_org())
);
CREATE POLICY jp_insert ON job_photos FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.org_id = auth_org())
);
CREATE POLICY jp_delete ON job_photos FOR DELETE USING (created_by = auth.uid() OR is_manager());

-- Storage bucket: public read (unguessable uuid paths), authenticated write
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "job_photos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos');

CREATE POLICY "job_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos' AND owner = auth.uid());
