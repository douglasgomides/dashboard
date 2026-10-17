-- "R$ em jogo" na auditoria comercial: pacientes recuperáveis do período (a IA viu interesse real e não houve
-- agendamento) × ticket da clínica. Ticket, nesta ordem: definido pela equipe (clients.ticket_medio), mediana das
-- vendas ganhas no CRM nos últimos 12 meses (mínimo 5 vendas com valor), ticket da ficha do SAP. Sem nenhum: null
-- (a tela pede para definir; nunca inventa valor). É potencial, não previsão: nem todo recuperável agenda.
-- Reversão: drop function receita_em_jogo, definir_ticket_cliente; alter table clients drop column ticket_medio.

alter table public.clients add column if not exists ticket_medio numeric check (ticket_medio is null or ticket_medio > 0);

create or replace function public.receita_em_jogo(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with permitido as (select public.is_app_admin() or public.is_client_member(p_client) ok),
  rec as (
    select count(*) n from conversas c join conversas_resumos r on r.conversa_id = c.id, permitido
    where permitido.ok and c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and coalesce(r.resumo->>'etapa', '') not in ('nao_e_paciente', 'agendou')
      and coalesce(r.resumo->>'situacao', '') <> 'agendou'
      and coalesce((r.resumo->>'recuperavel')::boolean, false)
      and coalesce((r.resumo->>'comercial')::boolean, true)
  ),
  crm as (
    select count(*) n, percentile_cont(0.5) within group (order by price) med
    from crm_leads, permitido
    where permitido.ok and client_id = p_client and outcome = 'won' and price > 0 and removido_na_origem is null
      and coalesce(occurred_at, received_at) > now() - interval '365 days'
  ),
  t as (
    select case
      when (select ticket_medio from clients where id = p_client) is not null then (select ticket_medio from clients where id = p_client)
      when (select n from crm) >= 5 then round((select med from crm)::numeric)
      else (select ticket_medio from sap_clinicas where client_id = p_client order by created_at desc limit 1) end as valor,
    case
      when (select ticket_medio from clients where id = p_client) is not null then 'equipe'
      when (select n from crm) >= 5 then 'crm'
      when (select ticket_medio from sap_clinicas where client_id = p_client order by created_at desc limit 1) is not null then 'sap'
      else null end as fonte
  )
  select case when not (select ok from permitido) then null else jsonb_build_object(
    'recuperaveis', (select n from rec),
    'ticket', (select valor from t),
    'fonte_ticket', (select fonte from t),
    'vendas_crm', (select n from crm),
    'valor', (select n from rec) * (select valor from t)
  ) end;
$function$;

create or replace function public.definir_ticket_cliente(p_client uuid, p_valor numeric)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_valor is not null and p_valor <= 0 then raise exception 'valor invalido'; end if;
  update clients set ticket_medio = p_valor where id = p_client;
end $function$;

revoke all on function public.receita_em_jogo(uuid, date, date) from public, anon;
revoke all on function public.definir_ticket_cliente(uuid, numeric) from public, anon;
grant execute on function public.receita_em_jogo(uuid, date, date) to authenticated;
grant execute on function public.definir_ticket_cliente(uuid, numeric) to authenticated;
