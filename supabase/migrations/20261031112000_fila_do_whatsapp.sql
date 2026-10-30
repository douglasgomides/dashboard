-- Atendimento no WhatsApp com número do próprio cliente (auditoria de 30/10/2026):
-- 1. "Em andamento agora" era wts_resumo.em_andamento: conversas IN_PROGRESS entre as que COMEÇARAM no período. Na
--    Dra. Marcella, 462 de 910 em outubro, das quais 353 abertas havia mais de 7 dias: fila nunca encerrada no WTS, não
--    gente sendo atendida. wts_fila_do_cliente separa as abertas agora (base inteira) em "últimos 7 dias" e "há mais
--    de 7 dias".
-- 2. A tela tinha texto fixo de outro cliente ("as duas médicas", "conta compartilhada", "216 conversas fechadas no
--    mesmo minuto") e mostrava para todos. A função devolve o maior lote de encerramento do período (conversas
--    encerradas no mesmo minuto), quantas saíram em lote de 5 ou mais e com quais clientes a mesma conta do WTS está
--    ligada. A tela só fala de lote e de conta compartilhada quando o dado do cliente mostra isso.
-- Reversão: drop function public.wts_fila_do_cliente(uuid, date, date);

create or replace function public.wts_fila_do_cliente(p_client_id uuid, p_start date, p_end date)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  abertas as (
    select started_at from wts_sessions
     where client_id = p_client_id and status = 'IN_PROGRESS' and (select pode from ok)
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
    'encerradas', coalesce((select sum(n) from encerradas), 0),
    'maior_lote', coalesce((select max(n) from encerradas), 0),
    'encerradas_em_lote', coalesce((select sum(n) from encerradas where n >= 5), 0),
    'conta_compartilhada_com', coalesce((select jsonb_agg(name order by name) from outros), '[]'::jsonb)
  ) end;
$function$;
revoke all on function public.wts_fila_do_cliente(uuid, date, date) from public, anon;
grant execute on function public.wts_fila_do_cliente(uuid, date, date) to authenticated, service_role;
