-- APIs resilientes, LGPD e acesso (auditoria independente de 01/11/2026). Não apaga tabela, coluna nem função.
--
-- 1. Membro de cliente INATIVO continuava com acesso: is_client_member só olhava client_members. Agora exige
--    clients.active. O vínculo em client_members fica guardado (reativar o cliente devolve o acesso). Admin não muda.
--    pode_editar_acoes segue a mesma regra.
-- 2. Sessões PENDING (paciente escreveu, ninguém da equipe assumiu) não entravam em "abertas" nem em "em andamento":
--    Dr. Sergio Maia via 1 conversa aberta nos últimos 7 dias com 107 aguardando sem atendente. Passam a contar como
--    abertas em wts_fila_do_cliente (com o número separado "aguardando_sem_atendente") e em wts_resumo.em_andamento.
-- 3. sync_status.token_expira_em: data de vencimento do token quando o próprio token informa (JWT do Kommo). O aviso
--    "token vence em N dias" vai em sync_status.motivo, gravado pelo sync.
-- 4. Digisac: avisos automáticos do atendimento ("ticket"), reações e registros de ligação estavam gravados como
--    mensagem do paciente. Passam a "sistema". E a 1ª resposta deixa de vir de metrics.waitingTime (bateu com as
--    mensagens em 30% dos casos): os valores antigos são limpos e o sync recalcula pelas mensagens, só quando a API
--    identifica quem da clínica enviou (robô de boas-vindas não conta como resposta).
--
-- Reversão: recriar is_client_member/pode_editar_acoes/wts_fila_do_cliente/wts_resumo com as versões de
-- 20260822000000, 20261013210000, 20261031112000 e 20261013200000. A coluna token_expira_em pode ficar.

create or replace function public.is_client_member(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.client_members m
      join public.clients c on c.id = m.client_id
     where m.client_id = p_client_id and m.user_id = auth.uid() and c.active
  );
$function$;

create or replace function public.pode_editar_acoes(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.is_app_admin() or exists (
    select 1 from public.client_members m
      join public.clients c on c.id = m.client_id
     where m.client_id = p_client_id and m.user_id = auth.uid() and m.role in ('owner', 'strategist') and c.active
  );
$function$;

create or replace function public.wts_fila_do_cliente(p_client_id uuid, p_start date, p_end date)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  abertas as (
    select started_at, status, user_id from wts_sessions
     where client_id = p_client_id and status in ('IN_PROGRESS', 'PENDING') and ended_at is null and (select pode from ok)
  ),
  encerradas as (
    select date_trunc('minute', ended_at) as minuto, count(*) as n
      from wts_sessions
     where client_id = p_client_id and ended_at is not null and (select pode from ok)
       and ended_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
       and ended_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
     group by 1
  ),
  outros as (
    select o.name
      from clients c
      join clients o on o.wts_company_id = c.wts_company_id and o.id <> c.id and o.active
     where c.id = p_client_id and c.wts_company_id is not null and (select pode from ok)
  )
  select case when not (select pode from ok) then null else jsonb_build_object(
    'abertas_7d', (select count(*) from abertas where started_at >= now() - interval '7 days'),
    'abertas_antigas', (select count(*) from abertas where started_at < now() - interval '7 days'),
    'aguardando_sem_atendente', (select count(*) from abertas where status = 'PENDING' and user_id is null),
    'encerradas', coalesce((select sum(n) from encerradas), 0),
    'maior_lote', coalesce((select max(n) from encerradas), 0),
    'encerradas_em_lote', coalesce((select sum(n) from encerradas where n >= 5), 0),
    'conta_compartilhada_com', coalesce((select jsonb_agg(name order by name) from outros), '[]'::jsonb)
  ) end;
$function$;
revoke all on function public.wts_fila_do_cliente(uuid, date, date) from public, anon;
grant execute on function public.wts_fila_do_cliente(uuid, date, date) to authenticated, service_role;

create or replace function public.wts_resumo(p_client_id uuid, p_start date, p_end date)
returns table(atendimentos bigint, concluidos bigint, em_andamento bigint, espera_mediana_seg numeric, espera_cobertura bigint, atendimento_mediano_seg numeric, atendimento_cobertura bigint, sem_roteamento bigint, contatos_distintos bigint)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with base as (
    select s.*, d.name as departamento
    from wts_sessions s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
      and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select count(*),
         count(*) filter (where status = 'COMPLETED'),
         -- Aguardando sem atendente (PENDING) é conversa aberta: o paciente escreveu e espera.
         count(*) filter (where status in ('IN_PROGRESS', 'PENDING') and ended_at is null),
         round((percentile_cont(0.5) within group (order by wait_seconds))::numeric, 0),
         count(wait_seconds),
         round((percentile_cont(0.5) within group (order by service_seconds))::numeric, 0),
         count(service_seconds),
         count(*) filter (where department_id is null or departamento = 'Geral'),
         count(distinct contact_id)
  from base;
$function$;

alter table public.sync_status add column if not exists token_expira_em timestamptz;
comment on column public.sync_status.token_expira_em is
  'Vencimento do token da fonte, quando o token informa (JWT do Kommo). O aviso legível fica em motivo.';

-- Digisac: tipos que não são fala de ninguém. Só conversas do provedor digisac.
update public.mensagens m
   set direcao = 'sistema', autor = 'Sistema'
  from public.conversas c
 where c.id = m.conversa_id and c.provider = 'digisac'
   and m.tipo in ('ticket', 'reaction', 'call_log') and m.direcao <> 'sistema';

-- Digisac: 1ª resposta com definição errada (waitingTime do ticket). Limpa só nos clientes cujo atendimento vem do
-- Digisac (conexão digisac e sem conta WTS); a WTS tem timeWait próprio e não é tocada.
update public.wts_sessions s
   set wait_seconds = null, first_response_at = null
 where (s.wait_seconds is not null or s.first_response_at is not null)
   and exists (select 1 from public.crm_connections k where k.client_id = s.client_id and k.provider = 'digisac')
   and exists (select 1 from public.clients c where c.id = s.client_id and c.wts_company_id is null);
