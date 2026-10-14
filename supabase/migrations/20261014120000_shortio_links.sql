-- Links do short.gy (Short.io) de toda a conta, atribuídos ao cliente (api/_lib/shortio-sync.ts), e cliques/dia.
create table if not exists public.shortio_links (
  id text primary key,
  client_id uuid references public.clients(id) on delete set null,
  dominio text,
  short_url text,
  original_url text,
  titulo text,
  caminho text,
  tags text[],
  criado_em timestamptz,
  cliques_total int,
  cliques_humanos int,
  atribuicao text,            -- bio | nome | handle | manual | null (sem cliente)
  atribuicao_detalhe text,
  stats_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists shortio_links_cliente on public.shortio_links (client_id);
create table if not exists public.shortio_cliques_dia (
  link_id text not null references public.shortio_links(id) on delete cascade,
  dia date not null,
  cliques int not null,
  primary key (link_id, dia)
);
alter table public.shortio_links enable row level security;
alter table public.shortio_cliques_dia enable row level security;
create policy "shortio: admin ou membro le" on public.shortio_links for select to authenticated using (public.is_app_admin() or (client_id is not null and public.is_client_member(client_id)));
create policy "shortio: admin atribui" on public.shortio_links for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "shortio dia: admin ou membro le" on public.shortio_cliques_dia for select to authenticated using (exists (select 1 from public.shortio_links l where l.id = link_id and (public.is_app_admin() or (l.client_id is not null and public.is_client_member(l.client_id)))));
revoke all on public.shortio_links from anon;
revoke all on public.shortio_cliques_dia from anon;
