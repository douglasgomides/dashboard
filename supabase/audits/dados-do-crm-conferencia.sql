-- Conferência da migração de origem e cobertura do CRM (plano 03.1.1.1.1.1-07). SOMENTE LEITURA (read only):
-- só SELECT, nenhuma função que grava, nenhuma troca de papel.
-- São 3 consultas. O SQL editor mostra só o resultado da última: colar UMA consulta por vez (do "-- [n]" até o ";").
-- Rodar ANTES de aplicar 20261114100000 e de novo DEPOIS (e depois do roteiro de refazer a origem).
-- Saída: só client_id, nomes de função, contagens e tempos. Nada de nome de clínica, de lead ou texto de mensagem.
-- Funciona antes e depois: o que só existe depois (crm_canais_kommo, as funções novas) é lido sem quebrar.

-- [1] Pré-checagem e "aplicada?" ----------------------------------------------------------------------------------
-- ANTES de aplicar, o esperado é: as 3 primeiras linhas "corpo esperado", a do Fecharam "1 vez" e as outras "não".
-- Se alguma das 3 primeiras disser "DIFERENTE" ou o trecho não for "1 vez", NÃO aplicar: a migração pararia sem mudar
-- nada. Mandar esta saída.
-- DEPOIS de aplicar: as 3 primeiras "já aplicada", a do Fecharam "já aplicada" e as outras "sim".
with f(fn, md5_esperado) as (values
  ('public.crm_leads_origem_gatilho()', 'da996b804fcfd108f6c532795058920e'),
  ('public.crm_origem_inferida(text,jsonb)', 'fae09308cd933f62a652aae20264a471'),
  ('public.crm_aplicar_origem_externa(uuid)', '5e7d1228f21ed80fea9d9dc61b782f8b')),
pp as (select pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure) as d),
trecho as (select $t$           'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true));
  end if;
  -- [tela-honesta] início$t$ as t)
select 1 as ordem, f.fn as item,
       case when position('[dados-do-crm]' in p.prosrc) > 0 then 'já aplicada'
            when md5(p.prosrc) = f.md5_esperado or (f.fn = 'public.crm_origem_inferida(text,jsonb)' and md5(p.prosrc) = 'abac46c8930b0ba14779ae73439b09e9') then 'corpo esperado'
            else 'DIFERENTE (md5 ' || md5(p.prosrc) || ')' end as situacao
  from f join pg_proc p on p.oid = f.fn::regprocedure
union all
select 2, 'pacientes_periodo_calc: trecho do Fecharam',
       case when position('[dados-do-crm]' in pp.d) > 0 then 'já aplicada'
            else ((length(pp.d) - length(replace(pp.d, trecho.t, ''))) / length(trecho.t))::text || ' vez(es)' end
  from pp, trecho
union all
select 3, 'tabela crm_canais_kommo', case when to_regclass('public.crm_canais_kommo') is not null then 'sim' else 'não' end
union all
select 3, 'função ' || n, case when exists (select 1 from pg_proc where proname = n and pronamespace = 'public'::regnamespace)
                               then 'sim' else 'não' end
  from unnest(array['crm_definir_canal_origem', 'crm_canais_para_confirmar', 'crm_cobertura']) n
order by 1, 2;

-- [2] Por clínica com CRM ligado: origem dos leads de 30 dias, canais e funis sem tradução, ganhos de 90 dias -----
-- Pelo recorte da clínica (crm_leads_do_cliente). Esperado DEPOIS da migração, da confirmação da equipe e do
-- roteiro: sem_origem_30d igual ou menor que antes em toda clínica (nunca maior); canal/funil/utm/formulario/anuncio
-- podem subir; canais_kommo_lidos > 0 nas clínicas com Kommo depois da primeira sincronização (ou 0 se o contrato ao
-- vivo disse "sem nome pela API"). fecharam_nao_se_aplica: o último resultado guardado de Pacientes diz "não se aplica"
-- (só depois da migração, em até 20 minutos).
select c.id as client_id,
       string_agg(distinct cc.provider, ',') as crm,
       x.leads_30d, x.sem_origem_30d,
       x.por_crm, x.por_canal, x.por_funil, x.por_utm, x.por_campo, x.por_etiqueta, x.por_formulario,
       x.por_mensagem, x.por_etapa, x.por_anuncio,
       x.canais_kommo_sem_traducao, x.funis_clint_sem_origem,
       case when to_regclass('public.crm_canais_kommo') is not null then
         (xpath('/row/n/text()', query_to_xml(format(
           'select count(*) as n from public.crm_canais_kommo k join public.crm_connections x on x.id = k.crm_connection_id where x.client_id = %L',
           c.id), false, true, '')))[1]::text::integer
       end as canais_kommo_lidos,
       x.ganhos_90d, x.ganhos_90d_com_valor,
       (select r.resultado #>> '{numeros,fecharam,nao_se_aplica}' from public.resultado_pronto r
         where r.client_id = c.id and r.funcao = 'pacientes_periodo' order by r.calculado_em desc limit 1) as fecharam_nao_se_aplica
  from public.clients c
  join public.crm_connections cc on cc.client_id = c.id and cc.active
  cross join lateral (
    select count(*) filter (where l.occurred_at >= now() - interval '30 days') as leads_30d,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and nullif(btrim(l.source), '') is null) as sem_origem_30d,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'crm') as por_crm,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'canal') as por_canal,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'funil') as por_funil,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'utm') as por_utm,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'campo') as por_campo,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'etiqueta') as por_etiqueta,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'formulario') as por_formulario,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'mensagem') as por_mensagem,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'etapa') as por_etapa,
           count(*) filter (where l.occurred_at >= now() - interval '30 days' and l.origem_como = 'anuncio') as por_anuncio,
           count(distinct l.crm_connection_id::text || ':' || l.canal_id) filter (
             where l.occurred_at >= now() - interval '90 days' and l.provider = 'kommo' and l.canal_id is not null
               and nullif(btrim(l.source), '') is null
               and not exists (select 1 from public.crm_canais_origem co
                                where co.crm_connection_id = l.crm_connection_id and co.canal_id = l.canal_id)) as canais_kommo_sem_traducao,
           count(distinct l.crm_connection_id::text || ':' || l.pipeline_id) filter (
             where l.occurred_at >= now() - interval '90 days' and l.provider = 'clint' and l.pipeline_id is not null
               and nullif(btrim(l.source), '') is null) as funis_clint_sem_origem,
           count(*) filter (where l.outcome = 'won' and l.occurred_at >= now() - interval '90 days') as ganhos_90d,
           count(*) filter (where l.outcome = 'won' and l.occurred_at >= now() - interval '90 days' and coalesce(l.price, 0) > 0) as ganhos_90d_com_valor
      from public.crm_leads_do_cliente(c.id) l
     where l.removido_na_origem is null
  ) x
 group by c.id, x.leads_30d, x.sem_origem_30d, x.por_crm, x.por_canal, x.por_funil, x.por_utm, x.por_campo, x.por_etiqueta,
          x.por_formulario, x.por_mensagem, x.por_etapa, x.por_anuncio, x.canais_kommo_sem_traducao, x.funis_clint_sem_origem,
          x.ganhos_90d, x.ganhos_90d_com_valor
 order by c.id;

-- [3] Velocidade (D-07): chamadas e tempo médio das funções que esta migração troca ou cria ---------------------
-- Ler antes e depois (não zerar as estatísticas: zerar é escrita). Depois, a média de cada linha não pode passar de
-- 1,5 vez a de antes. "crm_leads (gravação)" é o sync gravando leads (o gatilho de origem roda nela).
-- Sem pg_stat_statements no banco, a consulta devolve as linhas com chamadas nulas.
with v as (select coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements')) as tabela),
alvo(item, padrao) as (values
  ('pacientes_periodo', '%pacientes_periodo%'),
  ('crm_aplicar_origem_externa', '%crm_aplicar_origem_externa%'),
  ('crm_leads (gravação)', '%into "public"."crm_leads"%'),
  ('crm_cobertura', '%crm_cobertura%'),
  ('crm_canais_para_confirmar', '%crm_canais_para_confirmar%'),
  ('crm_definir_canal_origem', '%crm_definir_canal_origem%'))
select a.item,
       case when v.tabela is not null then
         (xpath('/row/c/text()', query_to_xml(format(
           'select sum(calls)::bigint as c from %s where query ilike %L', v.tabela, a.padrao), false, true, '')))[1]::text::bigint
       end as chamadas,
       case when v.tabela is not null then
         (xpath('/row/m/text()', query_to_xml(format(
           'select round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 1) as m from %s where query ilike %L',
           v.tabela, a.padrao), false, true, '')))[1]::text::numeric
       end as media_ms
  from alvo a, v
 order by a.item;
