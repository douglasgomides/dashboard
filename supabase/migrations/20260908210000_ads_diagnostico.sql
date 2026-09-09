-- Veredito por campanha.
--
-- Os cortes são relativos à própria conta (mediana do período), não a
-- benchmark de mercado: o que é caro para uma clínica de Jundiaí não é o que
-- é caro para um e-commerce, e a única régua honesta disponível é o histórico
-- da própria conta.
--
-- "Volume insuficiente" existe para não dar veredito sobre ruído: uma campanha
-- com 200 impressões e nenhuma conversa não é ruim, é indeterminada. Sem essa
-- faixa, toda campanha recém-subida nasceria marcada como fracasso.
--
-- ctr_antes/ctr_depois comparam as duas metades do período — é o sinal de
-- desgaste de criativo, que costuma aparecer antes do custo por conversa subir.

create or replace function public.ads_diagnostico(p_client_id uuid, p_start date, p_end date)
returns table(
  campaign_id text, campanha text, objetivo text,
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
    -- Mediana calculada só sobre campanhas com volume: incluir as pequenas
    -- puxaria a régua para qualquer lado por acaso.
    select (percentile_cont(0.5) within group (order by cpconv))::numeric as med_cpconv,
           (percentile_cont(0.5) within group (order by ctr))::numeric as med_ctr
    from calc where impressoes >= 500
  )
  select c.campaign_id, c.campanha, c.objetivo,
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
