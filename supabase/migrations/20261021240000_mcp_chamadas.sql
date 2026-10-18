-- Doctor Creator MCP (só leitura): registro de cada chamada de ferramenta feita por um assistente de IA (ChatGPT,
-- Claude...) conectado por OAuth. Escrita só pela Edge Function `mcp` (service role). A pessoa vê as próprias
-- chamadas; admin vê todas. Não guarda resposta nem dado de paciente: só ferramenta, clínica, resultado e tempo.
-- Reversão: drop table mcp_chamadas.

create table if not exists public.mcp_chamadas (
  id bigserial primary key,
  user_id uuid not null,
  oauth_client_id text,
  ferramenta text not null,
  client_id uuid,
  ok boolean not null,
  erro text,
  ms integer,
  em timestamptz not null default now()
);
create index if not exists mcp_chamadas_user_em on public.mcp_chamadas (user_id, em desc);
alter table public.mcp_chamadas enable row level security;
create policy "mcp: a pessoa ve as proprias chamadas, admin ve todas" on public.mcp_chamadas for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());
revoke all on public.mcp_chamadas from anon;
revoke insert, update, delete on public.mcp_chamadas from authenticated;
