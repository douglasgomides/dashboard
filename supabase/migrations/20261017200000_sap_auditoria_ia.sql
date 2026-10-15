-- SAP · IA na auditoria semanal de conversas (06.09). O Hub já analisa cada conversa do WhatsApp com IA
-- (conversas_resumos: nota 0 a 10, falhas, situação). Esta função junta as análises da semana numa sugestão
-- para a auditoria: amostra das 10 conversas mais recentes (sem robô e sem quem não é paciente), nota média,
-- falhas mais frequentes, follow-up nas conversas em aberto e conversas recuperáveis. A equipe revisa e salva;
-- confirmação até a véspera continua vindo da agenda. Só admin (é leitura de conversa de paciente).
create or replace function public.sap_auditoria_ia(p_client_id uuid, p_semana date)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select c.id, c.ultima_msg_em, r.resumo, r.ate_msg_em
    from conversas c
    left join conversas_resumos r on r.conversa_id = c.id
    where public.is_app_admin()
      and c.client_id = p_client_id
      and c.ultima_msg_em >= p_semana::timestamptz and c.ultima_msg_em < (p_semana + 7)::timestamptz
  ),
  analisadas as (
    select * from base
    where resumo is not null and coalesce(resumo->>'etapa', '') not in ('so_robo', 'nao_e_paciente')
  ),
  amostra as (
    select * from analisadas order by ultima_msg_em desc limit 10
  ),
  falhas as (
    select f, count(*) n from analisadas, jsonb_array_elements_text(coalesce(resumo->'falhas', '[]'::jsonb)) f group by f order by n desc limit 5
  ),
  abertas as (
    select * from analisadas where resumo->>'situacao' in ('em_negociacao', 'aguardando_paciente', 'desistiu')
  )
  select jsonb_build_object(
    'conversas_semana', (select count(*) from base),
    'analisadas', (select count(*) from analisadas),
    'sem_analise', (select count(*) from base where resumo is null or ate_msg_em < ultima_msg_em),
    'amostra', (select count(*) from amostra),
    'nota_media_0a10', (select round(avg((resumo->'atendimento'->>'nota_0a10')::numeric), 1) from amostra where (resumo->'atendimento'->>'nota_0a10') ~ '^\d+(\.\d+)?$'),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('falha', f, 'n', n)) from falhas), '[]'::jsonb),
    'abertas', (select count(*) from abertas),
    'abertas_sem_follow_up', (select count(*) from abertas where resumo->'falhas' ? 'sem_follow_up'),
    'recuperaveis', (select count(*) from analisadas where (resumo->>'recuperavel')::boolean is true and resumo->>'situacao' <> 'agendou'),
    'pontos_a_melhorar', coalesce((select jsonb_agg(x) from (select x from amostra, jsonb_array_elements_text(coalesce(resumo->'atendimento'->'pontos_a_melhorar', '[]'::jsonb)) x limit 6) t), '[]'::jsonb)
  );
$function$;
revoke all on function public.sap_auditoria_ia(uuid, date) from public, anon;
grant execute on function public.sap_auditoria_ia(uuid, date) to authenticated;
