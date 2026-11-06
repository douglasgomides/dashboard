-- Histórico diário dos números de Resultados (pacientes_periodo de um dia só), por clínica.
-- Base dos gráficos de linha, dos minigráficos nos cartões e, depois, de anomalias e alertas.
-- Aditiva: tabela e funções novas; não altera nada existente. Reversão:
--   select cron.unschedule('resultados-diarios');
--   drop function public.resultados_preencher(date, date); drop function public.resultados_gravar_dia(date);
--   drop table public.resultados_diarios;
-- Observação: a soma dos dias NÃO é o número do período. Quem chamou em dois dias conta uma vez no período e duas
-- na soma. O histórico serve para ver a forma da curva, não para substituir o número do cartão.
create table if not exists public.resultados_diarios (
  client_id uuid not null references public.clients(id) on delete cascade,
  dia date not null,
  mandaram_mensagem integer,
  leads_novos integer,
  antigos integer,
  agendaram integer,
  negociacao integer,
  compareceram integer,
  fecharam integer,
  gravado_em timestamptz not null default now(),
  primary key (client_id, dia)
);
comment on table public.resultados_diarios is 'Números de pacientes_periodo de um dia, por clínica. null = não medido naquele dia. Gravado por resultados_gravar_dia (cron diário).';
alter table public.resultados_diarios enable row level security;
revoke all on table public.resultados_diarios from public, anon;
grant select on table public.resultados_diarios to authenticated;
grant all on table public.resultados_diarios to service_role;
drop policy if exists "resultados diarios: admin ou membro le" on public.resultados_diarios;
create policy "resultados diarios: admin ou membro le" on public.resultados_diarios for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Grava um dia para todas as clínicas. pacientes_periodo confere quem chama (admin ou membro); dentro desta função,
-- que só o service_role e o cron executam, a chamada vai com a identidade do primeiro admin. Uma clínica com erro
-- não derruba as outras. Devolve quantas clínicas foram gravadas.
create or replace function public.resultados_gravar_dia(p_dia date)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare adm uuid; c record; r jsonb; n integer := 0;
begin
  select user_id into adm from public.app_admins limit 1;
  if adm is null then raise exception 'sem admin cadastrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  for c in select id from public.clients loop
    begin
      r := public.pacientes_periodo(c.id, p_dia, p_dia) -> 'numeros';
      insert into public.resultados_diarios as d (client_id, dia, mandaram_mensagem, leads_novos, antigos, agendaram, negociacao, compareceram, fecharam)
      values (c.id, p_dia,
        nullif(r -> 'mandaram_mensagem' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'leads_novos' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'antigos' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'agendaram' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'negociacao' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'compareceram' ->> 'valor', '')::numeric::integer,
        nullif(r -> 'fecharam' ->> 'valor', '')::numeric::integer)
      on conflict (client_id, dia) do update set
        mandaram_mensagem = excluded.mandaram_mensagem, leads_novos = excluded.leads_novos, antigos = excluded.antigos,
        agendaram = excluded.agendaram, negociacao = excluded.negociacao, compareceram = excluded.compareceram,
        fecharam = excluded.fecharam, gravado_em = now();
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end
$$;
revoke all on function public.resultados_gravar_dia(date) from public, anon, authenticated;
grant execute on function public.resultados_gravar_dia(date) to service_role;

-- Preenche o passado, um intervalo por vez (cada dia leva alguns segundos por clínica; use janelas de 5 a 7 dias).
create or replace function public.resultados_preencher(p_de date, p_ate date)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d date; total integer := 0;
begin
  if p_ate - p_de > 14 then raise exception 'use janelas de no máximo 14 dias'; end if;
  for d in select generate_series(p_de, p_ate, interval '1 day')::date loop
    total := total + public.resultados_gravar_dia(d);
  end loop;
  return total;
end
$$;
revoke all on function public.resultados_preencher(date, date) from public, anon, authenticated;
grant execute on function public.resultados_preencher(date, date) to service_role;

-- Todo dia às 06:30 UTC (03:30 em Brasília) grava o dia anterior.
select cron.unschedule(jobid) from cron.job where jobname = 'resultados-diarios';
select cron.schedule('resultados-diarios', '30 6 * * *', $$select public.resultados_gravar_dia((now() at time zone 'America/Sao_Paulo')::date - 1)$$);
