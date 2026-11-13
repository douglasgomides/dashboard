-- Conferência da migração 20261113100000_contas_certas_no_banco.sql. SOMENTE LEITURA (read only).
-- Rodar o arquivo inteiro no SQL editor do projeto de produção, ANTES e DEPOIS de o João aplicar a migração.
-- Não aplica nada, não chama função que guarda resultado (pacientes_periodo, qualidade_dados, roi_periodo, status_das_fontes)
-- e não troca papel nem identidade. A transação é só de leitura: qualquer escrita acidental aborta.
-- A saída tem só client_id (id interno), nomes de funções, contagens e datas. Nada de nome de clínica, telefone,
-- texto de origem ou linha de paciente. Para guardar a saída, guardar só isso.
--
-- Seção 0 (antes): cada trecho que a migração troca tem de aparecer exatamente 1 vez em produção (coluna "vezes").
--   0 ou 2: parar e avisar. A migração pararia sem mudar nada. "fontes_base igual ao repositório" tem de ser true.
-- Seção 1 (antes e depois): por clínica ativa, os números que a migração muda.
-- Seção 2 (depois): o registro da migração e a marca [contas-certas] em cada função trocada.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------------------------
-- Seção 0 — pré-checagem: cada trecho antigo existe uma vez?
-- ---------------------------------------------------------------------------------------------------------------
with trecho(funcao, n, texto) as (values
  ('public.campanhas_base(uuid)', 1, $t$else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou$t$),
  ('public.qualidade_leads_campanha(uuid,date,date)', 1, $t$else l.venda_pf or public.crm_papel_conta(l.papel, 'agendou') end as agendou$t$),
  ('public.conteudo_comercial(uuid,date,date)', 1, $t$else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou$t$),
  ('public.conteudo_comercial_profundo(uuid,date,date)', 1, $t$else pvc.lead_id is not null or public.crm_papel_conta(pe.papel, 'agendou') end) as agendou$t$),
  ('public.jornada_funil(uuid,date,date)', 1, $t$else venda_pf or public.crm_papel_conta(papel, 'agendou') end) agendados$t$),
  ('public.crm_visoes_comerciais(uuid,date,date)', 1, $t$coalesce(p_agendou, consulta or outcome = 'won')$t$),
  ('public.crm_diagnostico_comercial(uuid,date,date)', 1, $t$'agendados', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho,$t$),
  ('public.crm_diagnostico_comercial(uuid,date,date)', 2, $t$'agendados_provaveis', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho,$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 1, $t$filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) as no_periodo$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 2, $t$  ck_cob as materialized (select * from public.checkout_cobertura(p_client)),$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 3, $t$           exists (select 1 from cards c where c.outcome = 'won' and c.em_agendamento and coalesce(c.price, 0) = 0) as ganho_e_agendamento,$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 4, $t$        when not exists (select 1 from vendas) and (select count(*) from leads_novos) >= 50$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 5, $t$        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 6, $t$  novas_u as (
    select u, min(primeiro) as primeiro, bool_and(so_prospec) as so_prospec,
           (array_agg(origem_crm order by origem_crm is null))[1] as origem_crm
      from novas group by u
  ),$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 7, $t$             when n.origem_crm is not null then 'outras'$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 8, $t$             else 'sem_origem'
           end as origem,
           case when n.origem_crm is not null then 'crm' when i.origem in ('anuncio', 'instagram', 'indicacao') then 'conversa' end as origem_fonte$t$),
  ('public.pacientes_periodo_calc(uuid,date,date)', 9, $t$  -- [tela-honesta] início$t$),
  ('public.roi_periodo_calc(uuid,date,date)', 1, $t$        when anuncio then 'Anúncio'
        when origem_classe is not null then origem_classe
        when origem_bruta is not null then origem_bruta
$t$),
  ('public.qualidade_dados_calc(uuid)', 1, $t$  from crm_leads where client_id = p_client_id and removido_na_origem is null;$t$),
  ('public.qualidade_dados_calc(uuid)', 2, $t$  from crm_leads l
  left join crm_canais_origem co$t$),
  ('public.qualidade_dados_calc(uuid)', 3, $t$(select count(*) from crm_leads o$t$),
  ('public.qualidade_dados_calc(uuid)', 4, $t$      join crm_leads cl on cl.crm_connection_id = e.crm_connection_id and cl.external_lead_id = e.external_lead_id$t$),
  ('public.qualidade_dados_calc(uuid)', 5, $t$not exists (select 1 from crm_leads w where w.client_id = p_client_id$t$),
  ('public.qualidade_dados_calc(uuid)', 6, $t$        select l.id::text, l.price from crm_leads l$t$),
  ('public.qualidade_dados_calc(uuid)', 7, $t$      from crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = 'won' and coalesce(price, 0) = 0$t$),
  ('public.qualidade_dados_calc(uuid)', 8, $t$    from crm_leads l
    where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days'$t$),
  ('public.qualidade_dados_calc(uuid)', 9, $t$  return out;
end;$t$)
)
select '0_pre_checagem' as secao, t.funcao, t.n as trecho,
       coalesce((length(d.def) - length(replace(d.def, t.texto, ''))) / length(t.texto), 0) as vezes,
       coalesce(position('[contas-certas]' in d.def) > 0, false) as ja_aplicada
  from trecho t
  cross join lateral (select pg_get_functiondef(to_regprocedure(t.funcao)) as def) d
 order by t.funcao, t.n;

-- fontes_base é recriada inteira (create or replace): o corpo de produção tem de ser o do repositório antes da troca.
-- Depois de aplicada, "igual_ao_repositorio" vira false e "ja_aplicada" vira true.
select '0_fontes_base' as secao,
       md5(p.prosrc) = '872dca6b6597f3f5fd26e3626ca2c1e3' as igual_ao_repositorio,
       position('[contas-certas]' in p.prosrc) > 0 as ja_aplicada
  from pg_proc p
 where p.oid = to_regprocedure('public.fontes_base(uuid)');

-- Quem usa crm_papel_conta / crm_perfil_conta: "conhecida" = está no repositório e foi conferida (usa coalesce ou foi
-- trocada por esta migração). No repositório são 18. Alguma "false": avisar antes de aplicar.
select '0_quem_usa_o_papel' as secao, p.proname::text as funcao,
       p.oid = any (array[
         to_regprocedure('public.campanhas_base(uuid)'), to_regprocedure('public.conteudo_comercial(uuid,date,date)'),
         to_regprocedure('public.conteudo_comercial_profundo(uuid,date,date)'), to_regprocedure('public.crm_diagnostico_comercial(uuid,date,date)'),
         to_regprocedure('public.crm_etapas_kpi_para_analise(uuid)'), to_regprocedure('public.crm_funil_por_campo(uuid,text)'),
         to_regprocedure('public.crm_funil_por_campo_periodo(uuid,text,date,date)'), to_regprocedure('public.crm_funis_periodo(uuid,date,date)'),
         to_regprocedure('public.crm_guia_dados(uuid)'), to_regprocedure('public.crm_metricas_essenciais(uuid)'),
         to_regprocedure('public.crm_vendas_periodo(uuid,date,date)'), to_regprocedure('public.crm_visoes_comerciais(uuid,date,date)'),
         to_regprocedure('public.jornada_funil(uuid,date,date)'), to_regprocedure('public.pacientes_cards(uuid)'),
         to_regprocedure('public.pacientes_periodo_calc(uuid,date,date)'), to_regprocedure('public.qualidade_leads_campanha(uuid,date,date)'),
         to_regprocedure('public.relacionamento_pessoas(uuid,uuid[])'), to_regprocedure('public.sap_tracker_auto(uuid,date,date)')]::oid[]) as conhecida
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and (p.prosrc like '%crm_papel_conta(%' or p.prosrc like '%crm_perfil_conta(%')
 order by 2;

-- ---------------------------------------------------------------------------------------------------------------
-- Seção 1 — antes/depois, por clínica ativa (só client_id e contagens).
-- ---------------------------------------------------------------------------------------------------------------

-- 1a. Conexão com perfil: entradas (60 dias) em etapa SEM papel cujo nome é de agendamento, e quantas delas ficam fora
--     de Agendaram. Depois da migração, "fora_de_agendaram" tem de ser 0 em todas as linhas.
select '1a_etapa_sem_papel_com_nome_de_agendamento' as secao, c.client_id,
       count(*) as entradas_60d,
       count(*) filter (where not coalesce(public.crm_perfil_conta(e.crm_connection_id, e.pipeline_para, e.status_para, 'consulta_agendada'), true)) as fora_de_agendaram
  from crm_lead_eventos e
  join crm_connections c on c.id = e.crm_connection_id and c.active
  join clients k on k.id = c.client_id and k.active
  join crm_pipeline_statuses s on s.crm_connection_id = e.crm_connection_id and s.pipeline_id = e.pipeline_para and s.status_id = e.status_para
 where e.tipo in ('entrou', 'mudou_etapa') and e.ocorreu_em >= now() - interval '60 days'
   and exists (select 1 from crm_perfil_etapa p where p.crm_connection_id = c.id)
   and not exists (select 1 from crm_perfil_etapa p where p.crm_connection_id = c.id and p.pipeline_id = e.pipeline_para
                     and p.status_id in (e.status_para, '*'))
   and s.status_name ~* '(agendad|agendament)'
 group by c.client_id
 order by 2;

-- 1b. CRM ativo sem nenhuma etapa de agendamento (nome, KPI ou papel do perfil). Depois da migração, Agendaram dessas
--     clínicas é "não se aplica" (quando nenhuma conversa do período foi lida como "agendou").
select '1b_crm_sem_etapa_de_agendamento' as secao, c.client_id,
       count(distinct c.id) as conexoes_ativas, count(s.id) as etapas
  from crm_connections c
  join clients k on k.id = c.client_id and k.active
  left join crm_pipeline_statuses s on s.crm_connection_id = c.id
 where c.active
 group by c.client_id
having not coalesce(bool_or(coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'consulta_agendada'),
         exists (select 1 from crm_etapa_kpi x where x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id
                   and x.status_id = s.status_id and x.kpi = 'consulta_agendada')
         or s.status_name ~* '(agendad|agendament)')), false)
 order by 2;

-- 1c. "O CRM marca como ganho o agendamento": ganhos sem valor em etapa de agendamento na base inteira (regra antiga, que
--     deixava todo dia sem venda sem número) e nos últimos 30 dias pela data do ganho (regra nova, por período).
with g as (
  select c.client_id,
         (coalesce(public.crm_data_desfecho(l.provider, l.raw_payload, 'won'),
                   (select max(e.ocorreu_em) from crm_lead_eventos e
                     where e.crm_connection_id = l.crm_connection_id and e.external_lead_id = l.external_lead_id and e.tipo = 'ganhou'),
                   l.occurred_at) at time zone 'America/Sao_Paulo')::date as dia
    from crm_leads l
    join crm_connections c on c.id = l.crm_connection_id and c.active
    join clients k on k.id = c.client_id and k.active
    join crm_pipeline_statuses s on s.crm_connection_id = l.crm_connection_id and s.pipeline_id = l.pipeline_id and s.status_id = l.status_id
   where l.outcome = 'won' and coalesce(l.price, 0) = 0 and l.removido_na_origem is null
     and coalesce(public.crm_perfil_conta(s.crm_connection_id, s.pipeline_id, s.status_id, 'consulta_agendada'),
           exists (select 1 from crm_etapa_kpi x where x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id
                     and x.status_id = s.status_id and x.kpi = 'consulta_agendada')
           or s.status_name ~* '(agendad|agendament)')
)
select '1c_ganho_e_agendamento' as secao, client_id,
       count(*) as na_base_inteira,
       count(*) filter (where dia >= current_date - 30) as nos_ultimos_30_dias,
       max(dia) as ultimo_ganho
  from g group by client_id order by 2;

-- 1d. Conta de CRM compartilhada com outra clínica: leads da conta inteira x leads do recorte da clínica (o que a
--     qualidade_dados passa a ler).
select '1d_crm_compartilhado' as secao, x.client_id, public.crm_tem_filtro(x.client_id) as com_filtro,
       (select count(*) from crm_leads l where l.client_id = x.client_id and l.removido_na_origem is null) as leads_da_conta,
       (select count(*) from public.crm_leads_do_cliente(x.client_id) l where l.removido_na_origem is null) as leads_do_recorte
  from (select distinct c.client_id
          from crm_connections c
          join crm_connections o on o.provider = c.provider and o.subdomain = c.subdomain and o.client_id <> c.client_id and o.active
          join clients k on k.id = c.client_id and k.active
         where c.active and coalesce(c.subdomain, '') <> '') x
 order by 2;

-- 1e. Anúncios do Meta: "dado até" de todas as contas x só das contas ativas, e o que fontes_base devolve. Depois da
--     migração, "fontes_base_dado_ate" = "contas_ativas" (ou a conta do cadastro, quando não há linha em
--     client_ad_accounts).
select '1e_anuncios_dado_ate' as secao, m.client_id,
       max(m.date) as todas_as_contas,
       max(m.date) filter (where a.conta is not null) as contas_ativas,
       (select f.data_ate from public.fontes_base(m.client_id) f where f.fonte = 'anuncios') as fontes_base_dado_ate
  from meta_ads_daily m
  join clients k on k.id = m.client_id and k.active
  left join (select distinct client_id, regexp_replace(ad_account_id, '^act_', '') as conta from client_ad_accounts where active) a
    on a.client_id = m.client_id and a.conta = regexp_replace(m.ad_account_id, '^act_', '')
 group by m.client_id
 order by 2;

-- 1f. Planilha de anúncios sem endereço e sem conta do Meta, só com linhas antigas. Depois da migração, "dono_do_motivo"
--     = 'manual' (ou o dono que já estava gravado em sync_status).
select '1f_planilha_de_anuncios_sem_endereco' as secao, k.id as client_id,
       count(*) as linhas, max(s.analise_em) as ultima_linha,
       (select f.motivo is not null from public.fontes_base(k.id) f where f.fonte = 'anuncios') as tem_motivo,
       (select f.motivo_dono from public.fontes_base(k.id) f where f.fonte = 'anuncios') as dono_do_motivo
  from clients k
  join ads_planilha_semanal s on s.client_id = k.id
 where k.active and coalesce(k.ads_planilha_url, '') = '' and coalesce(k.meta_ad_account_id, '') = ''
   and not exists (select 1 from client_ad_accounts a where a.client_id = k.id and a.active and not coalesce(a.provisional, false))
 group by k.id
 order by 2;

-- 1g. Cards dos últimos 90 dias com origem preenchida que a classificação não conhece: em Pacientes saem de
--     "Sem origem" e entram em "outras" (o texto da origem não aparece aqui).
select '1g_origem_bruta_desconhecida_90d' as secao, l.client_id, count(*) as cards_90d
  from crm_leads l
  join clients k on k.id = l.client_id and k.active
 where l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days'
   and public.crm_origem_classifica(l.source) is null and nullif(btrim(l.source), '') is not null
 group by l.client_id
 order by 2;

-- ---------------------------------------------------------------------------------------------------------------
-- Seção 2 — aplicada? (depois)
-- ---------------------------------------------------------------------------------------------------------------
select '2_registro' as secao, r.arquivo, r.aplicada_em
  from public._migracoes_repo r
 where r.arquivo = '20261113100000_contas_certas_no_banco.sql';

select '2_marcas' as secao, f.funcao,
       coalesce(position('[contas-certas]' in pg_get_functiondef(to_regprocedure(f.funcao))) > 0, false) as tem_marca
  from (values ('public.crm_papel_conta(text,text)'), ('public.crm_perfil_conta(uuid,text,text,text)'),
               ('public.campanhas_base(uuid)'), ('public.qualidade_leads_campanha(uuid,date,date)'),
               ('public.conteudo_comercial(uuid,date,date)'), ('public.conteudo_comercial_profundo(uuid,date,date)'),
               ('public.jornada_funil(uuid,date,date)'), ('public.crm_visoes_comerciais(uuid,date,date)'),
               ('public.crm_diagnostico_comercial(uuid,date,date)'), ('public.crm_origem_da_pessoa(text[],text[])'),
               ('public.pacientes_periodo_calc(uuid,date,date)'), ('public.roi_periodo_calc(uuid,date,date)'),
               ('public.qualidade_dados_calc(uuid)'), ('public.fontes_base(uuid)')) as f(funcao)
 order by 2;

select '2_regras' as secao,
       public.crm_papel_conta('', 'consulta_agendada') is null as sem_papel_vale_o_nome,
       public.crm_papel_conta('', 'ganho') is false as sem_papel_nao_e_venda,
       to_regprocedure('public.crm_origem_da_pessoa(text[],text[])') is not null as origem_da_pessoa_existe,
       not has_function_privilege('authenticated', 'public.pacientes_periodo_calc(uuid,date,date)', 'EXECUTE')
         and not has_function_privilege('authenticated', 'public.fontes_base(uuid)', 'EXECUTE') as calc_seguem_fechadas,
       (select count(*) from public.resultado_pronto where funcao in ('pacientes_periodo', 'qualidade_dados', 'roi_periodo')
          and calculado_em < (select aplicada_em from public._migracoes_repo where arquivo = '20261113100000_contas_certas_no_banco.sql')) as guardados_com_a_regra_antiga;

rollback;
