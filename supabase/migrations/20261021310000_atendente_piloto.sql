-- Atendente de IA, piloto (src/lib/atendente.ts, api/_lib/atendente.ts).
-- atendente_config: o modo por clínica. Hoje só "desligado" ou "sombra" (escreve a resposta, não envia nada). Envio real
-- exige confirmação técnica do envio pelo WhatsApp da clínica e nova autorização; aí entra um modo novo nesta lista.
-- atendente_rascunhos: o que o atendente teria respondido a cada mensagem de paciente, ao lado do que a secretária
-- respondeu e quanto demorou. Tem texto de conversa (dado de saúde): só admin lê; quem grava é o servidor.
-- Reversão: drop function atendente_definir_modo, atendente_avaliar; drop table atendente_rascunhos, atendente_config.

create table if not exists public.atendente_config (
  client_id uuid primary key references public.clients(id) on delete cascade,
  modo text not null default 'desligado' check (modo in ('desligado', 'sombra')),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);
alter table public.atendente_config enable row level security;
create policy "atendente_config: admin le" on public.atendente_config for select to authenticated using (public.is_app_admin());
revoke all on public.atendente_config from anon;
revoke insert, update, delete on public.atendente_config from authenticated;

create table if not exists public.atendente_rascunhos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  gatilho_mensagem_id uuid not null,
  gatilho_em timestamptz not null,
  gatilho_texto text not null,
  acao text not null check (acao in ('responder', 'passar_humano', 'descartado')),
  mensagem text,
  motivo text,
  risco text,
  fatos jsonb not null default '[]',
  faltou jsonb not null default '[]',
  erro text,
  modelo text,
  ms integer,
  resposta_humana text,
  resposta_humana_em timestamptz,
  tempo_humano_s integer,
  avaliacao text check (avaliacao in ('boa', 'ruim')),
  avaliacao_motivo text,
  avaliado_por uuid,
  criado_em timestamptz not null default now(),
  unique (conversa_id, gatilho_mensagem_id)
);
create index if not exists atendente_rascunhos_cliente on public.atendente_rascunhos (client_id, criado_em desc);
alter table public.atendente_rascunhos enable row level security;
create policy "atendente_rascunhos: admin le" on public.atendente_rascunhos for select to authenticated using (public.is_app_admin());
revoke all on public.atendente_rascunhos from anon;
revoke insert, update, delete on public.atendente_rascunhos from authenticated;

create or replace function public.atendente_definir_modo(p_client_id uuid, p_modo text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_modo not in ('desligado', 'sombra') then raise exception 'modo invalido'; end if;
  insert into atendente_config (client_id, modo, atualizado_por, atualizado_em) values (p_client_id, p_modo, (select auth.uid()), now())
  on conflict (client_id) do update set modo = excluded.modo, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;
revoke all on function public.atendente_definir_modo(uuid, text) from public, anon;
grant execute on function public.atendente_definir_modo(uuid, text) to authenticated;

-- A avaliação da equipe ("boa" ou "ruim", com motivo) volta para o prompt do atendente como exemplo.
create or replace function public.atendente_avaliar(p_id uuid, p_avaliacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_avaliacao is not null and p_avaliacao not in ('boa', 'ruim') then raise exception 'avaliacao invalida'; end if;
  update atendente_rascunhos set avaliacao = p_avaliacao, avaliacao_motivo = nullif(btrim(left(coalesce(p_motivo, ''), 300)), ''), avaliado_por = (select auth.uid())
  where id = p_id;
end;
$function$;
revoke all on function public.atendente_avaliar(uuid, text, text) from public, anon;
grant execute on function public.atendente_avaliar(uuid, text, text) to authenticated;
