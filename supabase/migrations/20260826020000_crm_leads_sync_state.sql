-- Mesmo padrão do backfill de posts (instagram_backfill_state): uma
-- invocação da função na Vercel não dá conta de puxar as dezenas de
-- milhares de leads históricos da Kommo de uma vez, então guarda a página
-- onde parou. Uma vez concluído o backfill, a mesma chamada vira sync
-- incremental diário (só leads atualizados recentemente).
create table public.crm_leads_sync_state (
  crm_connection_id uuid primary key references public.crm_connections(id) on delete cascade,
  next_page integer not null default 1,
  backfill_done boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.crm_leads_sync_state enable row level security;

create policy "admin reads crm leads sync state" on public.crm_leads_sync_state
  for select using (public.is_app_admin());
