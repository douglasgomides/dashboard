-- Biblioteca de inspiração ("Swipe File Médico") — banco de posts de
-- referência (não são posts dos clientes) pra qualquer cliente se inspirar.
-- Global, não por client_id: todo usuário autenticado lê; só admin edita.
-- Nunca é conteúdo pronto pro cliente publicar — é referência/estrutura pra
-- adaptar, mantendo a regra de que a ferramenta nunca produz conteúdo final.

create table if not exists public.inspiration_posts (
  id uuid primary key default gen_random_uuid(),
  grupo text not null,
  especialidade text not null,
  midia text not null check (midia in ('post', 'reel')),
  formato text,
  metrica_valor integer,
  metrica_label text,
  multiplicador_mediana numeric,
  titulo text,
  fonte_url text,
  fonte_handle text,
  gancho text,
  estrutura text,
  por_que_funcionou text,
  como_adaptar text,
  replicabilidade text check (replicabilidade in ('alta', 'media', 'baixa')),
  replicabilidade_texto text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspiration_posts_esp on public.inspiration_posts(especialidade);
create index if not exists idx_inspiration_posts_grupo on public.inspiration_posts(grupo);

alter table public.inspiration_posts enable row level security;

create policy "any authenticated user reads inspiration posts" on public.inspiration_posts
  for select to authenticated
  using (true);

create policy "admin manages inspiration posts" on public.inspiration_posts
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates inspiration posts" on public.inspiration_posts
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin deletes inspiration posts" on public.inspiration_posts
  for delete to authenticated
  using (public.is_app_admin());
