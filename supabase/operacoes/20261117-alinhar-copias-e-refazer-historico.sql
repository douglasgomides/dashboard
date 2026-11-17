-- NÃO é migração: rodar à mão, só o João. Agentes não rodam este arquivo.
-- Ordem: depois de aplicar 20261117100000, 20261117110000 e 20261117120000 E de gravar a configuração por clínica do
-- ciclo 5 (a chave config.espelho_de nas conexões espelho e as regras de crm_filtro_cliente das contas compartilhadas,
-- arquivo fora do repositório). Sem nenhum espelho configurado, a parte 1 não faz nada e a parte 2 vale do mesmo jeito.
--
-- Parte 1 (um bloco só, em begin/commit): acerta UMA vez cada conexão espelho com a cópia que vale
-- (crm_espelho_alinhar: cards iguais, card que só o espelho tinha marcado como removido na origem, eventos do espelho
-- trocados pela cópia dos eventos da que vale). Para sem mudar nada se alguma conexão tem a chave espelho_de inválida
-- (outra conta, conexão inativa, ou a que vale também é espelho). Devolve, por espelho, quantos cards mudaram, quantos
-- só o espelho tinha e quantos eventos foram copiados. Os números de cada conexão ficam fora do repositório.
--
-- Parte 2: regrava o histórico diário dos últimos 90 dias de todas as clínicas com as regras novas (retorno de 15 dias em
-- "Agendaram", "aguardando confirmação" fora de "Em negociação", contas compartilhadas lidas de uma cópia, divisão por
-- etiqueta). Mesmo preenchimento em segundo plano de 20261116-refazer-chamaram.sql (tabela _preencher_historico e o job
-- "preencher-historico", 2 dias por minuto, uns 45 minutos, sem travar o SQL editor; o job se desliga sozinho no fim).

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
begin;
update public._preencher_historico
   set proximo = (now() at time zone 'America/Sao_Paulo')::date - 90,
       ate = (now() at time zone 'America/Sao_Paulo')::date - 1,
       feito_em = null, erro = null;
select cron.schedule('preencher-historico', '* * * * *', 'select public._preencher_historico_passo()');
commit;

-- Acompanhar (só lê): "proximo" anda 2 dias por minuto até passar de "ate"; "erro" tem de ficar vazio.
select proximo, ate, feito_em, erro from public._preencher_historico;
