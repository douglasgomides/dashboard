-- Conferência de velocidade da migração 20261114110000 (contagem por clínica e comparecimento). SOMENTE LEITURA:
-- roda numa transação read only (qualquer escrita aborta). Fase 03.1.1.1.1.1, plano 08, D-07.
--
-- Quando rodar (João, SQL editor de produção):
--   A) ANTES de aplicar a migração: seções 0, 1 e 2. Guardar a saída.
--   B) Logo depois de aplicar: seção 0 (todas "aplicada = true") e a seção 2 (leads_da_clinica).
--   C) 24 h depois: seções 1 e 3. Mandar as duas saídas da seção 1 (antes e 24 h depois).
--   D) Depois do preenchimento do histórico (20261113-preencher-historico-diario.sql): seção 4.
-- No SQL editor do Supabase, uma consulta por vez (ele mostra só o resultado da última). Cada consulta roda sozinha;
-- no psql, o arquivo inteiro roda numa transação read only.
--
-- Como comparar a seção 1: pg_stat_statements soma desde o último reset (não zeramos: pg_stat_statements_reset() é
-- escrita). Média depois = (total_ms_24h - total_ms_antes) / (chamadas_24h - chamadas_antes), por linha. Se
-- stats_reset mudou entre as duas leituras, a média de 24 h é a própria media_ms. Reverter
-- (supabase/operacoes/20261114-reverter-contagem-por-clinica.sql) se alguma média ficar acima de 1,5x a de antes.
--
-- Nunca: chamar as funções de tela aqui (elas conferem admin pelo JWT, e pacientes_periodo grava o resultado pronto),
-- trocar papel ou claim, EXPLAIN ANALYZE (executaria). Saída: só nomes de função, client_id, contagens e tempos.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

-- ================================================================ 0. a migração está aplicada? (marca e md5 por função)
-- Antes: aplicada = false nas 14. Depois: true nas 14. O md5 serve para conferir a reversão (volta ao valor de antes).
select '0-funcoes' as secao, f.fn,
       to_regprocedure(f.fn) is not null as existe,
       coalesce(position('[contagem-por-clinica]' in pg_get_functiondef(to_regprocedure(f.fn))) > 0, false) as aplicada,
       md5(pg_get_functiondef(to_regprocedure(f.fn))) as md5
  from (values ('public.pacientes_periodo_calc(uuid,date,date)'), ('public.pacientes_cards(uuid)'),
               ('public.crm_vendas_periodo(uuid,date,date)'), ('public.crm_perfil_para_analise(uuid)'),
               ('public.relacionamento_pessoas(uuid,uuid[])'), ('public.jornada_resumo(uuid)'),
               ('public.crm_base_viva(uuid)'), ('public.qualidade_leads_campanha(uuid,date,date)'),
               ('public.sap_sinais_auto(uuid,date,date)'), ('public.sap_etapas_para_marcar(uuid)'),
               ('public.crm_guia_dados(uuid)'), ('public.crm_etapas_para_analise(uuid)'),
               ('public.crm_etapas_kpi_para_analise(uuid)'), ('public.plano_ticket(uuid)')) f(fn)
 order by f.fn;

-- ================================================================ 1. tempos por função (pg_stat_statements)
-- Uma linha por função chamada pelas telas (o nome aparece no texto da chamada). pacientes_periodo inclui as leituras
-- do resultado pronto (rápidas); pacientes_periodo_calc aparece pelo aquecimento e pelo histórico (resultados_gravar_dia).
select '1-tempos' as secao, f.nome,
       coalesce(sum(s.calls), 0) as chamadas,
       round(coalesce(sum(s.total_exec_time), 0)::numeric, 0) as total_ms,
       round((sum(s.total_exec_time) / nullif(sum(s.calls), 0))::numeric, 1) as media_ms,
       round(max(s.max_exec_time)::numeric, 0) as max_ms
  from (values ('pacientes_periodo', null), ('pacientes_periodo_calc', null), ('resultados_gravar_dia', null),
               ('resultado_pronto_aquecer', null), ('pacientes_vendas_janela', null), ('pacientes_cards', null),
               ('crm_vendas_periodo', null), ('crm_perfil_para_analise', null), ('relacionamento_pessoas', null),
               ('jornada_resumo', 'p_de'), ('crm_base_viva', null), ('qualidade_leads_campanha', null),
               ('sap_sinais_auto', null), ('sap_etapas_para_marcar', null), ('crm_guia_dados', null),
               ('crm_etapas_para_analise', null), ('crm_etapas_kpi_para_analise', null), ('plano_ticket', null)) f(nome, sem)
  left join extensions.pg_stat_statements s
    on s.query ~* ('\m' || f.nome || '\M') and (f.sem is null or s.query !~* f.sem)
 group by f.nome
 order by f.nome;

-- Desde quando o pg_stat_statements soma (se mudar entre as duas leituras, houve reset no meio).
select '1-desde' as secao, stats_reset from extensions.pg_stat_statements_info;

-- ================================================================ 2. clínicas da conta compartilhada (só client_id e contagens)
-- leads_conta = o que os leitores contavam antes (a conta inteira); leads_da_clinica = o recorte da clínica, que eles
-- contam depois. Depois de aplicar: o "leads_total" de Jornada de cada uma dessas clínicas = leads_da_clinica.
select '2-clinicas-com-filtro' as secao, f.client_id,
       count(distinct f.crm_connection_id) as conexoes_com_filtro,
       (select count(*) from public.crm_leads l where l.client_id = f.client_id and l.removido_na_origem is null) as leads_conta,
       (select count(*) from public.crm_leads_do_cliente(f.client_id) l where l.removido_na_origem is null) as leads_da_clinica
  from public.crm_filtro_cliente f
 where f.crm_connection_id is not null
 group by f.client_id
 order by f.client_id;

-- As três maiores clínicas sem filtro (para o EXPLAIN da seção 3): para elas o resultado não muda.
select '2-maiores-sem-filtro' as secao, l.client_id, count(*) as leads
  from public.crm_leads l
 where l.removido_na_origem is null
   and not exists (select 1 from public.crm_filtro_cliente f where f.client_id = l.client_id)
 group by l.client_id
 order by count(*) desc
 limit 3;

-- ================================================================ 3. planos (EXPLAIN sem ANALYZE: não executa)
-- Trocar :'cliente_com_filtro' e :'cliente_sem_filtro' por um client_id da seção 2 (no psql, \set funciona).
-- Esperado: o recorte usa o índice de crm_leads por client_id; a trava de um dia usa o índice (client_id, ocorreu_em).
explain select count(*) from public.crm_leads_do_cliente(:'cliente_com_filtro'::uuid) l where l.removido_na_origem is null;

explain select count(*) from public.crm_leads_do_cliente(:'cliente_sem_filtro'::uuid) l where l.removido_na_origem is null;

-- A trava de um dia (o exists novo de pacientes_periodo_calc), para ontem.
explain select exists (
  select 1 from public.crm_lead_eventos e
    join public.crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
    left join public.crm_perfil_etapas(:'cliente_sem_filtro'::uuid) x
      on x.crm_connection_id = e.crm_connection_id and x.pipeline_id = e.pipeline_para and x.status_id = e.status_para
   where e.client_id = :'cliente_sem_filtro'::uuid and e.tipo in ('entrou', 'mudou_etapa')
     and e.ocorreu_em >= (current_date::timestamp at time zone 'America/Sao_Paulo') - interval '30 days'
     and e.ocorreu_em < (current_date::timestamp at time zone 'America/Sao_Paulo')
     and coalesce(public.crm_papel_conta(x.papel, 'compareceu'), s.status_name ~* 'compareceu'));

-- ================================================================ 4. depois do preenchimento: Compareceram nulo no histórico
-- Últimos 60 dias, por clínica. dias_nulos_com_etapa_em_uso = dias com Compareceram nulo em que algum card entrou numa
-- etapa de comparecimento (nome pela regra única, ou papel do perfil) nos 30 dias até o fim do dia. Esperado: 0 (só
-- não é 0 num dia antes do primeiro registro do CRM da clínica).
select '4-compareceram-historico' as secao, r.client_id,
       count(*) as dias,
       count(*) filter (where r.compareceram is null) as dias_nulos,
       count(*) filter (where r.compareceram is null and exists (
         select 1 from public.crm_lead_eventos e
           join public.crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
           left join public.crm_perfil_etapa x on x.crm_connection_id = e.crm_connection_id and x.pipeline_id = e.pipeline_para and x.status_id = e.status_para
          where e.client_id = r.client_id and e.tipo in ('entrou', 'mudou_etapa')
            and e.ocorreu_em >= ((r.dia + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '30 days'
            and e.ocorreu_em < ((r.dia + 1)::timestamp at time zone 'America/Sao_Paulo')
            and coalesce(nullif(x.papel, '') in ('compareceu', 'venda', 'posvenda'),
                         s.status_name ~* '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)'
                         and s.status_name !~* '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)'))) as dias_nulos_com_etapa_em_uso
  from public.resultados_diarios r
 where r.dia >= (now() at time zone 'America/Sao_Paulo')::date - 60
 group by r.client_id
 order by r.client_id;

rollback;
