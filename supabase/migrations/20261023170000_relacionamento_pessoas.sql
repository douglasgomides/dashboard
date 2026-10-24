-- Paciente novo × já é paciente, para a Central de Atendimento (sem prontuário: só o histórico que já temos).
--   ja_paciente: tem venda ganha no CRM da clínica, ou etapa de consulta realizada/compareceu.
--   ultima_compra / compras: datas e contagem das vendas ganhas. Nada de valor, procedimento ou dado clínico.
--   conversou_antes: tem conversa com a clínica iniciada há mais de 30 dias (contato antigo, mesmo sem compra).
-- Só leitura; admin ou membro da clínica; no máximo 100 pessoas por chamada.
-- Reversão: drop function public.relacionamento_pessoas(uuid, uuid[]);

create or replace function public.relacionamento_pessoas(p_client uuid, p_pessoas uuid[])
returns table(pessoa_id uuid, ja_paciente boolean, compras integer, ultima_compra date, conversou_antes boolean, primeiro_contato date)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) and cardinality(p_pessoas) <= 100 as pode),
  alvo as (select distinct unnest(p_pessoas) as id where (select pode from ok)),
  vendas as (
    select l.pessoa_id, count(*) filter (where l.outcome = 'won') as compras,
      max(coalesce(l.occurred_at, l.received_at)) filter (where l.outcome = 'won') as ultima,
      bool_or(coalesce(cps.status_name, '') ~* '(realizad|compareceu|atendid)') as compareceu
    from crm_leads l
    left join crm_pipeline_statuses cps on cps.crm_connection_id = l.crm_connection_id and cps.pipeline_id = l.pipeline_id and cps.status_id = l.status_id
    where l.client_id = p_client and l.pessoa_id in (select id from alvo) and l.removido_na_origem is null
    group by 1
  ),
  conversas_p as (
    select c.pessoa_id, min(c.iniciada_em) as primeira
    from conversas c where c.client_id = p_client and c.pessoa_id in (select id from alvo)
    group by 1
  )
  select a.id,
    coalesce(v.compras, 0) > 0 or coalesce(v.compareceu, false),
    coalesce(v.compras, 0)::integer,
    (v.ultima at time zone 'America/Sao_Paulo')::date,
    coalesce(cp.primeira < now() - interval '30 days', false),
    (cp.primeira at time zone 'America/Sao_Paulo')::date
  from alvo a left join vendas v on v.pessoa_id = a.id left join conversas_p cp on cp.pessoa_id = a.id;
$function$;
revoke all on function public.relacionamento_pessoas(uuid, uuid[]) from public, anon;
grant execute on function public.relacionamento_pessoas(uuid, uuid[]) to authenticated, service_role;
