-- Visão geral do portfólio (M2): uma linha por cliente ativo, agregada no SQL
-- (o PostgREST corta em 1000 linhas, então nada de somar no navegador).
-- Só admin enxerga; fora disso devolve vazio. As fontes seguem a mesma regra de
-- client_fontes (provisional é ignorado).

create table if not exists public.alert_state (
  client_id uuid not null references public.clients(id) on delete cascade,
  regra text not null,
  estado text not null check (estado in ('resolvido','adiado')),
  por_user uuid default auth.uid(),
  ate timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (client_id, regra)
);
alter table public.alert_state enable row level security;
drop policy if exists alert_state_admin on public.alert_state;
create policy alert_state_admin on public.alert_state
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
revoke all on public.alert_state from anon, public;
grant select, insert, update, delete on public.alert_state to authenticated;

drop function if exists public.portfolio_overview(date, date);
create function public.portfolio_overview(p_start date, p_end date)
returns table(
  client_id uuid,
  name text,
  specialty text,
  instagram_handle text,
  em_onboarding boolean,
  tem_instagram boolean,
  tem_anuncios boolean,
  tem_crm boolean,
  tem_atendimento boolean,
  reach bigint,
  reach_prev bigint,
  dias_com_dado integer,
  dias_com_dado_prev integer,
  dias_periodo integer,
  new_followers bigint,
  followers_atual bigint,
  serie_alcance bigint[],
  ad_spend numeric,
  ad_conversas bigint,
  ad_leads bigint,
  crm_leads bigint,
  ult_instagram date,
  ult_anuncios date,
  ult_crm date,
  ult_atendimento date
)
language plpgsql stable security definer set search_path = public
as $$
declare
  n int := greatest(p_end - p_start + 1, 1);
  prev_start date := p_start - greatest(p_end - p_start + 1, 1);
begin
  if not public.is_app_admin() then
    return;
  end if;

  return query
  with cl as (
    select c.* from clients c where c.active
  ),
  ig as (
    select d.client_id, d.date,
           sum(coalesce(d.reach,0))::bigint reach,
           sum(coalesce(d.new_followers,0))::bigint nf
    from instagram_account_daily_metrics d
    join instagram_accounts a on a.id = d.instagram_account_id and a.active
    where d.date >= prev_start and d.date <= p_end
    group by d.client_id, d.date
  ),
  ig_agg as (
    select client_id,
      coalesce(sum(reach) filter (where date between p_start and p_end),0)::bigint reach,
      coalesce(sum(reach) filter (where date < p_start),0)::bigint reach_prev,
      count(*) filter (where date between p_start and p_end and reach > 0)::int dias,
      count(*) filter (where date < p_start and reach > 0)::int dias_prev,
      coalesce(sum(nf) filter (where date between p_start and p_end),0)::bigint nf
    from ig group by client_id
  ),
  serie as (
    select client_id, array_agg(v order by b) s from (
      select cl.id client_id, b.b, coalesce(sum(ig.reach),0)::bigint v
      from cl cross join generate_series(0,11) b(b)
      left join ig on ig.client_id = cl.id and ig.date between p_start and p_end
        and least(11, ((ig.date - p_start) * 12 / n)) = b.b
      group by cl.id, b.b
    ) x group by client_id
  ),
  fol as (
    select client_id, sum(followers_count)::bigint f from (
      select distinct on (d.instagram_account_id) d.client_id, d.followers_count
      from instagram_account_daily_metrics d
      join instagram_accounts a on a.id = d.instagram_account_id and a.active
      where d.followers_count is not null
      order by d.instagram_account_id, d.date desc
    ) t group by client_id
  ),
  ult_ig as (
    select d.client_id, max(d.date) u
    from instagram_account_daily_metrics d
    join instagram_accounts a on a.id = d.instagram_account_id and a.active
    group by d.client_id
  ),
  ads as (
    select client_id,
      coalesce(sum(spend) filter (where date between p_start and p_end),0) spend,
      coalesce(sum(conversations) filter (where date between p_start and p_end),0)::bigint conv,
      coalesce(sum(leads) filter (where date between p_start and p_end),0)::bigint leads,
      max(date) u
    from meta_ads_daily group by client_id
  ),
  crm as (
    select client_id, count(*)::bigint n, max(received_at)::date u
    from crm_leads group by client_id
  ),
  wts as (
    select client_id, max(started_at)::date u from wts_sessions group by client_id
  )
  select cl.id, cl.name, cl.specialty, cl.instagram_handle,
    coalesce(cl.em_onboarding,false),
    exists (select 1 from instagram_accounts i where i.client_id = cl.id and i.active),
    exists (select 1 from client_ad_accounts a where a.client_id = cl.id and a.active)
      or (cl.meta_ad_account_id is not null and cl.meta_ad_account_id <> ''),
    exists (select 1 from crm_connections x where x.client_id = cl.id and x.active),
    cl.wts_company_id is not null,
    coalesce(ia.reach,0), coalesce(ia.reach_prev,0),
    coalesce(ia.dias,0), coalesce(ia.dias_prev,0), n,
    coalesce(ia.nf,0), fol.f, serie.s,
    coalesce(ads.spend,0), coalesce(ads.conv,0), coalesce(ads.leads,0),
    coalesce(crm.n,0),
    ult_ig.u, ads.u, crm.u, wts.u
  from cl
  left join ig_agg ia on ia.client_id = cl.id
  left join serie on serie.client_id = cl.id
  left join fol on fol.client_id = cl.id
  left join ult_ig on ult_ig.client_id = cl.id
  left join ads on ads.client_id = cl.id
  left join crm on crm.client_id = cl.id
  left join wts on wts.client_id = cl.id
  order by cl.name;
end;
$$;
revoke execute on function public.portfolio_overview(date, date) from anon, public;
grant execute on function public.portfolio_overview(date, date) to authenticated;
