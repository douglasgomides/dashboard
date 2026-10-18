-- Sistema agêntico: o que os agentes Recuperação de pacientes, Gestor de anúncios e Roteirista de conteúdo preparam
-- para a equipe (src/lib/agentes-catalogo.ts). Quem grava é o servidor (service role), depois de validar CFM e dado
-- pessoal. Membro e admin leem; admin, owner e strategist mudam o estado (sugestao_decidir).
-- O resultado é medido sozinho sempre que dá (sugestoes_medir): na recuperação, o sistema vê nas conversas se a clínica
-- mandou mensagem depois da sugestão, se o paciente respondeu e se agendou. Ninguém precisa marcar à mão.
-- Nada é enviado, publicado ou alterado em anúncio pelo agente.
-- Reversão: drop function sugestoes_medir, sugestao_decidir; drop table sugestoes_agentes.

create table if not exists public.sugestoes_agentes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  agente text not null check (agente in ('recuperacao', 'anuncios', 'conteudo')),
  tipo text not null,
  titulo text not null,
  detalhe text,
  evidencias jsonb not null default '[]',
  brain jsonb not null default '[]',
  conteudo jsonb not null default '{}',
  mensagem text,
  conversa_id uuid references public.conversas(id) on delete cascade,
  campanha_id text,
  prioridade integer not null default 0,
  estado text not null default 'proposta' check (estado in ('proposta', 'feita', 'descartada')),
  resultado text,
  medido_em timestamptz,
  decidido_por uuid,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists sugestoes_agentes_cliente on public.sugestoes_agentes (client_id, agente, criado_em desc);
create index if not exists sugestoes_agentes_conversa on public.sugestoes_agentes (conversa_id) where conversa_id is not null;
alter table public.sugestoes_agentes enable row level security;
create policy "sugestoes_agentes: membro ou admin le" on public.sugestoes_agentes for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.sugestoes_agentes from anon;
revoke insert, update, delete on public.sugestoes_agentes from authenticated;

create or replace function public.sugestao_decidir(p_id uuid, p_estado text, p_resultado text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_client uuid;
begin
  select client_id into v_client from sugestoes_agentes where id = p_id;
  if v_client is null or not public.pode_editar_acoes(v_client) then raise exception 'sem permissao'; end if;
  if p_estado not in ('proposta', 'feita', 'descartada') then raise exception 'estado invalido'; end if;
  update sugestoes_agentes
  set estado = p_estado,
      resultado = coalesce(nullif(btrim(left(coalesce(p_resultado, ''), 500)), ''), resultado),
      decidido_por = auth.uid(), decidido_em = now()
  where id = p_id;
end;
$function$;
revoke all on function public.sugestao_decidir(uuid, text, text) from public, anon;
grant execute on function public.sugestao_decidir(uuid, text, text) to authenticated;

-- Medição automática da recuperação (últimos 30 dias). Ordem do resultado: agendou > respondeu > enviada.
--  - enviada: a clínica mandou mensagem humana na conversa depois da sugestão (robô não conta) → estado vira "feita";
--  - respondeu: o paciente escreveu depois dessa mensagem da clínica;
--  - agendou: a leitura da IA mais nova da conversa diz agendou, ou o lead ligado foi ganho no CRM depois da sugestão.
-- Só service role ou admin. Devolve quantas sugestões mudaram.
create or replace function public.sugestoes_medir()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_app_admin() then raise exception 'sem permissao'; end if;
  with alvo as (
    select s.id, s.conversa_id, s.criado_em, s.resultado
    from sugestoes_agentes s
    where s.agente = 'recuperacao' and s.estado <> 'descartada' and s.criado_em > now() - interval '30 days'
      and coalesce(s.resultado, '') <> 'agendou'
  ),
  med as (
    select a.id,
      (select min(m.enviada_em) from mensagens m where m.conversa_id = a.conversa_id and m.direcao = 'saida'
         and m.enviada_em > a.criado_em and coalesce(m.tipo, '') <> 'kommo_robo') as enviada_em,
      exists (select 1 from conversas_resumos r where r.conversa_id = a.conversa_id and r.gerado_em > a.criado_em
                and (r.resumo->>'etapa' = 'agendou' or r.resumo->>'situacao' = 'agendou'))
      or exists (select 1 from conversas c join crm_leads l on l.id = c.lead_id where c.id = a.conversa_id
                and l.outcome = 'won' and coalesce(l.occurred_at, l.received_at) > a.criado_em) as agendou
    from alvo a
  ),
  res as (
    select m.id,
      case when m.agendou then 'agendou'
        when m.enviada_em is not null and exists (select 1 from mensagens e join alvo a on a.id = m.id
          where e.conversa_id = a.conversa_id and e.direcao = 'entrada' and e.enviada_em > m.enviada_em) then 'respondeu'
        when m.enviada_em is not null then 'enviada'
        else null end as resultado
    from med m
  )
  update sugestoes_agentes s
  set resultado = r.resultado, medido_em = now(),
      estado = case when s.estado = 'proposta' then 'feita' else s.estado end
  from res r
  where s.id = r.id and r.resultado is not null and r.resultado is distinct from s.resultado;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.sugestoes_medir() from public, anon, authenticated;
grant execute on function public.sugestoes_medir() to service_role;
