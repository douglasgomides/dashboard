-- "Movimentos no CRM": a coluna de agendamentos passa a contar LEADS DISTINTOS que foram para uma etapa
-- de consulta agendada na semana, e não eventos. Um lead que sai e volta para a etapa contava duas vezes
-- (Lana, semana de 12/10: 17 eventos para 8 leads, que é o que o Kommo mostra).
create or replace function public.crm_visoes_comerciais(p_client_id uuid, p_from date, p_to date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (
    select '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$'::text as re_entrada
  ),
  conns as (
    select cc.id from crm_connections cc
    where cc.client_id = p_client_id and cc.active
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.status_name, cps.pipeline_name,
      cps.status_name ~* (select re_entrada from cfg) as entrada,
      (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)') as lista,
      (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada')) as consulta
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
  dias as (
    select cl.crm_connection_id, (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
    from crm_leads cl join conns on conns.id = cl.crm_connection_id
    where cl.removido_na_origem is null and cl.occurred_at is not null
    group by 1, 2
  ),
  importacao as (
    select d.crm_connection_id, d.dia from dias d
    join (select crm_connection_id, percentile_cont(0.5) within group (order by n) as tipico from dias group by 1) m
      on m.crm_connection_id = d.crm_connection_id
    where d.n >= 500 and d.n > 10 * m.tipico
  ),
  leads as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id,
      coalesce(cl.outcome, 'open') as outcome,
      (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia,
      coalesce(e.entrada, false) as entrada,
      coalesce(e.consulta, false) as consulta,
      e.status_name, e.pipeline_name
    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and not coalesce(e.lista, false)
      and not exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)
  ),
  coortes as (
    select date_trunc('week', dia)::date as semana, count(*) as leads,
      count(*) filter (where not entrada or outcome <> 'open') as atendidos,
      count(*) filter (where consulta or outcome = 'won') as agendados,
      count(*) filter (where outcome = 'won') as ganhos,
      count(*) filter (where outcome = 'lost') as perdidos,
      count(*) filter (where outcome = 'open') as abertos
    from leads where dia between p_from and p_to
    group by 1
  ),
  estoque as (
    select coalesce(status_name, '(etapa sem nome)') as etapa, pipeline_name as funil, bool_or(entrada) as entrada, bool_or(consulta) as consulta,
      count(*) as total,
      count(*) filter (where p_to - dia <= 3) as ate_3,
      count(*) filter (where p_to - dia between 4 and 7) as de_4_a_7,
      count(*) filter (where p_to - dia between 8 and 30) as de_8_a_30,
      count(*) filter (where p_to - dia > 30) as mais_30
    from leads where outcome = 'open' and dia <= p_to
    group by 1, 2
  ),
  ev as (
    select ce.*, coalesce(e.consulta, false) as para_consulta
    from crm_lead_eventos ce
    left join etapas e on e.crm_connection_id = ce.crm_connection_id and e.pipeline_id = ce.pipeline_para and e.status_id = ce.status_para
    where ce.client_id = p_client_id and ce.crm_connection_id in (select id from conns)
      and ce.tipo <> 'entrou'
      and (ce.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  movimentos as (
    select date_trunc('week', (ocorreu_em at time zone 'America/Sao_Paulo')::date)::date as semana,
      count(*) filter (where tipo = 'mudou_etapa') as mudancas,
      count(distinct external_lead_id) filter (where tipo = 'mudou_etapa' and para_consulta) as agendaram,
      count(*) filter (where tipo = 'ganhou') as ganhos,
      count(*) filter (where tipo = 'perdeu') as perdas,
      count(*) filter (where tipo = 'reabriu') as reabertos,
      count(distinct external_lead_id) as leads_mexidos
    from ev group by 1
  )
  select jsonb_build_object(
    'tem_crm', exists (select 1 from conns),
    'coortes', coalesce((select jsonb_agg(to_jsonb(c) order by c.semana) from coortes c), '[]'::jsonb),
    'estoque', coalesce((select jsonb_agg(to_jsonb(s) order by s.entrada desc, s.total desc) from estoque s), '[]'::jsonb),
    'abertos', (select count(*) from leads where outcome = 'open' and dia <= p_to),
    'movimentos', coalesce((select jsonb_agg(to_jsonb(m) order by m.semana) from movimentos m), '[]'::jsonb),
    'eventos_desde', (select min(registrado_em) from crm_lead_eventos ce where ce.client_id = p_client_id and ce.crm_connection_id in (select id from conns))
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;
