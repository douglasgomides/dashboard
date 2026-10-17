-- Correção: tem_modulo respondia "não" quando chamado pelo servidor (service_role, sem usuário logado), e o agente do
-- Brand Brain falhava com "não está ativo para esta clínica". O servidor passa a poder consultar. Reversão: recriar a
-- versão de 20261020120000_cliente_modulos.sql.
create or replace function public.tem_modulo(p_client_id uuid, p_modulo text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select case
    when not (public.is_app_admin() or public.is_client_member(p_client_id) or coalesce(auth.jwt()->>'role', '') = 'service_role') then false
    when exists (select 1 from cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo) then
      exists (select 1 from cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo and m.status in ('ativo', 'beta'))
    else p_modulo = 'hub'
  end;
$function$;
