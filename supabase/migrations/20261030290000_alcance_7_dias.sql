-- Frequência de 7 dias no diagnóstico de anúncios (auditoria de 30/10/2026, achado 33): era calculada somando o
-- alcance diário, mas a mesma pessoa vista em dias diferentes contava de novo, e a frequência saía baixa (DC: 1,12
-- mostrado, 1,38 real). Alcance não se soma; esta tabela guarda o alcance e a frequência da janela inteira, como a
-- Meta devolve, uma linha por campanha. Escrita só pelo servidor (sync pela Graph); leitura igual à de meta_ads_daily.
-- Reversão: drop table public.meta_ads_alcance_janela;

create table if not exists public.meta_ads_alcance_janela (
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id text not null,
  campaign_id text not null,
  desde date not null,
  ate date not null,
  reach numeric,
  impressions numeric,
  frequency numeric,
  lido_em timestamptz not null default now(),
  primary key (client_id, campaign_id)
);
alter table public.meta_ads_alcance_janela enable row level security;
revoke all on table public.meta_ads_alcance_janela from public, anon, authenticated;
grant select on table public.meta_ads_alcance_janela to authenticated;
grant select, insert, update, delete on table public.meta_ads_alcance_janela to service_role;

drop policy if exists "read own or admin reads all ads window" on public.meta_ads_alcance_janela;
create policy "read own or admin reads all ads window" on public.meta_ads_alcance_janela
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
