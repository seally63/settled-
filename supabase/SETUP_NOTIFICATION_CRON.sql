-- ============================================================================
-- SETUP NOTIFICATION CRON JOBS
-- Run this in Supabase SQL Editor to configure scheduled tasks
-- ============================================================================

-- 1. Enable pg_net extension (required for HTTP calls from SQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Clean up old/failing cron jobs
DO $$
DECLARE
  job_names TEXT[] := ARRAY[
    'auto_expire_stale_items',
    'process-notifications-and-expiry',
    'auto-expire-quotes-and-requests',
    'send-response-nudges',
    'send-push-notifications'
  ];
  job_name TEXT;
BEGIN
  FOREACH job_name IN ARRAY job_names LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Unscheduled job: %', job_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Job % not found, skipping', job_name;
    END;
  END LOOP;
END $$;

-- 3. Schedule quote/request expiry every 5 minutes
-- This runs the database function directly (no HTTP needed)
SELECT cron.schedule(
  'auto-expire-quotes-and-requests',
  '*/5 * * * *',
  $$SELECT fn_run_expiry_checks();$$
);

-- 4. Schedule response time nudges (once daily at 9 AM UTC)
-- Reminds trades about pending requests older than 24 hours
SELECT cron.schedule(
  'send-response-nudges',
  '0 9 * * *',
  $$SELECT fn_send_response_time_nudges();$$
);

-- 5. Schedule push notification sending every minute
-- Calls Edge Function via HTTP to actually send notifications to Expo
SELECT cron.schedule(
  'send-push-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncwbkoriohrkvulvzzuw.supabase.co/functions/v1/send-push-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "tradify-cron-secret-2024"}'::jsonb,
    body := '{"batch_size": 50}'::jsonb
  );
  $$
);

-- 6. Verify the jobs were created
SELECT
  jobid,
  jobname,
  schedule,
  LEFT(command, 60) AS command_preview,
  active
FROM cron.job
ORDER BY jobname;
