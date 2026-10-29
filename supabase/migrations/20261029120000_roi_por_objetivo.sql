-- ROI só com o investimento em aquisição.
-- Antes: roi_periodo dividia TODO o gasto em anúncios (inclusive seguidores e impulsionamento) pela receita do CRM.
-- Agora cada campanha é classificada em "crescimento" (seguidores, engajamento, alcance, visita ao perfil) ou
-- "aquisição" (mensagens, leads, conversão), e o retorno usa só a aquisição.
--
-- De onde vem a classificação, nesta ordem (a primeira que decide vale; "metodo" registra qual foi):
--   1. destino do conjunto de anúncios (WhatsApp, Direct, formulário, site = aquisição; perfil, publicação = crescimento);
--   2. meta de otimização do conjunto (CONVERSATIONS, LEAD_GENERATION... = aquisição; PROFILE_VISIT, REACH... = crescimento);
--   3. objetivo da campanha, quando ele sozinho já diz (OUTCOME_LEADS, MESSAGES = aquisição; OUTCOME_AWARENESS = crescimento);
--   4. estimativa: objetivo ambíguo (LINK_CLICKS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT) com conversa ou lead no período
--      conta como aquisição; sem conversa nem lead, como crescimento. É estimativa: a tela marca como Parcial.
-- Destino e meta de otimização vêm dos syncs (Graph: /adsets; Windsor: adset_destination_type) e ficam na campanha.
--
-- Também: clients.rotulo_custo ("venda" ou "paciente") para o rótulo do custo no Resultado.
-- Reversão: alter table meta_ads_campaigns drop column otimizacoes, drop column destinos;
--           alter table clients drop column rotulo_custo; drop function public.ads_finalidade(text, text[], text[], numeric);
--           e recriar roi_periodo de 20261014200000_roi_periodo.sql.

alter table public.meta_ads_campaigns add column if not exists otimizacoes text[];
alter table public.meta_ads_campaigns add column if not exists destinos text[];
comment on column public.meta_ads_campaigns.otimizacoes is 'optimization_goal dos conjuntos de anúncios da campanha (Graph /adsets).';
comment on column public.meta_ads_campaigns.destinos is 'destination_type dos conjuntos de anúncios da campanha (Graph /adsets ou Windsor adset_destination_type).';

alter table public.clients add column if not exists rotulo_custo text not null default 'venda';
do $$ begin
  alter table public.clients add constraint clients_rotulo_custo_check check (rotulo_custo in ('venda', 'paciente'));
exception when duplicate_object then null; end $$;
-- clients libera leitura coluna a coluna (o token do WTS não pode chegar ao navegador): a nova precisa do grant.
grant select (rotulo_custo) on public.clients to authenticated;
comment on column public.clients.rotulo_custo is 'Rótulo do custo no Resultado: "venda" (custo por venda) ou "paciente" (custo por paciente).';

create or replace function public.ads_finalidade(p_objective text, p_otimizacoes text[], p_destinos text[], p_conversas_leads numeric)
returns table(finalidade text, metodo text)
language sql immutable set search_path = public, pg_temp
as $function$
  with d as (
    select
      coalesce(bool_or(x ~ '(WHATSAPP|MESSENGER|DIRECT|MESSAGING|ON_AD|WEBSITE|PHONE|APP|LEAD)'), false) as d_aq,
      coalesce(bool_or(x ~ '(INSTAGRAM_PROFILE|ON_POST|ON_VIDEO|ON_PAGE|ON_EVENT|FACEBOOK_PAGE)'), false) as d_cr
    from unnest(coalesce(p_destinos, '{}')) u(v), lateral (select upper(regexp_replace(btrim(u.v), '\s+', '_', 'g')) as x) n
  ), g as (
    select
      coalesce(bool_or(x in ('CONVERSATIONS','LEAD_GENERATION','QUALITY_LEAD','QUALITY_CALL','OFFSITE_CONVERSIONS','VALUE',
        'LANDING_PAGE_VIEWS','REPLIES','MESSAGING_PURCHASE_CONVERSION','MESSAGING_APPOINTMENT_CONVERSION','APP_INSTALLS')), false) as g_aq,
      coalesce(bool_or(x in ('PROFILE_VISIT','VISIT_INSTAGRAM_PROFILE','INSTAGRAM_PROFILE_REACH','REACH','IMPRESSIONS','POST_ENGAGEMENT',
        'THRUPLAY','PAGE_LIKES','ENGAGED_USERS','AD_RECALL_LIFT','TWO_SECOND_CONTINUOUS_VIDEO_VIEWS','EVENT_RESPONSES')), false) as g_cr
    from unnest(coalesce(p_otimizacoes, '{}')) u(v), lateral (select upper(btrim(u.v)) as x) n
  ), o as (select upper(coalesce(p_objective, '')) as obj)
  select case
      when d.d_aq and not d.d_cr then 'aquisicao'
      when d.d_cr and not d.d_aq then 'crescimento'
      when g.g_aq and not g.g_cr then 'aquisicao'
      when g.g_cr and not g.g_aq then 'crescimento'
      when o.obj in ('OUTCOME_LEADS','LEAD_GENERATION','OUTCOME_SALES','CONVERSIONS','PRODUCT_CATALOG_SALES','MESSAGES') then 'aquisicao'
      when o.obj in ('OUTCOME_AWARENESS','REACH','BRAND_AWARENESS','POST_ENGAGEMENT','PAGE_LIKES','VIDEO_VIEWS','EVENT_RESPONSES') then 'crescimento'
      when coalesce(p_conversas_leads, 0) > 0 then 'aquisicao'
      else 'crescimento' end,
    case
      when (d.d_aq and not d.d_cr) or (d.d_cr and not d.d_aq) then 'destino'
      when (g.g_aq and not g.g_cr) or (g.g_cr and not g.g_aq) then 'otimizacao'
      when o.obj in ('OUTCOME_LEADS','LEAD_GENERATION','OUTCOME_SALES','CONVERSIONS','PRODUCT_CATALOG_SALES','MESSAGES',
                     'OUTCOME_AWARENESS','REACH','BRAND_AWARENESS','POST_ENGAGEMENT','PAGE_LIKES','VIDEO_VIEWS','EVENT_RESPONSES') then 'objetivo'
      else 'estimado' end
  from d, g, o;
$function$;
revoke all on function public.ads_finalidade(text, text[], text[], numeric) from public, anon;
grant execute on function public.ads_finalidade(text, text[], text[], numeric) to authenticated, service_role;

create or replace function public.roi_periodo(p_client_id uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  l as (
    select outcome, price, source
    from crm_leads
    where client_id = p_client_id and removido_na_origem is null
      and coalesce(occurred_at, received_at)::date between p_de and p_ate
  ),
  con as (select provider, subdomain from crm_connections where client_id = p_client_id and active),
  camp as (
    select d.ad_account_id, d.campaign_id, sum(d.spend) as gasto,
      sum(coalesce(d.conversations, 0) + coalesce(d.leads, 0)) as conv
    from meta_ads_daily d
    where d.client_id = p_client_id and d.date between p_de and p_ate
    group by 1, 2
  ),
  cls as (
    select camp.gasto, f.finalidade, f.metodo
    from camp
    left join meta_ads_campaigns mc on mc.client_id = p_client_id and mc.ad_account_id = camp.ad_account_id and mc.campaign_id = camp.campaign_id
    cross join lateral public.ads_finalidade(mc.objective, mc.otimizacoes, mc.destinos, camp.conv) f
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_anuncios', exists (select 1 from client_ad_accounts a where a.client_id = p_client_id and a.active)
                    or exists (select 1 from clients c where c.id = p_client_id and coalesce(c.meta_ad_account_id, '') <> '')
                    or exists (select 1 from meta_ads_daily d where d.client_id = p_client_id and d.date between p_de and p_ate),
    'tem_crm', exists (select 1 from con),
    'crm_provider', (select provider from con limit 1),
    'rotulo_custo', (select rotulo_custo from clients where id = p_client_id),
    'investido', coalesce((select sum(gasto) from camp), 0),
    'investido_aquisicao', coalesce((select sum(gasto) from cls where finalidade = 'aquisicao'), 0),
    'investido_crescimento', coalesce((select sum(gasto) from cls where finalidade = 'crescimento'), 0),
    'investido_estimado', coalesce((select sum(gasto) from cls where metodo = 'estimado'), 0),
    'leads', (select count(*) from l),
    'leads_com_origem', (select count(*) from l where coalesce(source, '') <> ''),
    'ganhos', (select count(*) from l where outcome = 'won'),
    'ganhos_com_valor', (select count(*) from l where outcome = 'won' and price > 0),
    'receita', coalesce((select sum(price) from l where outcome = 'won' and price > 0), 0),
    -- "Venda ganha" identificável: o CRM marca ganho (Kommo 142, Clint WON, RD win) ou a equipe mapeou uma etapa.
    'ganho_identificavel', exists (select 1 from crm_leads x where x.client_id = p_client_id and x.outcome = 'won')
                           or exists (select 1 from crm_etapa_resultado e join crm_connections x on x.id = e.crm_connection_id where x.client_id = p_client_id and e.outcome = 'won'),
    'crm_compartilhado', exists (
      select 1 from con join crm_connections o on o.provider = con.provider and o.subdomain = con.subdomain and o.active and o.client_id <> p_client_id
      join clients oc on oc.id = o.client_id and oc.active
      where con.subdomain is not null and con.subdomain <> ''
    )
  ) end;
$function$;

revoke all on function public.roi_periodo(uuid, date, date) from public, anon;
grant execute on function public.roi_periodo(uuid, date, date) to authenticated, service_role;

-- Acompanhamento do SAP (sap_tracker_auto): o "investido" que vira custo por consulta e ROAS passa a ser só aquisição,
-- com a mesma classificação. Troca apenas o trecho do gasto na definição atual (a função tem 9 mil caracteres e o
-- resto não muda); se o trecho não estiver lá, a migration para em vez de aplicar pela metade.
do $migra$
declare
  def text := pg_get_functiondef('public.sap_tracker_auto(uuid,date,date)'::regprocedure);
  antigo text := 'select coalesce(sum(spend), 0) as investido, coalesce(sum(coalesce(conversations, 0) + coalesce(leads, 0)), 0) as leads_plataforma
    from meta_ads_daily where client_id = p_client_id and date between p_from and p_to and (select pode from ok)';
  novo text := 'select coalesce(sum(c.gasto) filter (where f.finalidade = ''aquisicao''), 0) as investido, coalesce(sum(c.conv), 0) as leads_plataforma
    from (select ad_account_id, campaign_id, sum(spend) as gasto, sum(coalesce(conversations, 0) + coalesce(leads, 0)) as conv
          from meta_ads_daily where client_id = p_client_id and date between p_from and p_to and (select pode from ok)
          group by 1, 2) c
    left join meta_ads_campaigns mc on mc.client_id = p_client_id and mc.ad_account_id = c.ad_account_id and mc.campaign_id = c.campaign_id
    cross join lateral public.ads_finalidade(mc.objective, mc.otimizacoes, mc.destinos, c.conv) f';
begin
  if position(antigo in def) = 0 then
    if position('public.ads_finalidade' in def) > 0 then return; end if; -- já aplicada
    raise exception 'sap_tracker_auto: trecho do investimento não encontrado; revisar a migration';
  end if;
  execute replace(def, antigo, novo);
end
$migra$;
