-- Configura jobs pg_cron para follow-up e pós-venda
-- Requer: pg_cron e pg_net já habilitados (migration 20260515211512)

-- Remove jobs antigos se existirem (idempotente)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('douramor-follow-up-cron', 'douramor-pos-venda-cron');

-- Job 1: Follow-up automático — a cada hora
SELECT cron.schedule(
  'douramor-follow-up-cron',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://douramor-semijoias.lovable.app/api/public/follow-up-cron',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "__REDACTED__ (jobs desativados na migration 20260625000001; rotacionar CRON_SECRET)"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Job 2: Pós-venda automático — a cada hora
SELECT cron.schedule(
  'douramor-pos-venda-cron',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://douramor-semijoias.lovable.app/api/public/pos-venda-cron',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "__REDACTED__ (jobs desativados na migration 20260625000001; rotacionar CRON_SECRET)"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
