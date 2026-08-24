-- Doctor Creator Intelligence Hub — Papéis de acesso
-- Admin master: enxerga e administra todos os clientes, faz as conexões
-- (Instagram/CRM/etc.), cria usuários. Cliente: só enxerga o(s) cliente(s)
-- em que está em client_members (comportamento já existente da Fase 1).

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

grant execute on function public.is_app_admin() to authenticated;

-- clients: admin lê e escreve tudo; cliente só lê o que é membro.
drop policy if exists "members read their clients" on public.clients;
create policy "read own or admin reads all clients" on public.clients
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(id));

create policy "admin writes clients" on public.clients
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates clients" on public.clients
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin deletes clients" on public.clients
  for delete to authenticated
  using (public.is_app_admin());

-- client_members: admin gerencia vínculos; usuário lê o próprio vínculo.
drop policy if exists "members read their membership rows" on public.client_members;
create policy "read own membership or admin reads all" on public.client_members
  for select to authenticated
  using (public.is_app_admin() or user_id = auth.uid() or public.is_client_member(client_id));

create policy "admin manages membership" on public.client_members
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates membership" on public.client_members
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin removes membership" on public.client_members
  for delete to authenticated
  using (public.is_app_admin());

-- instagram_accounts: admin conecta/gerencia; cliente só lê a própria.
drop policy if exists "members read their instagram accounts" on public.instagram_accounts;
create policy "read own or admin reads all instagram accounts" on public.instagram_accounts
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

create policy "admin manages instagram accounts" on public.instagram_accounts
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates instagram accounts" on public.instagram_accounts
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin deletes instagram accounts" on public.instagram_accounts
  for delete to authenticated
  using (public.is_app_admin());

-- instagram_posts: leitura e classificação já eram do membro; admin ganha
-- acesso total (inclui poder classificar posts de qualquer cliente).
drop policy if exists "members read their instagram posts" on public.instagram_posts;
create policy "read own or admin reads all posts" on public.instagram_posts
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "members write post classification" on public.instagram_posts;
create policy "write own or admin writes all post classification" on public.instagram_posts
  for update to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id))
  with check (public.is_app_admin() or public.is_client_member(client_id));

-- instagram_account_daily_metrics: leitura.
drop policy if exists "members read their daily metrics" on public.instagram_account_daily_metrics;
create policy "read own or admin reads all daily metrics" on public.instagram_account_daily_metrics
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- content_angle_suggestions: leitura e status.
drop policy if exists "members read their angle suggestions" on public.content_angle_suggestions;
create policy "read own or admin reads all angle suggestions" on public.content_angle_suggestions
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "members update their angle suggestions" on public.content_angle_suggestions;
create policy "update own or admin updates all angle suggestions" on public.content_angle_suggestions
  for update to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id))
  with check (public.is_app_admin() or public.is_client_member(client_id));
