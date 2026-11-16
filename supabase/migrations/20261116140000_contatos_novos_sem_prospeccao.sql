-- [contatos-sem-prospeccao] O "Contatos novos no CRM" de Resultados sem quem só foi abordado pela equipe (prospecção),
-- a mesma regra do funil da mesma tela (debug numeros-nao-batem-fonte, 16/11/2026: M5). Numa clínica com funil de
-- prospecção, o cartão chegava a 9 vezes o "Leads novos" do funil ao lado.
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116130000_agendou_e_etapa_sem_uso.sql.
-- Agentes não rodam este arquivo. Velocidade antes e depois: o medir-velocidade.sql do debug (EXPLAIN ANALYZE, só
-- leitura). Se roi_periodo_calc ficar mais de 1,5x mais lenta na média: a reversão.
-- Reversão: supabase/operacoes/20261116-reverter-contatos-sem-prospeccao.sql.
--
-- O que muda em roi_periodo_calc: 'leads' e 'leads_com_origem' contam as pessoas novas (crm_pessoas_novas, como antes)
-- menos quem, no 1º dia, só tem card de prospecção: funil com papel 'prospeccao', nome de funil de prospecção/social
-- seller, origem_por_funil da conexão começando por "prospec" ou origem "Prospecção ativa" (o mesmo critério de
-- pacientes_cards.prospec). crm_pessoas_novas passa a ser lida uma vez (antes, duas). Os cards lidos são só os criados
-- no período (os mesmos de "l"). Diferença pequena que fica: o funil também tira cópias do robô e etapas 'ignorar'.
-- No fim, apaga do resultado_pronto os resultados de roi_periodo (a próxima leitura recalcula).

create or replace function pg_temp.contatos_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[contatos-sem-prospeccao]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception '[contatos-sem-prospeccao] %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %',
        p_fn, i, n, left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, trocados de lado)
select pg_temp.contatos_trocar('public.roi_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
$t$,
        $t$  -- [contatos-sem-prospeccao] "Contatos novos no CRM" sem quem só tem card de prospecção no 1º dia: a mesma regra do
  -- funil (pacientes_cards.prospec e pacientes_periodo_calc.so_prospec), para os dois números de Resultados baterem.
  pn as materialized (select * from public.crm_pessoas_novas(p_client_id, p_de, p_ate)),
  pn_funis as (
    select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, s.pipeline_name
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client_id
     order by s.crm_connection_id, s.pipeline_id, s.fetched_at desc nulls last
  ),
  pn_dia as (
    select coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) as pk,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           bool_and(coalesce(cc.config->'origem_por_funil'->>btrim(f.pipeline_name), '') ~* '^prospec'
                    or coalesce(f.pipeline_name, '') ~* '(social ?seller|prospec)'
                    or coalesce(fp.papel, '') = 'prospeccao'
                    or coalesce(public.crm_origem_classifica(cl.source), '') = 'Prospecção ativa') as so_prospec
      from public.crm_leads_do_cliente(p_client_id) cl
      join crm_connections cc on cc.id = cl.crm_connection_id
      left join pn_funis f on f.crm_connection_id = cl.crm_connection_id and f.pipeline_id = cl.pipeline_id
      left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
     where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
       and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     group by 1, 2
  ),
  pn_ok as (
    select n.pk, n.com_origem
      from pn n left join pn_dia x on x.pk = n.pk and x.d = n.primeiro
     where not coalesce(x.so_prospec, false)
  ),
  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
$t$],
  array[$t$    'leads', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate)),
    'leads_com_origem', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate) where com_origem),
$t$,
        $t$    'leads', (select count(*) from pn_ok) /* [contatos-sem-prospeccao] */,
    'leads_com_origem', (select count(*) from pn_ok where com_origem),
$t$]
]);
-- [trocas:fim]

delete from public.resultado_pronto where funcao = 'roi_periodo';
