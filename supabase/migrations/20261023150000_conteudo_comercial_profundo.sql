-- Conteúdo × Comercial, cruzamentos com ligação real (não só coincidência de data):
--   posts_compra: comentários com intenção de compra (preço, agendar, onde atende, convênio, contato) por post.
--     O comentário pertence ao post, então a ligação é direta. Ignora comentários da própria conta.
--   temas_valor: tema da conversa (leitura por IA) → lead do CRM → ganho/perdido e valor fechado.
--   resposta: tempo até a primeira resposta humana (sem robô) × agendamento, por faixa e por tema.
--     Só conversas que começaram em horário comercial, para não culpar a equipe pela noite.
-- Só leitura, sem gatilho; admin ou membro do cliente. Nada é enviado a paciente.
-- Reversão: drop function public.conteudo_comercial_profundo(uuid, date, date);

create or replace function public.conteudo_comercial_profundo(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and p_ate >= p_de and p_ate - p_de <= 120 as pode),
  janela as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini, ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  donos as (select lower(ig_username) u from instagram_accounts where client_id = p_client and ig_username is not null),
  coment as (
    select c.instagram_post_id as post_id,
      translate(lower(c.text), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as t
    from instagram_comments c, janela j
    where c.client_id = p_client and c.commented_at >= j.ini and c.commented_at < j.fim and (select pode from ok)
      and coalesce(lower(c.author_username), '') not in (select u from donos)
  ),
  coment_class as (
    select post_id,
      t ~ '(preco|valor|quanto (custa|e|fica|sai|cobra|esta)|qnto|qto|orcamento|\$)' as preco,
      t ~ '(agend|marcar|consulta|horario|vaga|atende (dia|quando))' as agendar,
      t ~ '(endereco|onde fica|onde (voce|vc) atende|qual cidade|atende em|atende na|atende no)' as onde,
      t ~ '(convenio|plano de saude|unimed|amil|sulamerica|bradesco saude|reembolso)' as convenio,
      t ~ '(whats|telefone|contato|numero|link|direct|dm\M|chama|me chama)' as contato
    from coment
  ),
  por_post as (
    select post_id, count(*) as comentarios,
      count(*) filter (where preco or agendar or onde or convenio or contato) as compra,
      count(*) filter (where preco) as preco, count(*) filter (where agendar) as agendar,
      count(*) filter (where onde) as onde, count(*) filter (where convenio) as convenio, count(*) filter (where contato) as contato
    from coment_class group by 1
  ),
  posts_compra as (
    select pp.*, p.permalink, p.thumbnail_url, left(coalesce(p.caption, ''), 140) as legenda, nullif(btrim(p.tema), '') as tema,
      coalesce(p.format, p.media_type) as formato, p.funnel_stage as etapa, p.posted_at, coalesce(p.reach, 0) as alcance
    from por_post pp join instagram_posts p on p.id = pp.post_id and p.client_id = p_client
    where pp.compra > 0
  ),
  conv as (
    select c.id, nullif(btrim(t.tema), '') as tema, c.iniciada_em, l.id as lead_id, l.outcome, l.price,
      (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou' or l.outcome = 'won'
        or coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)') as agendou
    from conversas c
    cross join janela j
    left join conversas_tema t on t.conversa_id = c.id
    left join conversas_resumos r on r.conversa_id = c.id
    left join crm_leads l on l.id = c.lead_id
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    where c.client_id = p_client and c.iniciada_em >= j.ini and c.iniciada_em < j.fim and (select pode from ok)
  ),
  temas_valor as (
    select tema, count(*) as conversas, count(lead_id) as com_lead,
      count(*) filter (where outcome = 'won') as ganhos, count(*) filter (where outcome = 'lost') as perdidos,
      count(*) filter (where outcome = 'won' and price > 0) as ganhos_com_valor,
      coalesce(sum(price) filter (where outcome = 'won' and price > 0), 0) as receita
    from conv where tema is not null group by 1
  ),
  primeira as (
    select cv.id, cv.tema, cv.agendou, e.em as entrada,
      (select min(s.enviada_em) from mensagens s
        where s.conversa_id = cv.id and s.direcao = 'saida' and s.enviada_em > e.em
          and coalesce(s.autor, '') <> 'Robô' and coalesce(s.tipo, '') not in ('kommo_robo', 'sistema')) as resposta
    from conv cv
    cross join lateral (select min(m.enviada_em) em from mensagens m where m.conversa_id = cv.id and m.direcao = 'entrada') e
    where e.em is not null
  ),
  resp as (
    select tema, agendou,
      case
        when resposta is null then '5_sem_resposta'
        when resposta - entrada <= interval '15 minutes' then '1_ate_15min'
        when resposta - entrada <= interval '1 hour' then '2_15_a_60min'
        when resposta - entrada <= interval '4 hours' then '3_1_a_4h'
        else '4_mais_de_4h' end as faixa
    from primeira
    where (extract(isodow from entrada at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from entrada at time zone 'America/Sao_Paulo') between 8 and 17)
       or (extract(isodow from entrada at time zone 'America/Sao_Paulo') = 6 and extract(hour from entrada at time zone 'America/Sao_Paulo') between 8 and 11)
  )
  select jsonb_build_object(
    'posts_compra', coalesce((select jsonb_agg(to_jsonb(p) order by p.compra desc, p.comentarios desc) from (select * from posts_compra order by compra desc, comentarios desc limit 15) p), '[]'),
    'comentarios', jsonb_build_object(
      'total', (select count(*) from coment),
      'compra', (select count(*) from coment_class where preco or agendar or onde or convenio or contato),
      'posts_com_compra', (select count(*) from posts_compra)),
    'compra_por_tema', coalesce((select jsonb_agg(to_jsonb(x) order by x.compra desc) from (
      select coalesce(tema, '') as tema, count(*) as posts, sum(compra) as compra, sum(comentarios) as comentarios from posts_compra group by 1) x), '[]'),
    'compra_por_formato', coalesce((select jsonb_agg(to_jsonb(x) order by x.compra desc) from (
      select coalesce(formato, '') as formato, count(*) as posts, sum(compra) as compra, sum(comentarios) as comentarios from posts_compra group by 1) x), '[]'),
    'temas_valor', coalesce((select jsonb_agg(to_jsonb(t) order by t.receita desc, t.ganhos desc) from temas_valor t), '[]'),
    'resposta', coalesce((select jsonb_agg(to_jsonb(x) order by x.faixa) from (
      select faixa, count(*) as conversas, count(*) filter (where agendou) as agendaram from resp group by 1) x), '[]'),
    'resposta_tema', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select tema, count(*) filter (where faixa in ('1_ate_15min', '2_15_a_60min')) as rapidas,
        count(*) filter (where faixa in ('1_ate_15min', '2_15_a_60min') and agendou) as rapidas_agendaram,
        count(*) filter (where faixa in ('3_1_a_4h', '4_mais_de_4h', '5_sem_resposta')) as lentas,
        count(*) filter (where faixa in ('3_1_a_4h', '4_mais_de_4h', '5_sem_resposta') and agendou) as lentas_agendaram
      from resp where tema is not null group by 1) x), '[]'),
    'cobertura', jsonb_build_object(
      'conversas', (select count(*) from conv),
      'com_lead', (select count(lead_id) from conv),
      'com_tema', (select count(*) from conv where tema is not null),
      'horario_comercial', (select count(*) from resp))
  )
  where (select pode from ok);
$function$;
revoke all on function public.conteudo_comercial_profundo(uuid, date, date) from public, anon;
grant execute on function public.conteudo_comercial_profundo(uuid, date, date) to authenticated;
