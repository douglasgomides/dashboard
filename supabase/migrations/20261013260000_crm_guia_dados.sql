-- Dados do Guia de organização do CRM: etapas reais (com quantos leads em cada) e o quanto os
-- campos que o painel precisa estão preenchidos. Só leitura, mesma checagem de acesso das crm_*.
create or replace function public.crm_guia_dados(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with conns as (
    select cc.id, cc.provider from crm_connections cc
    where cc.client_id = p_client_id and cc.active and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  leads as (
    select cl.*, cps.pipeline_name as funil, cps.status_name as etapa
    from crm_leads cl join conns on conns.id = cl.crm_connection_id
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null
  ),
  l90 as (select * from leads where occurred_at >= now() - interval '90 days')
  select jsonb_build_object(
    'provider', (select string_agg(distinct provider, ',') from conns),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('pipeline_name', cps.pipeline_name, 'status_name', cps.status_name,
        'total', (select count(*) from leads l where l.crm_connection_id = cps.crm_connection_id and l.pipeline_id = cps.pipeline_id and l.status_id = cps.status_id)))
      from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id), '[]'::jsonb),
    'leads', (select count(*) from l90),
    'com_origem', (select count(*) from l90 where (nullif(btrim(source), '') is not null and btrim(source) is distinct from btrim(funil))
        or (jsonb_typeof(raw_payload->'custom_fields_values') = 'array' and exists (select 1 from jsonb_array_elements(raw_payload->'custom_fields_values') f, jsonb_array_elements(f->'values') v
          where f->>'field_name' ~* '(fonte|origem|utm_source)' and nullif(btrim(v->>'value'), '') is not null))),
    'perdidos', (select count(*) from l90 where outcome = 'lost'),
    'perdidos_com_motivo', (select count(*) from l90 where outcome = 'lost' and (
        coalesce(raw_payload->>'loss_reason_id', '0') not in ('0', '')
        or nullif(raw_payload->>'lost_status_id', '') is not null
        or jsonb_typeof(raw_payload->'deal_lost_reason') = 'object'
        or nullif(raw_payload->>'motivo_perda', '') is not null)),
    'ganhos', (select count(*) from l90 where outcome = 'won'),
    'com_valor_no_ganho', (select count(*) from l90 where outcome = 'won' and greatest(
        coalesce(nullif(raw_payload->>'price', '')::numeric, 0), coalesce(nullif(raw_payload->>'value', '')::numeric, 0),
        coalesce(nullif(raw_payload->>'amount_total', '')::numeric, 0), coalesce(nullif(raw_payload->>'monetaryAmount', '')::numeric, 0)) > 0),
    'abertos', (select count(*) from leads where coalesce(outcome, 'open') = 'open'),
    'parados_90', (select count(*) from leads where coalesce(outcome, 'open') = 'open'
        and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) < now() - interval '90 days'),
    'sem_dono', (select count(*) filter (where case provider
        when 'kommo' then coalesce(raw_payload->>'responsible_user_id', '0') in ('0', '')
        when 'flwchat' then raw_payload->>'responsibleUserId' is null
        when 'clint' then jsonb_typeof(raw_payload->'user') is distinct from 'object'
        when 'rdstation' then jsonb_typeof(raw_payload->'user') is distinct from 'object'
        else false end) from leads where coalesce(outcome, 'open') = 'open')
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;

revoke all on function public.crm_guia_dados(uuid) from public, anon;
grant execute on function public.crm_guia_dados(uuid) to authenticated;
