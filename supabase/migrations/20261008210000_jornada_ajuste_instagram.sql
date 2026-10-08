-- Ajuste da Jornada (parte 2): pessoas também pelo @ do Instagram e comentários na linha do tempo.
-- Seguro rodar mais de uma vez.

-- 1. O @ vinha como objeto {"username": "..."}; corrige o que já foi gravado como texto de JSON.
update public.pessoas
set ig_username = (ig_username::jsonb)->>'username'
where ig_username like '{%';

-- 2. Lead do Instagram quase nunca tem telefone (entra pela DM): a pessoa passa a ser identificada pelo @.
create unique index if not exists pessoas_ig_sem_tel_uk
  on public.pessoas (client_id, lower(ig_username))
  where telefone_chave is null and ig_username is not null;

create or replace function public.vincular_pessoas(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_ligados integer; v_ig integer;
begin
  -- 2a. Pessoas por telefone
  insert into public.pessoas (client_id, telefone, telefone_chave, nome, email, ig_username, primeiro_toque_em, origem_primeira)
  select l.client_id,
         (array_agg(l.contact_phone order by l.received_at))[1],
         public.chave_telefone(l.contact_phone),
         (array_agg(l.contact_name order by (l.contact_name is null), l.received_at))[1],
         (array_agg(nullif(l.contact_email, '') order by (nullif(l.contact_email, '') is null), l.received_at))[1],
         (array_agg(nullif(l.raw_payload->'contact'->'instagram'->>'username', '')) filter (where nullif(l.raw_payload->'contact'->'instagram'->>'username', '') is not null))[1],
         min(coalesce(l.occurred_at, l.received_at)),
         (array_agg(l.source order by l.received_at) filter (where l.source is not null and l.source <> ''))[1]
  from public.crm_leads l
  where l.client_id = p_client and public.chave_telefone(l.contact_phone) is not null
  group by l.client_id, public.chave_telefone(l.contact_phone)
  on conflict (client_id, telefone_chave) do update
    set nome = coalesce(public.pessoas.nome, excluded.nome),
        email = coalesce(public.pessoas.email, excluded.email),
        ig_username = coalesce(public.pessoas.ig_username, excluded.ig_username),
        atualizado_em = now();

  update public.crm_leads l
  set pessoa_id = p.id
  from public.pessoas p
  where l.client_id = p_client and l.pessoa_id is null
    and p.client_id = l.client_id
    and p.telefone_chave = public.chave_telefone(l.contact_phone);
  get diagnostics v_ligados = row_count;

  -- 2b. Pessoas só pelo @ do Instagram (lead sem telefone)
  insert into public.pessoas (client_id, nome, ig_username, primeiro_toque_em, origem_primeira)
  select l.client_id,
         (array_agg(l.contact_name order by (l.contact_name is null), l.received_at))[1],
         lower(l.raw_payload->'contact'->'instagram'->>'username'),
         min(coalesce(l.occurred_at, l.received_at)),
         (array_agg(l.source order by l.received_at) filter (where l.source is not null and l.source <> ''))[1]
  from public.crm_leads l
  where l.client_id = p_client and l.pessoa_id is null
    and public.chave_telefone(l.contact_phone) is null
    and nullif(l.raw_payload->'contact'->'instagram'->>'username', '') is not null
  group by l.client_id, lower(l.raw_payload->'contact'->'instagram'->>'username')
  on conflict (client_id, lower(ig_username)) where telefone_chave is null and ig_username is not null
  do update set atualizado_em = now();

  update public.crm_leads l
  set pessoa_id = p.id
  from public.pessoas p
  where l.client_id = p_client and l.pessoa_id is null
    and p.client_id = l.client_id and p.telefone_chave is null
    and lower(p.ig_username) = lower(l.raw_payload->'contact'->'instagram'->>'username');
  get diagnostics v_ig = row_count;
  v_ligados := v_ligados + v_ig;

  -- 3. Cada lead vira o toque "lead_criado" na linha do tempo da pessoa.
  insert into public.toques (client_id, pessoa_id, tipo, ocorreu_em, fonte, externo_id, bruto)
  select l.client_id, l.pessoa_id, 'lead_criado', coalesce(l.occurred_at, l.received_at), 'crm:' || l.provider,
         coalesce(l.external_lead_id, l.id::text),
         jsonb_build_object('origem_crm', l.source, 'etapa_id', l.status_id, 'resultado', l.outcome)
  from public.crm_leads l
  where l.client_id = p_client and l.pessoa_id is not null
  on conflict (client_id, fonte, externo_id) do nothing;

  -- 4. Quem comentou nos posts e é uma pessoa conhecida (mesmo @): o comentário entra na linha do tempo, ligado ao post.
  insert into public.toques (client_id, pessoa_id, tipo, origem_tipo, instagram_post_id, ocorreu_em, fonte, externo_id)
  select ic.client_id, p.id, 'comentario', 'post', ic.instagram_post_id, ic.commented_at, 'instagram', ic.external_comment_id
  from public.instagram_comments ic
  join public.pessoas p on p.client_id = ic.client_id and lower(p.ig_username) = lower(ic.author_username)
  where ic.client_id = p_client and ic.commented_at is not null and ic.external_comment_id is not null
  on conflict (client_id, fonte, externo_id) do nothing;

  return v_ligados;
end;
$$;

revoke all on function public.vincular_pessoas(uuid) from public, anon, authenticated;
grant execute on function public.vincular_pessoas(uuid) to service_role;

select public.vincular_pessoas(c.id) from public.clients c;
