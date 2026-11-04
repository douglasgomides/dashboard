-- Perfil da clínica: o que cada etapa do CRM quer dizer, decidido pela equipe, no lugar do nome da etapa.
-- O Nexo decidia "consulta agendada", "compareceu", "em atendimento", "ganho" e "perdido" pelo nome da etapa
-- (ilike '%consulta agendada%', ~* '(agendad|agendament)', ...) e pelas marcações de crm_etapa_kpi. Isso erra
-- quando o uso real é outro. Dra. Lana (Kommo): "Instagram [Elité Clinic] / Consulta Agendada" é depósito de 748
-- cards movidos em massa (não é agendamento); "Comercial 1 / Consulta Agendada" é passagem (89 de 95 vão para
-- "Comercial 2 / Consulta Agendada") e contava em dobro; a venda é ENTRAR no "Atendimento Clínico". Desde 01/11 um
-- robô do Kommo, ao marcar "Venda ganha", deixa o card ganho no Comercial e cria uma cópia do lead no Atendimento.
--
-- 1) crm_perfil_etapa: uma linha por etapa (crm_connection_id, pipeline_id, status_id) com o papel:
--    novo, em_atendimento, agendado, compareceu, venda, perdido, reativacao, posvenda, ignorar.
--    status_id '*' vale para o funil inteiro (etapas do funil sem linha própria; ex.: funil ignorado).
--    Perfil ativo = a conexão tem ao menos uma linha. Etapa sem linha numa conexão com perfil = sem papel.
--    Leitura: admin e membro do cliente da conexão. Escrita: só pela RPC de admin crm_definir_perfil_etapa.
-- 2) crm_perfil_conta(conexão, funil, etapa, conceito): null sem perfil (vale a regra antiga); com perfil, true/false:
--    'agendou' (agendado, compareceu, venda, posvenda), 'consulta_agendada' (agendado), 'compareceu' (compareceu,
--    venda, posvenda), 'em_atendimento', 'ganho' (venda), 'perdido', 'ignorar', 'novo'.
--    Nas funções das telas, cada regra por nome/kpi/resultado virou coalesce(crm_perfil_conta(...), <regra antiga>).
--    Card em etapa 'ignorar' sai das contas.
-- 3) Venda sem dobrar (crm_perfil_vendas): card de venda = entrou numa etapa 'venda' (data = primeira entrada, pelo
--    evento; sem evento, a criação) ou ganho. Cópia = card de venda da mesma pessoa (crm_leads.pessoa_id; sem pessoa,
--    o próprio card) até 3 dias depois de outro card de venda: é o robô; sai de todas as contas. Em
--    crm_vendas_periodo e pacientes_periodo a venda conta uma vez por pessoa no período (a primeira); o valor é o
--    maior preço entre os cards de venda da pessoa no período (cópia incluída), sem somar card e cópia.
--
-- Não destrutiva e sem efeito ao entrar: sem linha em crm_perfil_etapa, todas as funções devolvem exatamente o que
-- devolviam (scripts/test-perfil-da-clinica.ts compara antes e depois). As funções foram recriadas a partir da
-- definição em produção (pg_get_functiondef), mesmas assinaturas e colunas. pacientes_periodo (45 mil caracteres) é
-- alterada pelo texto (replace guardado: cada trecho precisa existir uma vez só, senão a migração para).
-- crm_funis_periodo: produção ainda está sem a coluna "importados" (a 20261028150000 foi editada depois de aplicada);
-- aqui ela é recriada na versão do repositório (com "importados"), por isso o drop antes do create.
--
-- Desempenho (04/11/2026): a 1ª versão chamava crm_perfil_conta por card e deixou as telas de todos os clientes 9 a 80
-- vezes mais lentas em produção (revertida no mesmo dia). Agora o papel é calculado uma vez por etapa
-- (crm_perfil_etapas) e juntado; crm_perfil_etapas/crm_perfil_vendas saem na hora quando o cliente não tem perfil.
-- Medido em produção (Lana, 13 mil cards, com perfil): métricas 0,17 s, vendas 1,1 s, pacientes 3,6 s (antes 3,2 s).
-- Em produção foi aplicada em partes (perfil_da_clinica_auxiliares*, perfil_da_clinica_telas,
-- perfil_da_clinica_pacientes_indice), com trava que media antes e depois e desfazia se ficasse mais lento.
--
-- Reversão: apagar as linhas de crm_perfil_etapa da conexão (volta ao comportamento anterior na hora). Para tirar o
-- mecanismo: recriar as funções pela definição anterior (crm_metricas_essenciais, crm_visoes_comerciais,
-- crm_diagnostico_comercial, crm_funis_periodo, crm_vendas_periodo, pacientes_cards, crm_guia_dados,
-- crm_etapas_kpi_para_analise; em pacientes_periodo, trocar de volta os trechos marcados "[perfil-da-clinica]",
-- renomeando vend_antigo/ev_etapa_antigo) e dropar crm_perfil_para_analise, crm_definir_perfil_etapa,
-- crm_perfil_vendas, crm_perfil_conta, crm_perfil_papel, crm_perfil_ativo, crm_perfil_pode_ler e a tabela crm_perfil_etapa.

create table if not exists public.crm_perfil_etapa (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null check (btrim(pipeline_id) <> ''),
  status_id text not null check (btrim(status_id) <> ''),
  papel text not null check (papel in ('novo', 'em_atendimento', 'agendado', 'compareceu', 'venda', 'perdido', 'reativacao', 'posvenda', 'ignorar')),
  nota text,
  definido_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id, status_id)
);
comment on table public.crm_perfil_etapa is
  'Perfil da clínica: o papel de cada etapa do CRM, decidido pela equipe. status_id ''*'' = funil inteiro. Sem linha para a conexão = regra antiga (nome da etapa). Só admin escreve, pela RPC crm_definir_perfil_etapa.';

alter table public.crm_perfil_etapa enable row level security;
revoke all on table public.crm_perfil_etapa from public, anon, authenticated;
grant select on table public.crm_perfil_etapa to authenticated;
grant select, insert, update, delete on table public.crm_perfil_etapa to service_role;
-- crm_connections é só do admin (tem token): o membro passa por esta checagem, que não expõe a conexão.
create or replace function public.crm_perfil_pode_ler(p_conn uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_app_admin()
      or exists (select 1 from crm_connections c where c.id = p_conn and public.is_client_member(c.client_id))
$$;
revoke all on function public.crm_perfil_pode_ler(uuid) from public, anon;
grant execute on function public.crm_perfil_pode_ler(uuid) to authenticated, service_role;
drop policy if exists "perfil da clinica: admin ou membro le" on public.crm_perfil_etapa;
create policy "perfil da clinica: admin ou membro le" on public.crm_perfil_etapa for select to authenticated
  using (public.crm_perfil_pode_ler(crm_connection_id));

-- A conexão tem perfil?
create or replace function public.crm_perfil_ativo(p_conn uuid)
returns boolean
language sql stable set search_path = public, pg_temp
as $$
  select exists (select 1 from public.crm_perfil_etapa p where p.crm_connection_id = p_conn)
$$;

-- Papel da etapa: null sem perfil; '' com perfil e sem papel; a linha da etapa vale mais que a do funil ('*').
create or replace function public.crm_perfil_papel(p_conn uuid, p_pipeline text, p_status text)
returns text
language sql stable set search_path = public, pg_temp
as $$
  select case when not public.crm_perfil_ativo(p_conn) then null
    else coalesce(
      (select p.papel from public.crm_perfil_etapa p where p.crm_connection_id = p_conn and p.pipeline_id = p_pipeline and p.status_id = p_status),
      (select p.papel from public.crm_perfil_etapa p where p.crm_connection_id = p_conn and p.pipeline_id = p_pipeline and p.status_id = '*'),
      '') end
$$;

-- A etapa conta para o conceito? null = conexão sem perfil (quem chama usa a regra antiga).
create or replace function public.crm_perfil_conta(p_conn uuid, p_pipeline text, p_status text, p_conceito text)
returns boolean
language sql stable set search_path = public, pg_temp
as $$
  select case when x.papel is null then null
    when p_conceito = 'agendou' then x.papel in ('agendado', 'compareceu', 'venda', 'posvenda')
    when p_conceito = 'consulta_agendada' then x.papel = 'agendado'
    when p_conceito = 'compareceu' then x.papel in ('compareceu', 'venda', 'posvenda')
    when p_conceito = 'em_atendimento' then x.papel = 'em_atendimento'
    when p_conceito = 'ganho' then x.papel = 'venda'
    when p_conceito = 'perdido' then x.papel = 'perdido'
    when p_conceito = 'ignorar' then x.papel = 'ignorar'
    when p_conceito = 'novo' then x.papel = 'novo'
    else false end
  from (select public.crm_perfil_papel(p_conn, p_pipeline, p_status) as papel) x
$$;

-- Papel já encontrado → conta para o conceito? Expressão pura, sem tabela: o Postgres a incorpora na consulta.
-- null = conexão sem perfil (quem chama usa a regra antiga). Mesma tabela de conceitos de crm_perfil_conta.
create or replace function public.crm_papel_conta(p_papel text, p_conceito text)
returns boolean
language sql immutable
as $$
  select case when p_papel is null then null else p_papel = any (case p_conceito
      when 'agendou' then array['agendado', 'compareceu', 'venda', 'posvenda']
      when 'consulta_agendada' then array['agendado']
      when 'compareceu' then array['compareceu', 'venda', 'posvenda']
      when 'em_atendimento' then array['em_atendimento']
      when 'ganho' then array['venda']
      when 'perdido' then array['perdido']
      when 'ignorar' then array['ignorar']
      when 'novo' then array['novo']
      else array[]::text[] end) end
$$;

-- Papel de cada etapa das conexões COM perfil do cliente: uma linha por (conexão, funil, etapa) que aparece nas
-- etapas, nos cards ou nos eventos ('' = sem papel). Conexão sem perfil não aparece: quem junta recebe null.
-- Desempenho: as telas juntam com esta lista (poucas centenas de linhas) em vez de chamar crm_perfil_conta por card
-- (chamada por linha deixou crm_metricas_essenciais 9 a 80 vezes mais lenta em produção, 04/11/2026).
create or replace function public.crm_perfil_etapas_sql(p_client uuid)
returns table(crm_connection_id uuid, pipeline_id text, status_id text, papel text)
language sql stable set search_path = public, pg_temp
as $$
  with cx as (
    select c.id from public.crm_connections c
     where c.client_id = p_client and exists (select 1 from public.crm_perfil_etapa x where x.crm_connection_id = c.id)
  ),
  et as (
    select s.crm_connection_id, s.pipeline_id, s.status_id from public.crm_pipeline_statuses s
     where s.crm_connection_id in (select id from cx)
    union
    select l.crm_connection_id, l.pipeline_id, l.status_id from public.crm_leads l
     where l.crm_connection_id in (select id from cx) and l.pipeline_id is not null and l.status_id is not null
    union
    select e.crm_connection_id, e.pipeline_para, e.status_para from public.crm_lead_eventos e
     where e.client_id = p_client and e.crm_connection_id in (select id from cx)
       and e.pipeline_para is not null and e.status_para is not null
  )
  select et.crm_connection_id, et.pipeline_id, et.status_id, coalesce(pe.papel, pf.papel, '')
    from et
    left join public.crm_perfil_etapa pe on pe.crm_connection_id = et.crm_connection_id and pe.pipeline_id = et.pipeline_id and pe.status_id = et.status_id
    left join public.crm_perfil_etapa pf on pf.crm_connection_id = et.crm_connection_id and pf.pipeline_id = et.pipeline_id and pf.status_id = '*'
$$;

-- Saída na hora (sem montar a consulta grande) quando o cliente não tem perfil: 2 ms, contra 18 a 30 ms da versão sql.
create or replace function public.crm_perfil_etapas(p_client uuid)
returns table(crm_connection_id uuid, pipeline_id text, status_id text, papel text)
language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.crm_perfil_etapa x join public.crm_connections c on c.id = x.crm_connection_id
                  where c.client_id = p_client) then
    return;
  end if;
  return query select * from public.crm_perfil_etapas_sql(p_client);
end
$$;

-- Cards de venda das conexões com perfil (uma linha por card). quando = primeira entrada numa etapa 'venda' (evento);
-- sem evento, a data do ganho (fonte ou evento "ganhou") ou a criação. copia = outro card de venda da mesma pessoa
-- nos 3 dias anteriores (robô do Kommo que copia o lead ganho para o funil de atendimento).
create or replace function public.crm_perfil_vendas_sql(p_client uuid)
returns table(lead_id uuid, crm_connection_id uuid, external_lead_id text, pessoa text, quando timestamptz,
              por_etapa boolean, copia boolean, price numeric)
language sql stable set search_path = public, pg_temp
as $$
  with cx as (select c.id from public.crm_connections c where c.client_id = p_client and public.crm_perfil_ativo(c.id)),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  dest as (
    select pe.crm_connection_id as cx, pe.pipeline_id as pp, pe.status_id as sp from pe where pe.papel = 'venda'
  ),
  ent as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, min(e.ocorreu_em) as em
      from public.crm_lead_eventos e join dest d on d.cx = e.crm_connection_id and d.pp = e.pipeline_para and d.sp = e.status_para
     where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa')
     group by 1, 2
  ),
  gan as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, max(e.ocorreu_em) as em
      from public.crm_lead_eventos e join cx on cx.id = e.crm_connection_id
     where e.client_id = p_client and e.tipo = 'ganhou'
     group by 1, 2
  ),
  v as (
    select cl.id, cl.crm_connection_id, cl.external_lead_id, cl.price,
           coalesce('p:' || cl.pessoa_id::text, 'l:' || cl.id::text) as pessoa,
           ent.em is not null or coalesce(pl.papel = 'venda', false) as por_etapa,
           coalesce(ent.em,
                    case when cl.outcome = 'won' then coalesce(public.crm_data_desfecho(cl.provider, cl.raw_payload, 'won'), gan.em) end,
                    cl.occurred_at) as quando
      from public.crm_leads_do_cliente(p_client) cl
      left join pe pl on pl.crm_connection_id = cl.crm_connection_id and pl.pipeline_id = cl.pipeline_id and pl.status_id = cl.status_id
      left join ent on ent.cx = cl.crm_connection_id and ent.ext = cl.external_lead_id
      left join gan on gan.cx = cl.crm_connection_id and gan.ext = cl.external_lead_id
     where cl.crm_connection_id in (select id from cx)
       and cl.client_id = p_client and cl.removido_na_origem is null and cl.occurred_at is not null
       and coalesce(pl.papel, '') <> 'ignorar'
       and (ent.em is not null or cl.outcome = 'won' or coalesce(pl.papel = 'venda', false))
  )
  select v.id, v.crm_connection_id, v.external_lead_id, v.pessoa, v.quando, v.por_etapa,
         coalesce(v.quando - lag(v.quando) over w <= interval '3 days', false) as copia, v.price
    from v window w as (partition by v.pessoa order by v.quando, v.id)
$$;

create or replace function public.crm_perfil_vendas(p_client uuid)
returns table(lead_id uuid, crm_connection_id uuid, external_lead_id text, pessoa text, quando timestamptz,
              por_etapa boolean, copia boolean, price numeric)
language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.crm_perfil_etapa x join public.crm_connections c on c.id = x.crm_connection_id
                  where c.client_id = p_client) then
    return;
  end if;
  return query select * from public.crm_perfil_vendas_sql(p_client);
end
$$;

revoke all on function public.crm_perfil_ativo(uuid) from public, anon;
revoke all on function public.crm_perfil_papel(uuid, text, text) from public, anon;
revoke all on function public.crm_perfil_conta(uuid, text, text, text) from public, anon;
revoke all on function public.crm_perfil_vendas(uuid) from public, anon, authenticated;
grant execute on function public.crm_perfil_ativo(uuid) to authenticated, service_role;
grant execute on function public.crm_perfil_papel(uuid, text, text) to authenticated, service_role;
grant execute on function public.crm_perfil_conta(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.crm_perfil_vendas(uuid) to service_role;
revoke all on function public.crm_papel_conta(text, text) from public, anon;
revoke all on function public.crm_perfil_etapas(uuid) from public, anon, authenticated;
revoke all on function public.crm_perfil_etapas_sql(uuid) from public, anon, authenticated;
revoke all on function public.crm_perfil_vendas_sql(uuid) from public, anon, authenticated;
grant execute on function public.crm_papel_conta(text, text) to authenticated, service_role;
grant execute on function public.crm_perfil_etapas(uuid) to service_role;
grant execute on function public.crm_perfil_etapas_sql(uuid) to service_role;
grant execute on function public.crm_perfil_vendas_sql(uuid) to service_role;

-- RPC de admin: grava o papel da etapa (p_papel null apaga a linha). p_status '*' = funil inteiro.
create or replace function public.crm_definir_perfil_etapa(p_connection uuid, p_pipeline text, p_status text, p_papel text, p_nota text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_connection is null or nullif(btrim(p_pipeline), '') is null or nullif(btrim(p_status), '') is null then
    raise exception 'etapa invalida' using errcode = '22023';
  end if;
  if not exists (select 1 from crm_connections c where c.id = p_connection) then
    raise exception 'conexao inexistente' using errcode = '22023';
  end if;
  if p_papel is null then
    delete from crm_perfil_etapa where crm_connection_id = p_connection and pipeline_id = p_pipeline and status_id = p_status;
    return;
  end if;
  if p_papel not in ('novo', 'em_atendimento', 'agendado', 'compareceu', 'venda', 'perdido', 'reativacao', 'posvenda', 'ignorar') then
    raise exception 'papel invalido' using errcode = '22023';
  end if;
  insert into crm_perfil_etapa (crm_connection_id, pipeline_id, status_id, papel, nota, definido_por, atualizado_em)
  values (p_connection, p_pipeline, p_status, p_papel, nullif(btrim(p_nota), ''), auth.uid(), now())
  on conflict (crm_connection_id, pipeline_id, status_id)
  do update set papel = excluded.papel, nota = excluded.nota, definido_por = excluded.definido_por, atualizado_em = now();
end;
$$;

-- Para o admin montar o perfil: cada etapa, quantos cards abertos/ganhos/perdidos, o papel no perfil e o que a
-- régua antiga diria (mesmo padrão de crm_etapas_kpi_para_analise).
create or replace function public.crm_perfil_para_analise(p_client_id uuid)
returns table(connection_id uuid, provider text, pipeline_id text, pipeline_name text, status_id text, status_name text,
              abertos bigint, ganhos bigint, perdidos bigint, papel text, papel_do_funil text, nota text,
              antiga_entrada boolean, antiga_consulta_agendada boolean, antiga_agendamento boolean,
              antiga_comparecimento boolean, antiga_em_atendimento boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id) filter (where coalesce(cl.outcome, 'open') = 'open'),
    count(cl.id) filter (where cl.outcome = 'won'),
    count(cl.id) filter (where cl.outcome = 'lost'),
    pe.papel, pf.papel, coalesce(pe.nota, pf.nota),
    cps.status_name ~* '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$',
    cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cc.id
      and k.pipeline_id = cps.pipeline_id and k.status_id = cps.status_id and k.kpi = 'consulta_agendada'),
    exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cc.id and k.pipeline_id = cps.pipeline_id
      and k.status_id = cps.status_id and k.kpi = 'consulta_agendada') or cps.status_name ~* '(agendad|agendament)',
    cps.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)',
    exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cc.id and k.pipeline_id = cps.pipeline_id
      and k.status_id = cps.status_id and k.kpi = 'em_atendimento') or (cps.pipeline_name ilike '%Atendimento%' and cps.status_name ilike '%Acompanhamento%')
  from crm_connections cc
  join crm_pipeline_statuses cps on cps.crm_connection_id = cc.id
  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null
    and cl.pipeline_id = cps.pipeline_id and cl.status_id = cps.status_id
  left join crm_perfil_etapa pe on pe.crm_connection_id = cc.id and pe.pipeline_id = cps.pipeline_id and pe.status_id = cps.status_id
  left join crm_perfil_etapa pf on pf.crm_connection_id = cc.id and pf.pipeline_id = cps.pipeline_id and pf.status_id = '*'
  where cc.client_id = p_client_id and cc.active and public.is_app_admin()
  group by cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name, pe.papel, pf.papel, pe.nota, pf.nota
  order by cps.pipeline_name, cps.status_name;
$$;

revoke all on function public.crm_definir_perfil_etapa(uuid, text, text, text, text) from public, anon;
revoke all on function public.crm_perfil_para_analise(uuid) from public, anon;
grant execute on function public.crm_definir_perfil_etapa(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.crm_perfil_para_analise(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- funções das telas
-- Em todas: [perfil-da-clinica] marca o que mudou. Sem perfil, crm_perfil_conta devolve null e vale a regra antiga.

CREATE OR REPLACE FUNCTION public.crm_metricas_essenciais(p_client_id uuid)
 RETURNS TABLE(total_leads bigint, consultas_agendadas bigint, em_atendimento bigint, em_atendimento_valor numeric, novos_7d bigint, ganhos bigint, perdidos bigint, fonte_preenchida_pct numeric, abertos bigint, fechados bigint, consulta_configurada boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] cópia de venda (robô) sai da conta.
  with copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  base as (
    select cl.id, cl.price, cl.outcome, cl.occurred_at, cl.source,
      cps.status_name, cps.pipeline_name,
      exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id
        and k.pipeline_id = cl.pipeline_id and k.status_id = cl.status_id
        and k.kpi = 'consulta_agendada') as marcada_consulta,
      exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id
        and k.pipeline_id = cl.pipeline_id and k.status_id = cl.status_id
        and k.kpi = 'em_atendimento') as marcada_atendimento,
      public.crm_papel_conta(pe.papel, 'consulta_agendada') as p_consulta,
      public.crm_papel_conta(pe.papel, 'em_atendimento') as p_atendimento,
      public.crm_papel_conta(pe.papel, 'ganho') as p_ganho,
      public.crm_papel_conta(pe.papel, 'perdido') as p_perdido
    from (select * from public.crm_leads_do_cliente(p_client_id) crm_leads where removido_na_origem is null) cl
    join crm_pipeline_statuses cps
      on cps.crm_connection_id = cl.crm_connection_id
      and cps.pipeline_id = cl.pipeline_id
      and cps.status_id = cl.status_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    where cl.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and coalesce(pe.papel, '') <> 'ignorar'
      and not exists (select 1 from copias c where c.lead_id = cl.id)
  )
  select
    count(*) as total_leads,
    count(*) filter (where coalesce(p_consulta, status_name ilike '%Consulta Agendada%' or marcada_consulta)) as consultas_agendadas,
    count(*) filter (where coalesce(outcome, 'open') = 'open' and coalesce(p_atendimento, (pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%') or marcada_atendimento)) as em_atendimento,
    coalesce(sum(price) filter (where coalesce(outcome, 'open') = 'open' and coalesce(p_atendimento, (pipeline_name ilike '%Atendimento%' and status_name ilike '%Acompanhamento%') or marcada_atendimento)), 0) as em_atendimento_valor,
    count(*) filter (where occurred_at > now() - interval '7 days') as novos_7d,
    count(*) filter (where coalesce(p_ganho, outcome = 'won')) as ganhos,
    count(*) filter (where coalesce(p_perdido, outcome = 'lost')) as perdidos,
    round(100.0 * count(*) filter (where source is not null)::numeric / nullif(count(*), 0), 1) as fonte_preenchida_pct,
    count(*) filter (where coalesce(outcome, 'open') = 'open') as abertos,
    count(*) filter (where outcome = 'closed') as fechados,
    -- Alguma etapa conta como consulta agendada (pelo perfil, pelo nome ou marcada pela equipe)? Sem isso, o 0 não é fato.
    exists (
      select 1 from crm_connections cc
      join crm_pipeline_statuses s on s.crm_connection_id = cc.id
      where cc.client_id = p_client_id and cc.active
        and coalesce(public.crm_perfil_conta(cc.id, s.pipeline_id, s.status_id, 'consulta_agendada'),
             s.status_name ilike '%Consulta Agendada%'
             or exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cc.id and k.pipeline_id = s.pipeline_id
                          and k.status_id = s.status_id and k.kpi = 'consulta_agendada'))
    ) as consulta_configurada
  from base;
$function$;

-- Produção está sem a coluna "importados": troca de tipo de retorno exige drop (grants refeitos logo abaixo).
do $f$
begin
  if exists (select 1 from pg_proc where oid = to_regprocedure('public.crm_funis_periodo(uuid,date,date)')
               and pg_get_function_result(oid) not like '%importados%') then
    drop function public.crm_funis_periodo(uuid, date, date);
  end if;
end
$f$;

CREATE OR REPLACE FUNCTION public.crm_funis_periodo(p_client_id uuid, p_from date, p_to date)
 RETURNS TABLE(grupo text, funil text, entraram bigint, importados bigint, consultas_agendadas bigint, ganhos bigint, ganhos_sem_valor bigint, perdidos bigint, valor_ganho numeric, etapa_do_ganho text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with lote as (
    select x.crm_connection_id, date_trunc('minute', x.occurred_at) as minuto, count(*) as n
    from public.crm_leads_do_cliente(p_client_id) x
    where x.client_id = p_client_id and x.occurred_at is not null
      and (x.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    group by 1, 2
  ),
  -- [perfil-da-clinica] cópia de venda (robô) sai da conta.
  copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  l as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id, cl.outcome, cl.price,
      coalesce(s.pipeline_name, cl.pipeline_id) as funil, s.status_name,
      nullif(btrim(cc.config->'grupos_funil'->>cl.pipeline_id), '') as grupo,
      coalesce(public.crm_papel_conta(pe.papel, 'consulta_agendada'),
       (exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id and k.pipeline_id = cl.pipeline_id
                 and k.status_id = cl.status_id and k.kpi = 'consulta_agendada')
        or coalesce(s.status_name, '') ilike '%consulta agendada%')) as em_consulta,
      coalesce(public.crm_papel_conta(pe.papel, 'ganho'), cl.outcome = 'won') as ganho,
      coalesce(public.crm_papel_conta(pe.papel, 'perdido'), cl.outcome = 'lost') as perdido,
      coalesce(lote.n, 0) >= 15 as importado
    from public.crm_leads_do_cliente(p_client_id) cl
    join crm_connections cc on cc.id = cl.crm_connection_id
    left join crm_pipeline_statuses s on s.crm_connection_id = cl.crm_connection_id and s.pipeline_id = cl.pipeline_id and s.status_id = cl.status_id
    left join lote on lote.crm_connection_id = cl.crm_connection_id and lote.minuto = date_trunc('minute', cl.occurred_at)
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and coalesce(pe.papel, '') <> 'ignorar'
      and not exists (select 1 from copias c where c.lead_id = cl.id)
  )
  select grupo, funil, count(*) filter (where not importado), count(*) filter (where importado), count(*) filter (where em_consulta),
    count(*) filter (where ganho), count(*) filter (where ganho and coalesce(price, 0) = 0),
    count(*) filter (where perdido), coalesce(sum(price) filter (where ganho), 0),
    (select l2.status_name from l l2 where l2.funil = l.funil and l2.ganho and l2.status_name is not null
      group by l2.status_name order by count(*) desc, l2.status_name limit 1)
  from l
  group by grupo, funil
  order by count(*) filter (where ganho) desc, count(*) desc;
$function$;
revoke all on function public.crm_funis_periodo(uuid, date, date) from public, anon;
grant execute on function public.crm_funis_periodo(uuid, date, date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_visoes_comerciais(p_client_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with cfg as (
    select '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$'::text as re_entrada
  ),
  conns as (
    select cc.id from crm_connections cc
    where cc.client_id = p_client_id and cc.active
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  -- [perfil-da-clinica] com perfil, a etapa diz o que é (entrada, ignorar, consulta, agendou, ganho, perdido).
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.status_name, cps.pipeline_name,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'novo'),
        cps.status_name ~* (select re_entrada from cfg)) as entrada,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'ignorar'),
        (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)')) as lista,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'consulta_agendada'),
        (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada'))) as consulta,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'agendou') as p_agendou,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'ganho') as p_ganho,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'perdido') as p_perdido
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
  copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
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
  leads as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id,
      coalesce(cl.outcome, 'open') as outcome,
      (cl.occurred_at at time zone 'America/Sao_Paulo')::date as dia,
      coalesce(e.entrada, false) as entrada,
      coalesce(e.consulta, false) as consulta,
      e.p_agendou, e.p_ganho, e.p_perdido,
      e.status_name, e.pipeline_name
    from public.crm_leads_do_cliente(p_client_id) cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
      and not coalesce(e.lista, false)
      and not exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)
      and coalesce(pe.papel, '') <> 'ignorar'
      and not exists (select 1 from copias c where c.lead_id = cl.id)
  ),
  coortes as (
    select date_trunc('week', dia)::date as semana, count(*) as leads,
      count(*) filter (where not entrada or outcome <> 'open') as atendidos,
      count(*) filter (where coalesce(p_agendou, consulta or outcome = 'won')) as agendados,
      count(*) filter (where coalesce(p_ganho, outcome = 'won')) as ganhos,
      count(*) filter (where coalesce(p_perdido, outcome = 'lost')) as perdidos,
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
      count(distinct external_lead_id) filter (where tipo = 'mudou_etapa' and para_consulta) as agendaram,
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

CREATE OR REPLACE FUNCTION public.crm_diagnostico_comercial(p_client_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with cfg as (
    select '^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$'::text as re_entrada
  ),
  conns as (
    select cc.id, cc.provider, cc.subdomain from crm_connections cc
    where cc.client_id = p_client_id and cc.active
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  -- [perfil-da-clinica] com perfil, a etapa diz o que é; "parece consulta" (estimativa pelo nome) deixa de existir.
  etapas as (
    select cps.crm_connection_id, cps.pipeline_id, cps.status_id, cps.status_name, cps.pipeline_name,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'novo'),
        cps.status_name ~* (select re_entrada from cfg)) as entrada,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'ignorar'),
        (cps.pipeline_name ~* '(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)')) as lista,
      coalesce(public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'consulta_agendada'),
        (cps.status_name ilike '%Consulta Agendada%' or exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = cps.crm_connection_id and k.pipeline_id = cps.pipeline_id
          and k.status_id = cps.status_id and k.kpi = 'consulta_agendada'))) as consulta,
      case when public.crm_perfil_ativo(cps.crm_connection_id) then false else
      (cps.status_name ~* '(agendad|agendamento)' and cps.status_name !~* '(aguard|n[ãa]o veio|resgate|redequa|reagend)') end as parece_consulta,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'agendou') as p_agendou,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'ganho') as p_ganho,
      public.crm_perfil_conta(cps.crm_connection_id, cps.pipeline_id, cps.status_id, 'perdido') as p_perdido
    from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id
  ),
  copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  ja as (
    select distinct ce.crm_connection_id, ce.external_lead_id
    from crm_lead_eventos ce
    join etapas et on et.crm_connection_id = ce.crm_connection_id and et.pipeline_id = ce.pipeline_para
      and et.status_id = ce.status_para and et.consulta
    where ce.client_id = p_client_id and ce.tipo = 'mudou_etapa'
  ),
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
  leads as (
    select cl.outcome, cl.occurred_at, cl.provider,
      (nullif(btrim(cl.source), '') is not null and btrim(cl.source) = btrim(e.pipeline_name)) as origem_eh_funil,
      ((nullif(btrim(cl.source), '') is not null and btrim(cl.source) is distinct from btrim(e.pipeline_name)) or (jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array'
        and exists (select 1 from jsonb_array_elements(cl.raw_payload->'custom_fields_values') f, jsonb_array_elements(f->'values') v
          where f->>'field_name' ~* '(fonte|origem)' and nullif(btrim(v->>'value'), '') is not null))) as tem_origem,
      (length(regexp_replace(coalesce(cl.contact_phone, ''), '\D', '', 'g')) >= 8
        or coalesce(p.telefone, p.ig_username) is not null) as tem_contato,
      coalesce(e.entrada, false) as entrada,
      (coalesce(e.lista, false) or exists (select 1 from importacao i where i.crm_connection_id = cl.crm_connection_id
        and i.dia = (cl.occurred_at at time zone 'America/Sao_Paulo')::date)) as lista,
      coalesce(e.consulta, false) as consulta,
      (ja.external_lead_id is not null) as ja_agendou,
      coalesce(e.parece_consulta and not e.consulta, false) as parece_consulta,
      e.p_agendou, e.p_ganho, e.p_perdido,
      case cl.provider
        when 'kommo' then coalesce(cl.raw_payload->>'responsible_user_id', '0') in ('0', '')
        when 'flwchat' then cl.raw_payload->>'responsibleUserId' is null
        when 'clint' then jsonb_typeof(cl.raw_payload->'user') is distinct from 'object'
        when 'rdstation' then jsonb_typeof(cl.raw_payload->'user') is distinct from 'object'
        else null end as sem_dono,
      cl.occurred_at is not null and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to as no_periodo
    from public.crm_leads_do_cliente(p_client_id) cl
    join conns on conns.id = cl.crm_connection_id
    left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
    left join ja on ja.crm_connection_id = cl.crm_connection_id and ja.external_lead_id = cl.external_lead_id
    left join pessoas p on p.id = cl.pessoa_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null
      and coalesce(pe.papel, '') <> 'ignorar'
      and not exists (select 1 from copias c where c.lead_id = cl.id)
  ),
  agg as (
    select escopo, jsonb_build_object(
      'leads', count(*),
      'atendidos', count(*) filter (where not entrada),
      'na_entrada', count(*) filter (where entrada and coalesce(not p_ganho, outcome is distinct from 'won') and coalesce(not p_perdido, outcome is distinct from 'lost')),
      'na_entrada_3d', count(*) filter (where entrada and coalesce(outcome, 'open') = 'open' and occurred_at < now() - interval '3 days'),
      'agendados', count(*) filter (where coalesce(p_agendou or ja_agendou, consulta or ja_agendou or outcome = 'won')),
      'em_consulta', count(*) filter (where consulta),
      'passou_por_consulta', count(*) filter (where ja_agendou and not consulta),
      'agendados_provaveis', count(*) filter (where coalesce(p_agendou or ja_agendou, consulta or ja_agendou or parece_consulta or outcome = 'won')),
      'ganhos_em_etapa_agenda', count(*) filter (where case when p_ganho is not null then false else outcome = 'won' and (consulta or parece_consulta) end),
      'origem_eh_funil', count(*) filter (where origem_eh_funil and not tem_origem),
      'parece_consulta', count(*) filter (where parece_consulta),
      'ganhos', count(*) filter (where coalesce(p_ganho, outcome = 'won')),
      'perdidos', count(*) filter (where coalesce(p_perdido, outcome = 'lost')),
      'com_origem', count(*) filter (where tem_origem),
      'com_contato', count(*) filter (where tem_contato),
      'abertos', count(*) filter (where coalesce(outcome, 'open') = 'open'),
      'abertos_sem_dono', count(*) filter (where coalesce(outcome, 'open') = 'open' and sem_dono),
      'dono_conhecido', bool_or(sem_dono is not null)
    ) j
    from (select 'base' escopo, * from leads where not lista
          union all select 'periodo', * from leads where no_periodo and not lista) x
    group by escopo
  )
  select jsonb_build_object(
    'provider', (select string_agg(distinct provider, ',') from conns),
    'base', coalesce((select j from agg where escopo = 'base'), '{}'::jsonb),
    'periodo', coalesce((select j from agg where escopo = 'periodo'), '{}'::jsonb),
    'lista_importada', (select count(*) from leads where lista),
    'lista_importada_periodo', (select count(*) from leads where lista and no_periodo),
    'etapas_total', (select count(*) from etapas),
    'etapas_consulta', (select count(*) from etapas where consulta),
    'etapas_consulta_equipe', (select count(*) from etapas e where exists (select 1 from crm_etapa_kpi k
        where k.crm_connection_id = e.crm_connection_id and k.pipeline_id = e.pipeline_id and k.status_id = e.status_id and k.kpi = 'consulta_agendada')),
    'etapas_entrada', (select count(*) from etapas where entrada),
    'etapas_parece_consulta', (select count(*) from etapas where parece_consulta and not consulta),
    'crm_compartilhado', (
      select jsonb_build_object('clientes', count(distinct o.client_id),
        'nomes', case when public.is_app_admin() then jsonb_agg(distinct c.name) else '[]'::jsonb end)
      from conns
      join crm_connections o on o.provider = conns.provider and o.subdomain = conns.subdomain
        and o.client_id <> p_client_id and o.active and conns.subdomain is not null and not public.crm_tem_filtro(p_client_id)
      join clients c on c.id = o.client_id)
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;

CREATE OR REPLACE FUNCTION public.crm_vendas_periodo(p_client_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  -- Funil e etapa de agendamento: mesmas regras de pacientes_cards (KPI consulta_agendada ou nome com "agendad").
  funis as (
    select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, s.pipeline_name
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client_id and (select pode from ok)
     order by s.crm_connection_id, s.pipeline_id, s.fetched_at desc nulls last
  ),
  etapas as (
    select s.crm_connection_id, s.pipeline_id, s.status_id,
           coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'consulta_agendada'),
           coalesce((exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                              and k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)')
                    and not coalesce(s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)', false), false)) as agendamento
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client_id and (select pode from ok)
  ),
  -- [perfil-da-clinica] Cards de venda pelo perfil (só conexões com perfil). Cópia do robô fica de fora.
  pv as (select v.* from public.crm_perfil_vendas(p_client_id) v where (select pode from ok)),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  cards as (
    select cl.crm_connection_id, cl.external_lead_id, cl.outcome, cl.provider,
           coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) as pk,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           cl.occurred_at,
           public.crm_origem_classifica(cl.source) as origem,
           -- Ganho sem valor numa etapa de agendamento: o CRM marca o agendamento como ganho. Não é venda.
           cl.outcome = 'won' and coalesce(e.agendamento, false) and coalesce(cl.price, 0) = 0 as ganho_agendamento,
           -- Ganho sem valor no funil de prospecção (Social Seller): é resposta à abordagem, não venda (como em pacientes_periodo).
           cl.outcome = 'won' and coalesce(cl.price, 0) = 0 and not coalesce(e.agendamento, false)
             and (coalesce(cc.config->'origem_por_funil'->>btrim(f.pipeline_name), '') ~* '^prospec'
                  or coalesce(f.pipeline_name, '') ~* '(social ?seller|prospec)'
                  or coalesce(fp.papel, '') = 'prospeccao'
                  or coalesce(public.crm_origem_classifica(cl.source), '') = 'Prospecção ativa') as ganho_prospeccao,
           case when cl.outcome = 'won' then (public.crm_data_desfecho(cl.provider, cl.raw_payload, 'won') at time zone 'America/Sao_Paulo')::date end as dg,
           -- Com perfil: a pessoa (pessoa_id; sem pessoa, o card), se é card de venda, por onde e quando.
           (pa.id is not null) as perfil,
           pv.lead_id is not null as venda_perfil, coalesce(pv.por_etapa, false) as por_etapa, pv.quando as quando_perfil,
           case when pa.id is not null then coalesce(pv.pessoa, 'p:' || cl.pessoa_id::text, 'l:' || cl.id::text)
                else coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) end as chave,
           coalesce(public.crm_papel_conta(pe.papel, 'perdido'), cl.outcome = 'lost') as perdido
      from public.crm_leads_do_cliente(p_client_id) cl
      join crm_connections cc on cc.id = cl.crm_connection_id
      left join funis f on f.crm_connection_id = cl.crm_connection_id and f.pipeline_id = cl.pipeline_id
      left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
      left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
      left join pv on pv.lead_id = cl.id
      left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
      left join (select distinct pe.crm_connection_id as id from pe) pa on pa.id = cl.crm_connection_id
     where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
       and (select pode from ok)
       and coalesce(pe.papel, '') <> 'ignorar'
       and not coalesce(pv.copia, false)
  ),
  -- Com perfil: card de venda (etapa 'venda', ou ganho que não é agendamento nem prospecção sem valor).
  ganhos as (
    select * from cards where not perfil and outcome = 'won' and not ganho_agendamento and not ganho_prospeccao
    union all
    select * from cards where perfil and venda_perfil and (por_etapa or not (ganho_agendamento or ganho_prospeccao))
  ),
  ev as (
    select e.crm_connection_id, e.external_lead_id, e.tipo, (e.ocorreu_em at time zone 'America/Sao_Paulo')::date as d
      from crm_lead_eventos e
     where e.client_id = p_client_id and e.tipo in ('ganhou', 'fechou') and (select pode from ok)
  ),
  ult_ganho as (select crm_connection_id, external_lead_id, max(d) as d from ev where tipo = 'ganhou' group by 1, 2),
  -- Data da venda: a da fonte (Clint won_at, RD closed_at); sem ela, o evento "ganhou"; sem evento, a entrada.
  -- Com perfil: a primeira entrada na etapa de venda, uma venda por pessoa no período (a primeira).
  no_periodo as (
    select c.* from cards c left join ult_ganho g using (crm_connection_id, external_lead_id)
     where not c.perfil and c.outcome = 'won' and case when c.dg is not null then c.dg between p_from and p_to
                else exists (select 1 from ev x where x.tipo = 'ganhou' and x.d between p_from and p_to
                              and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id)
                     or (g.d is null and c.d between p_from and p_to) end
    union all
    select p.* from (
      select distinct on (x.chave) x.* from ganhos x
       where x.perfil and (x.quando_perfil at time zone 'America/Sao_Paulo')::date between p_from and p_to
       order by x.chave, x.quando_perfil, x.external_lead_id) p
  ),
  vendas as (select * from no_periodo where not ganho_agendamento and not ganho_prospeccao),
  coorte as (select * from ganhos where d between p_from and p_to),
  novas as (select n.pk, n.primeiro, n.com_origem from public.crm_pessoas_novas(p_client_id, p_from, p_to) n where (select pode from ok)),
  novas_origem as (
    select n.pk, coalesce((array_agg(c.origem order by c.origem is null, c.occurred_at) filter (where c.d = n.primeiro))[1], 'Não informado') as origem,
           bool_or(case when c.perfil then c.venda_perfil and (c.por_etapa or not (c.ganho_agendamento or c.ganho_prospeccao))
                        else c.outcome = 'won' and not c.ganho_agendamento and not c.ganho_prospeccao end
                   and c.d between p_from and p_to) as virou_venda
      from novas n join cards c on c.pk = n.pk
     group by n.pk
  ),
  -- Ganhos da coorte de quem não é pessoa nova (orçamento de quem já era paciente).
  coorte_antigos as (select c.* from coorte c where not exists (select 1 from novas n where n.pk = c.pk)),
  por_origem as (
    select origem, count(*) as pessoas, count(*) filter (where virou_venda) as vendas
      from novas_origem group by origem
  )
  select jsonb_build_object(
    -- Decisão do dono (01/11/2026): venda conta PESSOAS. Os cards (orçamentos ganhos) seguem como informação secundária.
    'pessoas_no_periodo', (select count(distinct chave) from vendas),
    'pessoas_no_periodo_ja_no_crm', (select count(distinct v.chave) from vendas v where not exists (select 1 from novas n where n.pk = v.pk)),
    'pessoas_coorte', (select count(distinct chave) from coorte),
    'vendas_no_periodo', (select count(*) from vendas),
    'vendas_com_data_da_fonte', (select count(*) from vendas where dg is not null),
    'ganhos_total', (select count(*) from ganhos),
    'ganhos_com_data_da_fonte', (select count(*) from ganhos where dg is not null),
    'vendas_coorte', (select count(*) from coorte),
    'vendas_coorte_pessoas_novas', (select count(*) from novas_origem where virou_venda),
    'vendas_coorte_ja_pacientes', (select count(*) from coorte_antigos),
    'pessoas_coorte_ja_pacientes', (select count(distinct chave) from coorte_antigos),
    'ganhos_agendamento_sem_valor', (select count(*) from no_periodo where ganho_agendamento),
    'ganhos_agendamento_sem_valor_coorte', (select count(*) from cards where ganho_agendamento and d between p_from and p_to),
    'ganhos_prospeccao_sem_valor', (select count(*) from no_periodo where ganho_prospeccao),
    'perdidos_coorte', (select count(*) from cards where perdido and d between p_from and p_to),
    'fechados_sem_resultado', (select count(*) from cards c where c.outcome = 'closed' and (c.d between p_from and p_to
        or exists (select 1 from ev x where x.tipo = 'fechou' and x.d between p_from and p_to
                    and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id))),
    'ultima_venda', (select max(coalesce(case when c.perfil then (c.quando_perfil at time zone 'America/Sao_Paulo')::date end, c.dg, g.d, c.d))
                       from ganhos c left join ult_ganho g using (crm_connection_id, external_lead_id)),
    'eventos_desde', (select (min(e.registrado_em) at time zone 'America/Sao_Paulo')::date from crm_lead_eventos e
                       where e.client_id = p_client_id and (select pode from ok)),
    'planilha_ultimo', (select max(c.d) from cards c join crm_connections cc on cc.id = c.crm_connection_id
                         where cc.active and c.provider = 'planilha'),
    'pessoas_novas', (select count(*) from novas),
    'pessoas_novas_com_origem', (select count(*) from novas_origem where origem <> 'Não informado'),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', origem, 'pessoas', pessoas, 'vendas', vendas)
                                             order by pessoas desc, origem) from por_origem), '[]'::jsonb)
  )
  where (select pode from ok);
$function$;

CREATE OR REPLACE FUNCTION public.pacientes_cards(p_client uuid)
 RETURNS TABLE(id uuid, cx uuid, ext text, u text, pid uuid, pk text, d date, occurred_at timestamp with time zone, outcome text, price numeric, contact_name text, funil text, etapa text, papel text, em_agendamento boolean, em_comparecimento boolean, prospec boolean, origem text, procedimento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with funis as (
    select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, s.pipeline_name
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client
     order by s.crm_connection_id, s.pipeline_id, s.fetched_at desc nulls last
  ),
  -- [perfil-da-clinica] com perfil, agendamento = etapa 'agendado'; comparecimento = 'compareceu', 'venda' ou 'posvenda'.
  etapas as (
    select s.crm_connection_id, s.pipeline_id, s.status_id, s.status_name,
           coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'consulta_agendada'),
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                     and k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)') as agendamento,
           coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'),
           exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                     and k.status_id = s.status_id and false and k.kpi = 'em_atendimento')
             or s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as comparecimento
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client
  ),
  copias as (select v.lead_id from public.crm_perfil_vendas(p_client) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
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
      from public.crm_leads_do_cliente(p_client) cl
      join crm_connections cc on cc.id = cl.crm_connection_id
      left join funis f on f.crm_connection_id = cl.crm_connection_id and f.pipeline_id = cl.pipeline_id
      left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
      left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
      left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
     where cl.client_id = p_client and cl.removido_na_origem is null and cl.occurred_at is not null
       and coalesce(pe.papel, '') <> 'ignorar'
       and not exists (select 1 from copias x where x.lead_id = cl.id)
  ),
  pessoa_da_chave as (
    select b.pk, coalesce(max(b.pessoa_id::text), max(p.id::text))::uuid as pid
      from base b
      left join pessoas p on p.client_id = p_client and b.pk like 't:%' and p.telefone_chave = substr(b.pk, 3)
     group by b.pk
  )
  select b.id, b.cx, b.ext, coalesce('p:' || x.pid::text, 'k:' || b.pk), x.pid, b.pk, b.d, b.occurred_at, b.outcome, b.price,
         b.contact_name, b.funil, b.etapa, b.papel, b.em_agendamento, b.em_comparecimento, b.prospec, b.origem, b.procedimento
    from base b join pessoa_da_chave x on x.pk = b.pk;
$function$;

CREATE OR REPLACE FUNCTION public.crm_guia_dados(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with conns as (
    select cc.id, cc.provider from crm_connections cc
    where cc.client_id = p_client_id and cc.active and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  -- [perfil-da-clinica] etapa ignorada e cópia de venda saem; ganho/perdido seguem o perfil.
  copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  leads as (
    select cl.*, cps.pipeline_name as funil, cps.status_name as etapa,
      coalesce(public.crm_papel_conta(pe.papel, 'ganho'), cl.outcome = 'won') as ganho,
      coalesce(public.crm_papel_conta(pe.papel, 'perdido'), cl.outcome = 'lost') as perdido
    from crm_leads cl join conns on conns.id = cl.crm_connection_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id
    where cl.client_id = p_client_id and cl.removido_na_origem is null
      and coalesce(pe.papel, '') <> 'ignorar'
      and not exists (select 1 from copias c where c.lead_id = cl.id)
  ),
  l90 as (select * from leads where occurred_at >= now() - interval '90 days')
  select jsonb_build_object(
    'provider', (select string_agg(distinct provider, ',') from conns),
    -- Com perfil, cada etapa leva o papel definido pela equipe ('' = sem papel); a tela usa no lugar do nome.
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('pipeline_name', cps.pipeline_name, 'status_name', cps.status_name,
        'total', (select count(*) from leads l where l.crm_connection_id = cps.crm_connection_id and l.pipeline_id = cps.pipeline_id and l.status_id = cps.status_id))
        || case when public.crm_perfil_ativo(cps.crm_connection_id)
                then jsonb_build_object('papel_perfil', public.crm_perfil_papel(cps.crm_connection_id, cps.pipeline_id, cps.status_id))
                else '{}'::jsonb end)
      from crm_pipeline_statuses cps join conns on conns.id = cps.crm_connection_id), '[]'::jsonb),
    'leads', (select count(*) from l90),
    'com_origem', (select count(*) from l90 where (nullif(btrim(source), '') is not null and btrim(source) is distinct from btrim(funil))
        or (jsonb_typeof(raw_payload->'custom_fields_values') = 'array' and exists (select 1 from jsonb_array_elements(raw_payload->'custom_fields_values') f, jsonb_array_elements(f->'values') v
          where f->>'field_name' ~* '(fonte|origem|utm_source)' and nullif(btrim(v->>'value'), '') is not null))),
    'perdidos', (select count(*) from l90 where perdido),
    'perdidos_com_motivo', (select count(*) from l90 where perdido and (
        coalesce(raw_payload->>'loss_reason_id', '0') not in ('0', '')
        or nullif(raw_payload->>'lost_status_id', '') is not null
        or jsonb_typeof(raw_payload->'deal_lost_reason') = 'object'
        or nullif(raw_payload->>'motivo_perda', '') is not null)),
    'ganhos', (select count(*) from l90 where ganho),
    'com_valor_no_ganho', (select count(*) from l90 where ganho and greatest(
        coalesce(nullif(raw_payload->>'price', '')::numeric, 0), coalesce(nullif(raw_payload->>'value', '')::numeric, 0),
        coalesce(nullif(raw_payload->>'amount_total', '')::numeric, 0), coalesce(nullif(raw_payload->>'monetaryAmount', '')::numeric, 0)) > 0),
    'abertos', (select count(*) from leads where coalesce(outcome, 'open') = 'open'),
    'parados_90', (select count(*) from leads where coalesce(outcome, 'open') = 'open'
        and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) < now() - interval '90 days'),
    'sem_dono', (select count(*) filter (where case provider
        when 'kommo' then coalesce(raw_payload->>'responsible_user_id', '0') in ('0', '')
        when 'flwchat' then raw_payload->>'responsibleUserId' is null
        when 'clint' then jsonb_typeof(raw_payload->'user') is distinct from 'object'
        when 'rdstation' then jsonb_typeof(raw_payload->'user') is distinct from 'object'
        else false end) from leads where coalesce(outcome, 'open') = 'open')
  )
  where public.is_app_admin() or public.is_client_member(p_client_id);
$function$;

CREATE OR REPLACE FUNCTION public.crm_etapas_kpi_para_analise(p_client_id uuid)
 RETURNS TABLE(connection_id uuid, provider text, pipeline_id text, pipeline_name text, status_id text, status_name text, total bigint, consulta_agendada boolean, em_atendimento boolean, padrao_consulta boolean, padrao_atendimento boolean, origem_consulta text, origem_atendimento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] com perfil, consulta agendada e em atendimento vêm do papel da etapa.
  select cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id),
    coalesce(public.crm_perfil_conta(cc.id, cps.pipeline_id, cps.status_id, 'consulta_agendada'),
      (max(kc.kpi) is not null) or (cps.status_name ilike '%Consulta Agendada%')),
    coalesce(public.crm_perfil_conta(cc.id, cps.pipeline_id, cps.status_id, 'em_atendimento'),
      (max(ka.kpi) is not null) or (cps.pipeline_name ilike '%Atendimento%' and cps.status_name ilike '%Acompanhamento%')),
    (cps.status_name ilike '%Consulta Agendada%'),
    (cps.pipeline_name ilike '%Atendimento%' and cps.status_name ilike '%Acompanhamento%'),
    max(kc.origem), max(ka.origem)
  from crm_connections cc
  join crm_pipeline_statuses cps on cps.crm_connection_id = cc.id
  left join crm_leads cl on cl.crm_connection_id = cc.id and cl.removido_na_origem is null
    and cl.pipeline_id = cps.pipeline_id and cl.status_id = cps.status_id
  left join crm_etapa_kpi kc on kc.crm_connection_id = cc.id and kc.pipeline_id = cps.pipeline_id
    and kc.status_id = cps.status_id and kc.kpi = 'consulta_agendada'
  left join crm_etapa_kpi ka on ka.crm_connection_id = cc.id and ka.pipeline_id = cps.pipeline_id
    and ka.status_id = cps.status_id and ka.kpi = 'em_atendimento'
  where cc.client_id = p_client_id and cc.active and public.is_app_admin()
  group by cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name
  order by cps.pipeline_name, cps.status_name;
$function$;

-- pacientes_periodo: alterada pelo texto da definição atual (mesmo padrão de 20261102140000). Cada trecho antigo
-- precisa aparecer exatamente uma vez; senão a migração para sem mudar nada. Rodar de novo não muda nada.
do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  trocas text[][] := array[
    -- Eventos de etapa: expõe a etapa de destino e, com perfil, o tipo vem do papel.
    array['  ev_etapa as (' || chr(10), '  ev_etapa_antigo as (' || chr(10)],
    array['select e.crm_connection_id as cx, e.external_lead_id as ext, e.ocorreu_em,',
          'select e.crm_connection_id as cx, e.external_lead_id as ext, e.ocorreu_em, e.pipeline_para as pp, e.status_para as sp,'],
    array['  mexeu as (' || chr(10), $t$  -- [perfil-da-clinica] com perfil, agendamento = etapa 'agendado'; comparecimento = 'compareceu', 'venda', 'posvenda'.
  -- Papel das etapas (só conexões com perfil), calculado uma vez e juntado (sem função por linha).
  pe_pp as materialized (select * from public.crm_perfil_etapas(p_client)),
  ev_etapa as (
    select a.cx, a.ext, a.ocorreu_em,
           coalesce(public.crm_papel_conta(x.papel, 'consulta_agendada'), a.agendamento) as agendamento,
           coalesce(public.crm_papel_conta(x.papel, 'compareceu'), a.comparecimento) as comparecimento
      from ev_etapa_antigo a
      left join pe_pp x on x.crm_connection_id = a.cx and x.pipeline_id = a.pp and x.status_id = a.sp
  ),
  mexeu as ($t$ || chr(10)],
    -- Vendas: conexão sem perfil segue a regra antiga; com perfil, uma venda por pessoa no período.
    array['  vend as (' || chr(10), '  vend_antigo as (' || chr(10)],
    array['  ck_cob as materialized (', $t$  -- [perfil-da-clinica] Venda pelo perfil (20261104100000): primeira entrada na etapa 'venda' (ou ganho), sem a
  -- cópia do robô, uma por pessoa no período. Valor: o maior preço entre os cards de venda da pessoa no período.
  pv_periodo as (
    select v.*, max(v.price) over (partition by v.pessoa) as preco
      from public.crm_perfil_vendas(p_client) v
     where v.quando >= v_ini and v.quando < v_fim
  ),
  vend as (
    select a.* from vend_antigo a
     where not exists (select 1 from cards c where c.id = a.id and c.cx in (select x.crm_connection_id from pe_pp x))
    union all
    select p.* from (
      select distinct on (c.u) c.id, c.u, v.quando, v.preco as price, c.funil, c.procedimento,
             c.prospec and coalesce(v.preco, 0) = 0 as prospec_sem_valor
        from pv_periodo v join cards c on c.id = v.lead_id
       where not v.copia and (v.por_etapa or not (c.em_agendamento and coalesce(c.price, 0) = 0))
       order by c.u, v.quando, c.id) p
  ),
  ck_cob as materialized ($t$],
    -- Em negociação: com perfil, card aberto em etapa 'em_atendimento'.
    array['     where c.outcome = ''open'' and not c.em_agendamento and not c.em_comparecimento' || chr(10),
          $t$      left join lateral (select public.crm_papel_conta(x.papel, 'em_atendimento') as ea from crm_leads pl
                           join pe_pp x on x.crm_connection_id = pl.crm_connection_id and x.pipeline_id = pl.pipeline_id and x.status_id = pl.status_id
                          where pl.id = c.id) pf on true
     where c.outcome = 'open' and coalesce(pf.ea, not c.em_agendamento and not c.em_comparecimento)$t$ || chr(10)],
    array['       and c.papel in (''captacao'', ''venda'')' || chr(10), '       and coalesce(pf.ea, c.papel in (''captacao'', ''venda''))' || chr(10)],
    array['       and coalesce(c.etapa, '''') !~* ''(caixa de leads', '       and coalesce(pf.ea, coalesce(c.etapa, '''') !~* ''(caixa de leads'],
    array['|levantou a m|incoming leads|leads de entrada|^entrada|\(automa)''' || chr(10), '|levantou a m|incoming leads|leads de entrada|^entrada|\(automa)'')' || chr(10)],
    array['       and coalesce(c.funil, '''') !~* ''cad[eê]ncia''' || chr(10), '       and coalesce(pf.ea, coalesce(c.funil, '''') !~* ''cad[eê]ncia'')' || chr(10)],
    -- Etapa de comparecimento existe? Com perfil, pelo papel.
    array[$t$                                 and s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as tem),$t$,
          $t$                                 and coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)')) as tem),$t$],
    array[$t$       and s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)';$t$,
          $t$       and coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'compareceu'), s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)');$t$]
  ];
  i int;
  n int;
begin
  if position('ev_etapa_antigo' in d) > 0 then return; end if;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then
      raise exception 'pacientes_periodo: trecho % aparece % vezes (esperado 1): %', i, n, left(trocas[i][1], 80);
    end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migra$;
