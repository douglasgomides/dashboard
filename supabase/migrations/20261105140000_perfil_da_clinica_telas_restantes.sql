-- Perfil da clínica, parte 3: as telas que ainda contavam venda só pelo "ganho" do card (outcome = 'won') e
-- agendamento pelo nome da etapa. Com perfil (crm_perfil_etapa), seguem as regras das partes 1 e 2
-- (20261104100000, 20261105100000):
--   * venda = crm_perfil_vendas sem a cópia do robô. Onde a conta é "vendas do período" (jornada_funil,
--     jornada_resumo, receita_por_canal, receita_em_jogo, links_funil), uma por pessoa pela data da venda
--     (quando), valor = maior preço da pessoa. Onde a conta é por card (funil por campo, campanhas, qualidade dos
--     leads, SAP, relacionamento), o card é ganho quando é card de venda pelo perfil.
--   * agendado = papel da etapa de agendamento em diante (crm_papel_conta(papel, 'agendou')) ou card de venda;
--     perdido = etapa 'perdido'; compareceu = etapa de comparecimento em diante; etapa 'ignorar' e cópia saem.
--   * Sem perfil, NADA muda: papel null cai na regra antiga, crm_perfil_etapas/crm_perfil_vendas saem vazias em 2 ms
--     e, onde o filtro de data mudaria (vendas pelo dia da venda), há dois ramos (union all) e o ramo sem perfil
--     mantém exatamente o filtro de antes.
-- Desempenho: nada de função por card. O papel é juntado da CTE pe (crm_perfil_etapas, uma vez por chamada) e o
-- card de venda da CTE pvc/pv (crm_perfil_vendas, uma vez por chamada: ~180 ms na Dra. Lana, 22 mil cards);
-- crm_papel_conta é expressão pura (immutable), incorporada na consulta.
--
-- Cada função foi recriada a partir da definição em produção em 05/11/2026 (pg_get_functiondef), mesma assinatura,
-- retorno, SECURITY DEFINER, search_path e grants; as mudanças estão marcadas com "[perfil-da-clinica]".
-- Produção diferia do repositório em duas: jornada_resumo(uuid) em produção é a versão plpgsql completa (o
-- repositório tinha a versão que chama a de período, nunca aplicada) e crm_funil_por_campo(uuid, text) só sem
-- comentários. Vale a de produção.
--
-- Ficaram de fora:
--   * crm_etapas_para_analise: tela de admin para confirmar o resultado das etapas do flwchat (crm_etapa_resultado);
--     conta o outcome bruto de propósito, para a equipe decidir o mapeamento. Mudar pelo perfil seria circular.
--   * auditoria_comercial: só lê o resumo das conversas (IA); não usa venda nem etapa do CRM.
--   * links_funil(uuid, timestamptz): sobrecarga antiga, sem uso no app (a tela usa a de janela com p_antes_de).
--
-- Reversão: apagar as linhas de crm_perfil_etapa da conexão (volta ao comportamento anterior na hora). Para tirar o
-- mecanismo destas funções, recriá-las pela definição anterior (trechos marcados "[perfil-da-clinica]").

-- ------------------------------------------------------------ qualidade_leads_campanha(uuid, date, date)
CREATE OR REPLACE FUNCTION public.qualidade_leads_campanha(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  camp as (select campaign_id, name from meta_ads_campaigns where client_id = p_client),
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada (sem função por card).
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  leads as (
    select cl.id, cl.outcome, cl.pessoa_id, cl.provider, cl.occurred_at, coalesce(cps.status_name, '') etapa,
      pe.papel, pvc.lead_id is not null as venda_pf,
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
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client and cl.removido_na_origem is null and (select pode from ok)
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
  ),
  lq as (
    select l.*,
      -- [perfil-da-clinica] sem perfil (papel null), a regra antiga pelo nome da etapa; com perfil, pelo papel da etapa.
      case when l.papel is null then l.outcome = 'won' else l.venda_pf end as ganho,
      case when l.papel is null then
      (l.outcome = 'won' or (coalesce(l.outcome, 'open') <> 'lost' and l.etapa !~* '(perdid|desqualific|lost|n[ãa]o eleg|cemit)' and l.etapa ~* '((^|[^-])qualifica|negocia|proposta|or[cç]a|agend|consulta|reuni|realizad|venda|ganh|fechad|pagamento|interesse identificado|aguardando (decis|fechamento|reserva))'))
      else l.venda_pf or l.papel in ('em_atendimento', 'agendado', 'compareceu', 'venda', 'posvenda') end as avancou,
      case when l.papel is null then (l.outcome = 'won' or l.etapa ~* '(agendad|confirmad|realizad|compareceu)')
      else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou,
      case when l.papel is null then (l.outcome = 'lost' or l.etapa ~* '(perdid|desqualific|lost|n[ãa]o eleg)')
      else public.crm_papel_conta(l.papel, 'perdido') end as perdeu
    from leads l
  ),
  gasto as (
    select campaign_id, sum(spend) g, sum(conversations) cv from meta_ads_daily
    where client_id = p_client and date between p_de and p_ate and (select pode from ok) group by 1
  ),
  direto as (
    select l.campaign_id, count(*) leads, count(*) filter (where avancou) avancaram, count(*) filter (where agendou) agendaram,
      count(*) filter (where ganho) ganhos, count(*) filter (where perdeu) perdidos
    from lq l where l.campaign_id is not null and (l.occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    group by 1
  ),
  conv as (
    select c.id, (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date dia, c.lead_id, c.pessoa_id
    from conversas c join mensagens m on m.conversa_id = c.id and m.direcao = 'entrada'
    where c.client_id = p_client and (select pode from ok)
    group by c.id
    having (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  lq_pessoa as (
    select distinct on (pessoa_id) pessoa_id, avancou, agendou, ganho from lq where pessoa_id is not null order by pessoa_id, occurred_at desc
  ),
  conv_lead as (
    select cv.*, coalesce(
      case when l1.id is not null then row(l1.avancou, l1.agendou, l1.ganho)::text end,
      case when lp.pessoa_id is not null then row(lp.avancou, lp.agendou, lp.ganho)::text end) as r
    from conv cv
    left join lq l1 on l1.id = cv.lead_id
    left join lq_pessoa lp on lp.pessoa_id = cv.pessoa_id
  ),
  dia_conv as (select dia, count(*) n from conv group by dia),
  dia_lead as (
    select dia,
      count(*) filter (where r is not null) com_lead,
      count(*) filter (where r like '(t,%') avancaram,
      count(*) filter (where r like '(%,t,%') agendaram,
      count(*) filter (where r like '%,t)') ganhos
    from conv_lead group by dia
  ),
  meta_dia as (
    select date dia, campaign_id, sum(conversations) cv from meta_ads_daily
    where client_id = p_client and date between p_de and p_ate and conversations > 0 and (select pode from ok) group by 1, 2
  ),
  meta_tot as (select dia, sum(cv) tot from meta_dia group by 1),
  peso as (
    select md.dia, md.campaign_id, md.cv, dc.n,
      least(md.cv::numeric / nullif(dc.n, 0), md.cv::numeric / nullif(mt.tot, 0)) as w
    from meta_dia md join meta_tot mt on mt.dia = md.dia join dia_conv dc on dc.dia = md.dia
  ),
  estimado as (
    select p.campaign_id,
      sum(p.cv) conversas_meta,
      round(sum(p.w * p.n), 1) conversas_atribuidas,
      round(sum(p.w * coalesce(dl.com_lead, 0)), 1) com_lead,
      round(sum(p.w * coalesce(dl.avancaram, 0)), 1) avancaram,
      round(sum(p.w * coalesce(dl.agendaram, 0)), 1) agendaram,
      round(sum(p.w * coalesce(dl.ganhos, 0)), 1) ganhos
    from peso p left join dia_lead dl on dl.dia = p.dia group by 1
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
grant execute on function public.qualidade_leads_campanha(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ campanhas_base(uuid)
CREATE OR REPLACE FUNCTION public.campanhas_base(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client_id) v),
  l as (
    select cl.outcome, cl.occurred_at, coalesce(cps.status_name, '') etapa, coalesce(cl.chave_pessoa, cl.pessoa_id::text, cl.id::text) as pessoa,
      public.lead_ultima_movimentacao(cl.provider, cl.raw_payload, cl.occurred_at) as m,
      pe.papel, pvc.lead_id is not null as venda_pf, pvc.quando as quando_venda
    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id and cc.active
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and (select pode from ok)
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
  ),
  lp as (select l.*, max(m) over (partition by pessoa) as mp,
    -- [perfil-da-clinica] sem perfil (papel null), a regra antiga; com perfil, venda = card de venda pelo perfil (data = a da venda),
    -- perdido = etapa 'perdido', agendado = etapa de agendamento em diante, e card de venda não é "aberto".
    case when l.papel is null then coalesce(l.outcome, 'open') = 'open'
         else coalesce(l.outcome, 'open') = 'open' and not l.venda_pf and l.papel <> 'perdido' end as aberto,
    case when l.papel is null then l.outcome = 'won' else l.venda_pf end as ganho,
    case when l.papel is null then l.m else coalesce(l.quando_venda, l.m) end as m_ganho,
    coalesce(public.crm_papel_conta(l.papel, 'perdido'), l.outcome = 'lost') as perdido,
    case when l.papel is null then (l.outcome = 'won' or l.etapa ~* '(agendad|confirmad|realizad|compareceu)')
         else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou
    from l)
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_crm', exists (select 1 from crm_connections where client_id = p_client_id and active),
    'abertos', count(distinct pessoa) filter (where aberto),
    'parados_90d', count(distinct pessoa) filter (where aberto and mp < now() - interval '90 days'),
    'parados_30_90d', count(distinct pessoa) filter (where aberto and mp < now() - interval '30 days' and mp >= now() - interval '90 days'),
    'novos_parados_14d', count(distinct pessoa) filter (where aberto and occurred_at >= now() - interval '45 days' and mp < now() - interval '14 days'),
    'ganhos_ha_um_ano', count(distinct pessoa) filter (where ganho and m_ganho between now() - interval '13 months' and now() - interval '11 months'),
    'perdidos_180d', count(distinct pessoa) filter (where perdido and m >= now() - interval '180 days'),
    'leads_90d', count(distinct pessoa) filter (where occurred_at >= now() - interval '90 days'),
    'agendados_90d', count(distinct pessoa) filter (where occurred_at >= now() - interval '90 days' and agendou),
    'ganhos_90d', count(distinct pessoa) filter (where occurred_at >= now() - interval '90 days' and ganho)
  ) end
  from lp;
$function$;
revoke all on function public.campanhas_base(uuid) from public, anon;
grant execute on function public.campanhas_base(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ relacionamento_pessoas(uuid, uuid[])
CREATE OR REPLACE FUNCTION public.relacionamento_pessoas(p_client uuid, p_pessoas uuid[])
 RETURNS TABLE(pessoa_id uuid, ja_paciente boolean, compras integer, ultima_compra date, conversou_antes boolean, primeiro_contato date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and cardinality(p_pessoas) <= 100 as pode),
  alvo as (select distinct unnest(p_pessoas) as id where (select pode from ok)),
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  vendas as (
    -- [perfil-da-clinica] com perfil: compra = card de venda pelo perfil (sem a cópia do robô; data = a da venda),
    -- compareceu = etapa de comparecimento em diante. Sem perfil (papel null), a regra antiga.
    select l.pessoa_id, count(*) filter (where case when pe.papel is null then l.outcome = 'won' else pvc.lead_id is not null end) as compras,
      max(case when pe.papel is null then coalesce(l.occurred_at, l.received_at) else pvc.quando end)
        filter (where case when pe.papel is null then l.outcome = 'won' else pvc.lead_id is not null end) as ultima,
      bool_or(coalesce(public.crm_papel_conta(pe.papel, 'compareceu'), coalesce(cps.status_name, '') ~* '(realizad|compareceu|atendid)')) as compareceu
    from crm_leads l
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    left join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
    left join pvc on pvc.lead_id = l.id
    where l.client_id = p_client and l.pessoa_id in (select id from alvo) and l.removido_na_origem is null
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
    group by 1
  ),
  conversas_p as (
    select c.pessoa_id, min(c.iniciada_em) as primeira
    from conversas c where c.client_id = p_client and c.pessoa_id in (select id from alvo)
    group by 1
  )
  select a.id,
    coalesce(v.compras, 0) > 0 or coalesce(v.compareceu, false),
    coalesce(v.compras, 0)::integer,
    (v.ultima at time zone 'America/Sao_Paulo')::date,
    coalesce(cp.primeira < now() - interval '30 days', false),
    (cp.primeira at time zone 'America/Sao_Paulo')::date
  from alvo a left join vendas v on v.pessoa_id = a.id left join conversas_p cp on cp.pessoa_id = a.id;
$function$;
revoke all on function public.relacionamento_pessoas(uuid, uuid[]) from public, anon;
grant execute on function public.relacionamento_pessoas(uuid, uuid[]) to authenticated, service_role;

-- ------------------------------------------------------------ crm_funil_por_campo(uuid, text)
CREATE OR REPLACE FUNCTION public.crm_funil_por_campo(p_client_id uuid, p_field_name_pattern text)
 RETURNS TABLE(chave text, total bigint, ganhos bigint, perdidos bigint, abertos bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  with pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client_id) v),
  leads as (
    select cl.outcome, pe.papel, pvc.lead_id is not null as venda_pf,
      coalesce(
        (
          select v->>'value'
          from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
               jsonb_array_elements(f->'values') v
          where f->>'field_name' ilike p_field_name_pattern
            and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
          limit 1
        ),
        case when p_field_name_pattern ~* '(fonte|origem|source)' then
          case when cl.provider <> 'kommo' then cl.source else public.crm_origem_classifica(cl.source) end end,
        'Não informado'
      ) as chave
    from (select * from public.crm_leads_do_cliente(p_client_id) crm_leads where removido_na_origem is null) cl
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client_id
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select chave, count(*) as total,
    -- [perfil-da-clinica] sem perfil (papel null), pelo resultado do card; com perfil, card de venda pelo perfil e etapa 'perdido'.
    count(*) filter (where case when papel is null then outcome = 'won' else venda_pf end) as ganhos,
    count(*) filter (where coalesce(public.crm_papel_conta(papel, 'perdido'), outcome = 'lost')) as perdidos,
    count(*) filter (where case when papel is null then coalesce(outcome, 'open') = 'open'
                           else coalesce(outcome, 'open') = 'open' and not venda_pf and papel <> 'perdido' end) as abertos
  from leads
  group by chave
  order by total desc;
$function$;
revoke all on function public.crm_funil_por_campo(uuid, text) from public, anon;
grant execute on function public.crm_funil_por_campo(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------ crm_funil_por_campo_periodo(uuid, text, date, date)
CREATE OR REPLACE FUNCTION public.crm_funil_por_campo_periodo(p_client_id uuid, p_field_name_pattern text, p_from date, p_to date)
 RETURNS TABLE(chave text, total bigint, ganhos bigint, perdidos bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  with pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client_id) v),
  leads as (
    select cl.outcome, pe.papel, pvc.lead_id is not null as venda_pf,
      coalesce(
        (
          select v->>'value'
          from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f,
               jsonb_array_elements(f->'values') v
          where f->>'field_name' ilike p_field_name_pattern
            and jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
          limit 1
        ),
        case when p_field_name_pattern ~* '(fonte|origem|source)' then
          case when cl.provider <> 'kommo' then cl.source else public.crm_origem_classifica(cl.source) end end,
        'Não informado'
      ) as chave
    from public.crm_leads_do_cliente(p_client_id) cl
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client_id
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
      and cl.removido_na_origem is null
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select chave, count(*) as total,
    -- [perfil-da-clinica] sem perfil (papel null), pelo resultado do card; com perfil, card de venda pelo perfil e etapa 'perdido'.
    count(*) filter (where case when papel is null then outcome = 'won' else venda_pf end) as ganhos,
    count(*) filter (where coalesce(public.crm_papel_conta(papel, 'perdido'), outcome = 'lost')) as perdidos
  from leads
  group by chave
  order by total desc;
$function$;
revoke all on function public.crm_funil_por_campo_periodo(uuid, text, date, date) from public, anon;
grant execute on function public.crm_funil_por_campo_periodo(uuid, text, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ jornada_funil(uuid, date, date)
CREATE OR REPLACE FUNCTION public.jornada_funil(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço), sem a cópia do robô;
  -- agendado = etapa de agendamento em diante (ou card de venda); etapa 'ignorar' e cópia saem dos leads.
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                         where c.client_id = p_client) as sim),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  pv as (select v.pessoa, max(v.price) as price from pvc v
          where (select sim from tem) and (select pode from ok) and not v.copia
            and (v.quando at time zone 'America/Sao_Paulo')::date between p_de and p_ate
          group by v.pessoa),
  ig as (
    select coalesce(sum(reach), 0) alcance, count(*) filter (where reach is not null) dias_alcance,
      coalesce(sum(coalesce(total_interactions, coalesce(likes,0) + coalesce(comments,0) + coalesce(saves,0) + coalesce(shares,0))), 0) interacoes,
      count(*) filter (where total_interactions is not null or likes is not null) dias_interacoes
    from instagram_account_daily_metrics
    where client_id = p_client and date between p_de and p_ate and (select pode from ok)
  ),
  com as (
    select count(*) comentarios, count(distinct lower(author_username)) comentaristas
    from instagram_comments
    where client_id = p_client and (commented_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate and (select pode from ok)
  ),
  conv as (
    select count(*) conversas from public.conversas_do_cliente(p_client) conversas
    where client_id = p_client and (iniciada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and (select pode from ok)
  ),
  leads as (
    select cl.outcome, cl.price, coalesce(cps.status_name, '') etapa, pe.papel, pvc.lead_id is not null as venda_pf
    from public.crm_leads_do_cliente(p_client) cl
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client and cl.removido_na_origem is null and (select pode from ok)
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
      and (coalesce(cl.occurred_at, cl.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  crm as (
    select count(*) leads,
      count(*) filter (where etapa <> '') com_etapa,
      count(*) filter (where case when papel is null then outcome = 'won' or etapa ~* '(agendad|confirmad|realizad|compareceu)'
                                  else venda_pf or public.crm_papel_conta(papel, 'agendou') end) agendados,
      case when (select sim from tem) then (select count(*) from pv) else count(*) filter (where outcome = 'won') end vendas,
      case when (select sim from tem) then coalesce((select sum(price) from pv), 0)
           else coalesce(sum(price) filter (where outcome = 'won'), 0) end receita
    from leads
  ),
  fontes as (
    select
      exists (select 1 from instagram_accounts where client_id = p_client and active) tem_instagram,
      exists (select 1 from instagram_comments where client_id = p_client) tem_comentarios,
      exists (select 1 from clients where id = p_client and wts_company_id is not null) tem_whatsapp,
      exists (select 1 from public.conversas_do_cliente(p_client) conversas where client_id = p_client) tem_conversas,
      exists (select 1 from crm_connections where client_id = p_client and active) tem_crm,
      exists (select 1 from crm_pipeline_statuses s join crm_connections x on x.id = s.crm_connection_id
              where x.client_id = p_client and x.active and s.status_name ~* '(agend|consulta|confirmad|realizad|compareceu)')
        or exists (select 1 from pe where pe.papel in ('agendado', 'compareceu')) tem_etapa_agendamento,
      exists (select 1 from public.crm_leads_do_cliente(p_client) crm_leads where client_id = p_client and outcome = 'won')
        or exists (select 1 from pvc where not pvc.copia) tem_venda_registrada,
      (select provider from crm_connections where client_id = p_client and active order by created_at desc limit 1) crm_provider
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'alcance', ig.alcance, 'dias_alcance', ig.dias_alcance,
    'interacoes', ig.interacoes, 'dias_interacoes', ig.dias_interacoes,
    'comentarios', com.comentarios, 'comentaristas', com.comentaristas,
    'conversas', conv.conversas,
    'leads', crm.leads, 'leads_com_etapa', crm.com_etapa, 'agendados', crm.agendados, 'vendas', crm.vendas, 'receita', crm.receita,
    'dias_periodo', (p_ate - p_de) + 1,
    'fontes', to_jsonb(fontes)
  ) end
  from ig, com, conv, crm, fontes;
$function$;
revoke all on function public.jornada_funil(uuid, date, date) from public, anon;
grant execute on function public.jornada_funil(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ jornada_resumo(uuid, date, date)
CREATE OR REPLACE FUNCTION public.jornada_resumo(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    return null;
  end if;
  with
  lv as (select * from public.crm_leads_do_cliente(p_client) crm_leads where client_id = p_client and removido_na_origem is null),
  -- [perfil-da-clinica] com perfil: venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço), sem a cópia do robô;
  -- etapa 'ignorar' e cópia saem dos leads do período. Sem perfil (tem = false, papel null), tudo como antes.
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                         where c.client_id = p_client) as sim),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  pv as (select substr(v.pessoa, 3)::uuid as pessoa_id, max(v.price) as price from pvc v
          where (select sim from tem) and not v.copia and v.pessoa like 'p:%'
            and (v.quando at time zone 'America/Sao_Paulo')::date between p_de and p_ate
          group by 1),
  lp as (select lv.*, case when pe.papel is null then lv.outcome = 'won' else pvc.lead_id is not null end as ganho_pf
           from lv
           left join pe on pe.crm_connection_id = lv.crm_connection_id and pe.pipeline_id = lv.pipeline_id and pe.status_id = lv.status_id
           left join pvc on pvc.lead_id = lv.id
          where (coalesce(lv.occurred_at, lv.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
            and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)),
  tq as (select * from public.toques where client_id = p_client and (ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  com as (select distinct pessoa_id from tq where tipo = 'comentario' and pessoa_id is not null),
  conv as (select distinct pessoa_id from public.conversas_do_cliente(p_client) c where client_id = p_client and pessoa_id is not null
           and (iniciada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
           and exists (select 1 from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client)),
  ld as (select pessoa_id, bool_or(outcome = 'won') ganhou, sum(case when outcome = 'won' then coalesce(price,0) else 0 end) receita
         from lp where pessoa_id is not null and not (select sim from tem) group by pessoa_id
         union all
         -- [perfil-da-clinica] com perfil: quem teve card no período ou comprou no período (pela data da venda).
         select y.pessoa_id, bool_or(y.ganhou), coalesce(max(y.receita), 0) from (
           select lp.pessoa_id, false as ganhou, null::numeric as receita from lp where lp.pessoa_id is not null
           union all
           select pv.pessoa_id, true, coalesce(pv.price, 0) from pv) y
         where (select sim from tem) group by y.pessoa_id),
  p as (select pessoa_id from com union select pessoa_id from conv union select pessoa_id from ld),
  origem as (
    select coalesce(nullif(source,''), 'Sem origem informada') o, count(*) leads,
           count(*) filter (where ganho_pf) ganhos,
           coalesce(sum(price) filter (where ganho_pf),0) receita
    from lp group by 1 order by 2 desc limit 12),
  posts as (
    select ip.id, ip.permalink, ip.thumbnail_url, left(ip.caption,120) legenda, ip.posted_at, ip.funnel_stage,
           count(distinct t.pessoa_id) comentaristas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from (select distinct instagram_post_id, pessoa_id from tq where tipo = 'comentario') t
    join public.instagram_posts ip on ip.id = t.instagram_post_id and ip.client_id = p_client
    left join ld on ld.pessoa_id = t.pessoa_id
    group by ip.id order by 7 desc, 8 desc limit 10),
  links as (
    select l.id, l.titulo, l.tipo,
           coalesce(l.short_url, case when l.slug is not null then '/r/' || l.slug end) short_url,
           case when l.slug is not null then (select count(*) from public.link_cliques k where k.link_id = l.id
             and (k.em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) else l.cliques_total end cliques_total,
           count(distinct t.pessoa_id) conversas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from public.links_rastreados l
    left join (select distinct link_id, pessoa_id from tq) t on t.link_id = l.id
    left join ld on ld.pessoa_id = t.pessoa_id
    where l.client_id = p_client group by l.id order by l.criado_em desc limit 20)
  select jsonb_build_object(
    'pessoas', (select count(*) from p),
    'comentaram', (select count(*) from com),
    'conversaram', (select count(*) from conv),
    'viraram_lead', (select count(*) from ld),
    'ganhos', (select count(*) from ld where ganhou),
    'receita', (select coalesce(sum(receita),0) from ld),
    'leads_total', (select count(*) from lp),
    'leads_sem_pessoa', (select count(*) from lp where pessoa_id is null),
    'comentaram_e_lead', (select count(*) from com join ld using (pessoa_id)),
    'conversaram_e_lead', (select count(*) from conv join ld on ld.pessoa_id = conv.pessoa_id),
    'comentaram_e_conversaram', (select count(*) from com join conv using (pessoa_id)),
    'por_origem', coalesce((select jsonb_agg(to_jsonb(origem)) from origem), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(posts)) from posts), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(links)) from links), '[]'::jsonb),
    'escopo', jsonb_build_object(
      'de', p_de, 'ate', p_ate,
      'leads_base_toda', (select count(*) from lv),
      'leads_removidos_na_origem', (select count(*) from public.crm_leads_do_cliente(p_client) crm_leads where client_id = p_client and removido_na_origem is not null)
    )
  ) into r;
  return r;
end;
$function$;
revoke all on function public.jornada_resumo(uuid, date, date) from public, anon;
grant execute on function public.jornada_resumo(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ jornada_resumo(uuid)
CREATE OR REPLACE FUNCTION public.jornada_resumo(p_client uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    return null;
  end if;
  with p as (select id from public.pessoas where client_id = p_client),
  -- [perfil-da-clinica] com perfil: venda = crm_perfil_vendas (uma por pessoa; valor = maior preço), sem a cópia do robô;
  -- etapa 'ignorar' e cópia saem da conta por origem. Sem perfil (tem = false, papel null), tudo como antes.
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                         where c.client_id = p_client) as sim),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  pv as (select substr(v.pessoa, 3)::uuid as pessoa_id, max(v.price) as price from pvc v
          where (select sim from tem) and not v.copia and v.pessoa like 'p:%' group by 1),
  com as (select distinct pessoa_id from public.toques where client_id = p_client and tipo = 'comentario'),
  conv as (select distinct pessoa_id from public.conversas where client_id = p_client and pessoa_id is not null and exists (select 1 from public.mensagens m where m.conversa_id = conversas.id)),
  ld as (select pessoa_id, bool_or(outcome = 'won') ganhou, sum(case when outcome = 'won' then coalesce(price,0) else 0 end) receita from public.crm_leads where client_id = p_client and removido_na_origem is null and pessoa_id is not null and not (select sim from tem) group by pessoa_id
         union all
         select y.pessoa_id, bool_or(y.ganhou), coalesce(max(y.receita), 0) from (
           select l.pessoa_id, false as ganhou, null::numeric as receita from public.crm_leads l
             left join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
             left join pvc on pvc.lead_id = l.id
            where l.client_id = p_client and l.removido_na_origem is null and l.pessoa_id is not null
              and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
           union all
           select pv.pessoa_id, true, coalesce(pv.price, 0) from pv) y
         where (select sim from tem) group by y.pessoa_id),
  origem as (
    select coalesce(nullif(source,''), 'Sem origem informada') o, count(*) leads,
           count(*) filter (where ganho_pf) ganhos,
           coalesce(sum(price) filter (where ganho_pf),0) receita
    from (select l.*, case when pe.papel is null then l.outcome = 'won' else pvc.lead_id is not null end as ganho_pf
            from public.crm_leads l
            left join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
            left join pvc on pvc.lead_id = l.id
           where l.client_id = p_client and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)) crm_leads
    where client_id = p_client and removido_na_origem is null group by 1 order by 2 desc limit 12),
  posts as (
    select ip.id, ip.permalink, ip.thumbnail_url, left(ip.caption,120) legenda, ip.posted_at, ip.funnel_stage,
           count(distinct t.pessoa_id) comentaristas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from public.toques t
    join public.instagram_posts ip on ip.id = t.instagram_post_id
    left join ld on ld.pessoa_id = t.pessoa_id
    where t.client_id = p_client and t.tipo = 'comentario'
    group by ip.id order by 3 desc, 2 desc limit 10),
  links as (
    select l.id, l.titulo, l.tipo, l.short_url, l.cliques_total,
           count(distinct t.pessoa_id) conversas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from public.links_rastreados l
    left join public.toques t on t.link_id = l.id
    left join ld on ld.pessoa_id = t.pessoa_id
    where l.client_id = p_client group by l.id order by l.criado_em desc limit 20)
  select jsonb_build_object(
    'pessoas', (select count(*) from p),
    'comentaram', (select count(*) from com),
    'conversaram', (select count(*) from conv),
    'viraram_lead', (select count(*) from ld),
    'ganhos', (select count(*) from ld where ganhou),
    'receita', (select coalesce(sum(receita),0) from ld),
    'leads_total', (select count(*) from public.crm_leads where client_id = p_client and removido_na_origem is null),
    'leads_sem_pessoa', (select count(*) from public.crm_leads where client_id = p_client and removido_na_origem is null and pessoa_id is null),
    'comentaram_e_lead', (select count(*) from com join ld using (pessoa_id)),
    'conversaram_e_lead', (select count(*) from conv join ld on ld.pessoa_id = conv.pessoa_id),
    'comentaram_e_conversaram', (select count(*) from com join conv using (pessoa_id)),
    'por_origem', coalesce((select jsonb_agg(to_jsonb(origem)) from origem), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(posts)) from posts), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(links)) from links), '[]'::jsonb)
  ) into r;
  return r;
end;
$function$;
revoke all on function public.jornada_resumo(uuid) from public, anon;
grant execute on function public.jornada_resumo(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ conteudo_comercial(uuid, date, date)
CREATE OR REPLACE FUNCTION public.conteudo_comercial(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and p_ate >= p_de and p_ate - p_de <= 120 as pode),
  janela as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini, ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  posts as (
    select (p.posted_at at time zone 'America/Sao_Paulo') as ts, nullif(btrim(p.tema), '') as tema, p.funnel_stage as etapa, coalesce(p.reach, 0) as alcance
    from instagram_posts p, janela j
    where p.client_id = p_client and p.removido_em is null and p.posted_at >= j.ini and p.posted_at < j.fim and (select pode from ok)
  ),
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  conv as (
    select (c.iniciada_em at time zone 'America/Sao_Paulo') as ts, coalesce(c.pessoa_id::text, l.chave_pessoa, l.pessoa_id::text, c.lead_id::text, c.id::text) as pessoa,
      t.conversa_id is not null as lida, coalesce(t.sem_texto, false) as sem_texto, t.tema, lower(btrim(t.assunto)) as assunto,
      coalesce(t.objecoes, '{}') as objecoes, coalesce(t.preco_pedido, false) as preco,
      coalesce(t.comercial, (r.resumo->>'comercial')::boolean, true) as comercial,
      (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou'
        -- [perfil-da-clinica] com perfil, pelo papel da etapa do card (ou card de venda); sem perfil (papel null), pelo nome.
        or case when pe.papel is null then l.outcome = 'won' or coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)'
                else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou
    from conversas c
    cross join janela j
    left join conversas_tema t on t.conversa_id = c.id
    left join conversas_resumos r on r.conversa_id = c.id
    left join crm_leads l on l.id = c.lead_id and l.removido_na_origem is null
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    left join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
    left join pvc on pvc.lead_id = l.id
    where c.client_id = p_client and c.ultima_msg_em >= j.ini and c.iniciada_em >= j.ini and c.iniciada_em < j.fim and (select pode from ok)
  ),
  dias as (select generate_series(p_de, p_ate, interval '1 day')::date as dia where (select pode from ok)),
  por_dia as (
    select d.dia,
      (select count(*) from posts p where p.ts::date = d.dia) as posts,
      (select coalesce(sum(alcance), 0) from posts p where p.ts::date = d.dia) as alcance,
      (select count(*) from conv c where c.ts::date = d.dia) as conversas,
      (select count(*) from conv c where c.ts::date = d.dia and c.comercial) as comerciais,
      (select count(*) from conv c where c.ts::date = d.dia and c.agendou) as agendaram
    from dias d
  ),
  efeito as (
    select
      count(*) filter (where posts > 0) as dias_com_post,
      round(avg(conversas) filter (where posts > 0), 1) as media_com_post,
      count(*) filter (where posts = 0) as dias_sem_post,
      round(avg(conversas) filter (where posts = 0), 1) as media_sem_post,
      round(avg(prox) filter (where posts > 0), 1) as media_dia_seguinte_com_post,
      round(avg(prox) filter (where posts = 0), 1) as media_dia_seguinte_sem_post
    from (select posts, conversas, lead(conversas) over (order by dia) as prox from por_dia) x
  ),
  grade as (
    select dow, hora, sum(np) as posts, sum(nc) as conversas, sum(na) as agendaram from (
      select extract(dow from ts)::int dow, extract(hour from ts)::int hora, 1 np, 0 nc, 0 na from posts
      union all
      select extract(dow from ts)::int, extract(hour from ts)::int, 0, 1, case when agendou then 1 else 0 end from conv
    ) g group by 1, 2
  ),
  temas_linhas as (
    select public.tema_chave(tema) as chave, tema, null::text as pessoa, 1 np, alcance alc, 0 nc, 0 ncom, 0 npr, 0 na from posts where tema is not null
    union all
    select public.tema_chave(tema), btrim(tema), pessoa, 0, 0, 1, case when comercial then 1 else 0 end, case when preco then 1 else 0 end, case when agendou then 1 else 0 end from conv where tema is not null
  ),
  temas_rotulo as (
    select distinct on (chave) chave, tema from (select chave, tema, count(*) as n from temas_linhas where chave <> '' group by 1, 2) x
    order by chave, n desc, octet_length(tema) desc, tema
  ),
  temas as (
    select r.tema,
      sum(np) as posts, sum(alc) as alcance, sum(nc) as conversas, count(distinct t.pessoa) filter (where nc = 1) as pessoas,
      sum(ncom) as comerciais, sum(npr) as pediram_preco, sum(na) as agendaram, count(distinct t.pessoa) filter (where na = 1) as pessoas_agendaram
    from temas_linhas t join temas_rotulo r on r.chave = t.chave
    group by r.chave, r.tema
  ),
  semana_posts as (
    select date_trunc('week', ts)::date as semana,
      count(*) filter (where etapa = 'C0') c0, count(*) filter (where etapa = 'C1') c1,
      count(*) filter (where etapa = 'C2') c2, count(*) filter (where etapa = 'C3') c3
    from posts group by 1
  ),
  semanas as (
    select d.semana, coalesce(sp.c0, 0) c0, coalesce(sp.c1, 0) c1, coalesce(sp.c2, 0) c2, coalesce(sp.c3, 0) c3, d.conversas, d.agendaram
    from (select date_trunc('week', dia)::date as semana, sum(conversas) conversas, sum(agendaram) agendaram from por_dia group by 1) d
    left join semana_posts sp on sp.semana = d.semana
  ),
  objecoes as (select o as objecao, count(*) n, count(*) filter (where agendou) agendaram, count(distinct pessoa) pessoas, count(distinct pessoa) filter (where agendou) pessoas_agendaram from conv, unnest(objecoes) o group by 1),
  assuntos as (select assunto, count(*) n, count(*) filter (where agendou) agendaram from conv where assunto is not null group by 1 order by 2 desc limit 15)
  select jsonb_build_object(
    'dias', coalesce((select jsonb_agg(to_jsonb(d) order by d.dia) from por_dia d), '[]'),
    'efeito_post', (select to_jsonb(e) from efeito e),
    -- [perfil-da-clinica] ordem fixa (antes dependia do plano da consulta).
    'grade', coalesce((select jsonb_agg(to_jsonb(g) order by g.dow, g.hora) from grade g), '[]'),
    'temas', coalesce((select jsonb_agg(to_jsonb(t) order by t.conversas desc, t.posts desc) from temas t), '[]'),
    'semanas', coalesce((select jsonb_agg(to_jsonb(s) order by s.semana) from semanas s), '[]'),
    'objecoes', coalesce((select jsonb_agg(to_jsonb(o) order by o.n desc) from objecoes o), '[]'),
    'assuntos', coalesce((select jsonb_agg(to_jsonb(a) order by a.n desc) from assuntos a), '[]'),
    'cobertura', jsonb_build_object(
      'conversas', (select count(*) from conv), 'pessoas', (select count(distinct pessoa) from conv), 'pessoas_agendaram', (select count(distinct pessoa) filter (where agendou) from conv),
      'lidas', (select count(*) from conv where lida and not sem_texto),
      'sem_texto', (select count(*) from conv where sem_texto),
      'com_tema', (select count(*) from conv where tema is not null),
      'posts', (select count(*) from posts),
      'posts_com_tema', (select count(*) from posts where tema is not null))
  )
  where (select pode from ok);
$function$;
revoke all on function public.conteudo_comercial(uuid, date, date) from public, anon;
grant execute on function public.conteudo_comercial(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ conteudo_comercial_profundo(uuid, date, date)
CREATE OR REPLACE FUNCTION public.conteudo_comercial_profundo(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and p_ate >= p_de and p_ate - p_de <= 120 as pode),
  janela as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini, ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  donos as (select lower(ig_username) u from instagram_accounts where client_id = p_client and ig_username is not null),
  coment as (
    select c.instagram_post_id as post_id,
      translate(lower(c.text), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as t,
      translate(lower(coalesce(pc.caption, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as legenda
    from instagram_comments c
    cross join janela j
    left join instagram_posts pc on pc.id = c.instagram_post_id
    where c.client_id = p_client and c.commented_at >= j.ini and c.commented_at < j.fim and (select pode from ok)
      and coalesce(lower(c.author_username), '') not in (select u from donos)
  ),
  coment_class as (
    select post_id,
      t ~ '(preco|valor|quanto (custa|e|fica|sai|cobra|esta)|qnto|qto|orcamento|\$)' as preco,
      t ~ '(agend|marcar|consulta|horario|vaga|atende (dia|quando))' as agendar,
      t ~ '(endereco|onde fica|onde (voce|vc) atende|qual cidade|atende em|atende na|atende no)' as onde,
      t ~ '(convenio|plano de saude|unimed|amil|sulamerica|bradesco saude|reembolso)' as convenio,
      t ~ '(whats|telefone|contato|numero|link|direct|dm\M|chama|me chama)' as contato,
      (btrim(t) ~ '^[a-z]{2,24}$' and legenda ~ ('coment[ae]r?\W+(a palavra\W+)?' || btrim(t) || '\M')) as palavra
    from coment
  ),
  por_post as (
    select post_id, count(*) as comentarios,
      count(*) filter (where preco or agendar or onde or convenio or contato or palavra) as compra, count(*) filter (where palavra) as palavra,
      count(*) filter (where preco) as preco, count(*) filter (where agendar) as agendar,
      count(*) filter (where onde) as onde, count(*) filter (where convenio) as convenio, count(*) filter (where contato) as contato
    from coment_class group by 1
  ),
  posts_compra as (
    select pp.*, p.permalink, p.thumbnail_url, left(coalesce(p.caption, ''), 140) as legenda, nullif(btrim(p.tema), '') as tema,
      coalesce(p.format, p.media_type) as formato, p.funnel_stage as etapa, p.posted_at, coalesce(p.reach, 0) as alcance
    from por_post pp join instagram_posts p on p.id = pp.post_id and p.client_id = p_client and p.removido_em is null
    where pp.compra > 0
  ),
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client) v),
  conv as (
    select c.id, nullif(btrim(t.tema), '') as tema, c.iniciada_em, l.id as lead_id,
      -- [perfil-da-clinica] com perfil, ganho = card de venda pelo perfil e perdido = etapa 'perdido'; etapa 'ignorar' não conta.
      case when pe.papel is null then l.outcome when pe.papel = 'ignorar' then null when pvc.lead_id is not null then 'won'
           when pe.papel = 'perdido' or l.outcome = 'lost' then 'lost' else 'open' end as outcome,
      l.price,
      (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou'
        -- [perfil-da-clinica] com perfil, pelo papel da etapa do card (ou card de venda); sem perfil (papel null), pelo nome.
        or case when pe.papel is null then l.outcome = 'won' or coalesce(cps.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)'
                else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou
    from conversas c
    cross join janela j
    left join conversas_tema t on t.conversa_id = c.id
    left join conversas_resumos r on r.conversa_id = c.id
    left join crm_leads l on l.id = c.lead_id and l.removido_na_origem is null
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    left join pe on pe.crm_connection_id = l.crm_connection_id and pe.pipeline_id = l.pipeline_id and pe.status_id = l.status_id
    left join pvc on pvc.lead_id = l.id
    where c.client_id = p_client and c.iniciada_em >= j.ini and c.iniciada_em < j.fim and (select pode from ok)
  ),
  temas_valor as (
    select tema, count(*) as conversas, count(lead_id) as com_lead,
      count(*) filter (where outcome = 'won') as ganhos, count(*) filter (where outcome = 'lost') as perdidos,
      count(*) filter (where outcome = 'won' and price > 0) as ganhos_com_valor,
      coalesce(sum(price) filter (where outcome = 'won' and price > 0), 0) as receita
    from conv where tema is not null group by 1
  ),
  primeira as (
    select cv.id, cv.tema, cv.agendou, e.em as entrada,
      (select min(s.enviada_em) from mensagens s
        where s.conversa_id = cv.id and s.direcao = 'saida' and s.enviada_em > e.em
          and coalesce(s.autor, '') <> 'Robô' and coalesce(s.tipo, '') not in ('kommo_robo', 'sistema')) as resposta
    from conv cv
    cross join lateral (select min(m.enviada_em) em from mensagens m where m.conversa_id = cv.id and m.direcao = 'entrada') e
    where e.em is not null
  ),
  resp as (
    select tema, agendou,
      case
        when resposta is null then '5_sem_resposta'
        when resposta - entrada <= interval '15 minutes' then '1_ate_15min'
        when resposta - entrada <= interval '1 hour' then '2_15_a_60min'
        when resposta - entrada <= interval '4 hours' then '3_1_a_4h'
        else '4_mais_de_4h' end as faixa
    from primeira
    where (extract(isodow from entrada at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from entrada at time zone 'America/Sao_Paulo') between 8 and 17)
       or (extract(isodow from entrada at time zone 'America/Sao_Paulo') = 6 and extract(hour from entrada at time zone 'America/Sao_Paulo') between 8 and 11)
  )
  select jsonb_build_object(
    'posts_compra', coalesce((select jsonb_agg(to_jsonb(p) order by p.compra desc, p.comentarios desc) from (select * from posts_compra order by compra desc, comentarios desc limit 15) p), '[]'),
    'comentarios', jsonb_build_object(
      'total', (select count(*) from coment),
      'compra', (select count(*) from coment_class where preco or agendar or onde or convenio or contato or palavra),
      'palavra', (select count(*) from coment_class where palavra),
      'guardados_posts_periodo', (select count(*) from instagram_comments ic join instagram_posts ip on ip.id = ic.instagram_post_id cross join janela j
        where ip.client_id = p_client and ip.removido_em is null and ip.posted_at >= j.ini and ip.posted_at < j.fim and (select pode from ok)),
      'instagram_posts_periodo', (select coalesce(sum(ip.comments), 0) from instagram_posts ip cross join janela j
        where ip.client_id = p_client and ip.removido_em is null and ip.posted_at >= j.ini and ip.posted_at < j.fim and (select pode from ok)),
      'posts_com_compra', (select count(*) from posts_compra)),
    'compra_por_tema', coalesce((select jsonb_agg(to_jsonb(x) order by x.compra desc) from (
      select coalesce(tema, '') as tema, count(*) as posts, sum(compra) as compra, sum(comentarios) as comentarios from posts_compra group by 1) x), '[]'),
    'compra_por_formato', coalesce((select jsonb_agg(to_jsonb(x) order by x.compra desc) from (
      select coalesce(formato, '') as formato, count(*) as posts, sum(compra) as compra, sum(comentarios) as comentarios from posts_compra group by 1) x), '[]'),
    'temas_valor', coalesce((select jsonb_agg(to_jsonb(t) order by t.receita desc, t.ganhos desc) from temas_valor t), '[]'),
    'resposta', coalesce((select jsonb_agg(to_jsonb(x) order by x.faixa) from (
      select faixa, count(*) as conversas, count(*) filter (where agendou) as agendaram from resp group by 1) x), '[]'),
    'resposta_tema', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select tema, count(*) filter (where faixa in ('1_ate_15min', '2_15_a_60min')) as rapidas,
        count(*) filter (where faixa in ('1_ate_15min', '2_15_a_60min') and agendou) as rapidas_agendaram,
        count(*) filter (where faixa in ('3_1_a_4h', '4_mais_de_4h', '5_sem_resposta')) as lentas,
        count(*) filter (where faixa in ('3_1_a_4h', '4_mais_de_4h', '5_sem_resposta') and agendou) as lentas_agendaram
      from resp where tema is not null group by 1) x), '[]'),
    'cobertura', jsonb_build_object(
      'conversas', (select count(*) from conv),
      'com_lead', (select count(lead_id) from conv),
      'com_tema', (select count(*) from conv where tema is not null),
      'horario_comercial', (select count(*) from resp))
  )
  where (select pode from ok);
$function$;
revoke all on function public.conteudo_comercial_profundo(uuid, date, date) from public, anon;
grant execute on function public.conteudo_comercial_profundo(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ links_funil(uuid, timestamp with time zone, timestamp with time zone)
CREATE OR REPLACE FUNCTION public.links_funil(p_client_id uuid, p_desde timestamp with time zone, p_antes_de timestamp with time zone)
 RETURNS TABLE(link_id uuid, cliques bigint, conversas bigint, provaveis bigint, agendou bigint, vendas bigint, receita numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 -- [perfil-da-clinica] com perfil, venda = card de venda pelo perfil (sem a cópia do robô) com a venda dentro da janela.
 with tem as (select exists (select 1 from public.crm_perfil_etapa x join public.crm_connections c on c.id = x.crm_connection_id
                             where c.client_id = p_client_id) as sim),
 pv as materialized (select v.lead_id, v.quando from public.crm_perfil_vendas(p_client_id) v where not v.copia),
 ls as (
   select l.id from public.links_rastreados l where l.client_id=p_client_id
     and (public.is_app_admin() or public.is_client_member(p_client_id)) and p_antes_de>p_desde
 ), cl as (
   select k.link_id,count(*) n from public.link_cliques k join ls on ls.id=k.link_id
   where k.em>=p_desde and k.em<p_antes_de group by k.link_id
 ), cv as (
   select c.id,c.link_id,c.pessoa_id,c.lead_id,c.iniciada_em,c.atribuicao from public.conversas c join ls on ls.id=c.link_id
   where c.client_id=p_client_id and coalesce(c.iniciada_em,c.ultima_msg_em)>=p_desde
     and coalesce(c.iniciada_em,c.ultima_msg_em)<p_antes_de
 ), ag as (
   select cv.id from cv where exists(select 1 from public.conversas_resumos r where r.conversa_id=cv.id
     and (r.resumo->>'situacao'='agendou' or r.resumo->>'etapa'='agendou'))
 ), ganhos as (
   -- Um lead ligado a várias conversas do mesmo link conta uma única vez.
   select distinct cv.link_id,l.id,l.price from cv join public.crm_leads l
     on l.client_id=p_client_id and l.removido_na_origem is null
     and (l.id=cv.lead_id or (cv.pessoa_id is not null and l.pessoa_id=cv.pessoa_id))
   where exists(select 1 from public.crm_lead_eventos e where e.client_id=p_client_id
     and e.crm_connection_id=l.crm_connection_id and e.external_lead_id=l.external_lead_id and e.tipo='ganhou'
     and e.ocorreu_em>=greatest(p_desde,coalesce(cv.iniciada_em,p_desde)) and e.ocorreu_em<p_antes_de)
     and not (select sim from tem)
   union all
   -- [perfil-da-clinica] com perfil: card de venda pelo perfil, data da venda na janela e depois da conversa.
   select distinct cv.link_id,l.id,l.price from cv join public.crm_leads l
     on l.client_id=p_client_id and l.removido_na_origem is null
     and (l.id=cv.lead_id or (cv.pessoa_id is not null and l.pessoa_id=cv.pessoa_id))
   join pv on pv.lead_id=l.id
   where (select sim from tem)
     and pv.quando>=greatest(p_desde,coalesce(cv.iniciada_em,p_desde)) and pv.quando<p_antes_de
 ), vd as (select g.link_id,count(*) n,coalesce(sum(g.price),0) receita from ganhos g group by g.link_id)
 select ls.id,coalesce((select n from cl where cl.link_id=ls.id),0),
   (select count(*) from cv where cv.link_id=ls.id),
   (select count(*) from cv where cv.link_id=ls.id and cv.atribuicao='horario'),
   (select count(*) from cv where cv.link_id=ls.id and cv.id in(select id from ag)),
   coalesce((select n from vd where vd.link_id=ls.id),0),coalesce((select vd.receita from vd where vd.link_id=ls.id),0)
 from ls;
$function$;
revoke all on function public.links_funil(uuid, timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.links_funil(uuid, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

-- ------------------------------------------------------------ receita_em_jogo(uuid, date, date)
CREATE OR REPLACE FUNCTION public.receita_em_jogo(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with permitido as (select public.is_app_admin() or public.is_client_member(p_client) as ok),
  -- [perfil-da-clinica] com perfil, as vendas do ticket mediano vêm de crm_perfil_vendas (uma por pessoa; valor = maior preço).
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                         where c.client_id = p_client) as sim),
  rec as (
    select count(*) as n
    from public.conversas_do_cliente(p_client) c
    join public.conversas_resumos r on r.conversa_id = c.id and r.client_id = c.client_id
    cross join permitido
    where permitido.ok and c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and coalesce(r.resumo->>'etapa', '') not in ('nao_e_paciente', 'agendou')
      and coalesce(r.resumo->>'situacao', '') <> 'agendou'
      -- Booleans JSON e suas representações textuais usuais são aceitos.
      -- Ausente: recuperável=false, comercial=true. Valor inválido não conta.
      and lower(btrim(coalesce(r.resumo->>'recuperavel', 'false'))) in ('true','t','yes','y','on','1')
      and lower(btrim(coalesce(r.resumo->>'comercial', 'true'))) in ('true','t','yes','y','on','1')
  ),
  crm_ordered as (
    select x.price, row_number() over (order by x.price) as pos, count(*) over () as n from (
    select l.price
    from public.crm_leads_do_cliente(p_client) l cross join permitido
    where permitido.ok and l.client_id = p_client and l.outcome = 'won'
      and l.price > 0 and l.price::text not in ('NaN','Infinity','-Infinity')
      and l.removido_na_origem is null
      and coalesce(l.occurred_at, l.received_at) > now() - interval '365 days'
      and not (select sim from tem)
    union all
    select v.price from (
      select v.pessoa, max(v.price) as price from public.crm_perfil_vendas(p_client) v cross join permitido
       where permitido.ok and (select sim from tem) and not v.copia and v.quando > now() - interval '365 days'
       group by v.pessoa) v
     where v.price > 0 and v.price::text not in ('NaN','Infinity','-Infinity')
    ) x
  ),
  crm as (
    -- Mediana em numeric: não converte tickets para double precision.
    select count(*) as n, avg(price) filter (where pos in ((n+1)/2, (n+2)/2)) as med
    from crm_ordered
  ),
  latest_sap as (
    select s.ticket_medio from public.sap_clinicas s cross join permitido
    where permitido.ok and s.client_id = p_client
    order by s.created_at desc nulls last, s.id desc limit 1
  ),
  candidates as (
    select c.ticket_medio as valor, 'equipe'::text as fonte, 1 as prioridade
    from public.clients c cross join permitido where permitido.ok and c.id = p_client
    union all select round(crm.med), 'crm', 2 from crm where crm.n >= 5
    union all select ticket_medio, 'sap', 3 from latest_sap
  ),
  t as (
    select valor, fonte from candidates
    where valor > 0 and valor::text not in ('NaN','Infinity','-Infinity')
    order by prioridade limit 1
  )
  select case when not (select ok from permitido) then null else jsonb_build_object(
    'recuperaveis', (select n from rec), 'ticket', (select valor from t),
    'fonte_ticket', (select fonte from t), 'vendas_crm', (select n from crm),
    'valor', (select n from rec) * (select valor from t)
  ) end;
$function$;
revoke all on function public.receita_em_jogo(uuid, date, date) from public, anon;
grant execute on function public.receita_em_jogo(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ receita_por_canal(uuid, date, date)
CREATE OR REPLACE FUNCTION public.receita_por_canal(p_client uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período: uma por pessoa (a primeira), valor = maior preço da pessoa,
  -- sem a cópia do robô. Sem perfil, o mesmo filtro de antes.
  with tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                               where c.client_id = p_client) as sim),
  vendas as (
    select l.id, l.pessoa_id, coalesce(l.price, 0) valor, nullif(btrim(l.source), '') fonte_crm
    from public.crm_leads_do_cliente(p_client) l
    where l.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
      and l.outcome = 'won' and l.removido_na_origem is null
      and (coalesce(l.occurred_at, l.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and not (select sim from tem)
    union all
    select l.id, l.pessoa_id, coalesce(pv.preco, 0), nullif(btrim(l.source), '')
    from (select distinct on (v.pessoa) v.lead_id, max(v.price) over (partition by v.pessoa) as preco
            from public.crm_perfil_vendas(p_client) v
           where (select sim from tem) and not v.copia and (v.quando at time zone 'America/Sao_Paulo')::date between p_de and p_ate
           order by v.pessoa, v.quando, v.lead_id) pv
    join public.crm_leads_do_cliente(p_client) l on l.id = pv.lead_id
    where l.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
  ),
  conv as (
    select distinct on (v.id) v.id venda_id, c.id conversa_id
    from vendas v join public.conversas_do_cliente(p_client) c on c.client_id = p_client and (c.lead_id = v.id or (v.pessoa_id is not null and c.pessoa_id = v.pessoa_id))
    order by v.id, c.iniciada_em nulls last, c.id
  ),
  primeira as (
    select distinct on (m.conversa_id) m.conversa_id, lower(regexp_replace(coalesce(m.texto, ''), '\s+', ' ', 'g')) t
    from mensagens m join conv on conv.conversa_id = m.conversa_id
    where m.direcao = 'entrada' and coalesce(m.texto, '') !~* '^\s*\*aten[cç][aã]o:\*'
    order by m.conversa_id, m.enviada_em, m.id
  ),
  origem as (
    select v.id, v.valor,
      case
        when v.fonte_crm is not null then v.fonte_crm
        when o_txt.origem is not null then o_txt.origem
        when nullif(nullif(nullif(r.resumo->>'origem', ''), 'null'), 'desconhecida') is not null then r.resumo->>'origem'
        else 'desconhecida' end canal,
      case
        when v.fonte_crm is not null then 'crm'
        when o_txt.origem is not null then 'texto'
        when nullif(nullif(nullif(r.resumo->>'origem', ''), 'null'), 'desconhecida') is not null then 'ia'
        else 'desconhecida' end certeza
    from vendas v
    left join conv on conv.venda_id = v.id
    left join primeira p on p.conversa_id = conv.conversa_id
    left join conversas_resumos r on r.conversa_id = conv.conversa_id
    left join lateral (select o.origem from origens_texto o where o.client_id = p_client and starts_with(p.t, o.padrao) order by length(o.padrao) desc limit 1) o_txt on true
  )
  select jsonb_build_object(
    'vendas', (select count(*) from origem),
    'receita', (select coalesce(sum(valor), 0) from origem),
    'com_conversa', (select count(*) from conv),
    'por_certeza', (select coalesce(jsonb_object_agg(certeza, jsonb_build_object('vendas', n, 'receita', rec)), '{}'::jsonb)
      from (select certeza, count(*) n, sum(valor) rec from origem group by certeza) x),
    'canais', coalesce((select jsonb_agg(x order by x.receita desc, x.vendas desc) from (
      select canal, count(*) vendas, sum(valor) receita,
        count(*) filter (where certeza = 'crm') crm, count(*) filter (where certeza = 'texto') texto, count(*) filter (where certeza = 'ia') ia
      from origem group by canal) x), '[]'::jsonb));
$function$;
revoke all on function public.receita_por_canal(uuid, date, date) from public, anon;
grant execute on function public.receita_por_canal(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ sap_tracker_auto(uuid, date, date)
CREATE OR REPLACE FUNCTION public.sap_tracker_auto(p_client_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- [perfil-da-clinica] papel da etapa (só conexões com perfil) e cards de venda pelo perfil, uma vez cada.
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  pvc as materialized (select v.lead_id, v.copia, v.quando, v.pessoa, v.price from public.crm_perfil_vendas(p_client_id) v),
  marcos as (select count(*) filter (where marco is not null) as n, coalesce(jsonb_agg(distinct marco) filter (where marco is not null), '[]'::jsonb) as quais from etapas),
  dias as (
    select cl.crm_connection_id, (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
    from public.crm_leads_do_cliente(p_client_id) cl join conns on conns.id = cl.crm_connection_id
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
      -- [perfil-da-clinica] sem perfil (papel null), a regra antiga; com perfil, fechou = card de venda pelo perfil, perdido = etapa
      -- 'perdido', o estágio vem do papel da etapa (quando a etapa não tem marco do SAP) e não pelo nome.
      pe.papel,
      case when pe.papel is null then cl.outcome = 'won' else pvc.lead_id is not null end as ganho,
      coalesce(public.crm_papel_conta(pe.papel, 'perdido'), cl.outcome = 'lost') as perdido,
      (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia,
      nullif(btrim(cl.source), '') as source,
      coalesce(e.pipeline_name, '') as funil,
      coalesce(e.entrada, false) or coalesce(pe.papel = 'novo', false) as entrada,
      case when pe.papel is null then coalesce(e.consulta, false) else false end as consulta,
      e.marco,
      case cl.provider
        when 'kommo' then coalesce(cl.raw_payload->>'loss_reason_id', '0') not in ('0', '') or jsonb_typeof(cl.raw_payload->'loss_reason') = 'array' and jsonb_array_length(cl.raw_payload->'loss_reason') > 0
        when 'rdstation' then nullif(cl.raw_payload#>>'{deal_lost_reason,name}', '') is not null
        when 'clint' then nullif(cl.raw_payload->>'lost_status_id', '') is not null
        when 'planilha' then nullif(btrim(cl.raw_payload->>'motivo_perda'), '') is not null
        else null end as tem_motivo
    from public.crm_leads_do_cliente(p_client_id) cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join pvc on pvc.lead_id = cl.id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and coalesce(pe.papel, '') <> 'ignorar' and not coalesce(pvc.copia, false)
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
      coalesce(case coalesce(b.marco, '')
        when 'desqualificado' then 0 when 'qualificado' then 1 when 'agendado' then 2 when 'faltou' then 2
        when 'compareceu' then 3 when 'pensando' then 4 when 'nao_fechou' then 4 when 'fechou' then 5
        else null end,
        case b.papel when 'em_atendimento' then 1 when 'agendado' then 2 when 'compareceu' then 3
                     when 'venda' then 5 when 'posvenda' then 5 end) as rank
    from base b
  ),
  f as (
    select l.*,
      (ganho or marco = 'fechou') as fechou,
      (ganho or coalesce(rank, case when consulta then 2 else null end, -1) >= 3) as compareceu,
      (ganho or coalesce(rank, case when consulta then 2 else null end, -1) >= 2) as agendou,
      (marco = 'faltou') as faltou,
      (marco = 'pensando' and coalesce(outcome, 'open') = 'open') as pensando,
      (marco = 'nao_fechou' or (perdido and coalesce(rank, -1) >= 3)) as nao_fechou,
      case when marco = 'desqualificado' then false
           when rank is not null then rank >= 1 or ganho
           else (not entrada) or ganho end as qualificado
    from l
  ),
  wts as (
    select w.wait_seconds from public.wts_sessoes_do_cliente(p_client_id) w
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
    select coalesce(sum(c.gasto) filter (where f.finalidade = 'aquisicao'), 0) as investido, coalesce(sum(c.conv), 0) as leads_plataforma
    from (select ad_account_id, campaign_id, sum(spend) as gasto, sum(coalesce(conversations, 0) + coalesce(leads, 0)) as conv
          from meta_ads_daily where client_id = p_client_id and date between p_from and p_to and (select pode from ok)
          group by 1, 2) c
    left join meta_ads_campaigns mc on mc.client_id = p_client_id and mc.ad_account_id = c.ad_account_id and mc.campaign_id = c.campaign_id
    cross join lateral public.ads_finalidade(mc.objective, mc.otimizacoes, mc.destinos, c.conv) f
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'tem_crm', exists (select 1 from conns),
    'tem_whatsapp', exists (select 1 from public.wts_sessoes_do_cliente(p_client_id) w where w.client_id = p_client_id),
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
    'perdidos', (select count(*) from f where perdido),
    'perdidos_com_motivo', (select count(*) from f where perdido and tem_motivo),
    'perdidos_motivo_medivel', (select count(*) from f where perdido and tem_motivo is not null),
    'receita', coalesce((select sum(price) from f where fechou and price > 0), 0),
    'com_origem', (select count(*) from f where tem_origem),
    'linhas_completas', (select count(*) from f where tem_origem and (not fechou or price > 0) and (not coalesce(perdido, false) or tem_motivo is not false)),
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
grant execute on function public.sap_tracker_auto(uuid, date, date) to authenticated, service_role;
