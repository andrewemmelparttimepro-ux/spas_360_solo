-- job-photos is private, so createSignedUrl requires SELECT on the matching
-- storage.objects row. Authorize only objects that have job_photos metadata
-- attached to a job in the signed-in user's organization.

drop policy if exists job_photos_read_org on storage.objects;
create policy job_photos_read_org
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and exists (
    select 1
    from public.job_photos jp
    join public.jobs j on j.id = jp.job_id
    where jp.storage_path = storage.objects.name
      and j.org_id = (select public.auth_org())
  )
);
