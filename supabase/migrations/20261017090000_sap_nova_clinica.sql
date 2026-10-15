-- SAP como porta de entrada: uma clínica nova é cadastrada direto no Sistema de Aquisição. Cria, numa transação,
-- o cliente (que depois do D90 segue no Doctor Creator Hub, com os mesmos dados) e a clínica do SAP.
create or replace function public.sap_nova_clinica(p_nome text, p_especialidade text, p_cidade text, p_instagram text, p_d0 date, p_piloto boolean, p_servico text, p_ticket numeric)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_client uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if nullif(btrim(p_nome), '') is null then raise exception 'informe o nome da clínica'; end if;
  insert into clients (name, specialty, instagram_handle)
  values (btrim(p_nome), nullif(btrim(p_especialidade), ''), nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), ''))
  returning id into v_client;
  insert into sap_clinicas (client_id, nome, cidade, especialidade, d0, status, servicos, ticket_medio, piloto)
  values (v_client, btrim(p_nome), nullif(btrim(p_cidade), ''), nullif(btrim(p_especialidade), ''), p_d0, 'onboarding',
    case when nullif(btrim(p_servico), '') is null then '{}'::text[] else array[btrim(p_servico)] end, p_ticket, coalesce(p_piloto, false));
  return v_client;
end;
$function$;
revoke all on function public.sap_nova_clinica(text, text, text, text, date, boolean, text, numeric) from public, anon;
grant execute on function public.sap_nova_clinica(text, text, text, text, date, boolean, text, numeric) to authenticated;
