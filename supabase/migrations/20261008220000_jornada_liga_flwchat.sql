-- Liga lead do FlwChat <-> conversa do WTS pelos identificadores (sessionId / contactIds), sem depender de telefone.
-- Seguro rodar mais de uma vez.
create or replace function public.vincular_flwchat(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer := 0; v_x integer;
begin
  -- 1. pela sessão do atendimento (mais exato)
  update public.crm_leads l
  set pessoa_id = c.pessoa_id
  from public.conversas c
  where l.client_id = p_client and l.provider = 'flwchat' and l.pessoa_id is null
    and c.client_id = l.client_id and c.provider = 'wts' and c.pessoa_id is not null
    and c.externo_id = l.raw_payload->>'sessionId';
  get diagnostics v_x = row_count; v_n := v_n + v_x;

  -- 2. pelo contato (qualquer sessão desse contato)
  update public.crm_leads l
  set pessoa_id = sub.pessoa_id
  from (
    select distinct on (l2.id) l2.id as lead_id, c.pessoa_id
    from public.crm_leads l2
    join public.wts_sessions s on s.client_id = l2.client_id and s.contact_id::text = any (
      select jsonb_array_elements_text(coalesce(l2.raw_payload->'contactIds', '[]'::jsonb)))
    join public.conversas c on c.client_id = s.client_id and c.provider = 'wts' and c.externo_id = s.session_id::text and c.pessoa_id is not null
    where l2.client_id = p_client and l2.provider = 'flwchat' and l2.pessoa_id is null
    order by l2.id, c.ultima_msg_em desc nulls last
  ) sub
  where l.id = sub.lead_id;
  get diagnostics v_x = row_count; v_n := v_n + v_x;

  -- 3. a conversa passa a apontar para o lead
  update public.conversas c
  set lead_id = l.id
  from public.crm_leads l
  where c.client_id = p_client and c.provider = 'wts' and c.lead_id is null
    and l.client_id = c.client_id and l.provider = 'flwchat' and l.pessoa_id = c.pessoa_id and c.pessoa_id is not null;

  -- 4. o lead entra na linha do tempo da pessoa
  insert into public.toques (client_id, pessoa_id, tipo, ocorreu_em, fonte, externo_id, bruto)
  select l.client_id, l.pessoa_id, 'lead_criado', coalesce(l.occurred_at, l.received_at), 'crm:' || l.provider,
         coalesce(l.external_lead_id, l.id::text),
         jsonb_build_object('origem_crm', l.source, 'etapa_id', l.status_id, 'resultado', l.outcome)
  from public.crm_leads l
  where l.client_id = p_client and l.provider = 'flwchat' and l.pessoa_id is not null
  on conflict (client_id, fonte, externo_id) do nothing;
  return v_n;
end;
$$;
revoke all on function public.vincular_flwchat(uuid) from public, anon, authenticated;
grant execute on function public.vincular_flwchat(uuid) to service_role;

-- Funções de leitura da tela Jornada (ver 04 no Downloads). Resumo cruzado, linha do tempo da pessoa e busca.
