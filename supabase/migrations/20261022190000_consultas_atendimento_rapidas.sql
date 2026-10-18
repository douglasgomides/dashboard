-- Painéis de atendimento sumiam: leitura_conversas, sla_sem_resposta e qualidade_leads_campanha passavam de 8 s
-- (limite do banco para a tela) com o volume atual de mensagens (até 38 mil por clínica) e a tela recebia vazio.
-- Mesma regra e mesmo resultado, sem subconsultas correlacionadas (que cresciam ao quadrado): somas agrupadas e
-- janela "próxima resposta" no lugar de buscas por linha. Medido em produção em 18/10/2026:
--   leitura_conversas: > 8 s → 0,03–0,07 s; sla_sem_resposta: 11,8 s → 0,3 s (744 linhas iguais);
--   qualidade_leads_campanha: 7,1 s → 0,3 s (JSON idêntico).
-- Reversão: recriar as três funções de 20261021190000, 20261021220000 e da migração de qualidade_leads_campanha.

create or replace function public.leitura_conversas(p_client uuid, p_limite integer default 200)
returns table (conversa_id uuid, msgs_paciente bigint, msgs_clinica bigint, msgs_automaticas bigint,
  primeira_resposta_seg integer, mediana_resposta_comercial_seg integer, maior_espera_seg integer,
  esperas_longas integer, vezes_paciente integer, ultima_de text, ultima_msg_em timestamptz,
  aguardando_seg integer, atendente text, lead_etapa text, lead_resultado text)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with conv as (
    select c.id, c.lead_id from conversas c
    where c.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
    order by c.ultima_msg_em desc nulls last
    limit least(coalesce(p_limite, 200), 500)
  ),
  auto as (
    select left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) as chave
    from mensagens m
    where m.client_id = p_client and m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
      and exists (select 1 from conv)
    group by 1 having count(distinct m.conversa_id) >= least(20, greatest(5, (select count(*) from conversas where client_id = p_client) / 10))
  ),
  bruto as (
    select m.id, m.conversa_id, m.direcao, m.enviada_em, m.texto,
      ((m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
        and left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) in (select chave from auto))
      or (m.direcao = 'saida' and m.tipo = 'kommo_robo')) as automatica
    from mensagens m join conv on conv.id = m.conversa_id
    where m.direcao in ('entrada', 'saida')
  ),
  m as (
    select b.*,
      lag(b.direcao) over w as dir_ant,
      min(case when b.direcao = 'saida' then b.enviada_em end) over (w rows between 1 following and unbounded following) as prox_saida
    from bruto b where not b.automatica
    window w as (partition by b.conversa_id order by b.enviada_em, b.id)
  ),
  vezes as (
    select v.conversa_id, v.enviada_em as inicio, v.prox_saida as resposta,
      row_number() over (partition by v.conversa_id order by v.enviada_em) as n,
      (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 17)
      or (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') = 6 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 11) as comercial
    from m v where v.direcao = 'entrada' and v.dir_ant is distinct from 'entrada'
  ),
  esperas as (select conversa_id, n, comercial, extract(epoch from resposta - inicio)::int as seg from vezes where resposta is not null),
  cont as (
    select conversa_id,
      count(*) filter (where direcao = 'entrada') as pac,
      count(*) filter (where direcao = 'saida' and not automatica) as cli,
      count(*) filter (where automatica) as aut
    from bruto group by conversa_id
  ),
  esp as (
    select conversa_id,
      min(seg) filter (where n = 1) as primeira,
      (percentile_cont(0.5) within group (order by seg) filter (where comercial))::int as med_com,
      max(seg) as maior,
      count(*) filter (where seg > 3600)::int as longas
    from esperas group by conversa_id
  ),
  nvezes as (select conversa_id, count(*)::int as n from vezes group by conversa_id),
  ult as (select distinct on (conversa_id) conversa_id, direcao, enviada_em, texto from m order by conversa_id, enviada_em desc, id desc),
  atend as (
    select distinct on (conversa_id) conversa_id, substring(texto from '^\s*\*([^*]{1,40}):\*') as nome
    from m where direcao = 'saida' and texto ~ '^\s*\*[^*]{1,40}:\*'
    group by conversa_id, 2 order by conversa_id, count(*) desc
  )
  select conv.id,
    coalesce(cont.pac, 0), coalesce(cont.cli, 0), coalesce(cont.aut, 0),
    esp.primeira, esp.med_com, esp.maior, coalesce(esp.longas, 0), coalesce(nvezes.n, 0),
    case
      when ult.direcao = 'saida' then 'clinica'
      when ult.direcao = 'entrada' and length(coalesce(ult.texto, '')) <= 40
        and lower(coalesce(ult.texto, '')) ~ '^\W*(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|grat[ao]|gratid[ãa]o|valeu|vlw|t[áa] bom|t[áa] [oó]timo|beleza|blz|certo|perfeito|combinado|show|maravilha|de nada|at[ée] (logo|mais|amanh[ãa])|tchau|bom dia|boa tarde|boa noite|amei|[^[:alnum:][:space:]]+)\W*$' then 'paciente_encerrou'
      when ult.direcao = 'entrada' then 'paciente'
    end,
    ult.enviada_em,
    case when ult.direcao = 'entrada' then extract(epoch from now() - ult.enviada_em)::int end,
    atend.nome,
    (select cps.status_name from crm_leads cl left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id where cl.id = conv.lead_id limit 1),
    (select cl.outcome from crm_leads cl where cl.id = conv.lead_id)
  from conv
  left join ult on ult.conversa_id = conv.id
  left join cont on cont.conversa_id = conv.id
  left join esp on esp.conversa_id = conv.id
  left join nvezes on nvezes.conversa_id = conv.id
  left join atend on atend.conversa_id = conv.id;
$function$;

create or replace function public.sla_sem_resposta(p_minutos integer default 30)
returns table(client_id uuid, cliente text, conversa_id uuid, pessoa text, canal text, provider text, desde timestamptz, espera_min integer, em_horario boolean)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with auto as (
    select m.client_id, left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) chave
    from mensagens m
    where public.is_app_admin() and m.direcao = 'saida' and m.texto is not null and m.enviada_em > now() - interval '14 days'
      and m.texto !~ '^\s*\*[^*]{1,40}:\*'
    group by 1, 2 having count(distinct m.conversa_id) >= 10
  ),
  msgs as (
    select m.id, m.conversa_id, m.client_id, m.direcao, m.enviada_em, m.texto
    from mensagens m
    where public.is_app_admin() and m.enviada_em > now() - interval '72 hours' and m.direcao in ('entrada', 'saida')
      and coalesce(m.tipo, '') <> 'kommo_robo'
      and not (m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
        and exists (select 1 from auto a where a.client_id = m.client_id and a.chave = left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60)))
  ),
  ult as (select distinct on (conversa_id) * from msgs order by conversa_id, enviada_em desc, id desc),
  ultsaida as (select conversa_id, max(enviada_em) as ls from msgs where direcao = 'saida' group by 1),
  ini as (
    select e.conversa_id, min(e.enviada_em) as inicio
    from msgs e left join ultsaida s on s.conversa_id = e.conversa_id
    where e.direcao = 'entrada' and e.enviada_em > coalesce(s.ls, '-infinity')
    group by 1
  ),
  pend as (
    select u.*, i.inicio
    from ult u left join ini i on i.conversa_id = u.conversa_id
    where u.direcao = 'entrada'
      and not (length(coalesce(u.texto, '')) <= 40 and lower(coalesce(u.texto, '')) ~ '^\W*(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|grat[ao]|valeu|vlw|t[áa] bom|beleza|blz|certo|perfeito|combinado|show|tchau|amei|[^[:alnum:][:space:]]+)\W*$')
  )
  select p.client_id, cl.name, p.conversa_id, coalesce(pe.nome, 'Sem nome'), c.canal, c.provider, p.inicio,
    (extract(epoch from now() - p.inicio) / 60)::int,
    (extract(isodow from p.inicio at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from p.inicio at time zone 'America/Sao_Paulo') between 8 and 17)
      or (extract(isodow from p.inicio at time zone 'America/Sao_Paulo') = 6 and extract(hour from p.inicio at time zone 'America/Sao_Paulo') between 8 and 11)
  from pend p
  join conversas c on c.id = p.conversa_id
  join clients cl on cl.id = p.client_id
  left join pessoas pe on pe.id = c.pessoa_id
  where p.inicio is not null and now() - p.inicio > make_interval(mins => greatest(5, coalesce(p_minutos, 30)))
  order by p.inicio;
$function$;

create or replace function public.qualidade_leads_campanha(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
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
  conv as (
    select c.id, (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date dia, c.lead_id, c.pessoa_id
    from conversas c join mensagens m on m.conversa_id = c.id and m.direcao = 'entrada'
    where c.client_id = p_client and (select pode from ok)
    group by c.id
    having (min(m.enviada_em) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  lq_pessoa as (
    select distinct on (pessoa_id) pessoa_id, avancou, agendou, outcome from lq where pessoa_id is not null order by pessoa_id, occurred_at desc
  ),
  conv_lead as (
    select cv.*, coalesce(
      case when l1.id is not null then row(l1.avancou, l1.agendou, l1.outcome = 'won')::text end,
      case when lp.pessoa_id is not null then row(lp.avancou, lp.agendou, lp.outcome = 'won')::text end) as r
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
