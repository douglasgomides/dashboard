-- SAP · Baseline D0, metas D90 e dados da garantia (03.07 e 01.02). Aditivo.
-- sap_kpi_plano: uma linha por KPI da clínica, com a baseline congelada no D0, a meta D90 assinada
-- e se o KPI conta para a garantia. As regras de proposta e de avaliação ficam em src/lib/sap-metas.ts.
-- sap_clinicas ganha: consulta_paga (sem consulta paga, a garantia usa agendamento no lugar da
-- conversão), verba_em_dia (amostra mínima não atingida com verba reduzida = "não avaliável"),
-- score_execucao (0–100, até o Lote 4 calcular sozinho) e baseline_de/baseline_ate (janela medida).

alter table public.sap_clinicas add column if not exists consulta_paga boolean not null default true;
alter table public.sap_clinicas add column if not exists verba_em_dia boolean not null default true;
alter table public.sap_clinicas add column if not exists score_execucao numeric;
alter table public.sap_clinicas add column if not exists baseline_de date;
alter table public.sap_clinicas add column if not exists baseline_ate date;

create table if not exists public.sap_kpi_plano (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  kpi text not null check (kpi in ('resposta','agendamento','comparecimento','conversao','custo_consulta','pensando_cadencia','receita_mensal')),
  baseline numeric,
  origem text check (origem in ('medido','estimado')),
  amostra integer,
  meta numeric,
  conta_garantia boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, kpi)
);
alter table public.sap_kpi_plano enable row level security;
create policy "sap ler plano" on public.sap_kpi_plano
  for select to authenticated using (public.sap_pode_ler(clinica_id));

-- Grava o plano (baseline, metas, garantia) e as condições da clínica. Só admin.
-- p_kpis: [{kpi, baseline, origem, amostra, meta, conta_garantia}]
create or replace function public.sap_salvar_plano(
  p_client_id uuid, p_kpis jsonb, p_consulta_paga boolean, p_verba_em_dia boolean,
  p_score_execucao numeric, p_baseline_de date, p_baseline_ate date)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; r jsonb;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select id into v_id from sap_clinicas where client_id = p_client_id order by created_at desc limit 1;
  if v_id is null then raise exception 'ative o SAP para este cliente antes'; end if;
  update sap_clinicas set
    consulta_paga = coalesce(p_consulta_paga, consulta_paga),
    verba_em_dia = coalesce(p_verba_em_dia, verba_em_dia),
    score_execucao = p_score_execucao,
    baseline_de = coalesce(p_baseline_de, baseline_de),
    baseline_ate = coalesce(p_baseline_ate, baseline_ate),
    atualizado_em = now()
  where id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p_kpis, '[]'::jsonb)) loop
    insert into sap_kpi_plano (clinica_id, kpi, baseline, origem, amostra, meta, conta_garantia)
    values (v_id, r->>'kpi', nullif(r->>'baseline', '')::numeric, nullif(r->>'origem', ''),
            nullif(r->>'amostra', '')::integer, nullif(r->>'meta', '')::numeric, coalesce((r->>'conta_garantia')::boolean, false))
    on conflict (clinica_id, kpi) do update set
      baseline = excluded.baseline, origem = excluded.origem, amostra = excluded.amostra,
      meta = excluded.meta, conta_garantia = excluded.conta_garantia, atualizado_em = now();
  end loop;
end;
$function$;
revoke all on function public.sap_salvar_plano(uuid, jsonb, boolean, boolean, numeric, date, date) from public, anon;
grant execute on function public.sap_salvar_plano(uuid, jsonb, boolean, boolean, numeric, date, date) to authenticated;
