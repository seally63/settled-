-- ============================================================================
-- VERIFY CRON AND PG_NET SETUP
-- Run this in Supabase SQL Editor to check your cron configuration
-- ============================================================================

-- 1. Check if pg_net extension is enabled (required for HTTP calls)
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 2. Check if pg_cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- 3. List all current cron jobs
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job;

-- 4. Check recent cron job runs (last 20)
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
