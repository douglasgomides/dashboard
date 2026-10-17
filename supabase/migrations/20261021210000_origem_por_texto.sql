-- Origem do paciente pelo texto da 1ª mensagem. O WTS não repassa o "referral" do anúncio (conversas_origem_anuncio
-- ficou vazia), mas links de bio, botões e anúncios usam mensagem pré-preenchida ("Olá! Eu estava no Instagram do
-- Dr. Sergio e gostaria de agendar..."). A equipe cadastra o começo desse texto e a origem; a conversa que começa assim
-- ganha essa origem. Sem texto cadastrado vale a origem que a IA leu na conversa (resumo.origem).
-- conversao_por_origem: conversas, agendaram e % por origem no período. textos_entrada_frequentes: começos de 1ª
-- mensagem que se repetem e ainda não têm origem, para a equipe classificar. Agregado: nenhum dado de paciente.
-- Reversão: drop function conversao_por_origem, textos_entrada_frequentes, origem_texto_salvar; drop table origens_texto.

create table if not exists public.origens_texto (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  padrao text not null check (length(btrim(padrao)) between 8 and 120),
  origem text not null check (origem in ('anuncio', 'link_bio', 'instagram', 'google', 'site', 'indicacao', 'outro')),
  rotulo text check (rotulo is null or length(rotulo) <= 80),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (client_id, padrao)
);
alter table public.origens_texto enable row level security;
create policy "origens texto: admin ou membro le" on public.origens_texto for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.origens_texto from anon;

create or replace function public.origem_texto_salvar(p_client uuid, p_padrao text, p_origem text, p_rotulo text default null, p_apagar boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_apagar then delete from origens_texto where client_id = p_client and padrao = lower(btrim(p_padrao)); return; end if;
  insert into origens_texto (client_id, padrao, origem, rotulo) values (p_client, lower(btrim(p_padrao)), p_origem, nullif(btrim(coalesce(p_rotulo, '')), ''))
  on conflict (client_id, padrao) do update set origem = excluded.origem, rotulo = excluded.rotulo;
end $function$;

create or replace function public.conversao_por_origem(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with conv as (
    select c.id from conversas c
    where c.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  primeira as (
    select distinct on (m.conversa_id) m.conversa_id, lower(regexp_replace(coalesce(m.texto, ''), '\s+', ' ', 'g')) t
    from mensagens m join conv on conv.id = m.conversa_id
    where m.direcao = 'entrada' and coalesce(m.texto, '') !~* '^\s*\*aten[cç][aã]o:\*'
    order by m.conversa_id, m.enviada_em, m.id
  ),
  base as (
    select conv.id, r.resumo j,
      (select o.origem from origens_texto o where o.client_id = p_client and starts_with(p.t, o.padrao) order by length(o.padrao) desc limit 1) as por_texto
    from conv
    join conversas_resumos r on r.conversa_id = conv.id
    left join primeira p on p.conversa_id = conv.id
    where coalesce(r.resumo->>'etapa', '') <> 'nao_e_paciente' and coalesce((r.resumo->>'comercial')::boolean, true)
  ),
  o as (
    select coalesce(por_texto, nullif(nullif(j->>'origem', ''), 'null'), 'desconhecida') origem, por_texto is not null pelo_texto,
      (j->>'etapa' = 'agendou' or j->>'situacao' = 'agendou') agendou
    from base
  )
  select jsonb_build_object(
    'total', (select count(*) from o),
    'pelo_texto', (select count(*) from o where pelo_texto),
    'origens', coalesce((select jsonb_agg(x order by x.conversas desc) from (
      select origem, count(*) conversas, count(*) filter (where agendou) agendaram,
        round(100.0 * count(*) filter (where agendou) / count(*), 1) pct
      from o group by origem) x), '[]'::jsonb));
$function$;

create or replace function public.textos_entrada_frequentes(p_client uuid, p_dias integer default 60)
returns table (inicio text, conversas bigint) language sql stable security definer set search_path to 'public' as $function$
  with p as (
    select distinct on (m.conversa_id) m.conversa_id, lower(left(regexp_replace(coalesce(m.texto, ''), '\s+', ' ', 'g'), 60)) t
    from mensagens m join conversas c on c.id = m.conversa_id
    where c.client_id = p_client and public.is_app_admin()
      and m.direcao = 'entrada' and m.enviada_em > now() - make_interval(days => least(greatest(p_dias, 7), 180))
      and coalesce(m.texto, '') !~* '^\s*\*aten[cç][aã]o:\*'
    order by m.conversa_id, m.enviada_em, m.id
  )
  select t, count(*) from p
  where length(t) >= 25
    and not exists (select 1 from origens_texto o where o.client_id = p_client and starts_with(p.t, o.padrao))
  group by t having count(*) >= 3 order by count(*) desc limit 10;
$function$;

revoke all on function public.origem_texto_salvar(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.conversao_por_origem(uuid, date, date) from public, anon;
revoke all on function public.textos_entrada_frequentes(uuid, integer) from public, anon;
grant execute on function public.origem_texto_salvar(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.conversao_por_origem(uuid, date, date) to authenticated;
grant execute on function public.textos_entrada_frequentes(uuid, integer) to authenticated;
