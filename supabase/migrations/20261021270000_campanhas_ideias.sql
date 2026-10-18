-- Estrategista de Campanhas: estratégias, pacotes e abordagens propostas pelo agente "growth" (fluxo
-- campanhas_estrategia) cruzando o Brand Brain com os dados da clínica. Quem grava é o servidor (service role) depois de
-- validar CFM e dado pessoal (src/lib/campanhas-ia.ts). Admin e membro leem; admin, owner e strategist mudam o estado
-- (campanha_ideia_decidir). Nada é enviado, publicado ou anunciado: a equipe executa e registra o resultado.
-- Reversão: drop function campanha_ideia_decidir; drop table campanhas_ideias.

create table if not exists public.campanhas_ideias (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  tipo text not null check (tipo in ('pacote', 'captacao', 'anuncio', 'conteudo', 'reativacao', 'retorno', 'atendimento', 'parceria', 'evento')),
  titulo text not null check (length(titulo) between 8 and 140),
  publico text not null,
  oferta text,
  canal text not null,
  mensagem text,
  porque text not null,
  evidencias jsonb not null default '[]',
  brain jsonb not null default '[]',
  passos jsonb not null default '[]',
  metrica text not null,
  esforco text not null default 'medio' check (esforco in ('baixo', 'medio', 'alto')),
  prazo_dias integer not null default 30 check (prazo_dias between 3 and 90),
  estado text not null default 'proposta' check (estado in ('proposta', 'aprovada', 'em_andamento', 'concluida', 'descartada')),
  resultado text,
  decidido_por uuid,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists campanhas_ideias_cliente on public.campanhas_ideias (client_id, criado_em desc);
alter table public.campanhas_ideias enable row level security;
create policy "campanhas_ideias: membro ou admin le" on public.campanhas_ideias for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.campanhas_ideias from anon;
revoke insert, update, delete on public.campanhas_ideias from authenticated;

create or replace function public.campanha_ideia_decidir(p_id uuid, p_estado text, p_resultado text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_client uuid;
begin
  select client_id into v_client from campanhas_ideias where id = p_id;
  if v_client is null or not public.pode_editar_acoes(v_client) then raise exception 'sem permissao'; end if;
  if p_estado not in ('proposta', 'aprovada', 'em_andamento', 'concluida', 'descartada') then raise exception 'estado invalido'; end if;
  update campanhas_ideias
  set estado = p_estado,
      resultado = coalesce(nullif(btrim(left(coalesce(p_resultado, ''), 1000)), ''), resultado),
      decidido_por = auth.uid(), decidido_em = now()
  where id = p_id;
end;
$function$;
revoke all on function public.campanha_ideia_decidir(uuid, text, text) from public, anon;
grant execute on function public.campanha_ideia_decidir(uuid, text, text) to authenticated;
