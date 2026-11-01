-- Hubla certa (auditoria de 01/11/2026): o checkout só vale no período que ele cobre.
-- Caso que motivou: o Doctor Creator tem vendas da Hubla no Nexo desde 30/06/2026 (carga de list_sales). A regra antiga
-- (cliente_usa_checkout = "há venda nos últimos 180 dias contados de hoje") ligava o checkout para qualquer período:
-- maio mostrava "Fecharam" 0 e junho 1, pela Hubla, em vez do CRM; e, se a Hubla parasse de mandar venda, o zero
-- ficaria na tela por até 180 dias.
--
-- O que muda:
--   1. checkout_cobertura(client): desde = primeira venda gravada (pago_em); última = última venda ou último webhook
--      recebido; parado = nada novo há mais de N dias, com N = 4 vezes o intervalo médio entre as vendas dos últimos
--      90 dias, entre 7 e 30 dias (Doctor Creator: 7). Parado, a cobertura termina na última venda.
--   2. pacientes_periodo, "Fecharam": vendas do checkout só dentro da cobertura; fora dela, as do CRM. Período que
--      atravessa o início (ou o fim) junta as duas fontes e diz até quando é CRM ('crm_antes_de', 'crm_depois_de').
--      Período todo antes: CRM, com 'checkout_desde'. Período todo depois de parado: CRM com 'checkout_parado_desde';
--      sem CRM, "sem dado" com o motivo, em vez de 0.
--   3. Order bump: uma venda por fatura pai; o valor é o da pai (que já soma os itens), e as filhas só valem quando a
--      pai não tem valor ou não chegou. Repetir a filha, ou chegar pai e filhas, não soma duas vezes.
--   4. Em protesto (in_protest) conta como venda, como na Hubla ('em_protesto' diz quantas). Renovação e upgrade de
--      assinatura saem de "Fecharam" (não são paciente novo) e aparecem em 'renovacoes', com o valor.
--   5. Pessoas: a venda liga à pessoa pelo pessoa_id ou pelo telefone_chave (mesmo que a pessoa tenha sido criada
--      depois da venda). 'sem_pessoa' conta as vendas sem ligação; 'unidade' = 'vendas' quando nenhuma liga (a tela
--      troca "pessoas que compraram" por "vendas pagas").
--   6. Reembolsos: só faturas pai. O pedido de reembolso solto da carga (list_refunds, sem o id da fatura,
--      bruto.id_tipo = refund_request) só conta antes do primeiro webhook gravado; depois, o reembolso chega pela fatura.
--   7. cliente_usa_checkout(client): há cobertura e o checkout não está parado.
-- O valor é sempre BRUTO (totalCents), igual na carga e no webhook (api/_lib/checkout-vendas.ts).
-- Como: DO-block que troca os trechos que 20261031170000 pôs na função e acrescenta um bloco antes do fim do bloco
-- [nao-medido] (20261101130000). Não mexe em nenhum outro número. Rodar de novo não muda nada (marcador
-- [checkout-cobertura]). Custo: leituras pelo índice (client_id, pago_em) de vendas_checkout; para quem não tem
-- checkout, uma leitura vazia.
-- Segurança: pacientes_periodo continua security definer com a mesma checagem de acesso; checkout_cobertura e
-- cliente_usa_checkout são invoker (a RLS de vendas_checkout vale para quem chama direto); anon não executa.
-- Reversão: recriar pacientes_periodo pelas migrações 20261031150000 + 160000 + 162000 + 170000 + 20261101130000,
--   recriar cliente_usa_checkout como em 20261031170000 e drop function public.checkout_cobertura(uuid).

create or replace function public.checkout_cobertura(p_client uuid)
returns table (desde timestamptz, ultima timestamptz, ate timestamptz, parado boolean, tolerancia_dias integer,
               webhook_desde timestamptz, provedores text)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  with b as (
    select min(v.pago_em) as desde,
           max(v.pago_em) as ultima_venda,
           max(v.recebido_em) filter (where v.bruto ? 'event') as ultimo_webhook,
           min(v.recebido_em) filter (where v.bruto ? 'event') as webhook_desde,
           string_agg(distinct v.provider, ',' order by v.provider) as provedores
      from public.vendas_checkout v
     where v.client_id = p_client
  ),
  t as (
    select b.*, greatest(b.ultima_venda, b.ultimo_webhook) as ultima,
           least(30, greatest(7, ceil(4 * 90.0 / greatest(1, (
             select count(*) from public.vendas_checkout v
              where v.client_id = p_client and v.parent_externo_id is null
                and v.pago_em > b.ultima_venda - interval '90 days')))))::integer as tol
      from b
  )
  select t.desde, t.ultima,
         case when t.desde is not null and now() > t.ultima + make_interval(days => t.tol) then t.ultima end,
         t.desde is not null and now() > t.ultima + make_interval(days => t.tol),
         t.tol, t.webhook_desde, t.provedores
    from t
$$;
revoke all on function public.checkout_cobertura(uuid) from public, anon;
grant execute on function public.checkout_cobertura(uuid) to authenticated, service_role;

create or replace function public.cliente_usa_checkout(p_client uuid)
returns boolean
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select c.desde is not null and not c.parado from public.checkout_cobertura(p_client) c), false)
$$;
revoke all on function public.cliente_usa_checkout(uuid) from public, anon;
grant execute on function public.cliente_usa_checkout(uuid) to authenticated, service_role;

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  -- 1. vendas: checkout só dentro da cobertura, uma venda por fatura pai; o resto pelo CRM.
  a1 text := $a$  ck as (select public.cliente_usa_checkout(p_client) as usa),
  ck_pagas as (
    select v.*,
           coalesce((select sum(f.valor_centavos) from vendas_checkout f
                      where f.client_id = v.client_id and f.provider = v.provider and f.parent_externo_id = v.externo_id
                        and f.status = 'paid'), 0) as filhas_centavos
      from vendas_checkout v
     where v.client_id = p_client and v.parent_externo_id is null and v.status = 'paid'
       and v.pago_em >= v_ini and v.pago_em < v_fim
  ),
  ck_reemb as (
    select v.* from vendas_checkout v
     where v.client_id = p_client and v.status in ('refunded', 'chargeback')
       and coalesce(v.reembolsado_em, v.pago_em) >= v_ini and coalesce(v.reembolsado_em, v.pago_em) < v_fim
  ),
  vendas as (
    select * from vend where not prospec_sem_valor and not (select usa from ck)
    union all
    select v.id,
           coalesce('p:' || v.pessoa_id::text, 't:' || v.telefone_chave, 'x:' || v.provider || ':' || v.externo_id) as u,
           v.pago_em as quando, round((v.valor_centavos + v.filhas_centavos) / 100.0, 2)::numeric as price,
           null::text as funil, v.produto as procedimento, false as prospec_sem_valor
      from ck_pagas v where (select usa from ck)
  ),$a$;
  n1 text := $n$  -- [checkout-cobertura] (20261102130000): o checkout só manda no trecho do período que ele cobre.
  ck_cob as materialized (select * from public.checkout_cobertura(p_client)),
  ck as (
    select coalesce(c.desde < v_fim and (c.ate is null or c.ate >= v_ini), false) as usa,
           c.desde, c.ate, c.ultima, c.parado, c.tolerancia_dias, c.webhook_desde, c.provedores
      from ck_cob c
  ),
  -- Uma venda por fatura pai (order bump e combo juntos). A pai já traz o total com todos os itens; as filhas só dão o
  -- valor quando a pai não tem valor ou não chegou. Assim, filha repetida ou pai + filhas não somam duas vezes.
  ck_grupos as (
    select v.provider, coalesce(v.parent_externo_id, v.externo_id) as grupo,
           bool_or(v.parent_externo_id is null) as tem_pai,
           bool_or(v.parent_externo_id is null and v.status in ('paid', 'in_protest')) as pai_vendida,
           bool_or(v.parent_externo_id is null and v.status = 'in_protest') as em_protesto,
           max(v.valor_centavos) filter (where v.parent_externo_id is null) as pai_centavos,
           coalesce(sum(v.valor_centavos) filter (where v.parent_externo_id is not null and v.status in ('paid', 'in_protest')), 0) as filhas_centavos,
           count(*) filter (where v.parent_externo_id is not null and v.status in ('paid', 'in_protest')) as filhas,
           coalesce(min(v.pago_em) filter (where v.parent_externo_id is null), min(v.pago_em)) as quando,
           (array_agg(v.id order by v.parent_externo_id is not null, v.pago_em))[1] as id,
           (array_agg(v.tipo order by v.parent_externo_id is not null, v.pago_em))[1] as tipo,
           (array_agg(v.produto order by v.parent_externo_id is not null, v.pago_em))[1] as produto,
           (array_agg(v.pessoa_id order by v.parent_externo_id is not null, v.pago_em) filter (where v.pessoa_id is not null))[1] as pessoa_id,
           (array_agg(v.telefone_chave order by v.parent_externo_id is not null, v.pago_em) filter (where v.telefone_chave is not null))[1] as telefone_chave
      from vendas_checkout v
     where v.client_id = p_client and v.pago_em >= v_ini - interval '2 days' and v.pago_em < v_fim + interval '2 days'
       and (select usa from ck)
     group by 1, 2
  ),
  -- Paga ou em protesto (a Hubla conta as duas), dentro da cobertura. Renovação e upgrade de assinatura vão para
  -- 'renovacoes': entram à parte, mas não são paciente novo. A pessoa sai do pessoa_id ou do telefone_chave.
  ck_pagas as (
    select g.*, case when coalesce(g.pai_centavos, 0) > 0 then g.pai_centavos else g.filhas_centavos end as centavos,
           coalesce(g.tipo, 'sell') in ('renewal', 'upgrade') as renovacao,
           coalesce('p:' || coalesce(g.pessoa_id, (select p.id from pessoas p where p.client_id = p_client and p.telefone_chave = g.telefone_chave))::text,
                    't:' || g.telefone_chave, 'x:' || g.provider || ':' || g.grupo) as u
      from ck_grupos g cross join ck
     where (g.pai_vendida or (not g.tem_pai and g.filhas > 0))
       and g.quando >= v_ini and g.quando < v_fim
       and g.quando >= ck.desde and (ck.ate is null or g.quando <= ck.ate)
  ),
  -- Reembolso e chargeback do período, à parte (não mexem em "fecharam"). O pedido de reembolso solto da carga
  -- (list_refunds não traz a fatura) só conta antes de o webhook começar a gravar; depois, o reembolso chega pela
  -- própria fatura e a linha solta contaria duas vezes.
  ck_reemb as (
    select v.* from vendas_checkout v cross join ck
     where ck.usa and v.client_id = p_client and v.parent_externo_id is null and v.status in ('refunded', 'chargeback')
       and coalesce(v.reembolsado_em, v.pago_em) >= v_ini and coalesce(v.reembolsado_em, v.pago_em) < v_fim
       and not (coalesce(v.bruto->>'id_tipo', '') = 'refund_request' and ck.webhook_desde is not null
                and coalesce(v.reembolsado_em, v.pago_em) >= ck.webhook_desde)
  ),
  -- Fora da cobertura do checkout (antes da primeira venda gravada ou depois que ele parou), vale o CRM.
  vendas as (
    select vd.*, 'crm'::text as fonte from vend vd cross join ck
     where not vd.prospec_sem_valor
       and (not ck.usa or vd.quando < ck.desde or (ck.ate is not null and vd.quando > ck.ate))
    union all
    select v.id, v.u, v.quando, round(v.centavos / 100.0, 2)::numeric as price,
           null::text as funil, v.produto as procedimento, false as prospec_sem_valor, 'checkout'::text as fonte
      from ck_pagas v where not v.renovacao
  ),$n$;
  -- 2. lista "fecharam": a fonte de cada venda.
  a2 text := $a$    select 'fecharam', v.u, v.quando, case when (select usa from ck) then 'checkout' else 'crm' end,
           jsonb_build_object('valor', v.price, 'funil', v.funil, 'procedimento', v.procedimento,
                              'produto', case when (select usa from ck) then v.procedimento end,$a$;
  n2 text := $n$    select 'fecharam', v.u, v.quando, v.fonte,
           jsonb_build_object('valor', v.price, 'funil', v.funil, 'procedimento', v.procedimento,
                              'produto', case when v.fonte = 'checkout' then v.procedimento end,$n$;
  -- 3. número "fecharam" com checkout: cobertura, pessoas x vendas, protesto, renovação e reembolsos sem duplicar.
  a3 text := $a$      'fecharam', case
        when (select usa from ck) then jsonb_build_object('valor', (select count(distinct u) from vendas), 'fonte', 'checkout',
            'motivo_sem_dado', null, 'responsavel', null,
            'provedor', (select string_agg(distinct provider, ',' order by provider) from vendas_checkout where client_id = p_client),
            'vendas', (select count(*) from vendas),
            'valor_total', (select coalesce(sum(price), 0) from vendas),
            'sem_valor', (select count(*) from vendas where coalesce(price, 0) = 0),
            'ganho_prospeccao_sem_valor', 0,
            'reembolsos', jsonb_build_object(
              'vendas', (select count(*) from ck_reemb where parent_externo_id is null),
              'valor_total', (select coalesce(round(sum(valor_centavos) / 100.0, 2), 0) from ck_reemb)))
        when not f.tem_crm then$a$;
  n3 text := $n$      'fecharam', case
        when (select usa from ck) then jsonb_build_object('valor', (select count(distinct u) from vendas), 'fonte', 'checkout',
            'motivo_sem_dado', null, 'responsavel', null,
            'provedor', (select provedores from ck),
            'vendas', (select count(*) from vendas),
            'valor_total', (select coalesce(sum(price), 0) from vendas),
            'sem_valor', (select count(*) from vendas where coalesce(price, 0) = 0),
            'ganho_prospeccao_sem_valor', 0,
            'vendas_checkout', (select count(*) from vendas where fonte = 'checkout'),
            'vendas_crm', (select count(*) from vendas where fonte = 'crm'),
            'sem_pessoa', (select count(*) from vendas where fonte = 'checkout' and u like 'x:%'),
            'unidade', case when exists (select 1 from vendas)
                             and not exists (select 1 from vendas where not (fonte = 'checkout' and u like 'x:%'))
                            then 'vendas' else 'pessoas' end,
            'em_protesto', (select count(*) from ck_pagas where em_protesto and not renovacao),
            'renovacoes', jsonb_build_object(
              'vendas', (select count(*) from ck_pagas where renovacao),
              'valor_total', (select coalesce(round(sum(centavos) / 100.0, 2), 0) from ck_pagas where renovacao)),
            'cobertura_checkout', (select jsonb_build_object(
              'desde', (c.desde at time zone 'America/Sao_Paulo')::date,
              'ultima', (c.ultima at time zone 'America/Sao_Paulo')::date,
              'parado', c.parado, 'tolerancia_dias', c.tolerancia_dias) from ck c),
            'crm_antes_de', (select case when f.tem_crm and c.desde > v_ini then (c.desde at time zone 'America/Sao_Paulo')::date end from ck c),
            'crm_depois_de', (select case when f.tem_crm and c.ate < v_fim then (c.ate at time zone 'America/Sao_Paulo')::date end from ck c),
            'reembolsos', jsonb_build_object(
              'vendas', (select count(*) from ck_reemb),
              'valor_total', (select coalesce(round(sum(valor_centavos) / 100.0, 2), 0) from ck_reemb)))
        when not f.tem_crm then$n$;
  -- 4 e 5. variáveis e o bloco de fora da cobertura, antes do fim do bloco [nao-medido] (20261101130000).
  a4 text := E'  v_motivo text;\nbegin\n';
  n4 text := E'  v_motivo text;\n  v_ck_desde timestamptz;\n  v_ck_ate timestamptz;\n  v_ck_nome text;\nbegin\n';
  a5 text := E'  -- [nao-medido] fim\n  return v;';
  n5 text := $n$  -- [checkout-cobertura] início: fora da cobertura do checkout, o número diz por quê (20261102130000).
  -- Antes da primeira venda gravada, ou depois que o checkout parou, vale o CRM quando ele marca alguma venda; se o
  -- CRM não marca nenhuma (Doctor Creator antes de julho/2026), o número é "sem dado", e não 0.
  select c.desde, c.ate, c.provedores into v_ck_desde, v_ck_ate, v_ck_nome from public.checkout_cobertura(p_client) c;
  if v_ck_desde is not null and (v #>> '{numeros,fecharam,fonte}') is distinct from 'checkout' then
    v_ck_nome := coalesce((select string_agg(case x when 'hubla' then 'Hubla' when 'hotmart' then 'Hotmart' when 'eduzz' then 'Eduzz'
                                                   when 'kiwify' then 'Kiwify' else x end, ' e ')
                             from unnest(string_to_array(v_ck_nome, ',')) x), 'checkout');
    v_motivo := null;
    if v_fim <= v_ck_desde then
      v := jsonb_set(v, '{numeros,fecharam,checkout_desde}', to_jsonb((v_ck_desde at time zone 'America/Sao_Paulo')::date));
      v_motivo := format('As vendas da %s só chegam ao Nexo desde %s', v_ck_nome, to_char(v_ck_desde at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
    elsif v_ck_ate is not null and v_ini > v_ck_ate then
      v := jsonb_set(v, '{numeros,fecharam,checkout_parado_desde}', to_jsonb((v_ck_ate at time zone 'America/Sao_Paulo')::date));
      v_motivo := format('A %s não manda venda ao Nexo desde %s', v_ck_nome, to_char(v_ck_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
    end if;
    if v_motivo is not null and coalesce((v #>> '{numeros,fecharam,valor}')::numeric, 0) = 0
       and coalesce((v #>> '{numeros,fecharam,vendas}')::numeric, 0) = 0 then
      v := jsonb_set(v, '{numeros,fecharam}', jsonb_build_object('valor', null, 'fonte', 'checkout',
             'motivo_sem_dado', v_motivo || case when coalesce((v->>'tem_crm')::boolean, false)
               then ', e o CRM não marca venda nesse período. Não dá para contar quem fechou.'
               else '. Antes disso, não dá para contar quem fechou.' end,
             'responsavel', 'equipe_hub',
             'alerta', case when v_ck_ate is not null and v_ini > v_ck_ate then 'checkout-parado' else 'checkout-sem-cobertura' end,
             'checkout_desde', v #> '{numeros,fecharam,checkout_desde}',
             'checkout_parado_desde', v #> '{numeros,fecharam,checkout_parado_desde}'));
    end if;
  end if;
  -- [checkout-cobertura] fim
  -- [nao-medido] fim
  return v;$n$;
begin
  if position('[checkout-cobertura]' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 or position(a5 in d) = 0 then
    raise exception 'pacientes_periodo: trechos de 20261031170000 ou 20261101130000 não encontrados; a função mudou e esta migração precisa ser revista';
  end if;
  execute replace(replace(replace(replace(replace(d, a1, n1), a2, n2), a3, n3), a4, n4), a5, n5);
end
$migra$;
