-- As funções abaixo existiam só no banco ativo (20261008230000 era um
-- placeholder). Recria os contratos em bancos novos sem substituir definições
-- legadas cuja assinatura de retorno não foi versionada. A instalação existente
-- deve ser comparada separadamente antes de substituir esses corpos.
do $bootstrap$
begin
  if to_regprocedure('public.jornada_resumo(uuid)') is null then
    execute $ddl$
      create function public.jornada_resumo(p_client uuid) returns jsonb
      language sql stable security definer set search_path = public, pg_temp as $body$
        select public.jornada_resumo(p_client, date '0001-01-01', date '9999-12-31');
      $body$;
    $ddl$;
  end if;
  if to_regprocedure('public.buscar_pessoas(uuid,text)') is null then
    execute $ddl$
      create function public.buscar_pessoas(p_client uuid, p_q text)
      returns table(id uuid, nome text, telefone_final text, ig_username text)
      language sql stable security definer set search_path = public, pg_temp as $body$
        select p.id, p.nome,
          case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
          p.ig_username
        from public.pessoas p
        where p.client_id = p_client
          and (public.is_app_admin() or public.is_client_member(p_client))
          and length(btrim(p_q)) between 2 and 100
          and (strpos(lower(coalesce(p.nome, '')), lower(btrim(p_q))) > 0
            or strpos(lower(coalesce(p.ig_username, '')), lower(coalesce(nullif(ltrim(btrim(p_q), '@'), ''), btrim(p_q)))) > 0
            or (length(regexp_replace(p_q, '\D', '', 'g')) >= 4
              and regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g') || '%'))
        order by p.nome nulls last, p.id
        limit 50;
      $body$;
    $ddl$;
  end if;
  if to_regprocedure('public.jornada_pessoa(uuid)') is null then
    execute $ddl$
      create function public.jornada_pessoa(p_pessoa uuid) returns jsonb
      language plpgsql volatile security definer set search_path = public, pg_temp as $body$
      declare v_client uuid; r jsonb;
      begin
        select p.client_id into v_client from public.pessoas p where p.id = p_pessoa;
        if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then return null; end if;
        insert into public.acessos_conversas(user_id, client_id, acao) values (auth.uid(), v_client, 'jornada_pessoa');
        select jsonb_build_object(
          'pessoa', jsonb_build_object('id', p.id, 'nome', p.nome, 'ig_username', p.ig_username,
            'telefone_final', case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end),
          'linha', coalesce((select jsonb_agg(x order by x->>'quando') from (
            select jsonb_build_object('tipo', t.tipo, 'quando', t.ocorreu_em,
              'legenda', left(ip.caption, 120), 'detalhe', t.origem_tipo) as x
            from public.toques t left join public.instagram_posts ip on ip.id = t.instagram_post_id and ip.client_id = v_client
            where t.pessoa_id = p.id and t.client_id = v_client
            order by t.ocorreu_em desc, t.id limit 500
          ) q), '[]'::jsonb),
          'leads', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'resultado', l.outcome, 'valor', l.price, 'origem', l.source))
            from public.crm_leads l where l.pessoa_id = p.id and l.client_id = v_client and l.removido_na_origem is null), '[]'::jsonb),
          'conversas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'provider', c.provider, 'ultima_msg_em', c.ultima_msg_em))
            from public.conversas c where c.pessoa_id = p.id and c.client_id = v_client), '[]'::jsonb)
        ) into r from public.pessoas p where p.id = p_pessoa and p.client_id = v_client;
        return r;
      end;
      $body$;
    $ddl$;
  end if;
end;
$bootstrap$;
revoke all on function public.jornada_resumo(uuid), public.buscar_pessoas(uuid,text), public.jornada_pessoa(uuid) from public, anon;
grant execute on function public.jornada_resumo(uuid), public.buscar_pessoas(uuid,text), public.jornada_pessoa(uuid) to authenticated, service_role;

-- As funções de conversa também filtram o tenant dos filhos. Isso protege a
-- leitura enquanto eventuais relações legadas ainda aguardam validação das FKs.
create or replace function public.listar_conversas(p_client uuid, p_limite integer default 50, p_offset integer default 0)
returns table(id uuid, pessoa_nome text, telefone_final text, provider text, ultima_msg_em timestamptz,
  ultima_msg_texto text, total_msgs bigint, lead_id uuid, codigo_ref text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then return; end if;
  insert into public.acessos_conversas(user_id, client_id, acao) values (auth.uid(), p_client, 'listar');
  return query select c.id, coalesce(p.nome, 'Sem nome'),
    case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
    c.provider, c.ultima_msg_em,
    (select m.texto from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client order by m.enviada_em desc, m.id desc limit 1),
    (select count(*) from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client),
    c.lead_id, c.codigo_ref
  from public.conversas c left join public.pessoas p on p.id = c.pessoa_id and p.client_id = p_client
  where c.client_id = p_client
  order by c.ultima_msg_em desc nulls last, c.id
  limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;
create or replace function public.ler_mensagens(p_conversa uuid)
returns table(id uuid, direcao text, autor text, texto text, tipo text, enviada_em timestamptz)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_client uuid;
begin
  select c.client_id into v_client from public.conversas c where c.id = p_conversa;
  if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then return; end if;
  insert into public.acessos_conversas(user_id, client_id, conversa_id, acao) values (auth.uid(), v_client, p_conversa, 'abrir');
  return query select m.id, m.direcao, m.autor, m.texto, m.tipo, m.enviada_em
    from public.mensagens m where m.conversa_id = p_conversa and m.client_id = v_client order by m.enviada_em, m.id;
end;
$$;
revoke all on function public.listar_conversas(uuid,integer,integer), public.ler_mensagens(uuid) from public, anon;
grant execute on function public.listar_conversas(uuid,integer,integer), public.ler_mensagens(uuid) to authenticated;
