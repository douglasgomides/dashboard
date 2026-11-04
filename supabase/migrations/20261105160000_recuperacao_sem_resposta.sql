-- Recuperação de pacientes sem leitura da IA (Kommo): a lista do dia sai de conversas_resumos, e a IA não lê
-- conversa do Kommo (ele não entrega o texto da clínica). Na Dra. Lana a lista ficava sempre vazia (04/11/2026).
-- Esta função escolhe por regra, só com o que o Kommo entrega:
--  - conversa do WhatsApp (a recuperação é enviada pelo WhatsApp da clínica);
--  - a última mensagem da paciente que pede resposta (mesma regra de atendimento_conversas) foi há 1 a 21 dias;
--  - depois dela não houve mensagem da equipe (robô não conta);
--  - a pessoa não está agendada, não compareceu e não comprou pelo perfil da clínica (crm_perfil_etapas).
-- Devolve as últimas mensagens da paciente (até 600 letras) para a IA escrever o retorno; a secretária revisa antes.
-- Só service_role (a rotina dos agentes).

create or replace function public.recuperacao_sem_resposta(p_client_id uuid)
returns table(conversa_id uuid, ultima_msg_em timestamptz, espera_desde timestamptz, textos text)
language sql stable security definer set search_path = public, pg_temp
as $$
  with cv as (
    select c.id, c.pessoa_id, c.ultima_msg_em from conversas c
     where c.client_id = p_client_id and c.canal = 'whatsapp' and c.ultima_msg_em >= now() - interval '22 days'
  ),
  m as (
    select m.conversa_id, m.direcao, m.enviada_em, m.texto,
           (m.direcao = 'saida' and coalesce(m.autor, '') ~* '^(rob|bot|automa)') as robo,
           (m.direcao = 'entrada' and not public.mensagem_eh_interacao(m.tipo)
             and (coalesce(m.tipo, '') <> 'texto'
                  or (m.texto ~ '[[:alpha:]]{2}'
                      and m.texto !~* '^(mentioned you in their story|the message could not be displayed|.{0,40}reacted to your)'))) as pede
      from cv join mensagens m on m.conversa_id = cv.id
     where m.enviada_em >= now() - interval '22 days'
  ),
  ult as (
    select conversa_id, max(enviada_em) filter (where pede) as ult_pede,
           max(enviada_em) filter (where direcao = 'saida' and not robo) as ult_equipe
      from m group by 1
  ),
  esperando as (
    select u.conversa_id, u.ult_pede from ult u
     where u.ult_pede is not null and (u.ult_equipe is null or u.ult_equipe < u.ult_pede)
       and u.ult_pede between now() - interval '21 days' and now() - interval '1 day'
  ),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  avancou as (
    select distinct l.pessoa_id from crm_leads l
      join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
     where l.client_id = p_client_id and l.pessoa_id is not null and l.removido_na_origem is null
       and pe.papel in ('agendado', 'compareceu', 'venda', 'posvenda')
  )
  select e.conversa_id, cv.ultima_msg_em, e.ult_pede,
         left((select string_agg(x.texto, ' | ' order by x.enviada_em)
                 from (select mm.texto, mm.enviada_em from m mm
                        where mm.conversa_id = e.conversa_id and mm.pede and nullif(btrim(mm.texto), '') is not null
                        order by mm.enviada_em desc limit 5) x), 600)
    from esperando e join cv on cv.id = e.conversa_id
   where cv.pessoa_id is null or cv.pessoa_id not in (select pessoa_id from avancou)
   order by e.ult_pede desc
   limit 200
$$;
revoke all on function public.recuperacao_sem_resposta(uuid) from public, anon, authenticated;
grant execute on function public.recuperacao_sem_resposta(uuid) to service_role;
