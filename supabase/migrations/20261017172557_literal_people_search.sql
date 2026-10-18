-- Correção aditiva do contrato hospedado: ILIKE interpretava % e _ como
-- curingas. Preserva exatamente as duas assinaturas de retorno conhecidas.
-- No banco novo a função ainda não existe nesta versão cronológica; o bootstrap
-- 20261022140000 a criará com busca literal. Não cria/dropa função ausente.
do $migration$
declare
  v_function regprocedure := to_regprocedure('public.buscar_pessoas(uuid,text)');
  v_return text;
  v_projection text;
begin
  if v_function is null then return; end if;
  v_return := pg_get_function_result(v_function);
  if pg_get_function_identity_arguments(v_function) <> 'p_client uuid, p_q text' then
    raise exception 'buscar_pessoas: argumentos inesperados; revisar contrato antes de substituir';
  end if;
  if v_return = 'TABLE(id uuid, nome text, ig_username text, telefone_final text, origem text)' then
    v_projection := $projection$p.id, p.nome, p.ig_username,
      case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
      p.origem_primeira$projection$;
  elsif v_return = 'TABLE(id uuid, nome text, telefone_final text, ig_username text)' then
    v_projection := $projection$p.id, p.nome,
      case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
      p.ig_username$projection$;
  else
    raise exception 'buscar_pessoas: retorno inesperado; revisar contrato antes de substituir';
  end if;

  -- As substituições são constantes escolhidas somente pelas duas assinaturas
  -- acima; nenhum argumento fornecido pelo usuário entra no SQL de definição.
  execute format($definition$
    create or replace function public.buscar_pessoas(p_client uuid, p_q text)
    returns %s
    language sql stable security definer set search_path = public, pg_temp
    as $body$
      with input as (
        select btrim(coalesce(p_q, '')) as term
      ), search as (
        select term, ltrim(term, '@') as handle,
          regexp_replace(term, '\D', '', 'g') as digits from input
      )
      select %s
      from public.pessoas p cross join search s
      where p.client_id = p_client
        and (public.is_app_admin() or public.is_client_member(p_client))
        and length(s.term) between 2 and 100
        and (strpos(lower(coalesce(p.nome, '')), lower(s.term)) > 0
          or (length(s.handle) > 0 and strpos(lower(coalesce(p.ig_username, '')), lower(s.handle)) > 0)
          or (length(s.digits) >= 4 and strpos(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), s.digits) > 0))
      order by p.atualizado_em desc nulls last, p.id
      limit 30;
    $body$;
  $definition$, v_return, v_projection);
  execute 'revoke all on function public.buscar_pessoas(uuid,text) from public, anon';
  execute 'grant execute on function public.buscar_pessoas(uuid,text) to authenticated, service_role';
end;
$migration$;
