-- Registro persistido de cada tentativa de sincronização, por cliente x fonte.
--
-- Antes, o erro de um sync só existia na resposta HTTP / execução do n8n e se
-- perdia. Agora cada tentativa deixa rastro: última tentativa, último sucesso,
-- último erro. A "frescura real" porém vem do DADO (max(date) etc.), calculada
-- pela RPC client_sync_status — tentativa não é prova de dado novo.

create table if not exists public.sync_status (
  client_id uuid not null references public.clients(id) on delete cascade,
  fonte text not null check (fonte in ('instagram','comentarios','anuncios','crm','atendimento')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_rows integer,
  data_ate date,
  updated_at timestamptz not null default now(),
  primary key (client_id, fonte)
);

alter table public.sync_status enable row level security;

drop policy if exists "membro ou admin le sync_status" on public.sync_status;
create policy "membro ou admin le sync_status" on public.sync_status
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

-- Escrita só pelo service_role (que ignora RLS); sem policy de escrita e sem
-- grant para anon/authenticated além do select.
revoke all on public.sync_status from anon, authenticated, public;
grant select on public.sync_status to authenticated;

create or replace function public.client_sync_status(p_client_id uuid)
returns table (
  fonte text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_rows integer,
  data_ate date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ig date;
  v_ig_posts date;
  v_ads date;
  v_crm date;
  v_wts date;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then
    return;
  end if;

  -- Instagram: vale o dado MAIS ANTIGO entre métricas diárias da conta e a
  -- última atualização de métricas dos posts. Se os posts pararam e a conta
  -- segue atualizando (caso real da Marcelly), o selo precisa mostrar o atraso.
  select max(date) into v_ig from instagram_account_daily_metrics where client_id = p_client_id;
  select max(metrics_updated_at)::date into v_ig_posts from instagram_posts where client_id = p_client_id;
  if v_ig is not null and v_ig_posts is not null then v_ig := least(v_ig, v_ig_posts);
  else v_ig := coalesce(v_ig, v_ig_posts); end if;

  select max(date) into v_ads from meta_ads_daily where client_id = p_client_id;
  select max(received_at)::date into v_crm from crm_leads where client_id = p_client_id;
  select max(started_at)::date into v_wts from wts_sessions where client_id = p_client_id;

  return query
  select f.fonte,
         s.last_attempt_at, s.last_success_at, s.last_error, s.last_rows,
         case f.fonte
           when 'instagram' then v_ig
           when 'anuncios' then v_ads
           when 'crm' then v_crm
           when 'atendimento' then v_wts
           else s.last_success_at::date
         end
  from (values ('instagram'),('comentarios'),('anuncios'),('crm'),('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = p_client_id and s.fonte = f.fonte;
end;
$$;

revoke all on function public.client_sync_status(uuid) from public, anon;
grant execute on function public.client_sync_status(uuid) to authenticated;

-- Backfill inicial: data_ate calculado do dado atual para clientes ativos,
-- para o selo não nascer vazio. last_success/last_attempt ficam nulos até a
-- primeira rodada real registrar.
insert into public.sync_status (client_id, fonte, data_ate)
select c.id, 'instagram',
       least(
         (select max(date) from instagram_account_daily_metrics m where m.client_id = c.id),
         (select max(metrics_updated_at)::date from instagram_posts p where p.client_id = c.id))
from clients c where c.active
  and exists (select 1 from instagram_accounts a where a.client_id = c.id and a.active)
on conflict (client_id, fonte) do nothing;

insert into public.sync_status (client_id, fonte, data_ate)
select c.id, 'anuncios', (select max(date) from meta_ads_daily d where d.client_id = c.id)
from clients c where c.active and exists (select 1 from meta_ads_daily d where d.client_id = c.id)
on conflict (client_id, fonte) do nothing;

insert into public.sync_status (client_id, fonte, data_ate)
select c.id, 'crm', (select max(received_at)::date from crm_leads l where l.client_id = c.id)
from clients c where c.active and exists (select 1 from crm_leads l where l.client_id = c.id)
on conflict (client_id, fonte) do nothing;

insert into public.sync_status (client_id, fonte, data_ate)
select c.id, 'atendimento', (select max(started_at)::date from wts_sessions w where w.client_id = c.id)
from clients c where c.active and exists (select 1 from wts_sessions w where w.client_id = c.id)
on conflict (client_id, fonte) do nothing;
