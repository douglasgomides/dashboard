-- Cobertura do período por fonte: "você pediu de A a B; temos dado de X a Y".
-- Só leitura. Serve para a faixa que aparece em todas as telas com período, para nunca mostrar
-- "90 dias" com 40 dias de dado sem dizer. Para cada fonte devolve:
--   primeiro_geral / ultimo_geral: primeiro e último dia com dado na base inteira;
--   dias_com_dado: dias do período pedido com dado (só faz sentido nas séries diárias).
create or replace function public.cobertura_periodo(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  ig as (
    select date from instagram_account_daily_metrics where client_id = p_client and reach is not null and (select pode from ok)
  ),
  seg as (
    select date from instagram_account_daily_metrics where client_id = p_client and new_followers is not null and (select pode from ok)
  ),
  ads as (
    select date from meta_ads_daily where client_id = p_client and (select pode from ok) group by date
  ),
  posts as (
    select (posted_at at time zone 'America/Sao_Paulo')::date as date from instagram_posts where client_id = p_client and (select pode from ok)
  ),
  crm as (
    select (occurred_at at time zone 'America/Sao_Paulo')::date as date from crm_leads
    where client_id = p_client and removido_na_origem is null and occurred_at is not null and (select pode from ok)
  ),
  wts as (
    select (started_at at time zone 'America/Sao_Paulo')::date as date from wts_sessions where client_id = p_client and (select pode from ok)
  )
  select coalesce(jsonb_agg(x) filter (where x->>'primeiro_geral' is not null), '[]'::jsonb) from (
    select jsonb_build_object('fonte', 'instagram', 'rotulo', 'Alcance e interações do Instagram', 'diaria', true,
      'primeiro_geral', (select min(date) from ig), 'ultimo_geral', (select max(date) from ig),
      'dias_com_dado', (select count(distinct date) from ig where date between p_de and p_ate)) x
    union all select jsonb_build_object('fonte', 'seguidores', 'rotulo', 'Seguidores ganhos por dia', 'diaria', true,
      'primeiro_geral', (select min(date) from seg), 'ultimo_geral', (select max(date) from seg),
      'dias_com_dado', (select count(distinct date) from seg where date between p_de and p_ate))
    union all select jsonb_build_object('fonte', 'posts', 'rotulo', 'Posts', 'diaria', false,
      'primeiro_geral', (select min(date) from posts), 'ultimo_geral', (select max(date) from posts),
      'dias_com_dado', (select count(distinct date) from posts where date between p_de and p_ate))
    union all select jsonb_build_object('fonte', 'anuncios', 'rotulo', 'Anúncios', 'diaria', false,
      'primeiro_geral', (select min(date) from ads), 'ultimo_geral', (select max(date) from ads),
      'dias_com_dado', (select count(distinct date) from ads where date between p_de and p_ate))
    union all select jsonb_build_object('fonte', 'crm', 'rotulo', 'CRM', 'diaria', false,
      'primeiro_geral', (select min(date) from crm), 'ultimo_geral', (select max(date) from crm),
      'dias_com_dado', (select count(distinct date) from crm where date between p_de and p_ate))
    union all select jsonb_build_object('fonte', 'whatsapp', 'rotulo', 'WhatsApp', 'diaria', false,
      'primeiro_geral', (select min(date) from wts), 'ultimo_geral', (select max(date) from wts),
      'dias_com_dado', (select count(distinct date) from wts where date between p_de and p_ate))
  ) s;
$function$;

revoke all on function public.cobertura_periodo(uuid, date, date) from public, anon;
grant execute on function public.cobertura_periodo(uuid, date, date) to authenticated;
