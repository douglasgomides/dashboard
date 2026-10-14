-- Registro de pausar/reativar campanha pelo painel (api/_lib/anuncio-status.ts). Escrita só pelo servidor.
create table if not exists public.anuncios_acoes (
  id bigserial primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  campaign_id text not null,
  de text,
  para text not null,
  por uuid,
  ok boolean not null,
  erro text,
  em timestamptz not null default now()
);
alter table public.anuncios_acoes enable row level security;
create policy "acoes anuncio: admin ou membro le" on public.anuncios_acoes for select to authenticated using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.anuncios_acoes from anon;
