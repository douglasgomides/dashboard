-- Modelo comercial universal: crm_leads já é a tabela única dos 5 CRMs (Kommo, Clint, FlwChat, RD Station,
-- planilha), com o ESTADO ATUAL de cada lead. Faltava o HISTÓRICO: quando o lead mudou de etapa, ganhou,
-- perdeu ou reabriu. crm_lead_eventos guarda isso a partir de agora, por um gatilho em crm_leads, então vale
-- para qualquer CRM que grava em crm_leads (todas as sincronizações fazem upsert nela).
--
-- Hora do evento: a da gravação (webhook do Kommo é na hora; os outros CRMs, na rodada da sincronização).
-- "entrou" usa a data de criação do lead (occurred_at). Não há histórico anterior a esta migração.

create table if not exists public.crm_lead_eventos (
  id bigserial primary key,
  client_id uuid not null,
  crm_connection_id uuid not null,
  external_lead_id text not null,
  tipo text not null check (tipo in ('entrou', 'mudou_etapa', 'ganhou', 'perdeu', 'reabriu')),
  pipeline_de text,
  status_de text,
  pipeline_para text,
  status_para text,
  ocorreu_em timestamptz not null default now(),
  registrado_em timestamptz not null default now()
);
create index if not exists crm_lead_eventos_cliente_dia on public.crm_lead_eventos (client_id, ocorreu_em);
create index if not exists crm_lead_eventos_lead on public.crm_lead_eventos (crm_connection_id, external_lead_id);
alter table public.crm_lead_eventos enable row level security;
create policy crm_lead_eventos_ler on public.crm_lead_eventos for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.crm_lead_eventos from anon;
grant select on public.crm_lead_eventos to authenticated;

create or replace function public.crm_registrar_evento()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  o_out text := case when tg_op = 'UPDATE' then coalesce(old.outcome, 'open') else null end;
  n_out text := coalesce(new.outcome, 'open');
begin
  -- Nunca derruba a sincronização: qualquer falha aqui só deixa de registrar o evento.
  begin
    if tg_op = 'INSERT' then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'entrou', new.pipeline_id, new.status_id, coalesce(new.occurred_at, now()));
      return new;
    end if;
    if new.client_id is null then return new; end if;
    if old.status_id is distinct from new.status_id or old.pipeline_id is distinct from new.pipeline_id then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_de, status_de, pipeline_para, status_para)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'mudou_etapa', old.pipeline_id, old.status_id, new.pipeline_id, new.status_id);
    end if;
    if o_out is distinct from n_out then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para)
      values (new.client_id, new.crm_connection_id, new.external_lead_id,
        case n_out when 'won' then 'ganhou' when 'lost' then 'perdeu' else 'reabriu' end, new.pipeline_id, new.status_id);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$function$;
revoke all on function public.crm_registrar_evento() from public, anon, authenticated;

create trigger crm_leads_eventos
  after insert or update of status_id, pipeline_id, outcome on public.crm_leads
  for each row when (new.client_id is not null)
  execute function public.crm_registrar_evento();

-- Visões comerciais do período: coortes por semana de entrada, estoque de leads abertos por etapa e idade,
-- e movimentos da semana (do histórico acima). Mesmas regras de crm_diagnostico_comercial: listas antigas e
-- dias de importação em massa ficam de fora; "agendou" = etapa marcada como consulta ou ganho.
create or replace function public.crm_visoes_comerciais(p_client_id uuid, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with cfg as (
    select '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$'::text as re_entrada
  ),
  conns as (
    select cc.id from crm_connections cc
    where cc.client_id = p_client_id and cc.active
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.status_name, cps.pipeline_name,
      cps.status_name ~* (select re_entrada from cfg) as entrada,
      (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)') as lista,
      (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada')) as consulta
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
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
  leads as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id,
      coalesce(cl.outcome, 'open') as outcome,
      (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia,
      coalesce(e.entrada, false) as entrada,
      coalesce(e.consulta, false) as consulta,
      e.status_name, e.pipeline_name
    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and not coalesce(e.lista, false)
      and not exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)
  ),
  coortes as (
    select date_trunc('week', dia)::date as semana, count(*) as leads,
      count(*) filter (where not entrada or outcome <> 'open') as atendidos,
      count(*) filter (where consulta or outcome = 'won') as agendados,
      count(*) filter (where outcome = 'won') as ganhos,
      count(*) filter (where outcome = 'lost') as perdidos,
      count(*) filter (where outcome = 'open') as abertos
    from leads where dia between p_from and p_to
    group by 1
  ),
  estoque as (
    select coalesce(status_name, '(etapa sem nome)') as etapa, pipeline_name as funil, bool_or(entrada) as entrada, bool_or(consulta) as consulta,
      count(*) as total,
      count(*) filter (where p_to - dia <= 3) as ate_3,
      count(*) filter (where p_to - dia between 4 and 7) as de_4_a_7,
      count(*) filter (where p_to - dia between 8 and 30) as de_8_a_30,
      count(*) filter (where p_to - dia > 30) as mais_30
    from leads where outcome = 'open' and dia <= p_to
    group by 1, 2
  ),
  ev as (
    select ce.*, coalesce(e.consulta, false) as para_consulta
    from crm_lead_eventos ce
    left join etapas e on e.crm_connection_id = ce.crm_connection_id and e.pipeline_id = ce.pipeline_para and e.status_id = ce.status_para
    where ce.client_id = p_client_id and ce.crm_connection_id in (select id from conns)
      and ce.tipo <> 'entrou'
      and (ce.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  movimentos as (
    select date_trunc('week', (ocorreu_em at time zone 'America/Sao_Paulo')::date)::date as semana,
      count(*) filter (where tipo = 'mudou_etapa') as mudancas,
      count(*) filter (where tipo = 'mudou_etapa' and para_consulta) as agendaram,
      count(*) filter (where tipo = 'ganhou') as ganhos,
      count(*) filter (where tipo = 'perdeu') as perdas,
      count(*) filter (where tipo = 'reabriu') as reabertos,
      count(distinct external_lead_id) as leads_mexidos
    from ev group by 1
  )
  select jsonb_build_object(
    'tem_crm', exists (select 1 from conns),
    'coortes', coalesce((select jsonb_agg(to_jsonb(c) order by c.semana) from coortes c), '[]'::jsonb),
    'estoque', coalesce((select jsonb_agg(to_jsonb(s) order by s.entrada desc, s.total desc) from estoque s), '[]'::jsonb),
    'abertos', (select count(*) from leads where outcome = 'open' and dia <= p_to),
    'movimentos', coalesce((select jsonb_agg(to_jsonb(m) order by m.semana) from movimentos m), '[]'::jsonb),
    'eventos_desde', (select min(registrado_em) from crm_lead_eventos ce where ce.client_id = p_client_id and ce.crm_connection_id in (select id from conns))
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;
revoke all on function public.crm_visoes_comerciais(uuid, date, date) from public, anon;
grant execute on function public.crm_visoes_comerciais(uuid, date, date) to authenticated;
