-- WS3: enable realtime for the notifications table so the header bell updates live.
-- Idempotent: only adds the table to the supabase_realtime publication if not already present.
-- Apply via the Supabase SQL editor or `supabase db push`.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
