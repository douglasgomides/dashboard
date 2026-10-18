-- Rastreio de origem v2 (src/lib/rastreio.ts): link próprio /r/<slug> com registro de clique, frase natural no
-- WhatsApp, atribuição da conversa ao link (ref, frase ou horário) e funil por origem.
-- Clique não guarda dado pessoal: só quando, celular ou computador, e de onde veio (instagram, facebook...).
-- Reversão: drop function links_funil; drop table link_cliques; alter table conversas drop column link_id, drop column atribuicao;
--   alter table links_rastreados drop column slug, drop column destino_tipo, drop column ativo, drop column campanha;
--   e voltar o check de tipo para ('bio','post','story','anuncio','email','outro').

alter table public.links_rastreados drop constraint if exists links_rastreados_tipo_check;
alter table public.links_rastreados add constraint links_rastreados_tipo_check
  check (tipo in ('bio', 'story', 'destaque', 'post', 'reels', 'parceiro', 'qr', 'anuncio', 'email', 'site', 'outro'));
alter table public.links_rastreados add column if not exists slug text unique,
  add column if not exists destino_tipo text not null default 'whatsapp' check (destino_tipo in ('whatsapp', 'site')),
  add column if not exists ativo boolean not null default true,
  add column if not exists campanha text;

create table if not exists public.link_cliques (
  id bigserial primary key,
  link_id uuid not null references public.links_rastreados(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  em timestamptz not null default now(),
  dispositivo text,
  origem text
);
create index if not exists link_cliques_link on public.link_cliques (link_id, em desc);
create index if not exists link_cliques_cliente on public.link_cliques (client_id, em desc);
alter table public.link_cliques enable row level security;
create policy "link_cliques: membro ou admin le" on public.link_cliques for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.link_cliques from anon;
revoke insert, update, delete on public.link_cliques from authenticated;

alter table public.conversas add column if not exists link_id uuid references public.links_rastreados(id) on delete set null,
  add column if not exists atribuicao text check (atribuicao in ('ref', 'frase', 'horario'));
create index if not exists conversas_link on public.conversas (link_id) where link_id is not null;

-- Funil por link: cliques → conversas → agendou (leitura da IA mais recente) → vendas (CRM, depois da conversa).
create or replace function public.links_funil(p_client_id uuid, p_desde timestamptz)
returns table (link_id uuid, cliques bigint, conversas bigint, provaveis bigint, agendou bigint, vendas bigint, receita numeric)
language sql stable security definer set search_path to 'public' as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  ls as (select l.id from links_rastreados l, ok where ok.pode and l.client_id = p_client_id),
  cl as (select k.link_id, count(*) n from link_cliques k join ls on ls.id = k.link_id where k.em >= p_desde group by 1),
  cv as (select c.id, c.link_id, c.pessoa_id, c.lead_id, c.iniciada_em, c.atribuicao from conversas c join ls on ls.id = c.link_id
         where c.client_id = p_client_id and coalesce(c.iniciada_em, c.ultima_msg_em) >= p_desde),
  ag as (select cv.id from cv where exists (
           select 1 from conversas_resumos r where r.conversa_id = cv.id
             and (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou'))),
  vd as (select cv.link_id, count(distinct l.id) n, coalesce(sum(l.price), 0) receita from cv
         join crm_leads l on l.client_id = p_client_id and l.outcome = 'won' and l.removido_na_origem is null
           and (l.id = cv.lead_id or (cv.pessoa_id is not null and l.pessoa_id = cv.pessoa_id))
           and coalesce(l.occurred_at, l.received_at) >= coalesce(cv.iniciada_em, p_desde)
         group by 1)
  select ls.id,
    coalesce((select n from cl where cl.link_id = ls.id), 0),
    (select count(*) from cv where cv.link_id = ls.id),
    (select count(*) from cv where cv.link_id = ls.id and cv.atribuicao = 'horario'),
    (select count(*) from cv where cv.link_id = ls.id and cv.id in (select id from ag)),
    coalesce((select n from vd where vd.link_id = ls.id), 0),
    coalesce((select receita from vd where vd.link_id = ls.id), 0)
  from ls;
$function$;
revoke all on function public.links_funil(uuid, timestamptz) from public, anon;
grant execute on function public.links_funil(uuid, timestamptz) to authenticated;
