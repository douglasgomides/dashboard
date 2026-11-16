-- [agendamento-registrado] Para a Carteira dizer de onde vem o "Agendaram" de cada clínica (debug numeros-nao-batem-fonte,
-- decisão G2 do João de 16/11/2026: quando o CRM não registra a etapa, a tela diz isso e o número da conversa aparece com o
-- nome da fonte).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116160000_leitura_por_clinica_pela_config.sql
-- (não depende dela: só lê). Agentes não rodam este arquivo. Reversão: supabase/operacoes/20261116-reverter-agendamento-registrado.sql.
--
-- O que faz: uma função de leitura, nova, que nenhuma outra função chama. Para cada clínica ativa com CRM ligado, diz se
-- alguma etapa de agendamento do CRM (o nome sem exame, aguardando, reagendamento etc., a mesma regra de 20261116150000;
-- ou o KPI consulta_agendada; ou o papel do perfil) foi usada nos 90 dias até agora: um card entrou nela (evento) ou foi
-- criado nela. Quando não foi, o "Agendaram" do histórico diário dos últimos 60 dias (os dois lados da Carteira) é só o
-- que a leitura da IA achou nas conversas, e a Carteira passa a dizer "pela conversa". Só admin lê.
--
-- Velocidade: a mesma conta da conferência G2 de 20261116150000 (cards e eventos de 90 dias de cada clínica, pelo índice
-- client_id), uma vez para todas as clínicas; a Carteira guarda a resposta por 10 minutos. Medida de pior caso: Q1b-3 de
-- consultas-ciclo4b.sql do debug.

create or replace function public.crm_agendamento_registrado()
returns table(client_id uuid, registra boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $function$
  select k.id, exists (
    select 1 from crm_pipeline_statuses s
      join crm_connections c on c.id = s.crm_connection_id and c.active
      left join public.crm_perfil_etapas(k.id) x
        on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
     where c.client_id = k.id
       and coalesce(public.crm_papel_conta(x.papel, 'consulta_agendada'),
             exists (select 1 from crm_etapa_kpi q where q.crm_connection_id = s.crm_connection_id and q.pipeline_id = s.pipeline_id
                       and q.status_id = s.status_id and q.kpi = 'consulta_agendada')
             or (s.status_name ~* '(agendad|agendament)'
                 and s.status_name !~* '(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio|exame)'))
       and (exists (select 1 from crm_lead_eventos e
                     where e.client_id = k.id and e.crm_connection_id = s.crm_connection_id and e.pipeline_para = s.pipeline_id
                       and e.status_para = s.status_id and e.tipo in ('entrou', 'mudou_etapa')
                       and e.ocorreu_em >= now() - interval '90 days' and e.ocorreu_em < now())
            or exists (select 1 from crm_leads l
                        where l.client_id = k.id
                          and l.crm_connection_id = s.crm_connection_id and l.pipeline_id = s.pipeline_id and l.status_id = s.status_id
                          and l.removido_na_origem is null and l.occurred_at >= now() - interval '90 days' and l.occurred_at < now())))
    from public.clients k
   where public.is_app_admin() and k.active
     and exists (select 1 from crm_connections c where c.client_id = k.id and c.active);
$function$;

revoke all on function public.crm_agendamento_registrado() from public, anon;
grant execute on function public.crm_agendamento_registrado() to authenticated, service_role;
