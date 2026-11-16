-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116130000_agendou_e_etapa_sem_uso.sql.
-- Troca cada trecho novo pelo antigo, uma vez (o par é o mesmo da migração, com o lado trocado), e apaga de novo os
-- resultados guardados de pacientes_periodo. Função sem a marca [agendou-e-etapa-sem-uso] fica como está.
-- Se o histórico diário já tiver sido regravado com a regra nova, refazer com 20261116-refazer-chamaram.sql depois.

begin;
create or replace function pg_temp.desfazer(p_fn regprocedure, p_marca text, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position(p_marca in d) = 0 then return; end if;  -- já está sem a troca
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception 'reverter %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %', p_fn, i, n, left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position(p_marca in d) > 0 then raise exception 'reverter %: a marca % continua lá', p_fn, p_marca; end if;
  execute d;
end
$f$;

select pg_temp.desfazer('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, '[agendou-e-etapa-sem-uso]', array[
  array[$t$k.status_id = e.status_para and k.kpi = 'consulta_agendada') or (s.status_name ~* '(agendad|agendament)' and s.status_name !~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)') /* [agendou-e-etapa-sem-uso] */ as agendamento,$t$,
        $t$k.status_id = e.status_para and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)' as agendamento,$t$],
  array[$t$  -- [agendou-e-etapa-sem-uso] Agendaram 0: com etapa de agendamento que nenhum card usou nos 90 dias até o fim do
  -- período, o 0 não é medida ("não medido", etapa sem uso). Sem etapa nenhuma: "não se aplica", como antes. Com a etapa
  -- em uso, o 0 continua medido. "Aguardando agendamento", "Reagendamento", "Não agendou" etc. não são agendamento.
  if coalesce((v->>'tem_crm')::boolean, false)
     and jsonb_typeof(v #> '{numeros,agendaram,valor}') = 'number'
     and (v #>> '{numeros,agendaram,valor}')::numeric = 0
     and not exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and coalesce(public.crm_papel_conta(x.papel, 'consulta_agendada'),
                exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                          and k.status_id = s.status_id and k.kpi = 'consulta_agendada')
                or (s.status_name ~* '(agendad|agendament)' and s.status_name !~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)'))
          and (exists (select 1 from crm_lead_eventos e
                        where e.client_id = p_client and e.crm_connection_id = s.crm_connection_id and e.pipeline_para = s.pipeline_id
                          and e.status_para = s.status_id and e.tipo in ('entrou', 'mudou_etapa')
                          and e.ocorreu_em >= v_fim - interval '90 days' and e.ocorreu_em < v_fim)
               or exists (select 1 from crm_leads l
                           where l.crm_connection_id = s.crm_connection_id and l.pipeline_id = s.pipeline_id and l.status_id = s.status_id
                             and l.removido_na_origem is null and l.occurred_at >= v_fim - interval '90 days' and l.occurred_at < v_fim)))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'agendou') then
    v := jsonb_set(v, '{numeros,agendaram}', case
           when exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and coalesce(public.crm_papel_conta(x.papel, 'consulta_agendada'),
                exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                          and k.status_id = s.status_id and k.kpi = 'consulta_agendada')
                or (s.status_name ~* '(agendad|agendament)' and s.status_name !~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)'))) then
             jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
               'motivo_sem_dado', 'O CRM tem etapa de agendamento, mas nenhum card passou por ela nos últimos 90 dias. A equipe não está usando essa etapa, então o número não é medido.',
               'responsavel', 'comercial', 'nao_medido_por', 'etapa_sem_uso',
               'o_que_fazer', 'Mover o card para a etapa de agendamento quando a consulta for marcada.')
           else jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
             'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true) end);
  end if;
$t$,
        $t$  if coalesce((v->>'tem_crm')::boolean, false)
     and jsonb_typeof(v #> '{numeros,agendaram,valor}') = 'number'
     and (v #>> '{numeros,agendaram,valor}')::numeric = 0
     and not exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and coalesce(public.crm_papel_conta(x.papel, 'consulta_agendada'),
                exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                          and k.status_id = s.status_id and k.kpi = 'consulta_agendada')
                or s.status_name ~* '(agendad|agendament)'))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'agendou') then
    v := jsonb_set(v, '{numeros,agendaram}', jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
           'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true));
  end if;
$t$],
  array[$t$  -- [agendou-e-etapa-sem-uso] Fecharam 0: etapa de venda que ninguém usou em 180 dias não impede o "não medido".
  if coalesce((v->>'tem_crm')::boolean, false)
     and (v #>> '{numeros,fecharam,fonte}') = 'crm'
     and jsonb_typeof(v #> '{numeros,fecharam,valor}') = 'number'
     and (v #>> '{numeros,fecharam,valor}')::numeric = 0
     and not exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and (coalesce(public.crm_papel_conta(x.papel, 'ganho'), false)
               or exists (select 1 from crm_etapa_resultado er where er.crm_connection_id = s.crm_connection_id
                            and er.pipeline_id = s.pipeline_id and er.status_id = s.status_id and er.outcome = 'won')
               or s.status_name ~* '(venda|vendid|fechad|ganh|pago|contrat)')
          and (exists (select 1 from crm_lead_eventos e
                        where e.client_id = p_client and e.crm_connection_id = s.crm_connection_id and e.pipeline_para = s.pipeline_id
                          and e.status_para = s.status_id and e.tipo in ('entrou', 'mudou_etapa')
                          and e.ocorreu_em >= v_fim - interval '180 days' and e.ocorreu_em < v_fim)
               or exists (select 1 from crm_leads l
                           where l.crm_connection_id = s.crm_connection_id and l.pipeline_id = s.pipeline_id and l.status_id = s.status_id
                             and l.removido_na_origem is null and l.occurred_at >= v_fim - interval '180 days' and l.occurred_at < v_fim)))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'fechou')
     and not exists (
       select 1 from crm_lead_eventos e
        where e.client_id = p_client and e.tipo = 'ganhou' and e.ocorreu_em >= v_fim - interval '180 days')
     and not exists (
       select 1 from public.crm_leads_do_cliente(p_client) cl
        where cl.client_id = p_client and cl.outcome = 'won' and cl.removido_na_origem is null
          and cl.occurred_at >= v_fim - interval '180 days') then
    v := jsonb_set(v, '{numeros,fecharam}', case
           when exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and (coalesce(public.crm_papel_conta(x.papel, 'ganho'), false)
               or exists (select 1 from crm_etapa_resultado er where er.crm_connection_id = s.crm_connection_id
                            and er.pipeline_id = s.pipeline_id and er.status_id = s.status_id and er.outcome = 'won')
               or s.status_name ~* '(venda|vendid|fechad|ganh|pago|contrat)')) then
             jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
               'motivo_sem_dado', 'O CRM tem etapa de venda, mas nenhum card passou por ela nem foi marcado como ganho nos últimos 180 dias. A equipe não está usando essa etapa, então o número não é medido.',
               'responsavel', 'comercial', 'nao_medido_por', 'etapa_sem_uso',
               'o_que_fazer', 'Marcar o card como ganho (ou mover para a etapa de venda) quando o paciente fechar.')
           else jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
             'motivo_sem_dado', 'o CRM não marca venda', 'responsavel', 'comercial', 'nao_se_aplica', true) end);
  end if;
$t$,
        $t$  if coalesce((v->>'tem_crm')::boolean, false)
     and (v #>> '{numeros,fecharam,fonte}') = 'crm'
     and jsonb_typeof(v #> '{numeros,fecharam,valor}') = 'number'
     and (v #>> '{numeros,fecharam,valor}')::numeric = 0
     and not exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and (coalesce(public.crm_papel_conta(x.papel, 'ganho'), false)
               or exists (select 1 from crm_etapa_resultado er where er.crm_connection_id = s.crm_connection_id
                            and er.pipeline_id = s.pipeline_id and er.status_id = s.status_id and er.outcome = 'won')
               or s.status_name ~* '(venda|vendid|fechad|ganh|pago|contrat)'))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'fechou')
     and not exists (
       select 1 from crm_lead_eventos e
        where e.client_id = p_client and e.tipo = 'ganhou' and e.ocorreu_em >= v_fim - interval '180 days')
     and not exists (
       select 1 from public.crm_leads_do_cliente(p_client) cl
        where cl.client_id = p_client and cl.outcome = 'won' and cl.removido_na_origem is null
          and cl.occurred_at >= v_fim - interval '180 days') then
    v := jsonb_set(v, '{numeros,fecharam}', jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
           'motivo_sem_dado', 'o CRM não marca venda', 'responsavel', 'comercial', 'nao_se_aplica', true));
  end if;
$t$],
  array[$t$  elsif jsonb_typeof(v #> '{numeros,compareceram,valor}') = 'number'
     and (v #>> '{numeros,compareceram,valor}')::numeric = 0
     and ((true
     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) + coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0
     -- [contagem-por-clinica] Num dia só (histórico diário), a etapa está em uso se algum card entrou nela nos 30 dias
     -- até o fim do dia: aí o 0 do dia é medido. Período de vários dias: como antes. Lê pelo índice (client_id, ocorreu_em).
     and not (p_ate = p_de and exists (
       select 1 from crm_lead_eventos e
         join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = e.crm_connection_id and x.pipeline_id = e.pipeline_para and x.status_id = e.status_para
        where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa')
          and e.ocorreu_em >= v_fim - interval '30 days' and e.ocorreu_em < v_fim
          and coalesce(public.crm_papel_conta(x.papel, 'compareceu'),
                       s.status_name ~* '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)' and s.status_name !~* '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)'))))
          -- [agendou-e-etapa-sem-uso] Nenhum card entrou numa etapa de comparecimento nos 90 dias até o fim do período: o
          -- 0 não é medida, em qualquer período (antes, um dia sem agendamento nem venda guardava 0 "medido").
          or not exists (
            select 1 from crm_lead_eventos e
              join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
              left join public.crm_perfil_etapas(p_client) x
                on x.crm_connection_id = e.crm_connection_id and x.pipeline_id = e.pipeline_para and x.status_id = e.status_para
             where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa')
               and e.ocorreu_em >= v_fim - interval '90 days' and e.ocorreu_em < v_fim
               and coalesce(public.crm_papel_conta(x.papel, 'compareceu'),
                            s.status_name ~* '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)' and s.status_name !~* '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)'))) then
$t$,
        $t$  elsif jsonb_typeof(v #> '{numeros,compareceram,valor}') = 'number'
     and (v #>> '{numeros,compareceram,valor}')::numeric = 0
     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) + coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0
     -- [contagem-por-clinica] Num dia só (histórico diário), a etapa está em uso se algum card entrou nela nos 30 dias
     -- até o fim do dia: aí o 0 do dia é medido. Período de vários dias: como antes. Lê pelo índice (client_id, ocorreu_em).
     and not (p_ate = p_de and exists (
       select 1 from crm_lead_eventos e
         join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = e.crm_connection_id and x.pipeline_id = e.pipeline_para and x.status_id = e.status_para
        where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa')
          and e.ocorreu_em >= v_fim - interval '30 days' and e.ocorreu_em < v_fim
          and coalesce(public.crm_papel_conta(x.papel, 'compareceu'),
                       s.status_name ~* '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)' and s.status_name !~* '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)'))) then
$t$],
  array[$t$           'motivo_sem_dado', case
             when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) + coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then
             format('O CRM tem a etapa %s, mas nenhum card passou por ela no período, enquanto %s. A equipe não está usando essa etapa, então o número não é medido.',
             coalesce(v_motivo, 'de comparecimento'),
             concat_ws(' e ',
               case when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then (v #>> '{numeros,agendaram,valor}') || ' pessoas agendaram' end,
               case when coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then (v #>> '{numeros,fecharam,valor}') || ' fecharam' end))
             else format('O CRM tem a etapa %s, mas nenhum card passou por ela nos últimos 90 dias. A equipe não está usando essa etapa, então o número não é medido.',
               coalesce(v_motivo, 'de comparecimento')) end /* [agendou-e-etapa-sem-uso] */,
$t$,
        $t$           'motivo_sem_dado', format('O CRM tem a etapa %s, mas nenhum card passou por ela no período, enquanto %s. A equipe não está usando essa etapa, então o número não é medido.',
             coalesce(v_motivo, 'de comparecimento'),
             concat_ws(' e ',
               case when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then (v #>> '{numeros,agendaram,valor}') || ' pessoas agendaram' end,
               case when coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then (v #>> '{numeros,fecharam,valor}') || ' fecharam' end)),
$t$]
]);

select pg_temp.desfazer('public.pacientes_cards(uuid)'::regprocedure, '[agendou-e-etapa-sem-uso]', array[
  array[$t$k.status_id = s.status_id and k.kpi = 'consulta_agendada') or (s.status_name ~* '(agendad|agendament)' and s.status_name !~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)') /* [agendou-e-etapa-sem-uso] */) as agendamento,$t$,
        $t$k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)') as agendamento,$t$]
]);

delete from public.resultado_pronto where funcao = 'pacientes_periodo';
commit;
