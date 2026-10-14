-- Retorno do investimento do período: quanto foi investido em anúncios e quanto voltou em vendas ganhas no CRM.
-- Só leitura. Devolve os números E o que falta para calcular (a tela monta o checklist em src/lib/roi.ts).
--
-- Definições:
--   investido  = gasto em meta_ads_daily no período (todas as contas do cliente);
--   ganhos     = leads do CRM com outcome 'won' cuja data do card (occurred_at, senão received_at) cai no período;
--   receita    = soma do valor (price) desses ganhos;
--   origem     = % dos leads do período com a origem (source) preenchida;
--   compartilhado = outro cliente ativo usa a mesma conexão de CRM (provider + subdomínio): a receita não é só deste cliente.
create or replace function public.roi_periodo(p_client_id uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  l as (
    select outcome, price, source
    from crm_leads
    where client_id = p_client_id and removido_na_origem is null
      and coalesce(occurred_at, received_at)::date between p_de and p_ate
  ),
  con as (select provider, subdomain from crm_connections where client_id = p_client_id and active)
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_anuncios', exists (select 1 from client_ad_accounts a where a.client_id = p_client_id and a.active)
                    or exists (select 1 from clients c where c.id = p_client_id and coalesce(c.meta_ad_account_id, '') <> '')
                    or exists (select 1 from meta_ads_daily d where d.client_id = p_client_id and d.date between p_de and p_ate),
    'tem_crm', exists (select 1 from con),
    'investido', coalesce((select sum(spend) from meta_ads_daily d where d.client_id = p_client_id and d.date between p_de and p_ate), 0),
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
grant execute on function public.roi_periodo(uuid, date, date) to authenticated;
