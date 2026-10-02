-- Cards do Comercial ("Consultas agendadas" e "Em atendimento") por etapa marcada pela equipe.
-- Antes a conta procurava só os nomes "Consulta Agendada" e "Atendimento/Acompanhamento", e
-- 11 de 15 clientes ficavam com 0 por usarem outros nomes. O nome sozinho engana ("Redequação
-- da agenda" e "Aguardado Agendamento" não são consultas agendadas), então quem decide é a equipe.
-- A regra por nome continua valendo; a marcação da equipe soma a ela.
create table if not exists public.crm_etapa_kpi (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  status_id text not null,
  kpi text not null check (kpi in ('consulta_agendada', 'em_atendimento')),
  origem text not null default 'equipe' check (origem in ('equipe', 'sugestao')),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id, status_id, kpi)
);
alter table public.crm_etapa_kpi enable row level security;
drop policy if exists "admin gerencia kpi de etapas" on public.crm_etapa_kpi;
create policy "admin gerencia kpi de etapas" on public.crm_etapa_kpi
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.crm_etapas_kpi_para_analise(p_client_id uuid)
returns table(connection_id uuid, provider text, pipeline_id text, pipeline_name text,
              status_id text, status_name text, total bigint,
              consulta_agendada boolean, em_atendimento boolean,
              padrao_consulta boolean, padrao_atendimento boolean,
              origem_consulta text, origem_atendimento text)
language sql stable security definer set search_path to 'public'
as $function$
  select cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id),
    (max(kc.kpi) is not null) or (cps.status_name ilike '%Consulta Agendada%'),
    (max(ka.kpi) is not null) or (cps.pipeline_name ilike '%Atendimento%' and cps.status_name ilike '%Acompanhamento%'),
    (cps.status_name ilike '%Consulta Agendada%'),
    (cps.pipeline_name ilike '%Atendimento%' and cps.status_name ilike '%Acompanhamento%'),
    max(kc.origem), max(ka.origem)
  from crm_connections cc
  join crm_pipeline_statuses cps on cps.crm_connection_id = cc.id
  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null
    and cl.pipeline_id = cps.pipeline_id and cl.status_id = cps.status_id
  left join crm_etapa_kpi kc on kc.crm_connection_id = cc.id and kc.pipeline_id = cps.pipeline_id
    and kc.status_id = cps.status_id and kc.kpi = 'consulta_agendada'
  left join crm_etapa_kpi ka on ka.crm_connection_id = cc.id and ka.pipeline_id = cps.pipeline_id
    and ka.status_id = cps.status_id and ka.kpi = 'em_atendimento'
  where cc.client_id = p_client_id and cc.active and public.is_app_admin()
  group by cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name
  order by cps.pipeline_name, cps.status_name;
$function$;

create or replace function public.crm_definir_etapa_kpi(
  p_connection uuid, p_pipeline text, p_status text, p_kpi text, p_ativo boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_kpi not in ('consulta_agendada', 'em_atendimento') then raise exception 'kpi invalido'; end if;
  if p_ativo then
    insert into crm_etapa_kpi (crm_connection_id, pipeline_id, status_id, kpi, origem)
    values (p_connection, p_pipeline, p_status, p_kpi, 'equipe')
    on conflict (crm_connection_id, pipeline_id, status_id, kpi)
    do update set origem = 'equipe', atualizado_em = now();
  else
    delete from crm_etapa_kpi
    where crm_connection_id = p_connection and pipeline_id = p_pipeline
      and status_id = p_status and kpi = p_kpi;
  end if;
end;
$function$;

-- Mesma função de antes, com a marcação da equipe somada à regra por nome.
create or replace function public.crm_metricas_essenciais(p_client_id uuid)
returns table(total_leads bigint, consultas_agendadas bigint, em_atendimento bigint,
              em_atendimento_valor numeric, novos_7d bigint, ganhos bigint,
              perdidos bigint, fonte_preenchida_pct numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select cl.id, cl.price, cl.outcome, cl.occurred_at, cl.source,
      cps.status_name, cps.pipeline_name,
      exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id
        and k.pipeline_id = cl.pipeline_id and k.status_id = cl.status_id
        and k.kpi = 'consulta_agendada') as marcada_consulta,
      exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id
        and k.pipeline_id = cl.pipeline_id and k.status_id = cl.status_id
        and k.kpi = 'em_atendimento') as marcada_atendimento
    from (select * from crm_leads where removido_na_origem is null) cl
    join crm_pipeline_statuses cps
      on cps.crm_connection_id = cl.crm_connection_id
      and cps.pipeline_id = cl.pipeline_id
      and cps.status_id = cl.status_id
    where cl.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select
    count(*) as total_leads,
    count(*) filter (where status_name ilike '%Consulta Agendada%' or marcada_consulta) as consultas_agendadas,
    count(*) filter (where (pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%') or marcada_atendimento) as em_atendimento,
    coalesce(sum(price) filter (where (pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%') or marcada_atendimento), 0) as em_atendimento_valor,
    count(*) filter (where occurred_at > now() - interval '7 days') as novos_7d,
    count(*) filter (where outcome = 'won') as ganhos,
    count(*) filter (where outcome = 'lost') as perdidos,
    round(100.0 * count(*) filter (where source is not null)::numeric / nullif(count(*), 0), 1) as fonte_preenchida_pct
  from base;
$function$;

revoke all on function public.crm_etapas_kpi_para_analise(uuid) from public, anon;
revoke all on function public.crm_definir_etapa_kpi(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.crm_etapas_kpi_para_analise(uuid) to authenticated;
grant execute on function public.crm_definir_etapa_kpi(uuid, text, text, text, boolean) to authenticated;
