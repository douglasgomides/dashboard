-- Revisões e envios são internos da equipe. Sem carga de dados de clientes.
create table public.acompanhamento_revisoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  data date not null,
  titulo text not null check (length(titulo) between 1 and 200),
  prioridade text not null check (prioridade in ('Alta','Média','Baixa')),
  proxima_checagem date,
  versao integer not null default 0 check (versao >= 0),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 300000),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index acompanhamento_cliente_data on public.acompanhamento_revisoes(client_id,data desc);
alter table public.acompanhamento_revisoes enable row level security;
create policy acompanhamento_leitura_admin on public.acompanhamento_revisoes for select to authenticated using (public.is_app_admin());
revoke all on public.acompanhamento_revisoes from public,anon,authenticated;
grant select on public.acompanhamento_revisoes to authenticated;
grant all on public.acompanhamento_revisoes to service_role;

create table public.acompanhamento_envios (
  revisao_id uuid not null references public.acompanhamento_revisoes(id),
  acao_id uuid not null,
  lista_id text not null check(lista_id ~ '^[0-9]{1,30}$'),
  estado text not null check(estado in ('enviando','criada','incerta')),
  tarefa_url text check (tarefa_url is null or tarefa_url ~ '^https://app\.clickup\.com/t/[A-Za-z0-9_-]+$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key(revisao_id,acao_id)
);
alter table public.acompanhamento_envios enable row level security;
create policy acompanhamento_envios_leitura_admin on public.acompanhamento_envios for select to authenticated using(public.is_app_admin());
revoke all on public.acompanhamento_envios from public,anon,authenticated;
grant select on public.acompanhamento_envios to authenticated;
grant all on public.acompanhamento_envios to service_role;
