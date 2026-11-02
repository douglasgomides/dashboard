-- Correção única: sessões do WTS transferidas de uma médica para a outra da mesma conta que ficaram gravadas nos
-- dois clientes (segunda auditoria de 01/11/2026: 4 sessões entre a Dra. Juliana Paola e a Dra. Mariela Muniz,
-- 3 conversas e 25 mensagens visíveis nas duas telas).
--
-- Regra: a sessão é do cliente da equipe ATUAL. A cópia gravada por último (updated_at mais recente) é a que o sync
-- leu com a equipe atual; as outras cópias da mesma conta WTS ficam marcadas como movidas para esse dono. A conversa
-- de cada cópia marcada é marcada junto pelo gatilho wts_sessao_movida. Nada é apagado: para desfazer, zerar
-- movida_para_client_id (a conversa é desmarcada pelo mesmo gatilho).
--
-- Rodar DEPOIS da migração 20261102230000_regra_medico_completa.sql (as colunas e o gatilho vêm dela).
-- Só UPDATE. Contas do Digisac ficam fora: lá a conta inteira é gravada em cada cliente de propósito, e a regra
-- (crm_filtro_cliente) separa o que é de cada um.
-- Contagem esperada em 01/11/2026 (conferida em leitura): 4 sessões e 3 conversas marcadas.

begin;

-- 1. Prévia: as cópias que serão marcadas (sem nenhum dado de paciente).
with copias as (
  select s.client_id, s.session_id,
         first_value(s.client_id) over (partition by c.wts_company_id, s.session_id order by s.updated_at desc nulls last, s.client_id) as dono,
         count(*) over (partition by c.wts_company_id, s.session_id) as n
    from public.wts_sessions s
    join public.clients c on c.id = s.client_id
   where c.wts_company_id is not null
     and s.movida_para_client_id is null
     and not exists (select 1 from public.crm_connections k where k.client_id = c.id and k.provider = 'digisac')
)
select x.client_id as copia_em, x.dono, x.session_id,
       (select count(*) from public.conversas v where v.client_id = x.client_id and v.externo_id = x.session_id) as conversas
  from copias x
 where x.n > 1 and x.client_id <> x.dono;

-- 2. Marca as cópias antigas (o gatilho marca a conversa de cada uma).
with copias as (
  select s.client_id, s.session_id,
         first_value(s.client_id) over (partition by c.wts_company_id, s.session_id order by s.updated_at desc nulls last, s.client_id) as dono,
         count(*) over (partition by c.wts_company_id, s.session_id) as n
    from public.wts_sessions s
    join public.clients c on c.id = s.client_id
   where c.wts_company_id is not null
     and s.movida_para_client_id is null
     and not exists (select 1 from public.crm_connections k where k.client_id = c.id and k.provider = 'digisac')
)
update public.wts_sessions s
   set movida_para_client_id = x.dono, movida_em = now()
  from copias x
 where x.n > 1 and x.client_id <> x.dono
   and s.client_id = x.client_id and s.session_id = x.session_id;

-- 3. Conversa que ficou num cliente sem a sessão dele (o sync antigo apagava só a sessão) e cuja sessão está em
--    outro cliente da mesma conta WTS: fica com quem tem a sessão. Em 01/11/2026: 0 conversas.
update public.conversas v
   set movida_para_client_id = s.client_id, movida_em = now()
  from public.wts_sessions s
  join public.clients a on a.id = s.client_id
  join public.clients b on b.wts_company_id = a.wts_company_id and b.id <> a.id
 where v.client_id = b.id
   and v.provider in ('wts', 'flwchat')
   and v.externo_id = s.session_id
   and s.movida_para_client_id is null
   and v.movida_para_client_id is null
   and a.wts_company_id is not null
   and not exists (select 1 from public.wts_sessions o where o.client_id = v.client_id and o.session_id = v.externo_id);

-- 4. Conferência: nenhuma sessão nem conversa WTS visível em dois clientes da mesma conta. Esperado: 0 e 0.
select
  (select count(*) from (
     select c.wts_company_id, s.session_id
       from public.wts_sessions s join public.clients c on c.id = s.client_id
      where c.wts_company_id is not null and s.movida_para_client_id is null
        and not exists (select 1 from public.crm_connections k where k.client_id = c.id and k.provider = 'digisac')
      group by 1, 2 having count(*) > 1) d) as sessoes_em_dois_clientes,
  (select count(*) from (
     select c.wts_company_id, v.externo_id
       from public.conversas v join public.clients c on c.id = v.client_id
      where c.wts_company_id is not null and v.provider in ('wts', 'flwchat') and v.movida_para_client_id is null
        and not exists (select 1 from public.crm_connections k where k.client_id = c.id and k.provider = 'digisac')
      group by 1, 2 having count(*) > 1) d) as conversas_em_dois_clientes;

commit;
