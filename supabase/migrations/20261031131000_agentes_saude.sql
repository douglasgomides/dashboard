-- Saúde das rotinas dos agentes para quem não é admin (auditoria do Plano de ação de 30/10/2026). A tela de agentes
-- mostrava "Rotina prevista: rotina diária" ao médico mesmo com o agente parado havia 10 dias ou com a última
-- rodada em falha, e "0 para revisar" parecia "tudo certo" quando era "não rodou". agente_execucoes continua só
-- para admin (guarda contexto e erro); esta função devolve só datas e estado da última rodada por fluxo, para
-- membros da clínica e admin.
-- Reversão: drop function public.agentes_saude(uuid);

create or replace function public.agentes_saude(p_client uuid)
returns table (fluxo text, ultima_ok_em timestamptz, ultima_em timestamptz, ultimo_estado text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select e.fluxo,
    max(e.atualizado_em) filter (where e.estado = 'concluida'),
    max(e.criado_em),
    (array_agg(e.estado order by e.criado_em desc))[1]
  from agente_execucoes e
  where e.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
    and e.criado_em > now() - interval '120 days'
  group by e.fluxo;
$$;

revoke all on function public.agentes_saude(uuid) from public, anon;
grant execute on function public.agentes_saude(uuid) to authenticated, service_role;
