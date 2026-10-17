-- Brand Brain (docs/sap/arquitetura-hub-sap.md, seção 5): a memória de marca de cada clínica, no Hub, lida pelo SAP e
-- pelos agentes. Cinco memórias (identidade, audiência, comercial, criativa, decisão). Cada item é uma frase curta com
-- chave, fonte e confiança. O agente só PROPÕE; uma pessoa aprova, corrige ou rejeita. Toda versão fica guardada
-- (substituído) e pode ser restaurada. Só funciona para clínica com o módulo brand_brain (cliente_modulos).
-- Nunca entra: nome, telefone, e-mail ou CPF de paciente, nem dado clínico individual (conferido aqui e no servidor).
-- Reversão: drop function brain_propor, brain_decidir, brain_restaurar, brain_manual, brain_texto_ok; drop table brain_itens;
-- delete from cliente_modulos where modulo = 'brand_brain';

create table if not exists public.brain_itens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  memoria text not null check (memoria in ('identidade', 'audiencia', 'comercial', 'criativa', 'decisao')),
  chave text not null check (chave ~ '^[a-z0-9_]{3,60}$'),
  valor text not null check (length(btrim(valor)) between 3 and 600),
  fonte text not null check (length(fonte) between 2 and 60),
  fonte_detalhe text,
  confianca text not null default 'media' check (confianca in ('baixa', 'media', 'alta')),
  estado text not null default 'proposto' check (estado in ('proposto', 'aprovado', 'rejeitado', 'substituido')),
  origem text not null default 'agente' check (origem in ('agente', 'manual', 'restaurado')),
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  comentario text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz
);
create unique index if not exists brain_um_aprovado on public.brain_itens (client_id, memoria, chave) where estado = 'aprovado';
create unique index if not exists brain_proposta_unica on public.brain_itens (client_id, memoria, chave, md5(valor)) where estado = 'proposto';
create index if not exists brain_itens_cliente on public.brain_itens (client_id, estado);
alter table public.brain_itens enable row level security;
create policy "admin le brain" on public.brain_itens for select to authenticated using (public.is_app_admin());
grant select on public.brain_itens to authenticated;
grant select, insert, update on public.brain_itens to service_role;

-- Texto sem dado pessoal: telefone, e-mail, CPF.
create or replace function public.brain_texto_ok(p text)
returns boolean language sql immutable set search_path to 'public' as $$
  select p !~ '[^\s@]+@[^\s@]+\.[a-zA-Z]'
     and p !~ '\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}'
     and p !~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}';
$$;

-- Propostas do agente (service_role) ou da equipe. Ignora o que já é o valor aprovado ou já está proposto.
create or replace function public.brain_propor(p_client_id uuid, p_itens jsonb, p_execucao uuid default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; v_valor text;
begin
  if not (public.is_app_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then raise exception 'sem permissao'; end if;
  if not public.tem_modulo(p_client_id, 'brand_brain') then raise exception 'brand brain nao ativo para esta clinica'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_valor := btrim(coalesce(r->>'valor', ''));
    if not public.brain_texto_ok(v_valor) then raise exception 'dado pessoal no item %', r->>'chave'; end if;
    if exists (select 1 from brain_itens where client_id = p_client_id and memoria = r->>'memoria' and chave = r->>'chave' and estado = 'aprovado' and valor = v_valor) then continue; end if;
    insert into brain_itens (client_id, memoria, chave, valor, fonte, fonte_detalhe, confianca, execucao_id)
    values (p_client_id, r->>'memoria', r->>'chave', v_valor, coalesce(r->>'fonte', 'agente'), r->>'fonte_detalhe', coalesce(r->>'confianca', 'media'), p_execucao)
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Aprovar, corrigir (aprova com o texto editado) ou rejeitar (exige motivo).
create or replace function public.brain_decidir(p_id uuid, p_acao text, p_valor text default null, p_comentario text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v brain_itens;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select * into v from brain_itens where id = p_id for update;
  if not found or v.estado <> 'proposto' then raise exception 'proposta nao encontrada ou ja decidida'; end if;
  if p_acao = 'rejeitar' then
    if coalesce(btrim(p_comentario), '') = '' then raise exception 'motivo obrigatorio'; end if;
    update brain_itens set estado = 'rejeitado', comentario = p_comentario, decidido_por = auth.uid(), decidido_em = now() where id = p_id;
    return;
  end if;
  if p_acao not in ('aprovar', 'corrigir') then raise exception 'acao invalida'; end if;
  if p_acao = 'corrigir' then
    if coalesce(btrim(p_valor), '') = '' then raise exception 'texto obrigatorio'; end if;
    if not public.brain_texto_ok(p_valor) then raise exception 'dado pessoal no texto'; end if;
  end if;
  update brain_itens set estado = 'substituido' where client_id = v.client_id and memoria = v.memoria and chave = v.chave and estado = 'aprovado';
  update brain_itens set estado = 'aprovado', valor = case when p_acao = 'corrigir' then btrim(p_valor) else valor end,
    comentario = case when p_acao = 'corrigir' then coalesce(nullif(btrim(p_comentario), ''), 'corrigido pela equipe') else p_comentario end,
    decidido_por = auth.uid(), decidido_em = now()
  where id = p_id;
end $$;

-- Restaurar uma versão antiga: vira a aprovada (nova linha, origem restaurado) e a atual vai para o histórico.
create or replace function public.brain_restaurar(p_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v brain_itens; v_novo uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select * into v from brain_itens where id = p_id;
  if not found or v.estado <> 'substituido' then raise exception 'so versoes antigas podem ser restauradas'; end if;
  update brain_itens set estado = 'substituido' where client_id = v.client_id and memoria = v.memoria and chave = v.chave and estado = 'aprovado';
  insert into brain_itens (client_id, memoria, chave, valor, fonte, fonte_detalhe, confianca, estado, origem, comentario, decidido_por, decidido_em)
  values (v.client_id, v.memoria, v.chave, v.valor, v.fonte, v.fonte_detalhe, v.confianca, 'aprovado', 'restaurado', 'restaurado da versão de ' || to_char(v.criado_em, 'DD/MM/YYYY'), auth.uid(), now())
  returning id into v_novo;
  return v_novo;
end $$;

-- A equipe escreve direto (já aprovado, fonte "equipe").
create or replace function public.brain_manual(p_client_id uuid, p_memoria text, p_chave text, p_valor text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if not public.tem_modulo(p_client_id, 'brand_brain') then raise exception 'brand brain nao ativo para esta clinica'; end if;
  if not public.brain_texto_ok(coalesce(p_valor, '')) then raise exception 'dado pessoal no texto'; end if;
  update brain_itens set estado = 'substituido' where client_id = p_client_id and memoria = p_memoria and chave = p_chave and estado = 'aprovado';
  insert into brain_itens (client_id, memoria, chave, valor, fonte, confianca, estado, origem, decidido_por, decidido_em)
  values (p_client_id, p_memoria, p_chave, btrim(p_valor), 'equipe', 'alta', 'aprovado', 'manual', auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.brain_propor(uuid, jsonb, uuid) from public, anon;
revoke all on function public.brain_decidir(uuid, text, text, text) from public, anon;
revoke all on function public.brain_restaurar(uuid) from public, anon;
revoke all on function public.brain_manual(uuid, text, text, text) from public, anon;
grant execute on function public.brain_propor(uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.brain_decidir(uuid, text, text, text) to authenticated;
grant execute on function public.brain_restaurar(uuid) to authenticated;
grant execute on function public.brain_manual(uuid, text, text, text) to authenticated;

-- Beta só na clínica de teste (dados fictícios). Clientes reais continuam sem o módulo até você decidir.
insert into public.cliente_modulos (client_id, modulo, status, origem)
values ('6e2efb0e-c817-49f3-b559-48cd66c1e80b', 'brand_brain', 'beta', 'teste')
on conflict (client_id, modulo) do nothing;
