-- Ajuste da contagem por pessoa depois de conferir o HOMS (29/10/2026).
--  1. No Kommo o contato do CRM vem antes do telefone: nos últimos 30 dias, 840 dos 1.142 cards do HOMS estavam sem
--     telefone, e cada card virava uma "pessoa". O contato é o que o Kommo usa para juntar os leads da mesma pessoa.
--     A reconciliação do Kommo (api/_lib/kommo-reconcile.ts) completa o contato dos leads antigos.
--  2. "Paciente da casa" passa a reconhecer o texto que a equipe escreve no campo de origem ("Já sou paciente",
--     "Paciente antigo"...), pela mesma regra de crm_origem_classifica, e não só o rótulo exato "Paciente antigo".
-- Reversão: recriar crm_chave_pessoa e crm_pessoas_leads como em 20261030170000 e recalcular crm_leads.chave_pessoa.

create or replace function public.crm_chave_pessoa(p_provider text, p_raw jsonb, p_phone text, p_external_id text, p_connection_id uuid)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    case when p_provider = 'kommo' then 'k:' || (p_raw->'_embedded'->'contacts'->0->>'id') end,
    case when p_provider = 'flwchat' then 'f:' || (p_raw->'contactIds'->>0) end,
    case when p_provider = 'clint' then 'c:' || (p_raw->'contact'->>'id') end,
    't:' || public.chave_telefone(p_phone),
    'l:' || p_connection_id::text || ':' || p_external_id
  );
$$;

create or replace function public.crm_pessoas_leads(p_client_id uuid)
returns table(pk text, d date, conta boolean, paciente_antigo boolean, outcome text, price numeric, tem_origem boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)),
         (cl.occurred_at at time zone 'America/Sao_Paulo')::date,
         coalesce(fp.papel, 'captacao') not in ('compra', 'base'),
         coalesce(public.crm_origem_classifica(cl.source) = 'Paciente antigo', false),
         cl.outcome, cl.price,
         nullif(btrim(cl.source), '') is not null
  from crm_leads cl
  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and cl.occurred_at is not null;
$$;
revoke all on function public.crm_pessoas_leads(uuid) from public, anon, authenticated;

update public.crm_leads
   set chave_pessoa = public.crm_chave_pessoa(provider, raw_payload, contact_phone, external_lead_id, crm_connection_id)
 where provider = 'kommo'
   and chave_pessoa is distinct from public.crm_chave_pessoa(provider, raw_payload, contact_phone, external_lead_id, crm_connection_id);
