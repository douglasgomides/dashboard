-- ============================================================================
-- JORNADA: identidade, toques, links rastreados e conversas
-- Objetivo: ligar Instagram (post, comentário, bio), anúncio, CRM (lead, etapa, venda)
-- e conversa numa linha do tempo POR PESSOA. Seguro rodar mais de uma vez.
-- ============================================================================

-- 1. Chave de telefone: DDD + últimos 8 dígitos. Ignora o 9º dígito (a Meta e os CRMs ora mandam
--    com 9, ora sem), o +55 e o zero de tronco, para o mesmo número casar em todo lugar.
create or replace function public.chave_telefone(p text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n),
       s as (select case when n like '55%' and length(n) >= 12 then substr(n, 3) else n end as n from d),
       z as (select ltrim(n, '0') as n from s)
  select case when length(n) in (10, 11) then substr(n, 1, 2) || right(n, 8) else null end from z
$$;

-- 2. Pessoas (um registro por pessoa por cliente) ---------------------------------------------------
create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  telefone text,
  telefone_chave text,
  nome text,
  email text,
  ig_username text,
  primeiro_toque_em timestamptz,
  origem_primeira text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (client_id, telefone_chave)
);
create index if not exists pessoas_ig_idx on public.pessoas (client_id, lower(ig_username));
create index if not exists pessoas_email_idx on public.pessoas (client_id, lower(email));

alter table public.crm_leads add column if not exists pessoa_id uuid references public.pessoas(id) on delete set null;
create index if not exists crm_leads_pessoa_idx on public.crm_leads (pessoa_id);

-- 3. Links rastreados (bio, post, story, anúncio): cada um tem um código curto que vai na mensagem
--    pré-preenchida do WhatsApp. Quando a conversa chega com o código, ligamos pessoa e origem.
create table if not exists public.links_rastreados (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  codigo_ref text not null unique,
  tipo text not null check (tipo in ('bio', 'post', 'story', 'anuncio', 'email', 'outro')),
  instagram_post_id uuid references public.instagram_posts(id) on delete set null,
  ad_campaign_id text,
  titulo text,
  destino_url text not null,
  mensagem_modelo text,
  utm jsonb not null default '{}'::jsonb,
  shortio_id text,
  short_url text,
  cliques_total integer not null default 0,
  cliques_atualizado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists links_cliente_idx on public.links_rastreados (client_id, tipo);

-- 4. Toques: tudo o que acontece com a pessoa, em ordem de tempo -------------------------------------
create table if not exists public.toques (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  pessoa_id uuid references public.pessoas(id) on delete cascade,
  tipo text not null check (tipo in (
    'comentario', 'dm_instagram', 'clique_link', 'anuncio_clique', 'formulario',
    'mensagem_whatsapp', 'lead_criado', 'etapa', 'agendamento', 'consulta', 'venda'
  )),
  origem_tipo text,                      -- bio | post | story | anuncio | organico | indicacao | desconhecida
  link_id uuid references public.links_rastreados(id) on delete set null,
  instagram_post_id uuid references public.instagram_posts(id) on delete set null,
  ad_campaign_id text,
  utm jsonb not null default '{}'::jsonb,
  valor numeric,
  ocorreu_em timestamptz not null,
  fonte text not null,                   -- crm | instagram | shortio | hubla | whatsapp ...
  externo_id text not null,
  bruto jsonb,
  criado_em timestamptz not null default now(),
  unique (client_id, fonte, externo_id)
);
create index if not exists toques_pessoa_idx on public.toques (pessoa_id, ocorreu_em);
create index if not exists toques_cliente_idx on public.toques (client_id, tipo, ocorreu_em);
create index if not exists toques_post_idx on public.toques (instagram_post_id) where instagram_post_id is not null;

-- 5. Conversas e mensagens (dado de saúde: acesso restrito e registrado) -------------------------------
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  provider text not null,
  canal text,
  externo_id text not null,
  iniciada_em timestamptz,
  ultima_msg_em timestamptz,
  codigo_ref text,
  unique (client_id, provider, externo_id)
);
create index if not exists conversas_cliente_idx on public.conversas (client_id, ultima_msg_em desc);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  direcao text not null check (direcao in ('entrada', 'saida', 'sistema')),
  autor text,
  texto text,
  tipo text not null default 'texto',
  enviada_em timestamptz not null,
  externo_id text not null,
  unique (conversa_id, externo_id)
);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id, enviada_em);

create table if not exists public.acessos_conversas (
  id bigserial primary key,
  user_id uuid,
  client_id uuid,
  conversa_id uuid,
  acao text not null,
  em timestamptz not null default now()
);

-- 6. Segurança (RLS). Escrita é só do servidor (service role ignora RLS). -------------------------------
alter table public.pessoas enable row level security;
alter table public.links_rastreados enable row level security;
alter table public.toques enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.acessos_conversas enable row level security;

drop policy if exists "pessoas: admin ou membro le" on public.pessoas;
create policy "pessoas: admin ou membro le" on public.pessoas for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "links: admin ou membro le" on public.links_rastreados;
create policy "links: admin ou membro le" on public.links_rastreados for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "toques: admin ou membro le" on public.toques;
create policy "toques: admin ou membro le" on public.toques for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Conversas e mensagens: leitura direta só para admin. A clínica lê pelas funções abaixo, que registram o acesso.
drop policy if exists "conversas: so admin le direto" on public.conversas;
create policy "conversas: so admin le direto" on public.conversas for select to authenticated
  using (public.is_app_admin());
drop policy if exists "mensagens: so admin le direto" on public.mensagens;
create policy "mensagens: so admin le direto" on public.mensagens for select to authenticated
  using (public.is_app_admin());
drop policy if exists "acessos: so admin le" on public.acessos_conversas;
create policy "acessos: so admin le" on public.acessos_conversas for select to authenticated
  using (public.is_app_admin());

revoke all on public.pessoas, public.links_rastreados, public.toques, public.conversas, public.mensagens, public.acessos_conversas from anon, public;
grant select on public.pessoas, public.links_rastreados, public.toques, public.conversas, public.mensagens, public.acessos_conversas to authenticated;

-- 7. Funções de leitura das conversas (com registro de quem abriu) ---------------------------------------
create or replace function public.listar_conversas(p_client uuid, p_limite integer default 50, p_offset integer default 0)
returns table (
  id uuid, pessoa_nome text, telefone_final text, provider text, ultima_msg_em timestamptz,
  ultima_msg_texto text, total_msgs bigint, lead_id uuid, codigo_ref text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    return;
  end if;
  insert into public.acessos_conversas (user_id, client_id, acao) values (auth.uid(), p_client, 'listar');
  return query
  select c.id,
         coalesce(p.nome, 'Sem nome'),
         case when p.telefone is null then null else '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
         c.provider,
         c.ultima_msg_em,
         (select m.texto from public.mensagens m where m.conversa_id = c.id order by m.enviada_em desc limit 1),
         (select count(*) from public.mensagens m where m.conversa_id = c.id),
         c.lead_id,
         c.codigo_ref
  from public.conversas c
  left join public.pessoas p on p.id = c.pessoa_id
  where c.client_id = p_client
  order by c.ultima_msg_em desc nulls last
  limit least(p_limite, 200) offset p_offset;
end;
$$;

create or replace function public.ler_mensagens(p_conversa uuid)
returns table (id uuid, direcao text, autor text, texto text, tipo text, enviada_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_client uuid;
begin
  select client_id into v_client from public.conversas where conversas.id = p_conversa;
  if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then
    return;
  end if;
  insert into public.acessos_conversas (user_id, client_id, conversa_id, acao) values (auth.uid(), v_client, p_conversa, 'abrir');
  return query
  select m.id, m.direcao, m.autor, m.texto, m.tipo, m.enviada_em
  from public.mensagens m where m.conversa_id = p_conversa order by m.enviada_em;
end;
$$;

revoke all on function public.listar_conversas(uuid, integer, integer) from public, anon;
revoke all on function public.ler_mensagens(uuid) from public, anon;
grant execute on function public.listar_conversas(uuid, integer, integer) to authenticated;
grant execute on function public.ler_mensagens(uuid) to authenticated;

-- 8. Vínculo pessoa <-> lead, em lote e idempotente. É chamada pelo servidor a cada sincronização de CRM
--    (api/_lib/sync-status.ts) e roda uma vez agora para todos os clientes (final deste arquivo).
create or replace function public.vincular_pessoas(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_ligados integer;
begin
  insert into public.pessoas (client_id, telefone, telefone_chave, nome, email, ig_username, primeiro_toque_em, origem_primeira)
  select l.client_id,
         (array_agg(l.contact_phone order by l.received_at))[1],
         public.chave_telefone(l.contact_phone),
         (array_agg(l.contact_name order by (l.contact_name is null), l.received_at))[1],
         (array_agg(nullif(l.contact_email, '') order by (nullif(l.contact_email, '') is null), l.received_at))[1],
         (array_agg(nullif(l.raw_payload->'contact'->>'instagram', '')) filter (where nullif(l.raw_payload->'contact'->>'instagram', '') is not null))[1],
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
  where l.client_id = p_client
    and l.pessoa_id is null
    and p.client_id = l.client_id
    and p.telefone_chave = public.chave_telefone(l.contact_phone);
  get diagnostics v_ligados = row_count;

  -- Cada lead vira o toque "lead_criado" na linha do tempo da pessoa.
  insert into public.toques (client_id, pessoa_id, tipo, ocorreu_em, fonte, externo_id, bruto)
  select l.client_id, l.pessoa_id, 'lead_criado', coalesce(l.occurred_at, l.received_at), 'crm:' || l.provider,
         coalesce(l.external_lead_id, l.id::text),
         jsonb_build_object('origem_crm', l.source, 'etapa_id', l.status_id, 'resultado', l.outcome)
  from public.crm_leads l
  where l.client_id = p_client and l.pessoa_id is not null
  on conflict (client_id, fonte, externo_id) do nothing;

  return v_ligados;
end;
$$;

revoke all on function public.vincular_pessoas(uuid) from public, anon, authenticated;
grant execute on function public.vincular_pessoas(uuid) to service_role;

-- Primeira carga para todos os clientes.
select public.vincular_pessoas(c.id) from public.clients c;
