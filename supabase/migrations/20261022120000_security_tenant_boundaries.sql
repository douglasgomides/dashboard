-- Hardening aditivo: nenhuma alteração de versões já publicadas e nenhum dado apagado.
-- O aplicativo exige login. Grants padrão do Supabase não devem abrir tabelas,
-- views ou RPCs ao papel anon, nem permitir TRUNCATE (que ignora RLS).
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;
revoke execute on all functions in schema public from public, anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon;
alter default privileges in schema public revoke all on sequences from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Grants por coluna não são removidos pelo REVOKE da tabela.
do $column_acl$
declare r record;
begin
  for r in select c.relname, string_agg(format('%I',a.attname), ', ' order by a.attnum) as cols
    from pg_class c join pg_attribute a on a.attrelid=c.oid
    where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')
      and a.attnum>0 and not a.attisdropped group by c.relname
  loop
    execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon',r.cols,r.relname);
    execute format('revoke references (%s) on public.%I from authenticated',r.cols,r.relname);
  end loop;
end;
$column_acl$;

-- A view antes usava o proprietário e contornava as policies das tabelas-base.
-- PostgreSQL 15+, já necessário para sap_funil_semanal.
alter view public.meta_ads_daily_v set (security_invoker = true);

-- Corrige somente o path legado exatamente public. Paths vazios das RPCs
-- recentes são seguros e permanecem intactos; paths com extensões exigem revisão.
-- Sem pg_temp explícito ao final, tabelas temporárias sombreiam nomes legados.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proconfig @> array['search_path=public']
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- RLS protege linhas, não colunas. Antes um membro podia alterar alcance,
-- legendas, IDs de conta e até mover o post para outro cliente do qual era membro.
-- O navegador só classifica; métricas e identidade vêm do servidor.
revoke update on public.instagram_posts from authenticated;
do $$ declare cols text; begin
  select string_agg(format('%I',attname), ', ' order by attnum) into cols from pg_attribute
    where attrelid='public.instagram_posts'::regclass and attnum>0 and not attisdropped;
  execute format('revoke update (%s) on public.instagram_posts from authenticated',cols);
end $$;
grant update (funnel_stage, methodology_stage, tema, format) on public.instagram_posts to authenticated;
drop policy if exists "write own or admin writes all post classification" on public.instagram_posts;
drop policy if exists "editors classify their posts" on public.instagram_posts;
create policy "editors classify their posts" on public.instagram_posts
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

revoke update on public.content_angle_suggestions from authenticated;
do $$ declare cols text; begin
  select string_agg(format('%I',attname), ', ' order by attnum) into cols from pg_attribute
    where attrelid='public.content_angle_suggestions'::regclass and attnum>0 and not attisdropped;
  execute format('revoke update (%s) on public.content_angle_suggestions from authenticated',cols);
end $$;
grant update (status) on public.content_angle_suggestions to authenticated;
drop policy if exists "update own or admin updates all angle suggestions" on public.content_angle_suggestions;
drop policy if exists "editors update suggestion status" on public.content_angle_suggestions;
create policy "editors update suggestion status" on public.content_angle_suggestions
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

-- tem_modulo e agentes_marcar_marco pertencem ao contrato operacional de
-- 20261022090000. Não substituir suas regras de contrato, rodada, evidência,
-- consumo da aprovação nem vínculo ClickUp por definições anteriores.
