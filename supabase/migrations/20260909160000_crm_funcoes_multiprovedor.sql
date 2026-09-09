-- Faz as funções do CRM lerem as colunas normalizadas em vez do formato do
-- Kommo dentro do raw_payload. Com isso a Clint (Doctor Creator e Douglas)
-- aparece nas mesmas telas que já serviam o Kommo (Lana Torres), sem um
-- segundo conjunto de funções.
--
-- Conferido antes de aplicar, replicando as duas contas lado a lado sobre os
-- 17.816 leads da Lana: total, novos em 7 dias (340), ganhos (9), perdidos
-- (1.349) e fonte preenchida (45,3%) deram idênticos nos dois caminhos.
--
-- Onde o significado não existe fora do Kommo, o comportamento antigo é
-- preservado por provedor em vez de generalizado no chute — ver o coalesce
-- de "chave" e "fonte" abaixo.

create or replace function public.crm_metricas_essenciais(p_client_id uuid)
returns table(total_leads bigint, consultas_agendadas bigint, em_atendimento bigint,
              em_atendimento_valor numeric, novos_7d bigint, ganhos bigint,
              perdidos bigint, fonte_preenchida_pct numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select cl.id, cl.price, cl.outcome, cl.occurred_at, cl.source,
      cps.status_name, cps.pipeline_name
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
    count(*) filter (where occurred_at > now() - interval '7 days') as novos_7d,
    count(*) filter (where outcome = 'won') as ganhos,
    count(*) filter (where outcome = 'lost') as perdidos,
    round(100.0 * count(*) filter (where source is not null)::numeric / nullif(count(*), 0), 1) as fonte_preenchida_pct
  from base;
$function$;

create or replace function public.crm_leads_por_dia(p_client_id uuid, p_days integer default 30)
returns table(dia date, total bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select cl.occurred_at::date as dia, count(*) as total
  from crm_leads cl
  where cl.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and cl.occurred_at is not null
    and cl.occurred_at > now() - (p_days || ' days')::interval
  group by 1
  order by 1;
$function$;

create or replace function public.crm_atividade_recente(p_client_id uuid, p_limit integer default 10)
returns table(external_lead_id text, nome text, fonte text, etapa text, pipeline text,
              criado_em timestamp with time zone)
language sql stable security definer set search_path to 'public'
as $function$
  select
    cl.external_lead_id,
    coalesce(nullif(cl.contact_name, ''), nullif(cl.raw_payload->>'name', ''),
             'Lead #' || cl.external_lead_id) as nome,
    coalesce(
      (
        select v->>'value'
        from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
             jsonb_array_elements(f->'values') v
        where f->>'field_name' ilike '%Fonte do Lead%'
          and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
        limit 1
      ),
      -- Fora do Kommo a fonte já mora em coluna. O caminho do JSON vem
      -- primeiro para o Kommo continuar dando exatamente o que dava antes.
      case when cl.provider <> 'kommo' then cl.source end,
      'Não informado'
    ) as fonte,
    cps.status_name as etapa,
    cps.pipeline_name as pipeline,
    cl.occurred_at as criado_em
  from crm_leads cl
  join crm_pipeline_statuses cps
    on cps.crm_connection_id = cl.crm_connection_id
    and cps.pipeline_id = cl.pipeline_id
    and cps.status_id = cl.status_id
  where cl.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  order by criado_em desc nulls last
  limit p_limit;
$function$;

create or replace function public.crm_funil_por_campo(p_client_id uuid, p_field_name_pattern text)
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
        -- A Clint não tem campo personalizado com esse nome; a origem do
        -- negócio é o equivalente mais próximo e já está normalizada em
        -- source. Restrito a provider <> 'kommo' para não mudar o que a
        -- Lana já via quando o campo procurado não existia no lead.
        case when cl.provider <> 'kommo' then cl.source end,
        'Não informado'
      ) as chave
    from crm_leads cl
    where cl.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select chave, count(*) as total,
    count(*) filter (where outcome = 'won') as ganhos,
    count(*) filter (where outcome = 'lost') as perdidos
  from leads
  group by chave
  order by total desc;
$function$;
