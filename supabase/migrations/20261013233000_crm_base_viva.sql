-- Base viva x base parada do CRM. Função NOVA, só leitura e aditiva: não muda nenhuma
-- métrica existente. Serve para a tela Comercial dizer quantos dos leads em aberto
-- realmente estão em movimento (movimentados nos últimos 30 dias) e quantos são
-- estoque parado (90+ dias sem movimento), que distorce taxas calculadas sobre a base.
-- "Movimento" = lead_ultima_movimentacao (updated_at do Kommo, updatedAt do flwChat,
-- updated_stage_at do Clint, last_activity_at do RD; sem isso, a data de criação).
create or replace function public.crm_base_viva(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'abertos', count(*),
    'vivos_30d', count(*) filter (where m >= now() - interval '30 days'),
    'parados_90d', count(*) filter (where m < now() - interval '90 days'),
    'criados_30d', count(*) filter (where occurred_at >= now() - interval '30 days')
  )
  from (
    select cl.occurred_at, public.lead_ultima_movimentacao(cl.provider, cl.raw_payload, cl.occurred_at) as m
    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active
    where cl.client_id = p_client_id and cl.removido_na_origem is null
      and coalesce(cl.outcome, 'open') = 'open'
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ) x;
$function$;

revoke all on function public.crm_base_viva(uuid) from public, anon;
grant execute on function public.crm_base_viva(uuid) to authenticated;
