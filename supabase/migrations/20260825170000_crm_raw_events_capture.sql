-- Captura bruta de qualquer evento de webhook da Kommo que não seja lead
-- (ex: "chat" — mensagem recebida). A documentação pública da Kommo não
-- detalha a estrutura exata desse evento, então guardamos o payload cru
-- primeiro pra inspecionar dado real antes de escrever o parser definitivo.
create table public.crm_raw_events (
  id uuid primary key default gen_random_uuid(),
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  event_key text not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now()
);

create index crm_raw_events_client_id_idx on public.crm_raw_events(client_id);

alter table public.crm_raw_events enable row level security;

create policy "admin reads crm raw events" on public.crm_raw_events
  for select to authenticated
  using (public.is_app_admin());
