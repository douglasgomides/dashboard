-- Agregação de leads por campo customizado (Fonte do Lead, Tipo de
-- Procedimento) e por etapa nomeada, feita no banco em vez de trazer os
-- 17 mil leads pro navegador — o select direto batia no limite padrão de
-- 1000 linhas do PostgREST e mostrava só uma fatia recente da base.
create or replace function public.crm_funil_por_campo(p_client_id uuid, p_field_name_pattern text)
returns table(chave text, total bigint, ganhos bigint, perdidos bigint)
language sql
stable
security definer
set search_path = public
as $$
  with leads as (
    select cl.status_id,
      coalesce(
        (
          select v->>'value'
          from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
               jsonb_array_elements(f->'values') v
          where f->>'field_name' ilike p_field_name_pattern
            and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
          limit 1
        ),
        'Não informado'
      ) as chave
    from crm_leads cl
    where cl.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select chave, count(*) as total,
    count(*) filter (where status_id = '142') as ganhos,
    count(*) filter (where status_id = '143') as perdidos
  from leads
  group by chave
  order by total desc;
$$;

grant execute on function public.crm_funil_por_campo(uuid, text) to authenticated;

create or replace function public.crm_leads_por_etapa(p_client_id uuid)
returns table(pipeline text, etapa text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select cps.pipeline_name, cps.status_name, count(cl.id) as total
  from crm_pipeline_statuses cps
  join crm_connections cc on cc.id = cps.crm_connection_id
  left join crm_leads cl
    on cl.crm_connection_id = cps.crm_connection_id
    and cl.pipeline_id = cps.pipeline_id
    and cl.status_id = cps.status_id
    and cl.client_id = p_client_id
  where cc.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  group by cps.pipeline_name, cps.status_name
  having count(cl.id) > 0
  order by total desc;
$$;

grant execute on function public.crm_leads_por_etapa(uuid) to authenticated;
