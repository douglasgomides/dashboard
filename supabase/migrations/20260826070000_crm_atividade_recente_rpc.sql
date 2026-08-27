-- Últimos leads criados, com nome/fonte/etapa já resolvidos — pro feed de
-- atividade recente do painel, dar a sensação de "o que aconteceu agora".
create or replace function public.crm_atividade_recente(p_client_id uuid, p_limit integer default 10)
returns table(
  external_lead_id text,
  nome text,
  fonte text,
  etapa text,
  pipeline text,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cl.external_lead_id,
    coalesce(nullif(cl.raw_payload->>'name', ''), 'Lead #' || cl.external_lead_id) as nome,
    coalesce(
      (
        select v->>'value'
        from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
             jsonb_array_elements(f->'values') v
        where f->>'field_name' ilike '%Fonte do Lead%'
          and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
        limit 1
      ),
      'Não informado'
    ) as fonte,
    cps.status_name as etapa,
    cps.pipeline_name as pipeline,
    case when cl.raw_payload ? 'created_at' and nullif(cl.raw_payload->>'created_at', '') is not null
      then to_timestamp((cl.raw_payload->>'created_at')::bigint)
    end as criado_em
  from crm_leads cl
  join crm_pipeline_statuses cps
    on cps.crm_connection_id = cl.crm_connection_id
    and cps.pipeline_id = cl.pipeline_id
    and cps.status_id = cl.status_id
  where cl.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  order by criado_em desc nulls last
  limit p_limit;
$$;

grant execute on function public.crm_atividade_recente(uuid, integer) to authenticated;
