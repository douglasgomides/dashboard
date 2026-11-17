-- [agendou-retorno] "Agendaram" de lead novo só até 15 dias da primeira entrada no CRM, e "Aguardando confirmação" com o
-- próprio nome (debug numeros-nao-batem-fonte, decisões do João de 17/11/2026).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261117110000_conta_dividida_sem_medico.sql
-- (não depende dela). Agentes não rodam este arquivo. Velocidade: consultas-ciclo5.sql do debug (Q1). Reversão:
-- supabase/operacoes/20261117-reverter-agendou-retorno.sql.
--
-- O que muda em pacientes_periodo_calc (regra geral, todas as clínicas, nenhuma citada):
--  1. Retorno x lead novo: quem agenda até 15 dias depois de entrar pela primeira vez no CRM (o card mais antigo da
--     pessoa) é lead novo; depois disso é retorno e não conta em "Agendaram". Vale para todas as clínicas e substitui a
--     chave opcional config.agendou_lead_ate_dias de 20261116150000, que nenhuma conexão tem e deixa de ser lida (um prazo
--     por clínica contrariaria a regra única). Quem só aparece na conversa (sem card no CRM) segue como antes: não há
--     primeira entrada no CRM para medir. numeros.agendaram.retornos diz quantos ficaram fora por essa regra.
--  2. "Aguardando confirmação": card aberto numa etapa cujo nome diz que aguarda a confirmação (como "Aguardando
--     confirmação/pagamento" de uma consulta já marcada) continua fora de "Agendaram" (regra de 130000) e sai de "Em
--     negociação": vira o número e a lista aguardando_confirmacao, com o próprio nome. Etapa que a equipe marcou como
--     agendamento (KPI ou papel do perfil) segue em "Agendaram". Mesma janela de "Em negociação" (card criado ou mexido no
--     período). O número só vem quando o CRM da clínica tem uma etapa com esse nome; sem ela, nada muda na tela.
--  3. No fim, apaga do resultado_pronto os resultados de pacientes_periodo. Para o histórico diário dos 90 dias: rodar
--     supabase/operacoes/20261117-alinhar-copias-e-refazer-historico.sql (parte 2).
--
-- Como: troca de trechos na definição atual (pg_get_functiondef), cada trecho com a contagem esperada (conferida na
-- definição viva de 17/11, com 120000-170000 aplicadas), como em 150000. Função que já tem a marca é pulada.

create or replace function pg_temp.retorno_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  re_aguardando constant text := 'aguard[[:alpha:]]* ([[:alpha:]]+ )?confirma';
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[agendou-retorno]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> p_trocas[i][3]::int then
      raise exception '[agendou-retorno] %: trecho % aparece % vezes (esperado %). Nada foi alterado: %',
        p_fn, i, n, p_trocas[i][3], left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], replace(p_trocas[i][2], '{RE_AGUARDANDO}', re_aguardando));
  end loop;
  if position('[agendou-retorno]' in d) = 0 then
    raise exception '[agendou-retorno] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, ao contrário e na ordem inversa)
select pg_temp.retorno_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  -- 1) 15 dias para todas as clínicas (o prazo por conexão deixa de ser lido).
  array[$t$  -- leu como paciente antigo, ou o primeiro card da pessoa num funil de compra ou de base. Com
  -- config.agendou_lead_ate_dias na conexão, também quem agendou mais de N dias depois do primeiro card.
$t$,
        $t$  -- leu como paciente antigo, ou o primeiro card da pessoa num funil de compra ou de base.
  -- [agendou-retorno] Retorno (17/11/2026): quem agendou mais de 15 dias depois do primeiro card no CRM.
$t$, '1'],
  array[$t$                   min(case when cc.config->>'agendou_lead_ate_dias' ~ '^[0-9]{1,4}$'
                            then (cc.config->>'agendou_lead_ate_dias')::int end) as lim
              from cards c join crm_connections cc on cc.id = c.cx
             group by c.u) k$t$,
        $t$                   15 as lim
              from cards c
             group by c.u) k$t$, '1'],
  -- 2) Quem ficou fora de "Agendaram" por ser retorno (para numeros.agendaram.retornos).
  array[$t$       and not coalesce(least(a.quando, b.quando) > q.primeiro + make_interval(days => q.lim), false)
  ),$t$,
        $t$       and not coalesce(least(a.quando, b.quando) > q.primeiro + make_interval(days => q.lim), false)
  ),
  ag_retorno as (
    select coalesce(a.u, b.u) as u
      from ag_crm a full join ag_ia b on b.u = a.u
      join ag_quem q on q.u = coalesce(a.u, b.u)
     where not coalesce(q.antigo, false)
       and least(a.quando, b.quando) > q.primeiro + make_interval(days => q.lim)
  ),$t$, '1'],
  -- 3) "Aguardando confirmação" com o próprio nome.
  array[$t$  neg_ia as (select distinct u from ia where comercial and etapa in ($t$,
        $t$  -- [agendou-retorno] "Aguardando confirmação" (17/11/2026): card aberto em etapa cujo nome diz que aguarda a confirmação.
  -- Não é agendamento e sai de "Em negociação". Etapa marcada como agendamento pela equipe fica em "Agendaram".
  aguardando as (
    select distinct c.u from cards c
     where c.outcome = 'open' and not c.em_agendamento and not c.em_comparecimento and not c.prospec
       and coalesce(c.etapa, '') ~* '{RE_AGUARDANDO}'
       and (c.d between p_de and p_ate or exists (select 1 from mexeu m where m.cx = c.cx and m.ext = c.ext))
       and c.u not in (select u from agendaram)
       and c.u not in (select u from vendas)
  ),
  neg_ia as (select distinct u from ia where comercial and etapa in ($t$, '1'],
  array[$t$     where coalesce(a.u, b.u) not in (select u from agendaram)
       and coalesce(a.u, b.u) not in (select u from vendas)
  ),$t$,
        $t$     where coalesce(a.u, b.u) not in (select u from agendaram)
       and coalesce(a.u, b.u) not in (select u from vendas)
       and coalesce(a.u, b.u) not in (select u from aguardando)
  ),$t$, '1'],
  array[$t$    select 'negociacao', n.u, null::timestamptz, n.fonte, '{}'::jsonb, n.u from negociacao n$t$,
        $t$    select 'negociacao', n.u, null::timestamptz, n.fonte, '{}'::jsonb, n.u from negociacao n
    union all
    select 'aguardando', a.u, null::timestamptz, 'crm', '{}'::jsonb, a.u from aguardando a$t$, '1'],
  array[$t$
    ),
    'listas', jsonb_build_object($t$,
        $t$
    ) || case when f.tem_crm and exists (
             select 1 from crm_pipeline_statuses s join crm_connections k on k.id = s.crm_connection_id and k.active
              where k.client_id = p_client and s.status_name ~* '{RE_AGUARDANDO}')
           then jsonb_build_object('aguardando_confirmacao', jsonb_build_object('valor', (select count(*) from aguardando),
                  'fonte', 'crm', 'motivo_sem_dado', null, 'responsavel', null))
           else '{}'::jsonb end,
    'listas', jsonb_build_object($t$, '1'],
  array[$t$
    )
  ) into v$t$,
        $t$
    ) || jsonb_build_object('aguardando_confirmacao', jsonb_build_object(
           'total', coalesce((select pessoas from n where lista = 'aguardando'), 0),
           'itens', coalesce((select itens from listas where lista = 'aguardando'), '[]'::jsonb)))
  ) into v$t$, '1'],
  -- 4) numeros.agendaram.retornos.
  array[$t$              'crm_e_conversa', (select count(*) from agendaram where fonte = 'crm_e_conversa'))) end,$t$,
        $t$              'crm_e_conversa', (select count(*) from agendaram where fonte = 'crm_e_conversa')),
            'retornos', (select count(*) from ag_retorno)) end,$t$, '1'],
  -- 5) Antes de o CRM ter registro, "aguardando" também não é medido (como "Em negociação").
  array[$t$foreach v_k in array array['leads_novos', 'abordados', 'compareceram', 'fecharam', 'agendaram', 'negociacao'] loop$t$,
        $t$foreach v_k in array array['leads_novos', 'abordados', 'compareceram', 'fecharam', 'agendaram', 'negociacao', 'aguardando_confirmacao'] loop$t$, '1']
]);
-- [trocas:fim]

delete from public.resultado_pronto where funcao = 'pacientes_periodo';
