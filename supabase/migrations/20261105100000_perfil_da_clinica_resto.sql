-- Perfil da clínica, parte 2: as telas que ainda contavam venda só pelo "ganho" marcado no card.
-- Com perfil (crm_perfil_etapa), venda = crm_perfil_vendas (primeira entrada numa etapa de venda, uma por pessoa no
-- período, sem a cópia do robô). Sem perfil, tudo segue igual. Visto no painel da Dra. Lana em 04/11/2026:
--   Resultados: alerta "Só 1 ganho marcado para 5.643 pessoas novas" (qualidade_dados) e "Vendas ganhas no CRM: 0"
--   no retorno do investimento (roi_periodo); Comercial: "Cards ganhos: 0" (crm_leads_resumo_periodo,
--   crm_pessoas_resumo_periodo) e "0 de 448 aprovaram" (crm_orcamentos_por_tipo).
-- qualidade_dados e roi_periodo são alteradas pelo texto da definição atual (cada trecho precisa existir uma vez;
-- senão a migração para sem mudar nada). As duas de resumo e a de orçamentos são recriadas inteiras.

-- ------------------------------------------------------------ crm_leads_resumo_periodo
CREATE OR REPLACE FUNCTION public.crm_leads_resumo_periodo(p_client_id uuid, p_from date, p_to date)
 RETURNS TABLE(novos bigint, ganhos bigint, perdidos bigint, valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  per as (select * from public.crm_pessoas_leads(p_client_id) b where b.d between p_from and p_to and (select pode from ok)),
  ganhou as (select distinct pk from per where outcome = 'won'),
  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                          where c.client_id = p_client_id) as sim),
  pv as (select v.pessoa, max(v.price) as price from public.crm_perfil_vendas(p_client_id) v
          where (select sim from tem) and (select pode from ok) and not v.copia
            and (v.quando at time zone 'America/Sao_Paulo')::date between p_from and p_to
          group by v.pessoa)
  select
    (select count(*) from public.crm_pessoas_novas(p_client_id, p_from, p_to) where (select pode from ok)),
    case when (select sim from tem) then (select count(*) from pv) else (select count(*) from per where outcome = 'won') end,
    (select count(distinct pk) from per where outcome = 'lost' and pk not in (select pk from ganhou)),
    case when (select sim from tem) then coalesce((select sum(price) from pv), 0)
         else coalesce((select sum(price) from per where outcome = 'won'), 0) end;
$function$;

-- ------------------------------------------------------------ crm_pessoas_resumo_periodo
CREATE OR REPLACE FUNCTION public.crm_pessoas_resumo_periodo(p_client_id uuid, p_from date, p_to date)
 RETURNS TABLE(cards bigint, pessoas bigint, pessoas_novas bigint, pessoas_recorrentes bigint, cards_de_recorrentes bigint, ganhos bigint, perdidos bigint, abertos bigint, valor numeric, valor_ganho numeric, max_cards_por_pessoa bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  per as (select * from public.crm_pessoas_leads(p_client_id) b where b.d between p_from and p_to and (select pode from ok)),
  novas as (select pk from public.crm_pessoas_novas(p_client_id, p_from, p_to) where (select pode from ok)),
  por_pessoa as (select pk, count(*) as n from per group by pk),
  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
  tem as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                          where c.client_id = p_client_id) as sim),
  pv as (select v.pessoa, max(v.price) as price from public.crm_perfil_vendas(p_client_id) v
          where (select sim from tem) and (select pode from ok) and not v.copia
            and (v.quando at time zone 'America/Sao_Paulo')::date between p_from and p_to
          group by v.pessoa)
  select
    (select count(*) from per),
    (select count(*) from por_pessoa),
    (select count(*) from novas),
    (select count(*) from por_pessoa where pk not in (select pk from novas)),
    coalesce((select sum(n) from por_pessoa where pk not in (select pk from novas)), 0)::bigint,
    case when (select sim from tem) then (select count(*) from pv) else (select count(*) from per where outcome = 'won') end,
    (select count(*) from per where outcome = 'lost'),
    (select count(*) from per where outcome is distinct from 'won' and outcome is distinct from 'lost'),
    coalesce((select sum(price) from per), 0),
    case when (select sim from tem) then coalesce((select sum(price) from pv), 0)
         else coalesce((select sum(price) from per where outcome = 'won'), 0) end,
    coalesce((select max(n) from por_pessoa), 0);
$function$;

-- ------------------------------------------------------------ crm_orcamentos_por_tipo
CREATE OR REPLACE FUNCTION public.crm_orcamentos_por_tipo(p_client_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- [perfil-da-clinica] com perfil, o card aprovado é o card de venda (crm_perfil_vendas); a cópia do robô sai.
  with pvc as (select v.lead_id, v.copia from public.crm_perfil_vendas(p_client_id) v),
  base as (
    select case when cl.outcome is distinct from 'won' and exists (select 1 from pvc where pvc.lead_id = cl.id and not pvc.copia)
                then 'won' else cl.outcome end as outcome,
           cl.price, cl.occurred_at,
           case when cl.provider = 'flwchat' then coalesce(cl.raw_payload->'contactIds'->>0, cl.external_lead_id) else cl.external_lead_id end as pk,
           (select nullif(btrim(v->>'value'), '')
              from jsonb_array_elements(case when jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array' then cl.raw_payload->'custom_fields_values' else '[]'::jsonb end) f,
                   jsonb_array_elements(case when jsonb_typeof(f->'values') = 'array' then f->'values' else '[]'::jsonb end) v
             where f->>'field_name' ilike '%procedim%' limit 1) as procedimento,
           coalesce(cl.raw_payload->>'contato_tipo', '') in ('Equipe', 'Fornecedor ou representante') as interno
    from public.crm_leads_do_cliente(p_client_id) cl
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and not exists (select 1 from pvc where pvc.lead_id = cl.id and pvc.copia)
  ),
  t as (
    select b.*, coalesce(o.tipo, public.crm_tipo_procedimento(b.procedimento)) as tipo, o.tipo is not null as corrigido,
           b.outcome is distinct from 'won' and b.outcome is distinct from 'lost' and b.occurred_at < now() - interval '60 days' as esfriou
    from base b left join crm_procedimento_tipo o on o.client_id = p_client_id and o.procedimento = b.procedimento
    where b.procedimento is not null and not b.interno
  ),
  por_tipo as (
    select tipo, count(*) as itens, count(distinct pk) as pessoas,
           count(*) filter (where outcome = 'won') as aprovados,
           count(distinct pk) filter (where outcome = 'won') as pessoas_aprovadas,
           coalesce(sum(price) filter (where outcome = 'won'), 0) as valor_aprovado,
           count(*) filter (where outcome = 'won' and price is null) as aprovados_sem_valor,
           count(*) filter (where outcome = 'lost') as perdidos,
           count(*) filter (where esfriou) as esfriados,
           count(*) filter (where outcome is distinct from 'won' and outcome is distinct from 'lost' and not esfriou) as em_aberto
    from t group by tipo
  ),
  pac as (
    select pk, bool_or(outcome = 'won') as aprovou, coalesce(sum(price) filter (where outcome = 'won'), 0) as valor,
           bool_or(tipo = 'Consulta') as consulta, bool_or(outcome = 'won' and tipo <> 'Consulta') as comprou_alem
    from t group by pk
  ),
  nomes as (
    select procedimento, max(tipo) as tipo, bool_or(corrigido) as corrigido, count(*) as itens
    from t group by procedimento
  )
  select jsonb_build_object(
    'itens', (select count(*) from t),
    'cards_sem_procedimento', (select count(*) from base where procedimento is null and not interno),
    'cards_internos', (select count(*) from base where interno),
    'pessoas', (select count(*) from pac),
    'pessoas_aprovadas', (select count(*) from pac where aprovou),
    'valor_aprovado', (select coalesce(sum(valor), 0) from pac),
    'valor_por_paciente', (select round(avg(valor)) from pac where aprovou and valor > 0),
    'pessoas_com_consulta', (select count(*) from pac where consulta),
    'consulta_e_compra', (select count(*) from pac where consulta and comprou_alem),
    'esfriados', (select count(*) from t where esfriou),
    'tipos', coalesce((select jsonb_agg(to_jsonb(p) order by p.valor_aprovado desc, p.itens desc) from por_tipo p), '[]'::jsonb),
    'procedimentos', coalesce((select jsonb_agg(to_jsonb(n) order by n.itens desc) from (select * from nomes order by itens desc limit 300) n), '[]'::jsonb)
  )
$function$;

-- ------------------------------------------------------------ roi_periodo (troca de texto)
do $migra$
declare
  d text := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  trocas text[][] := array[
    array['  con as (select provider, subdomain from crm_connections where client_id = p_client_id and active),',
          $t$  -- [perfil-da-clinica] com perfil, venda = crm_perfil_vendas no período (uma por pessoa; valor = maior preço).
  tem_pv as (select exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                             where c.client_id = p_client_id) as sim),
  pv_cards as (
    select distinct on (v.pessoa) v.lead_id, v.pessoa, max(v.price) over (partition by v.pessoa) as price
      from public.crm_perfil_vendas(p_client_id) v
     where (select sim from tem_pv) and not v.copia and (v.quando at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     order by v.pessoa, v.quando, v.lead_id
  ),
  vend as (
    select price from pv_cards
    union all
    select price from l where outcome = 'won' and not (select sim from tem_pv)
  ),
  con as (select provider, subdomain from crm_connections where client_id = p_client_id and active),$t$],
    array[$t$    from public.crm_leads_do_cliente(p_client_id) g
    left join crm_funil_papel fp on fp.crm_connection_id = g.crm_connection_id and fp.pipeline_id = g.pipeline_id
    where g.client_id = p_client_id and g.removido_na_origem is null and g.outcome = 'won' and g.occurred_at is not null
      and (g.occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),$t$,
          $t$    -- Sem perfil: o mesmo filtro de antes (ganho criado no período). Com perfil: os cards de venda do período.
    from (select x.* from public.crm_leads_do_cliente(p_client_id) x
           where not (select sim from tem_pv) and x.outcome = 'won' and x.occurred_at is not null
             and (x.occurred_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
          union all
          select x.* from public.crm_leads_do_cliente(p_client_id) x
           where (select sim from tem_pv) and x.id in (select lead_id from pv_cards)) g
    left join crm_funil_papel fp on fp.crm_connection_id = g.crm_connection_id and fp.pipeline_id = g.pipeline_id
    where g.client_id = p_client_id and g.removido_na_origem is null and g.occurred_at is not null
  ),$t$],
    array[$t$    'ganhos', (select count(*) from l where outcome = 'won'),
    'ganhos_com_valor', (select count(*) from l where outcome = 'won' and price > 0),
    'receita', coalesce((select sum(price) from l where outcome = 'won' and price > 0), 0),$t$,
          $t$    'ganhos', (select count(*) from vend),
    'ganhos_com_valor', (select count(*) from vend where price > 0),
    'receita', coalesce((select sum(price) from vend where price > 0), 0),$t$],
    array[$t$    'ganho_identificavel', exists ($t$, $t$    'ganho_identificavel', (select sim from tem_pv) or exists ($t$]
  ];
  i int; n int;
begin
  if position('tem_pv' in d) > 0 then return; end if;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then raise exception 'roi_periodo: trecho % aparece % vezes (esperado 1)', i, n; end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migra$;

-- ------------------------------------------------------------ qualidade_dados (troca de texto)
do $migra$
declare
  d text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  trocas text[][] := array[
    array[$t$  where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days';
$t$, $t$  where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days';

  -- [perfil-da-clinica] com perfil, ganho = venda pelo perfil (pessoas com entrada numa etapa de venda em 90 dias).
  if exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id where c.client_id = p_client_id) then
    select count(distinct v.pessoa) into v_ganhos90
      from public.crm_perfil_vendas(p_client_id) v where not v.copia and v.quando >= now() - interval '90 days';
  end if;
$t$],
    array[$t$      from crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = 'won'
       and occurred_at >= now() - interval '30 days'
$t$, $t$      from (
        -- [perfil-da-clinica] com perfil, as vendas pelo perfil dos últimos 30 dias (uma por pessoa).
        select v.pessoa, max(v.price) as price from public.crm_perfil_vendas(p_client_id) v
         where not v.copia and v.quando >= now() - interval '30 days'
         group by v.pessoa
        union all
        select l.id::text, l.price from crm_leads l
         where l.client_id = p_client_id and l.removido_na_origem is null and l.outcome = 'won'
           and l.occurred_at >= now() - interval '30 days'
           and not exists (select 1 from crm_perfil_etapa x join crm_connections c on c.id = x.crm_connection_id
                            where c.client_id = p_client_id)
      ) vg
$t$]
  ];
  i int; n int;
begin
  if position('[perfil-da-clinica]' in d) > 0 then return; end if;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then raise exception 'qualidade_dados: trecho % aparece % vezes (esperado 1)', i, n; end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migra$;
