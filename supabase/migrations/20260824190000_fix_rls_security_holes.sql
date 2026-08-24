-- Correção de duas falhas reais de segurança encontradas via advisor do
-- Supabase (mcp get_advisors type=security):
--
-- 1) app_admins ficou sem RLS habilitada desde a migration que a criou.
--    Com anon tendo SELECT/INSERT/UPDATE/DELETE via grant padrão do
--    PostgREST e sem RLS bloqueando, qualquer pessoa sem login podia se
--    inserir na tabela e virar admin do sistema inteiro.
alter table public.app_admins enable row level security;

create policy "admin reads app_admins" on public.app_admins
  for select to authenticated
  using (public.is_app_admin());

create policy "admin inserts app_admins" on public.app_admins
  for insert to authenticated
  with check (public.is_app_admin());

create policy "admin updates app_admins" on public.app_admins
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "admin deletes app_admins" on public.app_admins
  for delete to authenticated
  using (public.is_app_admin());

-- 2) suggest_next_angles é SECURITY DEFINER (bypassa RLS de propósito pra
--    fazer a agregação) mas não conferia se quem chamou tinha acesso ao
--    p_client_id passado — qualquer usuário logado podia ler os ângulos de
--    conteúdo de qualquer outro cliente só trocando o UUID. Adiciona o
--    mesmo gate que as policies RLS já usam nas outras tabelas.
create or replace function public.suggest_next_angles(p_client_id uuid, p_limit integer default 5)
returns table(tema text, funnel_stage text, methodology_stage text, format text, avg_saved numeric, post_count bigint, rationale text)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from public.instagram_posts
    where client_id = p_client_id
      and posted_at >= now() - interval '90 days'
      and tema is not null
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  overall as (
    select coalesce(avg(saved), 0) as avg_saved from scoped
  ),
  grouped as (
    select
      s.tema,
      s.funnel_stage,
      s.methodology_stage,
      s.format,
      avg(s.saved) as avg_saved,
      count(*) as post_count
    from scoped s
    group by s.tema, s.funnel_stage, s.methodology_stage, s.format
    having count(*) >= 2
  )
  select
    g.tema,
    g.funnel_stage,
    g.methodology_stage,
    g.format,
    round(g.avg_saved, 1) as avg_saved,
    g.post_count,
    format(
      '%s posts sobre "%s" (%s · %s) salvaram em média %s — %sx a média da conta nos últimos 90 dias.',
      g.post_count, g.tema, coalesce(g.funnel_stage, '—'), coalesce(g.methodology_stage, '—'),
      round(g.avg_saved, 1),
      round(g.avg_saved / nullif((select avg_saved from overall), 0), 1)
    ) as rationale
  from grouped g
  where g.avg_saved > (select avg_saved from overall)
  order by g.avg_saved desc
  limit p_limit;
$$;

-- 3) As três funções eram executáveis por `anon` — o Supabase concede
--    EXECUTE a anon/authenticated/service_role via ALTER DEFAULT PRIVILEGES
--    no schema public (grant direto por role, não herdado de PUBLIC). O app
--    inteiro exige login, então anon não precisa executar nada aqui.
revoke execute on function public.is_app_admin() from public;
revoke execute on function public.is_client_member(uuid) from public;
revoke execute on function public.suggest_next_angles(uuid, integer) from public;
revoke execute on function public.is_app_admin() from anon;
revoke execute on function public.is_client_member(uuid) from anon;
revoke execute on function public.suggest_next_angles(uuid, integer) from anon;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_client_member(uuid) to authenticated;
grant execute on function public.suggest_next_angles(uuid, integer) to authenticated;
