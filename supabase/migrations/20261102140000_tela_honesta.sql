-- A tela diz a verdade (auditoria de confiabilidade de 01/11/2026, critérios 3 e 6).
--   1. pacientes_periodo, "Abordados pela equipe": sem funil de prospecção ativa no CRM, o número não se aplica.
--      Antes: 0 nos 4 clientes auditados (HOMS, Dr. Sergio Maia, Dra. Samira, Doctor Creator), com o aviso só dentro
--      do cartão. Agora: valor null, 'nao_se_aplica' true e o motivo.
--   2. pacientes_periodo, "Foram na consulta": a etapa de comparecimento existe, mas ninguém passou por ela no período
--      enquanto houve agendamento ou venda. Antes: 0 (Sergio: 0 com 80 fecharam e 146 agendaram; Samira: 0 com 36
--      fecharam). Agora: valor null, motivo com o nome da etapa, quem resolve (comercial) e 'o_que_fazer'. Sem etapa
--      de comparecimento (HOMS, Doctor Creator), o motivo continua e ganha 'o_que_fazer'.
--   3. crm_leads_resumo_periodo: 'valor' somava o preço de todos os cards do período, inclusive abertos e perdidos
--      (Sergio, outubro: R$ 256.282,72 contra R$ 95.485 ganhos). Agora soma só os cards ganhos. Nenhuma tela lia este
--      campo; o relatório passa a poder usar sem ler orçamento aberto como receita. As outras colunas não mudam.
--   4. crm_compartilhado_com(uuid): lista leve das outras clínicas que leem a mesma conta de CRM (mesma regra de
--      pacientes_periodo), para o Resultado e a Jornada mostrarem o aviso sem chamar a função pesada.
-- Como: pacientes_periodo e crm_leads_resumo_periodo são alteradas pelo texto (DO-block com pg_get_functiondef e
-- replace), sem mudar assinatura, segurança (security definer, checagem de acesso no começo) nem grants. O bloco novo
-- de pacientes_periodo só mexe no jsonb já montado: custo desprezível (uma leitura de crm_pipeline_statuses quando o
-- comparecimento sai 0).
-- Reversão: em pacientes_periodo, tirar o trecho entre "-- [tela-honesta] início" e "-- [tela-honesta] fim"
-- (mesmo padrão: replace do trecho novo pelo antigo); em crm_leads_resumo_periodo, trocar
-- "sum(price) from per where outcome = 'won'" por "sum(price) from per"; drop function public.crm_compartilhado_com(uuid).

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  a1 text := E'  -- [nao-medido] fim\n  return v;\nend;';
  n1 text := $n$  -- [nao-medido] fim
  -- [tela-honesta] início: "não se aplica" e "não medido" no lugar de zero (20261102140000).
  if jsonb_typeof(v #> '{numeros,abordados,valor}') = 'number'
     and not coalesce((v->>'tem_funil_prospeccao')::boolean, false) then
    v := jsonb_set(v, '{numeros,abordados}', jsonb_build_object('valor', null, 'fonte', 'crm',
           'motivo_sem_dado', 'A clínica não usa funil de prospecção ativa no CRM, então este número não se aplica.',
           'responsavel', null, 'nao_se_aplica', true));
  end if;
  if (v #>> '{numeros,compareceram,motivo_sem_dado}') = 'o CRM não tem etapa que marque o comparecimento' then
    v := jsonb_set(v, '{numeros,compareceram}', (v #> '{numeros,compareceram}') || jsonb_build_object(
           'motivo_sem_dado', 'O CRM não tem uma etapa que marque que o paciente foi à consulta.',
           'o_que_fazer', 'Criar no CRM uma etapa "Consulta realizada" (ou "Compareceu") depois do agendamento e mover o card para ela quando o paciente for à consulta.'));
  elsif jsonb_typeof(v #> '{numeros,compareceram,valor}') = 'number'
     and (v #>> '{numeros,compareceram,valor}')::numeric = 0
     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) + coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then
    select string_agg(distinct format('"%s"', s.status_name), ', ') into v_motivo
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id and c.active
     where c.client_id = p_client
       and s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)';
    v := jsonb_set(v, '{numeros,compareceram}', jsonb_build_object('valor', null, 'fonte', 'crm',
           'motivo_sem_dado', format('O CRM tem a etapa %s, mas nenhum card passou por ela no período, enquanto %s. A equipe não está usando essa etapa, então o número não é medido.',
             coalesce(v_motivo, 'de comparecimento'),
             concat_ws(' e ',
               case when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then (v #>> '{numeros,agendaram,valor}') || ' pessoas agendaram' end,
               case when coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then (v #>> '{numeros,fecharam,valor}') || ' fecharam' end)),
           'responsavel', 'comercial', 'nao_medido_por', 'etapa_sem_uso',
           'o_que_fazer', format('Mover o card para %s quando o paciente for à consulta, antes de marcar como ganho.', coalesce(v_motivo, 'a etapa de comparecimento'))));
  end if;
  -- [tela-honesta] fim
  return v;
end;$n$;
begin
  if position('[tela-honesta] início' in d) > 0 then return; end if;
  if position(a1 in d) = 0 then
    raise exception 'pacientes_periodo: trecho "[nao-medido] fim / return v; end;" não encontrado; aplicar 20261101130000 antes ou revisar esta migração';
  end if;
  execute replace(d, a1, n1);
end
$migra$;

do $migra$
declare
  d text := pg_get_functiondef('public.crm_leads_resumo_periodo(uuid,date,date)'::regprocedure);
  a1 text := 'coalesce((select sum(price) from per), 0)';
  n1 text := $n$coalesce((select sum(price) from per where outcome = 'won'), 0)$n$;
begin
  if position(n1 in d) > 0 then return; end if;
  if position(a1 in d) = 0 then raise exception 'crm_leads_resumo_periodo: trecho do valor não encontrado; revisar esta migração'; end if;
  execute replace(d, a1, n1);
end
$migra$;

comment on function public.crm_leads_resumo_periodo(uuid,date,date) is
  'Resumo do CRM no período: novos = pessoas novas (crm_pessoas_novas); ganhos = cards ganhos criados no período (uma pessoa pode ter vários); perdidos = pessoas com card perdido e nenhum ganho; valor = soma do valor dos cards ganhos (desde 20261102140000; antes somava também abertos e perdidos).';

create or replace function public.crm_compartilhado_com(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    raise exception 'sem acesso a esta clínica' using errcode = '42501';
  end if;
  -- Mesma regra de pacientes_periodo (20261031162000): mesma conta (provedor + subdomínio) ligada a outra clínica ativa.
  return coalesce((
    select jsonb_agg(distinct o.name order by o.name)
      from crm_connections k
      join crm_connections k2 on k2.provider = k.provider and k2.client_id <> k.client_id and k2.active
        and coalesce(k2.subdomain, '') <> '' and k2.subdomain = k.subdomain
      join clients o on o.id = k2.client_id and o.active and not o.eh_teste
     where k.client_id = p_client and k.active), '[]'::jsonb);
end;
$$;

comment on function public.crm_compartilhado_com(uuid) is
  'Outras clínicas que leem a mesma conta de CRM (os números de CRM são da conta inteira). Só o nome das clínicas; checa acesso.';

revoke all on function public.crm_compartilhado_com(uuid) from public, anon;
grant execute on function public.crm_compartilhado_com(uuid) to authenticated, service_role;
