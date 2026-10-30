-- Pacientes do período: a primeira tela do médico, tudo contado em PESSOAS (pedido do dono do produto, 31/10/2026).
--   "De todos, eu quero saber quantos leads novos entraram, quantos pacientes antigos mandaram mensagem, quantos
--    agendaram, quantos estão em negociação, quantos foram na consulta, o que eles fecharam, e já colocar eles para
--    fazer follow-up."
-- Caso que motivou a régua de mensagem: na Dra. Marcelly Achkar (Clint), em outubro havia 833 "pessoas" com conversa,
-- mas só ~310 mandaram mensagem. A Clint transforma comentário em post (COMMENT) e reação ou resposta a story
-- (REACTION, REPLY, STORY_MENTION, SHARE_MEDIA) em "conversa": 358 só comentaram e 130 só reagiram a story.
--
-- O que entra:
--   1. mensagem_eh_interacao(tipo): o tipo de mensagem que NÃO é mensagem de verdade (comentário, reação, story).
--   2. conversas_so_interacao(ids): das conversas dadas, as que só têm entrada desse tipo. A fila da leitura por IA
--      (api/_lib/resumo-conversa.ts) pula essas conversas. Só service_role.
--   3. crm_procedimento_do_card(raw): o campo "Tipo de Procedimento" / "Procedimento" do card (Kommo, WTS Chat,
--      Clint), quando existir.
--   4. pacientes_cards(client): os cards vivos com a pessoa (pessoa do Nexo quando há; senão a chave do CRM), o
--      funil, a etapa, se a etapa é de agendamento ou de comparecimento e se o funil é de prospecção ativa. Interna.
--   5. pacientes_vendas(client, de, ate): as vendas da janela (mesma régua de crm_vendas_periodo), sem o "ganho" sem
--      valor de funil de prospecção, com o que foi fechado. A tela usa para a recompra (prazos em
--      src/lib/config/recompra.ts: o banco não guarda prazo).
--   6. pacientes_periodo(client, de, ate): os números da tela com {valor, fonte, motivo_sem_dado, responsavel} e as
--      listas de pessoas (até 200 por lista, com o total), sem telefone.
-- Comparecimento: só pelo nome da etapa (compareceu, atendido, consulta realizada, pós-consulta). A marca
-- "em_atendimento" de crm_etapa_kpi está posta em etapas de negociação nesses CRMs e não indica comparecimento.
-- Funil de prospecção ativa: config.origem_por_funil da conexão com valor começando por "Prospecção" (Marcelly:
-- {"Social Seller":"Prospecção ativa (Social Seller)"}), nome do funil com "social seller" ou "prospec", papel
-- 'prospeccao' em crm_funil_papel (hoje o papel não existe; a comparação fica pronta) ou origem classificada como
-- "Prospecção ativa".
-- Reversão: drop function public.pacientes_periodo(uuid, date, date); drop function public.pacientes_vendas(uuid, date,
--   date); drop function public.pacientes_cards(uuid); drop function public.crm_procedimento_do_card(jsonb);
--   drop function public.conversas_so_interacao(uuid[]); drop function public.mensagem_eh_interacao(text); drop function public.primeiro_nome(text);
--   drop function public.pacientes_vendas_janela(uuid, date, date).
--   Em api/_lib/resumo-conversa.ts, tirar o filtro de conversas_so_interacao da fila.

create or replace function public.mensagem_eh_interacao(p_tipo text)
returns boolean
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select upper(btrim(coalesce(p_tipo, ''))) in ('COMMENT', 'REPLY', 'SHARE_MEDIA', 'REACTION', 'STORY_MENTION');
$$;
revoke all on function public.mensagem_eh_interacao(text) from public, anon;
grant execute on function public.mensagem_eh_interacao(text) to authenticated, service_role;

create or replace function public.conversas_so_interacao(p_ids uuid[])
returns setof uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id
    from unnest(p_ids) c(id)
   where exists (select 1 from mensagens m where m.conversa_id = c.id and m.direcao = 'entrada')
     and not exists (select 1 from mensagens m where m.conversa_id = c.id and m.direcao = 'entrada'
                       and not public.mensagem_eh_interacao(m.tipo));
$$;
revoke all on function public.conversas_so_interacao(uuid[]) from public, anon, authenticated;
grant execute on function public.conversas_so_interacao(uuid[]) to service_role;

create or replace function public.crm_procedimento_do_card(p_raw jsonb)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select nullif(btrim(v->>'value'), '')
       from jsonb_array_elements(case when jsonb_typeof(p_raw->'custom_fields_values') = 'array' then p_raw->'custom_fields_values' else '[]'::jsonb end) f,
            jsonb_array_elements(case when jsonb_typeof(f->'values') = 'array' then f->'values' else '[]'::jsonb end) v
      where f->>'field_name' ~* 'procedimento' and nullif(btrim(v->>'value'), '') is not null
      limit 1),
    (select nullif(btrim(e.value), '')
       from jsonb_each_text(case when jsonb_typeof(p_raw->'fields') = 'object' then p_raw->'fields' else '{}'::jsonb end) e
      where e.key ~* 'procedimento' and nullif(btrim(e.value), '') is not null
      limit 1)
  );
$$;
revoke all on function public.crm_procedimento_do_card(jsonb) from public, anon;
grant execute on function public.crm_procedimento_do_card(jsonb) to authenticated, service_role;

-- Primeiro nome legível (sem número, sem telefone).
create or replace function public.primeiro_nome(p_nome text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select nullif(initcap(split_part(btrim(regexp_replace(coalesce(p_nome, ''), '[^[:alpha:][:space:]]', ' ', 'g')), ' ', 1)), '');
$$;
revoke all on function public.primeiro_nome(text) from public, anon;
grant execute on function public.primeiro_nome(text) to authenticated, service_role;

-- Cards vivos do cliente com a pessoa e o que a tela precisa. Uso interno (sem acesso direto).
create or replace function public.pacientes_cards(p_client uuid)
returns table(
  id uuid, cx uuid, ext text, u text, pid uuid, pk text, d date, occurred_at timestamptz, outcome text, price numeric,
  contact_name text, funil text, etapa text, papel text, em_agendamento boolean, em_comparecimento boolean,
  prospec boolean, origem text, procedimento text
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with funis as (
    select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, s.pipeline_name
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client
     order by s.crm_connection_id, s.pipeline_id, s.fetched_at desc nulls last
  ),
  etapas as (
    select s.crm_connection_id, s.pipeline_id, s.status_id, s.status_name,
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                     and k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)' as agendamento,
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                     and k.status_id = s.status_id and false and k.kpi = 'em_atendimento')
             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)' as comparecimento
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client
  ),
  base as (
    select cl.id, cl.crm_connection_id as cx, cl.external_lead_id as ext, cl.pessoa_id,
           coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) as pk,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d, cl.occurred_at, cl.outcome, cl.price, cl.contact_name,
           f.pipeline_name as funil, e.status_name as etapa, coalesce(fp.papel, 'captacao') as papel,
           coalesce(e.agendamento and not e.comparecimento, false) as em_agendamento,
           coalesce(e.comparecimento, false) as em_comparecimento,
           (coalesce(cc.config->'origem_por_funil'->>btrim(f.pipeline_name), '') ~* '^prospec'
             or coalesce(f.pipeline_name, '') ~* '(social ?seller|prospec)'
             or coalesce(fp.papel, '') = 'prospeccao'
             or coalesce(public.crm_origem_classifica(cl.source), '') = 'Prospecção ativa') as prospec,
           public.crm_origem_classifica(cl.source) as origem,
           public.crm_procedimento_do_card(cl.raw_payload) as procedimento
      from crm_leads cl
      join crm_connections cc on cc.id = cl.crm_connection_id
      left join funis f on f.crm_connection_id = cl.crm_connection_id and f.pipeline_id = cl.pipeline_id
      left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
      left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
     where cl.client_id = p_client and cl.removido_na_origem is null and cl.occurred_at is not null
  ),
  -- Pessoa do Nexo da chave: a do próprio card ou a do telefone (pessoas.telefone_chave).
  pessoa_da_chave as (
    select b.pk, coalesce(max(b.pessoa_id::text), max(p.id::text))::uuid as pid
      from base b
      left join pessoas p on p.client_id = p_client and b.pk like 't:%' and p.telefone_chave = substr(b.pk, 3)
     group by b.pk
  )
  select b.id, b.cx, b.ext, coalesce('p:' || x.pid::text, 'k:' || b.pk), x.pid, b.pk, b.d, b.occurred_at, b.outcome, b.price,
         b.contact_name, b.funil, b.etapa, b.papel, b.em_agendamento, b.em_comparecimento, b.prospec, b.origem, b.procedimento
    from base b join pessoa_da_chave x on x.pk = b.pk;
$$;
revoke all on function public.pacientes_cards(uuid) from public, anon, authenticated;
grant execute on function public.pacientes_cards(uuid) to service_role;

-- Vendas da janela, uma linha por venda. Mesma régua de crm_vendas_periodo: evento "ganhou" na janela; card que já
-- nasceu ganho (sem evento) vale pela data de entrada. "Ganho" sem valor em funil de prospecção não é venda.
create or replace function public.pacientes_vendas_janela(p_client uuid, p_de date, p_ate date)
returns table(id uuid, u text, quando timestamptz, price numeric, funil text, procedimento text, prospec_sem_valor boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with g as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, count(*) as n,
           max(e.ocorreu_em) filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) as no_periodo
      from crm_lead_eventos e
     where e.client_id = p_client and e.tipo = 'ganhou'
     group by 1, 2
  )
  select c.id, c.u, coalesce(g.no_periodo, c.occurred_at), c.price, c.funil, c.procedimento,
         c.prospec and coalesce(c.price, 0) = 0
    from public.pacientes_cards(p_client) c
    left join g on g.cx = c.cx and g.ext = c.ext
   where c.outcome = 'won'
     -- "Ganho" sem valor em etapa de agendamento é agendamento, não venda (Dra. Juliana e Dra. Mariela: "Agendado").
     and not (c.em_agendamento and coalesce(c.price, 0) = 0)
     and (g.no_periodo is not null or (g.n is null and c.d between p_de and p_ate));
$$;
revoke all on function public.pacientes_vendas_janela(uuid, date, date) from public, anon, authenticated;
grant execute on function public.pacientes_vendas_janela(uuid, date, date) to service_role;

-- Vendas para a recompra (a tela pede a janela do maior prazo de recompra). Sem telefone.
create or replace function public.pacientes_vendas(p_client uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    raise exception 'sem acesso a esta clínica' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'período inválido' using errcode = '22023'; end if;
  with vend as (select * from public.pacientes_vendas_janela(p_client, p_de, p_ate) where not prospec_sem_valor),
  ia as (
    select distinct on (cv.pessoa_id) cv.pessoa_id, cv.id as conversa_id, nullif(btrim(r.resumo->>'interesse'), '') as interesse
      from conversas cv left join conversas_resumos r on r.conversa_id = cv.id
     where cv.client_id = p_client and cv.pessoa_id is not null
     order by cv.pessoa_id, cv.ultima_msg_em desc nulls last
  ),
  itens as (
    select v.*, row_number() over (order by v.quando desc, v.id) as rn,
           coalesce(public.primeiro_nome(p.nome), public.primeiro_nome(cl.contact_name)) as nome,
           ia.conversa_id, ia.interesse
      from vend v
      join crm_leads cl on cl.id = v.id
      left join pessoas p on v.u like 'p:%' and p.id::text = substr(v.u, 3)
      left join ia on v.u like 'p:%' and ia.pessoa_id::text = substr(v.u, 3)
  )
  select jsonb_build_object(
    'total', (select count(*) from itens),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', md5(i.u), 'venda', i.id, 'nome', i.nome, 'data', (i.quando at time zone 'America/Sao_Paulo')::date,
        'valor', i.price, 'funil', i.funil, 'procedimento', i.procedimento, 'interesse', i.interesse, 'conversa_id', i.conversa_id)
        order by i.quando desc, i.id) from itens i where i.rn <= 1000), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.pacientes_vendas(uuid, date, date) from public, anon;
grant execute on function public.pacientes_vendas(uuid, date, date) to authenticated, service_role;

create or replace function public.pacientes_periodo(p_client uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ini timestamptz;
  v_fim timestamptz;
  v jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    raise exception 'sem acesso a esta clínica' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'período inválido' using errcode = '22023'; end if;
  v_ini := (p_de::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');

  with
  cards as materialized (select * from public.pacientes_cards(p_client)),
  -- Conversas que encostam no período, com a pessoa: a do Nexo, a do card ligado, ou a própria conversa.
  convs as materialized (
    select cv.id, cv.provider, cv.ultima_msg_em,
           case when cv.canal = 'whatsapp' then 'whatsapp' when cv.canal = 'instagram' then 'instagram' else 'outro' end as canal,
           coalesce('p:' || cv.pessoa_id::text, c.u, 'x:' || cv.provider || ':' || cv.externo_id) as u
      from conversas cv
      left join cards c on c.id = cv.lead_id
     where cv.client_id = p_client
       and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
  ),
  msg as (
    select m.conversa_id,
           bool_or(not public.mensagem_eh_interacao(m.tipo)) as real,
           bool_or(upper(btrim(coalesce(m.tipo, ''))) = 'COMMENT') as comentou,
           max(m.enviada_em) filter (where not public.mensagem_eh_interacao(m.tipo)) as ultima_real,
           max(m.enviada_em) as ultima
      from convs cv join mensagens m on m.conversa_id = cv.id
     where m.direcao = 'entrada' and m.enviada_em >= v_ini and m.enviada_em < v_fim
     group by m.conversa_id
  ),
  -- Conversa de verdade (alguma entrada que não é comentário nem reação): só ela vale para a leitura da IA.
  conv_real as (
    select cv.id from convs cv
     where exists (select 1 from mensagens m where m.conversa_id = cv.id and m.direcao = 'entrada'
                     and not public.mensagem_eh_interacao(m.tipo))
  ),
  pm as (
    select cv.u, bool_or(coalesce(msg.real, false)) as real, bool_or(msg.comentou) as comentou,
           max(msg.ultima_real) as ultima_real, max(msg.ultima) as ultima,
           array_agg(distinct cv.canal) filter (where msg.real) as canais
      from convs cv join msg on msg.conversa_id = cv.id
     group by cv.u
  ),
  ia as (
    select cv.u, cv.id as conversa_id, cv.ultima_msg_em, r.resumo->>'etapa' as etapa, r.resumo->>'origem' as origem,
           coalesce(r.resumo->'comercial' = 'true'::jsonb, false) as comercial
      from convs cv join conv_real cr on cr.id = cv.id join conversas_resumos r on r.conversa_id = cv.id
  ),
  ia_p as (select distinct on (u) u, origem from ia order by u, ultima_msg_em desc),
  -- Eventos de etapa dos cards (entrou ou mudou de etapa), com o tipo da etapa de destino.
  ev_etapa as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, e.ocorreu_em,
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = e.crm_connection_id and k.pipeline_id = e.pipeline_para
                     and k.status_id = e.status_para and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)' as agendamento,
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = e.crm_connection_id and k.pipeline_id = e.pipeline_para
                     and k.status_id = e.status_para and false and k.kpi = 'em_atendimento')
             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)' as comparecimento
      from crm_lead_eventos e
      left join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
     where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa')
  ),
  mexeu as (
    select distinct e.crm_connection_id as cx, e.external_lead_id as ext from crm_lead_eventos e
     where e.client_id = p_client and e.ocorreu_em >= v_ini and e.ocorreu_em < v_fim
  ),
  vend as (select * from public.pacientes_vendas_janela(p_client, p_de, p_ate)),
  vendas as (select * from vend where not prospec_sem_valor),
  -- Agendaram: card que entrou em etapa de agendamento no período (evento; sem evento, estar na etapa e ter entrado
  -- no período) e conversa do período que a IA leu como "agendou".
  ag_crm as (
    select c.u, min(coalesce(x.quando, c.occurred_at)) as quando
      from cards c
      left join (select cx, ext, min(ocorreu_em) as quando from ev_etapa
                  where agendamento and not comparecimento and ocorreu_em >= v_ini and ocorreu_em < v_fim group by 1, 2) x
        on x.cx = c.cx and x.ext = c.ext
     where x.quando is not null or (c.em_agendamento and c.d between p_de and p_ate)
     group by c.u
  ),
  ag_ia as (select u, min(ultima_msg_em) as quando from ia where etapa = 'agendou' group by u),
  agendaram as (
    select coalesce(a.u, b.u) as u, least(a.quando, b.quando) as quando,
           case when a.u is not null and b.u is not null then 'crm_e_conversa' when a.u is not null then 'crm' else 'conversa' end as fonte
      from ag_crm a full join ag_ia b on b.u = a.u
  ),
  comp_cfg as (select exists (select 1 from cards where em_comparecimento)
                   or exists (select 1 from crm_etapa_kpi k join crm_connections c on c.id = k.crm_connection_id
                               where c.client_id = p_client and false and k.kpi = 'em_atendimento')
                   or exists (select 1 from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
                               where c.client_id = p_client
                                 and s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as tem),
  comp_ev as (select cx, ext, min(ocorreu_em) as primeiro, max(ocorreu_em) as ultimo,
                     bool_or(ocorreu_em >= v_ini and ocorreu_em < v_fim) as no_periodo
                from ev_etapa where comparecimento group by 1, 2),
  compareceram as (
    select c.u, min(coalesce(x.primeiro, c.occurred_at)) as quando
      from cards c left join comp_ev x on x.cx = c.cx and x.ext = c.ext
     where coalesce(x.no_periodo, false) or (x.cx is null and c.em_comparecimento and c.d between p_de and p_ate)
     group by c.u
  ),
  -- Por pessoa, o que vale a qualquer tempo (para não varrer os cards de novo a cada pessoa).
  g_ult as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, max(e.ocorreu_em) as ultimo
      from crm_lead_eventos e where e.client_id = p_client and e.tipo = 'ganhou' group by 1, 2
  ),
  cards_u as (
    select c.u,
           bool_or(c.d < p_de) as antes,
           bool_or(c.origem = 'Paciente antigo') as paciente_antigo,
           bool_or(c.em_comparecimento) as comparecimento_agora,
           max(x.ultimo) as comparecimento_ultimo,
           max(coalesce(g.ultimo, c.occurred_at)) filter (where c.outcome = 'won') as ganho_ultimo
      from cards c
      left join comp_ev x on x.cx = c.cx and x.ext = c.ext
      left join g_ult g on g.cx = c.cx and g.ext = c.ext
     group by c.u
  ),
  -- Depois do agendamento: foi na consulta ou fechou, para o follow-up de quem sumiu.
  depois as (
    select a.u,
           coalesce(cu.comparecimento_agora, false) or coalesce(cu.comparecimento_ultimo >= a.quando, false) as compareceu,
           coalesce(cu.ganho_ultimo >= a.quando - interval '1 day', false) or v.u is not null as fechou
      from agendaram a
      left join cards_u cu on cu.u = a.u
      left join (select distinct u from vendas) v on v.u = a.u
  ),
  -- Pessoas novas do período (crm_pessoas_novas), separadas entre lead novo e abordado pela equipe (prospecção).
  novas as (
    select c.u, n.primeiro, bool_and(c.prospec) as so_prospec,
           (array_agg(c.origem order by c.origem is null, c.occurred_at))[1] as origem_crm
      from public.crm_pessoas_novas(p_client, p_de, p_ate) n
      join cards c on c.pk = n.pk and c.d = n.primeiro
     group by c.u, n.primeiro
  ),
  novas_u as (
    select u, min(primeiro) as primeiro, bool_and(so_prospec) as so_prospec,
           (array_agg(origem_crm order by origem_crm is null))[1] as origem_crm
      from novas group by u
  ),
  leads_novos as (
    select n.u, n.primeiro,
           case
             when n.origem_crm = 'Anúncio' then 'anuncio'
             when n.origem_crm = 'Instagram' then 'instagram_organico'
             when n.origem_crm = 'Indicação' then 'indicacao'
             when n.origem_crm = 'Google' then 'google'
             when n.origem_crm is not null then 'outras'
             when i.origem = 'anuncio' then 'anuncio'
             when i.origem = 'instagram' then 'instagram_organico'
             when i.origem = 'indicacao' then 'indicacao'
             else 'sem_origem'
           end as origem,
           case when n.origem_crm is not null then 'crm' when i.origem in ('anuncio', 'instagram', 'indicacao') then 'conversa' end as origem_fonte
      from novas_u n left join ia_p i on i.u = n.u
     where not n.so_prospec
  ),
  pm_real as (select u from pm where real),
  abordados as (
    select n.u, n.primeiro,
           r.u is not null or ps.u is not null as respondeu,
           a.u is not null as agendou,
           vv.u is not null as fechou
      from novas_u n
      left join pm_real r on r.u = n.u
      left join (select distinct u from vend where prospec_sem_valor) ps on ps.u = n.u
      left join agendaram a on a.u = n.u
      left join (select distinct u from vendas) vv on vv.u = n.u
     where n.so_prospec
  ),
  -- Pacientes antigos que voltaram a chamar: mandaram mensagem e já eram da clínica antes do período.
  ia_pa as (select distinct u from ia where origem = 'paciente_antigo'),
  antigos as (
    select pm.u, pm.ultima_real as quando,
           array_remove(array[
             case when coalesce(cu.antes, false) then 'crm_antes' end,
             case when coalesce(cu.paciente_antigo, false) then 'crm_origem' end,
             case when i.u is not null then 'conversa' end
           ], null) as fontes
      from pm
      left join cards_u cu on cu.u = pm.u
      left join ia_pa i on i.u = pm.u
     where pm.real
  ),
  -- Em negociação: card aberto (nunca 'closed') que se mexeu no período, fora de agendamento e comparecimento, e conversa
  -- comercial do período em qualificação, preço apresentado ou agendamento em curso. Sem quem agendou ou fechou.
  neg_crm as (
    select distinct c.u from cards c
     where c.outcome = 'open' and not c.em_agendamento and not c.em_comparecimento
       and c.papel in ('captacao', 'venda')
       -- Prospecção tem linha própria ("Abordados pela equipe"); etapa de entrada ainda não é negociação.
       and not c.prospec
       and coalesce(c.etapa, '') !~* '(caixa de leads|novo lead|^lead$|contato inicial|^base\M|selecionada para prospec|enviei a primeira|mensagem enviada|abordagem realizada|levantou a m)'
       and (c.d between p_de and p_ate or exists (select 1 from mexeu m where m.cx = c.cx and m.ext = c.ext))
  ),
  neg_ia as (select distinct u from ia where comercial and etapa in ('preco_apresentado', 'agendamento_em_curso', 'qualificacao')),
  negociacao as (
    select coalesce(a.u, b.u) as u,
           case when a.u is not null and b.u is not null then 'crm_e_conversa' when a.u is not null then 'crm' else 'conversa' end as fonte
      from neg_crm a full join neg_ia b on b.u = a.u
     where coalesce(a.u, b.u) not in (select u from agendaram)
       and coalesce(a.u, b.u) not in (select u from vendas)
  ),
  -- Membros de cada lista: uma linha por pessoa (em "fecharam", uma por venda).
  membros as (
    select 'mandaram'::text as lista, pm.u, pm.ultima_real as quando, 'conversa'::text as fonte,
           jsonb_build_object('canais', to_jsonb(pm.canais)) as extra, pm.u as chave
      from pm where pm.real
    union all
    select 'engajaram', pm.u, pm.ultima, 'instagram', jsonb_build_object('tipo', case when pm.comentou then 'comentou' else 'story' end), pm.u
      from pm where not pm.real
    union all
    select 'leads_novos', l.u, l.primeiro::timestamp at time zone 'America/Sao_Paulo', 'crm',
           jsonb_build_object('origem', l.origem, 'origem_fonte', l.origem_fonte), l.u
      from leads_novos l
    union all
    select 'abordados', a.u, a.primeiro::timestamp at time zone 'America/Sao_Paulo', 'crm',
           jsonb_build_object('respondeu', a.respondeu, 'agendou', a.agendou, 'fechou', a.fechou), a.u
      from abordados a
    union all
    select 'antigos', a.u, a.quando, a.fontes[1], jsonb_build_object('fontes', to_jsonb(a.fontes)), a.u
      from antigos a where cardinality(a.fontes) > 0
    union all
    select 'agendaram', a.u, a.quando, a.fonte,
           jsonb_build_object('agendou_em', (a.quando at time zone 'America/Sao_Paulo')::date,
                              'compareceu_depois', d.compareceu, 'fechou_depois', d.fechou), a.u
      from agendaram a join depois d on d.u = a.u
    union all
    select 'negociacao', n.u, null::timestamptz, n.fonte, '{}'::jsonb, n.u from negociacao n
    union all
    select 'compareceram', c.u, c.quando, 'crm', '{}'::jsonb, c.u from compareceram c where (select tem from comp_cfg)
    union all
    select 'fecharam', v.u, v.quando, 'crm',
           jsonb_build_object('valor', v.price, 'funil', v.funil, 'procedimento', v.procedimento,
                              'data', (v.quando at time zone 'America/Sao_Paulo')::date), v.u || ':' || v.id::text
      from vendas v
  ),
  -- O que a tela mostra de cada pessoa: primeiro nome, canal, a conversa, em que pé está e o que pediu.
  card_ult as (select distinct on (u) u, funil, etapa, outcome from cards order by u, occurred_at desc),
  nome_card as (
    select distinct on (u) u, public.primeiro_nome(contact_name) as nome
      from cards where public.primeiro_nome(contact_name) is not null order by u, occurred_at desc
  ),
  conv_ult as (select distinct on (u) u, id, canal from convs order by u, ultima_msg_em desc),
  leitura_ult as (
    select distinct on (cv.u) cv.u, r.resumo->>'etapa' as etapa, nullif(btrim(r.resumo->>'interesse'), '') as interesse
      from convs cv join conv_real cr on cr.id = cv.id join conversas_resumos r on r.conversa_id = cv.id
     order by cv.u, cv.ultima_msg_em desc
  ),
  info as (
    select x.u,
           coalesce(public.primeiro_nome(p.nome), nc.nome) as nome,
           cvu.canal, cvu.id as conversa_id,
           case when cu.u is not null then jsonb_build_object('funil', cu.funil, 'etapa', cu.etapa, 'resultado', cu.outcome) end as crm,
           case when lu.u is not null then jsonb_build_object('etapa', lu.etapa, 'interesse', lu.interesse) end as leitura
      from (select distinct u from membros) x
      left join pessoas p on x.u like 'p:%' and p.id::text = substr(x.u, 3)
      left join nome_card nc on nc.u = x.u
      left join conv_ult cvu on cvu.u = x.u
      left join card_ult cu on cu.u = x.u
      left join leitura_ult lu on lu.u = x.u
  ),
  ordenados as (
    select m.*, row_number() over (partition by m.lista order by m.quando desc nulls last, m.chave) as rn
      from membros m
  ),
  listas as (
    select o.lista,
           count(distinct o.u) as pessoas,
           count(*) as linhas,
           jsonb_agg(jsonb_build_object(
             'id', md5(o.chave), 'pessoa', md5(o.u), 'nome', i.nome, 'canal', i.canal, 'conversa_id', i.conversa_id,
             'data', (o.quando at time zone 'America/Sao_Paulo')::date, 'fonte', o.fonte,
             'crm', i.crm, 'leitura', i.leitura) || o.extra
             order by o.quando desc nulls last, o.chave) filter (where o.rn <= 200) as itens
      from ordenados o join info i on i.u = o.u
     group by o.lista
  ),
  flags as (
    select exists (select 1 from crm_connections c where c.client_id = p_client and c.active) as tem_crm,
           exists (select 1 from conversas c where c.client_id = p_client) as tem_conversas,
           exists (select 1 from conversas_resumos r where r.client_id = p_client) as tem_leitura,
           exists (select 1 from cards where prospec) as tem_prospeccao,
           coalesce((select eh_teste from clients where id = p_client), false) as teste,
           (select count(*) from cards c where c.outcome = 'closed' and c.d between p_de and p_ate) as fechados_sem_resultado,
           exists (select 1 from cards c where c.outcome = 'won' and c.em_agendamento and coalesce(c.price, 0) = 0) as ganho_e_agendamento,
           (select max(cl.occurred_at) from crm_leads cl join crm_connections cc on cc.id = cl.crm_connection_id
             where cl.client_id = p_client and cc.active and cc.provider = 'planilha' and cl.removido_na_origem is null) as planilha_ultimo,
           exists (select 1 from crm_connections cc where cc.client_id = p_client and cc.active and cc.provider = 'planilha') as tem_planilha
  ),
  n as (
    select l.lista, l.pessoas, l.linhas from listas l
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'cliente_de_teste', f.teste,
    'tem_crm', f.tem_crm,
    'tem_conversas', f.tem_conversas,
    'tem_leitura_ia', f.tem_leitura,
    'tem_funil_prospeccao', f.tem_prospeccao,
    'numeros', jsonb_build_object(
      'mandaram_mensagem', case when not f.tem_conversas then jsonb_build_object('valor', null, 'fonte', 'conversas',
            'motivo_sem_dado', 'O WhatsApp e o Instagram Direct da clínica ainda não estão ligados ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', coalesce((select pessoas from n where lista = 'mandaram'), 0), 'fonte', 'conversas',
            'motivo_sem_dado', null, 'responsavel', null,
            'por_canal', jsonb_build_object(
              'whatsapp', (select count(*) from pm where pm.real and 'whatsapp' = any(pm.canais)),
              'instagram', (select count(*) from pm where pm.real and 'instagram' = any(pm.canais)),
              'outro', (select count(*) from pm where pm.real and 'outro' = any(pm.canais)))) end,
      'engajaram_instagram', case when not f.tem_conversas then jsonb_build_object('valor', null, 'fonte', 'conversas',
            'motivo_sem_dado', 'O Instagram Direct da clínica ainda não está ligado ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', coalesce((select pessoas from n where lista = 'engajaram'), 0), 'fonte', 'conversas',
            'motivo_sem_dado', null, 'responsavel', null,
            'so_comentaram', (select count(*) from pm where not pm.real and pm.comentou),
            'so_story', (select count(*) from pm where not pm.real and not coalesce(pm.comentou, false))) end,
      'leads_novos', case when not f.tem_crm then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'O CRM da clínica ainda não está ligado ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', (select count(*) from leads_novos), 'fonte', 'crm', 'motivo_sem_dado', null, 'responsavel', null,
            'por_origem', jsonb_build_object(
              'anuncio', (select count(*) from leads_novos where origem = 'anuncio'),
              'instagram_organico', (select count(*) from leads_novos where origem = 'instagram_organico'),
              'indicacao', (select count(*) from leads_novos where origem = 'indicacao'),
              'google', (select count(*) from leads_novos where origem = 'google'),
              'outras', (select count(*) from leads_novos where origem = 'outras'),
              'sem_origem', (select count(*) from leads_novos where origem = 'sem_origem')),
            'origem_pela_conversa', (select count(*) from leads_novos where origem_fonte = 'conversa')) end,
      'abordados', case when not f.tem_crm then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'O CRM da clínica ainda não está ligado ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', (select count(*) from abordados), 'fonte', 'crm', 'motivo_sem_dado', null, 'responsavel', null,
            'responderam', (select count(*) from abordados where respondeu),
            'agendaram', (select count(*) from abordados where agendou),
            'fecharam', (select count(*) from abordados where fechou)) end,
      'antigos', case when not f.tem_conversas then jsonb_build_object('valor', null, 'fonte', 'conversas',
            'motivo_sem_dado', 'Sem as conversas ligadas ao Nexo, não dá para saber quem voltou a chamar.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', coalesce((select pessoas from n where lista = 'antigos'), 0), 'fonte', 'conversas_e_crm',
            'motivo_sem_dado', null, 'responsavel', null,
            'por_fonte', jsonb_build_object(
              'crm_antes', (select count(*) from antigos where 'crm_antes' = any(fontes)),
              'crm_origem', (select count(*) from antigos where 'crm_origem' = any(fontes)),
              'conversa', (select count(*) from antigos where 'conversa' = any(fontes)))) end,
      'agendaram', case when not f.tem_crm and not f.tem_leitura then jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
            'motivo_sem_dado', 'Nem o CRM nem a leitura das conversas estão ligados ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', (select count(*) from agendaram), 'fonte', 'crm_e_conversa', 'motivo_sem_dado', null, 'responsavel', null,
            'por_fonte', jsonb_build_object(
              'crm', (select count(*) from agendaram where fonte = 'crm'),
              'conversa', (select count(*) from agendaram where fonte = 'conversa'),
              'crm_e_conversa', (select count(*) from agendaram where fonte = 'crm_e_conversa'))) end,
      'negociacao', case when not f.tem_crm and not f.tem_leitura then jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
            'motivo_sem_dado', 'Nem o CRM nem a leitura das conversas estão ligados ao Nexo.', 'responsavel', 'equipe_hub')
        else jsonb_build_object('valor', (select count(*) from negociacao), 'fonte', 'crm_e_conversa', 'motivo_sem_dado', null, 'responsavel', null,
            'por_fonte', jsonb_build_object(
              'crm', (select count(*) from negociacao where fonte = 'crm'),
              'conversa', (select count(*) from negociacao where fonte = 'conversa'),
              'crm_e_conversa', (select count(*) from negociacao where fonte = 'crm_e_conversa'))) end,
      'compareceram', case
        when not f.tem_crm then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'O CRM da clínica ainda não está ligado ao Nexo.', 'responsavel', 'equipe_hub')
        when not (select tem from comp_cfg) then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'o CRM não tem etapa que marque o comparecimento', 'responsavel', 'comercial')
        else jsonb_build_object('valor', coalesce((select pessoas from n where lista = 'compareceram'), 0), 'fonte', 'crm',
            'motivo_sem_dado', null, 'responsavel', null) end,
      'fecharam', case
        when not f.tem_crm then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'O CRM da clínica ainda não está ligado ao Nexo.', 'responsavel', 'equipe_hub')
        when not exists (select 1 from vendas) and f.tem_planilha and f.planilha_ultimo < (p_ate::timestamp at time zone 'America/Sao_Paulo') - interval '30 days'
          then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', format('A planilha de vendas não é atualizada desde %s.', to_char(f.planilha_ultimo at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')),
            'responsavel', 'comercial', 'alerta', 'crm-fonte-vendas-parada')
        when not exists (select 1 from vendas) and f.ganho_e_agendamento
          then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', 'O CRM marca como ganho o agendamento, e não a venda. Nenhuma venda com valor foi registrada.',
            'responsavel', 'comercial', 'alerta', 'crm-ganho-e-agendamento')
        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0
          then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', format('%s atendimentos foram encerrados no CRM sem dizer se viraram venda.', f.fechados_sem_resultado),
            'responsavel', 'equipe_hub', 'alerta', 'crm-resultado-nao-informado')
        else jsonb_build_object('valor', (select count(distinct u) from vendas), 'fonte', 'crm', 'motivo_sem_dado', null, 'responsavel', null,
            'vendas', (select count(*) from vendas),
            'valor_total', (select coalesce(sum(price), 0) from vendas),
            'sem_valor', (select count(*) from vendas where coalesce(price, 0) = 0),
            'ganho_prospeccao_sem_valor', (select count(*) from vend where prospec_sem_valor)) end
    ),
    'listas', jsonb_build_object(
      'mandaram_mensagem', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'mandaram'), 0),
          'itens', coalesce((select itens from listas where lista = 'mandaram'), '[]'::jsonb)),
      'engajaram_instagram', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'engajaram'), 0),
          'itens', coalesce((select itens from listas where lista = 'engajaram'), '[]'::jsonb)),
      'leads_novos', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'leads_novos'), 0),
          'itens', coalesce((select itens from listas where lista = 'leads_novos'), '[]'::jsonb)),
      'abordados', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'abordados'), 0),
          'itens', coalesce((select itens from listas where lista = 'abordados'), '[]'::jsonb)),
      'antigos', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'antigos'), 0),
          'itens', coalesce((select itens from listas where lista = 'antigos'), '[]'::jsonb)),
      'agendaram', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'agendaram'), 0),
          'itens', coalesce((select itens from listas where lista = 'agendaram'), '[]'::jsonb)),
      'negociacao', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'negociacao'), 0),
          'itens', coalesce((select itens from listas where lista = 'negociacao'), '[]'::jsonb)),
      'compareceram', jsonb_build_object('total', coalesce((select pessoas from n where lista = 'compareceram'), 0),
          'itens', coalesce((select itens from listas where lista = 'compareceram'), '[]'::jsonb)),
      'fecharam', jsonb_build_object('total', coalesce((select linhas from n where lista = 'fecharam'), 0),
          'itens', coalesce((select itens from listas where lista = 'fecharam'), '[]'::jsonb))
    )
  ) into v
  from flags f;
  return v;
end;
$$;
revoke all on function public.pacientes_periodo(uuid, date, date) from public, anon;
grant execute on function public.pacientes_periodo(uuid, date, date) to authenticated, service_role;
