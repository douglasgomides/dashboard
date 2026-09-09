-- Mediana, não média, em todo tempo de espera e de atendimento.
-- Uma conversa que alguém esqueceu aberta por 20 horas destrói a média e
-- não representa nada; a mediana descreve o atendimento típico.
--
-- Toda função devolve também a cobertura (quantas sessões tinham o campo
-- preenchido), porque tempo de espera só existe em ~62% das sessões e tempo
-- de atendimento em ~50%. Sem isso a tela mostraria uma mediana firme calculada
-- sobre metade do dado, sem avisar.

drop function if exists public.wts_resumo(uuid, date, date);
create function public.wts_resumo(p_client_id uuid, p_start date, p_end date)
returns table(
  atendimentos bigint,
  concluidos bigint,
  em_andamento bigint,
  espera_mediana_seg numeric,
  espera_cobertura bigint,
  atendimento_mediano_seg numeric,
  atendimento_cobertura bigint,
  sem_roteamento bigint,
  contatos_distintos bigint
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select s.*, d.name as departamento
    from wts_sessions s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= p_start::timestamptz
      and s.started_at < (p_end + 1)::timestamptz
  )
  select count(*),
         count(*) filter (where status = 'COMPLETED'),
         count(*) filter (where status = 'IN_PROGRESS'),
         round((percentile_cont(0.5) within group (order by wait_seconds))::numeric, 0),
         count(wait_seconds),
         round((percentile_cont(0.5) within group (order by service_seconds))::numeric, 0),
         count(service_seconds),
         -- "Geral" é o balde de quem não foi roteado para nenhuma equipe.
         -- É o número que a clínica precisa ver caindo.
         count(*) filter (where departamento is null or departamento = 'Geral'),
         count(distinct contact_id)
  from base;
$$;

drop function if exists public.wts_por_departamento(uuid, date, date);
create function public.wts_por_departamento(p_client_id uuid, p_start date, p_end date)
returns table(
  departamento text,
  atendimentos bigint,
  fatia numeric,
  espera_mediana_seg numeric,
  atendimento_mediano_seg numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select coalesce(d.name, '(sem departamento)') as departamento,
           s.wait_seconds, s.service_seconds
    from wts_sessions s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= p_start::timestamptz
      and s.started_at < (p_end + 1)::timestamptz
  ), total as (select count(*)::numeric as n from base)
  select b.departamento,
         count(*),
         case when t.n > 0 then round(count(*) / t.n * 100, 1) end,
         round((percentile_cont(0.5) within group (order by b.wait_seconds))::numeric, 0),
         round((percentile_cont(0.5) within group (order by b.service_seconds))::numeric, 0)
  from base b, total t
  group by b.departamento, t.n
  order by count(*) desc;
$$;

drop function if exists public.wts_por_agente(uuid, date, date);
create function public.wts_por_agente(p_client_id uuid, p_start date, p_end date)
returns table(
  agente text,
  atendimentos bigint,
  espera_mediana_seg numeric,
  atendimento_mediano_seg numeric,
  concluidos bigint
)
language sql stable security definer set search_path to 'public'
as $$
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
    and s.started_at >= p_start::timestamptz
    and s.started_at < (p_end + 1)::timestamptz
    and s.user_id is not null
  group by a.name
  order by count(*) desc;
$$;

drop function if exists public.wts_volume_diario(uuid, date, date);
create function public.wts_volume_diario(p_client_id uuid, p_start date, p_end date)
returns table(dia date, atendimentos bigint, espera_mediana_seg numeric)
language sql stable security definer set search_path to 'public'
as $$
  select (s.started_at at time zone 'America/Sao_Paulo')::date as dia,
         count(*),
         round((percentile_cont(0.5) within group (order by s.wait_seconds))::numeric, 0)
  from wts_sessions s
  where s.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and s.started_at >= p_start::timestamptz
    and s.started_at < (p_end + 1)::timestamptz
  group by 1
  order by 1;
$$;
