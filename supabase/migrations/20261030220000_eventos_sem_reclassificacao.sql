-- Eventos de venda certos (auditoria de 30/10/2026):
-- 1. Reclassificar uma etapa como venda (crm_definir_etapa_resultado) gravava "ganhou" para todos os cards dela, com
--    a data da reclassificação. Dr. Sergio: 1.735 "vendas" em 15/10 às 16:26, no mesmo instante da mudança. A
--    reclassificação muda o resultado dos cards, mas não é um evento de venda: o gatilho deixa de gravá-la.
-- 2. Card que já entra no Nexo como ganho não gerava "ganhou" (só "entrou"): Sergio 70, Marcelly 9, Doctor Creator 9.
--    Agora gera, com a data do card. Para o SAP não mandar compra antiga à Meta, "ganhou" com mais de 7 dias não
--    entra na fila de conversões.
-- Os 1.735 eventos da onda do Sergio foram apagados em produção com cópia em auditoria_eventos_removidos.
-- Reversão: recriar crm_registrar_evento, crm_definir_etapa_resultado e sap_enfileirar_conversao como antes desta
--   migração; insert into crm_lead_eventos select (e).* from auditoria_eventos_removidos.

create table if not exists public.auditoria_eventos_removidos (
  removido_em timestamptz not null default now(),
  motivo text not null,
  e public.crm_lead_eventos not null
);
alter table public.auditoria_eventos_removidos enable row level security;
revoke all on public.auditoria_eventos_removidos from anon, authenticated;

create or replace function public.crm_registrar_evento()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  o_out text := case when tg_op = 'UPDATE' then coalesce(old.outcome, 'open') else null end;
  n_out text := coalesce(new.outcome, 'open');
begin
  begin
    if tg_op = 'INSERT' then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'entrou', new.pipeline_id, new.status_id, coalesce(new.occurred_at, now()));
      -- Card que já chega ganho (ou perdido) também tem o evento do resultado.
      if n_out in ('won', 'lost') then
        insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
        values (new.client_id, new.crm_connection_id, new.external_lead_id, case n_out when 'won' then 'ganhou' else 'perdeu' end, new.pipeline_id, new.status_id, coalesce(new.occurred_at, now()));
      end if;
      return new;
    end if;
    if new.client_id is null then return new; end if;
    if old.status_id is distinct from new.status_id or old.pipeline_id is distinct from new.pipeline_id then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_de, status_de, pipeline_para, status_para)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'mudou_etapa', old.pipeline_id, old.status_id, new.pipeline_id, new.status_id);
    end if;
    -- Reclassificação da etapa pelo Nexo (crm_definir_etapa_resultado) não é venda nem perda.
    if o_out is distinct from n_out and coalesce(current_setting('nexo.reclassificando', true), '') <> '1' then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para)
      values (new.client_id, new.crm_connection_id, new.external_lead_id,
        case n_out when 'won' then 'ganhou' when 'lost' then 'perdeu' else 'reabriu' end, new.pipeline_id, new.status_id);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.crm_registrar_evento() from public, anon, authenticated;

create or replace function public.crm_definir_etapa_resultado(p_connection uuid, p_pipeline text, p_status text, p_outcome text)
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_outcome not in ('open', 'won', 'lost') then raise exception 'resultado invalido'; end if;
  insert into crm_etapa_resultado (crm_connection_id, pipeline_id, status_id, outcome)
  values (p_connection, p_pipeline, p_status, p_outcome)
  on conflict (crm_connection_id, pipeline_id, status_id)
  do update set outcome = excluded.outcome, confirmado_por = auth.uid(), atualizado_em = now();
  perform set_config('nexo.reclassificando', '1', true);
  update crm_leads set outcome = p_outcome
  where crm_connection_id = p_connection and pipeline_id = p_pipeline and status_id = p_status
    and outcome is distinct from p_outcome;
  get diagnostics n = row_count;
  perform set_config('nexo.reclassificando', '', true);
  return n;
end;
$$;

create or replace function public.sap_enfileirar_conversao(e crm_lead_eventos)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_clinica uuid;
  v_etapa text;
begin
  select id into v_clinica from sap_clinicas where client_id = e.client_id limit 1;
  if v_clinica is null then return; end if;
  if e.tipo = 'ganhou' then
    -- Venda antiga (card importado já ganho) não vira conversão nova na Meta.
    if e.ocorreu_em < now() - interval '7 days' then return; end if;
    v_etapa := 'EtapaD';
  elsif e.tipo in ('entrou','mudou_etapa') then
    select sap_etapa_neutra(m.marco) into v_etapa from sap_etapa_marco m
    where m.crm_connection_id = e.crm_connection_id and m.pipeline_id = e.pipeline_para and m.status_id = e.status_para;
  end if;
  if v_etapa is null then return; end if;
  insert into sap_conversoes (clinica_id, crm_connection_id, external_lead_id, etapa, plataforma, ocorreu_em)
  select v_clinica, e.crm_connection_id, e.external_lead_id, v_etapa, p, e.ocorreu_em from unnest(array['meta','google']) p
  on conflict do nothing;
end;
$$;

-- 3. Conversa do Kommo sem pessoa: a conversa nasce ligada ao lead (lead_id), mas a pessoa só era ligada pelo
--    telefone. Com o lead já ligado a uma pessoa, a conversa herda a pessoa. 44.698 conversas sem pessoa_id; a
--    Jornada do Kommo saía com "conversaram = 0". Chamada pela reconciliação do Kommo depois de vincular_pessoas.
create or replace function public.conversas_pessoa_pelo_lead(p_client uuid default null)
returns integer
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  with feito as (
    update conversas v set pessoa_id = l.pessoa_id
      from crm_leads l
     where v.lead_id = l.id and v.pessoa_id is null and l.pessoa_id is not null
       and (p_client is null or v.client_id = p_client)
    returning 1
  )
  select count(*)::int from feito;
$$;
revoke all on function public.conversas_pessoa_pelo_lead(uuid) from public, anon, authenticated;
grant execute on function public.conversas_pessoa_pelo_lead(uuid) to service_role;

-- 4. Conversa do Kommo = um "talk". Na Dra. Lana o Kommo abre um talk novo quase a cada mensagem: 23.959 conversas
--    em outubro para 2.023 leads, média de 1,7 mensagem por conversa. A conversa passa a ser o atendimento do lead:
--    mensagens do mesmo lead com menos de 7 dias de intervalo ficam na mesma conversa (externo_id
--    'lead:<id do lead>:<dia em Brasília em que começou>'); mensagem sem lead continua pelo talk. Esta função junta o
--    histórico de um cliente no formato novo: move as mensagens, leva o tema já classificado e apaga a conversa que
--    ficou vazia. Rodada por cliente em produção (pode rodar de novo sem efeito).
create or replace function public.kommo_juntar_conversas(p_client uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  n_novas int; n_movidas int; n_apagadas int; n_temas int;
begin
  drop table if exists _alvo; -- várias chamadas na mesma transação
  create temp table _alvo on commit drop as
    with base as (
      select m.id as msg_id, m.externo_id, v.id as conversa_velha, v.canal, v.lead_id, v.pessoa_id, m.enviada_em, l.external_lead_id,
             case when m.enviada_em - lag(m.enviada_em) over (partition by v.lead_id order by m.enviada_em, m.id) <= interval '7 days' then 0 else 1 end as novo
        from conversas v
        join mensagens m on m.conversa_id = v.id
        join crm_leads l on l.id = v.lead_id
       where v.client_id = p_client and v.provider = 'kommo'
    ), ep as (
      select *, sum(novo) over (partition by lead_id order by enviada_em, msg_id) as episodio from base
    )
    select *, 'lead:' || external_lead_id || ':' || to_char(min(enviada_em) over (partition by lead_id, episodio) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as chave
      from ep;

  with novas as (
    insert into conversas (client_id, provider, externo_id, canal, lead_id, pessoa_id, iniciada_em, ultima_msg_em)
    select p_client, 'kommo', chave, (array_agg(canal order by enviada_em))[1], (array_agg(lead_id))[1],
           (array_agg(pessoa_id) filter (where pessoa_id is not null))[1], min(enviada_em), max(enviada_em)
      from _alvo group by chave
    on conflict (client_id, provider, externo_id) do update
      set iniciada_em = excluded.iniciada_em,
          ultima_msg_em = excluded.ultima_msg_em,
          pessoa_id = coalesce(conversas.pessoa_id, excluded.pessoa_id)
    returning 1
  ) select count(*) into n_novas from novas;

  -- A mesma mensagem não pode ficar duas vezes na conversa nova.
  delete from mensagens m using _alvo a, conversas c
   where m.id = a.msg_id and c.client_id = p_client and c.provider = 'kommo' and c.externo_id = a.chave and m.conversa_id <> c.id
     and exists (select 1 from mensagens x where x.conversa_id = c.id and x.externo_id = a.externo_id);
  with mov as (
    update mensagens m set conversa_id = c.id
      from _alvo a, conversas c
     where m.id = a.msg_id and c.client_id = p_client and c.provider = 'kommo' and c.externo_id = a.chave and m.conversa_id <> c.id
    returning 1
  ) select count(*) into n_movidas from mov;

  -- Tema já classificado vai para a conversa nova (o do começo do atendimento), para não pagar a IA de novo.
  with t as (
    insert into conversas_tema (conversa_id, client_id, sem_texto, tema, assunto, intencao, comercial, preco_pedido, objecoes, ate_msg_em, gerado_em, modelo)
    select distinct on (c.id) c.id, t.client_id, t.sem_texto, t.tema, t.assunto, t.intencao, t.comercial, t.preco_pedido, t.objecoes, t.ate_msg_em, t.gerado_em, t.modelo
      from _alvo a
      join conversas_tema t on t.conversa_id = a.conversa_velha
      join conversas c on c.client_id = p_client and c.provider = 'kommo' and c.externo_id = a.chave
     order by c.id, a.enviada_em
    on conflict (conversa_id) do nothing
    returning 1
  ) select count(*) into n_temas from t;

  with apag as (
    delete from conversas v
     where v.client_id = p_client and v.provider = 'kommo' and v.lead_id is not null
       and not exists (select 1 from mensagens m where m.conversa_id = v.id)
    returning 1
  ) select count(*) into n_apagadas from apag;

  return jsonb_build_object('conversas_novas', n_novas, 'mensagens_movidas', n_movidas, 'temas_levados', n_temas, 'conversas_apagadas', n_apagadas);
end;
$$;
revoke all on function public.kommo_juntar_conversas(uuid) from public, anon, authenticated;
grant execute on function public.kommo_juntar_conversas(uuid) to service_role;
