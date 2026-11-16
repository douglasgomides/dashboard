-- NÃO é migração: rodar à mão, só o João, DEPOIS de aplicar 20261116100000_chamaram_por_pessoa.sql.
-- Agentes não rodam este arquivo.
--
-- O que faz: regrava o histórico diário dos últimos 90 dias com a regra nova do Chamaram (cada pessoa uma vez em 30
-- dias). 90 dias porque a Carteira compara 30 dias com os 30 anteriores, e cada dia precisa conhecer os 30 de antes.
-- Usa o mesmo preenchimento em segundo plano do histórico de 13/11 (tabela _preencher_historico e o job do pg_cron
-- "preencher-historico"): 2 dias por minuto, uns 45 minutos no total, sem travar o SQL editor. O job se desliga sozinho
-- no fim. Os outros números (Agendaram, Fecharam...) são regravados com a mesma regra de hoje e não mudam.
--
-- Como rodar: colar o bloco inteiro de uma vez. Para acompanhar, o SELECT do fim (só lê): "proximo" anda 2 dias por
-- minuto até passar de "ate"; "erro" tem de ficar vazio.

begin;
update public._preencher_historico
   set proximo = (now() at time zone 'America/Sao_Paulo')::date - 90,
       ate = (now() at time zone 'America/Sao_Paulo')::date - 1,
       feito_em = null, erro = null;
select cron.schedule('preencher-historico', '* * * * *', 'select public._preencher_historico_passo()');
commit;

-- Acompanhar (só lê):
select proximo, ate, feito_em, erro from public._preencher_historico;
