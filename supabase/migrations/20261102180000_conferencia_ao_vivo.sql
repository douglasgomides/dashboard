-- Conferência ao vivo: o Nexo contra o CRM de origem (Kommo, FlwChat/WTS, Digisac, RD Station), lido na hora só com GET
-- (api/_lib/conferencia-ao-vivo.ts, rota api/sync/manual?conferencia_ao_vivo=1 com SYNC_SECRET).
-- Uma linha por rodada, cliente, fonte e métrica: o número do Nexo, o da fonte, a tolerância e se bateu. ok nulo quando a
-- fonte não pôde ser lida (sem token, erro, sem tempo). detalhe guarda só contagens e períodos: nada de nome, telefone,
-- e-mail ou id de lead.
-- Admin lê tudo; membro do cliente lê o próprio cliente; só o servidor (service_role) grava.
-- Não destrutiva. Reversão: drop table public.conferencia_ao_vivo;

create table if not exists public.conferencia_ao_vivo (
  id bigserial primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  crm_connection_id uuid references public.crm_connections(id) on delete cascade,
  fonte text not null check (fonte in ('kommo', 'flwchat', 'wts', 'digisac', 'rdstation')),
  metrica text not null check (metrica ~ '^[a-z0-9_]{1,60}$'),
  nexo integer,
  fonte_valor integer,
  tolerancia text not null,
  ok boolean,
  amostra integer check (amostra is null or amostra between 0 and 100),
  rodado_em timestamptz not null default now(),
  detalhe jsonb not null default '{}'::jsonb
);
create index if not exists conferencia_ao_vivo_cliente_idx on public.conferencia_ao_vivo (client_id, fonte, rodado_em desc);
create index if not exists conferencia_ao_vivo_rodada_idx on public.conferencia_ao_vivo (rodado_em desc);

alter table public.conferencia_ao_vivo enable row level security;
revoke all on table public.conferencia_ao_vivo from public, anon, authenticated;
grant select on table public.conferencia_ao_vivo to authenticated;
grant select, insert, update, delete on table public.conferencia_ao_vivo to service_role;
grant usage, select on sequence public.conferencia_ao_vivo_id_seq to service_role;
revoke all on sequence public.conferencia_ao_vivo_id_seq from public, anon, authenticated;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conferencia_ao_vivo'
                   and policyname = 'admin ou membro le conferencia_ao_vivo') then
    create policy "admin ou membro le conferencia_ao_vivo" on public.conferencia_ao_vivo
      for select to authenticated
      using (public.is_app_admin() or public.is_client_member(client_id));
  end if;
end $pol$;

comment on table public.conferencia_ao_vivo is 'Conferência ao vivo Nexo x CRM de origem (só GET na fonte). Uma linha por rodada, cliente, fonte e métrica; ok nulo = fonte não lida.';
