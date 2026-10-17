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

-- A view antes usava o proprietário e contornava as policies das tabelas-base.
-- PostgreSQL 15+, já necessário para sap_funil_semanal.
alter view public.meta_ads_daily_v set (security_invoker = true);

-- SECURITY DEFINER precisa colocar pg_temp explicitamente depois do schema
-- confiável: sem isso uma tabela temporária pode sombrear nomes não qualificados.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- RLS protege linhas, não colunas. Antes um membro podia alterar alcance,
-- legendas, IDs de conta e até mover o post para outro cliente do qual era membro.
-- O navegador só classifica; métricas e identidade vêm do servidor.
revoke update on public.instagram_posts from authenticated;
grant update (funnel_stage, methodology_stage, tema, format) on public.instagram_posts to authenticated;
drop policy if exists "write own or admin writes all post classification" on public.instagram_posts;
drop policy if exists "editors classify their posts" on public.instagram_posts;
create policy "editors classify their posts" on public.instagram_posts
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

revoke update on public.content_angle_suggestions from authenticated;
grant update (status) on public.content_angle_suggestions to authenticated;
drop policy if exists "update own or admin updates all angle suggestions" on public.content_angle_suggestions;
drop policy if exists "editors update suggestion status" on public.content_angle_suggestions;
create policy "editors update suggestion status" on public.content_angle_suggestions
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

-- O agente de servidor propõe itens sem usuário humano no JWT. O gate antigo
-- recusava até módulos ativos para service_role, apesar de brain_propor autorizar
-- esse papel. O service_role já tem acesso irrestrito a cliente_modulos por RLS.
create or replace function public.tem_modulo(p_client_id uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when not (public.is_app_admin() or public.is_client_member(p_client_id)
              or coalesce(auth.jwt()->>'role', '') = 'service_role') then false
    when exists (select 1 from public.cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo) then
      exists (select 1 from public.cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo and m.status in ('ativo', 'beta'))
    else p_modulo = 'hub' and exists (select 1 from public.clients c where c.id = p_client_id)
  end;
$$;
revoke all on function public.tem_modulo(uuid, text) from public, anon;
grant execute on function public.tem_modulo(uuid, text) to authenticated, service_role;

-- Aprovação humana só autoriza a clínica, o marco e a evidência revisados.
-- Antes qualquer aprovação de qualquer fluxo podia marcar qualquer marco.
create or replace function public.agentes_marcar_marco(p_aprovacao uuid, p_clinica_id uuid, p_marco integer, p_evidencia text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_aprovador uuid; v_claims text := current_setting('request.jwt.claims', true);
begin
  select a.decidido_por into v_aprovador
  from public.aprovacoes a
  join public.agente_execucoes e on e.id = a.execucao_id and e.client_id = a.client_id
  join public.sap_clinicas c on c.client_id = a.client_id and c.id = p_clinica_id
  where a.id = p_aprovacao and a.estado = 'aprovada' and a.passo = 'aprovar_marco'
    and a.proposta->>'marco' = p_marco::text
    and a.proposta->>'evidencia' = p_evidencia
    and e.estado not in ('cancelada', 'falhou')
    and exists (select 1 from public.app_admins ad where ad.user_id = a.decidido_por);
  if v_aprovador is null then raise exception 'aprovacao nao autoriza esta acao'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_aprovador, 'role', 'authenticated')::text, true);
  perform public.sap_marcar_tarefa(p_clinica_id, p_marco, 'feito', null, p_evidencia, null, null);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$$;
revoke all on function public.agentes_marcar_marco(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.agentes_marcar_marco(uuid, uuid, integer, text) to service_role;
