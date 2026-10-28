-- Números por funil no período, e o canal na lista de conversas.
-- 1) crm_funis_periodo: cada clínica marca "ganho" num lugar diferente de cada funil (Dra. Marcelly: em Consultas o
--    ganho é a consulta agendada; em Procedimentos, o procedimento agendado; no Social Seller, quem virou paciente).
--    Somar tudo como "venda" engana. Por funil: quantos entraram no período, quantos estão em etapa de consulta
--    agendada, ganhos, perdidos, valor, e a etapa em que o ganho costuma ficar. O grupo do funil vem de
--    crm_connections.config.grupos_funil (Clint: "Resgate", "Skin Place - Gyn", "Campanhas").
--    Período = data de entrada do lead. Só leitura; admin ou membro da clínica.
-- 2) listar_conversas_canal: igual a listar_conversas, com o canal (whatsapp, instagram, facebook…), para a tela
--    separar Instagram de WhatsApp. listar_conversas fica como está.
-- Reversão: drop function public.crm_funis_periodo(uuid, date, date); drop function public.listar_conversas_canal(uuid, integer, integer);

create or replace function public.crm_funis_periodo(p_client_id uuid, p_from date, p_to date)
returns table(
  grupo text, funil text, entraram bigint, consultas_agendadas bigint, ganhos bigint, ganhos_sem_valor bigint,
  perdidos bigint, valor_ganho numeric, etapa_do_ganho text
)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with l as (
    select cl.crm_connection_id, cl.pipeline_id, cl.status_id, cl.outcome, cl.price,
      coalesce(s.pipeline_name, cl.pipeline_id) as funil, s.status_name,
      nullif(btrim(cc.config->'grupos_funil'->>cl.pipeline_id), '') as grupo,
      (exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = cl.crm_connection_id and k.pipeline_id = cl.pipeline_id
                 and k.status_id = cl.status_id and k.kpi = 'consulta_agendada')
        or coalesce(s.status_name, '') ilike '%consulta agendada%') as em_consulta
    from crm_leads cl
    join crm_connections cc on cc.id = cl.crm_connection_id
    left join crm_pipeline_statuses s on s.crm_connection_id = cl.crm_connection_id and s.pipeline_id = cl.pipeline_id and s.status_id = cl.status_id
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  )
  select grupo, funil, count(*), count(*) filter (where em_consulta),
    count(*) filter (where outcome = 'won'), count(*) filter (where outcome = 'won' and coalesce(price, 0) = 0),
    count(*) filter (where outcome = 'lost'), coalesce(sum(price) filter (where outcome = 'won'), 0),
    (select l2.status_name from l l2 where l2.funil = l.funil and l2.outcome = 'won' and l2.status_name is not null
      group by l2.status_name order by count(*) desc, l2.status_name limit 1)
  from l
  group by grupo, funil
  order by count(*) filter (where outcome = 'won') desc, count(*) desc;
$function$;
revoke all on function public.crm_funis_periodo(uuid, date, date) from public, anon;
grant execute on function public.crm_funis_periodo(uuid, date, date) to authenticated, service_role;

create or replace function public.listar_conversas_canal(p_client uuid, p_limite integer default 50, p_offset integer default 0)
returns table(id uuid, pessoa_nome text, telefone_final text, provider text, canal text, ultima_msg_em timestamptz,
  ultima_msg_texto text, total_msgs bigint, lead_id uuid, codigo_ref text)
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then return; end if;
  insert into public.acessos_conversas(user_id, client_id, acao) values (auth.uid(), p_client, 'listar');
  return query select c.id, coalesce(p.nome, 'Sem nome'),
    case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
    c.provider,
    case when c.canal ilike '%instagram%' then 'instagram' when c.canal ilike '%facebook%' or c.canal ilike '%messenger%' then 'facebook' else 'whatsapp' end,
    c.ultima_msg_em,
    (select m.texto from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client order by m.enviada_em desc, m.id desc limit 1),
    (select count(*) from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client),
    c.lead_id, c.codigo_ref
  from public.conversas c left join public.pessoas p on p.id = c.pessoa_id and p.client_id = p_client
  where c.client_id = p_client
  order by c.ultima_msg_em desc nulls last, c.id
  limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
revoke all on function public.listar_conversas_canal(uuid, integer, integer) from public, anon;
grant execute on function public.listar_conversas_canal(uuid, integer, integer) to authenticated, service_role;
