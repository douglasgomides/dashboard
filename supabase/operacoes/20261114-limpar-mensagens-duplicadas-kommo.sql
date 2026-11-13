-- NÃO é migração: rodar à mão, só o João, colando no SQL editor do Supabase. Agentes não rodam este arquivo.
-- (Fica em supabase/operacoes/: scripts/banco/aplicar.sh e o workflow "Banco de dados" só leem supabase/migrations,
-- e o aplicar.sh não serve para a produção.)
--
-- O que faz: apaga as cópias de mensagens do Kommo gravadas em duas conversas da mesma clínica (a hora da virada
-- para o agrupamento por lead, 30/10/2026, e o talk misto da primeira janela do reprocesso). Fica UMA cópia por
-- (client_id, externo_id), entre as conversas do Kommo, nesta ordem:
--   1. a que o acompanhamento verificável usa (operacao_recuperacao.mensagem_id; apagar essa daria erro de chave);
--   2. senão a da conversa do atendimento do lead ("lead:<id>:<dia>");
--   3. senão a de menor id.
-- Nunca apaga conversa (apagar levaria junto resumo, tema e SAP): a conversa que ficar sem mensagem continua e é
-- contada em (a) e (d). As conversas que perderam mensagem ganham início e fim pelo que sobrou nelas.
-- Mensagens de outros providers (WhatsApp, Clint, ...) não entram: só conversas com provider = 'kommo'.
-- Rodar de novo não muda nada (a segunda vez não acha cópia).
--
-- Pré-condição: o código do plano 03.1.1.1.1.1-01 no ar (o sync não grava mais a mesma mensagem em duas conversas).
-- Sem ele, a próxima sincronização recria cópias. As 5 janelas do reprocesso
-- (20261113-reprocessar-conversas-kommo.sql) continuam paradas até esta limpeza.
--
-- Pode colar o arquivo inteiro: (a) e (d) só leem, e o bloco do meio só grava se, no fim dele, não sobrar nenhuma
-- cópia; senão dá erro e nada muda. O SQL editor mostra só o resultado do último comando, por isso o jeito
-- recomendado é colar em três vezes:
--   1. (a) sozinha, só leitura. Guardar a saída (client_id e contagens).
--   2. O bloco inteiro, da linha "begin" até a linha "commit", de uma vez. Deve terminar sem erro.
--      Se der erro, nada foi gravado; se o editor depois disser "current transaction is aborted", colar só: rollback;
--   3. (d) sozinha, só leitura: duplicadas = 0 em todas as linhas.
-- Mandar de volta só client_id e contagens de (a) e (d) (nada de nome, telefone ou texto de mensagem).

-- (a) Antes, só lê. Por clínica: mensagens do Kommo em mais de uma conversa, linhas que vão sair, tipo do par
-- (talk x lead, lead x lead, talk x talk), quantas são da hora da virada, conversas que vão ficar sem mensagem e
-- conversas do Kommo já sem mensagem hoje. presas = cópias com mais de uma usada pelo acompanhamento: deve ser 0
-- (se não for, o bloco dá erro e não grava; mandar a saída).
with virada as (
  select c.client_id, min(m.enviada_em) as em
    from public.conversas c join public.mensagens m on m.conversa_id = c.id
   where c.provider = 'kommo' and c.externo_id like 'lead:%' and m.enviada_em >= timestamptz '2026-10-29 00:00:00-03'
   group by c.client_id
),
dup as (
  select m.client_id, m.externo_id, min(m.enviada_em) as enviada_em, count(*) as copias,
         count(*) filter (where c.externo_id like 'lead:%') as em_lead,
         count(*) filter (where c.externo_id not like 'lead:%') as em_talk,
         count(*) filter (where exists (select 1 from public.operacao_recuperacao o where o.mensagem_id = m.id)) as usadas
    from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.provider = 'kommo'
   group by m.client_id, m.externo_id
  having count(*) > 1
),
copia as (
  select m.id, m.conversa_id, m.client_id,
         exists (select 1 from public.operacao_recuperacao o where o.mensagem_id = m.id) as usada,
         row_number() over (partition by m.client_id, m.externo_id
                            order by exists (select 1 from public.operacao_recuperacao o where o.mensagem_id = m.id) desc,
                                     c.externo_id like 'lead:%' desc, m.id::text) as ordem
    from dup d
    join public.mensagens m on m.client_id = d.client_id and m.externo_id = d.externo_id
    join public.conversas c on c.id = m.conversa_id and c.provider = 'kommo'
),
vazias as (
  select x.client_id, count(distinct x.conversa_id) as ficam_vazias
    from copia x
   where x.ordem > 1 and not x.usada
     and not exists (select 1 from public.mensagens m
                      where m.conversa_id = x.conversa_id
                        and m.id not in (select y.id from copia y where y.ordem > 1 and not y.usada))
   group by x.client_id
),
ja_vazias as (
  select c.client_id, count(*) as sem_mensagem
    from public.conversas c
   where c.provider = 'kommo' and not exists (select 1 from public.mensagens m where m.conversa_id = c.id)
   group by c.client_id
)
select 'a-antes' as secao, x.client_id,
       count(*) as mensagens_duplicadas,
       sum(x.copias - 1) as linhas_a_mais,
       count(*) filter (where x.em_lead > 0 and x.em_talk > 0) as talk_x_lead,
       count(*) filter (where x.em_lead > 1 and x.em_talk = 0) as lead_x_lead,
       count(*) filter (where x.em_lead = 0) as talk_x_talk,
       count(*) filter (where x.enviada_em >= v.em and x.enviada_em < v.em + interval '70 minutes') as na_virada,
       count(*) filter (where x.usadas > 1) as presas,
       coalesce(max(z.ficam_vazias), 0) as conversas_que_ficam_vazias,
       coalesce(max(j.sem_mensagem), 0) as conversas_kommo_sem_mensagem_hoje
  from dup x
  left join virada v on v.client_id = x.client_id
  left join vazias z on z.client_id = x.client_id
  left join ja_vazias j on j.client_id = x.client_id
 group by x.client_id
 order by x.client_id;

-- ================================================================ bloco: colar de "begin" até "commit" de uma vez
begin;

-- (b) Cópias que saem: todas menos a primeira de cada (client_id, externo_id) pela ordem do cabeçalho. A que o
-- acompanhamento usa nunca sai (se houver duas usadas, as duas ficam e o conferidor abaixo desfaz tudo).
create temp table limpeza_kommo_sai on commit drop as
with dup as (
  select m.client_id, m.externo_id
    from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.provider = 'kommo'
   group by m.client_id, m.externo_id
  having count(*) > 1
),
copia as (
  select m.id, m.conversa_id,
         exists (select 1 from public.operacao_recuperacao o where o.mensagem_id = m.id) as usada,
         row_number() over (partition by m.client_id, m.externo_id
                            order by exists (select 1 from public.operacao_recuperacao o where o.mensagem_id = m.id) desc,
                                     c.externo_id like 'lead:%' desc, m.id::text) as ordem
    from dup d
    join public.mensagens m on m.client_id = d.client_id and m.externo_id = d.externo_id
    join public.conversas c on c.id = m.conversa_id and c.provider = 'kommo'
)
select id, conversa_id from copia where ordem > 1 and not usada;

delete from public.mensagens m
 using limpeza_kommo_sai s
 where m.id = s.id;

-- (c) Início e fim das conversas que perderam mensagem, pelo que sobrou nelas. A que ficou sem mensagem continua
-- como estava (não é apagada) e aparece em (d).
update public.conversas c
   set iniciada_em = r.de, ultima_msg_em = r.ate
  from (select m.conversa_id, min(m.enviada_em) as de, max(m.enviada_em) as ate
          from public.mensagens m
         where m.conversa_id in (select s.conversa_id from limpeza_kommo_sai s)
         group by m.conversa_id) r
 where c.id = r.conversa_id
   and (c.iniciada_em is distinct from r.de or c.ultima_msg_em is distinct from r.ate);

-- Conferidor: se ainda sobrar mensagem do Kommo em duas conversas, dá erro e nada deste bloco é gravado.
do $$
declare
  restam bigint;
begin
  select count(*) into restam
    from (select m.client_id, m.externo_id
            from public.mensagens m join public.conversas c on c.id = m.conversa_id
           where c.provider = 'kommo'
           group by m.client_id, m.externo_id
          having count(*) > 1) x;
  if restam > 0 then
    raise exception 'limpeza do Kommo desfeita: % mensagens ainda em mais de uma conversa (nada foi gravado). Mandar a saída de (a).', restam;
  end if;
end
$$;

commit;
-- ================================================================ fim do bloco

-- (d) Depois, só lê. Por clínica com conversa do Kommo: duplicadas deve ser 0 em todas as linhas.
-- conversas_kommo_sem_mensagem = o "hoje" de (a) + o "ficam_vazias" de (a) (na primeira vez; depois, igual).
select 'd-depois' as secao, c.client_id,
       (select count(*)
          from (select m.client_id, m.externo_id
                  from public.mensagens m join public.conversas k on k.id = m.conversa_id
                 where k.provider = 'kommo' and m.client_id = c.client_id
                 group by m.client_id, m.externo_id
                having count(*) > 1) x) as duplicadas,
       count(*) filter (where not exists (select 1 from public.mensagens m where m.conversa_id = c.id)) as conversas_kommo_sem_mensagem
  from public.conversas c
 where c.provider = 'kommo'
 group by c.client_id
 order by c.client_id;
