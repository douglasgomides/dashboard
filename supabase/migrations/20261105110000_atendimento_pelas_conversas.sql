-- Atendimento pelas conversas (CRM sem WTS, ex.: Kommo da Dra. Lana): a tela "Qualidade do atendimento" só lia
-- wts_sessions e mostrava "Nenhum atendimento" para quem atende pelo Kommo. Esta RPC calcula a partir de
-- conversas/mensagens, que já chegam ao Nexo: o Kommo entrega o horário de cada mensagem da equipe, mas não o texto
-- nem quem respondeu, então só dá para medir a rapidez, não a nota da conversa.
--
-- Regras:
--  - Mensagem que pede resposta: da paciente, não é interação (mensagem_eh_interacao) e, se for texto, tem palavra
--    (2+ letras) e não é aviso do Instagram ("mentioned you in their story", "the message could not be displayed",
--    "reacted to your"). Emoji solto e reação não contam.
--  - Conversa do período: a 1ª mensagem que pede resposta caiu no período (horário de Brasília).
--  - Resposta da equipe: 1ª mensagem de saída depois dela cujo autor não é robô (autor começa com rob/bot/automa).
--    O robô é contado à parte. Sem resposta da equipe nem do robô = sem resposta.
--  - Horário comercial: segunda a sexta, 8h às 18h (Brasília), pela hora em que a paciente escreveu.
--  - Conversas que começaram há menos de 2 horas ficam fora de "sem resposta" (ainda dá tempo de responder).

create or replace function public.atendimento_conversas(p_client_id uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  lim as (select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini,
                 ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim),
  cv as (
    select c.id, coalesce(nullif(c.canal, ''), 'outro') as canal, c.provider
      from conversas c
     where c.client_id = p_client_id and (select pode from ok)
       and c.ultima_msg_em >= (select ini from lim)
  ),
  m as (
    select m.conversa_id, m.direcao, m.enviada_em,
           (m.direcao = 'saida' and coalesce(m.autor, '') ~* '^(rob|bot|automa)') as robo,
           (m.direcao = 'entrada' and not public.mensagem_eh_interacao(m.tipo)
             and (coalesce(m.tipo, '') <> 'texto'
                  or (m.texto ~ '[[:alpha:]]{2}'
                      and m.texto !~* '^(mentioned you in their story|the message could not be displayed|.{0,40}reacted to your)'))) as pede
      from cv join mensagens m on m.conversa_id = cv.id
     where m.enviada_em >= (select ini from lim) and m.enviada_em < (select fim from lim) + interval '2 days'
  ),
  e as (
    select conversa_id, min(enviada_em) as e1 from m where pede group by 1
    having min(enviada_em) < (select fim from lim)
  ),
  r as (
    select e.conversa_id, e.e1,
           min(m.enviada_em) filter (where not m.robo) as s_eq,
           min(m.enviada_em) filter (where m.robo) as s_bot
      from e left join m on m.conversa_id = e.conversa_id and m.direcao = 'saida' and m.enviada_em > e.e1
     group by 1, 2
  ),
  x as (
    select r.*, cv.canal, extract(epoch from r.s_eq - r.e1) as seg,
           extract(isodow from r.e1 at time zone 'America/Sao_Paulo') between 1 and 5
             and extract(hour from r.e1 at time zone 'America/Sao_Paulo') between 8 and 17 as horario,
           extract(hour from r.e1 at time zone 'America/Sao_Paulo')::int as hora,
           (r.e1 at time zone 'America/Sao_Paulo')::date as dia,
           r.e1 < now() - interval '2 hours' as avaliavel
      from r join cv on cv.id = r.conversa_id
  ),
  canal as (
    select canal,
           count(*) as conversas,
           count(*) filter (where avaliavel and s_eq is null) as sem_resposta_equipe,
           count(*) filter (where avaliavel and s_eq is null and s_bot is null) as sem_resposta,
           count(*) filter (where avaliavel and s_eq is null and s_bot is not null) as so_robo,
           count(*) filter (where avaliavel) as avaliaveis,
           round(percentile_cont(0.5) within group (order by seg) filter (where seg is not null)) as mediana_seg,
           round(percentile_cont(0.5) within group (order by seg) filter (where seg is not null and horario)) as mediana_horario_seg,
           round(percentile_cont(0.5) within group (order by seg) filter (where seg is not null and not horario)) as mediana_fora_seg,
           count(*) filter (where seg <= 300) as ate_5min,
           count(*) filter (where seg <= 1800) as ate_30min,
           count(*) filter (where seg <= 3600) as ate_1h,
           count(*) filter (where horario) as no_horario
      from x group by canal
  ),
  hora as (
    select hora, count(*) as conversas,
           round(percentile_cont(0.5) within group (order by seg) filter (where seg is not null)) as mediana_seg,
           count(*) filter (where avaliavel and s_eq is null) as sem_resposta_equipe
      from x where canal = 'whatsapp' group by hora
  ),
  dia as (
    select dia, count(*) as conversas,
           round(percentile_cont(0.5) within group (order by seg) filter (where seg is not null)) as mediana_seg
      from x group by dia
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'conversas', (select count(*) from x),
    'provider', (select string_agg(distinct provider, ',') from cv),
    'por_canal', coalesce((select jsonb_agg(to_jsonb(c) order by c.conversas desc) from canal c), '[]'::jsonb),
    'por_hora_whatsapp', coalesce((select jsonb_agg(to_jsonb(h) order by h.hora) from hora h), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(to_jsonb(d) order by d.dia) from dia d), '[]'::jsonb),
    'equipe_com_texto', exists (select 1 from cv join mensagens mm on mm.conversa_id = cv.id
                                 where mm.direcao = 'saida' and nullif(btrim(mm.texto), '') is not null
                                   and mm.enviada_em >= (select ini from lim) limit 1)
  ) end
$$;

revoke all on function public.atendimento_conversas(uuid, date, date) from public, anon;
grant execute on function public.atendimento_conversas(uuid, date, date) to authenticated, service_role;
