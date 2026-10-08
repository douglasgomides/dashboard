-- Motivo da fonte parada: o sync pergunta à origem (ex.: Meta) POR QUE não há dado novo e grava aqui,
-- junto de DE QUEM é a ação (cliente, meta ou nos). O painel mostra isso em vez de só "parado".
-- Seguro rodar mais de uma vez.

alter table public.sync_status
  add column if not exists motivo text,
  add column if not exists motivo_dono text,
  add column if not exists motivo_em timestamptz;

-- A RPC ganha duas colunas de retorno, então precisa ser recriada (muda o tipo de retorno).
drop function if exists public.client_sync_status(uuid);

create or replace function public.client_sync_status(p_client_id uuid)
returns table (
  fonte text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_rows integer,
  data_ate date,
  motivo text,
  motivo_dono text
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
         end,
         s.motivo, s.motivo_dono
  from (values ('instagram'),('comentarios'),('anuncios'),('crm'),('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = p_client_id and s.fonte = f.fonte;
end;
$$;

revoke all on function public.client_sync_status(uuid) from public, anon;
grant execute on function public.client_sync_status(uuid) to authenticated;
