-- Prova de resultado (src/lib/prova-resultado.ts): por semana, o que mudou no atendimento e no custo de cada clínica.
-- Conversas novas, quantas eram comerciais, quantas agendaram (leitura da IA), tempo mediano da primeira resposta da
-- clínica, % respondidas em até 5 minutos e investimento em anúncio na semana (para custo por agendamento).
-- Tudo calculado do dado que já entra sozinho; nenhum campo manual. Membro ou admin lê.
-- Reversão: drop function prova_resultado;
create or replace function public.prova_resultado(p_client_id uuid, p_semanas integer default 12)
returns table (semana date, conversas bigint, comerciais bigint, agendou bigint, resposta_mediana_s numeric, respondidas bigint, resp_5min bigint, investimento numeric)
language sql stable security definer set search_path to 'public' as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  ini as (select (date_trunc('week', now() at time zone 'America/Sao_Paulo') - make_interval(weeks => greatest(1, least(p_semanas, 52)) - 1))::date as d),
  conv as (
    select c.id, date_trunc('week', c.iniciada_em at time zone 'America/Sao_Paulo')::date as semana
    from conversas c, ok, ini
    where ok.pode and c.client_id = p_client_id and c.iniciada_em >= ini.d
  ),
  prim as (
    select conv.id, conv.semana,
      (select min(m.enviada_em) from mensagens m where m.conversa_id = conv.id and m.direcao = 'entrada') as e1
    from conv
  ),
  resp as (
    select p.id, p.semana, p.e1,
      (select min(m.enviada_em) from mensagens m where m.conversa_id = p.id and m.direcao = 'saida' and m.enviada_em > p.e1
         and coalesce(m.tipo, '') <> 'kommo_robo') as s1
    from prim p where p.e1 is not null
  ),
  leitura as (
    select r.conversa_id,
      bool_or(r.resumo->>'comercial' = 'true') as comercial,
      bool_or(r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou') as agendou
    from conversas_resumos r join conv on conv.id = r.conversa_id group by r.conversa_id
  ),
  sem as (
    select conv.semana, count(*) as conversas,
      count(*) filter (where l.comercial) as comerciais,
      count(*) filter (where l.agendou) as agendou
    from conv left join leitura l on l.conversa_id = conv.id group by conv.semana
  ),
  tempos as (
    select semana,
      percentile_cont(0.5) within group (order by extract(epoch from (s1 - e1))) filter (where s1 is not null) as mediana,
      count(*) filter (where s1 is not null) as respondidas,
      count(*) filter (where s1 is not null and s1 - e1 <= interval '5 minutes') as em5
    from resp group by semana
  ),
  gasto as (
    select date_trunc('week', d.date)::date as semana, sum(d.spend) as g
    from meta_ads_daily d, ok, ini where ok.pode and d.client_id = p_client_id and d.date >= ini.d group by 1
  )
  select s.semana, s.conversas, s.comerciais, s.agendou, round(t.mediana::numeric, 0), coalesce(t.respondidas, 0), coalesce(t.em5, 0), round(coalesce(g.g, 0)::numeric, 2)
  from sem s left join tempos t on t.semana = s.semana left join gasto g on g.semana = s.semana
  order by s.semana;
$function$;
revoke all on function public.prova_resultado(uuid, integer) from public, anon;
grant execute on function public.prova_resultado(uuid, integer) to authenticated;
