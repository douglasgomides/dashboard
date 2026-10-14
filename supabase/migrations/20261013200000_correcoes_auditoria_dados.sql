-- Correções da auditoria de dados (13/10/2026). NÃO aplicada automaticamente:
-- revisar e rodar com `supabase db push` depois do OK do Douglas.
--
-- 1. ads_resumo: CTR e CPC usavam TODOS os cliques (curtida, expandir, perfil),
--    mas a tela chama de "cliques no link". Passam a usar link_clicks.
--    custo_por_conversa dividia o gasto de TODAS as campanhas (tráfego, alcance,
--    impulsionamento) pelas conversas e saía inflado; passa a usar só o gasto
--    das campanhas que trouxeram conversa (objetivo de mensagem ou engajamento
--    com 3+ conversas), igual a src/lib/anuncios-objetivo.ts.
--    alcance_somado continua (compatibilidade), mas não é alcance real.
-- 2. wts_*: o período começava e terminava à meia-noite UTC (21h em Brasília):
--    entravam conversas da noite da véspera e saíam as da noite do último dia.
--    Passa a usar o dia de Brasília, igual às funções crm_*_periodo.

create or replace function public.ads_resumo(p_client_id uuid, p_start date, p_end date)
returns table(gasto numeric, impressoes bigint, alcance_somado bigint, cliques bigint, cliques_link bigint, conversas bigint, campanhas bigint, dias bigint, ctr numeric, cpc numeric, cpm numeric, custo_por_conversa numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with d as (
    select d.*, c.objective
    from meta_ads_daily d
    left join meta_ads_campaigns c
      on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id
    where d.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and d.date between p_start and p_end
  ), msg as (
    select campaign_id
    from d
    group by campaign_id, objective
    having objective = 'MESSAGES' or (objective = 'OUTCOME_ENGAGEMENT' and sum(conversations) >= 3)
  )
  select
    coalesce(sum(d.spend), 0),
    coalesce(sum(d.impressions), 0),
    coalesce(sum(d.reach), 0),
    coalesce(sum(d.clicks), 0),
    coalesce(sum(d.link_clicks), 0),
    coalesce(sum(d.conversations), 0),
    count(distinct d.campaign_id),
    count(distinct d.date),
    case when sum(d.impressions) > 0 then round(sum(d.link_clicks)::numeric / sum(d.impressions) * 100, 2) end,
    case when sum(d.link_clicks) > 0 then round(sum(d.spend) / sum(d.link_clicks), 2) end,
    case when sum(d.impressions) > 0 then round(sum(d.spend) / sum(d.impressions) * 1000, 2) end,
    case when sum(d.conversations) filter (where d.campaign_id in (select campaign_id from msg)) > 0
      then round(sum(d.spend) filter (where d.campaign_id in (select campaign_id from msg))
                 / sum(d.conversations) filter (where d.campaign_id in (select campaign_id from msg)), 2) end
  from d;
$function$;

create or replace function public.wts_resumo(p_client_id uuid, p_start date, p_end date)
returns table(atendimentos bigint, concluidos bigint, em_andamento bigint, espera_mediana_seg numeric, espera_cobertura bigint, atendimento_mediano_seg numeric, atendimento_cobertura bigint, sem_roteamento bigint, contatos_distintos bigint)
language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select s.*, d.name as departamento
    from wts_sessions s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
      and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select count(*),
         count(*) filter (where status = 'COMPLETED'),
         count(*) filter (where status = 'IN_PROGRESS'),
         round((percentile_cont(0.5) within group (order by wait_seconds))::numeric, 0),
         count(wait_seconds),
         round((percentile_cont(0.5) within group (order by service_seconds))::numeric, 0),
         count(service_seconds),
         count(*) filter (where department_id is null or departamento = 'Geral'),
         count(distinct contact_id)
  from base;
$function$;

create or replace function public.wts_por_departamento(p_client_id uuid, p_start date, p_end date)
returns table(departamento text, atendimentos bigint, fatia numeric, espera_mediana_seg numeric, atendimento_mediano_seg numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select case
             when s.department_id is null then '(sem departamento)'
             when d.name is null then '(equipe excluída na WTS)'
             else d.name
           end as departamento,
           s.wait_seconds, s.service_seconds
    from wts_sessions s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
      and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
  ), total as (select count(*)::numeric as n from base)
  select b.departamento,
         count(*),
         case when t.n > 0 then round(count(*) / t.n * 100, 1) end,
         round((percentile_cont(0.5) within group (order by b.wait_seconds))::numeric, 0),
         round((percentile_cont(0.5) within group (order by b.service_seconds))::numeric, 0)
  from base b, total t
  group by b.departamento, t.n
  order by count(*) desc;
$function$;

create or replace function public.wts_por_agente(p_client_id uuid, p_start date, p_end date)
returns table(agente text, atendimentos bigint, espera_mediana_seg numeric, atendimento_mediano_seg numeric, concluidos bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(a.name, '(agente desconhecido)'),
         count(*),
         round((percentile_cont(0.5) within group (order by s.wait_seconds))::numeric, 0),
         round((percentile_cont(0.5) within group (order by s.service_seconds))::numeric, 0),
         count(*) filter (where s.status = 'COMPLETED')
  from wts_sessions s
  left join wts_agents a
    on a.client_id = s.client_id and a.user_id = s.user_id
  where s.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
    and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
    and s.user_id is not null
  group by a.name
  order by count(*) desc;
$function$;

create or replace function public.wts_volume_diario(p_client_id uuid, p_start date, p_end date)
returns table(dia date, atendimentos bigint, espera_mediana_seg numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select (s.started_at at time zone 'America/Sao_Paulo')::date as dia,
         count(*),
         round((percentile_cont(0.5) within group (order by s.wait_seconds))::numeric, 0)
  from wts_sessions s
  where s.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
    and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by 1
  order by 1;
$function$;
