-- Reference only. DO NOT run until the separate Supabase Edge Function is live-tested,
-- approved, and has all worker secrets configured. Website/Netlify are untouched.
-- Use a compatible Supabase JWT for Edge verify_jwt=true, store it as
-- vault secret name `littlefox_edge_jwt` via the Supabase dashboard or Vault API.
-- The database extensions pg_cron and pg_net must already be enabled.
-- Schedule runs at 06:00 UTC Mon-Fri, i.e. 14:00 Beijing time (Asia/Shanghai).
select cron.schedule(
 'yqxyy-littlefox-incremental-14-bjt',
 '0 6 * * 1-5',
 $$
   select net.http_post(
     url := 'https://aswyecjfjayvrlijmwzl.supabase.co/functions/v1/littlefox-daily',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'littlefox_edge_jwt')
     ),
     body := '{}'::jsonb,
     timeout_milliseconds := 10000
   );
 $$
);