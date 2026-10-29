-- Uma definição só de "fonte ligada" e uma regra só de leads e ganhos no período, para as telas pararem de se contradizer.
-- Antes havia 3 definições de "anúncio conectado" e 4 de "WhatsApp conectado":
--   - Resultados (roi_periodo) dizia "Conta de anúncios não conectada" para quem lança os anúncios na planilha (Marcelly);
--   - a prioridade (client_fontes) dizia "Sem WhatsApp conectado" para quem tem conversas pelo Kommo (grupo HOMS),
--     enquanto o admin contava os pacientes sem resposta dessas mesmas conversas;
--   - roi_periodo contava leads pela data UTC e com received_at de reserva; o painel do CRM, pela data de Brasília.
-- Agora:
--   - fontes_base(cliente) é a única que decide se cada fonte tem cadastro, se é planilha e até quando há dado.
--     status_das_fontes (admin), status_fontes_do_cliente (telas do cliente), client_fontes e roi_periodo leem dela.
--     Planilha de anúncios conta como fonte ligada (a tela marca "lançado à mão"). Atendimento conta como ligado
--     quando há WTS, Digisac ou qualquer conversa gravada (Kommo, FlwChat, Meta).
--   - roi_periodo passa a contar leads e ganhos com a mesma regra de crm_leads_resumo_periodo (data de criação no
--     horário de Brasília, sem os removidos no CRM) e devolve com quem o CRM é compartilhado.
-- Reversão: recriar status_das_fontes (20261014190000), client_fontes (20261014120000) e roi_periodo (20261029120000);
--           drop function public.status_fontes_do_cliente(uuid); drop function public.fontes_base(uuid).

create or replace function public.fontes_base(p_client_id uuid)
returns table(client_id uuid, fonte text, cadastro boolean, planilha boolean, data_ate date, last_attempt_at timestamptz,
  last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with c as (
    select id, meta_ad_account_id, ads_planilha_url, wts_company_id, digisac_url from clients
    where active and (p_client_id is null or id = p_client_id)
  ),
  d as (
    select c.id,
      -- Instagram: o mais antigo entre métricas diárias e posts.
      (select case when a is not null and b is not null then least(a, b) else coalesce(a, b) end
         from (select (select max(date) from instagram_account_daily_metrics m where m.client_id = c.id and m.reach is not null) a,
                      (select max(metrics_updated_at)::date from instagram_posts p where p.client_id = c.id) b) x) as ig,
      (select max(date) from meta_ads_daily m where m.client_id = c.id) as ads_meta,
      (select max(analise_em) from ads_planilha_semanal s where s.client_id = c.id and s.analise_em <= current_date) as ads_planilha,
      (select max(coalesce(occurred_at, received_at))::date from crm_leads l where l.client_id = c.id) as crm,
      greatest((select max(started_at)::date from wts_sessions w where w.client_id = c.id),
               (select max(ultima_msg_em)::date from conversas v where v.client_id = c.id)) as atend,
      exists (select 1 from instagram_accounts i where i.client_id = c.id and i.active and not coalesce(i.provisional, false)) as tem_ig,
      exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.active and not coalesce(a.provisional, false))
        or coalesce(c.meta_ad_account_id, '') <> '' as tem_ads_meta,
      coalesce(c.ads_planilha_url, '') <> '' or exists (select 1 from ads_planilha_semanal s where s.client_id = c.id) as tem_ads_planilha,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active) as tem_crm,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active and x.provider = 'planilha')
        and not exists (select 1 from crm_connections x where x.client_id = c.id and x.active and x.provider <> 'planilha') as crm_planilha,
      c.wts_company_id is not null or coalesce(c.digisac_url, '') <> ''
        or exists (select 1 from conversas v where v.client_id = c.id) as tem_atend
    from c
  )
  select d.id, f.fonte,
    case f.fonte when 'instagram' then d.tem_ig when 'anuncios' then d.tem_ads_meta or d.tem_ads_planilha
                 when 'crm' then d.tem_crm else d.tem_atend end,
    case f.fonte when 'anuncios' then d.tem_ads_planilha and not d.tem_ads_meta and d.ads_meta is null
                 when 'crm' then d.crm_planilha else false end,
    case f.fonte when 'instagram' then d.ig when 'anuncios' then coalesce(d.ads_meta, d.ads_planilha)
                 when 'crm' then d.crm else d.atend end,
    s.last_attempt_at, s.last_success_at, s.last_error, s.motivo, s.motivo_dono,
    exists (select 1 from fontes_nao_usadas n where n.client_id = d.id and n.fonte = f.fonte)
  from d
  cross join (values ('instagram'), ('anuncios'), ('crm'), ('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = d.id and s.fonte = f.fonte;
$function$;
revoke all on function public.fontes_base(uuid) from public, anon, authenticated;
grant execute on function public.fontes_base(uuid) to service_role;

-- Admin (todas as clínicas). Mesma assinatura de antes (a coluna "planilha" fica para status_fontes_do_cliente).
create or replace function public.status_das_fontes()
returns table(client_id uuid, fonte text, cadastro boolean, data_ate date, last_attempt_at timestamptz,
  last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  select client_id, fonte, cadastro, data_ate, last_attempt_at, last_success_at, last_error, motivo, motivo_dono, nao_usa
  from public.fontes_base(null) where public.is_app_admin() or auth.uid() is null;
$function$;
revoke all on function public.status_das_fontes() from public, anon;
grant execute on function public.status_das_fontes() to authenticated, service_role;

-- Telas do cliente (Resultados, ROI, prioridades): a mesma leitura do admin, só da clínica.
create or replace function public.status_fontes_do_cliente(p_client_id uuid)
returns table(client_id uuid, fonte text, cadastro boolean, planilha boolean, data_ate date, last_attempt_at timestamptz,
  last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  select * from public.fontes_base(p_client_id) where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;
revoke all on function public.status_fontes_do_cliente(uuid) from public, anon;
grant execute on function public.status_fontes_do_cliente(uuid) to authenticated, service_role;

-- client_fontes continua com a mesma forma (várias telas leem), mas decide pela base única.
create or replace function public.client_fontes(p_client_id uuid)
returns table(tem_instagram boolean, tem_anuncios boolean, tem_crm boolean, tem_atendimento boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  select bool_or(cadastro) filter (where fonte = 'instagram'),
         bool_or(cadastro) filter (where fonte = 'anuncios'),
         bool_or(cadastro) filter (where fonte = 'crm'),
         bool_or(cadastro) filter (where fonte = 'atendimento')
  from public.fontes_base(p_client_id)
  where public.is_app_admin() or public.is_client_member(p_client_id)
  having count(*) > 0;
$function$;
revoke all on function public.client_fontes(uuid) from public, anon;
grant execute on function public.client_fontes(uuid) to authenticated, service_role;

create or replace function public.roi_periodo(p_client_id uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  -- Mesma regra de crm_leads_resumo_periodo (painel do CRM): data de criação no horário de Brasília, sem removidos.
  l as (
    select outcome, price, source
    from crm_leads
    where client_id = p_client_id and removido_na_origem is null and occurred_at is not null
      and (occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  con as (select provider, subdomain from crm_connections where client_id = p_client_id and active),
  outros as (
    select distinct oc.name from con
    join crm_connections o on o.provider = con.provider and o.subdomain = con.subdomain and o.active and o.client_id <> p_client_id
    join clients oc on oc.id = o.client_id and oc.active
    where con.subdomain is not null and con.subdomain <> ''
  ),
  fontes as (select * from public.fontes_base(p_client_id)),
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
    'tem_anuncios', coalesce((select cadastro from fontes where fonte = 'anuncios'), false)
                    or exists (select 1 from meta_ads_daily d where d.client_id = p_client_id and d.date between p_de and p_ate),
    'anuncios_planilha', coalesce((select planilha from fontes where fonte = 'anuncios'), false),
    'anuncios_ate', (select data_ate from fontes where fonte = 'anuncios'),
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
    'ganho_identificavel', exists (select 1 from crm_leads x where x.client_id = p_client_id and x.outcome = 'won')
                           or exists (select 1 from crm_etapa_resultado e join crm_connections x on x.id = e.crm_connection_id where x.client_id = p_client_id and e.outcome = 'won'),
    'crm_compartilhado', exists (select 1 from outros),
    'crm_compartilhado_com', coalesce((select jsonb_agg(name order by name) from outros), '[]'::jsonb)
  ) end;
$function$;
revoke all on function public.roi_periodo(uuid, date, date) from public, anon;
grant execute on function public.roi_periodo(uuid, date, date) to authenticated, service_role;
