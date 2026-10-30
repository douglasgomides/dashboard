-- Links rastreados curtos para o piloto (Dra. Juliana Paola e Dra. Mariela Muniz, mesmo WhatsApp pelo WTS/FlwChat).
-- 1. conversas.link_conferido_em: a atribuição (api/_lib/redirecionar.ts, atribuirLinks) agora olha 30 dias; conversa
--    conferida sem achar link não é lida de novo a cada rodada.
-- 2. Conversa que já tinha o código do link (codigo_ref) e ficou sem link_id passa a ter o link (atribuição "ref"), e a
--    pessoa ganha o toque "clique_link" (fonte link_proprio), o mesmo que a leitura das conversas grava daqui em diante.
--    Só preenche o que está vazio; rodar de novo não muda nada.
-- 3. jornada_resumo: nos links próprios (com slug) os cliques vêm de link_cliques no período e o endereço aparece como
--    /r/<nome>; links Short.io seguem com cliques_total. links_funil já conta os links próprios por conversas.link_id.
-- Reversão: alter table conversas drop column link_conferido_em; drop index conversas_sem_link;
--   delete from toques where fonte = 'link_proprio'; update conversas set link_id = null, atribuicao = null
--   where atribuicao = 'ref' and link_id is not null (só se quiser desfazer também o preenchimento);
--   e no bloco do jornada_resumo trocar de volta "novo" pelo "antigo" (mesmo bloco, com os pares invertidos).

alter table public.conversas add column if not exists link_conferido_em timestamptz;
create index if not exists conversas_sem_link on public.conversas (client_id, iniciada_em desc)
  where link_id is null and link_conferido_em is null;

update public.conversas c
   set link_id = l.id, atribuicao = 'ref'
  from public.links_rastreados l
 where c.link_id is null and c.codigo_ref is not null
   and l.client_id = c.client_id and upper(l.codigo_ref) = upper(c.codigo_ref);

insert into public.toques (client_id, pessoa_id, tipo, origem_tipo, link_id, instagram_post_id, ocorreu_em, fonte, externo_id, utm, bruto)
select c.client_id, c.pessoa_id, 'clique_link', l.tipo, l.id, l.instagram_post_id, coalesce(c.iniciada_em, c.ultima_msg_em),
       'link_proprio', 'conversa:' || c.id, '{}'::jsonb, jsonb_build_object('como', c.atribuicao)
  from public.conversas c
  join public.links_rastreados l on l.id = c.link_id and l.client_id = c.client_id
 where c.pessoa_id is not null and coalesce(c.iniciada_em, c.ultima_msg_em) is not null
on conflict (client_id, fonte, externo_id) do nothing;

do $migra$
declare
  def text;
  antigo text := 'select l.id, l.titulo, l.tipo, l.short_url, l.cliques_total,';
  novo text := $novo$select l.id, l.titulo, l.tipo,
           coalesce(l.short_url, case when l.slug is not null then '/r/' || l.slug end) short_url,
           case when l.slug is not null then (select count(*) from public.link_cliques k where k.link_id = l.id
             and (k.em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) else l.cliques_total end cliques_total,$novo$;
begin
  -- Só a versão por período (a tela Jornada usa esta; a de um argumento não tem p_de/p_ate).
  if to_regprocedure('public.jornada_resumo(uuid,date,date)') is null then return; end if;
  def := pg_get_functiondef('public.jornada_resumo(uuid,date,date)'::regprocedure);
  if position('public.link_cliques k where k.link_id = l.id' in def) > 0 then return; end if; -- já aplicada
  if position(antigo in def) = 0 then
    raise notice 'jornada_resumo(uuid,date,date): sem o trecho dos links; mantida como está';
    return;
  end if;
  execute replace(def, antigo, novo);
end
$migra$;
