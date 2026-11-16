-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116140000_contatos_novos_sem_prospeccao.sql.
-- Volta 'leads' e 'leads_com_origem' de roi_periodo_calc para crm_pessoas_novas inteira e apaga os resultados guardados
-- de roi_periodo. Função sem a marca [contatos-sem-prospeccao] fica como está.

begin;
create or replace function pg_temp.desfazer(p_fn regprocedure, p_marca text, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position(p_marca in d) = 0 then return; end if;  -- já está sem a troca
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception 'reverter %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %', p_fn, i, n, left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position(p_marca in d) > 0 then raise exception 'reverter %: a marca % continua lá', p_fn, p_marca; end if;
  execute d;
end
$f$;

select pg_temp.desfazer('public.roi_periodo_calc(uuid,date,date)'::regprocedure, '[contatos-sem-prospeccao]', array[
  array[$t$  -- [contatos-sem-prospeccao] "Contatos novos no CRM" sem quem só tem card de prospecção no 1º dia: a mesma regra do
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
$t$,
        $t$  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
$t$],
  array[$t$    'leads', (select count(*) from pn_ok) /* [contatos-sem-prospeccao] */,
    'leads_com_origem', (select count(*) from pn_ok where com_origem),
$t$,
        $t$    'leads', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate)),
    'leads_com_origem', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate) where com_origem),
$t$]
]);

delete from public.resultado_pronto where funcao = 'roi_periodo';
commit;
