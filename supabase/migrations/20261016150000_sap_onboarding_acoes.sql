-- SAP · Lote B da revisão do Drive.
-- 1) Checklist de Dados e Acessos (02.05): cada item A1–D10 confirmado com data e função, "não se aplica",
--    e data de revogação no encerramento (E2/E3). Nenhuma senha é guardada aqui.
-- 2) Ficha do Cliente mínima (02.06): decisor, ambição D90 (kickoff), coordenador, caminho de tecnologia,
--    classificação da fonte de dados da Meta (A6).
-- 3) Ação da semana e compromissos (08.05, 09.03, 11.04): o que foi combinado, com dono, prazo e resultado.

create table if not exists public.sap_acessos (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  item text not null check (item ~ '^[A-D][0-9]{1,2}$'),
  status text not null default 'pendente' check (status in ('pendente','confirmado','nao_se_aplica')),
  confirmado_em date,
  confirmado_por text,
  observacao text,
  revogado_em date,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, item)
);
alter table public.sap_acessos enable row level security;
create policy "sap ler acessos" on public.sap_acessos for select to authenticated using (public.sap_pode_ler(clinica_id));

alter table public.sap_clinicas add column if not exists decisor_nome text;
alter table public.sap_clinicas add column if not exists decisor_contato text;
alter table public.sap_clinicas add column if not exists ambicao_d90 text;
alter table public.sap_clinicas add column if not exists coordenador text;
alter table public.sap_clinicas add column if not exists caminho_tecnologia text check (caminho_tecnologia in ('A','B'));
alter table public.sap_clinicas add column if not exists categoria_fonte_meta text;

create table if not exists public.sap_acoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  semana date not null,
  origem text not null check (origem in ('leitura','call','saude','outro')),
  codigo text,
  texto text not null,
  lado text not null check (lado in ('clinica','dc')),
  responsavel text,
  prazo date,
  status text not null default 'aberta' check (status in ('aberta','feita','nao_feita')),
  resultado text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  removido_em timestamptz
);
create index if not exists sap_acoes_clinica on public.sap_acoes (clinica_id, semana);
alter table public.sap_acoes enable row level security;
create policy "sap ler acoes" on public.sap_acoes for select to authenticated using (public.sap_pode_ler(clinica_id));

create or replace function public.sap_salvar_acesso(p_clinica_id uuid, p_item text, p_status text, p_confirmado_em date, p_confirmado_por text, p_observacao text, p_revogado_em date)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_acessos (clinica_id, item, status, confirmado_em, confirmado_por, observacao, revogado_em, atualizado_por, atualizado_em)
  values (p_clinica_id, p_item, coalesce(p_status, 'pendente'), p_confirmado_em, nullif(btrim(p_confirmado_por), ''), nullif(btrim(p_observacao), ''), p_revogado_em, auth.uid(), now())
  on conflict (clinica_id, item) do update set status = excluded.status, confirmado_em = excluded.confirmado_em,
    confirmado_por = excluded.confirmado_por, observacao = excluded.observacao, revogado_em = excluded.revogado_em,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;

create or replace function public.sap_salvar_ficha(p_clinica_id uuid, p_decisor_nome text, p_decisor_contato text, p_ambicao text,
  p_coordenador text, p_caminho text, p_categoria_fonte text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  update sap_clinicas set decisor_nome = nullif(btrim(p_decisor_nome), ''), decisor_contato = nullif(btrim(p_decisor_contato), ''),
    ambicao_d90 = nullif(btrim(p_ambicao), ''), coordenador = nullif(btrim(p_coordenador), ''),
    caminho_tecnologia = nullif(p_caminho, ''), categoria_fonte_meta = nullif(btrim(p_categoria_fonte), ''), atualizado_em = now()
  where id = p_clinica_id;
end;
$function$;

create or replace function public.sap_salvar_acao(p_clinica_id uuid, p_id uuid, p_semana date, p_origem text, p_codigo text, p_texto text,
  p_lado text, p_responsavel text, p_prazo date, p_status text, p_resultado text, p_remover boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid := p_id;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_remover then
    update sap_acoes set removido_em = now() where id = p_id and clinica_id = p_clinica_id;
    return p_id;
  end if;
  if v_id is null then
    insert into sap_acoes (clinica_id, semana, origem, codigo, texto, lado, responsavel, prazo, status, resultado)
    values (p_clinica_id, p_semana, p_origem, nullif(p_codigo, ''), p_texto, p_lado, nullif(btrim(p_responsavel), ''), p_prazo, coalesce(p_status, 'aberta'), nullif(btrim(p_resultado), ''))
    returning id into v_id;
  else
    update sap_acoes set semana = p_semana, origem = p_origem, codigo = nullif(p_codigo, ''), texto = p_texto, lado = p_lado,
      responsavel = nullif(btrim(p_responsavel), ''), prazo = p_prazo, status = coalesce(p_status, status),
      resultado = nullif(btrim(p_resultado), ''), atualizado_em = now()
    where id = v_id and clinica_id = p_clinica_id;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.sap_salvar_acesso(uuid, text, text, date, text, text, date) from public, anon;
revoke all on function public.sap_salvar_ficha(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.sap_salvar_acao(uuid, uuid, date, text, text, text, text, text, date, text, text, boolean) from public, anon;
grant execute on function public.sap_salvar_acesso(uuid, text, text, date, text, text, date) to authenticated;
grant execute on function public.sap_salvar_ficha(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.sap_salvar_acao(uuid, uuid, date, text, text, text, text, text, date, text, text, boolean) to authenticated;
grant select on public.sap_acessos, public.sap_acoes to authenticated;
