-- SAP · Leads que precisam de atenção e qualidade de atendimento por atendente, a partir das análises de IA que o
-- Hub já faz em cada conversa do WhatsApp (conversas_resumos). Não envia nada a ninguém: só lista para a equipe.
-- Sem nome nem telefone do paciente: devolve o id da conversa (para abrir no Hub), o interesse e o próximo passo.
-- Só admin (é leitura de conversa de paciente).

-- Leads em atenção (últimos 30 dias de conversa):
--   sem_resposta: a conversa espera a clínica (situação "aguardando_clinica" ou falha "sem_resposta");
--   sem_follow_up: em negociação ou aguardando o paciente, com falha "sem_follow_up", parada há 2 dias ou mais;
--   recuperavel: a IA marcou como recuperável e não agendou, parada há 1 dia ou mais.
create or replace function public.sap_leads_atencao(p_client_id uuid, p_limite integer default 30)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select c.id, c.ultima_msg_em, r.resumo,
      extract(epoch from (now() - c.ultima_msg_em)) / 3600.0 as horas
    from conversas c
    join conversas_resumos r on r.conversa_id = c.id
    where public.is_app_admin()
      and c.client_id = p_client_id
      and c.ultima_msg_em >= now() - interval '30 days'
      and coalesce(r.resumo->>'etapa', '') not in ('so_robo', 'nao_e_paciente')
      and coalesce(r.resumo->>'situacao', '') not in ('agendou')
  ),
  classif as (
    select *,
      case
        when resumo->>'situacao' = 'aguardando_clinica' or resumo->'falhas' ? 'sem_resposta' then 'sem_resposta'
        when resumo->>'situacao' in ('em_negociacao', 'aguardando_paciente') and resumo->'falhas' ? 'sem_follow_up' and horas >= 48 then 'sem_follow_up'
        when (resumo->>'recuperavel')::boolean is true and horas >= 24 then 'recuperavel'
      end as motivo
    from base
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'conversa_id', id,
      'motivo', motivo,
      'horas_parado', round(horas::numeric, 0),
      'interesse', resumo->>'interesse',
      'proximo_passo', resumo->>'proximo_passo',
      'atendente', resumo->>'atendente'
    ) order by case motivo when 'sem_resposta' then 0 when 'sem_follow_up' then 1 else 2 end, horas desc), '[]'::jsonb)
  from (select * from classif where motivo is not null
        order by case motivo when 'sem_resposta' then 0 when 'sem_follow_up' then 1 else 2 end, horas desc
        limit greatest(1, least(coalesce(p_limite, 30), 100))) t;
$function$;

-- Atendimento por atendente (pela assinatura nas mensagens, que a IA lê): conversas, nota média 0 a 10,
-- falhas mais comuns e quantas ficaram recuperáveis sem agendar. Conversas sem atendente identificado ficam
-- como "Sem assinatura" (robô ou atendente que não assina).
create or replace function public.sap_atendimento_por_atendente(p_client_id uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select coalesce(nullif(trim(r.resumo->>'atendente'), ''), 'Sem assinatura') as atendente, r.resumo
    from conversas c
    join conversas_resumos r on r.conversa_id = c.id
    where public.is_app_admin()
      and c.client_id = p_client_id
      and c.ultima_msg_em >= p_de::timestamptz and c.ultima_msg_em < (p_ate + 1)::timestamptz
      and coalesce(r.resumo->>'etapa', '') not in ('so_robo', 'nao_e_paciente')
  ),
  falhas as (
    select atendente, f, count(*) n,
      row_number() over (partition by atendente order by count(*) desc, f) rk
    from base, jsonb_array_elements_text(coalesce(resumo->'falhas', '[]'::jsonb)) f
    group by atendente, f
  )
  select coalesce(jsonb_agg(x order by (x->>'conversas')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'atendente', b.atendente,
      'conversas', count(*),
      'nota_media', round(avg((b.resumo->'atendimento'->>'nota_0a10')::numeric) filter (where (b.resumo->'atendimento'->>'nota_0a10') ~ '^\d+(\.\d+)?$'), 1),
      'agendou', count(*) filter (where b.resumo->>'situacao' = 'agendou'),
      'recuperaveis', count(*) filter (where (b.resumo->>'recuperavel')::boolean is true and b.resumo->>'situacao' <> 'agendou'),
      'falhas', coalesce((select jsonb_agg(jsonb_build_object('falha', f.f, 'n', f.n) order by f.rk) from falhas f where f.atendente = b.atendente and f.rk <= 3), '[]'::jsonb)
    ) as x
    from base b group by b.atendente
  ) t;
$function$;

revoke all on function public.sap_leads_atencao(uuid, integer) from public, anon;
revoke all on function public.sap_atendimento_por_atendente(uuid, date, date) from public, anon;
grant execute on function public.sap_leads_atencao(uuid, integer) to authenticated;
grant execute on function public.sap_atendimento_por_atendente(uuid, date, date) to authenticated;
