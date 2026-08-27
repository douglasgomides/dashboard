-- Métricas essenciais do CRM pro painel de visão geral — "o que tá
-- acontecendo hoje", não estrutura. Consultas agendadas e "em atendimento"
-- casam por nome de etapa (ILIKE), não por ID fixo, pra continuar
-- funcionando se a Kommo mudar o texto exato ou outro cliente nomear
-- diferente — só deixa de contar, não quebra.
create or replace function public.crm_metricas_essenciais(p_client_id uuid)
returns table(
  total_leads bigint,
  consultas_agendadas bigint,
  em_atendimento bigint,
  em_atendimento_valor numeric,
  novos_7d bigint,
  ganhos bigint,
  perdidos bigint,
  fonte_preenchida_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select cl.id, cl.status_id, cl.price, cl.raw_payload,
      cps.status_name, cps.pipeline_name,
      case when cl.raw_payload ? 'created_at' and nullif(cl.raw_payload->>'created_at', '') is not null
        then to_timestamp((cl.raw_payload->>'created_at')::bigint)
      end as created_at
    from crm_leads cl
    join crm_pipeline_statuses cps
      on cps.crm_connection_id = cl.crm_connection_id
      and cps.pipeline_id = cl.pipeline_id
      and cps.status_id = cl.status_id
    where cl.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select
    count(*) as total_leads,
    count(*) filter (where status_name ilike '%Consulta Agendada%') as consultas_agendadas,
    count(*) filter (where pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%') as em_atendimento,
    coalesce(sum(price) filter (where pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%'), 0) as em_atendimento_valor,
    count(*) filter (where created_at > now() - interval '7 days') as novos_7d,
    count(*) filter (where status_id = '142') as ganhos,
    count(*) filter (where status_id = '143') as perdidos,
    round(
      100.0 * count(*) filter (
        where jsonb_typeof(raw_payload->'custom_fields_values') = 'array'
        and exists (
          select 1 from jsonb_array_elements(raw_payload->'custom_fields_values') f
          where f->>'field_name' ilike '%Fonte do Lead%'
        )
      )::numeric / nullif(count(*), 0), 1
    ) as fonte_preenchida_pct
  from base;
$$;

grant execute on function public.crm_metricas_essenciais(uuid) to authenticated;

-- Novos leads por dia — pro gráfico de tendência com período trocável.
create or replace function public.crm_leads_por_dia(p_client_id uuid, p_days integer default 30)
returns table(dia date, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    to_timestamp((cl.raw_payload->>'created_at')::bigint)::date as dia,
    count(*) as total
  from crm_leads cl
  where cl.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and cl.raw_payload ? 'created_at'
    and nullif(cl.raw_payload->>'created_at', '') is not null
    and to_timestamp((cl.raw_payload->>'created_at')::bigint) > now() - (p_days || ' days')::interval
  group by 1
  order by 1;
$$;

grant execute on function public.crm_leads_por_dia(uuid, integer) to authenticated;
