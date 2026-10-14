-- Acompanhamento das ações recomendadas (tela Oportunidades). NÃO aplicada
-- automaticamente: revisar e rodar com `supabase db push`. Até lá, a tela guarda
-- o acompanhamento só no navegador e avisa isso.
--
-- Uma linha por (cliente, insight). O insight em si não é gravado (é recalculado
-- das regras a cada leitura); grava-se o que as pessoas fizeram com ele.
-- Sem dado de paciente: só título da recomendação, status, checklist e notas.

create table if not exists public.acoes_acompanhamento (
  client_id uuid not null references public.clients(id) on delete cascade,
  insight_id text not null,
  titulo text not null,
  status text not null check (status in ('nova','em_analise','em_execucao','concluida','resultado_avaliado','adiada','dispensada','expirada')),
  responsavel text not null,
  prazo date,
  checklist jsonb not null default '[]'::jsonb,
  historico jsonb not null default '[]'::jsonb,
  feedback text,
  resultado jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (client_id, insight_id)
);

alter table public.acoes_acompanhamento enable row level security;

-- Mesmo isolamento das outras tabelas do cliente: membro do cliente ou admin.
create policy "membro ou admin le acoes" on public.acoes_acompanhamento
  for select using (public.is_app_admin() or public.is_client_member(client_id));
-- Gravar: admin, owner ou strategist. Viewer só lê.
create or replace function public.pode_editar_acoes(p_client_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_app_admin() or exists (
    select 1 from public.client_members m
    where m.client_id = p_client_id and m.user_id = auth.uid() and m.role in ('owner', 'strategist')
  );
$$;
revoke execute on function public.pode_editar_acoes(uuid) from public, anon;
grant execute on function public.pode_editar_acoes(uuid) to authenticated;
revoke all on public.acoes_acompanhamento from anon;
create policy "editor grava acoes" on public.acoes_acompanhamento
  for insert with check (public.pode_editar_acoes(client_id));
create policy "editor atualiza acoes" on public.acoes_acompanhamento
  for update using (public.pode_editar_acoes(client_id)) with check (public.pode_editar_acoes(client_id));
