-- Papel do funil pela regra do nome: "atendimento clínica" (Dra. Samira: "Atendimento clínica GSS" e "Atendimento
-- Clínica", 1.060 cards, com Incoming leads, Atendimento inicial, Aguardando decisão) é o funil comercial, não
-- pós-venda. Só "atendimento clínico" (Dra. Lana: acompanhamento depois da consulta) fica operacional. Como
-- operacional, o funil da Samira saía de "em negociação" (0 na tela Pacientes do período com 101 pessoas novas).
-- Reversão: voltar a regra para 'cl[ií]nic[oa]' e rodar de novo o bloco de reaplicação.

do $migra$
declare
  d text := pg_get_functiondef('public.crm_papel_pela_regra(text)'::regprocedure);
begin
  if position('atendimento cl[ií]nico)' in d) > 0 then return; end if;
  if position('atendimento cl[ií]nic[oa]' in d) = 0 then raise exception 'crm_papel_pela_regra: trecho não encontrado'; end if;
  execute replace(d, 'atendimento cl[ií]nic[oa]', 'atendimento cl[ií]nico');
end
$migra$;

-- Reaplica a regra: o que a equipe definiu continua; o que a regra deixou de reconhecer sai.
update public.crm_funil_papel fp set papel = 'captacao', atualizado_em = now()
 where fp.definido_por = 'regra' and fp.papel = 'operacional'
   and public.crm_papel_pela_regra((select s.pipeline_name from public.crm_pipeline_statuses s
                                     where s.crm_connection_id = fp.crm_connection_id and s.pipeline_id = fp.pipeline_id limit 1)) is null;
