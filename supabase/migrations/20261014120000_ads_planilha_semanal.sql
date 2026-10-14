-- Anúncios lidos de uma planilha do gestor de tráfego, para clientes cuja conta de anúncios
-- a Meta/Windsor não entrega (hoje: Dra. Marcelly Achkar, impulsionamentos feitos pelo Instagram
-- numa conta que ninguém do time enxerga). A planilha é SEMANAL: uma linha por post turbinado em
-- cada dia de análise. Não tem dado diário, então não entra em meta_ads_daily nem é espalhada em dias.
-- Sai de cena quando a conta de anúncios passar a ser lida direto (client_ad_accounts).

alter table public.clients add column if not exists ads_planilha_url text;

create table if not exists public.ads_planilha_semanal (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  analise_em date not null,
  post_url text not null,
  nome text,
  tipo text,
  status text,
  acao text,
  orcamento_dia numeric,
  valor_total numeric,
  valor_periodo numeric,
  seguidores_antes integer,
  seguidores_apos integer,
  seguidores_periodo integer,
  mensagens_antes integer,
  mensagens_depois integer,
  mensagens_periodo integer,
  custo_seguidor numeric,
  custo_mensagem numeric,
  atualizado_em timestamptz not null default now(),
  unique (client_id, analise_em, post_url)
);

create index if not exists ads_planilha_semanal_cliente_data on public.ads_planilha_semanal (client_id, analise_em desc);

alter table public.ads_planilha_semanal enable row level security;

drop policy if exists ads_planilha_semanal_leitura on public.ads_planilha_semanal;
create policy ads_planilha_semanal_leitura on public.ads_planilha_semanal
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- A aba Anúncios só aparece com fonte ligada: planilha conta como fonte.
create or replace function public.client_fontes(p_client_id uuid)
 returns table(tem_instagram boolean, tem_anuncios boolean, tem_crm boolean, tem_atendimento boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    exists (select 1 from instagram_accounts i
             where i.client_id = p_client_id and i.active and not coalesce(i.provisional,false)),
    exists (select 1 from client_ad_accounts a
             where a.client_id = p_client_id and a.active and not coalesce(a.provisional,false))
      or exists (select 1 from clients c
                  where c.id = p_client_id
                    and c.meta_ad_account_id is not null
                    and c.meta_ad_account_id <> '')
      or exists (select 1 from clients c
                  where c.id = p_client_id
                    and c.ads_planilha_url is not null
                    and c.ads_planilha_url <> ''),
    exists (select 1 from crm_connections x
             where x.client_id = p_client_id and x.active),
    exists (select 1 from clients c
             where c.id = p_client_id
               and (c.wts_company_id is not null or c.digisac_url is not null))
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;

update public.clients
   set ads_planilha_url = 'https://docs.google.com/spreadsheets/d/1oXloEY67snGsh1ZSkvBXiJhn2_02N6PfkB4Mk_PHaHo/export?format=csv&gid=0'
 where id = '633e6ee6-cb55-4796-8ffe-ce9c6e34cc12';
