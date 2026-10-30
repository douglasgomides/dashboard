-- Auditoria de conteúdo de 30/10/2026: tema padronizado, contagem por pessoa e comentários de compra.
--
-- 1. tema_chave(text): a mesma chave de tema usada nas telas (src/lib/classificacao-post.ts chaveTema): sem acento,
--    sem diferença de maiúscula e com espaços normalizados. "Autoridade e marca médica" (10 posts) e
--    "Autoridade e marca medica" (9 posts) da Doctor Creator eram dois temas.
-- 2. conteudo_comercial: a tabela de temas junta as grafias pela chave (nome = grafia mais usada; no empate, a com
--    acento) e passa a contar também PESSOAS (pessoa da conversa; sem ela, a chave da pessoa do lead; sem lead, a
--    própria conversa). Na Dra. Marcella, 815 conversas em outubro eram 537 leads distintos. Cobertura e objeções
--    ganham pessoas e pessoas que agendaram. Nada do que já existia muda de nome.
-- 3. conteudo_comercial_profundo: comentário que é só a palavra-chave pedida na legenda ("comente PROMPT") conta como
--    pedido (na Doctor Creator eram 78% dos comentários e ficavam de fora). Também devolve quantos comentários dos
--    posts do período estão guardados contra o total que o Instagram informa, para a tela avisar a cobertura.
-- 4. campanhas_base: conta pessoas (chave_pessoa do lead; sem ela, a pessoa; sem nada, o card), não cards. A pessoa só
--    é "parada" se nenhum card dela se mexeu no prazo. Card fechado na origem (outcome 'closed') continua fora de
--    abertos e parados. Na Dra. Marcella, 360 "leads parados" eram no máximo 284 pessoas.
-- Só leitura, sem gatilho. Cada função troca só os trechos abaixo; se já aplicada, não faz nada.
-- Reversão: recriar conteudo_comercial e conteudo_comercial_profundo como em 20261023100000 / 20261023150000 com o
-- filtro de 20261030120000 (removido_na_origem), recriar campanhas_base como em 20261014160000 e
-- drop function public.tema_chave(text).

create or replace function public.tema_chave(p_tema text)
returns text language sql immutable parallel safe set search_path = ''
as $function$
  select case when t is null or t ~* '^(null|undefined|nulo|none|n/a)$' then ''
    else regexp_replace(lower(translate(t, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '\s+', ' ', 'g') end
  from (select nullif(btrim(regexp_replace(coalesce(p_tema, ''), '\s+', ' ', 'g')), '') as t) x
$function$;
revoke all on function public.tema_chave(text) from public, anon;
grant execute on function public.tema_chave(text) to authenticated, service_role;
comment on function public.tema_chave(text) is 'Chave do tema sem acento, maiúscula ou espaço extra. Igual a chaveTema em src/lib/classificacao-post.ts.';

do $migra$
declare
  def text;
  par record;
  novo_temas text := $q$  temas_linhas as (
    select public.tema_chave(tema) as chave, tema, null::text as pessoa, 1 np, alcance alc, 0 nc, 0 ncom, 0 npr, 0 na from posts where tema is not null
    union all
    select public.tema_chave(tema), btrim(tema), pessoa, 0, 0, 1, case when comercial then 1 else 0 end, case when preco then 1 else 0 end, case when agendou then 1 else 0 end from conv where tema is not null
  ),
  temas_rotulo as (
    select distinct on (chave) chave, tema from (select chave, tema, count(*) as n from temas_linhas where chave <> '' group by 1, 2) x
    order by chave, n desc, octet_length(tema) desc, tema
  ),
  temas as (
    select r.tema,
      sum(np) as posts, sum(alc) as alcance, sum(nc) as conversas, count(distinct t.pessoa) filter (where nc = 1) as pessoas,
      sum(ncom) as comerciais, sum(npr) as pediram_preco, sum(na) as agendaram, count(distinct t.pessoa) filter (where na = 1) as pessoas_agendaram
    from temas_linhas t join temas_rotulo r on r.chave = t.chave
    group by r.chave, r.tema
  ),$q$;
begin
  -- 2. conteudo_comercial
  def := pg_get_functiondef('public.conteudo_comercial(uuid,date,date)'::regprocedure);
  if position('temas_rotulo' in def) = 0 then
    if position($q$select (c.iniciada_em at time zone 'America/Sao_Paulo') as ts,$q$ in def) = 0 then raise exception 'conteudo_comercial: trecho da conversa não encontrado'; end if;
    def := replace(def, $q$select (c.iniciada_em at time zone 'America/Sao_Paulo') as ts,$q$,
      $q$select (c.iniciada_em at time zone 'America/Sao_Paulo') as ts, coalesce(c.pessoa_id::text, l.chave_pessoa, l.pessoa_id::text, c.lead_id::text, c.id::text) as pessoa,$q$);
    if def !~ '  temas as \(\s+select tema,.*?\) t group by 1\s*\),' then raise exception 'conteudo_comercial: bloco de temas não encontrado'; end if;
    def := regexp_replace(def, '  temas as \(\s+select tema,.*?\) t group by 1\s*\),', novo_temas);
    for par in select * from (values
      ($q$objecoes as (select o as objecao, count(*) n, count(*) filter (where agendou) agendaram from conv, unnest(objecoes) o group by 1)$q$,
       $q$objecoes as (select o as objecao, count(*) n, count(*) filter (where agendou) agendaram, count(distinct pessoa) pessoas, count(distinct pessoa) filter (where agendou) pessoas_agendaram from conv, unnest(objecoes) o group by 1)$q$),
      ($q$'conversas', (select count(*) from conv),$q$,
       $q$'conversas', (select count(*) from conv), 'pessoas', (select count(distinct pessoa) from conv), 'pessoas_agendaram', (select count(distinct pessoa) filter (where agendou) from conv),$q$)
    ) as v(antigo, novo) loop
      if position(par.antigo in def) = 0 then raise exception 'conteudo_comercial: trecho não encontrado: %', par.antigo; end if;
      def := replace(def, par.antigo, par.novo);
    end loop;
    execute def;
  end if;

  -- 3. conteudo_comercial_profundo
  def := pg_get_functiondef('public.conteudo_comercial_profundo(uuid,date,date)'::regprocedure);
  if position('as palavra' in def) = 0 then
    for par in select * from (values
      ($q$translate(lower(c.text), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as t
    from instagram_comments c, janela j$q$,
       $q$translate(lower(c.text), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as t,
      translate(lower(coalesce(pc.caption, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as legenda
    from instagram_comments c
    cross join janela j
    left join instagram_posts pc on pc.id = c.instagram_post_id$q$),
      ($q$t ~ '(whats|telefone|contato|numero|link|direct|dm\M|chama|me chama)' as contato
    from coment$q$,
       $q$t ~ '(whats|telefone|contato|numero|link|direct|dm\M|chama|me chama)' as contato,
      (btrim(t) ~ '^[a-z]{2,24}$' and legenda ~ ('coment[ae]r?\W+(a palavra\W+)?' || btrim(t) || '\M')) as palavra
    from coment$q$),
      ($q$count(*) filter (where preco or agendar or onde or convenio or contato) as compra,$q$,
       $q$count(*) filter (where preco or agendar or onde or convenio or contato or palavra) as compra, count(*) filter (where palavra) as palavra,$q$),
      ($q$'compra', (select count(*) from coment_class where preco or agendar or onde or convenio or contato),$q$,
       $q$'compra', (select count(*) from coment_class where preco or agendar or onde or convenio or contato or palavra),
      'palavra', (select count(*) from coment_class where palavra),
      'guardados_posts_periodo', (select count(*) from instagram_comments ic join instagram_posts ip on ip.id = ic.instagram_post_id cross join janela j
        where ip.client_id = p_client and ip.posted_at >= j.ini and ip.posted_at < j.fim and (select pode from ok)),
      'instagram_posts_periodo', (select coalesce(sum(ip.comments), 0) from instagram_posts ip cross join janela j
        where ip.client_id = p_client and ip.posted_at >= j.ini and ip.posted_at < j.fim and (select pode from ok)),$q$)
    ) as v(antigo, novo) loop
      if position(par.antigo in def) = 0 then raise exception 'conteudo_comercial_profundo: trecho não encontrado: %', par.antigo; end if;
      def := replace(def, par.antigo, par.novo);
    end loop;
    execute def;
  end if;

  -- 4. campanhas_base
  def := pg_get_functiondef('public.campanhas_base(uuid)'::regprocedure);
  if position('count(distinct pessoa)' in def) = 0 then
    for par in select * from (values
      ($q$select cl.outcome, cl.occurred_at, coalesce(cps.status_name, '') etapa,$q$,
       $q$select cl.outcome, cl.occurred_at, coalesce(cps.status_name, '') etapa, coalesce(cl.chave_pessoa, cl.pessoa_id::text, cl.id::text) as pessoa,$q$),
      ($q$  )
  select case when not (select pode from ok) then null else jsonb_build_object($q$,
       $q$  ),
  lp as (select l.*, max(m) over (partition by pessoa) as mp from l)
  select case when not (select pode from ok) then null else jsonb_build_object($q$),
      ($q$and m < now() - interval '90 days')$q$, $q$and mp < now() - interval '90 days')$q$),
      ($q$and m < now() - interval '30 days' and m >= now() - interval '90 days')$q$, $q$and mp < now() - interval '30 days' and mp >= now() - interval '90 days')$q$),
      ($q$and m < now() - interval '14 days')$q$, $q$and mp < now() - interval '14 days')$q$),
      ($q$count(*) filter (where$q$, $q$count(distinct pessoa) filter (where$q$),
      ($q$  from l;$q$, $q$  from lp;$q$)
    ) as v(antigo, novo) loop
      if position(par.antigo in def) = 0 then raise exception 'campanhas_base: trecho não encontrado: %', par.antigo; end if;
      def := replace(def, par.antigo, par.novo);
    end loop;
    execute def;
  end if;
end
$migra$;
