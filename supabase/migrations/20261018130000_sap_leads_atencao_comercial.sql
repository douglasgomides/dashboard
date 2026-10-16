-- Leads que precisam de atenção: só conversa comercial. Sai o que a IA marcou como "comercial": false e, nos resumos
-- antigos (antes do campo), o que é claramente administrativo (nota fiscal, boleto, recibo, reembolso...). Campos de
-- texto "null" ou vazios voltam como null (a tela nunca mostra "null").
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
      and coalesce(r.resumo->>'comercial', 'true') <> 'false'
      and concat_ws(' ', r.resumo->>'motivo', r.resumo->>'proximo_passo', r.resumo->>'interesse')
          !~* '(nota fiscal|\mnf\M|boleto|recibo|fatura|reembolso|segunda via|comprovante|fornecedor|documenta[çc][ãa]o)'
  ),
  classif as (
    select *,
      case
        when resumo->>'situacao' = 'aguardando_clinica' or resumo->'falhas' ? 'sem_resposta' then 'sem_resposta'
        when resumo->>'situacao' in ('em_negociacao', 'aguardando_paciente') and resumo->'falhas' ? 'sem_follow_up' and horas >= 48 then 'sem_follow_up'
        when (resumo->>'recuperavel')::boolean is true and horas >= 24 then 'recuperavel'
      end as motivo
    from base
  ),
  limpo as (
    select *, 
      nullif(nullif(btrim(resumo->>'interesse'), ''), 'null') as interesse,
      nullif(nullif(btrim(resumo->>'proximo_passo'), ''), 'null') as proximo_passo,
      nullif(nullif(btrim(resumo->>'atendente'), ''), 'null') as atendente
    from classif where motivo is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'conversa_id', id,
      'motivo', motivo,
      'horas_parado', round(horas::numeric, 0),
      'interesse', interesse,
      'proximo_passo', proximo_passo,
      'atendente', atendente
    ) order by case motivo when 'sem_resposta' then 0 when 'sem_follow_up' then 1 else 2 end, horas desc), '[]'::jsonb)
  from (select * from limpo
        order by case motivo when 'sem_resposta' then 0 when 'sem_follow_up' then 1 else 2 end, horas desc
        limit greatest(1, least(coalesce(p_limite, 30), 100))) t;
$function$;
revoke all on function public.sap_leads_atencao(uuid, integer) from public, anon;
grant execute on function public.sap_leads_atencao(uuid, integer) to authenticated;
