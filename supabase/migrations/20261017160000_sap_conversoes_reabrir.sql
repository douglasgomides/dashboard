-- Lote F: etapa marcada "sem_dados" volta para a fila se o CRM passar a ter telefone ou e-mail do lead
-- (o prazo da plataforma continua valendo: o lote expira o que passou de 7 dias na Meta / 63 no Google).
create or replace function public.sap_conversoes_reabrir(p_plataforma text)
returns void language sql security definer set search_path to 'public'
as $function$
  update sap_conversoes c set status = 'pendente', motivo = null
  where c.plataforma = p_plataforma and c.status = 'sem_dados'
    and exists (select 1 from crm_leads l where l.crm_connection_id = c.crm_connection_id and l.external_lead_id = c.external_lead_id
      and (nullif(trim(l.contact_phone), '') is not null or nullif(trim(l.contact_email), '') is not null));
$function$;
revoke all on function public.sap_conversoes_reabrir(text) from public, anon, authenticated;
grant execute on function public.sap_conversoes_reabrir(text) to service_role;

-- O lote chama a reabertura antes de expirar e de marcar "sem_dados".
do $$
declare d text;
begin
  select pg_get_functiondef('public.sap_conversoes_lote(text, integer)'::regprocedure) into d;
  if position('sap_conversoes_reabrir' in d) = 0 then
    d := replace(d, $r$if p_plataforma not in ('meta','google') then raise exception 'plataforma invalida'; end if;$r$,
      $r$if p_plataforma not in ('meta','google') then raise exception 'plataforma invalida'; end if;
  perform public.sap_conversoes_reabrir(p_plataforma);$r$);
    execute d;
  end if;
end $$;
