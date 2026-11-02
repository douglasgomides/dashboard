-- Regra por médico em todas as portas (segunda auditoria de 01/11/2026).
--
-- Contas de CRM e de atendimento divididas entre médicos (Kommo do HOMS, Digisac da IGM Palmas, WTS da Dra. Juliana
-- e da Dra. Mariela) são gravadas inteiras dentro de cada cliente, e a regra crm_filtro_cliente diz o que é de cada
-- um (20261102160000/170000). A regra só valia em parte das leituras:
--   - "O que mudou" (prova_resultado) e a auditoria comercial (auditoria_comercial) contavam a conta inteira:
--     Dra. Rafaela 934 conversas lidas na auditoria comercial, quase o mesmo que o Dr. Antonione (923);
--   - resumos por IA, temas, mensagens, eventos de card, toques, origem de anúncio e busca de pacientes só
--     perguntavam se a pessoa é membro do cliente (Rafaela: 910 resumos de pacientes do IGM ao alcance do login dela);
--   - sessão do WTS transferida de uma médica para a outra ficava nos dois clientes (4 sessões, 3 conversas).
--
-- O que muda:
--   1. Leituras por cliente para as tabelas que faltavam, todas pelo mesmo critério das que já existiam:
--      mensagens_do_cliente, conversas_resumos_do_cliente, conversas_tema_do_cliente,
--      conversas_origem_anuncio_do_cliente (seguem a conversa: conversas_do_cliente), crm_lead_eventos_do_cliente
--      (segue o card: crm_leads_do_cliente), toques_do_cliente e pessoas_do_cliente (seguem a pessoa: some só a
--      pessoa que tem card ou conversa e nenhum deles passa na regra, como crm_membro_ve_pessoa).
--      São invoker, SQL e sem SET: o Postgres as embute nas RPCs, e a regra é lida uma vez por consulta (semi-junção
--      com a leitura em conjunto), sem função por linha. Sem regra para o cliente, devolvem as mesmas linhas de antes.
--   2. Todas as RPCs definer de cliente que leem essas tabelas direto passam a ler pelas leituras do cliente (mesmo
--      mecanismo de 20261102160000: reescrita sobre pg_get_functiondef). Funções de sincronização e de saúde da
--      fonte (client_sync_status, fontes_base, operacao_fontes) ficam como estão: contam o que o sync gravou.
--      Funções que recebem a conversa ou a pessoa (ler_mensagens, mensagens_automaticas, jornada_pessoa) passam a
--      conferir a regra para quem não é admin. As operacao_* (PR169, intocáveis pelo teste de banco) recebem o id do
--      trabalho ou da sugestão, que o membro só descobre pela leitura de operacao_recuperacao/sugestoes_agentes,
--      agora dentro da regra.
--   3. Leitura direta (policies): conversas_resumos, conversas_tema, conversas_origem_anuncio, crm_lead_eventos,
--      toques, operacao_recuperacao e sugestoes_agentes trocam "membro do cliente" por "membro, dentro da regra".
--      A checagem é em conjunto: as conversas/cards/pessoas que o membro vê são calculadas uma vez por consulta
--      (subconsulta sem correlação, com hash), não por linha. Admin e service_role sem mudança.
--   4. Sessão transferida (WTS): o dono é o cliente da equipe atual. A cópia antiga não é apagada: fica marcada
--      (wts_sessions.movida_para_client_id, e a conversa da cópia também, por gatilho) e sai das leituras.
--      O sync marca (api/_lib/wts-sync.ts) e desmarca quando a sessão volta. Correção das cópias que já existem:
--      supabase/correcoes/20261102_wts_sessoes_transferidas.sql (só UPDATE).
--   5. Digisac: contato sem etiqueta de médico fica com a clínica (regra 'excluir', painel do Dr. Antonione), por
--      decisão da clínica. pacientes_periodo devolve crm_sem_medico {total, periodo} para a tela dizer isso.
--
-- Não destrutiva: colunas novas (nulas), funções novas, funções recriadas com a mesma assinatura e 7 policies
-- trocadas (drop só do nome exato substituído, com a nova criada na mesma transação). Nenhum dado é apagado.
--
-- Reversão: recriar as 7 policies antigas com (is_app_admin() or is_client_member(client_id)) (operacao_recuperacao:
-- "and tem_modulo(client_id, 'hub')") e dropar as novas; recriar as funções reescritas pela definição anterior
-- (as migrações que as criaram); conversas_do_cliente e wts_sessoes_do_cliente pela 20261102170000. As colunas
-- movida_para_client_id/movida_em e o gatilho podem ficar (ou: zerar a coluna, que devolve as cópias às leituras).

-- 4. Sessão transferida: marca em vez de apagar -----------------------------------------------------------------
alter table public.wts_sessions add column if not exists movida_para_client_id uuid references public.clients(id) on delete set null;
alter table public.wts_sessions add column if not exists movida_em timestamptz;
alter table public.conversas add column if not exists movida_para_client_id uuid references public.clients(id) on delete set null;
alter table public.conversas add column if not exists movida_em timestamptz;
comment on column public.wts_sessions.movida_para_client_id is
  'Sessão transferida para a equipe de outro cliente da mesma conta: esta cópia ficou com o dono antigo e sai das leituras. O sync marca e desmarca. Null = vale.';
comment on column public.conversas.movida_para_client_id is
  'A sessão desta conversa foi transferida para outro cliente da mesma conta (wts_sessions.movida_para_client_id): a conversa sai das leituras deste cliente. Null = vale.';

-- A conversa da cópia segue a sessão (marca e desmarca junto).
create or replace function public.wts_sessao_movida_gatilho()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.conversas c
     set movida_para_client_id = new.movida_para_client_id,
         movida_em = case when new.movida_para_client_id is null then null else coalesce(new.movida_em, now()) end
   where c.client_id = new.client_id and c.externo_id = new.session_id
     and c.movida_para_client_id is distinct from new.movida_para_client_id;
  return null;
end
$$;
revoke all on function public.wts_sessao_movida_gatilho() from public, anon, authenticated;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.wts_sessions'::regclass and tgname = 'wts_sessao_movida') then
    create trigger wts_sessao_movida after update of movida_para_client_id on public.wts_sessions
      for each row when (old.movida_para_client_id is distinct from new.movida_para_client_id)
      execute function public.wts_sessao_movida_gatilho();
  end if;
end $t$;

-- conversas_do_cliente e wts_sessoes_do_cliente (20261102170000) + cópia movida fora.
create or replace function public.conversas_do_cliente(p_client uuid)
returns setof public.conversas
language sql stable
as $$
  select c.* from public.conversas c
    cross join (select coalesce(bool_or(f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')), false) as tem_card,
                       coalesce(bool_or(f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.modo = 'incluir'), false) as tem_card_incluir,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe')), false) as tem_dep,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), false) as tem_dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), '{}'::text[]) as dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'excluir'), '{}'::text[]) as dep_excluir
                  from public.crm_filtro_cliente f where f.client_id = p_client) g
    left join public.crm_leads l on g.tem_card and l.id = c.lead_id and l.client_id = p_client
    left join (select f.crm_connection_id as cx,
                      bool_or(f.modo = 'incluir') as tem_incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'incluir'), '{}'::text[]) as incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'excluir'), '{}'::text[]) as excluir
                 from public.crm_filtro_cliente f
                 cross join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k
                where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.crm_connection_id is not null
                group by f.crm_connection_id) r on r.cx = l.crm_connection_id
    left join public.wts_sessions s on g.tem_dep and s.client_id = p_client and s.session_id = c.externo_id
   where c.client_id = p_client
     and c.movida_para_client_id is null
     and (not g.tem_card
          or case when l.id is null then not g.tem_card_incluir
                  else (r.cx is null or ((not r.tem_incluir or public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.incluir) and not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.excluir))) end)
     and (not g.tem_dep
          or case when s.session_id is null then not g.tem_dep_incluir
                  else ((not g.tem_dep_incluir or coalesce(s.department_id = any(g.dep_incluir), false))
                        and not coalesce(s.department_id = any(g.dep_excluir), false)) end)
$$;

create or replace function public.wts_sessoes_do_cliente(p_client uuid)
returns setof public.wts_sessions
language sql stable
as $$
  select s.* from public.wts_sessions s
    cross join (select coalesce(bool_or(f.tipo in ('departamento', 'equipe')), false) as tem_dep,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), false) as tem_dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), '{}'::text[]) as dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'excluir'), '{}'::text[]) as dep_excluir,
                       coalesce(bool_or(k.provider = 'digisac' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')), false) as tem_dig,
                       coalesce(bool_or(k.provider = 'digisac' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.modo = 'incluir'), false) as tem_dig_incluir
                  from public.crm_filtro_cliente f left join public.crm_connections k on k.id = f.crm_connection_id
                 where f.client_id = p_client) g
    left join lateral (select l.id, l.crm_connection_id, l.pipeline_id, l.filtro_chaves, l.raw_payload
                         from public.crm_connections k
                         join public.crm_leads l on l.crm_connection_id = k.id and l.external_lead_id = s.contact_id
                        where g.tem_dig and k.client_id = p_client and k.provider = 'digisac' and l.client_id = p_client
                        order by l.removido_na_origem nulls first, l.occurred_at desc nulls last limit 1) l on true
    left join (select f.crm_connection_id as cx,
                      bool_or(f.modo = 'incluir') as tem_incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'incluir'), '{}'::text[]) as incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'excluir'), '{}'::text[]) as excluir
                 from public.crm_filtro_cliente f
                 cross join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k
                where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.crm_connection_id is not null
                group by f.crm_connection_id) r on r.cx = l.crm_connection_id
   where s.client_id = p_client
     and s.movida_para_client_id is null
     and ((not g.tem_dep_incluir or coalesce(s.department_id = any(g.dep_incluir), false))
                        and not coalesce(s.department_id = any(g.dep_excluir), false))
     and (not g.tem_dig
          or case when l.id is null then not g.tem_dig_incluir
                  else (r.cx is null or ((not r.tem_incluir or public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.incluir) and not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.excluir))) end)
$$;

-- 1. Leituras por cliente que faltavam ------------------------------------------------------------------------
-- Tudo que é de uma conversa segue a conversa.
create or replace function public.mensagens_do_cliente(p_client uuid)
returns setof public.mensagens
language sql stable
as $$
  select m.* from public.mensagens m
   where m.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or m.conversa_id in (select c.id from public.conversas_do_cliente(p_client) c))
$$;

create or replace function public.conversas_resumos_do_cliente(p_client uuid)
returns setof public.conversas_resumos
language sql stable
as $$
  select r.* from public.conversas_resumos r
   where r.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or r.conversa_id in (select c.id from public.conversas_do_cliente(p_client) c))
$$;

create or replace function public.conversas_tema_do_cliente(p_client uuid)
returns setof public.conversas_tema
language sql stable
as $$
  select t.* from public.conversas_tema t
   where t.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or t.conversa_id in (select c.id from public.conversas_do_cliente(p_client) c))
$$;

create or replace function public.conversas_origem_anuncio_do_cliente(p_client uuid)
returns setof public.conversas_origem_anuncio
language sql stable
as $$
  select o.* from public.conversas_origem_anuncio o
   where o.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or o.conversa_id in (select c.id from public.conversas_do_cliente(p_client) c))
$$;

-- Evento de card segue o card (conexão + id do card na origem).
create or replace function public.crm_lead_eventos_do_cliente(p_client uuid)
returns setof public.crm_lead_eventos
language sql stable
as $$
  select e.* from public.crm_lead_eventos e
   where e.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or (e.crm_connection_id, e.external_lead_id) in (select l.crm_connection_id, l.external_lead_id from public.crm_leads_do_cliente(p_client) l))
$$;

-- Pessoas que a regra esconde: têm card ou conversa no cliente e nenhum deles passa (mesma regra de crm_membro_ve_pessoa).
create or replace function public.crm_pessoas_ocultas(p_client uuid)
returns setof uuid
language sql stable
as $$
  (select l.pessoa_id from public.crm_leads l where l.client_id = p_client and l.pessoa_id is not null
   union
   select c.pessoa_id from public.conversas c where c.client_id = p_client and c.pessoa_id is not null)
  except
  (select l.pessoa_id from public.crm_leads_do_cliente(p_client) l where l.pessoa_id is not null
   union
   select c.pessoa_id from public.conversas_do_cliente(p_client) c where c.pessoa_id is not null)
$$;

create or replace function public.toques_do_cliente(p_client uuid)
returns setof public.toques
language sql stable
as $$
  select t.* from public.toques t
   where t.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or t.pessoa_id is null
          or t.pessoa_id not in (select o from public.crm_pessoas_ocultas(p_client) o))
$$;

create or replace function public.pessoas_do_cliente(p_client uuid)
returns setof public.pessoas
language sql stable
as $$
  select p.* from public.pessoas p
   where p.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or p.id not in (select o from public.crm_pessoas_ocultas(p_client) o))
$$;

-- Uma conversa passa na regra do cliente? (decisão de uma linha só: conversa aberta, resumo pedido na API)
create or replace function public.crm_conversa_na_regra(p_client uuid, p_conversa uuid)
returns boolean
language sql stable
as $$
  select exists (select 1 from public.conversas_do_cliente(p_client) c where c.id = p_conversa)
$$;

-- Quem chama pode ver esta conversa? Admin sempre; membro só dentro da regra. Definer: o membro não lê conversas.
create or replace function public.crm_membro_ve_conversa(p_client uuid, p_conversa uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.is_app_admin() or (public.is_client_member(p_client) and public.crm_conversa_na_regra(p_client, p_conversa))
$$;

-- Para as policies: o que o membro logado vê, em conjunto (uma vez por consulta). Só clientes de que ele é membro
-- e que têm regra; os outros clientes dele não entram (a policy os libera antes, sem calcular nada).
create or replace function public.crm_membro_clientes_com_regra(p_so_card boolean)
returns setof uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct f.client_id from public.crm_filtro_cliente f
   where public.is_client_member(f.client_id)
     and (not p_so_card or f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
$$;

create or replace function public.crm_membro_conversas_visiveis()
returns setof uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id from public.crm_membro_clientes_com_regra(false) r(client_id)
   cross join lateral public.conversas_do_cliente(r.client_id) c
$$;

create or replace function public.crm_membro_leads_visiveis()
returns table(crm_connection_id uuid, external_lead_id text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct l.crm_connection_id, l.external_lead_id from public.crm_membro_clientes_com_regra(true) r(client_id)
   cross join lateral public.crm_leads_do_cliente(r.client_id) l
   where l.external_lead_id is not null
$$;

create or replace function public.crm_membro_pessoas_ocultas()
returns setof uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select o from public.crm_membro_clientes_com_regra(false) r(client_id)
   cross join lateral public.crm_pessoas_ocultas(r.client_id) o
$$;

-- 5. Digisac: contatos sem etiqueta de médico que ficam com a clínica (regra 'excluir') -------------------------
create or replace function public.crm_sem_medico(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable
as $$
  select case when exists (select 1 from public.crm_filtro_cliente f join public.crm_connections k on k.id = f.crm_connection_id and k.provider = 'digisac'
                            where f.client_id = p_client and f.modo = 'excluir' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
    then (select jsonb_build_object(
                   'total', count(*),
                   'periodo', count(*) filter (where (coalesce(l.occurred_at, l.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate))
            from public.crm_leads_do_cliente(p_client) l
            join public.crm_connections k on k.id = l.crm_connection_id and k.provider = 'digisac'
           where l.pipeline_id = 'sem-medico' and l.removido_na_origem is null)
  end
$$;

do $g$
declare f text;
begin
  foreach f in array array[
    'public.conversas_do_cliente(uuid)', 'public.wts_sessoes_do_cliente(uuid)',
    'public.mensagens_do_cliente(uuid)', 'public.conversas_resumos_do_cliente(uuid)', 'public.conversas_tema_do_cliente(uuid)',
    'public.conversas_origem_anuncio_do_cliente(uuid)', 'public.crm_lead_eventos_do_cliente(uuid)', 'public.crm_pessoas_ocultas(uuid)',
    'public.toques_do_cliente(uuid)', 'public.pessoas_do_cliente(uuid)', 'public.crm_conversa_na_regra(uuid,uuid)',
    'public.crm_membro_ve_conversa(uuid,uuid)', 'public.crm_membro_clientes_com_regra(boolean)', 'public.crm_membro_conversas_visiveis()',
    'public.crm_membro_leads_visiveis()', 'public.crm_membro_pessoas_ocultas()', 'public.crm_sem_medico(uuid,date,date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$g$;

-- 2. RPCs: toda leitura direta dessas tabelas passa pela leitura do cliente -------------------------------------
-- Mesmo mecanismo de 20261102160000. 'assinatura|argumento' usa outro argumento como cliente (jornada_pessoa lê a
-- pessoa e guarda o cliente em v_client antes de ler o resto; a primeira leitura, de pessoas, não é trocada).
-- pessoas só é trocada onde a lista de pessoas é o resultado (busca de pacientes e jornada_resumo antiga); nas
-- demais a pessoa vem de um card ou conversa que já passou na regra.
do $migra$
declare
  alvos text[] := array[
    -- Já ligadas à regra em 20261102160000 (agora também nas tabelas novas)
    'public.pacientes_periodo(uuid,date,date)', 'public.pacientes_cards(uuid)', 'public.pacientes_vendas(uuid,date,date)',
    'public.crm_pessoas_leads(uuid)', 'public.crm_vendas_periodo(uuid,date,date)', 'public.crm_funis_periodo(uuid,date,date)',
    'public.crm_leads_por_etapa(uuid)', 'public.crm_pipeline_kanban(uuid)', 'public.crm_metricas_essenciais(uuid)',
    'public.crm_visoes_comerciais(uuid,date,date)', 'public.crm_diagnostico_comercial(uuid,date,date)',
    'public.crm_orcamentos_por_tipo(uuid,date,date)', 'public.crm_leads_por_dia(uuid,integer)', 'public.crm_atividade_recente(uuid,integer)',
    'public.crm_funil_por_campo_periodo(uuid,text,date,date)', 'public.crm_funil_por_campo(uuid,text)',
    'public.roi_periodo(uuid,date,date)', 'public.jornada_funil(uuid,date,date)', 'public.jornada_resumo(uuid,date,date)',
    'public.receita_por_canal(uuid,date,date)', 'public.receita_em_jogo(uuid,date,date)', 'public.sap_tracker_auto(uuid,date,date)',
    'public.listar_conversas(uuid,integer,integer)', 'public.listar_conversas_canal(uuid,integer,integer)',
    'public.conversas_leitura(uuid,integer)', 'public.leitura_conversas(uuid,integer)',
    'public.wts_resumo(uuid,date,date)', 'public.wts_por_agente(uuid,date,date)', 'public.wts_volume_diario(uuid,date,date)',
    'public.wts_por_departamento(uuid,date,date)', 'public.wts_fila_do_cliente(uuid,date,date)',
    -- "O que mudou" e auditoria comercial
    'public.prova_resultado(uuid,integer)', 'public.auditoria_comercial(uuid,date,date)',
    -- Comercial, conteúdo, origem, custo e jornada
    'public.conteudo_comercial(uuid,date,date)', 'public.conteudo_comercial_profundo(uuid,date,date)',
    'public.conversao_por_origem(uuid,date,date)', 'public.custo_whatsapp(uuid,date,date)', 'public.experimento_atual(uuid)',
    'public.falha_pct(uuid,text,date,date)', 'public.links_funil(uuid,timestamptz,timestamptz)', 'public.links_funil(uuid,timestamptz)',
    'public.qualidade_leads_campanha(uuid,date,date)', 'public.relacionamento_pessoas(uuid,uuid[])',
    'public.textos_entrada_frequentes(uuid,integer)', 'public.jornada_resumo(uuid)', 'public.buscar_pessoas(uuid,text)',
    'public.cobertura_periodo(uuid,date,date)', 'public.qualidade_dados(uuid)', 'public.pacientes_vendas_janela(uuid,date,date)',
    'public.plano_ticket(uuid)',
    -- CRM: base, etapas, campanhas, guia
    'public.campanhas_base(uuid)', 'public.crm_base_viva(uuid)', 'public.crm_etapas_kpi_para_analise(uuid)',
    'public.crm_etapas_para_analise(uuid)', 'public.crm_guia_dados(uuid)',
    -- SAP
    'public.sap_atendimento_por_atendente(uuid,date,date)', 'public.sap_auditoria_ia(uuid,date)', 'public.sap_etapas_para_marcar(uuid)',
    'public.sap_leads_atencao(uuid,integer)', 'public.sap_sinais_auto(uuid,date,date)',
    -- Jornada de uma pessoa (cliente em v_client)
    'public.jornada_pessoa(uuid)|v_client'];
  com_pessoas text[] := array['public.buscar_pessoas(uuid,text)', 'public.jornada_resumo(uuid)'];
  tabelas text[][] := array[
    array['crm_leads', 'crm_leads_do_cliente'], array['conversas', 'conversas_do_cliente'], array['wts_sessions', 'wts_sessoes_do_cliente'],
    array['mensagens', 'mensagens_do_cliente'], array['conversas_resumos', 'conversas_resumos_do_cliente'],
    array['conversas_tema', 'conversas_tema_do_cliente'], array['conversas_origem_anuncio', 'conversas_origem_anuncio_do_cliente'],
    array['crm_lead_eventos', 'crm_lead_eventos_do_cliente'], array['toques', 'toques_do_cliente'], array['pessoas', 'pessoas_do_cliente']];
  -- Agrupamento pela chave da tabela (group by c.id) não vale para o resultado de uma função: as colunas
  -- usadas entram no group by (mesmo resultado, c.id é único).
  ajustes text[][] := array[
    array['public.qualidade_leads_campanha(uuid,date,date)', E'    group by c.id\n    having (min(m.enviada_em)', E'    group by c.id, c.lead_id, c.pessoa_id\n    having (min(m.enviada_em)']];
  item text; alvo text; d text; n text; arg text; sec boolean; tipo1 oid; i int;
begin
  foreach item in array alvos loop
    alvo := split_part(item, '|', 1);
    if to_regprocedure(alvo) is null then raise notice 'regra_medico_completa: % não existe, pulada', alvo; continue; end if;
    select pg_get_functiondef(p.oid), p.proargnames[1], p.prosecdef, p.proargtypes[0]
      into d, arg, sec, tipo1 from pg_proc p where p.oid = to_regprocedure(alvo);
    if split_part(item, '|', 2) <> '' then
      arg := split_part(item, '|', 2);
      if not sec then raise exception 'regra_medico_completa: % não é definer', alvo; end if;
    elsif not sec or tipo1 <> 'uuid'::regtype::oid or arg !~ '^p_client(_id)?$' then
      raise exception 'regra_medico_completa: % não tem o formato esperado (definer, 1º argumento p_client uuid)', alvo;
    end if;
    if d ~* '(delete\s+from|update|insert\s+into)\s+(public\.)?(crm_leads|conversas|wts_sessions|mensagens|conversas_resumos|conversas_tema|conversas_origem_anuncio|crm_lead_eventos|toques|pessoas)\y' then
      raise exception 'regra_medico_completa: % escreve nas tabelas lidas; não é leitura', alvo;
    end if;
    n := d;
    for i in 1 .. array_length(tabelas, 1) loop
      if tabelas[i][1] = 'pessoas' and not (alvo = any(com_pessoas)) then continue; end if;
      -- Sem apelido ("from toques where"): ganha o nome da tabela como apelido, para "toques.x" continuar valendo.
      n := regexp_replace(n,
        '\y(from|join)(\s+)(public\.)?' || tabelas[i][1] || '(\s+(where|group|order|limit|left|right|inner|full|cross|join|on|union|window|having)\y|\s*[),;])',
        '\1\2public.' || tabelas[i][2] || '(' || arg || ') ' || tabelas[i][1] || '\4', 'gi');
      -- Com apelido ("from mensagens m", "from public.conversas_resumos r").
      n := regexp_replace(n,
        '\y(from|join)(\s+)(public\.)?' || tabelas[i][1] || '(\s+)',
        '\1\2public.' || tabelas[i][2] || '(' || arg || ')\4', 'gi');
    end loop;
    for i in 1 .. array_length(ajustes, 1) loop
      if ajustes[i][1] = alvo then n := replace(n, ajustes[i][2], ajustes[i][3]); end if;
    end loop;
    if n <> d then
      begin
        execute n;
      exception when others then
        raise exception 'regra_medico_completa: % não compila depois da troca: % (%)', alvo, sqlerrm, sqlstate;
      end;
    end if;
  end loop;
end
$migra$;

-- Funções que recebem a conversa, a pessoa ou o trabalho: a regra vale para quem não é admin. Troca só o trecho
-- auditado; pula a função que já está corrigida ou que não tem o trecho (aviso).
do $migra$
declare r record; d text;
begin
  for r in
    select * from (values
      ('public.ler_mensagens(uuid)',
       'if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then return; end if;',
       'if v_client is null or not public.crm_membro_ve_conversa(v_client, p_conversa) then return; end if;'),
      ('public.mensagens_automaticas(uuid)',
       'where id = p_conversa and (public.is_app_admin() or public.is_client_member(client_id))',
       'where id = p_conversa and public.crm_membro_ve_conversa(client_id, p_conversa)'),
      ('public.jornada_pessoa(uuid)',
       'if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then return null; end if;',
       'if v_client is null or not (public.is_app_admin() or public.crm_membro_ve_pessoa(v_client, p_pessoa)) then return null; end if;')
    ) v(fn, antes, depois)
  loop
    if to_regprocedure(r.fn) is null then raise notice 'regra_medico_completa: % não existe, pulada', r.fn; continue; end if;
    d := pg_get_functiondef(to_regprocedure(r.fn));
    if position('crm_membro_ve_' in d) > 0 then continue; end if;
    if position(r.antes in d) = 0 then raise notice 'regra_medico_completa: trecho de % não encontrado, pulada', r.fn; continue; end if;
    execute replace(d, r.antes, r.depois);
  end loop;
end
$migra$;

-- Pacientes do período: quantos contatos sem etiqueta de médico entram no painel da clínica (Digisac).
do $migra$
declare
  d text;
  a1 text := $a$    'crm_filtro_ativo', public.crm_tem_filtro(p_client),$a$;
  n1 text := $n$    'crm_filtro_ativo', public.crm_tem_filtro(p_client),
    'crm_sem_medico', public.crm_sem_medico(p_client, p_de, p_ate),$n$;
begin
  d := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  if position('crm_sem_medico' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'pacientes_periodo: trecho do crm_filtro_ativo não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;
end
$migra$;

-- 3. Leitura direta: troca das 7 policies "membro do cliente" (drop só dos nomes antigos exatos) --------------
drop policy if exists "resumos: admin ou membro le" on public.conversas_resumos;
drop policy if exists "conversas_tema_leitura" on public.conversas_tema;
drop policy if exists "origem anuncio: admin ou membro le" on public.conversas_origem_anuncio;
drop policy if exists "crm_lead_eventos_ler" on public.crm_lead_eventos;
drop policy if exists "toques: admin ou membro le" on public.toques;
drop policy if exists "operacao_recuperacao_ler" on public.operacao_recuperacao;
drop policy if exists "sugestoes_agentes: membro ou admin le" on public.sugestoes_agentes;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversas_resumos' and policyname = 'conversas_resumos: admin ou membro dentro da regra') then
    create policy "conversas_resumos: admin ou membro dentro da regra" on public.conversas_resumos for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or conversa_id in (select x from public.crm_membro_conversas_visiveis() x))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversas_tema' and policyname = 'conversas_tema: admin ou membro dentro da regra') then
    create policy "conversas_tema: admin ou membro dentro da regra" on public.conversas_tema for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or conversa_id in (select x from public.crm_membro_conversas_visiveis() x))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversas_origem_anuncio' and policyname = 'origem anuncio: admin ou membro dentro da regra') then
    create policy "origem anuncio: admin ou membro dentro da regra" on public.conversas_origem_anuncio for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or conversa_id in (select x from public.crm_membro_conversas_visiveis() x))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_lead_eventos' and policyname = 'crm_lead_eventos: admin ou membro dentro da regra') then
    create policy "crm_lead_eventos: admin ou membro dentro da regra" on public.crm_lead_eventos for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(true) x)
             or (crm_connection_id, external_lead_id) in (select v.crm_connection_id, v.external_lead_id from public.crm_membro_leads_visiveis() v))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'toques' and policyname = 'toques: admin ou membro dentro da regra') then
    create policy "toques: admin ou membro dentro da regra" on public.toques for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or pessoa_id is null
             or pessoa_id not in (select x from public.crm_membro_pessoas_ocultas() x))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operacao_recuperacao' and policyname = 'operacao_recuperacao: admin ou membro dentro da regra') then
    create policy "operacao_recuperacao: admin ou membro dentro da regra" on public.operacao_recuperacao for select to authenticated
      using ((public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or conversa_id is null
             or conversa_id in (select x from public.crm_membro_conversas_visiveis() x))))
        and public.tem_modulo(client_id, 'hub'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sugestoes_agentes' and policyname = 'sugestoes_agentes: admin ou membro dentro da regra') then
    create policy "sugestoes_agentes: admin ou membro dentro da regra" on public.sugestoes_agentes for select to authenticated
      using (public.is_app_admin() or (public.is_client_member(client_id)
        and (client_id not in (select x from public.crm_membro_clientes_com_regra(false) x)
             or conversa_id is null
             or conversa_id in (select x from public.crm_membro_conversas_visiveis() x))));
  end if;
end $pol$;
