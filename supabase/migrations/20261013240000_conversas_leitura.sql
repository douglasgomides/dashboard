-- Leitura de cada conversa do WhatsApp: tempo de resposta HUMANA, paciente sem resposta, quem
-- falou por último, quem atendeu e o lead ligado. Só leitura, regras fixas e verificáveis (sem IA).
--
-- Regras (calibradas em 13/10/2026 com as conversas reais):
-- - Mensagem automática: texto da clínica SEM assinatura de atendente ("*Giovana:* …") que se repete
--   igual (60 primeiros caracteres) em 10% das conversas do cliente (mínimo 5, teto 20) (menu, boas-vindas, lembrete).
--   Não conta como resposta: senão a 1ª resposta vira "4 segundos" (era o robô).
-- - "Vez do paciente": sequência de mensagens do paciente sem resposta humana no meio. A espera vai
--   da PRIMEIRA mensagem da sequência até a próxima mensagem humana da clínica.
-- - Horário comercial: seg–sex 8h–18h e sáb 8h–12h (Brasília). A mediana usa só as vezes que
--   começaram nesse horário, para não punir mensagem de madrugada. Tempo corrido (relógio).
-- - Sem resposta: a última mensagem (fora as automáticas) é do paciente. Se for só um fechamento curto
--   ("ok", "obrigada", só emoji), vale "paciente_encerrou", não "paciente".
-- - Atendente: o nome mais frequente na assinatura "*Nome:*" das mensagens humanas.
--
-- Também: resumos gerados por IA sob demanda (tabela conversas_resumos), escritos só pelo servidor.

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
      (m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
        and left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) in (select chave from auto)) as automatica
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

revoke all on function public.leitura_conversas(uuid, integer) from public, anon;
grant execute on function public.leitura_conversas(uuid, integer) to authenticated;

create table if not exists public.conversas_resumos (
  conversa_id uuid primary key references public.conversas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  resumo jsonb not null,
  modelo text,
  ate_msg_em timestamptz,       -- última mensagem considerada; mensagem nova depois disso = resumo desatualizado
  gerado_em timestamptz not null default now(),
  gerado_por uuid
);
alter table public.conversas_resumos enable row level security;
create policy "resumos: admin ou membro le" on public.conversas_resumos for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.conversas_resumos from anon;
