-- =====================================================================
-- Tarefas agendadas (pg_cron + pg_net)
-- Antes de rodar, salve no Vault (SQL Editor):
--   select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
--   select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Notificações diárias às 7h de Brasília (10:00 UTC)
select cron.unschedule('notificacoes-diarias') where exists (select 1 from cron.job where jobname = 'notificacoes-diarias');
select cron.schedule('notificacoes-diarias', '0 10 * * *', $$ select public.gerar_notificacoes_diarias(); $$);

-- Envios automáticos do WhatsApp: de hora em hora (a função respeita o horário comercial)
select cron.unschedule('whatsapp-automatico') where exists (select 1 from cron.job where jobname = 'whatsapp-automatico');
select cron.schedule('whatsapp-automatico', '0 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-automacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$);

-- Verifica status da conexão do WhatsApp a cada 15 minutos
select cron.unschedule('whatsapp-status') where exists (select 1 from cron.job where jobname = 'whatsapp-status');
select cron.schedule('whatsapp-status', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/whatsapp-conexao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"acao":"status"}'::jsonb
  );
$$);

-- Fila de lembretes: roda a cada 5 minutos e envia no ritmo configurado (uma a uma)
select cron.unschedule('fila-lembretes-disparo') where exists (select 1 from cron.job where jobname = 'fila-lembretes-disparo');
select cron.schedule('fila-lembretes-disparo', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-fila-lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

