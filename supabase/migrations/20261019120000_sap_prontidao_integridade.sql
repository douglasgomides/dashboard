-- SAP · Prontidão v2 (docs/sap/prontidao-v2.md, correções A, B e C). Aplicado com 0 leads no banco.
-- A: roi_periodo não é executável por anônimo; search_path fixo nas 3 funções apontadas pelo advisor.
-- B: o mesmo lead da Meta não entra duas vezes na mesma clínica; todo lead tem clínica.
--    (Telefone repetido continua permitido: o n8n deduplica em 30 dias e o mesmo paciente pode voltar depois.)
-- C: decisão da consulta (Fechou, Não fechou, Pensando) só para quem não faltou.
-- Reversão:
--   grant execute on function public.roi_periodo(uuid, date, date) to public;
--   alter function public.chave_telefone(text) reset search_path; (idem as outras 2)
--   drop index if exists public.sap_leads_meta_lead_unico;
--   alter table public.sap_leads alter column clinica_id drop not null;
--   alter table public.sap_leads drop constraint if exists sap_leads_decisao_com_comparecimento;

revoke execute on function public.roi_periodo(uuid, date, date) from public, anon;
grant execute on function public.roi_periodo(uuid, date, date) to authenticated, service_role;

alter function public.chave_telefone(text) set search_path = public;
alter function public.lead_ultima_movimentacao(text, jsonb, timestamptz) set search_path = public;
alter function public.sap_item_sem_evidencia(integer) set search_path = public;

alter table public.sap_leads alter column clinica_id set not null;
create unique index if not exists sap_leads_meta_lead_unico
  on public.sap_leads (clinica_id, meta_lead_id) where meta_lead_id is not null and meta_lead_id <> '';

alter table public.sap_leads add constraint sap_leads_decisao_com_comparecimento
  check (decisao is null or compareceu is distinct from 'Não');
