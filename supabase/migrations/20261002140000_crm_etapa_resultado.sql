-- Aba "A analisar": a equipe confirma o que cada etapa do CRM significa
-- (ganho, perdido ou aberto) quando o CRM do cliente é organizado de um jeito
-- que o dashboard não consegue adivinhar (ex.: "Liberado" é orçamento aprovado?).
-- A confirmação vale para os leads atuais e para as próximas sincronizações.
create table if not exists public.crm_etapa_resultado (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  status_id text not null,
  outcome text not null check (outcome in ('open', 'won', 'lost')),
  confirmado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id, status_id)
);
alter table public.crm_etapa_resultado enable row level security;
drop policy if exists "admin gerencia mapeamento de etapas" on public.crm_etapa_resultado;
create policy "admin gerencia mapeamento de etapas" on public.crm_etapa_resultado
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.crm_etapas_para_analise(p_client_id uuid)
returns table(connection_id uuid, provider text, pipeline_id text, pipeline_name text,
              status_id text, status_name text, total bigint, valor numeric,
              ganhos bigint, perdidos bigint, abertos bigint,
              confirmado boolean, resultado_confirmado text)
language sql stable security definer set search_path to 'public'
as $function$
  select cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name,
    count(cl.id), coalesce(sum(cl.price), 0),
    count(cl.id) filter (where cl.outcome = 'won'),
    count(cl.id) filter (where cl.outcome = 'lost'),
    count(cl.id) filter (where cl.outcome = 'open'),
    max(m.outcome) is not null, max(m.outcome)
  from crm_connections cc
  join crm_pipeline_statuses cps on cps.crm_connection_id = cc.id
  left join crm_leads cl on cl.crm_connection_id = cc.id
    and cl.pipeline_id = cps.pipeline_id and cl.status_id = cps.status_id
  left join crm_etapa_resultado m on m.crm_connection_id = cc.id
    and m.pipeline_id = cps.pipeline_id and m.status_id = cps.status_id
  where cc.client_id = p_client_id and cc.active and cc.provider = 'flwchat'
    and public.is_app_admin()
  group by cc.id, cc.provider, cps.pipeline_id, cps.pipeline_name, cps.status_id, cps.status_name
  order by cps.pipeline_name, cps.status_name;
$function$;

create or replace function public.crm_definir_etapa_resultado(
  p_connection uuid, p_pipeline text, p_status text, p_outcome text)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_outcome not in ('open', 'won', 'lost') then raise exception 'resultado invalido'; end if;
  insert into crm_etapa_resultado (crm_connection_id, pipeline_id, status_id, outcome)
  values (p_connection, p_pipeline, p_status, p_outcome)
  on conflict (crm_connection_id, pipeline_id, status_id)
  do update set outcome = excluded.outcome, confirmado_por = auth.uid(), atualizado_em = now();
  update crm_leads set outcome = p_outcome
  where crm_connection_id = p_connection and pipeline_id = p_pipeline and status_id = p_status
    and outcome is distinct from p_outcome;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.crm_etapas_para_analise(uuid) from public, anon;
revoke all on function public.crm_definir_etapa_resultado(uuid, text, text, text) from public, anon;
grant execute on function public.crm_etapas_para_analise(uuid) to authenticated;
grant execute on function public.crm_definir_etapa_resultado(uuid, text, text, text) to authenticated;
