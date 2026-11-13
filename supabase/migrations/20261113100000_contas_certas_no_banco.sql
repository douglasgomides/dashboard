-- Contas certas no banco: regras de contagem que erravam do nosso lado (fase 03.1.1.1.1, plano 05).
-- Aplicada só pelo João (D-03); agentes não rodam este arquivo. Antes e depois: supabase/audits/contas-certas-conferencia.sql
-- (só leitura). Marca de tudo que muda aqui: "[contas-certas]" (rodar de novo não muda nada).
--
-- 1) Perfil de etapa: etapa sem papel volta a contar pelo nome (ou pela marcação de KPI).
--    Numa conexão com perfil, a etapa sem papel tinha papel '' e crm_papel_conta / crm_perfil_conta devolviam false.
--    Como as telas fazem coalesce(<papel>, <nome ou KPI>), o nome ("Consulta Agendada") deixava de ser lido e o
--    Agendou ficava abaixo do real. Agora, para os conceitos do funil (agendou, consulta_agendada, compareceu,
--    em_atendimento), etapa sem papel devolve null e vale a regra pelo nome. Para ganho, perdido, ignorar e novo
--    continua false: etapa sem papel nunca é venda. Para tirar uma etapa das contas, o papel 'ignorar' explícito.
--    crm_perfil_etapas_sql e crm_perfil_papel continuam devolvendo '' (a tela do perfil mostra "sem papel").
--    Quem usava o resultado sem coalesce (o "agendou" de campanhas_base, conteudo_comercial,
--    conteudo_comercial_profundo, jornada_funil, qualidade_leads_campanha e o "agendados" de crm_visoes_comerciais e
--    crm_diagnostico_comercial) passa a cair no mesmo nome da etapa que já usa quando a conexão não tem perfil.
--
-- 2) Origem por pessoa: nova crm_origem_da_pessoa, usada por Pacientes e pelo retorno do investimento. Pacientes
--    dizia "Sem origem" para a origem que a classificação não conhece; o ROI mostrava a origem bruta. Agora as duas
--    dizem "Outra: <origem bruta>" (em Pacientes, conta em "outras").
-- 3) pacientes_periodo_calc: Agendaram "não se aplica" quando o CRM não tem etapa de agendamento (antes, um 0 medido
--    falso); Fecharam com as regras do período (antes, regras de período inteiro aplicadas a um dia deixavam o dia
--    sem número); origem por pessoa.
-- 4) roi_periodo_calc: origem por pessoa.
-- 5) qualidade_dados_calc: os testes do CRM leem só o recorte da clínica numa conta compartilhada com filtro, e
--    "ganho sem valor" não sai duas vezes para a mesma causa.
-- 6) fontes_base: "dado até" dos anúncios só das contas ativas; planilha de anúncios sem endereço ganha motivo.
-- 7) Apaga os resultados guardados (resultado_pronto, resultado_pronto_geral) das funções que mudaram.
--
-- Funções trocadas pelo texto da definição atual (pg_get_functiondef): cada trecho antigo tem de aparecer exatamente
-- uma vez, senão a migração para e nada muda (a transação inteira volta).
--
-- Reversão: recriar crm_papel_conta e crm_perfil_conta pela definição de 20261104100000_perfil_da_clinica.sql e
-- fontes_base pela de 20261029160000_fontes_e_numeros_unicos.sql (com o trecho de 20261102190000); nas funções
-- trocadas pelo texto, trocar de volta os trechos marcados "[contas-certas]" (o texto anterior está nas listas de
-- troca abaixo, primeiro elemento de cada par); depois, drop function public.crm_origem_da_pessoa(text[], text[]) e
-- apagar de novo os resultados guardados.

-- Troca guardada: aplica as trocas de uma função só se cada trecho antigo existir uma vez; já aplicada, não faz nada.
create or replace function pg_temp.contas_certas_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[contas-certas]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception '%: trecho % aparece % vezes (esperado 1): %', p_fn, i, n, left(p_trocas[i][1], 100);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position('[contas-certas]' in d) = 0 then
    raise exception '%: a troca não deixou a marca [contas-certas]', p_fn;
  end if;
  execute d;
end
$f$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Perfil de etapa: etapa sem papel conta pelo nome nos conceitos do funil.
-- ---------------------------------------------------------------------------------------------------------------

-- A etapa conta para o conceito? null = conexão sem perfil, ou etapa sem papel num conceito do funil (quem chama usa
-- a regra pelo nome). [contas-certas]
create or replace function public.crm_perfil_conta(p_conn uuid, p_pipeline text, p_status text, p_conceito text)
returns boolean
language sql stable set search_path = public, pg_temp
as $$
  select case when x.papel is null then null
    -- [contas-certas] etapa sem papel: nos conceitos do funil vale o nome; ganho, perdido, ignorar e novo seguem false.
    when x.papel = '' and p_conceito in ('agendou', 'consulta_agendada', 'compareceu', 'em_atendimento') then null
    when p_conceito = 'agendou' then x.papel in ('agendado', 'compareceu', 'venda', 'posvenda')
    when p_conceito = 'consulta_agendada' then x.papel = 'agendado'
    when p_conceito = 'compareceu' then x.papel in ('compareceu', 'venda', 'posvenda')
    when p_conceito = 'em_atendimento' then x.papel = 'em_atendimento'
    when p_conceito = 'ganho' then x.papel = 'venda'
    when p_conceito = 'perdido' then x.papel = 'perdido'
    when p_conceito = 'ignorar' then x.papel = 'ignorar'
    when p_conceito = 'novo' then x.papel = 'novo'
    else false end
  from (select public.crm_perfil_papel(p_conn, p_pipeline, p_status) as papel) x
$$;

-- Papel já encontrado → conta para o conceito? Expressão pura (o Postgres a incorpora na consulta). Mesma regra de
-- crm_perfil_conta: null sem perfil, e null para etapa sem papel ('') nos conceitos do funil. [contas-certas]
create or replace function public.crm_papel_conta(p_papel text, p_conceito text)
returns boolean
language sql immutable
as $$
  -- [contas-certas] etapa sem papel ('') nos conceitos do funil: null (vale o nome).
  select case when p_papel is null then null
    when p_papel = '' and p_conceito in ('agendou', 'consulta_agendada', 'compareceu', 'em_atendimento') then null
    else p_papel = any (case p_conceito
      when 'agendou' then array['agendado', 'compareceu', 'venda', 'posvenda']
      when 'consulta_agendada' then array['agendado']
      when 'compareceu' then array['compareceu', 'venda', 'posvenda']
      when 'em_atendimento' then array['em_atendimento']
      when 'ganho' then array['venda']
      when 'perdido' then array['perdido']
      when 'ignorar' then array['ignorar']
      when 'novo' then array['novo']
      else array[]::text[] end) end
$$;

-- Mesmas permissões de 20261104100000.
revoke all on function public.crm_perfil_conta(uuid, text, text, text) from public, anon;
grant execute on function public.crm_perfil_conta(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.crm_papel_conta(text, text) from public, anon;
grant execute on function public.crm_papel_conta(text, text) to authenticated, service_role;

-- Quem usava o "agendou" do papel sem coalesce: com null, o card de etapa sem papel virava "não sei" (null) em vez de
-- cair no nome da etapa. Cada um passa a usar o mesmo nome que já usa quando a conexão não tem perfil.
select pg_temp.contas_certas_trocar('public.campanhas_base(uuid)'::regprocedure, array[
  array[$t$else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou$t$,
        $t$else l.venda_pf or coalesce(public.crm_papel_conta(l.papel, 'agendou'), coalesce(l.etapa, '') ~* '(agendad|confirmad|realizad|compareceu)') /* [contas-certas] etapa sem papel: vale o nome */ end as agendou$t$]
]);
select pg_temp.contas_certas_trocar('public.qualidade_leads_campanha(uuid,date,date)'::regprocedure, array[
  array[$t$else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou$t$,
        $t$else l.venda_pf or coalesce(public.crm_papel_conta(l.papel, 'agendou'), coalesce(l.etapa, '') ~* '(agendad|confirmad|realizad|compareceu)') /* [contas-certas] etapa sem papel: vale o nome */ end as agendou$t$]
]);
select pg_temp.contas_certas_trocar('public.conteudo_comercial(uuid,date,date)'::regprocedure, array[
  array[$t$else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou$t$,
        $t$else pvc.lead_id is not null or coalesce(public.crm_papel_conta(pe.papel, 'agendou'), coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)') /* [contas-certas] etapa sem papel: vale o nome */ end) as agendou$t$]
]);
select pg_temp.contas_certas_trocar('public.conteudo_comercial_profundo(uuid,date,date)'::regprocedure, array[
  array[$t$else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou$t$,
        $t$else pvc.lead_id is not null or coalesce(public.crm_papel_conta(pe.papel, 'agendou'), coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)') /* [contas-certas] etapa sem papel: vale o nome */ end) as agendou$t$]
]);
select pg_temp.contas_certas_trocar('public.jornada_funil(uuid,date,date)'::regprocedure, array[
  array[$t$else venda_pf or public.crm_papel_conta(papel, 'agendou') end) agendados$t$,
        $t$else venda_pf or coalesce(public.crm_papel_conta(papel, 'agendou'), coalesce(etapa, '') ~* '(agendad|confirmad|realizad|compareceu)') /* [contas-certas] etapa sem papel: vale o nome */ end) agendados$t$]
]);
-- Coortes do CRM: sem papel, vale "consulta" (que já cai no nome); ganho só conta como agendado quando a conexão não
-- tem perfil (p_ganho null), como antes. Etapa com papel não muda.
select pg_temp.contas_certas_trocar('public.crm_visoes_comerciais(uuid,date,date)'::regprocedure, array[
  array[$t$coalesce(p_agendou, consulta or outcome = 'won')$t$,
        $t$coalesce(p_agendou, consulta or (outcome = 'won' and p_ganho is null)) /* [contas-certas] etapa sem papel: vale o nome */$t$]
]);
-- Diagnóstico: o papel de "agendou" da etapa sem papel vira "consulta" (que já cai no nome). Sem perfil, o resultado
-- é o mesmo de antes (consulta entra no coalesce de trás de qualquer jeito).
select pg_temp.contas_certas_trocar('public.crm_diagnostico_comercial(uuid,date,date)'::regprocedure, array[
  array[$t$'agendados', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho,$t$,
        $t$'agendados', count(*) filter (where coalesce(coalesce(p_agendou, consulta) /* [contas-certas] etapa sem papel: vale o nome */ or ja_agendou or p_ganho,$t$],
  array[$t$'agendados_provaveis', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho,$t$,
        $t$'agendados_provaveis', count(*) filter (where coalesce(coalesce(p_agendou, consulta) or ja_agendou or p_ganho,$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Origem por pessoa: uma regra só para Pacientes e para o retorno do investimento.
--    Card de anúncio ganha; senão a primeira origem classificada; senão "Outra: <origem bruta>"; sem nada, null
--    (quem chama escreve "Sem origem"). Origem bruta que só diz que não há origem ("Tipo · ...", etiqueta do Nexo,
--    "sem origem", "não documentado") não vira "Outra:", as mesmas que crm_origem_classifica já descarta.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_origem_da_pessoa(p_classes text[], p_brutas text[])
returns text
language sql immutable set search_path = public, pg_temp
as $$
  -- [contas-certas]
  select coalesce(
    case when 'Anúncio' = any (p_classes) then 'Anúncio' end,
    (select c from unnest(p_classes) with ordinality x(c, i) where c is not null order by i limit 1),
    (select 'Outra: ' || btrim(b) from unnest(p_brutas) with ordinality x(b, i)
      where nullif(btrim(b), '') is not null
        and btrim(b) !~* '^tipo\s*[·:-]' and btrim(b) !~* '^nexo\M'
        and btrim(b) !~* '(n[aã]o documentad|sem origem|origem desconhecid)'
      order by i limit 1))
$$;
revoke all on function public.crm_origem_da_pessoa(text[], text[]) from public, anon;
grant execute on function public.crm_origem_da_pessoa(text[], text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) pacientes_periodo_calc: Agendaram "não se aplica", Fecharam pelas regras do período e a origem por pessoa.
--    Não mexe nos dois ramos de Agendaram de um dia só (etapa atual do card e leitura das conversas): esses são da
--    migração seguinte (20261113110000_historico_diario_por_entrada.sql).
--    Fecharam (antes, regras de período aplicadas a um dia só deixavam o dia sem número):
--    - "o CRM marca como ganho o agendamento": só com ganho DATADO no período (a mesma data das vendas: data real do
--      ganho da fonte, senão o evento "ganhou" no período, senão a criação), e não com um card antigo da base.
--    - "50 ou mais pessoas novas e nenhuma venda": só em período de 7 dias ou mais.
--    - "cards encerrados sem dizer o resultado": em período curto, só sem nenhuma venda medida nos 7 dias que
--      terminam no fim do período. Fora disso, um dia sem venda é 0 medido.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contas_certas_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  -- Ganho nos 7 dias que terminam no fim do período, por card (mesma tabela de eventos de g_jan).
  array[$t$filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) as no_periodo$t$,
        $t$filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) as no_periodo,
           -- [contas-certas] ganho nos 7 dias que terminam no fim do período (regra do "encerrado sem resultado").
           max(e.ocorreu_em) filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_ate - 6 and p_ate) as na_semana$t$],
  array[$t$  ck_cob as materialized (select * from public.checkout_cobertura(p_client)),$t$,
        $t$  -- [contas-certas] Alguma venda medida nos 7 dias que terminam no fim do período? Só decide o "encerrado sem
  -- resultado" em período curto (um dia do histórico). Mesmas datas de venda de vend_antigo, do perfil e do checkout.
  -- Só é lida quando o ramo do "encerrado sem resultado" é avaliado.
  venda_7d as (
    select exists (
             select 1 from cards c
               left join g_jan g on g.cx = c.cx and g.ext = c.ext
               left join g_real r on r.id = c.id and r.em is not null
              where c.outcome = 'won' and not (c.em_agendamento and coalesce(c.price, 0) = 0)
                and not (c.prospec and coalesce(c.price, 0) = 0)
                and not exists (select 1 from pe_pp x where x.crm_connection_id = c.cx)
                and case when r.em is not null then (r.em at time zone 'America/Sao_Paulo')::date between p_ate - 6 and p_ate
                         else (g.na_semana is not null or (g.n is null and c.d between p_ate - 6 and p_ate)) end)
        or exists (select 1 from public.crm_perfil_vendas(p_client) v
                    where not v.copia and v.quando >= ((p_ate - 6)::timestamp at time zone 'America/Sao_Paulo') and v.quando < v_fim)
        or exists (select 1 from vendas_checkout v
                    where v.client_id = p_client and v.status in ('paid', 'in_protest')
                      and v.pago_em >= ((p_ate - 6)::timestamp at time zone 'America/Sao_Paulo') and v.pago_em < v_fim) as sim
  ),
  ck_cob as materialized (select * from public.checkout_cobertura(p_client)),$t$],
  array[$t$           exists (select 1 from cards c where c.outcome = 'won' and c.em_agendamento and coalesce(c.price, 0) = 0) as ganho_e_agendamento,$t$,
        $t$           -- [contas-certas] só ganhos datados no período (a mesma data das vendas), não um card antigo da base.
           exists (select 1 from cards c
                     left join g_jan g on g.cx = c.cx and g.ext = c.ext
                     left join g_real r on r.id = c.id and r.em is not null
                    where c.outcome = 'won' and c.em_agendamento and coalesce(c.price, 0) = 0
                      and case when r.em is not null then (r.em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
                               else (g.no_periodo is not null or (g.n is null and c.d between p_de and p_ate)) end) as ganho_e_agendamento,$t$],
  array[$t$        when not exists (select 1 from vendas) and (select count(*) from leads_novos) >= 50$t$,
        $t$        when not exists (select 1 from vendas) and p_ate - p_de >= 6 /* [contas-certas] só em período de 7 dias ou mais */
          and (select count(*) from leads_novos) >= 50$t$],
  array[$t$        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0$t$,
        $t$        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0
          and (p_ate - p_de >= 6 or not (select sim from venda_7d)) /* [contas-certas] dia sem venda com venda na semana: 0 medido */$t$],
  -- Origem por pessoa: todos os cards da pessoa, do mais antigo ao mais novo (a mesma regra do ROI).
  array[$t$  novas_u as (
    select u, min(primeiro) as primeiro, bool_and(so_prospec) as so_prospec,
           (array_agg(origem_crm order by origem_crm is null))[1] as origem_crm
      from novas group by u
  ),$t$,
        $t$  -- [contas-certas] Origem por pessoa (crm_origem_da_pessoa, a mesma regra do retorno do investimento): card de
  -- anúncio ganha; senão a origem classificada; senão "Outra: <origem bruta>". Todos os cards da pessoa, do mais antigo.
  origem_u as (
    select c.u, public.crm_origem_da_pessoa(array_agg(c.origem order by c.occurred_at, c.id),
                                            array_agg(cl.source order by c.occurred_at, c.id)) as origem
      from cards c left join crm_leads cl on cl.id = c.id
     where c.u in (select u from novas)
     group by c.u
  ),
  novas_u as (
    select n.u, min(n.primeiro) as primeiro, bool_and(n.so_prospec) as so_prospec, min(o.origem) as origem_crm
      from novas n left join origem_u o on o.u = n.u
     group by n.u
  ),$t$],
  -- A origem classificada do CRM vem antes da leitura da conversa; a origem bruta ("Outra: ...") vem depois dela.
  array[$t$             when n.origem_crm is not null then 'outras'$t$,
        $t$             when n.origem_crm is not null and n.origem_crm not like 'Outra: %' then 'outras'$t$],
  array[$t$             else 'sem_origem'
           end as origem,
           case when n.origem_crm is not null then 'crm' when i.origem in ('anuncio', 'instagram', 'indicacao') then 'conversa' end as origem_fonte$t$,
        $t$             when n.origem_crm like 'Outra: %' then 'outras' /* [contas-certas] origem bruta que a regra não conhece */
             else 'sem_origem'
           end as origem,
           case when n.origem_crm is not null and n.origem_crm not like 'Outra: %' then 'crm'
                when i.origem in ('anuncio', 'instagram', 'indicacao') then 'conversa'
                when n.origem_crm is not null then 'crm' end as origem_fonte$t$],
  -- Agendaram "não se aplica" (mesma ideia do comparecimento em [tela-honesta]).
  array[$t$  -- [tela-honesta] início$t$,
        $t$  -- [contas-certas] Agendaram "não se aplica": o CRM ligado não tem etapa de agendamento (nome, KPI ou papel do
  -- perfil) e nenhuma conversa do período foi lida como "agendou". Um 0 aqui seria falso e inverteria o funil.
  -- Com etapa de agendamento e nenhuma entrada no período, o 0 continua medido. Nunca apaga um número acima de 0.
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
                or s.status_name ~* '(agendad|agendament)'))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'agendou') then
    v := jsonb_set(v, '{numeros,agendaram}', jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
           'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true));
  end if;
  -- [tela-honesta] início$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 4) roi_periodo_calc: a origem da venda segue crm_origem_da_pessoa (origem bruta vira "Outra: <texto>", como em
--    Pacientes). O ROI continua contando vendas e Pacientes continua contando pessoas: as unidades diferem de
--    propósito.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contas_certas_trocar('public.roi_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$        when anuncio then 'Anúncio'
        when origem_classe is not null then origem_classe
        when origem_bruta is not null then origem_bruta
$t$,
        $t$        -- [contas-certas] a mesma regra de Pacientes: anúncio em qualquer card da pessoa; senão a classe do card;
        -- senão "Outra: <origem bruta>".
        when public.crm_origem_da_pessoa(array[case when anuncio then 'Anúncio' end, origem_classe], array[origem_bruta]) is not null
          then public.crm_origem_da_pessoa(array[case when anuncio then 'Anúncio' end, origem_classe], array[origem_bruta])
$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 5) qualidade_dados_calc: os testes do CRM leem só o recorte da clínica (crm_leads_do_cliente) numa conta de CRM
--    compartilhada com filtro, e "ganho sem valor" sai uma vez só (o de 30 dias só quando o de 90 dias não saiu).
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.contas_certas_trocar('public.qualidade_dados_calc(uuid)'::regprocedure, array[
  array[$t$  from crm_leads where client_id = p_client_id and removido_na_origem is null;$t$,
        $t$  from public.crm_leads_do_cliente(p_client_id) crm_leads where client_id = p_client_id and removido_na_origem is null; -- [contas-certas] recorte da clínica$t$],
  array[$t$  from crm_leads l
  left join crm_canais_origem co$t$,
        $t$  from public.crm_leads_do_cliente(p_client_id) l
  left join crm_canais_origem co$t$],
  array[$t$(select count(*) from crm_leads o$t$,
        $t$(select count(*) from public.crm_leads_do_cliente(p_client_id) o$t$],
  array[$t$      join crm_leads cl on cl.crm_connection_id = e.crm_connection_id and cl.external_lead_id = e.external_lead_id$t$,
        $t$      join public.crm_leads_do_cliente(p_client_id) cl on cl.crm_connection_id = e.crm_connection_id and cl.external_lead_id = e.external_lead_id$t$],
  array[$t$not exists (select 1 from crm_leads w where w.client_id = p_client_id$t$,
        $t$not exists (select 1 from public.crm_leads_do_cliente(p_client_id) w where w.client_id = p_client_id$t$],
  array[$t$        select l.id::text, l.price from crm_leads l$t$,
        $t$        select l.id::text, l.price from public.crm_leads_do_cliente(p_client_id) l$t$],
  array[$t$      from crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = 'won' and coalesce(price, 0) = 0$t$,
        $t$      from public.crm_leads_do_cliente(p_client_id) crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = 'won' and coalesce(price, 0) = 0$t$],
  array[$t$    from crm_leads l
    where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days'$t$,
        $t$    from public.crm_leads_do_cliente(p_client_id) l
    where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days'$t$],
  array[$t$  return out;
end;$t$,
        $t$  -- [contas-certas] Uma causa, um problema: com o "ganho sem valor" de 90 dias, o de 30 dias sai.
  if exists (select 1 from jsonb_array_elements(out) x where x->>'id' = 'crm-ganho-sem-valor') then
    select coalesce(jsonb_agg(t.x order by t.o), '[]'::jsonb) into out
      from jsonb_array_elements(out) with ordinality t(x, o)
     where t.x->>'id' <> 'crm-ganho-sem-valor-30d';
  end if;
  return out;
end;$t$]
]);

-- ---------------------------------------------------------------------------------------------------------------
-- 6) fontes_base (mesma assinatura, mesmas colunas, mesmas permissões; corpo = o de 20261029160000 com o trecho de
--    20261102190000):
--    - o "dado até" dos anúncios do Meta vem só das contas ativas em client_ad_accounts (antes, de todas, inclusive
--      as desativadas); sem nenhuma linha em client_ad_accounts, da conta de clients.meta_ad_account_id; sem as
--      duas, como antes.
--    - planilha de anúncios sem endereço cadastrado e sem conta do Meta, só com linhas antigas: ganha o motivo
--      "Planilha de anúncios sem endereço cadastrado: só há linhas antigas." com dono 'manual' (tarefa da equipe).
--      Um motivo já gravado em sync_status vale mais.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.fontes_base(p_client_id uuid)
returns table(client_id uuid, fonte text, cadastro boolean, planilha boolean, data_ate date, last_attempt_at timestamp with time zone,
              last_success_at timestamp with time zone, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  -- [contas-certas] anúncios do Meta só das contas ativas; planilha sem endereço ganha motivo com dono 'manual'.
  with c as (
    select id, meta_ad_account_id, ads_planilha_url, wts_company_id, digisac_url from clients
    where active and (p_client_id is null or id = p_client_id)
  ),
  d as (
    select c.id,
      -- Instagram: o mais antigo entre métricas diárias e posts.
      (select case when a is not null and b is not null then least(a, b) else coalesce(a, b) end
         from (select (select max(date) from instagram_account_daily_metrics m where m.client_id = c.id and m.reach is not null) a,
                      (select max(metrics_updated_at)::date from instagram_posts p where p.client_id = c.id) b) x) as ig,
      (select max(m.date) from meta_ads_daily m
        where m.client_id = c.id
          and (exists (select 1 from client_ad_accounts a
                        where a.client_id = c.id and a.active
                          and regexp_replace(a.ad_account_id, '^act_', '') = regexp_replace(m.ad_account_id, '^act_', ''))
               or (not exists (select 1 from client_ad_accounts a where a.client_id = c.id)
                   and (coalesce(c.meta_ad_account_id, '') = ''
                        or regexp_replace(c.meta_ad_account_id, '^act_', '') = regexp_replace(m.ad_account_id, '^act_', ''))))) as ads_meta,
      (select max(analise_em) from ads_planilha_semanal s where s.client_id = c.id and s.analise_em <= current_date and s.removido_em is null and s.valor_periodo is not null) as ads_planilha,
      (select max(coalesce(occurred_at, received_at))::date from crm_leads l where l.client_id = c.id) as crm,
      greatest((select max(started_at)::date from wts_sessions w where w.client_id = c.id),
               (select max(ultima_msg_em)::date from conversas v where v.client_id = c.id)) as atend,
      exists (select 1 from instagram_accounts i where i.client_id = c.id and i.active and not coalesce(i.provisional, false)) as tem_ig,
      exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.active and not coalesce(a.provisional, false))
        or coalesce(c.meta_ad_account_id, '') <> '' as tem_ads_meta,
      coalesce(c.ads_planilha_url, '') <> '' or exists (select 1 from ads_planilha_semanal s where s.client_id = c.id) as tem_ads_planilha,
      coalesce(c.ads_planilha_url, '') = '' as planilha_sem_url,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active) as tem_crm,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active and x.provider = 'planilha')
        and not exists (select 1 from crm_connections x where x.client_id = c.id and x.active and x.provider <> 'planilha') as crm_planilha,
      c.wts_company_id is not null or coalesce(c.digisac_url, '') <> ''
        or exists (select 1 from conversas v where v.client_id = c.id) as tem_atend
    from c
  )
  select d.id, f.fonte,
    case f.fonte when 'instagram' then d.tem_ig when 'anuncios' then d.tem_ads_meta or d.tem_ads_planilha
                 when 'crm' then d.tem_crm else d.tem_atend end,
    case f.fonte when 'anuncios' then d.tem_ads_planilha and not d.tem_ads_meta and d.ads_meta is null
                 when 'crm' then d.crm_planilha else false end,
    case f.fonte when 'instagram' then d.ig when 'anuncios' then coalesce(d.ads_meta, d.ads_planilha)
                 when 'crm' then d.crm else d.atend end,
    s.last_attempt_at, s.last_success_at, s.last_error,
    coalesce(s.motivo, case when f.fonte = 'anuncios' and d.tem_ads_planilha and d.planilha_sem_url and not d.tem_ads_meta
                            then 'Planilha de anúncios sem endereço cadastrado: só há linhas antigas.' end),
    case when s.motivo is null and f.fonte = 'anuncios' and d.tem_ads_planilha and d.planilha_sem_url and not d.tem_ads_meta
         then 'manual' else s.motivo_dono end,
    exists (select 1 from fontes_nao_usadas n where n.client_id = d.id and n.fonte = f.fonte)
  from d
  cross join (values ('instagram'), ('anuncios'), ('crm'), ('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = d.id and s.fonte = f.fonte;
$function$;
revoke all on function public.fontes_base(uuid) from public, anon, authenticated;
grant execute on function public.fontes_base(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 7) Resultados guardados com a regra antiga saem; são recalculados na próxima leitura.
-- ---------------------------------------------------------------------------------------------------------------
delete from public.resultado_pronto where funcao in ('pacientes_periodo', 'qualidade_dados', 'roi_periodo');
delete from public.resultado_pronto_geral where funcao = 'status_das_fontes';

drop function pg_temp.contas_certas_trocar(regprocedure, text[]);
