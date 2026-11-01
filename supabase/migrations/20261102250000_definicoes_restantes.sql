-- Definições restantes (segunda auditoria independente de 01/11/2026). Não destrutiva: só funções.
--   1. qualidade_dados, "ganhos sem valor" (30 e 90 dias) e a contagem de ganhos de 90 dias: contam as vendas
--      FECHADAS na janela, pela mesma data que a tela de Pacientes e crm_vendas_periodo usam (crm_data_desfecho;
--      sem ela, o último evento "ganhou"; sem evento, a criação do card), e pela mesma regra de médico
--      (crm_leads_do_cliente). Antes contava cards CRIADOS na janela: Samira "7 de 7" com 47 vendas fechadas em
--      30 dias (2 com valor); HOMS "8 de 8" com 60 fechadas (3 com valor). Função nova: crm_ganhos_fechados.
--   2. Kommo, caixa "Incoming leads" (contato que chegou por chat/Instagram e ninguém da equipe aceitou ainda): o
--      card não conta como pessoa nova enquanto estiver nessa caixa (decisão padrão; a documentação do Kommo diz que
--      a etapa serve para o gestor aceitar ou recusar). Quando a equipe aceita, o card sai da etapa e a pessoa passa
--      a contar no dia em que o card foi criado. Pacientes do período mostra à parte "aguardando aceite: N".
--      Outubro: Lana 2.041 → 845 (1.196 aguardando), Samira 102 → 64 (38), HOMS 1.125 → 1.050 (75).
--      Vale para tudo que usa crm_pessoas_novas / crm_pessoas_leads (Pacientes, Resultado, ROI, Jornada, alertas).
--      Função nova: crm_status_aguardando_aceite.
--   3. pacientes_periodo, "Fecharam": quando o CRM do cliente nunca registrou um ganho (Digisac: Dra. Rafaela e
--      Dr. Antonione), o número é "não medido" com o motivo, e não 0 (Rafaela) nem "a equipe pode não estar marcando
--      o ganho" (Antonione). Flag nova no jsonb: crm_registra_venda.
--   4. pacientes_periodo, "Interagiram no Instagram": quando os comentários e reações pararam de chegar pelas
--      conversas antes do período (Doctor Creator: último em 18/07) e os posts tiveram comentários no período, o
--      número é "não medido" com a data em que parou, e não 0. Quem mandou mensagem pelo Direct continua em
--      "Mandaram mensagem" (por canal), e o motivo diz quantos foram.
--   5. pacientes_periodo, "Foram na consulta": "A equipe não está usando essa etapa" vira "O mais comum é a etapa não
--      estar sendo usada" (a causa é hipótese, não fato).
-- Como: funções alteradas pelo texto (DO-block com pg_get_functiondef e replace, mesmo padrão de 20261101130000 e
-- 20261102140000), sem mudar assinatura, segurança (security definer + checagem de acesso) nem grants. Cada bloco é
-- idempotente (marcador) e falha alto se o trecho esperado não existir.
-- Reversão: crm_pessoas_leads sem o join "st" e sem "and not public.crm_status_aguardando_aceite(...)";
-- qualidade_dados com os três trechos antigos (estão abaixo, em a1/a2/a3); pacientes_periodo sem o trecho entre
-- "-- [definicoes-restantes] início" e "-- [definicoes-restantes] fim"; drop das duas funções novas.

-- Vendas fechadas desde p_desde (todas as ganhas, com ou sem valor), datadas como em crm_vendas_periodo.
create or replace function public.crm_ganhos_fechados(p_client uuid, p_desde timestamptz)
returns table(crm_connection_id uuid, external_lead_id text, price numeric, fechado_em timestamptz)
language sql stable
set search_path = public, pg_temp
as $$
  select x.crm_connection_id, x.external_lead_id, x.price, x.fechado_em
    from (
      select cl.crm_connection_id, cl.external_lead_id, cl.price,
             coalesce(public.crm_data_desfecho(cl.provider, cl.raw_payload, 'won'), g.em, cl.occurred_at) as fechado_em
        from public.crm_leads_do_cliente(p_client) cl
        left join lateral (select max(e.ocorreu_em) as em from public.crm_lead_eventos e
                            where e.crm_connection_id = cl.crm_connection_id and e.external_lead_id = cl.external_lead_id
                              and e.tipo = 'ganhou') g on true
       where cl.client_id = p_client and cl.outcome = 'won' and cl.removido_na_origem is null
    ) x
   where x.fechado_em >= p_desde;
$$;
revoke all on function public.crm_ganhos_fechados(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_ganhos_fechados(uuid, timestamptz) to service_role;
comment on function public.crm_ganhos_fechados(uuid, timestamptz) is
  'Cards ganhos com fechamento desde p_desde: data da fonte (crm_data_desfecho), senão último evento ganhou, senão criação do card. Mesma data de crm_vendas_periodo (20261102250000).';

-- Card do Kommo parado na caixa de entrada ("Incoming leads"), ainda não aceito pela equipe.
create or replace function public.crm_status_aguardando_aceite(p_provider text, p_outcome text, p_status_name text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_provider = 'kommo' and coalesce(p_outcome, 'open') = 'open'
     and coalesce(p_status_name, '') ~* '^\s*(incoming leads|leads de entrada|etapa de leads de entrada|unsorted)\s*$';
$$;
revoke all on function public.crm_status_aguardando_aceite(text, text, text) from public, anon, authenticated;
grant execute on function public.crm_status_aguardando_aceite(text, text, text) to service_role;
comment on function public.crm_status_aguardando_aceite(text, text, text) is
  'Kommo: card aberto na etapa Incoming leads (não aceito). Não conta como pessoa nova enquanto estiver lá (20261102250000).';

-- 2. Pessoas novas: card na caixa de entrada do Kommo não conta.
do $migra$
declare
  d text := pg_get_functiondef('public.crm_pessoas_leads(uuid)'::regprocedure);
  a1 text := $a$coalesce(fp.papel, 'captacao') not in ('compra', 'base'),$a$;
  n1 text := $n$coalesce(fp.papel, 'captacao') not in ('compra', 'base')
           and not public.crm_status_aguardando_aceite(cl.provider, cl.outcome, st.status_name),$n$;
  a2 text := E'  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id\n';
  n2 text := E'  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id\n'
          || E'  left join crm_pipeline_statuses st on st.crm_connection_id = cl.crm_connection_id and st.pipeline_id = cl.pipeline_id and st.status_id = cl.status_id\n';
begin
  if position('crm_status_aguardando_aceite' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then
    raise exception 'crm_pessoas_leads: trechos esperados não encontrados; a função mudou e esta migração precisa ser revista';
  end if;
  execute replace(replace(d, a1, n1), a2, n2);
end
$migra$;

-- 1. qualidade_dados: ganhos pela data de fechamento.
do $migra$
declare
  d text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  a1 text := E'         count(*) filter (where l.outcome = ''won'')\n    into v_leads90, v_sem_origem, v_inferidos, v_ganhos90';
  n1 text := E'         (select count(*) from public.crm_ganhos_fechados(p_client_id, now() - interval ''90 days''))\n    into v_leads90, v_sem_origem, v_inferidos, v_ganhos90';
  a2 text := E'    select count(*) g, count(*) filter (where coalesce(price, 0) > 0) gv\n      from crm_leads\n     where client_id = p_client_id and removido_na_origem is null and outcome = ''won''\n       and occurred_at >= now() - interval ''30 days''\n';
  n2 text := E'    select count(*) g, count(*) filter (where coalesce(price, 0) > 0) gv\n      from public.crm_ganhos_fechados(p_client_id, now() - interval ''30 days'')\n';
  a3 text := E'    select count(*) filter (where l.outcome = ''won'') as g,\n           count(*) filter (where l.outcome = ''won'' and l.price > 0) as gv\n    from crm_leads l\n    where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval ''90 days''\n';
  n3 text := E'    select count(*) as g, count(*) filter (where coalesce(price, 0) > 0) as gv\n    from public.crm_ganhos_fechados(p_client_id, now() - interval ''90 days'')\n';
  -- Textos: dizer que a janela é a do fechamento.
  a4 text := $a$'titulo', format('%s de %s ganhos dos últimos 30 dias estão sem valor', r.g - r.gv, r.g),
      'evidencia', format('Últimos 30 dias: %s ganhos, só %s com valor preenchido.', r.g, r.gv),$a$;
  n4 text := $n$'titulo', format('%s de %s vendas fechadas nos últimos 30 dias estão sem valor', r.g - r.gv, r.g),
      'evidencia', format('Fechadas nos últimos 30 dias (pela data de fechamento no CRM): %s ganhos, só %s com valor preenchido.', r.g, r.gv),$n$;
  a5 text := $a$'titulo', format('%s de %s ganhos dos últimos 90 dias estão sem valor', r.g - r.gv, r.g),
        'evidencia', format('%s leads marcados como ganho em 90 dias; só %s têm valor preenchido.', r.g, r.gv),$a$;
  n5 text := $n$'titulo', format('%s de %s vendas fechadas nos últimos 90 dias estão sem valor', r.g - r.gv, r.g),
        'evidencia', format('%s ganhos fechados nos últimos 90 dias (pela data de fechamento no CRM); só %s têm valor preenchido.', r.g, r.gv),$n$;
begin
  if position('crm_ganhos_fechados' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 or position(a5 in d) = 0 then
    raise exception 'qualidade_dados: trechos de ganhos (30/90 dias) não encontrados; a função mudou e esta migração precisa ser revista';
  end if;
  execute replace(replace(replace(replace(replace(d, a1, n1), a2, n2), a3, n3), a4, n4), a5, n5);
end
$migra$;

-- 3 e 4. pacientes_periodo: "aguardando aceite", "Fecharam" sem venda registrada e Instagram que parou de chegar.
do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  a0 text := E'  v_motivo text;\n';
  n0 text := E'  v_motivo text;\n  v_dr_n bigint;\n  v_dr_ult timestamptz;\n  v_dr_digisac boolean;\n';
  a1 text := E'  return v;\nend;';
  n1 text := $n$  -- [definicoes-restantes] início (20261102250000)
  -- Kommo: cards criados no período que estão na caixa de entrada (Incoming leads), fora de "Pessoas novas".
  if jsonb_typeof(v #> '{numeros,leads_novos,valor}') = 'number' then
    select count(distinct coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)))
      into v_dr_n
      from public.crm_leads_do_cliente(p_client) cl
      join crm_pipeline_statuses st on st.crm_connection_id = cl.crm_connection_id and st.pipeline_id = cl.pipeline_id and st.status_id = cl.status_id
     where cl.client_id = p_client and cl.removido_na_origem is null and cl.provider = 'kommo'
       and cl.occurred_at >= v_ini and cl.occurred_at < v_fim
       and public.crm_status_aguardando_aceite(cl.provider, cl.outcome, st.status_name);
    if v_dr_n > 0 then
      v := jsonb_set(v, '{numeros,leads_novos,aguardando_aceite}', to_jsonb(v_dr_n));
    end if;
  end if;
  -- "Fecharam": CRM que nunca registrou ganho não mede venda (Digisac não tem ganho nem perda).
  if coalesce((v->>'tem_crm')::boolean, false) and (v #>> '{numeros,fecharam,fonte}') = 'crm'
     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) = 0
     and (v #> '{numeros,fecharam,medido_desde}') is null
     and (v #>> '{numeros,fecharam,alerta}') is distinct from 'crm-fonte-vendas-parada'
     and not exists (select 1 from public.crm_leads_do_cliente(p_client) cl where cl.client_id = p_client and cl.outcome = 'won') then
    select coalesce(bool_and(cc.provider = 'digisac'), false) into v_dr_digisac
      from crm_connections cc where cc.client_id = p_client and cc.active;
    v := jsonb_set(v, '{crm_registra_venda}', 'false'::jsonb);
    v := jsonb_set(v, '{numeros,fecharam}', jsonb_build_object('valor', null, 'fonte', 'crm',
           'motivo_sem_dado', case when v_dr_digisac
             then 'O Digisac não registra venda: os atendimentos não têm ganho nem perda, então não dá para contar quem fechou.'
             else 'O CRM nunca registrou uma venda (nenhum card marcado como ganho), então não dá para contar quem fechou.' end,
           'responsavel', case when v_dr_digisac then 'equipe_hub' else 'comercial' end,
           'nao_medido_por', 'crm_sem_venda',
           'o_que_fazer', case when v_dr_digisac
             then 'Equipe Doctor Creator: combinar com a clínica de onde vem o registro de venda (planilha de vendas, checkout ou outro CRM) e ligar essa fonte ao Nexo.'
             else 'Marcar o card como ganho (com o valor) quando o paciente fechar.' end));
  end if;
  -- "Interagiram no Instagram": comentários e reações pararam de chegar pelas conversas antes do período.
  if (v #>> '{numeros,engajaram_instagram,valor}') = '0' then
    select max(m.enviada_em) into v_dr_ult
      from mensagens m join conversas cv on cv.id = m.conversa_id
     where m.client_id = p_client and cv.client_id = p_client and cv.canal = 'instagram'
       and m.direcao = 'entrada' and public.mensagem_eh_interacao(m.tipo);
    if v_dr_ult is not null and v_dr_ult < v_ini then
      select count(*) into v_ig from instagram_comments ic
       where ic.client_id = p_client and ic.commented_at >= v_ini and ic.commented_at < v_fim;
      if v_ig > 0 then
        v := jsonb_set(v, '{numeros,engajaram_instagram}', jsonb_build_object('valor', null, 'fonte', 'conversas',
               'motivo_sem_dado', format('Os comentários e reações do Instagram pararam de chegar pelas conversas em %s. No período, os posts tiveram %s comentários, mas sem ligar cada pessoa a uma conversa.',
                 to_char(v_dr_ult at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_ig)
                 || case when coalesce((v #>> '{numeros,mandaram_mensagem,por_canal,instagram}')::int, 0) > 0
                      then format(' Quem mandou mensagem pelo Direct no período está em "Mandaram mensagem" (%s pelo Instagram).', v #>> '{numeros,mandaram_mensagem,por_canal,instagram}')
                      else '' end,
               'responsavel', 'equipe_hub', 'nao_medido_por', 'fonte_parou',
               'parou_em', (v_dr_ult at time zone 'America/Sao_Paulo')::date, 'comentarios_instagram', v_ig));
      end if;
    end if;
  end if;
  -- [definicoes-restantes] fim
  return v;
end;$n$;
begin
  if position('[definicoes-restantes] início' in d) > 0 then return; end if;
  if position(a0 in d) = 0 or position(a1 in d) = 0 then
    raise exception 'pacientes_periodo: trechos "v_motivo text;" ou "return v; end;" não encontrados; revisar esta migração';
  end if;
  if length(d) - length(replace(d, a1, '')) <> length(a1) or length(d) - length(replace(d, a0, '')) <> length(a0) then
    raise exception 'pacientes_periodo: trecho de âncora aparece mais de uma vez; revisar esta migração';
  end if;
  -- Frase que afirmava causa sem confirmação (auditoria, critério 6): agora é hipótese.
  d := replace(d, 'A equipe não está usando essa etapa, então o número não é medido.',
                  'O mais comum é a etapa não estar sendo usada; por isso o número não é medido.');
  execute replace(replace(d, a0, n0), a1, n1);
end
$migra$;
