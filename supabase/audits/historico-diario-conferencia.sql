-- Conferência do histórico diário por entrada e do reprocesso do Kommo (plano 03.1.1.1.1-06). SOMENTE LEITURA.
-- Rodar o arquivo inteiro no SQL editor do projeto de produção ANTES de aplicar 20261113110000, de novo DEPOIS do
-- preenchimento e depois de cada janela do Kommo. Roda numa transação read only: qualquer escrita aborta.
-- Saída: só client_id, ids de conexão, contagens e datas. Nada de nome, telefone, texto de mensagem ou corpo de função.
-- Funciona antes e depois da migração: o que só existe depois (a tabela de pessoas, a coluna da fila) é lido sem
-- quebrar quando ainda não existe.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';

-- ================================================================ 0. pré-checagem e "aplicada?"
-- Antes de aplicar: cada trecho que a migração troca aparece 1 vez e o marcador 0 vezes. Depois: trechos 0, marcador 1.
-- Se algum trecho der 0 ou 2 ANTES de aplicar, não aplicar: a migração pararia sem mudar nada. Avisar.
with f as (select pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure) as d),
t(trecho, texto) as (values
  ('ag_crm: card que está hoje no agendamento', $t$     where x.quando is not null or (c.em_agendamento and c.d between p_de and p_ate)$t$),
  ('ag_ia: leitura das conversas', $t$  ag_ia as (select u, min(ultima_msg_em) as quando from ia where etapa = 'agendou' group by u),$t$),
  ('marcador [historico-diario]', '[historico-diario]')
)
select '0-trechos' as secao, t.trecho,
       (length(f.d) - length(replace(f.d, t.texto, ''))) / length(t.texto) as vezes
  from f, t;

select '0-registro' as secao, a.arquivo,
       exists (select 1 from public._migracoes_repo m where m.arquivo = a.arquivo) as aplicada,
       (select m.aplicada_em::date from public._migracoes_repo m where m.arquivo = a.arquivo) as aplicada_em
  from (values ('20261113100000_contas_certas_no_banco.sql'), ('20261113110000_historico_diario_por_entrada.sql')) a(arquivo);

-- Depois: uma função resultados_gravar_dia só, com 2 argumentos; a regra de robô conhece o autor 'Atendente'.
select '0-funcoes' as secao,
       (select count(*) from pg_proc where proname = 'resultados_gravar_dia' and pronamespace = 'public'::regnamespace) as gravar_dia_funcoes,
       (select max(pronargs) from pg_proc where proname = 'resultados_gravar_dia' and pronamespace = 'public'::regnamespace) as gravar_dia_argumentos,
       (select position('Atendente' in pg_get_functiondef('public.kommo_marcar_robo(uuid,timestamptz,timestamptz)'::regprocedure)) > 0) as robo_pula_atendente,
       to_regclass('public.resultados_diarios_pessoas') is not null as tabela_pessoas_existe;

-- ================================================================ 1. pré-condição do Kommo (código do plano 04 no ar)
-- Mensagens de saída do Kommo nos últimos 7 dias, por autor. Pré-condição do reprocesso: atendente > 0 no total.
select '1-kommo-autor-7d' as secao, c.client_id,
       count(*) filter (where m.autor = 'Atendente') as atendente,
       count(*) filter (where m.autor = 'Clínica') as clinica,
       count(*) filter (where m.tipo = 'kommo_robo') as robo,
       count(*) as saidas
  from public.mensagens m join public.conversas c on c.id = m.conversa_id
 where c.provider = 'kommo' and m.direcao = 'saida' and m.enviada_em >= now() - interval '7 days'
 group by c.client_id
 order by c.client_id;

select '1-kommo-autor-7d-total' as secao,
       count(*) filter (where m.autor = 'Atendente') as atendente,
       count(*) filter (where m.autor = 'Atendente') > 0 as plano_04_no_ar
  from public.mensagens m join public.conversas c on c.id = m.conversa_id
 where c.provider = 'kommo' and m.direcao = 'saida' and m.enviada_em >= now() - interval '7 days';

-- ================================================================ 2. histórico: os últimos 28 dias, por clínica
-- soma_agendaram: soma dos dias. pessoas_agendaram: pessoas diferentes contadas nos mesmos 28 dias (só depois da
-- migração). Esperado depois do preenchimento: soma_agendaram <= 1,2 x pessoas_agendaram; negociação nula nos dias
-- preenchidos (fila_nao_medida) e medida só nos dias do cron (fila_medida).
with lim as (select (now() at time zone 'America/Sao_Paulo')::date - 1 as ate),
d as (
  select r.client_id, r.dia, r.agendaram, r.negociacao, r.gravado_em,
         (to_jsonb(r) ->> 'fila_medida_em') is not null as fila_medida
    from public.resultados_diarios r, lim
   where r.dia between lim.ate - 27 and lim.ate
)
select '2-historico-28d' as secao, d.client_id,
       min(d.dia) as de, max(d.dia) as ate,
       count(*) as dias_gravados,
       count(*) filter (where d.gravado_em >= ((d.dia + 2)::timestamp at time zone 'America/Sao_Paulo')) as dias_gravados_depois,
       sum(d.agendaram) as soma_agendaram,
       count(*) filter (where d.agendaram is null) as dias_agendaram_nulo,
       case when to_regclass('public.resultados_diarios_pessoas') is not null then
         (xpath('/row/n/text()', query_to_xml(format(
           'select count(distinct pessoa_md5) as n from public.resultados_diarios_pessoas where client_id = %L and lista = %L and dia between %L and %L',
           d.client_id, 'agendaram', min(d.dia), max(d.dia)), false, true, '')))[1]::text::integer
       end as pessoas_agendaram,
       sum(d.negociacao) as soma_negociacao,
       count(*) filter (where d.negociacao is null) as dias_negociacao_nula,
       count(*) filter (where d.fila_medida) as dias_fila_medida
  from d
 group by d.client_id
 order by d.client_id;

-- O histórico inteiro: quantos dias foram gravados depois (preenchimento) e quantos pelo cron.
select '2-historico-total' as secao,
       min(r.dia) as primeiro_dia, max(r.dia) as ultimo_dia, count(*) as linhas,
       round(avg(case when r.gravado_em >= ((r.dia + 2)::timestamp at time zone 'America/Sao_Paulo') then 1.0 else 0 end), 3) as parte_gravada_depois,
       count(*) filter (where r.negociacao is null) as linhas_negociacao_nula,
       count(*) filter (where (to_jsonb(r) ->> 'fila_medida_em') is not null) as linhas_fila_medida
  from public.resultados_diarios r;

-- ================================================================ 3. Kommo por mês: conversas sem lead e leads do Instagram
-- Esperado depois do reprocesso: menos conversas sem lead nos meses antigos e mais leads do Instagram com conversa.
with conv as (
  select c.client_id, date_trunc('month', c.iniciada_em at time zone 'America/Sao_Paulo')::date as mes,
         count(*) as conversas, count(*) filter (where c.lead_id is null) as conversas_sem_lead
    from public.conversas c
   where c.provider = 'kommo' and c.iniciada_em is not null
   group by 1, 2
),
ld as (
  select l.client_id, date_trunc('month', l.occurred_at at time zone 'America/Sao_Paulo')::date as mes,
         count(*) as leads_instagram,
         count(*) filter (where exists (select 1 from public.conversas c where c.lead_id = l.id)) as leads_instagram_com_conversa
    from public.crm_leads l join public.crm_connections cc on cc.id = l.crm_connection_id
   where cc.provider = 'kommo' and cc.active and l.removido_na_origem is null and l.occurred_at is not null
     and public.crm_origem_classifica(l.source) = 'Instagram'
   group by 1, 2
)
select '3-kommo-mes' as secao, coalesce(conv.client_id, ld.client_id) as client_id, coalesce(conv.mes, ld.mes) as mes,
       coalesce(conv.conversas, 0) as conversas, coalesce(conv.conversas_sem_lead, 0) as conversas_sem_lead,
       coalesce(ld.leads_instagram, 0) as leads_instagram, coalesce(ld.leads_instagram_com_conversa, 0) as leads_instagram_com_conversa
  from conv full join ld on ld.client_id = conv.client_id and ld.mes = conv.mes
 order by 2, 3;

-- ================================================================ 4. Kommo: duplicadas, hora da virada e talks mistos
-- Virada = início do agrupamento por lead (30/10/2026): a primeira mensagem gravada numa conversa "lead:<id>:<dia>"
-- a partir de 29/10. A primeira execução com o agrupamento releu a hora anterior ao cursor, então as mensagens dessa
-- hora (até 70 min depois da virada) podem já estar em duas conversas: contam à parte (na_virada), não são do
-- reprocesso. Duplicada = a mesma mensagem do Kommo (externo_id) em duas conversas da mesma clínica.
-- Esperado: fora_da_virada = 0 antes e depois de cada janela; na_virada igual ao valor de antes (não cresce).
with virada as (
  select c.client_id, min(m.enviada_em) as em
    from public.conversas c join public.mensagens m on m.conversa_id = c.id
   where c.provider = 'kommo' and c.externo_id like 'lead:%' and m.enviada_em >= timestamptz '2026-10-29 00:00:00-03'
   group by c.client_id
),
dup as (
  select m.client_id, m.externo_id, min(m.enviada_em) as enviada_em, count(distinct m.conversa_id) as conversas
    from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.provider = 'kommo'
   group by m.client_id, m.externo_id
  having count(distinct m.conversa_id) > 1
)
select '4-kommo-duplicadas' as secao, coalesce(v.client_id, x.client_id) as client_id, v.em as virada_em,
       count(x.externo_id) as duplicadas,
       count(x.externo_id) filter (where x.enviada_em >= v.em and x.enviada_em < v.em + interval '70 minutes') as na_virada,
       count(x.externo_id) filter (where v.em is null or x.enviada_em < v.em or x.enviada_em >= v.em + interval '70 minutes') as fora_da_virada,
       min(x.enviada_em) filter (where v.em is null or x.enviada_em < v.em or x.enviada_em >= v.em + interval '70 minutes') as fora_primeira,
       max(x.enviada_em) filter (where v.em is null or x.enviada_em < v.em or x.enviada_em >= v.em + interval '70 minutes') as fora_ultima
  from virada v full join dup x on x.client_id = v.client_id
 group by 1, 2, 3
 order by 2;

-- Duplicadas fora da virada por dia (só aparece se houver): mostra em que janela do reprocesso elas nasceram.
with virada as (
  select c.client_id, min(m.enviada_em) as em
    from public.conversas c join public.mensagens m on m.conversa_id = c.id
   where c.provider = 'kommo' and c.externo_id like 'lead:%' and m.enviada_em >= timestamptz '2026-10-29 00:00:00-03'
   group by c.client_id
),
dup as (
  select m.client_id, m.externo_id, min(m.enviada_em) as enviada_em
    from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.provider = 'kommo'
   group by m.client_id, m.externo_id
  having count(distinct m.conversa_id) > 1
)
select '4-kommo-duplicadas-dia' as secao, x.client_id, (x.enviada_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as duplicadas
  from dup x left join virada v on v.client_id = x.client_id
 where v.em is null or x.enviada_em < v.em or x.enviada_em >= v.em + interval '70 minutes'
 group by 2, 3
 order by 2, 3;

-- Talks mistos, por conexão: conversa antiga (chave = id do talk, começou antes da virada) que recebeu mensagem
-- depois da virada (mensagem sem lead fica na chave do talk e estica a conversa). No reprocesso, mensagem do mesmo
-- talk com lead e anterior à última mensagem dela volta para ela e pode ficar em duas conversas.
--  com_lead_e_atendimento_no_periodo: a conversa antiga tem lead, e o mesmo lead tem atendimento "lead:<id>:<dia>"
--    com mensagem entre a virada e a última mensagem da conversa antiga (o caso que duplica).
--  sem_lead: não dá para saber pelo banco; a seção de duplicadas mostra se aconteceu.
with virada as (
  select c.client_id, min(m.enviada_em) as em
    from public.conversas c join public.mensagens m on m.conversa_id = c.id
   where c.provider = 'kommo' and c.externo_id like 'lead:%' and m.enviada_em >= timestamptz '2026-10-29 00:00:00-03'
   group by c.client_id
),
antigas as (
  select t.id, t.client_id, t.lead_id, t.iniciada_em, t.ultima_msg_em, v.em as virada_em,
         exists (select 1 from public.conversas l join public.mensagens ml on ml.conversa_id = l.id
                  where l.client_id = t.client_id and l.provider = 'kommo' and l.externo_id like 'lead:%'
                    and t.lead_id is not null and l.lead_id = t.lead_id
                    and ml.enviada_em >= v.em and ml.enviada_em <= t.ultima_msg_em) as com_atendimento
    from public.conversas t join virada v on v.client_id = t.client_id
   where t.provider = 'kommo' and t.externo_id not like 'lead:%'
     and t.iniciada_em < v.em
     and exists (select 1 from public.mensagens mt where mt.conversa_id = t.id and mt.enviada_em >= v.em)
)
select '4-kommo-talks-mistos' as secao, cx.id as conexao, a.client_id,
       count(*) as talks_antigos_com_msg_depois_da_virada,
       count(*) filter (where a.com_atendimento) as com_lead_e_atendimento_no_periodo,
       count(*) filter (where a.lead_id is null) as sem_lead,
       min(a.iniciada_em)::date as primeira, max(a.ultima_msg_em)::date as ultima
  from antigas a
  left join lateral (select y.id from public.crm_connections y
                      where y.client_id = a.client_id and y.provider = 'kommo' and y.active
                      order by y.id limit 1) cx on true
 group by cx.id, a.client_id
 order by a.client_id, cx.id;

-- ================================================================ 5. cursores do Kommo (acompanhar o reprocesso)
select '5-kommo-cursor' as secao, cc.id as conexao, cc.client_id,
       public.operacao_instante(cc.config->>'kommo_conversas_ate') as cursor_atual,
       public.operacao_instante(cc.config->>'kommo_reprocesso_desde') as reprocesso_desde,
       cc.config->>'kommo_conversas_cobertura' as cobertura,
       public.operacao_instante(cc.config->>'kommo_conversas_ate') > now() - interval '36 hours' as cursor_em_dia
  from public.crm_connections cc
 where cc.provider = 'kommo' and cc.active
 order by cc.client_id, cc.id;

rollback;
