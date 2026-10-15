-- SAP · Lote A da revisão do Drive.
-- 1) Pausa de prazo (01.02 §5): atraso do cliente acima de 5 dias úteis acumulados pausa o prazo; pausa a pedido
--    da clínica uma vez, até 15 dias corridos; máximo 30 dias. A pausa empurra os marcos seguintes e o D90 (00.02).
-- 2) Atrasos do cliente (o que conta como atraso, 01.02 §5), para somar os dias úteis.
-- 3) Marcos do cronograma 00.02 marcados como concluídos, com evidência.
-- 4) Aceite das metas (03.07) e situação da garantia (01.02 §1.5: D91–D120, uma vez por contrato) e pós-contrato.
-- 5) Score de Saúde só para a equipe (11.04).
-- Nada é apagado: remover = marcar removido_em.

create table if not exists public.sap_pausas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  tipo text not null check (tipo in ('atraso_cliente','pedido_clinica')),
  inicio date not null,
  fim date,
  motivo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  check (fim is null or fim >= inicio)
);
create index if not exists sap_pausas_clinica on public.sap_pausas (clinica_id);
alter table public.sap_pausas enable row level security;
create policy "sap ler pausas" on public.sap_pausas for select to authenticated using (public.sap_pode_ler(clinica_id));

create table if not exists public.sap_atrasos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  data date not null,
  dias_uteis integer not null check (dias_uteis between 1 and 60),
  categoria text not null check (categoria in ('acessos','sessao','aprovacao','treino','gravacao','verba','outro')),
  descricao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  removido_em timestamptz
);
create index if not exists sap_atrasos_clinica on public.sap_atrasos (clinica_id);
alter table public.sap_atrasos enable row level security;
create policy "sap ler atrasos" on public.sap_atrasos for select to authenticated using (public.is_app_admin());

create table if not exists public.sap_marco_status (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  marco integer not null check (marco between 1 and 35),
  concluido_em date,
  evidencia text,
  observacao text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, marco)
);
alter table public.sap_marco_status enable row level security;
create policy "sap ler marcos" on public.sap_marco_status for select to authenticated using (public.sap_pode_ler(clinica_id));

alter table public.sap_clinicas add column if not exists aceite_metas_em date;
alter table public.sap_clinicas add column if not exists aceite_metas_por text;
alter table public.sap_clinicas add column if not exists ajustes_acordados text;
alter table public.sap_clinicas add column if not exists garantia_status text
  check (garantia_status in ('nao_avaliada','aplicada','nao_se_aplica'));
alter table public.sap_clinicas add column if not exists garantia_inicio date;
alter table public.sap_clinicas add column if not exists pos_contrato text
  check (pos_contrato in ('manutencao','encerrado','cancelado'));

-- Score de Saúde: só a equipe (11.04: "só a equipe vê").
alter policy "sap ler saude" on public.sap_saude_semana using (public.is_app_admin());

create or replace function public.sap_salvar_pausa(p_clinica_id uuid, p_id uuid, p_tipo text, p_inicio date, p_fim date, p_motivo text, p_remover boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid := p_id;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_remover then
    update sap_pausas set removido_em = now() where id = p_id and clinica_id = p_clinica_id;
    return p_id;
  end if;
  if p_tipo not in ('atraso_cliente','pedido_clinica') then raise exception 'tipo invalido'; end if;
  if v_id is null then
    insert into sap_pausas (clinica_id, tipo, inicio, fim, motivo) values (p_clinica_id, p_tipo, p_inicio, p_fim, p_motivo) returning id into v_id;
  else
    update sap_pausas set tipo = p_tipo, inicio = p_inicio, fim = p_fim, motivo = p_motivo where id = v_id and clinica_id = p_clinica_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.sap_salvar_atraso(p_clinica_id uuid, p_id uuid, p_data date, p_dias integer, p_categoria text, p_descricao text, p_remover boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid := p_id;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_remover then
    update sap_atrasos set removido_em = now() where id = p_id and clinica_id = p_clinica_id;
    return p_id;
  end if;
  if v_id is null then
    insert into sap_atrasos (clinica_id, data, dias_uteis, categoria, descricao) values (p_clinica_id, p_data, p_dias, p_categoria, p_descricao) returning id into v_id;
  else
    update sap_atrasos set data = p_data, dias_uteis = p_dias, categoria = p_categoria, descricao = p_descricao where id = v_id and clinica_id = p_clinica_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.sap_marcar_marco(p_clinica_id uuid, p_marco integer, p_concluido_em date, p_evidencia text, p_observacao text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_marco_status (clinica_id, marco, concluido_em, evidencia, observacao, atualizado_por, atualizado_em)
  values (p_clinica_id, p_marco, p_concluido_em, nullif(btrim(p_evidencia), ''), nullif(btrim(p_observacao), ''), auth.uid(), now())
  on conflict (clinica_id, marco) do update set concluido_em = excluded.concluido_em, evidencia = excluded.evidencia,
    observacao = excluded.observacao, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;

create or replace function public.sap_salvar_contrato(p_clinica_id uuid, p_aceite_em date, p_aceite_por text, p_ajustes text,
  p_garantia_status text, p_garantia_inicio date, p_pos_contrato text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  update sap_clinicas set aceite_metas_em = p_aceite_em, aceite_metas_por = nullif(btrim(p_aceite_por), ''),
    ajustes_acordados = nullif(btrim(p_ajustes), ''), garantia_status = p_garantia_status, garantia_inicio = p_garantia_inicio,
    pos_contrato = p_pos_contrato, atualizado_em = now()
  where id = p_clinica_id;
end;
$function$;

revoke all on function public.sap_salvar_pausa(uuid, uuid, text, date, date, text, boolean) from public, anon;
revoke all on function public.sap_salvar_atraso(uuid, uuid, date, integer, text, text, boolean) from public, anon;
revoke all on function public.sap_marcar_marco(uuid, integer, date, text, text) from public, anon;
revoke all on function public.sap_salvar_contrato(uuid, date, text, text, text, date, text) from public, anon;
grant execute on function public.sap_salvar_pausa(uuid, uuid, text, date, date, text, boolean) to authenticated;
grant execute on function public.sap_salvar_atraso(uuid, uuid, date, integer, text, text, boolean) to authenticated;
grant execute on function public.sap_marcar_marco(uuid, integer, date, text, text) to authenticated;
grant execute on function public.sap_salvar_contrato(uuid, date, text, text, text, date, text) to authenticated;
grant select on public.sap_pausas, public.sap_atrasos, public.sap_marco_status to authenticated;
