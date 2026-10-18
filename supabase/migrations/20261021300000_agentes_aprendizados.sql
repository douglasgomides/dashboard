-- Camada de inteligência dos agentes (src/lib/aprendizado.ts, api/_lib/aprendizado.ts).
-- agentes_aprendizados: lições que o sistema tira sozinho do dado real de cada clínica (posts, conversas, anúncios e o
-- resultado das sugestões). Recalculadas todo dia; a que deixa de valer expira. A equipe pode vetar uma lição
-- (aprendizado_vetar): vetada, o agente para de usá-la e o recálculo não a reativa.
-- sugestoes_agentes / campanhas_ideias ganham nota e critica: a autocrítica de um segundo agente antes de chegar à equipe.
-- Reversão: drop function aprendizado_vetar; drop table agentes_aprendizados;
--   alter table sugestoes_agentes drop column nota, drop column critica; alter table campanhas_ideias drop column nota, drop column critica.

create table if not exists public.agentes_aprendizados (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  agente text not null check (agente in ('conteudo', 'recuperacao', 'anuncios', 'campanhas')),
  chave text not null,
  texto text not null,
  evidencia jsonb not null default '[]',
  n integer not null default 0,
  efeito numeric not null default 0,
  sinal text not null check (sinal in ('faz', 'evita')),
  confianca text not null check (confianca in ('alta', 'media')),
  origem text not null check (origem in ('posts', 'conversas', 'anuncios', 'resultados')),
  estado text not null default 'ativo' check (estado in ('ativo', 'expirado', 'vetado')),
  vetado_por uuid,
  vetado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (client_id, chave)
);
create index if not exists agentes_aprendizados_cliente on public.agentes_aprendizados (client_id, agente, estado);
alter table public.agentes_aprendizados enable row level security;
create policy "agentes_aprendizados: membro ou admin le" on public.agentes_aprendizados for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.agentes_aprendizados from anon;
revoke insert, update, delete on public.agentes_aprendizados from authenticated;

create or replace function public.aprendizado_vetar(p_id uuid, p_vetar boolean default true)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_client uuid;
begin
  select client_id into v_client from agentes_aprendizados where id = p_id;
  if v_client is null or not public.pode_editar_acoes(v_client) then raise exception 'sem permissao'; end if;
  update agentes_aprendizados
  set estado = case when p_vetar then 'vetado' else 'ativo' end,
      vetado_por = case when p_vetar then (select auth.uid()) else null end,
      vetado_em = case when p_vetar then now() else null end
  where id = p_id;
end;
$function$;
revoke all on function public.aprendizado_vetar(uuid, boolean) from public, anon;
grant execute on function public.aprendizado_vetar(uuid, boolean) to authenticated;

alter table public.sugestoes_agentes add column if not exists nota smallint, add column if not exists critica text;
alter table public.campanhas_ideias add column if not exists nota smallint, add column if not exists critica text;
