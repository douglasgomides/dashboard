-- Sistema de Aquisição de Pacientes (SAP) · Tracker automático.
-- Aditivo. Lê o que já chega ao Hub (crm_leads, wts_sessions, meta_ads_daily) e calcula os KPIs
-- oficiais do SAP sem ninguém digitar planilha. As tabelas sap_* continuam valendo para o que vier
-- do n8n/endpoint; aqui só entram:
--   1) sap_etapa_marco: o que cada etapa do CRM significa no funil do SAP (a equipe marca);
--   2) colunas novas em sap_clinicas (ticket médio, piloto);
--   3) funções: sap_salvar_clinica, sap_etapas_para_marcar, sap_definir_marco, sap_tracker_auto.
--
-- Regras do funil (as mesmas de src/lib/sap-auto.ts):
-- - O CRM guarda só a etapa ATUAL do lead. Um lead "chegou" a um marco quando a etapa atual é esse
--   marco ou um posterior (qualificado < agendado < compareceu < pensando/não fechou < fechou).
--   Ganho no CRM conta como fechou (e, portanto, agendou e compareceu).
-- - Sem marcos marcados, vale a regra do Comercial: etapa de consulta = agendou; saiu da 1ª etapa =
--   atendido (usado no lugar de "qualificado A+B", e a tela avisa que é estimativa).
-- - Lista importada (funis de base antiga, dias de importação em massa) não é lead que entrou.
-- - 1ª resposta: mediana do tempo de espera do WhatsApp (wts_sessions.wait_seconds) das conversas
--   iniciadas em horário comercial (seg–sex 8h–18h, sáb 8h–12h, horário de Brasília).

alter table public.sap_clinicas add column if not exists ticket_medio numeric;
alter table public.sap_clinicas add column if not exists piloto boolean not null default false;
alter table public.sap_clinicas add column if not exists atualizado_em timestamptz default now();

create table if not exists public.sap_etapa_marco (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  status_id text not null,
  marco text check (marco in ('desqualificado','qualificado','agendado','faltou','compareceu','pensando','nao_fechou','fechou')),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id, status_id)
);
alter table public.sap_etapa_marco enable row level security;
drop policy if exists "admin gerencia marcos sap" on public.sap_etapa_marco;
create policy "admin gerencia marcos sap" on public.sap_etapa_marco
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

-- Cadastro (ou atualização) da clínica do SAP ligada a um cliente do Hub. Só admin.
create or replace function public.sap_salvar_clinica(
  p_client_id uuid, p_d0 date, p_status text, p_servicos text[], p_ticket numeric, p_piloto boolean)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_nome text; v_esp text;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_status is not null and p_status not in ('onboarding','rodando','pausada','encerrada') then raise exception 'status invalido'; end if;
  select name into v_nome from clients where id = p_client_id;
  if v_nome is null then raise exception 'cliente nao encontrado'; end if;
  select id into v_id from sap_clinicas where client_id = p_client_id order by created_at desc limit 1;
  if v_id is null then
    insert into sap_clinicas (client_id, nome, d0, status, servicos, ticket_medio, piloto)
    values (p_client_id, v_nome, p_d0, coalesce(p_status, 'onboarding'), coalesce(p_servicos, '{}'), p_ticket, coalesce(p_piloto, false))
    returning id into v_id;
  else
    update sap_clinicas set d0 = p_d0, status = coalesce(p_status, status), servicos = coalesce(p_servicos, servicos),
      ticket_medio = p_ticket, piloto = coalesce(p_piloto, piloto), atualizado_em = now()
    where id = v_id;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.sap_salvar_clinica(uuid, date, text, text[], numeric, boolean) from public, anon;
grant execute on function public.sap_salvar_clinica(uuid, date, text, text[], numeric, boolean) to authenticated;

-- Etapas do CRM do cliente com o marco do SAP (marcado ou sugerido pelo nome). Só admin.
create or replace function public.sap_etapas_para_marcar(p_client_id uuid)
returns table(connection_id uuid, provider text, pipeline_id text, pipeline_name text, status_id text,
              status_name text, total bigint, ganhos bigint, perdidos bigint, marco text, sugestao text)
language sql stable security definer set search_path to 'public'
as $function$
  select cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id), count(cl.id) filter (where cl.outcome = 'won'), count(cl.id) filter (where cl.outcome = 'lost'),
    max(m.marco),
    case
      when cps.status_name ~* '(desqualific|fora do perfil|sem perfil|n[ãa]o qualific)' then 'desqualificado'
      when cps.status_name ~* '(falt|n[ãa]o (veio|compareceu)|no.?show)' then 'faltou'
      when cps.status_name ~* '(n[ãa]o fech|perdid|recus)' then 'nao_fechou'
      when cps.status_name ~* '(fechad|fechou|ganho|vendid|venda|contratou|pago)' then 'fechou'
      when cps.status_name ~* '(pensando|follow|negocia|or[çc]amento|proposta)' then 'pensando'
      when cps.status_name ~* '(compareceu|realizad|consultad|atendid[ao] na cl|p[óo]s.?consulta)' then 'compareceu'
      when cps.status_name ~* '(agendad|agendamento|consulta marcada)' and cps.status_name !~* '(aguard|reagend|redequa)' then 'agendado'
      when cps.status_name ~* '(qualificad|triagem|em atendimento|interessad)' then 'qualificado'
      else null end
  from crm_connections cc
  join crm_pipeline_statuses cps on cps.crm_connection_id = cc.id
  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null
    and cl.pipeline_id = cps.pipeline_id and cl.status_id = cps.status_id
  left join sap_etapa_marco m on m.crm_connection_id = cc.id and m.pipeline_id = cps.pipeline_id and m.status_id = cps.status_id
  where cc.client_id = p_client_id and cc.active and public.is_app_admin()
  group by cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name
  order by cps.pipeline_name, cps.status_name;
$function$;
revoke all on function public.sap_etapas_para_marcar(uuid) from public, anon;
grant execute on function public.sap_etapas_para_marcar(uuid) to authenticated;

-- Marca (ou desmarca, com p_marco null) o significado de uma etapa no funil do SAP. Só admin.
create or replace function public.sap_definir_marco(p_connection uuid, p_pipeline text, p_status text, p_marco text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_etapa_marco (crm_connection_id, pipeline_id, status_id, marco)
  values (p_connection, p_pipeline, p_status, p_marco)
  on conflict (crm_connection_id, pipeline_id, status_id)
  do update set marco = excluded.marco, atualizado_em = now();
end;
$function$;
revoke all on function public.sap_definir_marco(uuid, text, text, text) from public, anon;
grant execute on function public.sap_definir_marco(uuid, text, text, text) to authenticated;

-- Números do SAP no período, direto do CRM + WhatsApp + Meta. Leads pela data de entrada (coorte).
create or replace function public.sap_tracker_auto(p_client_id uuid, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  conns as (
    select cc.id from crm_connections cc
    where cc.client_id = p_client_id and cc.active and (select pode from ok)
  ),
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.pipeline_name,
      cps.status_name ~* '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$' as entrada,
      (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)') as lista,
      (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada')) as consulta,
      m.marco
    from crm_pipeline_statuses cps
    join conns on conns.id = cps.crm_connection_id
    left join sap_etapa_marco m on m.crm_connection_id = cps.crm_connection_id and m.pipeline_id = cps.pipeline_id and m.status_id = cps.status_id
  ),
  marcos as (select count(*) filter (where marco is not null) as n, coalesce(jsonb_agg(distinct marco) filter (where marco is not null), '[]'::jsonb) as quais from etapas),
  dias as (
    select cl.crm_connection_id, (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
    from crm_leads cl join conns on conns.id = cl.crm_connection_id
    where cl.removido_na_origem is null and cl.occurred_at is not null
    group by 1, 2
  ),
  importacao as (
    select d.crm_connection_id, d.dia from dias d
    join (select crm_connection_id, percentile_cont(0.5) within group (order by n) as tipico from dias group by 1) m
      on m.crm_connection_id = d.crm_connection_id
    where d.n >= 500 and d.n > 10 * m.tipico
  ),
  base as (
    select cl.outcome, cl.price, cl.provider,
      (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia,
      nullif(btrim(cl.source), '') as source,
      coalesce(e.pipeline_name, '') as funil,
      coalesce(e.entrada, false) as entrada,
      coalesce(e.consulta, false) as consulta,
      e.marco,
      case cl.provider
        when 'kommo' then coalesce(cl.raw_payload->>'loss_reason_id', '0') not in ('0', '') or jsonb_typeof(cl.raw_payload->'loss_reason') = 'array' and jsonb_array_length(cl.raw_payload->'loss_reason') > 0
        when 'rdstation' then nullif(cl.raw_payload#>>'{deal_lost_reason,name}', '') is not null
        when 'clint' then nullif(cl.raw_payload->>'lost_status_id', '') is not null
        when 'planilha' then nullif(btrim(cl.raw_payload->>'motivo_perda'), '') is not null
        else null end as tem_motivo
    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and not coalesce(e.lista, false)
      and not exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)
  ),
  l as (
    select b.*,
      (b.source is not null and b.source is distinct from btrim(b.funil)) as tem_origem,
      case
        when b.source is null or b.source = btrim(b.funil) then 'Sem origem'
        when b.source ~* '(google)' then 'Google Ads'
        when b.source ~* '(meta ads|facebook ads|fb ads|an[úu]ncio|tr[áa]fego|messenger|lead ?ads|campanha)' then 'Meta Ads'
        when b.source ~* '(indica)' then 'Indicação'
        when b.source ~* '(j[áa] (sou|é) paciente|paciente antigo|retorno)' then 'Paciente antigo'
        when b.source ~* '(instagram|insta|redes sociais|site|org[âa]nico|tiktok|youtube)' then 'Orgânico'
        else 'Outro' end as canal,
      case coalesce(b.marco, '')
        when 'desqualificado' then 0 when 'qualificado' then 1 when 'agendado' then 2 when 'faltou' then 2
        when 'compareceu' then 3 when 'pensando' then 4 when 'nao_fechou' then 4 when 'fechou' then 5
        else null end as rank
    from base b
  ),
  f as (
    select l.*,
      (outcome = 'won' or marco = 'fechou') as fechou,
      (outcome = 'won' or coalesce(rank, case when consulta then 2 else null end, -1) >= 3) as compareceu,
      (outcome = 'won' or coalesce(rank, case when consulta then 2 else null end, -1) >= 2) as agendou,
      (marco = 'faltou') as faltou,
      (marco = 'pensando' and coalesce(outcome, 'open') = 'open') as pensando,
      (marco = 'nao_fechou' or (outcome = 'lost' and coalesce(rank, -1) >= 3)) as nao_fechou,
      case when marco = 'desqualificado' then false
           when rank is not null then rank >= 1 or outcome = 'won'
           else (not entrada) or outcome = 'won' end as qualificado
    from l
  ),
  wts as (
    select w.wait_seconds from wts_sessions w
    where w.client_id = p_client_id and (select pode from ok)
      and (w.started_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and w.wait_seconds is not null and w.wait_seconds >= 0
      and (
        (extract(isodow from w.started_at at time zone 'America/Sao_Paulo') between 1 and 5
          and extract(hour from w.started_at at time zone 'America/Sao_Paulo') between 8 and 17)
        or (extract(isodow from w.started_at at time zone 'America/Sao_Paulo') = 6
          and extract(hour from w.started_at at time zone 'America/Sao_Paulo') between 8 and 11))
  ),
  ads as (
    select coalesce(sum(spend), 0) as investido, coalesce(sum(coalesce(conversations, 0) + coalesce(leads, 0)), 0) as leads_plataforma
    from meta_ads_daily where client_id = p_client_id and date between p_from and p_to and (select pode from ok)
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_crm', exists (select 1 from conns),
    'tem_whatsapp', exists (select 1 from wts_sessions w where w.client_id = p_client_id),
    'marcos_marcados', (select n from marcos),
    'marcos', (select quais from marcos),
    'leads', (select count(*) from f),
    'qualificados', (select count(*) from f where qualificado),
    'agendados', (select count(*) from f where agendou),
    'compareceram', (select count(*) from f where compareceu),
    'faltaram', (select count(*) from f where faltou),
    'pensando', (select count(*) from f where pensando),
    'nao_fecharam', (select count(*) from f where nao_fechou),
    'fechados', (select count(*) from f where fechou),
    'fechados_com_valor', (select count(*) from f where fechou and price > 0),
    'perdidos', (select count(*) from f where outcome = 'lost'),
    'perdidos_com_motivo', (select count(*) from f where outcome = 'lost' and tem_motivo),
    'perdidos_motivo_medivel', (select count(*) from f where outcome = 'lost' and tem_motivo is not null),
    'receita', coalesce((select sum(price) from f where fechou and price > 0), 0),
    'com_origem', (select count(*) from f where tem_origem),
    'linhas_completas', (select count(*) from f where tem_origem and (not fechou or price > 0) and (outcome is distinct from 'lost' or tem_motivo is not false)),
    'investido', (select investido from ads),
    'leads_plataforma', (select leads_plataforma from ads),
    'leads_crm_meta', (select count(*) from f where canal = 'Meta Ads'),
    'resposta_conversas', (select count(*) from wts),
    'resposta_mediana_min', (select round((percentile_cont(0.5) within group (order by wait_seconds) / 60.0)::numeric, 1) from wts),
    'resposta_ate_5min', (select count(*) from wts where wait_seconds <= 300),
    'canais', coalesce((select jsonb_agg(x order by x->>'canal') from (
        select jsonb_build_object('canal', canal, 'leads', count(*), 'agendados', count(*) filter (where agendou),
          'compareceram', count(*) filter (where compareceu), 'fechados', count(*) filter (where fechou),
          'receita', coalesce(sum(price) filter (where fechou and price > 0), 0)) x
        from f group by canal) s), '[]'::jsonb),
    'semanas', coalesce((select jsonb_agg(x order by x->>'semana') from (
        select jsonb_build_object('semana', date_trunc('week', dia)::date, 'leads', count(*),
          'agendados', count(*) filter (where agendou), 'compareceram', count(*) filter (where compareceu),
          'fechados', count(*) filter (where fechou), 'receita', coalesce(sum(price) filter (where fechou and price > 0), 0)) x
        from f group by date_trunc('week', dia)) s), '[]'::jsonb)
  ) end;
$function$;
revoke all on function public.sap_tracker_auto(uuid, date, date) from public, anon;
grant execute on function public.sap_tracker_auto(uuid, date, date) to authenticated;
