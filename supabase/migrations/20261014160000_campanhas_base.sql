-- Base para a aba Campanhas: os públicos que uma campanha pode ativar, contados do CRM do cliente.
-- Só leitura, sem dado de paciente (só contagens), checagem admin/membro. Mesmas regras de
-- crm_base_viva (aberto = outcome null/open; movimento = lead_ultima_movimentacao).
--  - parados_90d / parados_30_90d: leads em aberto sem movimento (reativação)
--  - novos_parados_14d: leads criados nos últimos 45 dias, sem movimento há 14+ dias (ativação)
--  - ganhos_ha_um_ano: ganhos entre 11 e 13 meses atrás (retorno anual)
--  - perdidos_180d: perdidos nos últimos 180 dias (reconquista)
--  - leads_90d / agendados_90d / ganhos_90d: taxa do próprio cliente para projetar
create or replace function public.campanhas_base(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  l as (
    select cl.outcome, cl.occurred_at, coalesce(cps.status_name, '') etapa,
      public.lead_ultima_movimentacao(cl.provider, cl.raw_payload, cl.occurred_at) as m
    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and (select pode from ok)
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_crm', exists (select 1 from crm_connections where client_id = p_client_id and active),
    'abertos', count(*) filter (where coalesce(outcome, 'open') = 'open'),
    'parados_90d', count(*) filter (where coalesce(outcome, 'open') = 'open' and m < now() - interval '90 days'),
    'parados_30_90d', count(*) filter (where coalesce(outcome, 'open') = 'open' and m < now() - interval '30 days' and m >= now() - interval '90 days'),
    'novos_parados_14d', count(*) filter (where coalesce(outcome, 'open') = 'open' and occurred_at >= now() - interval '45 days' and m < now() - interval '14 days'),
    'ganhos_ha_um_ano', count(*) filter (where outcome = 'won' and m between now() - interval '13 months' and now() - interval '11 months'),
    'perdidos_180d', count(*) filter (where outcome = 'lost' and m >= now() - interval '180 days'),
    'leads_90d', count(*) filter (where occurred_at >= now() - interval '90 days'),
    'agendados_90d', count(*) filter (where occurred_at >= now() - interval '90 days' and (outcome = 'won' or etapa ~* '(agendad|confirmad|realizad|compareceu)')),
    'ganhos_90d', count(*) filter (where occurred_at >= now() - interval '90 days' and outcome = 'won')
  ) end
  from l;
$function$;

revoke all on function public.campanhas_base(uuid) from public, anon;
grant execute on function public.campanhas_base(uuid) to authenticated;
