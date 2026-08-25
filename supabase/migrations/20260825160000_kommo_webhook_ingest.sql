-- Ingestão de eventos de lead da Kommo via webhook nativo (sem OAuth) — a
-- Kommo empurra o evento pra nossa URL na hora que acontece, em vez da gente
-- ficar puxando a API de tempos em tempos. webhook_secret protege o endpoint
-- (a Kommo não assina/autentica os webhooks nativamente).
alter table public.crm_connections
  add column webhook_secret text;

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('kommo', 'feegow', 'ninsaude')),
  external_lead_id text not null,
  event_type text not null check (event_type in ('add', 'status', 'delete')),
  status_id text,
  old_status_id text,
  pipeline_id text,
  price numeric,
  raw_payload jsonb not null,
  received_at timestamptz not null default now()
);

create index crm_leads_client_id_idx on public.crm_leads(client_id);
create index crm_leads_connection_lead_idx on public.crm_leads(crm_connection_id, external_lead_id);

alter table public.crm_leads enable row level security;

create policy "admin reads crm leads" on public.crm_leads
  for select to authenticated
  using (public.is_app_admin());
