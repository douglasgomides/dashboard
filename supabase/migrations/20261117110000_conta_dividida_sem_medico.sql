-- [conta-dividida] Conta de CRM dividida entre médicos: o contato que não é de nenhum médico aparece à parte, como "sem
-- médico", nos painéis da conta, e não soma em nenhum (debug numeros-nao-batem-fonte, decisões do João de 17/11/2026).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261117100000_conta_compartilhada_uma_copia.sql
-- (não depende dela; com ela, os painéis da conta leem a mesma cópia e o "sem médico" sai igual nos dois). Agentes não
-- rodam este arquivo. Reversão: supabase/operacoes/20261117-reverter-conta-dividida.sql.
--
-- O que muda (regra geral, nenhuma clínica citada):
--  1. crm_sem_divisao(cliente, de, até), nova, só leitura: quando a conexão do cliente está numa conta ligada a mais de um
--     cliente (mesmo provedor e subdomínio) e TODOS os clientes dessa conta têm regra de inclusão de card
--     (crm_filtro_cliente, modo 'incluir', tipo pipeline/responsavel/tag/campo), conta as pessoas novas do período cujos
--     cards não entram na regra de nenhum deles ("sem médico"). Mesma pessoa nova de "Leads novos" (primeiro card no
--     período; sem funil de compra/base, sem "Paciente antigo", sem card parado em config.nao_e_lead). Fora desse caso
--     (conta não dividida, ou um cliente da conta sem regra de inclusão, que então fica com o resto): null. Nenhuma outra
--     função a chama, então nenhum número existente muda e nada é somado: o "sem médico" não entra em "Leads novos" de
--     ninguém, nem no histórico diário, nem na Carteira.
--  2. crm_compartilhado_com (o aviso "o CRM é o mesmo de ..." da tela Resultados) passa a seguir a mesma regra de
--     pacientes_periodo: com a divisão ligada (crm_tem_filtro), os números já são só deste cliente e o aviso não aparece.
--
-- Velocidade: crm_sem_divisao roda só nas telas do período (uma chamada por tela), lê os cards da própria conexão pelo
-- índice (client_id) e sai sem ler card quando a conta não é dividida. crm_compartilhado_com ganha um exists na tabela
-- de regras (poucas linhas). Medida: consultas-ciclo5.sql do debug (Q2).

create or replace function public.crm_sem_divisao(p_client uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_todas text[];
  v_dividida boolean;
  v_n integer;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    raise exception 'sem acesso a esta clínica' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'período inválido' using errcode = '22023'; end if;

  -- As contas (provedor + subdomínio) em que este cliente tem regra de inclusão de card, e a regra de cada cliente delas.
  with minhas as (
    select distinct k.provider, k.subdomain
      from crm_filtro_cliente f join crm_connections k on k.id = f.crm_connection_id and k.active
     where f.client_id = p_client and f.modo = 'incluir' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
       and coalesce(k.subdomain, '') <> ''
  ),
  conta as (
    select distinct o.id as cx, o.client_id
      from minhas m
      join crm_connections o on o.provider = m.provider and o.subdomain = m.subdomain and o.active
      join clients cl on cl.id = o.client_id and cl.active and not cl.eh_teste
  ),
  regras as (
    select c.cx, c.client_id,
           coalesce(array_agg(k) filter (where k is not null), '{}'::text[]) as incluir
      from conta c
      left join crm_filtro_cliente f
        on f.crm_connection_id = c.cx and f.client_id = c.client_id and f.modo = 'incluir'
       and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
      left join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k on true
     group by c.cx, c.client_id
  )
  select count(distinct r.client_id) > 1 and bool_and(cardinality(r.incluir) > 0),
         (select array_agg(distinct x) from regras r2 cross join lateral unnest(r2.incluir) x)
    into v_dividida, v_todas
    from regras r;

  if not coalesce(v_dividida, false) then return null; end if;

  -- Cards da própria conexão do cliente nessas contas (a cópia da conta inteira que ela grava).
  with cards as (
    select coalesce(l.chave_pessoa, public.crm_chave_pessoa(l.provider, l.raw_payload, l.contact_phone, l.external_lead_id, l.crm_connection_id)) as pk,
           (l.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           coalesce(fp.papel, 'captacao') not in ('compra', 'base') as conta,
           coalesce(public.crm_origem_classifica(l.source) = 'Paciente antigo', false) as pa,
           not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && v_todas) as fora
      from crm_leads l
      join crm_connections k on k.id = l.crm_connection_id and k.active and k.client_id = p_client
      left join crm_funil_papel fp on fp.crm_connection_id = l.crm_connection_id and fp.pipeline_id = l.pipeline_id
     where l.client_id = p_client
       and exists (select 1 from crm_filtro_cliente f
                    where f.client_id = p_client and f.crm_connection_id = l.crm_connection_id and f.modo = 'incluir'
                      and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
       and l.removido_na_origem is null and l.occurred_at is not null
       and not coalesce(k.config->'nao_e_lead' ?| array[l.pipeline_id || '/' || l.status_id, l.pipeline_id || '/*'], false)
  ),
  x as (select c.*, min(c.d) over (partition by c.pk) as primeiro from cards c)
  select count(*) into v_n from (
    select x.pk from x
     group by x.pk
    having min(x.primeiro) between p_de and p_ate
       and bool_or(x.conta) filter (where x.d = x.primeiro)
       and not bool_or(x.pa)
       and bool_and(x.fora)
  ) p;

  return jsonb_build_object('pessoas_novas', v_n, 'periodo', jsonb_build_object('de', p_de, 'ate', p_ate));
end
$$;
revoke all on function public.crm_sem_divisao(uuid, date, date) from public, anon;
grant execute on function public.crm_sem_divisao(uuid, date, date) to authenticated, service_role;

-- crm_compartilhado_com: com a divisão ligada, o aviso de conta inteira não vale (mesma regra de pacientes_periodo).
create or replace function pg_temp.dividida_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[conta-dividida]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> p_trocas[i][3]::int then
      raise exception '[conta-dividida] %: trecho % aparece % vezes (esperado %). Nada foi alterado: %',
        p_fn, i, n, p_trocas[i][3], left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position('[conta-dividida]' in d) = 0 then
    raise exception '[conta-dividida] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, ao contrário)
select pg_temp.dividida_trocar('public.crm_compartilhado_com(uuid)'::regprocedure, array[
  array[$t$     where k.client_id = p_client and k.active), '[]'::jsonb);$t$,
        $t$     where k.client_id = p_client and k.active
       and not public.crm_tem_filtro(p_client) /* [conta-dividida] com a divisão ligada, os números já são só deste cliente */), '[]'::jsonb);$t$, '1']
]);
-- [trocas:fim]
