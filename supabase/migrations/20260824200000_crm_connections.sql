-- Cadastro de conexões de CRM por cliente (Kommo, Feegow, Ninsaúde, etc.)
-- pro admin conectar via painel. Guarda o token de acesso, por isso é
-- visível SÓ pra admin — diferente de instagram_accounts, que o próprio
-- cliente pode ler (aqui não tem token sensível pra proteger).
create table public.crm_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('kommo', 'feegow', 'ninsaude')),
  subdomain text,
  access_token text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index crm_connections_client_id_idx on public.crm_connections(client_id);

alter table public.crm_connections enable row level security;

create policy "admin reads crm connections" on public.crm_connections
  for select to authenticated
  using (public.is_app_admin());

create policy "admin inserts crm connections" on public.crm_connections
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates crm connections" on public.crm_connections
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin deletes crm connections" on public.crm_connections
  for delete to authenticated
  using (public.is_app_admin());
