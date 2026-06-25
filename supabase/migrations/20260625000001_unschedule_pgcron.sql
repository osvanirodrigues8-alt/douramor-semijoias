-- Desativa os jobs pg_cron de follow-up/pós-venda.
-- Motivo: os crons agora rodam via GitHub Actions (.github/workflows/crons.yml).
-- Manter o pg_cron ativo causava execução DUPLICADA (cliente recebendo follow-up/pós-venda
-- em dobro) e mantinha um CRON_SECRET embutido no comando do job (cron.job).
-- Idempotente: só roda se a extensão pg_cron existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN ('douramor-follow-up-cron', 'douramor-pos-venda-cron');
  END IF;
END $$;
