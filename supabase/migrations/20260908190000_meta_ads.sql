-- Gasto de mídia do Meta (Facebook e Instagram Ads), por dia e por campanha.
--
-- Duas tabelas em vez de uma: o nome da campanha vem truncado pela própria
-- Meta em post impulsionado ("Post do Instagram: Mini lipo em consultório:...")
-- e duas campanhas distintas chegam com o mesmo texto — a identidade real é o
-- campaign_id. Repetir nome e objetivo em ~1.800 linhas diárias também seria
-- desperdício.

alter table public.clients add column if not exists meta_ad_account_id text;

create table if not exists public.meta_ads_campaigns (
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id text not null,
  campaign_id text not null,
  name text not null,
  objective text,
  updated_at timestamptz not null default now(),
  primary key (client_id, ad_account_id, campaign_id)
);

create table if not exists public.meta_ads_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id text not null,
  date date not null,
  campaign_id text not null,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  unique_clicks bigint not null default 0,
  frequency numeric(8,4),
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  leads bigint not null default 0,
  -- Conversa iniciada no Direct/WhatsApp. Nestas contas não há pixel nem
  -- formulário, então leads e landing_page_views chegam zerados e esta é a
  -- única conversão real que dá para medir.
  conversations bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_ads_daily_chave unique (client_id, ad_account_id, date, campaign_id)
);

create index if not exists meta_ads_daily_cliente_data on public.meta_ads_daily (client_id, date desc);

alter table public.meta_ads_campaigns enable row level security;
alter table public.meta_ads_daily enable row level security;

drop policy if exists "read own or admin reads all campaigns" on public.meta_ads_campaigns;
create policy "read own or admin reads all campaigns" on public.meta_ads_campaigns
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "read own or admin reads all ads" on public.meta_ads_daily;
create policy "read own or admin reads all ads" on public.meta_ads_daily
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Estado da sincronização, no mesmo formato das outras.
create table if not exists public.meta_ads_sync_state (
  ad_account_id text primary key,
  last_date_synced date,
  updated_at timestamptz not null default now()
);
alter table public.meta_ads_sync_state enable row level security;

-- CTR, CPC, CPM e custo por conversa são sempre derivados do gasto na
-- leitura, nunca gravados: assim não divergem quando a Meta revisa um dia já
-- sincronizado e o upsert corrige o número.
create or replace view public.meta_ads_daily_v as
select d.client_id, d.ad_account_id, d.date, d.campaign_id,
       c.name as campaign, c.objective,
       d.spend, d.impressions, d.reach, d.clicks, d.unique_clicks, d.frequency,
       d.link_clicks, d.landing_page_views, d.leads, d.conversations,
       case when d.impressions > 0 then round(d.clicks::numeric / d.impressions, 5) end as ctr,
       case when d.clicks > 0 then round(d.spend / d.clicks, 4) end as cpc,
       case when d.impressions > 0 then round(d.spend / d.impressions * 1000, 4) end as cpm,
       case when d.conversations > 0 then round(d.spend / d.conversations, 2) end as custo_por_conversa
from public.meta_ads_daily d
left join public.meta_ads_campaigns c
  on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id;

-- Agregação no banco pelo mesmo motivo das funções de CRM: são ~1.800 linhas
-- por cliente e a tela mostra meia dúzia de números.

create or replace function public.ads_resumo(p_client_id uuid, p_start date, p_end date)
returns table(
  gasto numeric, impressoes bigint, alcance_somado bigint, cliques bigint,
  cliques_link bigint, conversas bigint, campanhas bigint, dias bigint,
  ctr numeric, cpc numeric, cpm numeric, custo_por_conversa numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select
    coalesce(sum(d.spend), 0),
    coalesce(sum(d.impressions), 0),
    coalesce(sum(d.reach), 0),
    coalesce(sum(d.clicks), 0),
    coalesce(sum(d.link_clicks), 0),
    coalesce(sum(d.conversations), 0),
    count(distinct d.campaign_id),
    count(distinct d.date),
    case when sum(d.impressions) > 0 then round(sum(d.clicks)::numeric / sum(d.impressions) * 100, 2) end,
    case when sum(d.clicks) > 0 then round(sum(d.spend) / sum(d.clicks), 2) end,
    case when sum(d.impressions) > 0 then round(sum(d.spend) / sum(d.impressions) * 1000, 2) end,
    case when sum(d.conversations) > 0 then round(sum(d.spend) / sum(d.conversations), 2) end
  from meta_ads_daily d
  where d.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and d.date between p_start and p_end;
$$;

create or replace function public.ads_por_dia(p_client_id uuid, p_start date, p_end date)
returns table(dia date, gasto numeric, conversas bigint, cliques_link bigint, impressoes bigint)
language sql stable security definer set search_path to 'public'
as $$
  select d.date, round(sum(d.spend), 2), sum(d.conversations), sum(d.link_clicks), sum(d.impressions)
  from meta_ads_daily d
  where d.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and d.date between p_start and p_end
  group by d.date
  order by d.date;
$$;

-- Ordenado por gasto: a pergunta que a tabela responde é "para onde foi o
-- dinheiro", e só depois "o que ele trouxe".
create or replace function public.ads_por_campanha(p_client_id uuid, p_start date, p_end date)
returns table(
  campanha text, objetivo text, gasto numeric, impressoes bigint,
  cliques_link bigint, conversas bigint, ctr numeric, custo_por_conversa numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select
    coalesce(c.name, '(campanha removida)'),
    c.objective,
    round(sum(d.spend), 2),
    sum(d.impressions),
    sum(d.link_clicks),
    sum(d.conversations),
    case when sum(d.impressions) > 0 then round(sum(d.clicks)::numeric / sum(d.impressions) * 100, 2) end,
    case when sum(d.conversations) > 0 then round(sum(d.spend) / sum(d.conversations), 2) end
  from meta_ads_daily d
  left join meta_ads_campaigns c
    on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id
  where d.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and d.date between p_start and p_end
  group by c.name, c.objective
  order by 3 desc;
$$;

-- O objetivo escolhido ao subir a campanha é a variável que mais mexeu no
-- custo por conversa nestas contas, por isso ganha um corte próprio.
create or replace function public.ads_por_objetivo(p_client_id uuid, p_start date, p_end date)
returns table(
  objetivo text, campanhas bigint, gasto numeric, conversas bigint,
  custo_por_conversa numeric, ctr numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select
    coalesce(c.objective, '(sem objetivo)'),
    count(distinct d.campaign_id),
    round(sum(d.spend), 2),
    sum(d.conversations),
    case when sum(d.conversations) > 0 then round(sum(d.spend) / sum(d.conversations), 2) end,
    case when sum(d.impressions) > 0 then round(sum(d.clicks)::numeric / sum(d.impressions) * 100, 2) end
  from meta_ads_daily d
  left join meta_ads_campaigns c
    on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id
  where d.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
    and d.date between p_start and p_end
  group by c.objective
  order by 3 desc;
$$;
