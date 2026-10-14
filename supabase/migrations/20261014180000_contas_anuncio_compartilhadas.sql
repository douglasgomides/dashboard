-- Contas de anúncio ligadas a mais de um cliente ativo (por client_ad_accounts OU clients.meta_ad_account_id).
-- O sync grava a conta inteira para cada cliente, então o gasto aparece 100% em cada um. Esta função só
-- informa (a tela avisa); dividir por campanha exige decidir quais campanhas são de quem (pendência).
-- Membro vê só a contagem; nomes dos outros clientes só para admin.
create or replace function public.contas_anuncio_compartilhadas(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ligadas as (
    select a.client_id, a.ad_account_id from client_ad_accounts a join clients c on c.id = a.client_id and c.active where a.active
    union
    select c.id, c.meta_ad_account_id from clients c where c.active and c.meta_ad_account_id is not null and c.meta_ad_account_id <> ''
  ),
  minhas as (select distinct ad_account_id from ligadas where client_id = p_client_id)
  select case when not (public.is_app_admin() or public.is_client_member(p_client_id)) then null else coalesce(jsonb_agg(x), '[]'::jsonb) end
  from (
    select m.ad_account_id,
      count(distinct l.client_id) as outros_clientes,
      case when public.is_app_admin() then (select jsonb_agg(distinct c.name) from clients c where c.id in (select l2.client_id from ligadas l2 where l2.ad_account_id = m.ad_account_id and l2.client_id <> p_client_id)) end as nomes
    from minhas m join ligadas l on l.ad_account_id = m.ad_account_id and l.client_id <> p_client_id
    group by m.ad_account_id
  ) x;
$function$;
revoke all on function public.contas_anuncio_compartilhadas(uuid) from public, anon;
grant execute on function public.contas_anuncio_compartilhadas(uuid) to authenticated;
