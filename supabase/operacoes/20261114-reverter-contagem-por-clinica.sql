-- Reversão da migração 20261114110000_contagem_por_clinica_e_compareceu.sql. NÃO é migração.
-- Rodar só se a conferência de velocidade mostrar mais de 1,5x (supabase/audits/velocidade-conferencia.sql, seção 1:
-- média de alguma função acima de 1,5 vez a de antes). Só o João, no SQL editor de produção, o arquivo inteiro.
--
-- O que faz: em cada função marcada "[contagem-por-clinica]", troca cada trecho novo pelo trecho antigo, uma vez (o contrário da
-- migração, na ordem inversa). O texto de antes volta exatamente como estava, inclusive o que outras migrações
-- puseram na mesma função (o "Fecharam não se aplica" de 20261114100000). Se um trecho novo não aparecer exatamente
-- uma vez, para e nada muda. Função sem a marca é pulada: rodar de novo não muda nada. Depois apaga o resultado pronto
-- de pacientes_periodo (a próxima leitura recalcula).
-- Conferir depois: seção 0 da conferência de velocidade, "aplicada = false" nas 14 e o md5 igual ao de antes.
-- Arquivo gerado por scripts/test-contagem-por-clinica.ts --gerar-reversao (não editar à mão).
begin;

create or replace function pg_temp.contagem_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  re_compareceu constant text := '(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)';
  re_nao_compareceu constant text := '(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)';
  d text := pg_get_functiondef(p_fn);
  novo text;
  i int;
  n int;
begin
  if position('[contagem-por-clinica]' in d) = 0 then return; end if;
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    novo := replace(replace(p_trocas[i][2], '{RE_COMPARECEU}', re_compareceu), '{RE_NAO_COMPARECEU}', re_nao_compareceu);
    n := (length(d) - length(replace(d, novo, ''))) / length(novo);
    if n <> 1 then
      raise exception '[contagem-por-clinica] reversão de %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %',
        p_fn, i, n, left(novo, 120);
    end if;
    d := replace(d, novo, p_trocas[i][1]);
  end loop;
  if position('[contagem-por-clinica]' in d) > 0 then
    raise exception '[contagem-por-clinica] reversão de %: a marca continua no texto', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão repete este trecho, de [trocas:início] a [trocas:fim], com contagem_desfazer)
-- ---------------------------------------------------------------------------------------------------------------
-- 1 e 2) pacientes_periodo_calc: a regra de comparecimento nos 3 lugares e a trava de um dia por 30 dias.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contagem_desfazer('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
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
select pg_temp.contagem_desfazer('public.pacientes_cards(uuid)'::regprocedure, array[
  array[$t$             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as comparecimento$t$,
        $t$             or (s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */) as comparecimento$t$]
]);
select pg_temp.contagem_desfazer('public.crm_vendas_periodo(uuid,date,date)'::regprocedure, array[
  array[$t$and not coalesce(s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)', false), false)) as agendamento$t$,
        $t$and not coalesce(s.status_name ~* '{RE_COMPARECEU}' and s.status_name !~* '{RE_NAO_COMPARECEU}' /* [contagem-por-clinica] regra única */, false), false)) as agendamento$t$]
]);
select pg_temp.contagem_desfazer('public.crm_perfil_para_analise(uuid)'::regprocedure, array[
  array[$t$    cps.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)',$t$,
        $t$    (cps.status_name ~* '{RE_COMPARECEU}' and cps.status_name !~* '{RE_NAO_COMPARECEU}') /* [contagem-por-clinica] regra única */,$t$]
]);
-- relacionamento_pessoas: a regra e o recorte da clínica.
select pg_temp.contagem_desfazer('public.relacionamento_pessoas(uuid,uuid[])'::regprocedure, array[
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
select pg_temp.contagem_desfazer('public.jornada_resumo(uuid)'::regprocedure, array[
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
select pg_temp.contagem_desfazer('public.crm_base_viva(uuid)'::regprocedure, array[
  array[$t$    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active$t$]
]);
select pg_temp.contagem_desfazer('public.qualidade_leads_campanha(uuid,date,date)'::regprocedure, array[
  array[$t$    from crm_leads cl
    left join crm_pipeline_statuses cps$t$,
        $t$    from public.crm_leads_do_cliente(p_client) cl /* [contagem-por-clinica] recorte da clínica */
    left join crm_pipeline_statuses cps$t$]
]);
select pg_temp.contagem_desfazer('public.sap_sinais_auto(uuid,date,date)'::regprocedure, array[
  array[$t$    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */
    join conns on conns.id = cl.crm_connection_id
    left join etapas e$t$]
]);
select pg_temp.contagem_desfazer('public.sap_etapas_para_marcar(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$]
]);
select pg_temp.contagem_desfazer('public.crm_guia_dados(uuid)'::regprocedure, array[
  array[$t$    from crm_leads cl join conns on conns.id = cl.crm_connection_id$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ join conns on conns.id = cl.crm_connection_id$t$]
]);
select pg_temp.contagem_desfazer('public.crm_etapas_para_analise(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id
$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id
$t$]
]);
select pg_temp.contagem_desfazer('public.crm_etapas_kpi_para_analise(uuid)'::regprocedure, array[
  array[$t$  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$,
        $t$  left join public.crm_leads_do_cliente(p_client_id) cl /* [contagem-por-clinica] recorte da clínica */ on cl.crm_connection_id = cc.id and cl.removido_na_origem is null$t$]
]);
select pg_temp.contagem_desfazer('public.plano_ticket(uuid)'::regprocedure, array[
  array[$t$from crm_leads l
      where l.client_id = p_client$t$,
        $t$from public.crm_leads_do_cliente(p_client) l /* [contagem-por-clinica] recorte da clínica */
      where l.client_id = p_client$t$]
]);

-- [trocas:fim]

delete from public.resultado_pronto where funcao = 'pacientes_periodo';

drop function pg_temp.contagem_desfazer(regprocedure, text[]);

commit;
