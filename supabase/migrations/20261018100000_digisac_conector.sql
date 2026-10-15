-- Conector do Digisac (IGM Palmas: Dra. Rafaela e Dr. Antonione).
-- 1) crm_connections e crm_leads passam a aceitar provider = 'digisac'.
-- 2) Cria a conexão do cliente que já tem digisac_url/digisac_token cadastrados.
--    O token vem do próprio cadastro (clients.digisac_token): não passa por este arquivo.

alter table public.crm_connections drop constraint if exists crm_connections_provider_check;
alter table public.crm_connections add constraint crm_connections_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation','flwchat','digisac']::text[]));

alter table public.crm_leads drop constraint if exists crm_leads_provider_check;
alter table public.crm_leads add constraint crm_leads_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation','flwchat','digisac']::text[]));

insert into public.crm_connections (client_id, provider, subdomain, access_token, active)
select c.id, 'digisac',
       regexp_replace(regexp_replace(c.digisac_url, '^https?://', ''), '\.digisac\.io/?$', ''),
       c.digisac_token, true
  from public.clients c
 where c.digisac_url is not null
   and c.digisac_token is not null
   and not exists (select 1 from public.crm_connections x where x.client_id = c.id and x.provider = 'digisac');
