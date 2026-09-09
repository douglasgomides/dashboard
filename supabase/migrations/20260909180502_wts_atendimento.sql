-- Atendimento no WhatsApp vindo da WTS Chat.
--
-- A conta da WTS é de UMA clínica onde Dra. Juliana e Dra. Mariela atendem
-- juntas: mesma recepção, mesma equipe, mesma social media. Por isso os dados
-- ficam num cliente só, e NÃO há tentativa de dividir o volume entre as duas.
-- Essa divisão foi testada e não existe no dado: 62% das conversas caem no
-- departamento "Geral", a tag do contato contradiz o departamento em metade
-- dos casos, os dois números de WhatsApp carregam as duas, e só 2 dos 13
-- agentes são exclusivos de uma médica. Rateio aqui seria número inventado.
--
-- Guardamos a sessão crua em vez de agregado diário: são ~37 mil linhas (nada),
-- e assim qualquer recorte novo (departamento, agente, faixa de horário) sai de
-- consulta em vez de exigir novo sync e novo backfill.

alter table public.clients add column if not exists wts_company_id text;

create table if not exists public.wts_departments (
  client_id uuid not null references public.clients(id) on delete cascade,
  department_id text not null,
  name text not null,
  updated_at timestamptz not null default now(),
  primary key (client_id, department_id)
);

-- O agente tem id próprio E um userId; a sessão referencia o userId, não o id.
-- Guardamos o userId como chave para o join com wts_sessions funcionar direto.
create table if not exists public.wts_agents (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id text not null,
  name text not null,
  email text,
  profile text,
  updated_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create table if not exists public.wts_sessions (
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text,
  department_id text,
  user_id text,
  channel_id text,
  contact_id text,
  -- Vêm da API como "00:40:45"; convertidos para segundos no sync porque
  -- texto não agrega.
  wait_seconds integer,
  service_seconds integer,
  first_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, session_id)
);

create index if not exists wts_sessions_cliente_data on public.wts_sessions (client_id, started_at desc);
create index if not exists wts_sessions_departamento on public.wts_sessions (client_id, department_id);

-- A API da WTS não tem filtro de data que funcione (aceita e ignora em
-- silêncio). O sync pagina do mais novo para o mais velho e para quando passa
-- desta marca — por isso ela é um timestamp, não uma data.
create table if not exists public.wts_sync_state (
  client_id uuid primary key references public.clients(id) on delete cascade,
  last_session_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wts_departments enable row level security;
alter table public.wts_agents enable row level security;
alter table public.wts_sessions enable row level security;
alter table public.wts_sync_state enable row level security;

drop policy if exists "read own or admin reads all wts departments" on public.wts_departments;
create policy "read own or admin reads all wts departments" on public.wts_departments
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "read own or admin reads all wts agents" on public.wts_agents;
create policy "read own or admin reads all wts agents" on public.wts_agents
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "read own or admin reads all wts sessions" on public.wts_sessions;
create policy "read own or admin reads all wts sessions" on public.wts_sessions
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
