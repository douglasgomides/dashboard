-- Reuniões com a clínica (Nexo e SAP): a equipe anota do jeito que quiser e, opcionalmente, cola a transcrição.
-- Ao processar (servidor, api/_lib/reuniao.ts), a IA devolve resumo, combinados, ações de cada lado e o que entregar
-- na semana, e PROPÕE memórias para o Brain da clínica (brain_propor; uma pessoa aprova). Nada é enviado à clínica.
-- Acesso: só admin (mesmo nível do Brain). Notas e transcrição passam por máscara de telefone, e-mail e CPF antes da IA.
-- Reversão: drop table public.reunioes;

create table if not exists public.reunioes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  data date not null default current_date,
  titulo text not null default 'Reunião' check (length(btrim(titulo)) between 1 and 200),
  participantes text check (participantes is null or length(participantes) <= 500),
  notas text not null default '' check (length(notas) <= 30000),
  transcricao text check (transcricao is null or length(transcricao) <= 60000),
  resultado jsonb,
  memorias_propostas integer not null default 0,
  processada_em timestamptz,
  processada_por uuid,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists reunioes_cliente_data on public.reunioes (client_id, data desc);
alter table public.reunioes enable row level security;
drop policy if exists reunioes_admin on public.reunioes;
create policy reunioes_admin on public.reunioes for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
revoke all on public.reunioes from anon, authenticated;
grant select, insert, update, delete on public.reunioes to authenticated;
grant all on public.reunioes to service_role;
