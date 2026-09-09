-- Sessão antiga pode apontar para departamento que a clínica já excluiu: a
-- API da WTS devolve só os departamentos vivos, então o join não acha o nome.
-- Na carga de 90 dias isso é 715 de 8.792 sessões (8%).
--
-- Eu estava contando "nome nulo" como "sem roteamento", o que juntava dois
-- casos opostos: conversa que ninguém encaminhou, e conversa que FOI
-- encaminhada para uma equipe que depois deixou de existir. O card dizia
-- 69,7% quando o número real é 61,5%.
--
-- Agora "sem roteamento" olha o department_id, não o nome. (Nesta base, zero
-- sessões estão de fato sem department_id — o balde real é o "Geral".)

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
         count(*) filter (where department_id is null or departamento = 'Geral'),
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
    select case
             when s.department_id is null then '(sem departamento)'
             when d.name is null then '(equipe excluída na WTS)'
             else d.name
           end as departamento,
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
