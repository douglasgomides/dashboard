-- Agentic Core · motor de execução (docs/sap/arquitetura-hub-sap.md, seção 3).
-- Execuções com estado persistente, passos registrados (com chave de idempotência), aprovações humanas e custo de IA.
-- Quem roda os passos é o servidor (api/sync/manual.ts, alvo "agentes", com a chave de serviço); a Central de Agentes
-- (admin) inicia, aprova, rejeita, pede correção, pausa, retoma e cancela pelas funções abaixo. Leitura só de admin.
-- Reversão: drop das funções agentes_* e das tabelas aprovacoes, agente_passos, agente_execucoes, ia_execucoes.

create table if not exists public.agente_execucoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  agente text not null,
  fluxo text not null,
  objetivo text not null,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'rodando', 'aguardando', 'aguardando_aprovacao', 'pausada', 'concluida', 'falhou', 'cancelada')),
  estado_antes_pausa text,
  passo_atual integer not null default 0,
  contexto jsonb not null default '{}',
  proximo_em timestamptz,
  lease_ate timestamptz,
  tentativas integer not null default 0,
  custo_usd numeric not null default 0,
  teto_custo_usd numeric not null default 0.5,
  resultado jsonb,
  erro text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  encerrado_em timestamptz
);
-- Um fluxo ativo por clínica: iniciar de novo devolve a execução que já existe (não duplica).
create unique index if not exists agente_execucoes_um_ativo on public.agente_execucoes (client_id, fluxo)
  where estado not in ('concluida', 'falhou', 'cancelada');
create index if not exists agente_execucoes_fila on public.agente_execucoes (estado, proximo_em);

create table if not exists public.agente_passos (
  id bigserial primary key,
  execucao_id uuid not null references public.agente_execucoes(id) on delete cascade,
  ordem integer not null,
  nome text not null,
  ferramenta text,
  risco text check (risco in ('baixo', 'medio', 'alto')),
  entrada jsonb,
  saida jsonb,
  ok boolean,
  erro text,
  chave_idempotencia text unique,
  custo_usd numeric not null default 0,
  ms integer,
  criado_em timestamptz not null default now()
);
create index if not exists agente_passos_exec on public.agente_passos (execucao_id, id);

create table if not exists public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.agente_execucoes(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  passo text not null,
  risco text not null check (risco in ('medio', 'alto')),
  resumo text not null,
  proposta jsonb not null default '{}',
  evidencias jsonb not null default '[]',
  estado text not null default 'pendente' check (estado in ('pendente', 'aprovada', 'rejeitada', 'correcao')),
  comentario text,
  decidido_por uuid,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists aprovacoes_uma_pendente on public.aprovacoes (execucao_id, passo) where estado = 'pendente';

create table if not exists public.ia_execucoes (
  id bigserial primary key,
  client_id uuid references public.clients(id) on delete set null,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  finalidade text not null,
  modelo text,
  tokens_entrada integer,
  tokens_saida integer,
  custo_usd numeric,
  ok boolean not null,
  erro text,
  ms integer,
  criado_em timestamptz not null default now()
);
create index if not exists ia_execucoes_cliente on public.ia_execucoes (client_id, criado_em);

alter table public.agente_execucoes enable row level security;
alter table public.agente_passos enable row level security;
alter table public.aprovacoes enable row level security;
alter table public.ia_execucoes enable row level security;
create policy "admin le execucoes" on public.agente_execucoes for select to authenticated using (public.is_app_admin());
create policy "admin le passos" on public.agente_passos for select to authenticated using (public.is_app_admin());
create policy "admin le aprovacoes" on public.aprovacoes for select to authenticated using (public.is_app_admin());
create policy "admin le ia" on public.ia_execucoes for select to authenticated using (public.is_app_admin());
grant select on public.agente_execucoes, public.agente_passos, public.aprovacoes, public.ia_execucoes to authenticated;

-- Central: iniciar um fluxo (devolve o ativo, se já houver).
create or replace function public.agentes_iniciar(p_client_id uuid, p_agente text, p_fluxo text, p_objetivo text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select id into v_id from agente_execucoes where client_id = p_client_id and fluxo = p_fluxo
    and estado not in ('concluida', 'falhou', 'cancelada');
  if v_id is not null then return v_id; end if;
  insert into agente_execucoes (client_id, agente, fluxo, objetivo) values (p_client_id, p_agente, p_fluxo, p_objetivo)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Central: decidir uma aprovação. Aprovada → a execução volta para a fila; correção → volta com o comentário;
-- rejeitada → a execução é cancelada (nada é executado).
create or replace function public.agentes_decidir(p_aprovacao uuid, p_decisao text, p_comentario text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_exec uuid; v_com text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_decisao not in ('aprovada', 'rejeitada', 'correcao') then raise exception 'decisao invalida'; end if;
  if p_decisao in ('rejeitada', 'correcao') and v_com is null then raise exception 'comentario obrigatorio'; end if;
  update aprovacoes set estado = p_decisao, comentario = v_com, decidido_por = auth.uid(), decidido_em = now()
  where id = p_aprovacao and estado = 'pendente' returning execucao_id into v_exec;
  if v_exec is null then raise exception 'aprovacao nao esta pendente'; end if;
  if p_decisao = 'rejeitada' then
    update agente_execucoes set estado = 'cancelada', erro = 'rejeitado: ' || v_com, encerrado_em = now(), atualizado_em = now()
    where id = v_exec;
  else
    update agente_execucoes set estado = 'pendente', proximo_em = null, atualizado_em = now(),
      contexto = case when p_decisao = 'correcao' then contexto || jsonb_build_object('correcao', v_com) else contexto end
    where id = v_exec and estado = 'aguardando_aprovacao';
  end if;
end;
$function$;

-- Central: pausar, retomar, cancelar.
create or replace function public.agentes_controlar(p_execucao uuid, p_acao text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_acao = 'pausar' then
    update agente_execucoes set estado_antes_pausa = estado, estado = 'pausada', atualizado_em = now()
    where id = p_execucao and estado in ('pendente', 'aguardando', 'aguardando_aprovacao', 'rodando');
  elsif p_acao = 'retomar' then
    update agente_execucoes set estado = coalesce(estado_antes_pausa, 'pendente'), estado_antes_pausa = null, lease_ate = null, atualizado_em = now()
    where id = p_execucao and estado = 'pausada';
  elsif p_acao = 'cancelar' then
    update agente_execucoes set estado = 'cancelada', encerrado_em = now(), atualizado_em = now()
    where id = p_execucao and estado not in ('concluida', 'falhou', 'cancelada');
    update aprovacoes set estado = 'rejeitada', comentario = 'execucao cancelada', decidido_por = auth.uid(), decidido_em = now()
    where execucao_id = p_execucao and estado = 'pendente';
  else
    raise exception 'acao invalida';
  end if;
end;
$function$;

-- Servidor: reserva a próxima execução pronta (ou a indicada) com prazo de posse. Se o servidor cair no meio, o prazo
-- vence e outra chamada retoma do passo salvo. Só a chave de serviço chama.
create or replace function public.agentes_reservar(p_execucao uuid, p_lease_segundos integer)
returns setof public.agente_execucoes
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  select id into v_id from agente_execucoes
  where (p_execucao is null or id = p_execucao)
    and (estado = 'pendente'
      or (estado = 'aguardando' and proximo_em <= now())
      or (estado = 'rodando' and lease_ate < now()))
  order by atualizado_em
  for update skip locked
  limit 1;
  if v_id is null then return; end if;
  return query update agente_execucoes set estado = 'rodando', lease_ate = now() + make_interval(secs => p_lease_segundos),
    tentativas = tentativas + 1, atualizado_em = now()
  where id = v_id returning *;
end;
$function$;

-- Servidor: marca um item do cronograma em nome de quem aprovou, reaproveitando sap_marcar_tarefa (que exige
-- evidência e grava o histórico). Confere que quem aprovou é admin e que a aprovação existe.
create or replace function public.agentes_marcar_marco(p_aprovacao uuid, p_clinica_id uuid, p_marco integer, p_evidencia text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_aprovador uuid;
begin
  select decidido_por into v_aprovador from aprovacoes where id = p_aprovacao and estado = 'aprovada';
  if v_aprovador is null then raise exception 'sem aprovacao valida'; end if;
  if not exists (select 1 from app_admins where user_id = v_aprovador) then raise exception 'aprovador nao e admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_aprovador, 'role', 'authenticated')::text, true);
  perform public.sap_marcar_tarefa(p_clinica_id, p_marco, 'feito', null, p_evidencia, null, null);
end;
$function$;

revoke all on function public.agentes_iniciar(uuid, text, text, text) from public, anon;
revoke all on function public.agentes_decidir(uuid, text, text) from public, anon;
revoke all on function public.agentes_controlar(uuid, text) from public, anon;
revoke all on function public.agentes_reservar(uuid, integer) from public, anon, authenticated;
revoke all on function public.agentes_marcar_marco(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.agentes_iniciar(uuid, text, text, text) to authenticated;
grant execute on function public.agentes_decidir(uuid, text, text) to authenticated;
grant execute on function public.agentes_controlar(uuid, text) to authenticated;
grant execute on function public.agentes_reservar(uuid, integer) to service_role;
grant execute on function public.agentes_marcar_marco(uuid, uuid, integer, text) to service_role;
