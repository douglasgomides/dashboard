-- Comentários dos posts, puxados direto da Meta Graph API
-- (instagram_manage_comments). Objetivo: levantar as dúvidas reais que
-- pacientes deixam nos posts — matéria-prima pra pauta, não conteúdo pronto.
-- A classificação "é pergunta?" é heurística (pontuação/palavra
-- interrogativa), sem IA generativa — mesma linha do resto do dashboard.
create table public.instagram_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  instagram_post_id uuid not null references public.instagram_posts(id) on delete cascade,
  external_comment_id text not null,
  text text not null,
  author_username text,
  like_count integer,
  is_question boolean not null default false,
  commented_at timestamptz,
  created_at timestamptz not null default now(),
  unique (instagram_post_id, external_comment_id)
);

create index idx_instagram_comments_client on public.instagram_comments(client_id);
create index idx_instagram_comments_post on public.instagram_comments(instagram_post_id);
create index idx_instagram_comments_question on public.instagram_comments(client_id) where is_question;

alter table public.instagram_comments enable row level security;

create policy "read own or admin reads all comments" on public.instagram_comments
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Mesmo padrão de cursor do backfill de posts: uma invocação da função na
-- Vercel não dá conta de puxar comentário de todo o histórico de uma vez,
-- então guarda onde parou por conta.
create table public.instagram_comments_sync_state (
  instagram_account_id uuid primary key references public.instagram_accounts(id) on delete cascade,
  last_synced_post_posted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.instagram_comments_sync_state enable row level security;

create policy "admin reads instagram comments sync state" on public.instagram_comments_sync_state
  for select using (public.is_app_admin());
