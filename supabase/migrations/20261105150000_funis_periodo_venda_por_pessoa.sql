-- crm_funis_periodo ("Por funil, no período": leads que entraram no período). Com perfil, "ganhos" contava só o
-- card criado já numa etapa de venda (Dra. Lana: 19 no Atendimento Clínico, 0 nos funis de entrada), enquanto o
-- período tinha 52 vendas. Agora, com perfil, o card que entrou no período conta como ganho quando a pessoa dele
-- comprou (crm_perfil_vendas, sem a cópia do robô) a partir da entrada do card; o valor é o maior preço da pessoa.
-- Assim cada funil de entrada mostra quantas das pessoas que chegaram por ele compraram. Sem perfil, nada muda.

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
  pvs as materialized (select * from public.crm_perfil_vendas(p_client_id)),
  copias as (select v.lead_id from pvs v where v.copia),
  -- [perfil-da-clinica] compra da pessoa: primeira venda (sem cópia) e o maior preço.
  compras as (select v.pessoa, min(v.quando) as primeira, max(v.price) as preco from pvs v where not v.copia group by v.pessoa),
  pe as materialized (select * from public.crm_perfil_etapas(p_client_id)),
  l as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id, cl.outcome,
      case when pa.id is not null then cp.preco else cl.price end as price,
      coalesce(s.pipeline_name, cl.pipeline_id) as funil, s.status_name,
      nullif(btrim(cc.config->'grupos_funil'->>cl.pipeline_id), '') as grupo,
      coalesce(public.crm_papel_conta(pe.papel, 'consulta_agendada'),
       (exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id and k.pipeline_id = cl.pipeline_id
                 and k.status_id = cl.status_id and k.kpi = 'consulta_agendada')
        or coalesce(s.status_name, '') ilike '%consulta agendada%')) as em_consulta,
      case when pa.id is not null then cp.pessoa is not null
           else coalesce(public.crm_papel_conta(pe.papel, 'ganho'), cl.outcome = 'won') end as ganho,
      coalesce(public.crm_papel_conta(pe.papel, 'perdido'), cl.outcome = 'lost') as perdido,
      coalesce(lote.n, 0) >= 15 as importado
    from public.crm_leads_do_cliente(p_client_id) cl
    join crm_connections cc on cc.id = cl.crm_connection_id
    left join crm_pipeline_statuses s on s.crm_connection_id = cl.crm_connection_id and s.pipeline_id = cl.pipeline_id and s.status_id = cl.status_id
    left join lote on lote.crm_connection_id = cl.crm_connection_id and lote.minuto = date_trunc('minute', cl.occurred_at)
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join (select distinct x.crm_connection_id as id from pe x) pa on pa.id = cl.crm_connection_id
    left join compras cp on pa.id is not null
      and cp.pessoa = coalesce('p:' || cl.pessoa_id::text, 'l:' || cl.id::text)
      and cp.primeira >= cl.occurred_at - interval '1 day'
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
