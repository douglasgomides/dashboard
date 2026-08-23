-- Doctor Creator Intelligence Hub — Fase 1
-- Multi-tenant core (clients + membership), Instagram content data synced from
-- Windsor.ai, and the vocabulary of the DC methodology (funil de consciência
-- C0-C3, e os 6 estágios de conteúdo: Diferencial, Narrativa, Percepção,
-- Confiança, Venda, Multiplicação). Nunca guarda conteúdo pronto — só
-- métricas e classificação do que já foi publicado.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  instagram_handle text,
  -- Camada transversal: status do Selo CFM, puxado de fora (produto separado).
  -- Só um indicador visual aqui — a lógica de compliance vive no CFM Score.
  cfm_score_status text check (cfm_score_status in ('verde', 'amarelo', 'vermelho')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Quem pode ver/editar os dados de um cliente. Fase 1: preenchido manualmente
-- (o próprio Douglas/estrategista + o médico, se tiver login). Fase 2+ pode
-- ganhar convite self-service, mas a tabela já é o modelo final.
create table if not exists public.client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'strategist' check (role in ('owner', 'strategist', 'viewer')),
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);

create index if not exists idx_client_members_user on public.client_members(user_id);

-- Conta Instagram conectada via Windsor.ai. Fase 1: configurada manualmente
-- com o account id que já existe no workspace Windsor. Fase 2+: ganha OAuth
-- self-service (connected_manually vira false, connected_by fica registrado).
create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  windsor_account_id text not null unique,
  ig_username text,
  ig_user_id text,
  connected_manually boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_instagram_accounts_client on public.instagram_accounts(client_id);

-- Um post publicado, com a última métrica sincronizada da Windsor e a
-- classificação editorial pela metodologia DC. A classificação (funnel_stage,
-- methodology_stage, tema) é manual/curada — a API do Instagram não sabe
-- disso, só o estrategista.
create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  windsor_media_id text not null,
  media_type text, -- IMAGE, VIDEO, CAROUSEL_ALBUM, REEL (bruto da Meta)
  format text check (format in ('reels', 'carrossel', 'estatico', 'stories')),
  permalink text,
  thumbnail_url text,
  caption text,
  posted_at timestamptz,

  -- Funil de consciência do paciente (C0: não sabe que precisa -> C3: decisão de compra)
  funnel_stage text check (funnel_stage in ('C0', 'C1', 'C2', 'C3')),
  -- Estágio da metodologia de conteúdo DC
  methodology_stage text check (
    methodology_stage in ('diferencial', 'narrativa', 'percepcao', 'confianca', 'venda', 'multiplicacao')
  ),
  tema text, -- pilar editorial livre (ex.: "Rinoplastia", "Rotina de consultório")

  -- Snapshot mais recente sincronizado da Windsor (connector "instagram", tabela media_insights)
  reach integer,
  saved integer,
  likes integer,
  comments integer,
  shares integer,
  views integer,
  engagement integer,
  metrics_updated_at timestamptz,

  created_at timestamptz not null default now(),
  unique (instagram_account_id, windsor_media_id)
);

create index if not exists idx_instagram_posts_client on public.instagram_posts(client_id);
create index if not exists idx_instagram_posts_account on public.instagram_posts(instagram_account_id);
create index if not exists idx_instagram_posts_posted_at on public.instagram_posts(posted_at desc);

-- Série diária de métricas de perfil (Windsor connector "instagram", tabelas
-- user_insights_day / user_insights_day_total_value) — alimenta a Visão Geral
-- do Mês. Um snapshot por conta por dia.
create table if not exists public.instagram_account_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  date date not null,
  followers_count integer,
  new_followers integer, -- follower_count_1d
  reach integer, -- reach_1d
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  total_interactions integer,
  profile_links_taps integer,
  created_at timestamptz not null default now(),
  unique (instagram_account_id, date)
);

create index if not exists idx_ig_daily_metrics_client on public.instagram_account_daily_metrics(client_id);
create index if not exists idx_ig_daily_metrics_date on public.instagram_account_daily_metrics(date desc);

-- "Próximos ângulos" — sugestões de próximo conteúdo, geradas por heurística
-- (ver public.suggest_next_angles) a partir do que já converteu melhor.
-- Fase 1: heurística simples sobre salvamento/engajamento. Fase 2+ pode
-- cruzar com conversão real (consulta/venda) em vez de só métrica de vaidade.
-- Nunca guarda o conteúdo pronto — só a direção (tema/etapa/formato) e o porquê.
create table if not exists public.content_angle_suggestions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tema text,
  funnel_stage text check (funnel_stage in ('C0', 'C1', 'C2', 'C3')),
  methodology_stage text check (
    methodology_stage in ('diferencial', 'narrativa', 'percepcao', 'confianca', 'venda', 'multiplicacao')
  ),
  format text check (format in ('reels', 'carrossel', 'estatico', 'stories')),
  rationale text not null,
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_angle_suggestions_client on public.content_angle_suggestions(client_id, status);

-- RLS ---------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.instagram_accounts enable row level security;
alter table public.instagram_posts enable row level security;
alter table public.instagram_account_daily_metrics enable row level security;
alter table public.content_angle_suggestions enable row level security;

create or replace function public.is_client_member(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_members
    where client_id = p_client_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_client_member(uuid) to authenticated;

create policy "members read their clients" on public.clients
  for select to authenticated
  using (public.is_client_member(id));

create policy "members read their membership rows" on public.client_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_client_member(client_id));

create policy "members read their instagram accounts" on public.instagram_accounts
  for select to authenticated
  using (public.is_client_member(client_id));

create policy "members read their instagram posts" on public.instagram_posts
  for select to authenticated
  using (public.is_client_member(client_id));

create policy "members write post classification" on public.instagram_posts
  for update to authenticated
  using (public.is_client_member(client_id))
  with check (public.is_client_member(client_id));

create policy "members read their daily metrics" on public.instagram_account_daily_metrics
  for select to authenticated
  using (public.is_client_member(client_id));

create policy "members read their angle suggestions" on public.content_angle_suggestions
  for select to authenticated
  using (public.is_client_member(client_id));

create policy "members update their angle suggestions" on public.content_angle_suggestions
  for update to authenticated
  using (public.is_client_member(client_id))
  with check (public.is_client_member(client_id));

-- Note: INSERT/DELETE on clients, client_members, instagram_accounts and
-- instagram_posts (sync) are intentionally left to the service-role key only
-- (server-side sync job / admin action) — no client-side policy for them.

-- Heurística de "próximos ângulos" -----------------------------------------

-- Fase 1: ranqueia combinações (tema, funnel_stage, methodology_stage, format)
-- já publicadas pelo salvamento médio (proxy de "vale a pena guardar/voltar",
-- mais alinhado a decisão de compra do que like) e sugere repetir a que
-- performou acima da média da própria conta nos últimos 90 dias.
create or replace function public.suggest_next_angles(p_client_id uuid, p_limit int default 5)
returns table (
  tema text,
  funnel_stage text,
  methodology_stage text,
  format text,
  avg_saved numeric,
  post_count bigint,
  rationale text
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from public.instagram_posts
    where client_id = p_client_id
      and posted_at >= now() - interval '90 days'
      and tema is not null
  ),
  overall as (
    select coalesce(avg(saved), 0) as avg_saved from scoped
  ),
  grouped as (
    select
      s.tema,
      s.funnel_stage,
      s.methodology_stage,
      s.format,
      avg(s.saved) as avg_saved,
      count(*) as post_count
    from scoped s
    group by s.tema, s.funnel_stage, s.methodology_stage, s.format
    having count(*) >= 2
  )
  select
    g.tema,
    g.funnel_stage,
    g.methodology_stage,
    g.format,
    round(g.avg_saved, 1) as avg_saved,
    g.post_count,
    format(
      '%s posts sobre "%s" (%s · %s) salvaram em média %s — %sx a média da conta nos últimos 90 dias.',
      g.post_count, g.tema, coalesce(g.funnel_stage, '—'), coalesce(g.methodology_stage, '—'),
      round(g.avg_saved, 1),
      round(g.avg_saved / nullif((select avg_saved from overall), 0), 1)
    ) as rationale
  from grouped g
  where g.avg_saved > (select avg_saved from overall)
  order by g.avg_saved desc
  limit p_limit;
$$;

grant execute on function public.suggest_next_angles(uuid, int) to authenticated;
