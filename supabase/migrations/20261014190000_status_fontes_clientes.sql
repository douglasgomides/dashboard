-- Status das fontes: uma leitura só, usada pelo /admin (tabela e alerta) e pela Conferência de dados.
-- A regra de cor fica em src/lib/status-fonte.ts; aqui só se lê o dado bruto com as MESMAS fontes de
-- data que client_sync_status (o painel do cliente), para as telas não discordarem.

-- Fonte que o cliente não usa de propósito ("É intencional, não mostrar mais" na Conferência).
create table if not exists public.fontes_nao_usadas (
  client_id uuid not null references public.clients(id) on delete cascade,
  fonte text not null check (fonte in ('instagram', 'anuncios', 'crm', 'atendimento')),
  marcado_por uuid,
  marcado_em timestamptz not null default now(),
  primary key (client_id, fonte)
);
alter table public.fontes_nao_usadas enable row level security;
drop policy if exists fontes_nao_usadas_admin on public.fontes_nao_usadas;
create policy fontes_nao_usadas_admin on public.fontes_nao_usadas for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.status_das_fontes()
returns table(client_id uuid, fonte text, cadastro boolean, data_ate date, last_attempt_at timestamptz, last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path to 'public'
as $function$
  with c as (
    select id from clients
    where active and (public.is_app_admin() or auth.uid() is null) -- admin, ou a função da Vercel (service role)
  ),
  d as (
    select c.id,
      -- Instagram: o mais antigo entre métricas diárias e posts (igual a client_sync_status).
      (select case when a is not null and b is not null then least(a, b) else coalesce(a, b) end
         from (select (select max(date) from instagram_account_daily_metrics m where m.client_id = c.id and m.reach is not null) a,
                      (select max(metrics_updated_at)::date from instagram_posts p where p.client_id = c.id) b) x) as ig,
      coalesce((select max(date) from meta_ads_daily m where m.client_id = c.id),
               (select max(analise_em) from ads_planilha_semanal s where s.client_id = c.id and s.analise_em <= current_date)) as ads,
      (select max(coalesce(occurred_at, received_at))::date from crm_leads l where l.client_id = c.id) as crm,
      (select max(started_at)::date from wts_sessions w where w.client_id = c.id) as wts,
      exists (select 1 from instagram_accounts i where i.client_id = c.id and i.active) as tem_ig,
      exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.active)
        or exists (select 1 from clients x where x.id = c.id and coalesce(x.meta_ad_account_id, '') <> '') as tem_ads,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active) as tem_crm,
      exists (select 1 from clients x where x.id = c.id and x.wts_company_id is not null) as tem_wts
    from c
  )
  select d.id, f.fonte,
    case f.fonte when 'instagram' then d.tem_ig when 'anuncios' then d.tem_ads when 'crm' then d.tem_crm else d.tem_wts end,
    case f.fonte when 'instagram' then d.ig when 'anuncios' then d.ads when 'crm' then d.crm else d.wts end,
    s.last_attempt_at, s.last_success_at, s.last_error, s.motivo, s.motivo_dono,
    exists (select 1 from fontes_nao_usadas n where n.client_id = d.id and n.fonte = f.fonte)
  from d
  cross join (values ('instagram'), ('anuncios'), ('crm'), ('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = d.id and s.fonte = f.fonte;
$function$;

revoke all on function public.status_das_fontes() from public, anon;
grant execute on function public.status_das_fontes() to authenticated, service_role;

-- Nota: uma primeira versão, public.status_fontes_clientes() (sem as datas de tentativa/sucesso), foi
-- criada em produção durante o desenvolvimento e não é usada pelo código. Pode ser removida com
-- `drop function public.status_fontes_clientes();` quando conveniente.
