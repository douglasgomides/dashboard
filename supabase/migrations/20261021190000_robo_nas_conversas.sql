-- Resposta de robô marcada nas conversas, para a tela avisar "robô" e o tempo de resposta não contar robô como gente.
--
-- Kommo: a API não entrega texto da clínica nem diz quem mandou (created_by vem 0 também para atendente que responde
-- pelo celular). Regra por horário, calibrada em 17/10/2026 com as contas reais: mensagem enviada sem atendente
-- identificado até 10 s depois de uma mensagem do paciente, ou até 10 s depois de outra resposta de robô (sequência
-- de menu), é robô (tipo 'kommo_robo'). Enviada com atendente identificado (tipo 'kommo_atendente') nunca é robô.
-- WTS/Digisac/FlwChat: a regra que já existia (texto sem assinatura repetido em muitas conversas), agora também
-- por mensagem, em mensagens_automaticas, para a tela marcar cada balão.
-- Reversão: drop function kommo_marcar_robo, mensagens_automaticas; recriar leitura_conversas sem "or m.tipo = 'kommo_robo'";
-- update mensagens set tipo = 'kommo_sem_texto', autor = 'Clínica' where tipo = 'kommo_robo'.

create or replace function public.kommo_marcar_robo(p_client uuid, p_de timestamptz, p_ate timestamptz)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_total integer := 0; v_n integer; v_passo integer := 0;
begin
  if not (coalesce(auth.jwt()->>'role', '') = 'service_role' or public.is_app_admin()) then raise exception 'sem permissao'; end if;
  loop
    with seq as (
      select m.id, m.direcao, m.tipo, m.enviada_em,
        lag(m.direcao) over w as dir_ant, lag(m.tipo) over w as tipo_ant, lag(m.enviada_em) over w as em_ant
      from mensagens m join conversas c on c.id = m.conversa_id
      where c.client_id = p_client and c.provider = 'kommo'
        and m.enviada_em between p_de - interval '1 hour' and p_ate
      window w as (partition by m.conversa_id order by m.enviada_em, m.id)
    )
    update mensagens u set tipo = 'kommo_robo', autor = 'Robô'
    from seq
    where u.id = seq.id and seq.direcao = 'saida' and seq.tipo = 'kommo_sem_texto'
      and seq.enviada_em - seq.em_ant <= interval '10 seconds'
      and (seq.dir_ant = 'entrada' or seq.tipo_ant = 'kommo_robo');
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    v_passo := v_passo + 1;
    exit when v_n = 0 or v_passo >= 6;
  end loop;
  return v_total;
end $function$;
revoke all on function public.kommo_marcar_robo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.kommo_marcar_robo(uuid, timestamptz, timestamptz) to service_role;

-- Ids das mensagens automáticas (robô/menu) de uma conversa, mesma regra de leitura_conversas.
create or replace function public.mensagens_automaticas(p_conversa uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $function$
  with c as (select client_id from conversas where id = p_conversa and (public.is_app_admin() or public.is_client_member(client_id))),
  auto as (
    select left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) as chave
    from mensagens m, c
    where m.client_id = c.client_id and m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
    group by 1 having count(distinct m.conversa_id) >= least(20, greatest(5, (select count(*) from conversas x, c where x.client_id = c.client_id) / 10))
  )
  select m.id from mensagens m, c
  where m.conversa_id = p_conversa and m.direcao = 'saida'
    and (m.tipo = 'kommo_robo'
      or (m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*' and left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) in (select chave from auto)));
$function$;
revoke all on function public.mensagens_automaticas(uuid) from public, anon;
grant execute on function public.mensagens_automaticas(uuid) to authenticated;

-- Tempo de resposta: robô do Kommo conta como mensagem automática (não é resposta de gente).
create or replace function public.leitura_conversas(p_client uuid, p_limite integer default 200)
returns table (conversa_id uuid, msgs_paciente bigint, msgs_clinica bigint, msgs_automaticas bigint,
  primeira_resposta_seg integer, mediana_resposta_comercial_seg integer, maior_espera_seg integer,
  esperas_longas integer, vezes_paciente integer, ultima_de text, ultima_msg_em timestamptz,
  aguardando_seg integer, atendente text, lead_etapa text, lead_resultado text)
language sql stable security definer set search_path to 'public'
as $function$
  with conv as (
    select c.id, c.lead_id from conversas c
    where c.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
    order by c.ultima_msg_em desc nulls last
    limit least(coalesce(p_limite, 200), 500)
  ),
  auto as (
    select left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) as chave
    from mensagens m
    where m.client_id = p_client and m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
    group by 1 having count(distinct m.conversa_id) >= least(20, greatest(5, (select count(*) from conversas where client_id = p_client) / 10))
  ),
  bruto as (
    select m.id, m.conversa_id, m.direcao, m.enviada_em, m.texto,
      ((m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
        and left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) in (select chave from auto))
      or (m.direcao = 'saida' and m.tipo = 'kommo_robo')) as automatica
    from mensagens m join conv on conv.id = m.conversa_id
    where m.direcao in ('entrada', 'saida')
  ),
  m as (
    select b.*, lag(b.direcao) over (partition by b.conversa_id order by b.enviada_em, b.id) as dir_ant
    from bruto b where not b.automatica
  ),
  vezes as (
    select v.conversa_id, v.enviada_em as inicio,
      (select min(s.enviada_em) from m s where s.conversa_id = v.conversa_id and s.direcao = 'saida' and s.enviada_em > v.enviada_em) as resposta,
      row_number() over (partition by v.conversa_id order by v.enviada_em) as n,
      (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 17)
      or (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') = 6 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 11) as comercial
    from m v where v.direcao = 'entrada' and v.dir_ant is distinct from 'entrada'
  ),
  esperas as (select conversa_id, n, comercial, extract(epoch from resposta - inicio)::int as seg from vezes where resposta is not null),
  ult as (select distinct on (conversa_id) conversa_id, direcao, enviada_em, texto from m order by conversa_id, enviada_em desc, id desc),
  atend as (
    select distinct on (conversa_id) conversa_id, substring(texto from '^\s*\*([^*]{1,40}):\*') as nome
    from m where direcao = 'saida' and texto ~ '^\s*\*[^*]{1,40}:\*'
    group by conversa_id, 2 order by conversa_id, count(*) desc
  )
  select conv.id,
    (select count(*) from bruto b where b.conversa_id = conv.id and b.direcao = 'entrada'),
    (select count(*) from bruto b where b.conversa_id = conv.id and b.direcao = 'saida' and not b.automatica),
    (select count(*) from bruto b where b.conversa_id = conv.id and b.automatica),
    (select e.seg from esperas e where e.conversa_id = conv.id and e.n = 1),
    (select percentile_cont(0.5) within group (order by e.seg)::int from esperas e where e.conversa_id = conv.id and e.comercial),
    (select max(e.seg) from esperas e where e.conversa_id = conv.id),
    (select count(*)::int from esperas e where e.conversa_id = conv.id and e.seg > 3600),
    (select count(*)::int from vezes v where v.conversa_id = conv.id),
    case
      when ult.direcao = 'saida' then 'clinica'
      when ult.direcao = 'entrada' and length(coalesce(ult.texto, '')) <= 40
        and lower(coalesce(ult.texto, '')) ~ '^\W*(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|grat[ao]|gratid[ãa]o|valeu|vlw|t[áa] bom|t[áa] [oó]timo|beleza|blz|certo|perfeito|combinado|show|maravilha|de nada|at[ée] (logo|mais|amanh[ãa])|tchau|bom dia|boa tarde|boa noite|amei|[^[:alnum:][:space:]]+)\W*$' then 'paciente_encerrou'
      when ult.direcao = 'entrada' then 'paciente'
    end,
    ult.enviada_em,
    case when ult.direcao = 'entrada' then extract(epoch from now() - ult.enviada_em)::int end,
    (select a.nome from atend a where a.conversa_id = conv.id),
    (select cps.status_name from crm_leads cl left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id where cl.id = conv.lead_id limit 1),
    (select cl.outcome from crm_leads cl where cl.id = conv.lead_id)
  from conv left join ult on ult.conversa_id = conv.id;
$function$;
