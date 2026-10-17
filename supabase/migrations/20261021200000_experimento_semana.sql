-- Experimento da semana: a falha comercial mais frequente da clínica vira UMA ação para a equipe testar por 7 dias,
-- e o resultado é medido com a mesma leitura por IA das conversas (% de conversas comerciais com aquela falha),
-- antes (14 dias anteriores) e durante (os 7 dias). É uma ação interna da equipe: nada é enviado a paciente.
-- Só admin começa, conclui ou descarta; admin e membros da clínica veem.
-- Reversão: drop function experimento_atual, experimento_iniciar, experimento_concluir, falha_pct; drop table experimentos_semana.

create table if not exists public.experimentos_semana (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  falha text not null check (falha ~ '^[a-z_]{3,40}$'),
  acao text not null check (length(btrim(acao)) between 5 and 400),
  inicio date not null,
  fim date not null,
  base_pct numeric, base_n integer, base_conversas integer,
  resultado_pct numeric, resultado_n integer, resultado_conversas integer,
  estado text not null default 'em_andamento' check (estado in ('em_andamento', 'concluido', 'descartado')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create unique index if not exists experimentos_semana_um_ativo on public.experimentos_semana (client_id) where estado = 'em_andamento';
alter table public.experimentos_semana enable row level security;
create policy "experimentos: admin ou membro le" on public.experimentos_semana for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.experimentos_semana from anon;

-- % das conversas comerciais lidas pela IA no período que tiveram a falha (mesmo recorte da auditoria comercial).
create or replace function public.falha_pct(p_client uuid, p_falha text, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with b as (
    select r.resumo j from conversas c join conversas_resumos r on r.conversa_id = c.id
    where c.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and coalesce(r.resumo->>'etapa', '') <> 'nao_e_paciente'
      and coalesce((r.resumo->>'comercial')::boolean, true)
  )
  select jsonb_build_object(
    'conversas', (select count(*) from b),
    'n', (select count(*) from b where coalesce(j->'falhas', '[]') ? p_falha),
    'pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where coalesce(j->'falhas', '[]') ? p_falha) / count(*), 1) end from b));
$function$;

-- Experimento em andamento (com a medição até hoje), o último concluído (30 dias) e, se não há nenhum em andamento,
-- a sugestão: a falha mais frequente dos últimos 14 dias (mínimo 10 conversas comerciais lidas).
create or replace function public.experimento_atual(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_atual experimentos_semana; v_ult experimentos_semana; v_sug jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then return null; end if;
  select * into v_atual from experimentos_semana where client_id = p_client and estado = 'em_andamento' limit 1;
  select * into v_ult from experimentos_semana where client_id = p_client and estado = 'concluido' and concluido_em > now() - interval '30 days' order by concluido_em desc limit 1;
  if v_atual.id is null then
    with b as (
      select r.resumo j from conversas c join conversas_resumos r on r.conversa_id = c.id
      where c.client_id = p_client and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between v_hoje - 14 and v_hoje
        and coalesce(r.resumo->>'etapa', '') <> 'nao_e_paciente' and coalesce((r.resumo->>'comercial')::boolean, true)
    ), tot as (select count(*) n from b),
    f as (select x as falha, count(*) n from b, jsonb_array_elements_text(coalesce(j->'falhas', '[]')) x group by x order by count(*) desc limit 3)
    select case when (select n from tot) >= 10 and exists (select 1 from f) then jsonb_build_object(
      'conversas', (select n from tot),
      'falhas', (select jsonb_agg(jsonb_build_object('falha', falha, 'n', n, 'pct', round(100.0 * n / (select n from tot), 1)) order by n desc) from f))
    end into v_sug;
  end if;
  return jsonb_build_object(
    'atual', case when v_atual.id is null then null else to_jsonb(v_atual) || jsonb_build_object(
      'agora', public.falha_pct(p_client, v_atual.falha, v_atual.inicio, least(v_atual.fim, v_hoje)),
      'pode_concluir', v_hoje >= v_atual.fim) end,
    'ultimo', case when v_ult.id is null then null else to_jsonb(v_ult) end,
    'sugestao', v_sug);
end $function$;

create or replace function public.experimento_iniciar(p_client uuid, p_falha text, p_acao text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_base jsonb; v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  v_base := public.falha_pct(p_client, p_falha, v_hoje - 14, v_hoje - 1);
  insert into experimentos_semana (client_id, falha, acao, inicio, fim, base_pct, base_n, base_conversas)
  values (p_client, p_falha, btrim(p_acao), v_hoje, v_hoje + 7, (v_base->>'pct')::numeric, (v_base->>'n')::int, (v_base->>'conversas')::int)
  returning id into v_id;
  return v_id;
end $function$;

-- Conclui (mede os 7 dias e grava) ou descarta. Concluir antes do fim é recusado: a medida ficaria curta.
create or replace function public.experimento_concluir(p_id uuid, p_descartar boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v experimentos_semana; v_res jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select * into v from experimentos_semana where id = p_id and estado = 'em_andamento';
  if v.id is null then raise exception 'experimento nao encontrado'; end if;
  if p_descartar then
    update experimentos_semana set estado = 'descartado', concluido_em = now() where id = p_id;
    return;
  end if;
  if v_hoje < v.fim then raise exception 'o experimento so termina em %', to_char(v.fim, 'DD/MM'); end if;
  v_res := public.falha_pct(v.client_id, v.falha, v.inicio, v.fim);
  update experimentos_semana set estado = 'concluido', concluido_em = now(),
    resultado_pct = (v_res->>'pct')::numeric, resultado_n = (v_res->>'n')::int, resultado_conversas = (v_res->>'conversas')::int
  where id = p_id;
end $function$;

revoke all on function public.falha_pct(uuid, text, date, date) from public, anon;
revoke all on function public.experimento_atual(uuid) from public, anon;
revoke all on function public.experimento_iniciar(uuid, text, text) from public, anon;
revoke all on function public.experimento_concluir(uuid, boolean) from public, anon;
grant execute on function public.falha_pct(uuid, text, date, date) to authenticated;
grant execute on function public.experimento_atual(uuid) to authenticated;
grant execute on function public.experimento_iniciar(uuid, text, text) to authenticated;
grant execute on function public.experimento_concluir(uuid, boolean) to authenticated;
