-- Conferência de dados: guarda cada rodada (etapas, achados e o que foi verificado) com data e hora.
-- Escrita só pelo servidor (service role, em /api/sync/manual alvo "conferencia"); leitura só de admin.
create table if not exists public.conferencias_dados (
  id uuid primary key default gen_random_uuid(),
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  iniciada_por uuid,
  etapas jsonb not null default '[]'::jsonb,      -- [{etapa, status, achados, verificados, ms, erro}]
  achados jsonb not null default '[]'::jsonb,
  verificados jsonb not null default '[]'::jsonb,
  contas_vistas_na_meta integer,
  tokens_testados integer
);
create index if not exists conferencias_dados_iniciada_idx on public.conferencias_dados (iniciada_em desc);
alter table public.conferencias_dados enable row level security;
create policy "conferencias: admin le" on public.conferencias_dados for select to authenticated using (public.is_app_admin());
revoke all on public.conferencias_dados from anon;
