-- [agendou-e-etapa-sem-uso] "Agendou" sem o que não é agendamento e etapa sem uso como "não medido" (debug
-- numeros-nao-batem-fonte, 16/11/2026: M13 e o zero falso das etapas mortas).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116120000_historico_regravado_e_erros.sql.
-- Agentes não rodam este arquivo. Velocidade antes e depois: o arquivo medir-velocidade.sql do debug (EXPLAIN ANALYZE,
-- só leitura). Se pacientes_periodo_calc ficar mais de 1,5x mais lenta na média: a reversão abaixo.
-- Reversão: supabase/operacoes/20261116-reverter-agendou-e-etapa-sem-uso.sql.
--
-- O que muda (regra geral, nenhuma clínica citada):
--  1. Etapa de agendamento pelo nome: '(agendad|agendament)' continua, mas não conta a etapa cujo nome diz que NÃO é um
--     agendamento: aguardando, reagendamento, desmarcou, cancelado, "não agendou", "não veio" e prêmio. Etapa marcada
--     pela equipe (KPI consulta_agendada ou papel do perfil) conta como antes. Exame NÃO entra na exclusão: é pergunta
--     para o João (se "agendou" é qualquer agendamento ou só consulta). Lugares: pacientes_periodo_calc (eventos de etapa
--     e a trava do "não se aplica") e pacientes_cards (etapa atual). crm_vendas_periodo e crm_perfil_para_analise têm a
--     mesma regex e ficam para depois: a definição viva delas não foi lida.
--  2. Zero de etapa sem uso vira "não medido" (etapa_sem_uso), nunca 0 medido:
--     - Compareceram 0 quando nenhum card entrou numa etapa de comparecimento nos 90 dias até o fim do período, em
--       qualquer período (antes: só com agendamento ou venda no período, então um dia sem os dois guardava 0 medido no
--       histórico diário). A regra antiga continua valendo junto.
--     - Agendaram 0 quando a etapa de agendamento existe mas nenhum card entrou nela (evento) nem está nela com card
--       criado nos 90 dias até o fim do período. Sem etapa nenhuma: "não se aplica", como antes.
--     - Fecharam 0 do CRM quando a etapa de venda existe mas ninguém a usou em 180 dias, e não houve ganho, evento de
--       ganho nem conversa lida como "fechou" (antes, só ter a etapa já deixava o 0 "medido").
--     Os eventos de etapa só existem desde meados de outubro: "90 dias" na prática é desde então.
--  3. No fim, apaga do resultado_pronto os resultados de pacientes_periodo (a próxima leitura recalcula). O histórico
--     diário passa a valer a regra nova nos dias que o cron regravar (os 7 últimos, com 20261116120000); para refazer os
--     90 dias, rodar de novo supabase/operacoes/20261116-refazer-chamaram.sql (regrava com a função do momento).
--
-- Como: cada função é trocada pelo texto da definição atual (pg_get_functiondef). Cada trecho antigo tem de aparecer
-- exatamente uma vez (os trechos foram conferidos na definição viva de 16/11 e na que as migrações montam); senão a
-- migração para e nada muda. Função que já tem a marca é pulada. Mesmas assinaturas, permissões e volatilidade.

create or replace function pg_temp.agendou_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  -- Agendamento pelo nome (a mesma de antes) e o que, no nome, diz que não é agendamento.
  re_agendou constant text := '(agendad|agendament)';
  re_nao_agendou constant text := '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)';
  -- Cópia literal de RE_COMPARECEU e RE_NAO_COMPARECEU (src/lib/guia-crm.ts), como em 20261114110000.
  re_compareceu constant text := '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)';
  re_nao_compareceu constant text := '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)';
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[agendou-e-etapa-sem-uso]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception '[agendou-e-etapa-sem-uso] %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %',
        p_fn, i, n, left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1],
                 replace(replace(replace(replace(p_trocas[i][2], '{RE_AGENDOU}', re_agendou), '{RE_NAO_AGENDOU}', re_nao_agendou),
                                 '{RE_COMPARECEU}', re_compareceu), '{RE_NAO_COMPARECEU}', re_nao_compareceu));
  end loop;
  if position('[agendou-e-etapa-sem-uso]' in d) = 0 then
    raise exception '[agendou-e-etapa-sem-uso] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, trocados de lado)
-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_periodo_calc: 1) eventos de etapa; 2) Agendaram "não medido"/"não se aplica"; 3) Fecharam; 4) a condição
-- do Compareceram; 5) o texto do motivo do Compareceram.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.agendou_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$k.status_id = e.status_para and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)' as agendamento,$t$,
        $t$k.status_id = e.status_para and k.kpi = 'consulta_agendada') or (s.status_name ~* '{RE_AGENDOU}' and s.status_name !~* '{RE_NAO_AGENDOU}') /* [agendou-e-etapa-sem-uso] */ as agendamento,$t$],
  array[$t$  if coalesce((v->>'tem_crm')::boolean, false)
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
$t$,
        $t$  -- [agendou-e-etapa-sem-uso] Agendaram 0: com etapa de agendamento que nenhum card usou nos 90 dias até o fim do
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
                or (s.status_name ~* '{RE_AGENDOU}' and s.status_name !~* '{RE_NAO_AGENDOU}'))
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
                or (s.status_name ~* '{RE_AGENDOU}' and s.status_name !~* '{RE_NAO_AGENDOU}'))) then
             jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
               'motivo_sem_dado', 'O CRM tem etapa de agendamento, mas nenhum card passou por ela nos últimos 90 dias. A equipe não está usando essa etapa, então o número não é medido.',
               'responsavel', 'comercial', 'nao_medido_por', 'etapa_sem_uso',
               'o_que_fazer', 'Mover o card para a etapa de agendamento quando a consulta for marcada.')
           else jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
             'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true) end);
  end if;
$t$],
  array[$t$  if coalesce((v->>'tem_crm')::boolean, false)
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
$t$,
        $t$  -- [agendou-e-etapa-sem-uso] Fecharam 0: etapa de venda que ninguém usou em 180 dias não impede o "não medido".
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
$t$],
  array[$t$  elsif jsonb_typeof(v #> '{numeros,compareceram,valor}') = 'number'
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
$t$,
        $t$  elsif jsonb_typeof(v #> '{numeros,compareceram,valor}') = 'number'
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
                            s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}'))) then
$t$],
  array[$t$           'motivo_sem_dado', format('O CRM tem a etapa %s, mas nenhum card passou por ela no período, enquanto %s. A equipe não está usando essa etapa, então o número não é medido.',
             coalesce(v_motivo, 'de comparecimento'),
             concat_ws(' e ',
               case when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then (v #>> '{numeros,agendaram,valor}') || ' pessoas agendaram' end,
               case when coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then (v #>> '{numeros,fecharam,valor}') || ' fecharam' end)),
$t$,
        $t$           'motivo_sem_dado', case
             when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) + coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then
             format('O CRM tem a etapa %s, mas nenhum card passou por ela no período, enquanto %s. A equipe não está usando essa etapa, então o número não é medido.',
             coalesce(v_motivo, 'de comparecimento'),
             concat_ws(' e ',
               case when coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then (v #>> '{numeros,agendaram,valor}') || ' pessoas agendaram' end,
               case when coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) > 0 then (v #>> '{numeros,fecharam,valor}') || ' fecharam' end))
             else format('O CRM tem a etapa %s, mas nenhum card passou por ela nos últimos 90 dias. A equipe não está usando essa etapa, então o número não é medido.',
               coalesce(v_motivo, 'de comparecimento')) end /* [agendou-e-etapa-sem-uso] */,
$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_cards: a etapa atual do card (em_agendamento).
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.agendou_trocar('public.pacientes_cards(uuid)'::regprocedure, array[
  array[$t$k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)') as agendamento,$t$,
        $t$k.status_id = s.status_id and k.kpi = 'consulta_agendada') or (s.status_name ~* '{RE_AGENDOU}' and s.status_name !~* '{RE_NAO_AGENDOU}') /* [agendou-e-etapa-sem-uso] */) as agendamento,$t$]
]);
-- [trocas:fim]

-- Resultados guardados de pacientes_periodo saem: a próxima leitura recalcula com a regra nova.
delete from public.resultado_pronto where funcao = 'pacientes_periodo';
