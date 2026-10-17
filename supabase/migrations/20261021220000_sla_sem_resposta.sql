-- Speed-to-lead (Liine C): pacientes que mandaram mensagem e estão sem resposta HUMANA há mais do que o prazo
-- (padrão 30 min), em todas as clínicas, para a equipe agir. Só admin. Nada é enviado a paciente: é um aviso interno.
-- Regras: últimas 72 h; robô não conta como resposta (tipo kommo_robo, e texto de clínica sem assinatura que se repete
-- igual em 10+ conversas do cliente em 14 dias, como menu e boas-vindas); fechamento curto do paciente ("ok",
-- "obrigada", só emoji) não conta como espera. A espera vai da 1ª mensagem do paciente depois da última resposta humana.
-- Reversão: drop function sla_sem_resposta.

create or replace function public.sla_sem_resposta(p_minutos integer default 30)
returns table (client_id uuid, cliente text, conversa_id uuid, pessoa text, canal text, provider text,
  desde timestamptz, espera_min integer, em_horario boolean)
language sql stable security definer set search_path to 'public' as $function$
  with auto as (
    select m.client_id, left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) chave
    from mensagens m
    where public.is_app_admin() and m.direcao = 'saida' and m.texto is not null and m.enviada_em > now() - interval '14 days'
      and m.texto !~ '^\s*\*[^*]{1,40}:\*'
    group by 1, 2 having count(distinct m.conversa_id) >= 10
  ),
  msgs as (
    select m.id, m.conversa_id, m.client_id, m.direcao, m.enviada_em, m.texto
    from mensagens m
    where public.is_app_admin() and m.enviada_em > now() - interval '72 hours' and m.direcao in ('entrada', 'saida')
      and coalesce(m.tipo, '') <> 'kommo_robo'
      and not (m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
        and exists (select 1 from auto a where a.client_id = m.client_id and a.chave = left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60)))
  ),
  ult as (select distinct on (conversa_id) * from msgs order by conversa_id, enviada_em desc, id desc),
  pend as (
    select u.*,
      (select min(e.enviada_em) from msgs e where e.conversa_id = u.conversa_id and e.direcao = 'entrada'
        and e.enviada_em > coalesce((select max(s.enviada_em) from msgs s where s.conversa_id = u.conversa_id and s.direcao = 'saida'), '-infinity')) as inicio
    from ult u
    where u.direcao = 'entrada'
      and not (length(coalesce(u.texto, '')) <= 40 and lower(coalesce(u.texto, '')) ~ '^\W*(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|grat[ao]|valeu|vlw|t[áa] bom|beleza|blz|certo|perfeito|combinado|show|tchau|amei|[^[:alnum:][:space:]]+)\W*$')
  )
  select p.client_id, cl.name, p.conversa_id, coalesce(pe.nome, 'Sem nome'), c.canal, c.provider, p.inicio,
    (extract(epoch from now() - p.inicio) / 60)::int,
    (extract(isodow from p.inicio at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from p.inicio at time zone 'America/Sao_Paulo') between 8 and 17)
      or (extract(isodow from p.inicio at time zone 'America/Sao_Paulo') = 6 and extract(hour from p.inicio at time zone 'America/Sao_Paulo') between 8 and 11)
  from pend p
  join conversas c on c.id = p.conversa_id
  join clients cl on cl.id = p.client_id
  left join pessoas pe on pe.id = c.pessoa_id
  where p.inicio is not null and now() - p.inicio > make_interval(mins => greatest(5, coalesce(p_minutos, 30)))
  order by p.inicio;
$function$;

revoke all on function public.sla_sem_resposta(integer) from public, anon;
grant execute on function public.sla_sem_resposta(integer) to authenticated;
