-- Retorno do investimento só com a receita que veio de anúncio (auditoria de 30/10/2026):
-- 1. O ROI dividia TODA a receita do CRM pelo investimento em aquisição. Doctor Creator, outubro: R$ 4.826 de 19 vendas,
--    todas em funis de compra (checkout), com origem vazia (14), "Base importada" (2), "Site" (2) e "Disparo para lista"
--    (1). Nenhuma veio de anúncio, e a tela mostrava ROI de +101%. Agora roi_periodo devolve também a receita e as
--    vendas de pessoas com origem anúncio (no próprio card ou em outro card da mesma pessoa, pela chave_pessoa) e a
--    receita do período por origem, para a tela dizer de onde veio o dinheiro. A receita total continua em "receita".
-- 2. O CRM do passo a passo era escolhido ao acaso quando havia duas conexões (Dra. Marcella: planilha e FlwChat, e a
--    RPC devolvia "planilha"). Passa a ser o CRM com mais cards no período; sem cards, o primeiro em ordem alfabética.
-- Reversão: trocar de volta os trechos abaixo (novo -> antigo) em roi_periodo: tirar o CTE "gan", as quatro chaves
--   novas (ganhos_anuncio, ganhos_anuncio_com_valor, receita_anuncio, receita_por_origem) e voltar
--   'crm_provider', (select provider from con limit 1),

do $migra$
declare
  def text := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  a1 text := '  fontes as (select * from public.fontes_base(p_client_id)),';
  n1 text := '  fontes as (select * from public.fontes_base(p_client_id)),
  -- Vendas do período (mesma regra de "l") com a origem: anúncio no próprio card ou em outro card da mesma pessoa.
  gan as (
    select g.price,
      (coalesce(public.crm_origem_classifica(g.source) = ''Anúncio'', false)
        or (g.chave_pessoa is not null and exists (
          select 1 from crm_leads o
           where o.client_id = p_client_id and o.removido_na_origem is null and o.chave_pessoa = g.chave_pessoa
             and public.crm_origem_classifica(o.source) = ''Anúncio''))) as anuncio,
      public.crm_origem_classifica(g.source) as origem_classe,
      nullif(btrim(g.source), '''') as origem_bruta,
      fp.papel
    from crm_leads g
    left join crm_funil_papel fp on fp.crm_connection_id = g.crm_connection_id and fp.pipeline_id = g.pipeline_id
    where g.client_id = p_client_id and g.removido_na_origem is null and g.outcome = ''won'' and g.occurred_at is not null
      and (g.occurred_at at time zone ''America/Sao_Paulo'')::date between p_de and p_ate
  ),
  gan_origem as (
    select case
        when anuncio then ''Anúncio''
        when origem_classe is not null then origem_classe
        when origem_bruta is not null then origem_bruta
        when papel = ''compra'' then ''Funil de compra, sem origem''
        else ''Sem origem'' end as origem,
      price
    from gan
  ),';
  a2 text := '''crm_provider'', (select provider from con limit 1),';
  n2 text := '''crm_provider'', coalesce(
      (select x.provider from crm_leads x
        where x.client_id = p_client_id and x.removido_na_origem is null and x.occurred_at is not null
          and (x.occurred_at at time zone ''America/Sao_Paulo'')::date between p_de and p_ate
          and x.provider in (select provider from con)
        group by x.provider order by count(*) desc, x.provider limit 1),
      (select provider from con order by provider limit 1)),';
  a3 text := '''receita'', coalesce((select sum(price) from l where outcome = ''won'' and price > 0), 0),';
  n3 text := '''receita'', coalesce((select sum(price) from l where outcome = ''won'' and price > 0), 0),
    ''ganhos_anuncio'', (select count(*) from gan where anuncio),
    ''ganhos_anuncio_com_valor'', (select count(*) from gan where anuncio and price > 0),
    ''receita_anuncio'', coalesce((select sum(price) from gan where anuncio and price > 0), 0),
    ''receita_por_origem'', coalesce((
      select jsonb_agg(jsonb_build_object(''origem'', origem, ''ganhos'', n, ''receita'', r) order by r desc, n desc, origem)
        from (select origem, count(*) as n, coalesce(sum(price) filter (where price > 0), 0) as r from gan_origem group by origem) z), ''[]''::jsonb),';
begin
  if position('receita_por_origem' in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 then
    raise exception 'roi_periodo: trechos não encontrados; revisar a migration';
  end if;
  execute replace(replace(replace(def, a1, n1), a2, n2), a3, n3);
end
$migra$;
