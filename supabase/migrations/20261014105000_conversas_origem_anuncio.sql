-- Origem de anúncio de cada conversa de WhatsApp (clique para WhatsApp): o "referral" que a Meta manda junto da
-- 1ª mensagem (id do anúncio, ctwa_clid, título, link). Preenchido pelo sync do WTS (api/_lib/conversas-wts.ts).
create table if not exists public.conversas_origem_anuncio (
  conversa_id uuid primary key references public.conversas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_id text,
  campaign_id text,
  ctwa_clid text,
  headline text,
  source_url text,
  bruto jsonb,
  achado_em timestamptz not null default now()
);
create index if not exists conversas_origem_anuncio_ad on public.conversas_origem_anuncio (client_id, ad_id);
alter table public.conversas_origem_anuncio enable row level security;
create policy "origem anuncio: admin ou membro le" on public.conversas_origem_anuncio for select to authenticated using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.conversas_origem_anuncio from anon;
