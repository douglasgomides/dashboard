-- FlwChat / Synkronos (plataforma WTS) como provedor de CRM: painéis de vendas lidos pela API.
alter table public.crm_connections drop constraint if exists crm_connections_provider_check;
alter table public.crm_connections add constraint crm_connections_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation','flwchat']));
alter table public.crm_leads drop constraint if exists crm_leads_provider_check;
alter table public.crm_leads add constraint crm_leads_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation','flwchat']));

-- Quando o cliente tem planilha E um CRM ligado por API, o provedor exibido é o da API
-- (é ele que tem botão de sincronizar). Antes valia só a conexão mais antiga.
create or replace function public.crm_provider(p_client_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select x.provider
  from crm_connections x
  where x.client_id = p_client_id and x.active
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  order by (x.provider = 'planilha') asc, x.created_at asc
  limit 1;
$function$;
