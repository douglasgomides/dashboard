-- Pacientes do período: avisar quando o CRM da clínica é a mesma conta de outras clínicas (HOMS, Dr. Antônio e
-- Dra. Ana usam o mesmo Kommo; os três viam os números do hospital inteiro como se fossem seus).
-- Reversão: recriar pacientes_periodo sem o campo crm_compartilhado_com.

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  a1 text := $a$    'cliente_de_teste', f.teste,$a$;
  n1 text := $n$    'cliente_de_teste', f.teste,
    'crm_compartilhado_com', coalesce((
      select jsonb_agg(distinct o.name order by o.name)
        from crm_connections k
        join crm_connections k2 on k2.provider = k.provider and k2.client_id <> k.client_id and k2.active
          and coalesce(k2.subdomain, '') <> '' and k2.subdomain = k.subdomain
        join clients o on o.id = k2.client_id and o.active and not o.eh_teste
       where k.client_id = p_client and k.active), '[]'::jsonb),$n$;
begin
  if position('crm_compartilhado_com' in d) > 0 then return; end if;
  if position(a1 in d) = 0 then raise exception 'pacientes_periodo: trecho não encontrado'; end if;
  execute replace(d, a1, n1);
end
$migra$;
