-- SAP · Score de Execução (20 itens) e Score de Saúde semanal (11.04). Aditivo.
-- O catálogo dos itens (fase, prazo, peso) e as fórmulas ficam em src/lib/sap-scores.ts; aqui só o registro.
-- sap_salvar_execucao recalcula sap_clinicas.score_execucao (% do D90, pendente = 0, sem evidência = 0),
-- que é o número usado pela garantia (01.02, condição A).

create table if not exists public.sap_execucao_item (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  item integer not null check (item between 1 and 50),
  peso numeric not null default 1,
  status text not null default 'Pendente' check (status in ('Cumprido','Parcial','Não cumprido','Pendente','Não se aplica')),
  data_cumpriu date,
  evidencia text,
  observacao text,
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, item)
);
alter table public.sap_execucao_item enable row level security;
create policy "sap ler execucao" on public.sap_execucao_item
  for select to authenticated using (public.sap_pode_ler(clinica_id));

create table if not exists public.sap_saude_semana (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  semana integer not null check (semana between 1 and 60),
  tarefas_no_prazo numeric check (tarefas_no_prazo between 0 and 1),
  sessoes_marcadas integer,
  sessoes_com_decisor integer,
  call_grupo text check (call_grupo in ('Sim','Não','Sem call')),
  decisor_respondeu text check (decisor_respondeu in ('Sim','Parcial','Não')),
  tempo_resposta_h numeric,
  kpis_verde integer,
  kpis_vermelho integer,
  sentimento text check (sentimento in ('Verde','Amarelo','Vermelho')),
  o_que_aconteceu text,
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, semana)
);
alter table public.sap_saude_semana enable row level security;
create policy "sap ler saude" on public.sap_saude_semana
  for select to authenticated using (public.sap_pode_ler(clinica_id));

-- p_itens: [{item, peso, status, data_cumpriu, evidencia, observacao}] (todos os itens do catálogo).
create or replace function public.sap_salvar_execucao(p_client_id uuid, p_itens jsonb)
returns numeric
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; r jsonb; v_score numeric;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select id into v_id from sap_clinicas where client_id = p_client_id order by created_at desc limit 1;
  if v_id is null then raise exception 'ative o SAP para este cliente antes'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into sap_execucao_item (clinica_id, item, peso, status, data_cumpriu, evidencia, observacao)
    values (v_id, (r->>'item')::int, coalesce((r->>'peso')::numeric, 1), coalesce(nullif(r->>'status', ''), 'Pendente'),
            nullif(r->>'data_cumpriu', '')::date, nullif(btrim(r->>'evidencia'), ''), nullif(btrim(r->>'observacao'), ''))
    on conflict (clinica_id, item) do update set
      peso = excluded.peso, status = excluded.status, data_cumpriu = excluded.data_cumpriu,
      evidencia = excluded.evidencia, observacao = excluded.observacao, atualizado_em = now();
  end loop;
  select round(100 * sum(peso * case
      when status = 'Cumprido' and evidencia is not null then 1
      when status = 'Parcial' and evidencia is not null then 0.5
      else 0 end) / nullif(sum(peso), 0), 1)
    into v_score
  from sap_execucao_item where clinica_id = v_id and status <> 'Não se aplica';
  update sap_clinicas set score_execucao = v_score, atualizado_em = now() where id = v_id;
  return v_score;
end;
$function$;
revoke all on function public.sap_salvar_execucao(uuid, jsonb) from public, anon;
grant execute on function public.sap_salvar_execucao(uuid, jsonb) to authenticated;

-- Grava uma semana do Score de Saúde (p_semana: campos de sap_saude_semana). Só admin.
create or replace function public.sap_salvar_saude(p_client_id uuid, p_semana jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select id into v_id from sap_clinicas where client_id = p_client_id order by created_at desc limit 1;
  if v_id is null then raise exception 'ative o SAP para este cliente antes'; end if;
  insert into sap_saude_semana (clinica_id, semana, tarefas_no_prazo, sessoes_marcadas, sessoes_com_decisor, call_grupo,
    decisor_respondeu, tempo_resposta_h, kpis_verde, kpis_vermelho, sentimento, o_que_aconteceu)
  values (v_id, (p_semana->>'semana')::int, nullif(p_semana->>'tarefas_no_prazo', '')::numeric,
    nullif(p_semana->>'sessoes_marcadas', '')::int, nullif(p_semana->>'sessoes_com_decisor', '')::int,
    nullif(p_semana->>'call_grupo', ''), nullif(p_semana->>'decisor_respondeu', ''),
    nullif(p_semana->>'tempo_resposta_h', '')::numeric, nullif(p_semana->>'kpis_verde', '')::int,
    nullif(p_semana->>'kpis_vermelho', '')::int, nullif(p_semana->>'sentimento', ''), nullif(btrim(p_semana->>'o_que_aconteceu'), ''))
  on conflict (clinica_id, semana) do update set
    tarefas_no_prazo = excluded.tarefas_no_prazo, sessoes_marcadas = excluded.sessoes_marcadas,
    sessoes_com_decisor = excluded.sessoes_com_decisor, call_grupo = excluded.call_grupo,
    decisor_respondeu = excluded.decisor_respondeu, tempo_resposta_h = excluded.tempo_resposta_h,
    kpis_verde = excluded.kpis_verde, kpis_vermelho = excluded.kpis_vermelho, sentimento = excluded.sentimento,
    o_que_aconteceu = excluded.o_que_aconteceu, atualizado_em = now();
end;
$function$;
revoke all on function public.sap_salvar_saude(uuid, jsonb) from public, anon;
grant execute on function public.sap_salvar_saude(uuid, jsonb) to authenticated;
