-- Planejador de conteúdo (tela Ideias): ideia vira pauta, ganha dia no plano da semana e anda
-- pelo status nova → escolhida → produzida → publicada → medida.
-- Sem dado de paciente: só a pauta (título, formato, gancho, roteiro), de onde veio e o status.
-- Mesmo isolamento e mesma regra de edição de acoes_acompanhamento (admin, owner ou strategist grava).
create table if not exists public.pautas_conteudo (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ideia_id text,                      -- id da ideia que originou (null = pauta criada à mão)
  titulo text not null,
  formato text not null check (formato in ('reels','carrossel','estatico','stories')),
  objetivo text not null check (objetivo in ('alcance','salvamento','conversa','autoridade')),
  status text not null default 'nova' check (status in ('nova','escolhida','produzida','publicada','medida')),
  motivo text,                        -- por que vale fazer
  origem_tipo text not null default 'manual' check (origem_tipo in ('duvida','tema','formato','post','dado','manual')),
  origem_texto text,                  -- o post, a dúvida ou o dado que originou
  gancho text,
  roteiro jsonb not null default '[]'::jsonb,
  cta text,
  aviso text,
  dia date,                           -- dia no plano (null = ainda sem dia)
  post_id uuid references public.instagram_posts(id) on delete set null, -- post publicado, para medir
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
create unique index if not exists pautas_conteudo_ideia_uidx on public.pautas_conteudo (client_id, ideia_id) where ideia_id is not null;
create index if not exists pautas_conteudo_dia_idx on public.pautas_conteudo (client_id, dia);

alter table public.pautas_conteudo enable row level security;
revoke all on public.pautas_conteudo from anon;
create policy "pautas: membro ou admin le" on public.pautas_conteudo for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
create policy "pautas: editor grava" on public.pautas_conteudo for insert to authenticated
  with check (public.pode_editar_acoes(client_id));
create policy "pautas: editor atualiza" on public.pautas_conteudo for update to authenticated
  using (public.pode_editar_acoes(client_id)) with check (public.pode_editar_acoes(client_id));
create policy "pautas: editor apaga" on public.pautas_conteudo for delete to authenticated
  using (public.pode_editar_acoes(client_id));
