-- Log por rota: uma linha por abertura de tela do Nexo. Grava a rota PADRÃO do router (ex.: /_authenticated/$clientId/),
-- nunca a URL aberta: sem query string, sem hash, sem id de paciente. Serve para decidir, com dado, que telas ficam,
-- fundem ou saem (Phase 3) e para medir uso (Phase 14).
-- Aditiva: tabela, índices, policies, função e gatilho novos; não altera nada existente. Entregue em arquivo: quem aplica é o João,
-- o agente nunca aplica. Todo comando é idempotente (pode rodar duas vezes: à mão e depois pelo aplicar.sh).
-- Os planos 02-02 (limpeza de 180 dias) e 02-03 (resumo por rota) acrescentam blocos neste mesmo arquivo.
-- Reversão:
--   select cron.unschedule('rota-acessos-limpeza');                      -- só onde existe pg_cron
--   drop function if exists public.rota_acessos_limpar();
--   drop function if exists public.rota_acessos_resumo(integer, boolean, boolean);
--   drop table if exists public.rota_acessos;
--   drop function if exists public.rota_acessos_preencher();

create table if not exists public.rota_acessos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  -- on delete set null: apagar a clínica não encolhe o histórico de uso.
  client_id uuid references public.clients(id) on delete set null,
  -- rota padrão do router; o CHECK recusa query string, hash, URL e UUID.
  rota text not null check (rota like '/%' and rota !~ '[?#]' and rota !~* '[0-9a-f]{8}-[0-9a-f]{4}-' and length(rota) between 1 and 200),
  origem text not null check (origem in ('menu', 'busca', 'link', 'direto', 'redirecionamento', 'bloqueada')),
  -- papel de quem abriu na clínica da linha; nulo em rota sem clínica. Preenchido pelo gatilho.
  papel text check (papel is null or papel in ('admin', 'owner', 'strategist', 'viewer')),
  -- verdadeiro quando quem abriu é admin do app (equipe). Preenchido pelo gatilho.
  eh_equipe boolean not null default false,
  sessao text not null check (length(sessao) between 8 and 64 and sessao ~ '^[A-Za-z0-9-]+$')
);
comment on table public.rota_acessos is 'Uma linha por abertura de tela (rota padrão do router, nunca a URL). user_id, eh_equipe e papel são forçados pelo gatilho rota_acessos_preencher. Retenção de 180 dias.';

-- A leitura por período (plano 02-03) precisa caber no statement_timeout.
create index if not exists rota_acessos_criado_em_idx on public.rota_acessos (criado_em);
create index if not exists rota_acessos_rota_criado_em_idx on public.rota_acessos (rota, criado_em);
create index if not exists rota_acessos_client_criado_em_idx on public.rota_acessos (client_id, criado_em);

alter table public.rota_acessos enable row level security;
revoke all on table public.rota_acessos from public, anon, authenticated;
-- Só select e insert: a linha de base de uso não pode ser reescrita por quem está sendo medido (sem update, delete, truncate).
grant select, insert on table public.rota_acessos to authenticated;
grant all on table public.rota_acessos to service_role;

drop policy if exists "rota_acessos: insere o proprio" on public.rota_acessos;
create policy "rota_acessos: insere o proprio" on public.rota_acessos for insert to authenticated
  with check (user_id = (select auth.uid()) and (client_id is null or public.is_app_admin() or public.is_client_member(client_id)));
drop policy if exists "rota_acessos: so admin le" on public.rota_acessos;
create policy "rota_acessos: so admin le" on public.rota_acessos for select to authenticated
  using (public.is_app_admin());

-- Quem abriu nunca escolhe user_id, eh_equipe nem papel: o gatilho deriva os três no insert.
-- coalesce(auth.uid(), new.user_id): usuário logado nunca escolhe o user_id; service_role (sem auth.uid) pode semear linhas.
create or replace function public.rota_acessos_preencher()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.eh_equipe := public.is_app_admin();
  if new.eh_equipe then
    new.papel := 'admin';
  elsif new.client_id is null then
    new.papel := null;
  else
    new.papel := (select m.role from public.client_members m where m.client_id = new.client_id and m.user_id = new.user_id);
  end if;
  return new;
end
$$;
revoke all on function public.rota_acessos_preencher() from public, anon, authenticated;

drop trigger if exists rota_acessos_preencher on public.rota_acessos;
create trigger rota_acessos_preencher before insert on public.rota_acessos
  for each row execute function public.rota_acessos_preencher();

-- Retenção (D-05): linhas com mais de 180 dias saem sozinhas, uma vez por dia. user_id é dado pessoal e não fica guardado
-- para sempre. Só service_role executa (o cron roda como dono); nenhum usuário logado consegue disparar a limpeza.
create or replace function public.rota_acessos_limpar()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  apagadas integer;
begin
  delete from public.rota_acessos where criado_em < now() - interval '180 days';
  get diagnostics apagadas = row_count;
  return apagadas;
end
$$;
revoke all on function public.rota_acessos_limpar() from public, anon, authenticated;
grant execute on function public.rota_acessos_limpar() to service_role;

-- O agendamento só existe onde há pg_cron (produção). No teste local a extensão não existe e o passo é pulado.
-- 06:40 UTC (03:40 em São Paulo), depois do resultados-diarios das 06:30 (CD-10).
-- Atenção: o exception engole qualquer falha aqui, inclusive em produção. Depois de aplicar, conferir com
-- select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'rota-acessos-limpeza';
    perform cron.schedule('rota-acessos-limpeza', '40 6 * * *', 'select public.rota_acessos_limpar()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;

-- Leitura agregada (plano 02-03): aberturas por tela e origem, para a aba Uso das telas de /admin/conferencia.
-- security invoker: a policy "rota_acessos: so admin le" decide quem recebe linhas; quem não é admin recebe zero. Sem exceção aqui.
-- Nunca devolve user_id, e-mail ou nome: só contagens e a data da última abertura.
-- Período limitado a 1..90 dias (CD-09; nulo vale 7). Equipe e clínica nunca se misturam (D-08).
-- Clínicas de teste ficam fora por padrão (D-09); linha sem clínica (ex.: /sem-acesso) entra.
create or replace function public.rota_acessos_resumo(p_dias integer, p_equipe boolean, p_incluir_teste boolean default false)
returns table (rota text, aberturas integer, pessoas integer, ultima timestamptz, menu integer, busca integer, link integer, direto integer, redirecionamento integer, bloqueada integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    a.rota,
    count(*)::integer as aberturas,
    count(distinct a.user_id)::integer as pessoas,
    max(a.criado_em) as ultima,
    (count(*) filter (where a.origem = 'menu'))::integer as menu,
    (count(*) filter (where a.origem = 'busca'))::integer as busca,
    (count(*) filter (where a.origem = 'link'))::integer as link,
    (count(*) filter (where a.origem = 'direto'))::integer as direto,
    (count(*) filter (where a.origem = 'redirecionamento'))::integer as redirecionamento,
    (count(*) filter (where a.origem = 'bloqueada'))::integer as bloqueada
  from public.rota_acessos a
  left join public.clients c on c.id = a.client_id
  where a.criado_em >= now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 90))
    and a.eh_equipe = coalesce(p_equipe, false)
    and (coalesce(p_incluir_teste, false) or c.eh_teste is not true)
  group by a.rota
  order by count(*) desc, a.rota
$$;
revoke all on function public.rota_acessos_resumo(integer, boolean, boolean) from public, anon;
grant execute on function public.rota_acessos_resumo(integer, boolean, boolean) to authenticated;
