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
-- Funções trocadas pelo texto da definição atual (pg_get_functiondef): cada trecho antigo tem de aparecer exatamente
-- uma vez, senão a migração para e nada muda (a transação inteira volta).
--
-- Reversão: recriar crm_papel_conta e crm_perfil_conta pela definição de 20261104100000_perfil_da_clinica.sql; nas
-- funções trocadas pelo texto, trocar de volta os trechos marcados "[contas-certas]" (o texto anterior está nas
-- listas de troca abaixo, primeiro elemento de cada par).

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

drop function pg_temp.contas_certas_trocar(regprocedure, text[]);
