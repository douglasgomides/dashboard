-- Qualidade do lead por campanha: o anúncio trouxe gente que avança no funil ou só volume?
-- Duas leituras, sempre separadas na tela:
--  1) DIRETA: o lead traz a campanha (Clint: fields.campaign_id do formulário da Meta; Kommo: UTM_CAMPAIGNID ou
--     UTM_CAMPAIGN igual ao nome da campanha).
--  2) ESTIMADA POR HORÁRIO: a Meta só informa quantas conversas cada campanha iniciou por DIA. Cada conversa de
--     WhatsApp que começou naquele dia é repartida entre as campanhas na proporção das conversas que cada uma
--     informou, limitado ao total da Meta no dia (o excedente fica como orgânico). Depois segue a conversa até o
--     lead do CRM (conversas.lead_id ou mesma pessoa) para ver a etapa.
-- Etapa: "avançou" = chegou a qualificação (não pré-qualificação), negociação, proposta/orçamento, agendamento,
-- consulta/reunião ou venda, ou ganhou (follow-up, "mensagem enviada" e reengajamento são só tentativa de contato); "agendou" = etapa de agendamento,
-- consulta, reunião ou confirmação, ou ganhou. Mesmas palavras de crm_diagnostico_comercial.
create or replace function public.qualidade_leads_campanha(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  camp as (select campaign_id, name from meta_ads_campaigns where client_id = p_client),
  leads as (
    select cl.id, cl.outcome, cl.pessoa_id, cl.provider, cl.occurred_at, coalesce(cps.status_name, '') etapa,
      case cl.provider
        when 'clint' then nullif(cl.raw_payload->'fields'->>'campaign_id', '')
        when 'kommo' then coalesce(
          (select nullif(v->>'value', '') from jsonb_array_elements(case when jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array' then cl.raw_payload->'custom_fields_values' else '[]' end) f,
             jsonb_array_elements(f->'values') v where f->>'field_code' = 'UTM_CAMPAIGNID' and v->>'value' ~ '^\d+$' limit 1),
          (select c.campaign_id from jsonb_array_elements(case when jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array' then cl.raw_payload->'custom_fields_values' else '[]' end) f,
             jsonb_array_elements(f->'values') v join camp c on lower(btrim(c.name)) = lower(btrim(v->>'value')) where f->>'field_code' = 'UTM_CAMPAIGN' limit 1))
      end as campaign_id
    from crm_leads cl
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    where cl.client_id = p_client and cl.removido_na_origem is null and (select pode from ok)
  ),
  lq as (
    select l.*,
      (l.outcome = 'won' or (coalesce(l.outcome, 'open') <> 'lost' and l.etapa !~* '(perdid|desqualific|lost|n[ãa]o eleg|cemit)' and l.etapa ~* '((^|[^-])qualifica|negocia|proposta|or[cç]a|agend|consulta|reuni|realizad|venda|ganh|fechad|pagamento|interesse identificado|aguardando (decis|fechamento|reserva))')) as avancou,
      (l.outcome = 'won' or l.etapa ~* '(agendad|confirmad|realizad|compareceu)') as agendou,
      (l.outcome = 'lost' or l.etapa ~* '(perdid|desqualific|lost|n[ãa]o eleg)') as perdeu
    from leads l
  ),
  gasto as (
    select campaign_id, sum(spend) g, sum(conversations) cv from meta_ads_daily
    where client_id = p_client and date between p_de and p_ate and (select pode from ok) group by 1
  ),
  direto as (
    select l.campaign_id, count(*) leads, count(*) filter (where avancou) avancaram, count(*) filter (where agendou) agendaram,
      count(*) filter (where outcome = 'won') ganhos, count(*) filter (where perdeu) perdidos
    from lq l where l.campaign_id is not null and (l.occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    group by 1
  ),
  -- conversas novas por dia (1ª mensagem do paciente) e o lead de cada uma
  conv as (
    select c.id, (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date dia, c.lead_id, c.pessoa_id
    from conversas c join mensagens m on m.conversa_id = c.id and m.direcao = 'entrada'
    where c.client_id = p_client and (select pode from ok)
    group by c.id
    having (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  conv_lead as (
    select cv.*, coalesce(
      (select row(l.avancou, l.agendou, l.outcome = 'won')::text from lq l where l.id = cv.lead_id),
      (select row(l.avancou, l.agendou, l.outcome = 'won')::text from lq l where l.pessoa_id = cv.pessoa_id and cv.pessoa_id is not null order by l.occurred_at desc limit 1)) as r
    from conv cv
  ),
  dia_conv as (select dia, count(*) n from conv group by dia),
  meta_dia as (
    select date dia, campaign_id, sum(conversations) cv from meta_ads_daily
    where client_id = p_client and date between p_de and p_ate and conversations > 0 and (select pode from ok) group by 1, 2
  ),
  meta_tot as (select dia, sum(cv) tot from meta_dia group by 1),
  -- peso de cada conversa para cada campanha no dia: (conversas da campanha / conversas novas do dia), no máximo
  -- a fração da campanha no total da Meta quando a Meta informa mais do que chegou.
  peso as (
    select md.dia, md.campaign_id, md.cv, dc.n,
      least(md.cv::numeric / nullif(dc.n, 0), md.cv::numeric / nullif(mt.tot, 0)) as w
    from meta_dia md join meta_tot mt on mt.dia = md.dia join dia_conv dc on dc.dia = md.dia
  ),
  estimado as (
    select p.campaign_id,
      sum(p.cv) conversas_meta,
      round(sum(p.w * p.n), 1) conversas_atribuidas,
      round(sum(p.w * (select count(*) from conv_lead cl where cl.dia = p.dia and cl.r is not null)), 1) com_lead,
      round(sum(p.w * (select count(*) from conv_lead cl where cl.dia = p.dia and cl.r like '(t,%')), 1) avancaram,
      round(sum(p.w * (select count(*) from conv_lead cl where cl.dia = p.dia and cl.r like '(%,t,%')), 1) agendaram,
      round(sum(p.w * (select count(*) from conv_lead cl where cl.dia = p.dia and cl.r like '%,t)')), 1) ganhos
    from peso p group by 1
  )
  select jsonb_build_object(
    'direto', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', d.campaign_id, 'campanha', coalesce(c.name, d.campaign_id),
        'gasto', round(coalesce(g.g, 0)), 'leads', d.leads, 'avancaram', d.avancaram, 'agendaram', d.agendaram, 'ganhos', d.ganhos, 'perdidos', d.perdidos)
        order by d.leads desc)
      from direto d left join camp c on c.campaign_id = d.campaign_id left join gasto g on g.campaign_id = d.campaign_id), '[]'),
    'estimado', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', e.campaign_id, 'campanha', coalesce(c.name, e.campaign_id),
        'gasto', round(coalesce(g.g, 0)), 'conversas_meta', e.conversas_meta, 'conversas_atribuidas', e.conversas_atribuidas,
        'com_lead', e.com_lead, 'avancaram', e.avancaram, 'agendaram', e.agendaram, 'ganhos', e.ganhos) order by e.conversas_meta desc)
      from estimado e left join camp c on c.campaign_id = e.campaign_id left join gasto g on g.campaign_id = e.campaign_id), '[]'),
    'cobertura', jsonb_build_object(
      'leads_periodo', (select count(*) from lq where (occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
      'leads_com_campanha', (select coalesce(sum(leads), 0) from direto),
      'conversas_novas', (select count(*) from conv),
      'conversas_com_lead', (select count(*) from conv_lead where r is not null),
      'conversas_meta', (select coalesce(sum(tot), 0) from meta_tot))
  )
  where (select pode from ok);
$function$;

revoke all on function public.qualidade_leads_campanha(uuid, date, date) from public, anon;
grant execute on function public.qualidade_leads_campanha(uuid, date, date) to authenticated;
