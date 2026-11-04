-- Jornada comercial da Dra. Lana (conferida no painel em 05/11/2026):
-- 1) "Onde a jornada quebra" e o passo "Venda" mostravam 19: crm_diagnostico_comercial contava, com perfil, só o card
--    criado no período já numa etapa de venda. Agora, com perfil, o card que entrou no período conta como comprou
--    quando a pessoa dele comprou depois (crm_perfil_vendas, sem cópia), a mesma regra de "Por funil"
--    (20261105150000); e quem comprou conta também como agendou.
-- 2) O passo "Conversa no WhatsApp" dizia "Sem integração: WhatsApp pela WTS" para quem recebe o WhatsApp pelo CRM
--    (Kommo: ~3 mil conversas/mês na Lana). jornada_funil.fontes.tem_whatsapp passa a valer também quando há conversa
--    de WhatsApp no Nexo.
-- As duas são alteradas pelo texto da definição atual (cada trecho precisa existir uma vez; senão a migração para).

do $migra$
declare
  d text := pg_get_functiondef('public.crm_diagnostico_comercial(uuid,date,date)'::regprocedure);
  trocas text[][] := array[
    array[$t$  copias as (select v.lead_id from public.crm_perfil_vendas(p_client_id) v where v.copia),$t$,
          $t$  pvs as materialized (select * from public.crm_perfil_vendas(p_client_id)),
  copias as (select v.lead_id from pvs v where v.copia),
  -- [perfil-da-clinica] primeira compra de cada pessoa (sem cópia), para "comprou" seguir quem entrou no período.
  compras as (select v.pessoa, min(v.quando) as primeira from pvs v where not v.copia group by v.pessoa),$t$],
    array[$t$      e.p_agendou, e.p_ganho, e.p_perdido,
      case cl.provider$t$,
          $t$      e.p_agendou, case when e.p_ganho is null then null else cp.pessoa is not null end as p_ganho, e.p_perdido,
      case cl.provider$t$],
    array[$t$    left join pessoas p on p.id = cl.pessoa_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
$t$, $t$    left join pessoas p on p.id = cl.pessoa_id
    left join pe on pe.crm_connection_id = cl.crm_connection_id and pe.pipeline_id = cl.pipeline_id and pe.status_id = cl.status_id
    left join compras cp on e.p_ganho is not null
      and cp.pessoa = coalesce('p:' || cl.pessoa_id::text, 'l:' || cl.id::text) and cp.primeira >= cl.occurred_at - interval '1 day'
$t$],
    array[$t$'agendados', count(*) filter (where coalesce(p_agendou or ja_agendou, consulta$t$,
          $t$'agendados', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho, consulta$t$],
    array[$t$'agendados_provaveis', count(*) filter (where coalesce(p_agendou or ja_agendou, consulta$t$,
          $t$'agendados_provaveis', count(*) filter (where coalesce(p_agendou or ja_agendou or p_ganho, consulta$t$]
  ];
  i int; n int;
begin
  if position('compras as (select v.pessoa' in d) > 0 then return; end if;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then raise exception 'crm_diagnostico_comercial: trecho % aparece % vezes (esperado 1)', i, n; end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migra$;

do $migra$
declare
  d text := pg_get_functiondef('public.jornada_funil(uuid,date,date)'::regprocedure);
  velho text := 'exists (select 1 from clients where id = p_client and wts_company_id is not null) tem_whatsapp';
  novo text := '(exists (select 1 from clients where id = p_client and wts_company_id is not null)
        or exists (select 1 from conversas where client_id = p_client and canal = ''whatsapp'')) tem_whatsapp';
  n int;
begin
  if position('canal = ''whatsapp''' in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, velho, ''))) / length(velho);
  if n <> 1 then raise exception 'jornada_funil: trecho aparece % vezes (esperado 1)', n; end if;
  execute replace(d, velho, novo);
end
$migra$;
