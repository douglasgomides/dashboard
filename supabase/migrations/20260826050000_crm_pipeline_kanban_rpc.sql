-- Retorna toda etapa de todo pipeline do cliente, com contagem e valor —
-- inclusive as que nunca tiveram lead (sem HAVING), pro kanban do dashboard
-- mostrar etapa vazia como tal, não simplesmente omitir.
create or replace function public.crm_pipeline_kanban(p_client_id uuid)
returns table(
  pipeline_id text,
  pipeline_name text,
  status_id text,
  status_name text,
  total bigint,
  valor_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id) as total,
    coalesce(sum(cl.price), 0) as valor_total
  from crm_pipeline_statuses cps
  join crm_connections cc on cc.id = cps.crm_connection_id
  left join crm_leads cl
    on cl.crm_connection_id = cps.crm_connection_id
    and cl.pipeline_id = cps.pipeline_id
    and cl.status_id = cps.status_id
    and cl.client_id = p_client_id
  where cc.client_id = p_client_id
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  group by cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name
  order by cps.pipeline_id, cps.status_id;
$$;

grant execute on function public.crm_pipeline_kanban(uuid) to authenticated;
