-- [agendou-lead-novo] "Agendou" é só consulta de lead novo, e o CRM que não registra agendamento é dito na tela
-- (debug numeros-nao-batem-fonte, decisões do João de 16/11/2026: G1 e G2).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116140000_contatos_novos_sem_prospeccao.sql
-- (ordem: 120000, 130000, 140000, esta). Agentes não rodam este arquivo. Velocidade antes e depois: consultas-ciclo4.sql do
-- debug (EXPLAIN ANALYZE dos trechos novos, só leitura). Reversão: supabase/operacoes/20261116-reverter-agendou-lead-novo.sql.
--
-- O que muda (regra geral, nenhuma clínica citada):
--  1. Etapa de agendamento pelo nome: além do que 130000 já tira (aguardando, reagendamento, desmarcou, cancelado, "não
--     agendou", "não veio", prêmio), "exame" também não é consulta. Vale para o evento de etapa e a etapa atual
--     (pacientes_periodo_calc, pacientes_cards), a tabela por funil (crm_funis_periodo), a coluna de referência do perfil
--     (crm_perfil_para_analise) e o "agendado em diante" por card (jornada_funil, campanhas_base, conteudo_comercial,
--     conteudo_comercial_profundo, qualidade_leads_campanha, plano_agendou). Etapa marcada pela equipe (KPI ou papel do
--     perfil) conta como antes.
--  2. Paciente antigo não conta em "Agendaram" (pacientes_periodo_calc): fica fora a pessoa com origem "Paciente antigo"
--     em algum card (a mesma regra que já a tira de "Leads novos"), a pessoa cuja conversa do período a leitura da IA
--     marcou como paciente antigo, e a pessoa cujo primeiro card está num funil de compra ou de base (crm_funil_papel:
--     reativação, base antiga). Configuração por conexão, opcional: crm_connections.config->'agendou_lead_ate_dias' = N
--     tira também quem agendou mais de N dias depois do primeiro card (contato antigo que volta a marcar). Sem a chave,
--     nada muda. "Abordados pela equipe" continua contando quem foi abordado e agendou.
--  3. Ganho sem valor numa etapa com nome de agendamento continua fora das vendas mesmo quando o nome é "Aguardando
--     agendamento", "Reagendamento" ou "Exame agendado" (130000 estreitou a etapa de agendamento, e com isso esses ganhos
--     sem valor passariam a contar como venda). Lugares: pacientes_periodo_calc (4) e pacientes_vendas_janela.
--     crm_vendas_periodo já usa o nome largo para o mesmo fim e fica como está.
--  4. G2: quando nenhuma pessoa de "Agendaram" veio do CRM e nenhuma etapa de agendamento foi usada nos 90 dias até o fim do
--     período (ou o CRM não tem essa etapa), numeros.agendaram ganha crm_registra = false. O número não muda; a tela diz
--     "o CRM não registra isso" e mostra o número da conversa à parte.
--  5. No fim, apaga do resultado_pronto os resultados de pacientes_periodo (a próxima leitura recalcula). O histórico diário
--     passa a valer a regra nova nos dias que o cron regravar; para os 90 dias, rodar de novo
--     supabase/operacoes/20261116-refazer-chamaram.sql.
--
-- Como: cada função é trocada pelo texto da definição atual (pg_get_functiondef), como em 130000. Cada trecho antigo tem de
-- aparecer exatamente o número de vezes esperado (conferido na definição viva de 16/11 com 120000-140000 aplicadas, e na
-- que as migrações montam: só diferem em comentários); senão a migração para e nada muda. Função que já tem a marca é
-- pulada. Mesmas assinaturas, permissões e volatilidade.

create or replace function pg_temp.lead_novo_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  -- Agendamento pelo nome e o que, no nome, diz que não é consulta (a lista de 130000 mais "exame").
  re_agendou constant text := '(agendad|agendament)';
  re_nao_agendou constant text := '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio|exame)';
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[agendou-lead-novo]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> p_trocas[i][3]::int then
      raise exception '[agendou-lead-novo] %: trecho % aparece % vezes (esperado %). Nada foi alterado: %',
        p_fn, i, n, p_trocas[i][3], left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], replace(replace(p_trocas[i][2], '{RE_AGENDOU}', re_agendou), '{RE_NAO_AGENDOU}', re_nao_agendou));
  end loop;
  if position('[agendou-lead-novo]' in d) = 0 then
    raise exception '[agendou-lead-novo] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, trocados de lado e na ordem inversa)
-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_periodo_calc: 1) "exame" na exclusão (3 lugares de 130000); 2) ganho sem valor em etapa com nome de
-- agendamento fora das vendas (4); 3) quem é paciente antigo (CTE nova); 4) "Agendaram" sem paciente antigo; 5) G2.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$!~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)'$t$,
        $t$!~* '{RE_NAO_AGENDOU}'$t$, '3'],
  array[$t$c.em_agendamento and coalesce(c.price, 0) = 0$t$,
        $t$(c.em_agendamento or coalesce(c.etapa, '') ~* '{RE_AGENDOU}' /* [agendou-lead-novo] */) and coalesce(c.price, 0) = 0$t$, '4'],
  array[$t$  agendaram as (
    select coalesce(a.u, b.u) as u, least(a.quando, b.quando) as quando,$t$,
        $t$  -- [agendou-lead-novo] Só consulta de lead novo conta em "Agendaram" (decisão de 16/11/2026). Fica fora quem já era
  -- paciente: origem "Paciente antigo" em algum card da pessoa (a regra de "Leads novos"), conversa do período que a IA
  -- leu como paciente antigo, ou o primeiro card da pessoa num funil de compra ou de base. Com
  -- config.agendou_lead_ate_dias na conexão, também quem agendou mais de N dias depois do primeiro card.
  ag_quem as (
    select coalesce(k.u, i.u) as u,
           coalesce(k.pa, false) or i.u is not null or coalesce(k.primeiro_papel in ('compra', 'base'), false) as antigo,
           k.primeiro, k.lim
      from (select c.u, bool_or(c.origem = 'Paciente antigo') as pa,
                   (array_agg(c.papel order by c.occurred_at, c.id))[1] as primeiro_papel,
                   min(c.occurred_at) as primeiro,
                   min(case when cc.config->>'agendou_lead_ate_dias' ~ '^[0-9]{1,4}$'
                            then (cc.config->>'agendou_lead_ate_dias')::int end) as lim
              from cards c join crm_connections cc on cc.id = c.cx
             group by c.u) k
      full join (select distinct ia.u from ia where ia.origem = 'paciente_antigo') i on i.u = k.u
  ),
  agendaram as (
    select coalesce(a.u, b.u) as u, least(a.quando, b.quando) as quando,$t$, '1'],
  array[$t$      from ag_crm a full join ag_ia b on b.u = a.u
  ),$t$,
        $t$      from ag_crm a full join ag_ia b on b.u = a.u
      left join ag_quem q on q.u = coalesce(a.u, b.u)
     where not coalesce(q.antigo, false)
       and not coalesce(least(a.quando, b.quando) > q.primeiro + make_interval(days => q.lim), false)
  ),$t$, '1'],
  array[$t$  -- [agendou-e-etapa-sem-uso] Agendaram 0: com etapa de agendamento que nenhum card usou nos 90 dias até o fim do
$t$,
        $t$  -- [agendou-lead-novo] G2: nenhuma pessoa de "Agendaram" veio do CRM e nenhuma etapa de agendamento foi usada nos 90
  -- dias até o fim do período (ou não existe): o CRM não registra agendamento. O número fica (é o da conversa); a tela
  -- diz "o CRM não registra isso" e põe o número da conversa à parte.
  if coalesce((v->>'tem_crm')::boolean, false)
     and jsonb_typeof(v #> '{numeros,agendaram,por_fonte}') = 'object'
     and coalesce((v #>> '{numeros,agendaram,por_fonte,crm}')::numeric, 0)
         + coalesce((v #>> '{numeros,agendaram,por_fonte,crm_e_conversa}')::numeric, 0) = 0
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
                             and l.removido_na_origem is null and l.occurred_at >= v_fim - interval '90 days' and l.occurred_at < v_fim))) then
    v := jsonb_set(v, '{numeros,agendaram,crm_registra}', 'false'::jsonb);
  end if;
  -- [agendou-e-etapa-sem-uso] Agendaram 0: com etapa de agendamento que nenhum card usou nos 90 dias até o fim do
$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_cards: a etapa atual do card (em_agendamento) sem "exame".
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar('public.pacientes_cards(uuid)'::regprocedure, array[
  array[$t$!~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio)') /* [agendou-e-etapa-sem-uso] */$t$,
        $t$!~* '{RE_NAO_AGENDOU}') /* [agendou-e-etapa-sem-uso] [agendou-lead-novo] */$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_vendas_janela: ganho sem valor em etapa com nome de agendamento fora das vendas.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar('public.pacientes_vendas_janela(uuid,date,date)'::regprocedure, array[
  array[$t$c.em_agendamento and coalesce(c.price, 0) = 0$t$,
        $t$(c.em_agendamento or coalesce(c.etapa, '') ~* '{RE_AGENDOU}' /* [agendou-lead-novo] */) and coalesce(c.price, 0) = 0$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- crm_funis_periodo: "consulta agendada" no nome, sem o que não é consulta.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar('public.crm_funis_periodo(uuid,date,date)'::regprocedure, array[
  array[$t$ilike '%consulta agendada%'$t$,
        $t$~* '^(?!.*{RE_NAO_AGENDOU}).*consulta agendada' /* [agendou-lead-novo] */$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- crm_perfil_para_analise: a coluna "regra antiga de agendamento" (referência para o perfil) com a mesma exclusão.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar('public.crm_perfil_para_analise(uuid)'::regprocedure, array[
  array[$t$cps.status_name ~* '(agendad|agendament)'$t$,
        $t$cps.status_name ~* '^(?!.*{RE_NAO_AGENDOU}).*{RE_AGENDOU}' /* [agendou-lead-novo] */$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- "Agendado em diante" por card (etapa sem papel: vale o nome): sem exame, reagendado, aguardando, prêmio etc.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.lead_novo_trocar(f.fn::regprocedure, array[
  array[$t$'(agendad|confirmad|realizad|compareceu)'$t$,
        $t$'^(?!.*{RE_NAO_AGENDOU}).*(agendad|confirmad|realizad|compareceu)' /* [agendou-lead-novo] */$t$, f.n]
]) from (values ('public.jornada_funil(uuid,date,date)', '2'), ('public.campanhas_base(uuid)', '2'),
                ('public.conteudo_comercial(uuid,date,date)', '2'), ('public.conteudo_comercial_profundo(uuid,date,date)', '2'),
                ('public.qualidade_leads_campanha(uuid,date,date)', '2'),
                ('public.plano_agendou(uuid,timestamp with time zone)', '1')) f(fn, n);
-- [trocas:fim]

-- Resultados guardados de pacientes_periodo saem: a próxima leitura recalcula com a regra nova.
delete from public.resultado_pronto where funcao = 'pacientes_periodo';
