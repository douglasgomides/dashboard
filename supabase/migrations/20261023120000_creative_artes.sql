-- Inteligência Criativa: arte dos slides de uma adaptação, gerada como RASCUNHO para revisão (nada é publicado).
-- O arquivo fica no bucket privado nexo-creative-private (pasta artes/) e só é lido por URL assinada criada pelo
-- servidor depois de conferir a permissão. Escrita só pelo servidor (service_role).
-- Reversão: drop table public.creative_artes; (e apagar a pasta artes/ do bucket, se quiser liberar espaço)
create table if not exists public.creative_artes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  adaptation_id uuid not null,
  position int not null check (position >= 1),
  storage_path text not null unique check (storage_path like 'artes/%'),
  status text not null default 'rascunho' check (status in ('rascunho','aprovada','descartada')),
  modelo text,
  qualidade text,
  custo_usd numeric,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  revisado_por uuid,
  revisado_em timestamptz
);
create index if not exists creative_artes_adaptacao on public.creative_artes (client_id, adaptation_id, position, criado_em desc);
alter table public.creative_artes enable row level security;
revoke all on public.creative_artes from public, anon, authenticated;
grant all on public.creative_artes to service_role;
