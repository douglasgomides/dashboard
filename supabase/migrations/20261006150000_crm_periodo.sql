-- Painel do CRM passa a obedecer o seletor de periodo do cabecalho (7/30/90 dias, mes, personalizado).
-- Funcoes NOVAS e aditivas: as antigas (crm_metricas_essenciais, crm_leads_por_dia, crm_funil_por_campo) seguem iguais.
-- Datas em America/Sao_Paulo, intervalo fechado [p_from, p_to].

create or replace function public.crm_leads_resumo_periodo(p_client_id uuid, p_from date, p_to date)
returns table(novos bigint, ganhos bigint, perdidos bigint, valor numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select count(*),
    count(*) filter (where cl.outcome = 'won'),
    count(*) filter (where cl.outcome = 'lost'),
    coalesce(sum(cl.price), 0)
  from crm_leads cl
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and cl.occurred_at is not null
    and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to;
$function$;

create or replace function public.crm_leads_por_dia_periodo(p_client_id uuid, p_from date, p_to date)
returns table(dia date, total bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as total
  from crm_leads cl
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and cl.occurred_at is not null
    and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by 1
  order by 1;
$function$;

create or replace function public.crm_funil_por_campo_periodo(p_client_id uuid, p_field_name_pattern text, p_from date, p_to date)
returns table(chave text, total bigint, ganhos bigint, perdidos bigint)
language sql stable security definer set search_path to 'public'
as $function$
  with leads as (
    select cl.outcome,
      coalesce(
        (
          select v->>'value'
          from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
               jsonb_array_elements(f->'values') v
          where f->>'field_name' ilike p_field_name_pattern
            and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
          limit 1
        ),
        case when cl.provider <> 'kommo' then cl.source end,
        'Não informado'
      ) as chave
    from crm_leads cl
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select chave, count(*) as total,
    count(*) filter (where outcome = 'won') as ganhos,
    count(*) filter (where outcome = 'lost') as perdidos
  from leads
  group by chave
  order by total desc;
$function$;

grant execute on function public.crm_leads_resumo_periodo(uuid, date, date) to authenticated;
grant execute on function public.crm_leads_por_dia_periodo(uuid, date, date) to authenticated;
grant execute on function public.crm_funil_por_campo_periodo(uuid, text, date, date) to authenticated;
