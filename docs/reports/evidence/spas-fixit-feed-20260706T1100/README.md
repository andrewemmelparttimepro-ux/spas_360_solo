# SPAS 360 Fix-It Feed Proof

Date: 2026-07-06

Local preview:

- `VITE_UI_PREVIEW=1 npm run dev -- --port=3009 --host=127.0.0.1`
- URL: `http://127.0.0.1:3009/dashboard`

Checks:

- `npm run lint`
- `npm run build`

Screenshots:

- `01-admin-rail-collapsed.png` shows the Fix-It Feed hidden behind the collapsed right-side Admin rail.
- `02-admin-rail-fixit-feed.png` shows the expanded Admin rail with the Feed tab selected, Active/Archive tabs, composer, and empty active-feed state.

Database note:

- The implementation adds `supabase/migration_fix_it_feed.sql` for the `fix_it_posts`, `fix_it_comments`, `fix_it_attachments` tables, private `fix-it-files` storage bucket, RLS, grants, and realtime.
- The migration was applied to Supabase project `kxyqgkimcdxvfkceoixs` with the Supabase migration tool.
- Direct live schema check returned `posts=0`, `comments=0`, `attachments=0`, and `fix_it_files_public=false`.
