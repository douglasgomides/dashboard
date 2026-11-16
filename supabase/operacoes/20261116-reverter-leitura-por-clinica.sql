-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116160000_leitura_por_clinica_pela_config.sql.
-- Rodar ANTES de 20261116-reverter-agendou-lead-novo.sql quando as duas forem desfeitas (ordem inversa da aplicação).
-- Usa os MESMOS pares da migração (copiados entre [trocas:início] e [trocas:fim]), ao contrário e na ordem inversa: procura
-- o texto novo e põe de volta o antigo, com a mesma contagem esperada. Função sem a marca [leitura-por-clinica] fica como
-- está. As chaves gravadas em crm_connections.config (nao_e_lead, ganho_sem_valor_card_antigo_dias) podem ficar: sem
-- esta migração, nada as lê.

begin;
create or replace function pg_temp.por_clinica_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[leitura-por-clinica]' in d) = 0 then return; end if;  -- já está sem a troca
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    n := (length(d) - length(replace(d, p_trocas[i][2], ''))) / length(p_trocas[i][2]);
    if n <> p_trocas[i][3]::int then
      raise exception 'reverter %: trecho % aparece % vezes (esperado %). Nada foi alterado: %', p_fn, i, n, p_trocas[i][3], left(p_trocas[i][2], 120);
    end if;
    d := replace(d, p_trocas[i][2], p_trocas[i][1]);
  end loop;
  if position('[leitura-por-clinica]' in d) > 0 then raise exception 'reverter %: a marca [leitura-por-clinica] continua lá', p_fn; end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, ao contrário e na ordem inversa)
-- ---------------------------------------------------------------------------------------------------------------
-- crm_pessoas_leads: o card parado numa etapa (ou funil) de config.nao_e_lead não conta como lead.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.por_clinica_desfazer('public.crm_pessoas_leads(uuid)'::regprocedure, array[
  array[$t$  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and cl.occurred_at is not null;$t$,
        $t$  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
  left join crm_connections cc on cc.id = cl.crm_connection_id
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and cl.occurred_at is not null
    -- [leitura-por-clinica] Card parado numa etapa (ou funil, "/*") que a conexão diz que não é lead: fica fora.
    and not coalesce(cc.config->'nao_e_lead' ?| array[cl.pipeline_id || '/' || cl.status_id, cl.pipeline_id || '/*'], false);$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- pacientes_periodo_calc ("Fecharam", conexões sem perfil): ganho sem valor em card antigo não é venda.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.por_clinica_desfazer('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$      from cards c left join g_jan g on g.cx = c.cx and g.ext = c.ext
      left join g_real r on r.id = c.id and r.em is not null
     where c.outcome = 'won'$t$,
        $t$      from cards c left join g_jan g on g.cx = c.cx and g.ext = c.ext
      left join g_real r on r.id = c.id and r.em is not null
      left join crm_connections gk on gk.id = c.cx
     where c.outcome = 'won'
       -- [leitura-por-clinica] Ganho sem valor marcado mais de N dias depois da criação do card (config da conexão):
       -- lote de arrumação, não é venda.
       and not coalesce(coalesce(c.price, 0) = 0
             and coalesce(r.em, g.no_periodo, c.occurred_at) > c.occurred_at + make_interval(days =>
               case when gk.config->>'ganho_sem_valor_card_antigo_dias' ~ '^[0-9]{1,4}$'
                    then (gk.config->>'ganho_sem_valor_card_antigo_dias')::int end), false)$t$, '1']
]);

-- ---------------------------------------------------------------------------------------------------------------
-- crm_vendas_periodo (vendas do período, conexões sem perfil): a mesma regra.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.por_clinica_desfazer('public.crm_vendas_periodo(uuid,date,date)'::regprocedure, array[
  array[$t$           cl.occurred_at,
           public.crm_origem_classifica(cl.source) as origem,$t$,
        $t$           cl.occurred_at,
           -- [leitura-por-clinica] Ganho sem valor: dias depois da criação a partir dos quais não é venda (config).
           case when cl.outcome = 'won' and coalesce(cl.price, 0) = 0 and cc.config->>'ganho_sem_valor_card_antigo_dias' ~ '^[0-9]{1,4}$'
                then (cc.config->>'ganho_sem_valor_card_antigo_dias')::int end as lote_dias,
           public.crm_origem_classifica(cl.source) as origem,$t$, '1'],
  array[$t$     where not c.perfil and c.outcome = 'won' and case when c.dg is not null$t$,
        $t$     where not c.perfil and c.outcome = 'won'
       and not coalesce(coalesce(c.dg, g.d, c.d) > c.d + c.lote_dias, false) /* [leitura-por-clinica] lote antigo sem valor */
       and case when c.dg is not null$t$, '1']
]);
-- [trocas:fim]

delete from public.resultado_pronto where funcao in ('pacientes_periodo', 'roi_periodo');
commit;
