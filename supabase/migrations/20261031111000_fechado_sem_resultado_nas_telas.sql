-- Card "fechado na origem, resultado não informado" (outcome 'closed', 20261030300000) nas telas do Comercial
-- (auditoria de 30/10/2026). Em aberto é só outcome 'open'; o fechado sem resultado aparece à parte.
-- 1. crm_definir_etapa_resultado: confirmar uma etapa (inclusive "confirmar em lote" em A analisar) fazia
--    "update crm_leads set outcome = p_outcome" em todos os cards da etapa e reabria os 242 cards 'closed' da
--    Dra. Marcella. Agora não toca em card 'closed'.
-- 2. crm_metricas_essenciais: "Em atendimento" contava cards ganhos, perdidos e fechados (Marcella: 31 de 105, e
--    R$ 40.750 de cards fechados no valor). Passa a contar só os abertos. Devolve também abertos, fechados e se alguma
--    etapa conta como consulta agendada (pelo nome ou marcada pela equipe), para a tela mostrar "sem dado" em vez de
--    "0" quando nenhuma etapa está marcada.
-- 3. crm_funil_por_campo: devolve os abertos de cada linha ("Em andamento" era total menos ganhos menos perdidos e
--    somava os fechados).
-- 4. crm_funil_por_campo e crm_funil_por_campo_periodo: sem o campo procurado no card, caíam na origem do card. A
--    tabela "Por tipo de procedimento" saía idêntica à de origem ("Material de isca" e "Paciente antigo" como
--    procedimento). A origem só entra quando o campo procurado é de origem ou fonte.
-- Reversão: em crm_definir_etapa_resultado tirar "and outcome is distinct from 'closed'"; recriar crm_metricas_essenciais
--   como em 20261002150000_crm_etapa_kpi.sql (drop function antes, a assinatura muda); recriar crm_funil_por_campo como
--   em 20260909160000 (drop antes) e reaplicar os trechos de 20260909220000 e 20261030230000; em
--   crm_funil_por_campo_periodo, trocar de volta o trecho da origem (novo -> antigo).

-- 1. Confirmar etapa não reabre card fechado na origem.
do $migra$
declare
  def text := pg_get_functiondef('public.crm_definir_etapa_resultado(uuid,text,text,text)'::regprocedure);
  a1 text := '    and outcome is distinct from p_outcome;';
  n1 text := '    and outcome is distinct from p_outcome
    and outcome is distinct from ''closed''; -- fechado na origem sem resultado: a etapa não diz se ganhou ou perdeu';
begin
  if position('is distinct from ''closed''' in def) > 0 then return; end if;
  if position(a1 in def) = 0 then raise exception 'crm_definir_etapa_resultado: trecho não encontrado; revisar a migration'; end if;
  execute replace(def, a1, n1);
end
$migra$;

-- 2. Métricas do Comercial: em atendimento só aberto; abertos, fechados e se há etapa de consulta agendada.
do $migra$
declare
  def text := pg_get_functiondef('public.crm_metricas_essenciais(uuid)'::regprocedure);
  r1 text := 'fonte_preenchida_pct numeric)';
  rn1 text := 'fonte_preenchida_pct numeric, abertos bigint, fechados bigint, consulta_configurada boolean)';
  a2 text := 'count(*) filter (where (pipeline_name ilike ''%Atendimento%'' and status_name ilike ''%Acompanhamento%'') or marcada_atendimento) as em_atendimento,';
  n2 text := 'count(*) filter (where coalesce(outcome, ''open'') = ''open'' and ((pipeline_name ilike ''%Atendimento%'' and status_name ilike ''%Acompanhamento%'') or marcada_atendimento)) as em_atendimento,';
  a3 text := 'coalesce(sum(price) filter (where (pipeline_name ilike ''%Atendimento%'' and status_name ilike ''%Acompanhamento%'') or marcada_atendimento), 0) as em_atendimento_valor,';
  n3 text := 'coalesce(sum(price) filter (where coalesce(outcome, ''open'') = ''open'' and ((pipeline_name ilike ''%Atendimento%'' and status_name ilike ''%Acompanhamento%'') or marcada_atendimento)), 0) as em_atendimento_valor,';
  a4 text := 'round(100.0 * count(*) filter (where source is not null)::numeric / nullif(count(*), 0), 1) as fonte_preenchida_pct';
  n4 text := 'round(100.0 * count(*) filter (where source is not null)::numeric / nullif(count(*), 0), 1) as fonte_preenchida_pct,
    count(*) filter (where coalesce(outcome, ''open'') = ''open'') as abertos,
    count(*) filter (where outcome = ''closed'') as fechados,
    -- Alguma etapa conta como consulta agendada (pelo nome ou marcada pela equipe)? Sem isso, o 0 não é fato.
    exists (
      select 1 from crm_connections cc
      join crm_pipeline_statuses s on s.crm_connection_id = cc.id
      where cc.client_id = p_client_id and cc.active
        and (s.status_name ilike ''%Consulta Agendada%''
             or exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cc.id and k.pipeline_id = s.pipeline_id
                          and k.status_id = s.status_id and k.kpi = ''consulta_agendada''))
    ) as consulta_configurada';
begin
  if position('consulta_configurada' in def) > 0 then return; end if;
  if position(r1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 or position(a4 in def) = 0 then
    raise exception 'crm_metricas_essenciais: trechos não encontrados; revisar a migration';
  end if;
  def := replace(replace(replace(replace(def, r1, rn1), a2, n2), a3, n3), a4, n4);
  -- A assinatura de retorno muda: precisa apagar antes de recriar.
  drop function public.crm_metricas_essenciais(uuid);
  execute def;
end
$migra$;
revoke all on function public.crm_metricas_essenciais(uuid) from public, anon;
grant execute on function public.crm_metricas_essenciais(uuid) to authenticated, service_role;

-- 3 e 4. Por campo: abertos na linha (só a versão da base inteira) e origem só quando o campo procurado é de origem.
do $migra$
declare
  def text := pg_get_functiondef('public.crm_funil_por_campo(uuid,text)'::regprocedure);
  a1 text := 'case when cl.provider <> ''kommo'' then cl.source else public.crm_origem_classifica(cl.source) end,';
  n1 text := 'case when p_field_name_pattern ~* ''(fonte|origem|source)'' then
          case when cl.provider <> ''kommo'' then cl.source else public.crm_origem_classifica(cl.source) end end,';
  r2 text := 'perdidos bigint)';
  rn2 text := 'perdidos bigint, abertos bigint)';
  a3 text := 'count(*) filter (where outcome = ''lost'') as perdidos';
  n3 text := 'count(*) filter (where outcome = ''lost'') as perdidos,
    count(*) filter (where coalesce(outcome, ''open'') = ''open'') as abertos';
begin
  if position('as abertos' in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(r2 in def) = 0 or position(a3 in def) = 0 then
    raise exception 'crm_funil_por_campo: trechos não encontrados; revisar a migration';
  end if;
  def := replace(replace(replace(def, a1, n1), r2, rn2), a3, n3);
  drop function public.crm_funil_por_campo(uuid, text);
  execute def;
end
$migra$;
revoke all on function public.crm_funil_por_campo(uuid, text) from public, anon;
grant execute on function public.crm_funil_por_campo(uuid, text) to authenticated, service_role;

do $migra$
declare
  def text := pg_get_functiondef('public.crm_funil_por_campo_periodo(uuid,text,date,date)'::regprocedure);
  a1 text := 'case when cl.provider <> ''kommo'' then cl.source else public.crm_origem_classifica(cl.source) end,';
  n1 text := 'case when p_field_name_pattern ~* ''(fonte|origem|source)'' then
          case when cl.provider <> ''kommo'' then cl.source else public.crm_origem_classifica(cl.source) end end,';
begin
  if position('p_field_name_pattern ~*' in def) > 0 then return; end if;
  if position(a1 in def) = 0 then raise exception 'crm_funil_por_campo_periodo: trecho não encontrado; revisar a migration'; end if;
  execute replace(def, a1, n1);
end
$migra$;
