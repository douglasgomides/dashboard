-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261117120000_agendou_retorno_e_aguardando.sql.
-- Rodar ANTES das outras reversões do ciclo 5 (ordem inversa da aplicação). Agentes não rodam este arquivo.
-- O que faz: devolve pacientes_periodo_calc ao texto de antes, com os MESMOS pares da migração (copiados entre
-- [trocas:início] e [trocas:fim]), ao contrário e na ordem inversa. Depois, o histórico diário volta à regra antiga nos
-- dias que o cron regravar (para o histórico inteiro: a parte 2 de supabase/operacoes/20261117-alinhar-copias-e-refazer-historico.sql).

begin;
create or replace function pg_temp.retorno_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  re_aguardando constant text := 'aguard[[:alpha:]]* ([[:alpha:]]+ )?confirma';
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
  novo text;
begin
  if position('[agendou-retorno]' in d) = 0 then return; end if;  -- já está sem a troca
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    novo := replace(p_trocas[i][2], '{RE_AGUARDANDO}', re_aguardando);
    n := (length(d) - length(replace(d, novo, ''))) / length(novo);
    if n <> p_trocas[i][3]::int then
      raise exception 'reverter %: trecho % aparece % vezes (esperado %). Nada foi alterado: %', p_fn, i, n, p_trocas[i][3], left(novo, 120);
    end if;
    d := replace(d, novo, p_trocas[i][1]);
  end loop;
  if position('[agendou-retorno]' in d) > 0 then raise exception 'reverter %: a marca [agendou-retorno] continua lá', p_fn; end if;
  execute d;
end
$f$;

-- [trocas:início]
select pg_temp.retorno_desfazer('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
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
  -- Mesma população de "Agendaram" (lead novo, ag_quem): paciente antigo e retorno (entrou na etapa mais de 15 dias depois
  -- do primeiro card da pessoa no CRM; sem evento, a criação do card) ficam fora do número e da lista (fora_lead_novo).
  aguardando_todos as (
    select c.u, min(coalesce((select min(e.ocorreu_em) from crm_lead_eventos e
                                join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id
                                 and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
                               where e.crm_connection_id = c.cx and e.external_lead_id = c.ext and e.client_id = p_client
                                 and e.tipo in ('entrou', 'mudou_etapa') and s.status_name ~* '{RE_AGUARDANDO}'),
                             c.occurred_at)) as quando
      from cards c
     where c.outcome = 'open' and not c.em_agendamento and not c.em_comparecimento and not c.prospec
       and coalesce(c.etapa, '') ~* '{RE_AGUARDANDO}'
       and (c.d between p_de and p_ate or exists (select 1 from mexeu m where m.cx = c.cx and m.ext = c.ext))
       and c.u not in (select u from agendaram)
       and c.u not in (select u from vendas)
     group by c.u
  ),
  aguardando as (
    select a.u from aguardando_todos a left join ag_quem q on q.u = a.u
     where not coalesce(q.antigo, false)
       and not coalesce(a.quando > q.primeiro + make_interval(days => q.lim), false)
  ),
  neg_ia as (select distinct u from ia where comercial and etapa in ($t$, '1'],
  array[$t$     where coalesce(a.u, b.u) not in (select u from agendaram)
       and coalesce(a.u, b.u) not in (select u from vendas)
  ),$t$,
        $t$     where coalesce(a.u, b.u) not in (select u from agendaram)
       and coalesce(a.u, b.u) not in (select u from vendas)
       and coalesce(a.u, b.u) not in (select u from aguardando_todos)
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
                  'fonte', 'crm', 'motivo_sem_dado', null, 'responsavel', null,
                  'fora_lead_novo', (select count(*) from aguardando_todos) - (select count(*) from aguardando)))
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
commit;
