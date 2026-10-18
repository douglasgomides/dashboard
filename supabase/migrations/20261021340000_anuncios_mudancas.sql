-- Ações nos anúncios com 1 clique (src/lib/anuncios-acoes.ts, api/_lib/anuncios-acoes.ts): pausar, reativar ou mudar o
-- orçamento em até 20% de uma campanha, aprovadas por uma pessoa da equipe e aplicadas pela API da Meta com o token
-- META_ADS_WRITE_TOKEN. Cada linha guarda o estado anterior (para desfazer) e quem aprovou. Só admin lê; o servidor grava.
-- Reversão: drop table anuncios_mudancas;
create table if not exists public.anuncios_mudancas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sugestao_id uuid references public.sugestoes_agentes(id) on delete set null,
  campanha_id text not null,
  tipo text not null check (tipo in ('pausar', 'ativar', 'orcamento')),
  pct numeric,
  antes jsonb not null default '{}',
  depois jsonb not null default '{}',
  estado text not null check (estado in ('aplicada', 'desfeita', 'falhou')),
  erro text,
  aprovado_por uuid,
  aplicado_em timestamptz,
  desfeito_em timestamptz,
  desfeito_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists anuncios_mudancas_cliente on public.anuncios_mudancas (client_id, criado_em desc);
create index if not exists anuncios_mudancas_campanha on public.anuncios_mudancas (campanha_id, aplicado_em desc);
alter table public.anuncios_mudancas enable row level security;
create policy "anuncios_mudancas: admin le" on public.anuncios_mudancas for select to authenticated using (public.is_app_admin());
revoke all on public.anuncios_mudancas from anon;
revoke insert, update, delete on public.anuncios_mudancas from authenticated;
