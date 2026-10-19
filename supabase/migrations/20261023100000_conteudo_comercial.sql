-- Conteúdo × Comercial: leitura do lado do paciente em todas as conversas (inclusive Kommo) e o cruzamento com os posts.
--   conversas_tema: tema (do vocabulário dos posts da clínica), assunto, intenção, preço pedido e objeções. Tabela própria
--     para não mexer em conversas_resumos (auditoria do atendimento, prova de resultado e as demais leituras).
--     Escrita só pelo servidor (service_role); leitura para admin e membros do cliente.
--   conteudo_comercial(): por dia, dia da semana × hora, tema, etapa do funil por semana, objeções e assuntos.
-- Sem gatilho. Nada é enviado a paciente.
-- Reversão: drop function public.conteudo_comercial(uuid, date, date); drop table public.conversas_tema;

create table if not exists public.conversas_tema (
  conversa_id uuid primary key references public.conversas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  sem_texto boolean not null default false,
  tema text,
  assunto text,
  intencao text check (intencao in ('agendar','informacao','retorno','administrativo','outro')),
  comercial boolean,
  preco_pedido boolean,
  objecoes text[] not null default '{}',
  ate_msg_em timestamptz,
  gerado_em timestamptz not null default now(),
  modelo text
);
create index if not exists conversas_tema_cliente_idx on public.conversas_tema (client_id, tema);
alter table public.conversas_tema enable row level security;
drop policy if exists conversas_tema_leitura on public.conversas_tema;
create policy conversas_tema_leitura on public.conversas_tema for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.conversas_tema from anon, authenticated;
grant select on public.conversas_tema to authenticated;
grant all on public.conversas_tema to service_role;

create or replace function public.conteudo_comercial(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and p_ate >= p_de and p_ate - p_de <= 120 as pode),
  janela as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini, ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  posts as (
    select (p.posted_at at time zone 'America/Sao_Paulo') as ts, nullif(btrim(p.tema), '') as tema, p.funnel_stage as etapa, coalesce(p.reach, 0) as alcance
    from instagram_posts p, janela j
    where p.client_id = p_client and p.posted_at >= j.ini and p.posted_at < j.fim and (select pode from ok)
  ),
  conv as (
    select (c.iniciada_em at time zone 'America/Sao_Paulo') as ts,
      t.conversa_id is not null as lida, coalesce(t.sem_texto, false) as sem_texto, t.tema, lower(btrim(t.assunto)) as assunto,
      coalesce(t.objecoes, '{}') as objecoes, coalesce(t.preco_pedido, false) as preco,
      coalesce(t.comercial, (r.resumo->>'comercial')::boolean, true) as comercial,
      (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou' or l.outcome = 'won'
        or coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)') as agendou
    from conversas c
    cross join janela j
    left join conversas_tema t on t.conversa_id = c.id
    left join conversas_resumos r on r.conversa_id = c.id
    left join crm_leads l on l.id = c.lead_id
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    where c.client_id = p_client and c.ultima_msg_em >= j.ini and c.iniciada_em >= j.ini and c.iniciada_em < j.fim and (select pode from ok)
  ),
  dias as (select generate_series(p_de, p_ate, interval '1 day')::date as dia where (select pode from ok)),
  por_dia as (
    select d.dia,
      (select count(*) from posts p where p.ts::date = d.dia) as posts,
      (select coalesce(sum(alcance), 0) from posts p where p.ts::date = d.dia) as alcance,
      (select count(*) from conv c where c.ts::date = d.dia) as conversas,
      (select count(*) from conv c where c.ts::date = d.dia and c.comercial) as comerciais,
      (select count(*) from conv c where c.ts::date = d.dia and c.agendou) as agendaram
    from dias d
  ),
  efeito as (
    select
      count(*) filter (where posts > 0) as dias_com_post,
      round(avg(conversas) filter (where posts > 0), 1) as media_com_post,
      count(*) filter (where posts = 0) as dias_sem_post,
      round(avg(conversas) filter (where posts = 0), 1) as media_sem_post,
      round(avg(prox) filter (where posts > 0), 1) as media_dia_seguinte_com_post,
      round(avg(prox) filter (where posts = 0), 1) as media_dia_seguinte_sem_post
    from (select posts, conversas, lead(conversas) over (order by dia) as prox from por_dia) x
  ),
  grade as (
    select dow, hora, sum(np) as posts, sum(nc) as conversas, sum(na) as agendaram from (
      select extract(dow from ts)::int dow, extract(hour from ts)::int hora, 1 np, 0 nc, 0 na from posts
      union all
      select extract(dow from ts)::int, extract(hour from ts)::int, 0, 1, case when agendou then 1 else 0 end from conv
    ) g group by 1, 2
  ),
  temas as (
    select tema,
      sum(np) as posts, sum(alc) as alcance, sum(nc) as conversas, sum(ncom) as comerciais, sum(npr) as pediram_preco, sum(na) as agendaram
    from (
      select tema, 1 np, alcance alc, 0 nc, 0 ncom, 0 npr, 0 na from posts where tema is not null
      union all
      select tema, 0, 0, 1, case when comercial then 1 else 0 end, case when preco then 1 else 0 end, case when agendou then 1 else 0 end from conv where tema is not null
    ) t group by 1
  ),
  semana_posts as (
    select date_trunc('week', ts)::date as semana,
      count(*) filter (where etapa = 'C0') c0, count(*) filter (where etapa = 'C1') c1,
      count(*) filter (where etapa = 'C2') c2, count(*) filter (where etapa = 'C3') c3
    from posts group by 1
  ),
  semanas as (
    select d.semana, coalesce(sp.c0, 0) c0, coalesce(sp.c1, 0) c1, coalesce(sp.c2, 0) c2, coalesce(sp.c3, 0) c3, d.conversas, d.agendaram
    from (select date_trunc('week', dia)::date as semana, sum(conversas) conversas, sum(agendaram) agendaram from por_dia group by 1) d
    left join semana_posts sp on sp.semana = d.semana
  ),
  objecoes as (select o as objecao, count(*) n, count(*) filter (where agendou) agendaram from conv, unnest(objecoes) o group by 1),
  assuntos as (select assunto, count(*) n, count(*) filter (where agendou) agendaram from conv where assunto is not null group by 1 order by 2 desc limit 15)
  select jsonb_build_object(
    'dias', coalesce((select jsonb_agg(to_jsonb(d) order by d.dia) from por_dia d), '[]'),
    'efeito_post', (select to_jsonb(e) from efeito e),
    'grade', coalesce((select jsonb_agg(to_jsonb(g)) from grade g), '[]'),
    'temas', coalesce((select jsonb_agg(to_jsonb(t) order by t.conversas desc, t.posts desc) from temas t), '[]'),
    'semanas', coalesce((select jsonb_agg(to_jsonb(s) order by s.semana) from semanas s), '[]'),
    'objecoes', coalesce((select jsonb_agg(to_jsonb(o) order by o.n desc) from objecoes o), '[]'),
    'assuntos', coalesce((select jsonb_agg(to_jsonb(a) order by a.n desc) from assuntos a), '[]'),
    'cobertura', jsonb_build_object(
      'conversas', (select count(*) from conv),
      'lidas', (select count(*) from conv where lida and not sem_texto),
      'sem_texto', (select count(*) from conv where sem_texto),
      'com_tema', (select count(*) from conv where tema is not null),
      'posts', (select count(*) from posts),
      'posts_com_tema', (select count(*) from posts where tema is not null))
  )
  where (select pode from ok);
$function$;
revoke all on function public.conteudo_comercial(uuid, date, date) from public, anon;
grant execute on function public.conteudo_comercial(uuid, date, date) to authenticated;
