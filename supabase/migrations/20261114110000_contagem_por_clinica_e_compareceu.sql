-- [contagem-por-clinica] Contagem por clínica e uma regra só de comparecimento (fase 03.1.1.1.1.1, plano 08).
-- Aplicada só pelo João (D-03), no SQL editor, entre begin; e commit;, DEPOIS de 20261114100000_origem_e_cobertura_do_crm.sql.
-- Agentes não rodam este arquivo. Velocidade antes e depois (D-07): supabase/audits/velocidade-conferencia.sql (só leitura).
-- Se alguma função ficar mais de 1,5x mais lenta na média: supabase/operacoes/20261114-reverter-contagem-por-clinica.sql.
--
-- O que muda (RESEARCH, achados 4 e 5):
--  1. Comparecimento: o nome da etapa que conta como "compareceu" passa a ser UMA regra, a mesma do guia
--     (RE_COMPARECEU e RE_NAO_COMPARECEU de src/lib/guia-crm.ts, copiadas literalmente; um teste compara as duas).
--     Antes eram 6 cópias de '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)' e uma variante
--     '(realizad|compareceu|atendid)'. Agora entram "Em acompanhamento", "Pós-procedimento", "Avaliação feita",
--     "Procedimento realizado"; saem "Não compareceu", "No-show", "Contato realizado", "Venda realizada" (a variante).
--     A expressão fica inline na consulta (nenhuma função nova por linha, D-07). Funções: pacientes_periodo_calc (3
--     lugares), pacientes_cards, crm_vendas_periodo, crm_perfil_para_analise, relacionamento_pessoas.
--  2. Trava "etapa sem uso" num dia só (histórico diário): o 0 de Compareceram vira nulo só se nenhum card entrou numa
--     etapa de comparecimento nos 30 dias até o fim do dia. Período de vários dias: igual a antes.
--  3. Conta compartilhada: os leitores de tela leem crm_leads pelo recorte da clínica (public.crm_leads_do_cliente,
--     SQL STABLE sem SET: o Postgres a expande dentro da consulta). Clínica sem filtro: resultado igual ao de antes.
--     jornada_resumo(uuid) (ld, por origem, leads_total, leads_sem_pessoa), crm_base_viva, qualidade_leads_campanha,
--     relacionamento_pessoas, sap_sinais_auto (cards do período), sap_etapas_para_marcar, crm_guia_dados,
--     crm_etapas_para_analise, crm_etapas_kpi_para_analise, plano_ticket.
--     Ficam como estão, de propósito:
--      - campanhas_base e fontes_base: sem chamador no app;
--      - sap_sinais_auto, parte "dias"/"importacao": a importação em massa é da conta inteira (por conexão);
--      - cobertura_periodo, client_sync_status: só primeira/última data;
--      - jornada_pessoa, links_funil, conteudo_comercial*: leem por pessoa/conversa já da clínica;
--      - funções de escrita e sync (vincular_*, sap_conversoes_*, kommo_*, crm_aplicar_*): leem por conexão de propósito;
--      - crm_cobertura e crm_canais_para_confirmar (20261114100000): já leem por crm_leads_do_cliente.
--  4. No fim, apaga do resultado_pronto os resultados de pacientes_periodo (Compareceram mudou); a próxima leitura
--     recalcula. Depois desta migração, rodar o preenchimento do histórico (20261113-preencher-historico-diario.sql).
--
-- Como: cada função é trocada pelo texto da definição atual (pg_get_functiondef). Cada trecho antigo tem de aparecer
-- exatamente uma vez; senão a migração para e nada muda (a transação inteira volta). Função que já tem a marca
-- "[contagem-por-clinica]" é pulada: rodar de novo não muda nada. Os trechos daqui não tocam no que 20261114100000 troca
-- (o bloco "Fecharam não se aplica" de pacientes_periodo_calc fica entre o Agendaram e o [tela-honesta]); valem com ou
-- sem aquela migração aplicada. Mesmas assinaturas, permissões, SECURITY DEFINER, search_path e volatilidade.
--
-- Reversão: supabase/operacoes/20261114-reverter-contagem-por-clinica.sql (troca cada trecho novo pelo antigo, uma
-- vez, e apaga de novo o resultado_pronto de pacientes_periodo).

-- Troca guardada. As duas expressões ficam aqui uma vez só: os trechos novos usam {RE_COMPARECEU} e {RE_NAO_COMPARECEU}.
create or replace function pg_temp.contagem_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  -- Cópia literal de RE_COMPARECEU.source e RE_NAO_COMPARECEU.source (src/lib/guia-crm.ts). Mudar os três juntos
  -- (guia, esta migração e o arquivo de reversão); scripts/test-contagem-por-clinica.ts confere.
  re_compareceu constant text := '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)';
  re_nao_compareceu constant text := '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)';
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[contagem-por-clinica]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception '[contagem-por-clinica] %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %',
        p_fn, i, n, left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1],
                 replace(replace(p_trocas[i][2], '{RE_COMPARECEU}', re_compareceu), '{RE_NAO_COMPARECEU}', re_nao_compareceu));
  end loop;
  if position('[contagem-por-clinica]' in d) = 0 then
    raise exception '[contagem-por-clinica] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão repete este trecho, de [trocas:início] a [trocas:fim], com contagem_desfazer)
-- ---------------------------------------------------------------------------------------------------------------
-- 1 e 2) pacientes_periodo_calc: a regra de comparecimento nos 3 lugares e a trava de um dia por 30 dias.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contagem_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  -- Eventos de entrada em etapa (ev_etapa_antigo).
  array[$t$             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)' as comparecimento$t$,
        $t$             or (s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */ as comparecimento$t$],
  -- A clínica tem etapa de comparecimento? (comp_cfg)
  array[$t$coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)')) as tem),$t$,
        $t$coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}' /* [contagem-por-clinica] */)) as tem),$t$],
  -- Trava "etapa sem uso" ([tela-honesta]): num dia só, olha os 30 dias até o fim do dia.
  array[$t$     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) + coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0 then$t$,
        $t$     and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) + coalesce((v #>> '{numeros,agendaram,valor}')::numeric, 0) > 0
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
                       s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}'))) then$t$],
  -- Nome das etapas no motivo da trava.
  array[$t$       and coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)');$t$,
        $t$       and coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}' /* [contagem-por-clinica] */);$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 1) A mesma regra nas outras quatro funções.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contagem_trocar('public.pacientes_cards(uuid)'::regprocedure, array[
  array[$t$             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as comparecimento$t$,
        $t$             or (s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */) as comparecimento$t$]
]);
select pg_temp.contagem_trocar('public.crm_vendas_periodo(uuid,date,date)'::regprocedure, array[
  array[$t$and not coalesce(s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)', false), false)) as agendamento$t$,
        $t$and not coalesce(s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}' /* [contagem-por-clinica] regra única */, false), false)) as agendamento$t$]
]);
select pg_temp.contagem_trocar('public.crm_perfil_para_analise(uuid)'::regprocedure, array[
  array[$t$    cps.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)',$t$,
        $t$    (cps.status_name ~* '{RE_COMPARECEU}' and cps.status_name !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */,$t$]
]);
-- relacionamento_pessoas: a regra e o recorte da clínica.
select pg_temp.contagem_trocar('public.relacionamento_pessoas(uuid,uuid[])'::regprocedure, array[
  array[$t$coalesce(cps.status_name, '') ~* '(realizad|compareceu|atendid)')) as compareceu$t$,
        $t$(coalesce(cps.status_name, '') ~* '{RE_COMPARECEU}' and coalesce(cps.status_name, '') !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */)) as compareceu$t$],
  array[$t$    from crm_leads l
    left join crm_pipeline_statuses cps$t$,
        $t$    from public.crm_leads_do_cliente(p_client) l /* [contagem-por-clinica] recorte da clínica */
    left join crm_pipeline_statuses cps$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Recorte da clínica nos leitores de tela.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contagem_trocar('public.jornada_resumo(uuid)'::regprocedure, array[
  array[$t$from public.crm_leads where client_id = p_client and removido_na_origem is null and pessoa_id is not null and not (select sim from tem) group by pessoa_id$t$,
        $t$from public.crm_leads_do_cliente(p_client) crm_leads /* [contagem-por-clinica] recorte da clínica */ where client_id = p_client and removido_na_origem is null and pessoa_id is not null and not (select sim from tem) group by pessoa_id$t$],
  array[$t$select l.pessoa_id, false as ganhou, null::numeric as receita from public.crm_leads l$t$,
        $t$select l.pessoa_id, false as ganhou, null::numeric as receita from public.crm_leads_do_cliente(p_client) l /* [contagem-por-clinica] */$t$],
  array[$t$ganho_pf
            from public.crm_leads l$t$,
        $t$ganho_pf
            from public.crm_leads_do_cliente(p_client) l /* [contagem-por-clinica] */$t$],
  array[$t$'leads_total', (select count(*) from public.crm_leads where client_id = p_client and removido_na_origem is null),$t$,
        $t$'leads_total', (select count(*) from public.crm_leads_do_cliente(p_client) crm_leads /* [contagem-por-clinica] */ where client_id = p_client and removido_na_origem is null),$t$],
  array[$t$'leads_sem_pessoa', (select count(*) from public.crm_leads where client_id = p_client and removido_na_origem is null and pessoa_id is null),$t$,
        $t$'leads_sem_pessoa', (select count(*) from public.crm_leads_do_cliente(p_client) crm_leads /* [contagem-por-clinica] */ where client_id = p_client and removido_na_origem is null and pessoa_id is null),$t$]
]);
select pg_temp.contagem_trocar('public.crm_base_viva(uuid)'::regprocedure, array[
  array[$t$    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active$t$]
]);
select pg_temp.contagem_trocar('public.qualidade_leads_campanha(uuid,date,date)'::regprocedure, array[
  array[$t$    from crm_leads cl
    left join crm_pipeline_statuses cps$t$,
        $t$    from public.crm_leads_do_cliente(p_client) cl /* [contagem-por-clinica] recorte da clínica */
    left join crm_pipeline_statuses cps$t$]
]);
select pg_temp.contagem_trocar('public.sap_sinais_auto(uuid,date,date)'::regprocedure, array[
  array[$t$    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */
    join conns on conns.id = cl.crm_connection_id
    left join etapas e$t$]
]);
select pg_temp.contagem_trocar('public.sap_etapas_para_marcar(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$]
]);
select pg_temp.contagem_trocar('public.crm_guia_dados(uuid)'::regprocedure, array[
  array[$t$    from crm_leads cl join conns on conns.id = cl.crm_connection_id$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ join conns on conns.id = cl.crm_connection_id$t$]
]);
select pg_temp.contagem_trocar('public.crm_etapas_para_analise(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id
$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id
$t$]
]);
select pg_temp.contagem_trocar('public.crm_etapas_kpi_para_analise(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$]
]);
select pg_temp.contagem_trocar('public.plano_ticket(uuid)'::regprocedure, array[
  array[$t$from crm_leads l
      where l.client_id = p_client$t$,
        $t$from public.crm_leads_do_cliente(p_client) l /* [contagem-por-clinica] recorte da clínica */
      where l.client_id = p_client$t$]
]);

-- [trocas:fim]

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Resultados de pacientes_periodo guardados com a regra antiga saem; a próxima leitura recalcula.
-- ---------------------------------------------------------------------------------------------------------------
delete from public.resultado_pronto where funcao = 'pacientes_periodo';

drop function pg_temp.contagem_trocar(regprocedure, text[]);
