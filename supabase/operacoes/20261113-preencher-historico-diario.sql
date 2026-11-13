-- NÃO é migração: rodar à mão, só o João, depois de aplicar 20261113100000_contas_certas_no_banco.sql e
-- 20261113110000_historico_diario_por_entrada.sql. Agentes não rodam este arquivo.
-- (Fica em supabase/operacoes/: scripts/banco/aplicar.sh e o workflow "Banco de dados" só leem supabase/migrations.)
--
-- O que faz: grava de novo o histórico diário (resultados_diarios) com a regra nova, do dia mais antigo para o mais
-- novo, para o período atual e o anterior seguirem a mesma regra:
--  - Agendaram = quem entrou no dia, uma vez por pessoa em 30 dias;
--  - Negociação = nula nos dias preenchidos (a fila do passado não dá para refazer com o estado de hoje), menos nos
--    dias em que o cron já tinha medido a fila na manhã seguinte (esses ficam como estão);
--  - os outros números, como hoje.
-- Começa 30 dias antes do primeiro dia do histórico, para o primeiro dia já saber quem tinha agendado antes.
--
-- Como rodar (SQL editor do projeto de produção):
--  1. Rodar o SELECT gerador abaixo (só lê; não grava nada). Ele imprime uma linha por janela de 7 dias, em ordem.
--     Guardar a lista: rodar o gerador de novo DEPOIS do preenchimento começaria 30 dias mais cedo.
--  2. Numa sessão, primeiro:
--       set statement_timeout = '15min';
--     e depois cada linha impressa SOZINHA, uma por vez, na ordem em que saiu. Cada janela leva alguns minutos.
--  3. Se uma janela estourar o tempo, dividir aquela janela em janelas de 3 dias (mesmas datas, em ordem) e seguir.
--  4. Não rodar janelas entre 03:15 e 04:00 (horário de Brasília): o cron das 03:30 grava o dia de ontem e apaga as
--     pessoas guardadas com mais de 60 dias antes de ontem. Se isso acontecer no meio, rodar de novo todas as janelas
--     desde a primeira (rodar de novo é seguro: cada dia refaz a própria lista, em ordem).
--  5. Depois da última janela, rodar supabase/audits/historico-diario-conferencia.sql (seção 3) e guardar a saída.
--
-- Rodar de novo o preenchimento inteiro (por exemplo, depois do reprocesso das conversas do Kommo) é seguro, desde
-- que seja em ordem crescente, desde a primeira janela.

-- [gerador] início
with lim as (
  select min(dia) - 30 as de, (now() at time zone 'America/Sao_Paulo')::date - 1 as ate
    from public.resultados_diarios
)
select format('select public.resultados_preencher(%L, %L);', j::date, least(j::date + 6, lim.ate)) as rodar
  from lim, generate_series(lim.de, lim.ate, interval '7 days') j
 where lim.de is not null
 order by j;
-- [gerador] fim
