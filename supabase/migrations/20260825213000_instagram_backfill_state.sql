-- Guarda o progresso da paginação do backfill direto via Meta Graph API por
-- conta. Sem isso, cada invocação da função na Vercel (limitada a ~300s)
-- não tinha como saber onde a invocação anterior parou — o cursor `after`
-- da Meta só existia na resposta HTTP, que se perdia. Com o estado aqui,
-- o endpoint retoma sozinho a cada chamada, e uma vez concluído o backfill
-- (backfill_done = true) o mesmo endpoint vira o sync incremental diário
-- (busca só os posts mais recentes, sem cursor).
create table public.instagram_backfill_state (
  instagram_account_id uuid primary key references public.instagram_accounts(id) on delete cascade,
  next_cursor text,
  backfill_done boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.instagram_backfill_state enable row level security;

create policy "admin reads instagram backfill state"
  on public.instagram_backfill_state for select
  using (public.is_app_admin());
