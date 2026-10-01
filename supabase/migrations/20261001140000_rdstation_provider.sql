-- RD Station CRM como provedor de CRM (negociações lidas pela API v1).
alter table public.crm_connections drop constraint if exists crm_connections_provider_check;
alter table public.crm_connections add constraint crm_connections_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation']));
alter table public.crm_leads drop constraint if exists crm_leads_provider_check;
alter table public.crm_leads add constraint crm_leads_provider_check
  check (provider = any (array['kommo','feegow','ninsaude','clint','planilha','rdstation']));
