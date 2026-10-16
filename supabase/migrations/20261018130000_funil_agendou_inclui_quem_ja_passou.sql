-- "Onde o funil quebra": "agendaram" passa a contar quem ESTÁ numa etapa de consulta agendada OU JÁ PASSOU por uma
-- (histórico de mudanças de etapa em crm_lead_eventos). Antes contava só quem estava lá hoje, e quem agendou e depois
-- avançou (consulta realizada, negociação) ou foi perdido sumia da conta. Lana, 17/09 a 16/10: 22 pelo critério antigo,
-- 37 com o histórico. Onde o histórico começou há pouco, o número nunca fica menor que o anterior.
create or replace function public.crm_diagnostico_comercial(p_client_id uuid, p_from date, p_to date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (
    select '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$'::text as re_entrada
  ),
  conns as (
    select cc.id, cc.provider, cc.subdomain from crm_connections cc
    where cc.client_id = p_client_id and cc.active
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.status_name, cps.pipeline_name,
      cps.status_name ~* (select re_entrada from cfg) as entrada,
      (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)') as lista,
      (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada')) as consulta,
      (cps.status_name ~* '(agendad|agendamento)' and cps.status_name !~* '(aguard|n[ãa]o veio|resgate|redequa|reagend)') as parece_consulta
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
  ja as (
    select distinct ce.crm_connection_id, ce.external_lead_id
    from crm_lead_eventos ce
    join etapas et on et.crm_connection_id = ce.crm_connection_id and et.pipeline_id = ce.pipeline_para
      and et.status_id = ce.status_para and et.consulta
    where ce.client_id = p_client_id and ce.tipo = 'mudou_etapa'
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
    select cl.outcome, cl.occurred_at, cl.provider,
      (nullif(btrim(cl.source), '') is not null and btrim(cl.source) = btrim(e.pipeline_name)) as origem_eh_funil,
      ((nullif(btrim(cl.source), '') is not null and btrim(cl.source) is distinct from btrim(e.pipeline_name)) or (jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
        and exists (select 1 from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f, jsonb_array_elements(f->'values') v
          where f->>'field_name' ~* '(fonte|origem)' and nullif(btrim(v->>'value'), '') is not null))) as tem_origem,
      (length(regexp_replace(coalesce(cl.contact_phone, ''), '\D', '', 'g')) >= 8
        or coalesce(p.telefone, p.ig_username) is not null) as tem_contato,
      coalesce(e.entrada, false) as entrada,
      (coalesce(e.lista, false) or exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)) as lista,
      coalesce(e.consulta, false) as consulta,
      (ja.external_lead_id is not null) as ja_agendou,
      coalesce(e.parece_consulta and not e.consulta, false) as parece_consulta,
      case cl.provider
        when 'kommo' then coalesce(cl.raw_payload->>'responsible_user_id', '0') in ('0', '')
        when 'flwchat' then cl.raw_payload->>'responsibleUserId' is null
        when 'clint' then jsonb_typeof(cl.raw_payload->'user') is distinct from 'object'
        when 'rdstation' then jsonb_typeof(cl.raw_payload->'user') is distinct from 'object'
        else null end as sem_dono,
      cl.occurred_at is not null and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to as no_periodo
    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    left join ja on ja.crm_connection_id = cl.crm_connection_id and ja.external_lead_id = cl.external_lead_id
    left join pessoas p on p.id = cl.pessoa_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null
  ),
  agg as (
    select escopo, jsonb_build_object(
      'leads', count(*),
      'atendidos', count(*) filter (where not entrada),
      'na_entrada', count(*) filter (where entrada and outcome is distinct from 'won' and outcome is distinct from 'lost'),
      'na_entrada_3d', count(*) filter (where entrada and coalesce(outcome, 'open') = 'open' and occurred_at < now() - interval '3 days'),
      'agendados', count(*) filter (where consulta or ja_agendou or outcome = 'won'),
      'em_consulta', count(*) filter (where consulta),
      'passou_por_consulta', count(*) filter (where ja_agendou and not consulta),
      'agendados_provaveis', count(*) filter (where consulta or ja_agendou or parece_consulta or outcome = 'won'),
      'ganhos_em_etapa_agenda', count(*) filter (where outcome = 'won' and (consulta or parece_consulta)),
      'origem_eh_funil', count(*) filter (where origem_eh_funil and not tem_origem),
      'parece_consulta', count(*) filter (where parece_consulta),
      'ganhos', count(*) filter (where outcome = 'won'),
      'perdidos', count(*) filter (where outcome = 'lost'),
      'com_origem', count(*) filter (where tem_origem),
      'com_contato', count(*) filter (where tem_contato),
      'abertos', count(*) filter (where coalesce(outcome, 'open') = 'open'),
      'abertos_sem_dono', count(*) filter (where coalesce(outcome, 'open') = 'open' and sem_dono),
      'dono_conhecido', bool_or(sem_dono is not null)
    ) j
    from (select 'base' escopo, * from leads where not lista
          union all select 'periodo', * from leads where no_periodo and not lista) x
    group by escopo
  )
  select jsonb_build_object(
    'provider', (select string_agg(distinct provider, ',') from conns),
    'base', coalesce((select j from agg where escopo = 'base'), '{}'::jsonb),
    'periodo', coalesce((select j from agg where escopo = 'periodo'), '{}'::jsonb),
    'lista_importada', (select count(*) from leads where lista),
    'lista_importada_periodo', (select count(*) from leads where lista and no_periodo),
    'etapas_total', (select count(*) from etapas),
    'etapas_consulta', (select count(*) from etapas where consulta),
    'etapas_consulta_equipe', (select count(*) from etapas e where exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = e.crm_connection_id and k.pipeline_id = e.pipeline_id and k.status_id = e.status_id and k.kpi = 'consulta_agendada')),
    'etapas_entrada', (select count(*) from etapas where entrada),
    'etapas_parece_consulta', (select count(*) from etapas where parece_consulta and not consulta),
    'crm_compartilhado', (
      select jsonb_build_object('clientes', count(distinct o.client_id),
        'nomes', case when public.is_app_admin() then jsonb_agg(distinct c.name) else '[]'::jsonb end)
      from conns
      join crm_connections o on o.provider = conns.provider and o.subdomain = conns.subdomain
        and o.client_id <> p_client_id and o.active and conns.subdomain is not null
      join clients c on c.id = o.client_id)
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;
