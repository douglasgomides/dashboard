-- Stories guardados, um por linha. Story some em 24 horas e a Meta não guarda histórico, então o sync diário
-- grava o que está no ar (api/_lib/meta-graph-sync.ts, guardarStories). Alimenta "Top 20 stories".
create table if not exists public.instagram_stories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  ig_media_id text not null,
  posted_at timestamptz,
  media_type text,
  permalink text,
  thumbnail_url text,
  reach integer,
  views integer,
  replies integer,
  shares integer,
  total_interactions integer,
  profile_visits integer,
  follows integer,
  metrics_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (instagram_account_id, ig_media_id)
);

create index if not exists instagram_stories_cliente_data on public.instagram_stories (client_id, posted_at desc);

alter table public.instagram_stories enable row level security;

drop policy if exists "membro ou admin le stories" on public.instagram_stories;
create policy "membro ou admin le stories" on public.instagram_stories
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Escrita só pelo service_role (ignora RLS).
revoke all on public.instagram_stories from anon, authenticated, public;
grant select on public.instagram_stories to authenticated;
