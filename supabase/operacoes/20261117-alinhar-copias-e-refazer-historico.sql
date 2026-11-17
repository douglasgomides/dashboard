-- NÃO é migração: rodar à mão, só o João. Agentes não rodam este arquivo.
-- Ordem: depois de aplicar 20261117100000, 20261117110000 e 20261117120000 E de gravar a configuração por clínica do
-- ciclo 5 (a chave config.espelho_de nas conexões espelho e as regras de crm_filtro_cliente das contas compartilhadas,
-- arquivo fora do repositório). Sem nenhum espelho configurado, a parte 1 não faz nada e a parte 2 vale do mesmo jeito.
--
-- Parte 1 (um bloco só, em begin/commit): acerta UMA vez cada conexão espelho com a cópia que vale
-- (crm_espelho_alinhar: cards iguais, card que só o espelho tinha marcado como removido na origem, eventos do espelho
-- trocados pela cópia dos eventos da que vale, e em cada conversa da conta a leitura da IA mais nova vale para todas as
-- cópias). Para sem mudar nada se alguma conexão tem a chave espelho_de inválida (outra conta, conexão inativa, ou a que
-- vale também é espelho). Devolve, por espelho, quantos cards mudaram, quantos só o espelho tinha, quantos eventos e
-- quantas leituras da IA foram copiados. Os números de cada conexão ficam fora do repositório.
--
-- Parte 2: regrava o histórico diário INTEIRO (do primeiro dia da tabela até ontem) de todas as clínicas com as regras
-- novas (retorno de 15 dias em "Agendaram", contas compartilhadas lidas de uma cópia, divisão por etiqueta). Inteiro, e
-- não só 90 dias: toda comparação de "Agendaram" com o período anterior (Resultados, Pacientes, Hoje, Atendimento,
-- Carteira) soma o histórico diário dos dois lados, e os períodos de 90, 180 e 365 dias e o personalizado comparam com
-- dias de antes dos 90; um lado com a regra nova e o outro com a velha mostraria uma queda que não aconteceu (o retorno
-- de 15 dias tira de 20% a 60% dos agendamentos nas clínicas com 20 ou mais). Mesmo preenchimento em segundo plano de
-- 20261116-refazer-chamaram.sql (tabela _preencher_historico e o job "preencher-historico", 2 dias por minuto, sem travar
-- o SQL editor; o job se desliga sozinho no fim). O SELECT "Antes" mostra quantos dias e minutos vai levar.
-- Começar entre 08:00 e 20:00 (Brasília): o job tem de acabar antes das 03:15, porque o cron das 03:30 apaga as pessoas
-- guardadas de mais de 60 dias antes de ontem, e os dias que o preenchimento ainda vai gravar precisam delas. Se cruzar,
-- rodar a parte 2 de novo (é seguro: cada dia refaz a própria lista, em ordem crescente).
-- O que a parte 2 NÃO refaz: a fila "Em negociação" dos dias já medidos pelo cron (resultados_gravar_dia com p_fila =
-- false guarda a fila medida naquele dia; a fila do passado não dá para refazer com o estado de hoje). Então, nos dias
-- de antes da migração, a fila ainda inclui quem estava em "aguardando confirmação". Nenhuma tela compara essa fila entre
-- períodos (ela entra só no Atendido do funil, que não tem variação), então nada muda na tela por isso.
-- Durante o preenchimento, uma comparação pode pegar um lado já regravado e o outro não: conferir as telas depois que o
-- "proximo" passar do "ate".

-- ---------------------------------------------------------------------------------------------- Parte 1
begin;
do $$
declare
  ruins integer;
begin
  select count(*) into ruins from public.crm_connections c
   where c.config ? 'espelho_de' and public.crm_espelho_de(c.id) is null;
  if ruins > 0 then
    raise exception 'alinhar: % conexão(ões) com config.espelho_de inválida (outra conta, inativa ou cadeia). Nada foi alterado.', ruins;
  end if;
end $$;
select c.id as espelho, public.crm_espelho_de(c.id) as copia_que_vale, public.crm_espelho_alinhar(c.id) as resultado
  from public.crm_connections c
 where c.config ? 'espelho_de'
 order by c.id;
delete from public.resultado_pronto where funcao in ('pacientes_periodo', 'roi_periodo', 'qualidade_dados');
commit;

-- Conferir (só lê): cada espelho tem os mesmos cards e eventos da cópia que vale. As duas colunas "diferentes" têm de dar 0.
select c.id as espelho,
       (select count(*) from public.crm_leads k
          left join public.crm_leads e on e.crm_connection_id = c.id and e.external_lead_id = k.external_lead_id
         where k.crm_connection_id = public.crm_espelho_de(c.id)
           and (e.id is null or (e.status_id, e.pipeline_id, e.outcome, e.price, e.removido_na_origem, e.occurred_at, e.raw_payload)
                is distinct from (k.status_id, k.pipeline_id, k.outcome, k.price, k.removido_na_origem, k.occurred_at, k.raw_payload))) as cards_diferentes,
       (select count(*) from public.crm_lead_eventos where crm_connection_id = public.crm_espelho_de(c.id))
       - (select count(*) from public.crm_lead_eventos where crm_connection_id = c.id) as eventos_diferentes
  from public.crm_connections c
 where c.config ? 'espelho_de';

-- ---------------------------------------------------------------------------------------------- Parte 2
-- Antes (só lê): do primeiro dia do histórico até ontem, quantos dias e uns quantos minutos (2 dias por minuto).
select min(dia) as de, (now() at time zone 'America/Sao_Paulo')::date - 1 as ate,
       (now() at time zone 'America/Sao_Paulo')::date - min(dia) as dias,
       ceil(((now() at time zone 'America/Sao_Paulo')::date - min(dia)) / 2.0) as minutos
  from public.resultados_diarios;

begin;
update public._preencher_historico
   set proximo = (select min(dia) from public.resultados_diarios),
       ate = (now() at time zone 'America/Sao_Paulo')::date - 1,
       feito_em = null, erro = null;
select cron.schedule('preencher-historico', '* * * * *', 'select public._preencher_historico_passo()');
commit;

-- Acompanhar (só lê): "proximo" anda 2 dias por minuto até passar de "ate"; "erro" tem de ficar vazio.
select proximo, ate, feito_em, erro from public._preencher_historico;
