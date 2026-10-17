-- Campos usados pelo código e por migrações posteriores, antes criados só
-- no banco ativo. A data antecede a migração que restringe SELECT por coluna.
-- IF NOT EXISTS mantém os valores de ambientes que já têm esses campos.
alter table public.clients
  add column if not exists em_onboarding boolean not null default false,
  add column if not exists wts_api_token text,
  add column if not exists digisac_url text,
  add column if not exists digisac_token text;

alter table public.instagram_accounts
  add column if not exists provisional boolean not null default false;

alter table public.client_ad_accounts
  add column if not exists provisional boolean not null default false,
  add column if not exists access_token text;

comment on column public.clients.digisac_token is
  'Credencial legada do Digisac. Leitura não concedida a authenticated; uso apenas pelo servidor.';
