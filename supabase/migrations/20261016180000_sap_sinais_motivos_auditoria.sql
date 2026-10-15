-- SAP · Lote C da revisão do Drive: medir as metas assinadas nas Sessões 4 e 5.
-- 1) Sinais de etapa (06.06): quais etapas do CRM significam "confirmou" e "remarcou". Não mudam a ordem do funil
--    (sap_etapa_marco); só contam. Um lead conta quando está numa dessas etapas ou passou por ela (crm_lead_eventos).
-- 2) Motivos de perda (07.07): nome do motivo vindo do CRM (Kommo: crm_motivos_perda, preenchido pelo sync) e a
--    categoria do SAP (Preço, Tempo para decidir, Cônjuge ou família, Medo ou insegurança, Comparando com outro
--    profissional, Sem indicação clínica, Outro). Sem categoria definida, vale a sugestão pelo nome.
-- 3) Auditoria semanal de conversas (06.09): amostra de 10 conversas com nota (0 a 12), confirmação até a véspera,
--    F1 em até 24 h e "pensando" em cadência. É o que a equipe mede olhando as conversas; o CRM não mostra.

create table if not exists public.crm_motivos_perda (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  motivo_id text not null,
  nome text not null,
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, motivo_id)
);
alter table public.crm_motivos_perda enable row level security;
create policy "ler motivos de perda" on public.crm_motivos_perda for select to authenticated using (
  public.is_app_admin() or exists (select 1 from crm_connections c where c.id = crm_connection_id and public.is_client_member(c.client_id)));

create table if not exists public.sap_motivo_categoria (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  motivo_id text not null,
  categoria text not null check (categoria in ('Preço','Tempo para decidir','Cônjuge ou família','Medo ou insegurança','Comparando com outro profissional','Sem indicação clínica','Outro')),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, motivo_id)
);
alter table public.sap_motivo_categoria enable row level security;
create policy "admin gerencia categorias de motivo" on public.sap_motivo_categoria for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create table if not exists public.sap_etapa_sinal (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  status_id text not null,
  sinal text not null check (sinal in ('confirmado','remarcou')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id, status_id, sinal)
);
alter table public.sap_etapa_sinal enable row level security;
create policy "admin gerencia sinais de etapa" on public.sap_etapa_sinal for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create table if not exists public.sap_auditoria_semana (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  semana date not null,
  conversas integer check (conversas between 0 and 100),
  nota_media numeric check (nota_media between 0 and 12),
  confirmacao_vespera numeric check (confirmacao_vespera between 0 and 1),
  f1_24h numeric check (f1_24h between 0 and 1),
  pensando_cadencia numeric check (pensando_cadencia between 0 and 1),
  observacao text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, semana)
);
alter table public.sap_auditoria_semana enable row level security;
create policy "sap ler auditoria" on public.sap_auditoria_semana for select to authenticated using (public.sap_pode_ler(clinica_id));

create or replace function public.sap_salvar_auditoria(p_clinica_id uuid, p_semana date, p_conversas integer, p_nota numeric,
  p_confirmacao numeric, p_f1 numeric, p_pensando numeric, p_observacao text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_auditoria_semana (clinica_id, semana, conversas, nota_media, confirmacao_vespera, f1_24h, pensando_cadencia, observacao, atualizado_por, atualizado_em)
  values (p_clinica_id, p_semana, p_conversas, p_nota, p_confirmacao, p_f1, p_pensando, nullif(btrim(p_observacao), ''), auth.uid(), now())
  on conflict (clinica_id, semana) do update set conversas = excluded.conversas, nota_media = excluded.nota_media,
    confirmacao_vespera = excluded.confirmacao_vespera, f1_24h = excluded.f1_24h, pensando_cadencia = excluded.pensando_cadencia,
    observacao = excluded.observacao, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;

create or replace function public.sap_definir_sinal(p_connection_id uuid, p_pipeline_id text, p_status_id text, p_sinal text, p_ligado boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_etapa_sinal (crm_connection_id, pipeline_id, status_id, sinal, ativo) values (p_connection_id, p_pipeline_id, p_status_id, p_sinal, p_ligado)
  on conflict (crm_connection_id, pipeline_id, status_id, sinal) do update set ativo = excluded.ativo, atualizado_em = now();
end;
$function$;

create or replace function public.sap_definir_categoria_motivo(p_connection_id uuid, p_motivo_id text, p_categoria text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_motivo_categoria (crm_connection_id, motivo_id, categoria) values (p_connection_id, p_motivo_id, p_categoria)
  on conflict (crm_connection_id, motivo_id) do update set categoria = excluded.categoria, atualizado_em = now();
end;
$function$;

-- Sinais e motivos do período (mesmas regras de sap_tracker_auto: listas importadas e dias de importação fora).
create or replace function public.sap_sinais_auto(p_client_id uuid, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  conns as (select cc.id from crm_connections cc where cc.client_id = p_client_id and cc.active and (select pode from ok)),
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id,
      (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)') as lista,
      exists (select 1 from sap_etapa_sinal s where s.ativo and s.sinal = 'confirmado' and s.crm_connection_id = cps.crm_connection_id and s.pipeline_id = cps.pipeline_id and s.status_id = cps.status_id) as confirmado,
      exists (select 1 from sap_etapa_sinal s where s.ativo and s.sinal = 'remarcou' and s.crm_connection_id = cps.crm_connection_id and s.pipeline_id = cps.pipeline_id and s.status_id = cps.status_id) as remarcou
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
  dias as (
    select cl.crm_connection_id, (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
    from crm_leads cl join conns on conns.id = cl.crm_connection_id
    where cl.removido_na_origem is null and cl.occurred_at is not null group by 1, 2
  ),
  importacao as (
    select d.crm_connection_id, d.dia from dias d
    join (select crm_connection_id, percentile_cont(0.5) within group (order by n) as tipico from dias group by 1) m on m.crm_connection_id = d.crm_connection_id
    where d.n >= 500 and d.n > 10 * m.tipico
  ),
  l as (
    select cl.crm_connection_id, cl.external_lead_id, cl.outcome, cl.provider,
      coalesce(e.confirmado, false) as em_confirmado, coalesce(e.remarcou, false) as em_remarcou,
      case cl.provider
        when 'kommo' then nullif(nullif(cl.raw_payload->>'loss_reason_id', '0'), '')
        when 'rdstation' then nullif(cl.raw_payload#>>'{deal_lost_reason,name}', '')
        when 'planilha' then nullif(btrim(cl.raw_payload->>'motivo_perda'), '')
        when 'clint' then nullif(cl.raw_payload->>'lost_status_id', '')
        else null end as motivo_id
    from crm_leads cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and not coalesce(e.lista, false)
      and not exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)
  ),
  passou as (
    select ev.crm_connection_id, ev.external_lead_id, bool_or(e.confirmado) as confirmado, bool_or(e.remarcou) as remarcou
    from crm_lead_eventos ev
    join etapas e on e.crm_connection_id = ev.crm_connection_id and e.pipeline_id = ev.pipeline_para and e.status_id = ev.status_para
    where ev.client_id = p_client_id and ev.tipo = 'mudou_etapa'
    group by 1, 2
  ),
  s as (
    select l.*, (l.em_confirmado or coalesce(p.confirmado, false)) as confirmou, (l.em_remarcou or coalesce(p.remarcou, false)) as remarcou
    from l left join passou p on p.crm_connection_id = l.crm_connection_id and p.external_lead_id = l.external_lead_id
  ),
  mot as (
    select s.crm_connection_id, s.motivo_id, coalesce(mp.nome, s.motivo_id) as nome, mc.categoria as definida,
      case
        when coalesce(mp.nome, s.motivo_id) ~* '(pre[cç]o|valor|caro|financ|dinheiro|or[cç]amento|pagamento|parcel)' then 'Preço'
        when coalesce(mp.nome, s.motivo_id) ~* '(marido|esposa|c[oô]njuge|fam[ií]lia|filh|parceir)' then 'Cônjuge ou família'
        when coalesce(mp.nome, s.motivo_id) ~* '(medo|receio|insegur|anestesia|risco)' then 'Medo ou insegurança'
        when coalesce(mp.nome, s.motivo_id) ~* '(concorr|outr[oa] (m[eé]dic|profission|lugar|cl[ií]nic)|compar|fechou com)' then 'Comparando com outro profissional'
        when coalesce(mp.nome, s.motivo_id) ~* '(pensar|decidir|tempo|depois|momento|adiou|futuro)' then 'Tempo para decidir'
        when coalesce(mp.nome, s.motivo_id) ~* '(sem indica|n[aã]o (tem|precisa)|fora do perfil|desqualific|n[aã]o qualific|curioso)' then 'Sem indicação clínica'
        else null end as sugerida
    from s
    left join crm_motivos_perda mp on mp.crm_connection_id = s.crm_connection_id and mp.motivo_id = s.motivo_id
    left join sap_motivo_categoria mc on mc.crm_connection_id = s.crm_connection_id and mc.motivo_id = s.motivo_id
    where s.outcome = 'lost' and s.motivo_id is not null
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_sinal_confirmado', exists (select 1 from etapas where confirmado),
    'tem_sinal_remarcou', exists (select 1 from etapas where remarcou),
    'confirmados', (select count(*) from s where confirmou),
    'remarcados', (select count(*) from s where remarcou),
    'perdidos_com_motivo', (select count(*) from mot),
    'motivos', coalesce((select jsonb_agg(x order by (x->>'total')::int desc) from (
        select jsonb_build_object('categoria', coalesce(definida, sugerida, 'Outro'), 'total', count(*),
          'sugeridos', count(*) filter (where definida is null)) x
        from mot group by coalesce(definida, sugerida, 'Outro')) q), '[]'::jsonb),
    'lista', case when public.is_app_admin() then coalesce((select jsonb_agg(x order by (x->>'total')::int desc) from (
        select jsonb_build_object('crm_connection_id', crm_connection_id, 'motivo_id', motivo_id, 'nome', max(nome),
          'categoria', max(definida), 'sugestao', max(sugerida), 'total', count(*)) x
        from mot group by crm_connection_id, motivo_id) q), '[]'::jsonb) else '[]'::jsonb end
  ) end;
$function$;

revoke all on function public.sap_salvar_auditoria(uuid, date, integer, numeric, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.sap_definir_sinal(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.sap_definir_categoria_motivo(uuid, text, text) from public, anon;
revoke all on function public.sap_sinais_auto(uuid, date, date) from public, anon;
grant execute on function public.sap_salvar_auditoria(uuid, date, integer, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.sap_definir_sinal(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.sap_definir_categoria_motivo(uuid, text, text) to authenticated;
grant execute on function public.sap_sinais_auto(uuid, date, date) to authenticated;
grant select on public.crm_motivos_perda, public.sap_auditoria_semana to authenticated;
