-- Origem lida da PRIMEIRA mensagem do paciente (mensagem pronta de link) e da etapa de paciente da casa.
-- Diagnóstico de 30/10/2026 (Lana, Samira, Juliana Paola, Mariela), aprovado itens 1a e 1c:
--  1a. Muitos leads sem origem começam com uma mensagem pronta de link, sempre com o mesmo texto:
--      "Olá, vim do Instagram e quero agendar..." (Mariela), "Estava no Instagram da Dra Lana...", "vim do Google...",
--      "vim do site...", "*Google Ads* Sua resposta foi registrada...". O texto vem do link (bio, site, anúncio do
--      Google), então diz a origem. Só textos fixos contam; texto livre do paciente não é interpretado.
--      Juliana Paola +121, Mariela +36, Lana +25 (leads abertos, 90 dias).
--  1c. Card na etapa "Paciente Recorrente" ou "Reativação" é paciente da casa (Samira: 3).
-- O resultado vai para crm_leads.source com origem_como = 'mensagem' ou 'etapa'. Nada é escrito no CRM do cliente.
-- O gatilho de origem passa a preservar esses dois quando o card volta do CRM sem origem; se a equipe preencher o
-- campo no CRM, o campo vale (origem_como = 'crm').
--
-- Reversão: update crm_leads set source = null where origem_como in ('mensagem','etapa');
--   recriar crm_leads_origem_gatilho como em 20261030140000; drop function crm_aplicar_origem_externa(uuid),
--   crm_origem_da_mensagem(text).

create or replace function public.crm_origem_da_mensagem(p text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when t ~* '^\*?\s*google ads\s*\*?' then 'Anúncio'
    when t ~* '^(ol[aá]|oi|bom dia|boa tarde|boa noite)?[,!.\s]*(tudo bem\??)?[,!.\s]*(vim|estava|cheguei) (do|no|pelo|pela|da) instagram' then 'Instagram'
    when t ~* '^(ol[aá]|oi|bom dia|boa tarde|boa noite)?[,!.\s]*(tudo bem\??)?[,!.\s]*vim do google' then 'Google'
    when t ~* '^(ol[aá]|oi|bom dia|boa tarde|boa noite)?[,!.\s]*(tudo bem\??)?[,!.\s]*vim do site' then 'Site'
  end
  from (select btrim(coalesce(p, '')) as t) x;
$$;
revoke all on function public.crm_origem_da_mensagem(text) from public, anon;
grant execute on function public.crm_origem_da_mensagem(text) to authenticated, service_role;

create or replace function public.crm_leads_origem_gatilho()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  if nullif(btrim(new.source), '') is null then
    -- Origem lida da mensagem ou da etapa (crm_aplicar_origem_externa) continua quando o CRM manda o campo vazio.
    if tg_op = 'UPDATE' and old.origem_como in ('mensagem', 'etapa') then
      new.source := old.source;
      new.origem_como := old.origem_como;
      return new;
    end if;
    new.source := null;
    new.origem_como := null;
    if new.canal_id is not null then
      select co.origem into new.source from crm_canais_origem co
      where co.crm_connection_id = new.crm_connection_id and co.canal_id = new.canal_id and co.conclusivo;
      if new.source is not null then new.origem_como := 'canal'; end if;
    end if;
    if new.source is null then
      r := public.crm_origem_inferida(new.provider, new.raw_payload);
      new.source := r.origem;
      new.origem_como := case when r.origem is null then null else r.como end;
    end if;
  elsif tg_op = 'INSERT' or new.source is distinct from old.source then
    -- crm_aplicar_origem_externa grava já com origem_como 'mensagem'/'etapa': não vira "do CRM".
    if not (tg_op = 'UPDATE' and new.origem_como in ('mensagem', 'etapa') and new.origem_como is distinct from old.origem_como) then
      new.origem_como := 'crm';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_leads_origem_gatilho() from public, anon, authenticated;

-- Aplica as duas leituras aos leads sem origem (de um cliente, ou de todos com null). Devolve quantos mudaram.
-- Conversa do lead: pelo lead, pela pessoa ou, no FlwChat, pela sessão do atendimento (raw_payload.sessionId).
create or replace function public.crm_aplicar_origem_externa(p_client_id uuid default null)
returns integer
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  with sem as (
    select l.id, l.client_id, l.pessoa_id, l.provider, l.crm_connection_id, l.pipeline_id, l.status_id,
           l.raw_payload->>'sessionId' as sessao
    from crm_leads l
    where l.source is null and l.removido_na_origem is null
      and (p_client_id is null or l.client_id = p_client_id)
  ),
  primeira as (
    select s.id,
      (select m.texto from conversas v join mensagens m on m.conversa_id = v.id and m.direcao = 'entrada'
        where v.lead_id = s.id
           or (s.pessoa_id is not null and v.pessoa_id = s.pessoa_id)
           or (s.provider = 'flwchat' and s.sessao is not null and v.externo_id = s.sessao)
        order by m.enviada_em limit 1) as texto
    from sem s
  ),
  achado as (
    select s.id,
      coalesce(
        case when public.crm_origem_da_mensagem(p.texto) is not null then public.crm_origem_da_mensagem(p.texto) end,
        case when st.status_name ~* '(paciente recorrente|reativa[cç])' then 'Paciente antigo' end
      ) as origem,
      case when public.crm_origem_da_mensagem(p.texto) is not null then 'mensagem' else 'etapa' end as como
    from sem s
    left join primeira p on p.id = s.id
    left join crm_pipeline_statuses st on st.crm_connection_id = s.crm_connection_id and st.pipeline_id = s.pipeline_id and st.status_id = s.status_id
  ),
  feito as (
    update crm_leads l set source = a.origem, origem_como = a.como
      from achado a where a.id = l.id and a.origem is not null and l.source is null
    returning 1
  )
  select count(*)::int from feito;
$$;
revoke all on function public.crm_aplicar_origem_externa(uuid) from public, anon, authenticated;
grant execute on function public.crm_aplicar_origem_externa(uuid) to service_role;
