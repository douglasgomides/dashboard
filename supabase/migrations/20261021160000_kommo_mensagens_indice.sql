-- Mensagens recebidas pelo Kommo (webhook "message", guardadas em crm_raw_events) passam a ser fonte do Brand Brain.
-- Índice parcial para ler as mais recentes de um cliente sem varrer a tabela inteira. Reversão: drop index.
create index if not exists crm_raw_events_mensagens on public.crm_raw_events (client_id, received_at desc) where event_key = 'message';
