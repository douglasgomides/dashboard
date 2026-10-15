-- SAP · Lote E: verba de mídia combinada (05.01/05.11, condição "verba em dia" da garantia) e registro semanal de
-- fidelização, reativação e indicação (08.02/08.03), que o CRM não mostra.
alter table public.sap_clinicas add column if not exists verba_mensal numeric check (verba_mensal is null or verba_mensal >= 0);

create table if not exists public.sap_fidelizacao_semana (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  semana date not null,
  retornos integer check (retornos >= 0),
  recompras integer check (recompras >= 0),
  contatados_reativacao integer check (contatados_reativacao >= 0),
  reativados_agendaram integer check (reativados_agendaram >= 0),
  indicacoes integer check (indicacoes >= 0),
  indicacoes_com_codigo integer check (indicacoes_com_codigo >= 0),
  avaliacoes_google integer check (avaliacoes_google >= 0),
  sair integer check (sair >= 0),
  contatados_regua integer check (contatados_regua >= 0),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, semana)
);
alter table public.sap_fidelizacao_semana enable row level security;
create policy "sap ler fidelizacao" on public.sap_fidelizacao_semana for select to authenticated using (public.sap_pode_ler(clinica_id));

create or replace function public.sap_salvar_verba(p_clinica_id uuid, p_verba_mensal numeric, p_verba_em_dia boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  update sap_clinicas set verba_mensal = p_verba_mensal, verba_em_dia = coalesce(p_verba_em_dia, verba_em_dia), atualizado_em = now() where id = p_clinica_id;
end;
$function$;

create or replace function public.sap_salvar_fidelizacao(p_clinica_id uuid, p_semana date, p_dados jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_fidelizacao_semana (clinica_id, semana, retornos, recompras, contatados_reativacao, reativados_agendaram, indicacoes,
    indicacoes_com_codigo, avaliacoes_google, sair, contatados_regua, atualizado_por, atualizado_em)
  values (p_clinica_id, p_semana, (p_dados->>'retornos')::int, (p_dados->>'recompras')::int, (p_dados->>'contatados_reativacao')::int,
    (p_dados->>'reativados_agendaram')::int, (p_dados->>'indicacoes')::int, (p_dados->>'indicacoes_com_codigo')::int,
    (p_dados->>'avaliacoes_google')::int, (p_dados->>'sair')::int, (p_dados->>'contatados_regua')::int, auth.uid(), now())
  on conflict (clinica_id, semana) do update set retornos = excluded.retornos, recompras = excluded.recompras,
    contatados_reativacao = excluded.contatados_reativacao, reativados_agendaram = excluded.reativados_agendaram,
    indicacoes = excluded.indicacoes, indicacoes_com_codigo = excluded.indicacoes_com_codigo, avaliacoes_google = excluded.avaliacoes_google,
    sair = excluded.sair, contatados_regua = excluded.contatados_regua, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;

revoke all on function public.sap_salvar_verba(uuid, numeric, boolean) from public, anon;
revoke all on function public.sap_salvar_fidelizacao(uuid, date, jsonb) from public, anon;
grant execute on function public.sap_salvar_verba(uuid, numeric, boolean) to authenticated;
grant execute on function public.sap_salvar_fidelizacao(uuid, date, jsonb) to authenticated;
grant select on public.sap_fidelizacao_semana to authenticated;
