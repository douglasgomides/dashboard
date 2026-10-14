-- Jornada em 7 etapas no período: alcance → engajamento → comentário/direct → conversa no WhatsApp →
-- lead no CRM → consulta agendada → venda. Só leitura, checagem admin/membro.
-- Também devolve o que existe de cada fonte (ligada? tem dado? tem etapa de agendamento?), para a tela
-- explicar exatamente qual integração ou dado falta quando uma etapa vem vazia.
-- "Agendou" usa as mesmas palavras de qualidade_leads_campanha (agendad|confirmad|realizad|compareceu, ou ganhou).
create or replace function public.jornada_funil(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  ig as (
    select coalesce(sum(reach), 0) alcance, count(*) filter (where reach is not null) dias_alcance,
      coalesce(sum(coalesce(total_interactions, coalesce(likes,0) + coalesce(comments,0) + coalesce(saves,0) + coalesce(shares,0))), 0) interacoes,
      count(*) filter (where total_interactions is not null or likes is not null) dias_interacoes
    from instagram_account_daily_metrics
    where client_id = p_client and date between p_de and p_ate and (select pode from ok)
  ),
  com as (
    select count(*) comentarios, count(distinct lower(author_username)) comentaristas
    from instagram_comments
    where client_id = p_client and (commented_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate and (select pode from ok)
  ),
  conv as (
    select count(*) conversas from conversas
    where client_id = p_client and (iniciada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and (select pode from ok)
  ),
  leads as (
    select cl.outcome, cl.price, coalesce(cps.status_name, '') etapa
    from crm_leads cl
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    where cl.client_id = p_client and cl.removido_na_origem is null and (select pode from ok)
      and (coalesce(cl.occurred_at, cl.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  crm as (
    select count(*) leads,
      count(*) filter (where etapa <> '') com_etapa,
      count(*) filter (where outcome = 'won' or etapa ~* '(agendad|confirmad|realizad|compareceu)') agendados,
      count(*) filter (where outcome = 'won') vendas,
      coalesce(sum(price) filter (where outcome = 'won'), 0) receita
    from leads
  ),
  fontes as (
    select
      exists (select 1 from instagram_accounts where client_id = p_client and active) tem_instagram,
      exists (select 1 from instagram_comments where client_id = p_client) tem_comentarios,
      exists (select 1 from clients where id = p_client and wts_company_id is not null) tem_whatsapp,
      exists (select 1 from conversas where client_id = p_client) tem_conversas,
      exists (select 1 from crm_connections where client_id = p_client and active) tem_crm,
      exists (select 1 from crm_pipeline_statuses s join crm_connections x on x.id = s.crm_connection_id
              where x.client_id = p_client and x.active and s.status_name ~* '(agend|consulta|confirmad|realizad|compareceu)') tem_etapa_agendamento,
      exists (select 1 from crm_leads where client_id = p_client and outcome = 'won') tem_venda_registrada,
      (select provider from crm_connections where client_id = p_client and active order by created_at desc limit 1) crm_provider
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'alcance', ig.alcance, 'dias_alcance', ig.dias_alcance,
    'interacoes', ig.interacoes, 'dias_interacoes', ig.dias_interacoes,
    'comentarios', com.comentarios, 'comentaristas', com.comentaristas,
    'conversas', conv.conversas,
    'leads', crm.leads, 'leads_com_etapa', crm.com_etapa, 'agendados', crm.agendados, 'vendas', crm.vendas, 'receita', crm.receita,
    'dias_periodo', (p_ate - p_de) + 1,
    'fontes', to_jsonb(fontes)
  ) end
  from ig, com, conv, crm, fontes;
$function$;

revoke all on function public.jornada_funil(uuid, date, date) from public, anon;
grant execute on function public.jornada_funil(uuid, date, date) to authenticated;
