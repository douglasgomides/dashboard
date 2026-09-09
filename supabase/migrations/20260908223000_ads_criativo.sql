-- Link e miniatura do criativo, para dar para clicar na campanha e ver qual
-- anúncio é.
--
-- Os campos moram aqui e não como referência a instagram_posts porque a mídia
-- do anúncio é uma cópia do post, com id e permalink próprios
-- (media_product_type = 'AD'). Testei os dois caminhos de junção com a base
-- real da Lana Torres: 0 de 12 bateram por id, 0 de 8 por permalink.
--
-- thumbnail_url é URL de CDN do Instagram com validade de poucos dias. O sync
-- diário reescreve o campo e a renova enquanto a campanha estiver ativa; para
-- campanha antiga, a imagem quebra e a tela cai de volta só no link (que não
-- expira). Guardar o arquivo resolveria de vez, ao custo de storage — decisão
-- adiada de propósito.

alter table public.meta_ads_campaigns add column if not exists instagram_media_id text;
alter table public.meta_ads_campaigns add column if not exists permalink text;
alter table public.meta_ads_campaigns add column if not exists thumbnail_url text;

-- Substituída pelo ads_diagnostico, que devolve as mesmas colunas mais o
-- veredito e o criativo. Duas tabelas de campanha na mesma tela eram a mesma
-- pergunta respondida duas vezes.
drop function if exists public.ads_por_campanha(uuid, date, date);

drop function if exists public.ads_diagnostico(uuid, date, date);
create function public.ads_diagnostico(p_client_id uuid, p_start date, p_end date)
returns table(
  campaign_id text, campanha text, objetivo text, permalink text, thumbnail_url text,
  gasto numeric, impressoes bigint, cliques_link bigint, conversas bigint,
  ctr numeric, custo_por_conversa numeric, frequencia numeric,
  ctr_antes numeric, ctr_depois numeric,
  veredito text, motivo text
)
language sql stable security definer set search_path to 'public'
as $$
  with meio as (
    select (p_start + ((p_end - p_start) / 2))::date as corte
  ), base as (
    select d.campaign_id,
           coalesce(c.name, '(campanha removida)') as campanha,
           c.objective as objetivo,
           max(c.permalink) as permalink,
           max(c.thumbnail_url) as thumbnail_url,
           sum(d.spend) as gasto,
           sum(d.impressions) as impressoes,
           sum(d.clicks) as cliques,
           sum(d.link_clicks) as cliques_link,
           sum(d.conversations) as conversas,
           avg(d.frequency) as frequencia,
           sum(d.clicks) filter (where d.date < (select corte from meio)) as cliques_antes,
           sum(d.impressions) filter (where d.date < (select corte from meio)) as impr_antes,
           sum(d.clicks) filter (where d.date >= (select corte from meio)) as cliques_depois,
           sum(d.impressions) filter (where d.date >= (select corte from meio)) as impr_depois
    from meta_ads_daily d
    left join meta_ads_campaigns c
      on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id
    where d.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and d.date between p_start and p_end
    group by d.campaign_id, c.name, c.objective
  ), calc as (
    select b.*,
           case when b.impressoes > 0 then round(b.cliques::numeric / b.impressoes * 100, 2) end as ctr,
           case when b.conversas > 0 then round(b.gasto / b.conversas, 2) end as cpconv,
           case when b.impr_antes > 0 then round(b.cliques_antes::numeric / b.impr_antes * 100, 2) end as ctr_antes,
           case when b.impr_depois > 0 then round(b.cliques_depois::numeric / b.impr_depois * 100, 2) end as ctr_depois
    from base b
  ), regua as (
    select (percentile_cont(0.5) within group (order by cpconv))::numeric as med_cpconv,
           (percentile_cont(0.5) within group (order by ctr))::numeric as med_ctr
    from calc where impressoes >= 500
  )
  select c.campaign_id, c.campanha, c.objetivo, c.permalink, c.thumbnail_url,
         round(c.gasto, 2), c.impressoes, c.cliques_link, c.conversas,
         c.ctr, c.cpconv, round(c.frequencia, 2),
         c.ctr_antes, c.ctr_depois,
         case
           when c.impressoes < 500 or c.gasto < 30 then 'Volume insuficiente'
           when c.conversas = 0 and c.ctr >= r.med_ctr then 'Atrai mas não converte'
           when c.conversas = 0 then 'Sem tração'
           when c.cpconv <= r.med_cpconv * 0.6 then 'Escalar'
           when c.cpconv >= r.med_cpconv * 2 then 'Cortar'
           else 'Manter'
         end,
         case
           when c.impressoes < 500 or c.gasto < 30
             then 'Rodou pouco demais para julgar.'
           when c.conversas = 0 and c.ctr >= r.med_ctr
             then 'O criativo prende (CTR ' || c.ctr || '%, acima da mediana de ' || round(r.med_ctr, 2) ||
                  '%), mas ninguém chamou. O problema está na oferta ou no destino, não na arte.'
           when c.conversas = 0
             then 'Nem atrai nem converte: CTR ' || coalesce(c.ctr, 0) || '% contra mediana de ' || round(r.med_ctr, 2) || '%.'
           when c.cpconv <= r.med_cpconv * 0.6
             then 'Conversa a ' || c.cpconv || ', bem abaixo da mediana de ' || round(r.med_cpconv, 2) || '. É onde cabe mais verba.'
           when c.cpconv >= r.med_cpconv * 2
             then 'Conversa a ' || c.cpconv || ', mais que o dobro da mediana de ' || round(r.med_cpconv, 2) || '.'
           else 'Dentro da faixa normal da conta.'
         end
  from calc c, regua r
  order by c.gasto desc;
$$;
