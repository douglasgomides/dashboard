-- SAP · Banco de anúncios: peças de cada clínica (a partir dos modelos BA-01 a BA-15, em src/lib/sap-anuncios.ts),
-- com etapa C1/C2/C3, semáforo e ciente do médico, status até "no ar" e a campanha da Meta para puxar números.
-- Escrita só pela equipe; leitura pela regra do SAP. Regra no servidor: vermelho nunca aprova; amarelo só com ciente.

create table if not exists public.sap_pecas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  modelo text,
  titulo text not null,
  etapa text not null check (etapa in ('C1', 'C2', 'C3')),
  formato text not null check (formato in ('imagem', 'carrossel', 'reels', 'bastidor', 'depoimento')),
  rosto boolean not null default false,
  ganchos text[] not null default '{}',
  semaforo text not null default 'verde' check (semaforo in ('verde', 'amarelo', 'vermelho')),
  ciente_em date,
  status text not null default 'ideia' check (status in ('ideia', 'producao', 'aprovado', 'no_ar', 'pausado', 'arquivado')),
  arquivo_url text,
  campaign_id text,
  reprovacao_meta text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists sap_pecas_clinica on public.sap_pecas (clinica_id);
alter table public.sap_pecas enable row level security;
create policy "sap ler pecas" on public.sap_pecas for select to authenticated using (public.sap_pode_ler(clinica_id));
grant select on public.sap_pecas to authenticated;

create or replace function public.sap_salvar_peca(p_clinica_id uuid, p_id uuid, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid := p_id; v_sem text := coalesce(p_dados->>'semaforo', 'verde'); v_st text := coalesce(p_dados->>'status', 'ideia');
  v_ciente date := nullif(p_dados->>'ciente_em', '')::date;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if v_st in ('aprovado', 'no_ar') and (v_sem = 'vermelho' or (v_sem = 'amarelo' and v_ciente is null)) then
    raise exception 'semaforo bloqueia aprovacao';
  end if;
  if v_id is null then
    insert into sap_pecas (clinica_id, modelo, titulo, etapa, formato, rosto, ganchos, semaforo, ciente_em, status, arquivo_url, campaign_id, reprovacao_meta)
    values (p_clinica_id, nullif(p_dados->>'modelo', ''), coalesce(nullif(btrim(p_dados->>'titulo'), ''), 'Peça sem título'), p_dados->>'etapa', p_dados->>'formato',
      coalesce((p_dados->>'rosto')::boolean, false), coalesce(array(select jsonb_array_elements_text(p_dados->'ganchos')), '{}'), v_sem, v_ciente, v_st,
      nullif(btrim(p_dados->>'arquivo_url'), ''), nullif(btrim(p_dados->>'campaign_id'), ''), nullif(btrim(p_dados->>'reprovacao_meta'), ''))
    returning id into v_id;
  else
    update sap_pecas set modelo = nullif(p_dados->>'modelo', ''), titulo = coalesce(nullif(btrim(p_dados->>'titulo'), ''), titulo), etapa = p_dados->>'etapa',
      formato = p_dados->>'formato', rosto = coalesce((p_dados->>'rosto')::boolean, rosto), ganchos = coalesce(array(select jsonb_array_elements_text(p_dados->'ganchos')), ganchos),
      semaforo = v_sem, ciente_em = v_ciente, status = v_st, arquivo_url = nullif(btrim(p_dados->>'arquivo_url'), ''), campaign_id = nullif(btrim(p_dados->>'campaign_id'), ''),
      reprovacao_meta = nullif(btrim(p_dados->>'reprovacao_meta'), ''), atualizado_em = now()
    where id = v_id and clinica_id = p_clinica_id;
  end if;
  return v_id;
end;
$function$;

-- Campanhas da Meta do cliente com os números de cada uma (total, últimos 7 dias e os 7 anteriores), para ligar à peça.
create or replace function public.sap_campanhas_numeros(p_client_id uuid)
returns table(campaign_id text, nome text, objetivo text, gasto numeric, conversas numeric, cliques numeric, impressoes numeric, dias integer,
  ultimos7_gasto numeric, ultimos7_conversas numeric, anteriores7_gasto numeric, anteriores7_conversas numeric, ultimo_dia date)
language sql stable security definer set search_path to 'public'
as $function$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d)
  select d.campaign_id, max(c.name), max(c.objective),
    coalesce(sum(d.spend), 0), coalesce(sum(d.conversations), 0), coalesce(sum(d.link_clicks), 0), coalesce(sum(d.impressions), 0),
    count(distinct d.date) filter (where d.spend > 0)::integer,
    coalesce(sum(d.spend) filter (where d.date > (select d from hoje) - 7), 0), coalesce(sum(d.conversations) filter (where d.date > (select d from hoje) - 7), 0),
    coalesce(sum(d.spend) filter (where d.date <= (select d from hoje) - 7 and d.date > (select d from hoje) - 14), 0),
    coalesce(sum(d.conversations) filter (where d.date <= (select d from hoje) - 7 and d.date > (select d from hoje) - 14), 0),
    max(d.date) filter (where d.spend > 0)
  from meta_ads_daily d
  left join meta_ads_campaigns c on c.campaign_id = d.campaign_id and c.client_id = d.client_id
  where d.client_id = p_client_id and d.campaign_id is not null and d.date >= (select d from hoje) - 120
    and (public.is_app_admin() or public.is_client_member(p_client_id))
  group by d.campaign_id
  order by max(d.date) desc;
$function$;

revoke all on function public.sap_salvar_peca(uuid, uuid, jsonb) from public, anon;
revoke all on function public.sap_campanhas_numeros(uuid) from public, anon;
grant execute on function public.sap_salvar_peca(uuid, uuid, jsonb) to authenticated;
grant execute on function public.sap_campanhas_numeros(uuid) to authenticated;
