-- Ciclo com a Meta: o "agendou" que a IA lê na conversa do WhatsApp também entra na fila de conversões offline
-- (sap_conversoes, EtapaB), não só a mudança de etapa no CRM. Desligado por padrão: cada clínica liga em
-- sap_clinicas.conversoes_da_conversa, e o envio em si continua exigindo conversoes_meta/google + pixel/conta.
--   Conversa ligada a lead do CRM: usa a chave do lead (mesma linha que o CRM criaria; nunca conta duas vezes).
--   Conversa sem lead: chave própria (origem 'conversa'), casamento pelo telefone/e-mail da pessoa.
-- Só entra o que aconteceu nos últimos 7 dias (prazo da Meta). Nada é enviado por esta migração.
-- Reversão: drop trigger sap_conversoes_da_conversa on conversas_resumos; drop function sap_conversoes_da_conversa(),
--   sap_enfileirar_da_conversa(conversas_resumos); delete from sap_conversoes where origem = 'conversa';
--   restaurar sap_conversoes_lote/sap_conversoes_reabrir de 20261017150000/20261017160000;
--   alter table sap_conversoes drop column conversa_id, drop column origem; alter column crm_connection_id set not null;
--   alter table sap_clinicas drop column conversoes_da_conversa.

alter table public.sap_clinicas add column if not exists conversoes_da_conversa boolean not null default false;

alter table public.sap_conversoes
  add column if not exists origem text not null default 'crm' check (origem in ('crm','conversa')),
  add column if not exists conversa_id uuid references public.conversas(id) on delete cascade,
  alter column crm_connection_id drop not null;
alter table public.sap_conversoes drop constraint if exists sap_conversoes_chave_origem;
alter table public.sap_conversoes add constraint sap_conversoes_chave_origem
  check ((origem = 'crm' and crm_connection_id is not null) or (origem = 'conversa' and conversa_id is not null));
create unique index if not exists sap_conversoes_conversa_unica
  on public.sap_conversoes (clinica_id, conversa_id, etapa, plataforma) where conversa_id is not null;

create or replace function public.sap_enfileirar_da_conversa(r public.conversas_resumos)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_clinica uuid;
  v_quando timestamptz := coalesce(r.ate_msg_em, r.gerado_em, now());
  v_lead record;
begin
  if not (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou') then return; end if;
  if v_quando < now() - interval '7 days' then return; end if;
  select s.id into v_clinica from sap_clinicas s where s.client_id = r.client_id and s.conversoes_da_conversa limit 1;
  if v_clinica is null then return; end if;

  select l.crm_connection_id, l.external_lead_id into v_lead
  from conversas c join crm_leads l on l.id = c.lead_id where c.id = r.conversa_id;

  if v_lead.crm_connection_id is not null then
    insert into sap_conversoes (clinica_id, crm_connection_id, external_lead_id, etapa, plataforma, ocorreu_em, origem)
    select v_clinica, v_lead.crm_connection_id, v_lead.external_lead_id, 'EtapaB', p, v_quando, 'crm'
    from unnest(array['meta','google']) p
    on conflict do nothing;
  else
    insert into sap_conversoes (clinica_id, conversa_id, external_lead_id, etapa, plataforma, ocorreu_em, origem)
    select v_clinica, r.conversa_id, 'conv_' || r.conversa_id::text, 'EtapaB', p, v_quando, 'conversa'
    from unnest(array['meta','google']) p
    on conflict do nothing;
  end if;
end;
$function$;
revoke all on function public.sap_enfileirar_da_conversa(public.conversas_resumos) from public, anon, authenticated;

create or replace function public.sap_conversoes_da_conversa()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  begin
    perform public.sap_enfileirar_da_conversa(new);
  exception when others then
    null;
  end;
  return new;
end;
$function$;
revoke all on function public.sap_conversoes_da_conversa() from public, anon, authenticated;

drop trigger if exists sap_conversoes_da_conversa on public.conversas_resumos;
create trigger sap_conversoes_da_conversa
  after insert or update of resumo on public.conversas_resumos
  for each row execute function public.sap_conversoes_da_conversa();

-- Contato para o casamento: lead do CRM ou, na origem conversa, a pessoa da conversa.
create or replace function public.sap_conversoes_reabrir(p_plataforma text)
returns void language sql security definer set search_path = public, pg_temp
as $function$
  update sap_conversoes c set status = 'pendente', motivo = null
  where c.plataforma = p_plataforma and c.status = 'sem_dados'
    and (exists (select 1 from crm_leads l where l.crm_connection_id = c.crm_connection_id and l.external_lead_id = c.external_lead_id
          and (nullif(trim(l.contact_phone), '') is not null or nullif(trim(l.contact_email), '') is not null))
      or exists (select 1 from conversas cv join pessoas p on p.id = cv.pessoa_id where cv.id = c.conversa_id
          and (nullif(trim(p.telefone), '') is not null or nullif(trim(p.email), '') is not null)));
$function$;
revoke all on function public.sap_conversoes_reabrir(text) from public, anon, authenticated;
grant execute on function public.sap_conversoes_reabrir(text) to service_role;

create or replace function public.sap_conversoes_lote(p_plataforma text, p_limite integer default 200)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v jsonb;
begin
  if p_plataforma not in ('meta','google') then raise exception 'plataforma invalida'; end if;
  perform public.sap_conversoes_reabrir(p_plataforma);

  update sap_conversoes c set status = 'expirado', motivo = 'passou do prazo da plataforma'
  where c.plataforma = p_plataforma and c.status in ('pendente','falhou')
    and c.ocorreu_em < now() - case when p_plataforma = 'meta' then interval '7 days' else interval '63 days' end;

  update sap_conversoes c set status = 'bloqueado', motivo = 'categoria saúde e bem-estar com restrição total'
  from sap_clinicas s
  where p_plataforma = 'meta' and c.plataforma = 'meta' and c.status = 'pendente' and s.id = c.clinica_id
    and s.status_categoria_meta = 'total';

  update sap_conversoes c set status = 'sem_dados',
    motivo = case when c.origem = 'conversa' then 'conversa sem telefone e sem e-mail' else 'lead sem telefone e sem e-mail no CRM' end
  where c.plataforma = p_plataforma and c.status = 'pendente'
    and not exists (select 1 from crm_leads l where l.crm_connection_id = c.crm_connection_id and l.external_lead_id = c.external_lead_id
      and (nullif(trim(l.contact_phone), '') is not null or nullif(trim(l.contact_email), '') is not null))
    and not exists (select 1 from conversas cv join pessoas p on p.id = cv.pessoa_id where cv.id = c.conversa_id
      and (nullif(trim(p.telefone), '') is not null or nullif(trim(p.email), '') is not null));

  with fila as (
    select c.*, s.meta_pixel_id, s.google_ads_customer_id, s.google_acoes_conversao
    from sap_conversoes c
    join sap_clinicas s on s.id = c.clinica_id
    where c.plataforma = p_plataforma
      and (c.status = 'pendente' or (c.status = 'falhou' and c.tentativas < 3))
      and case when p_plataforma = 'meta' then s.conversoes_meta and nullif(s.meta_pixel_id, '') is not null
               else s.conversoes_google and nullif(s.google_ads_customer_id, '') is not null
                    and nullif(s.google_acoes_conversao ->> c.etapa, '') is not null end
    order by c.ocorreu_em
    limit greatest(1, least(coalesce(p_limite, 200), 1000))
  ),
  contato as (
    select f.*, k.price, k.provider, k.email, regexp_replace(coalesce(k.phone, ''), '\D', '', 'g') as fone
    from fila f
    left join lateral (
      (select l.price, l.provider, l.contact_email as email, l.contact_phone as phone from crm_leads l
      where f.origem = 'crm' and l.crm_connection_id = f.crm_connection_id and l.external_lead_id = f.external_lead_id
      order by l.received_at desc nulls last limit 1)
      union all
      select null::numeric, cv.provider, p.email, p.telefone from conversas cv join pessoas p on p.id = cv.pessoa_id
      where f.origem = 'conversa' and cv.id = f.conversa_id
      limit 1
    ) k on true
  ),
  com_lead as (
    select c.*,
      case when nullif(trim(c.email), '') is not null
        then encode(sha256(convert_to(lower(trim(c.email)), 'UTF8')), 'hex') end as em,
      case when length(c.fone) between 10 and 13 then
        encode(sha256(convert_to(case when length(c.fone) in (10, 11) then '55' || c.fone else c.fone end, 'UTF8')), 'hex') end as ph
    from contato c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'clinica_id', clinica_id,
    'etapa', etapa,
    'event_id', clinica_id::text || '_' || external_lead_id || '_' || etapa,
    'event_time', extract(epoch from ocorreu_em)::bigint,
    'ocorreu_em', ocorreu_em,
    'pixel_id', meta_pixel_id,
    'google_customer_id', regexp_replace(coalesce(google_ads_customer_id, ''), '\D', '', 'g'),
    'google_acao', google_acoes_conversao ->> etapa,
    'origem_crm', case when origem = 'conversa' then 'conversa_' || coalesce(provider, 'whatsapp') else coalesce(provider, 'crm') end,
    'em', em,
    'ph', ph,
    'valor', case when etapa = 'EtapaD' and price > 0 then price end,
    'moeda', 'BRL'
  )), '[]'::jsonb) into v
  from com_lead;
  return v;
end;
$function$;
revoke all on function public.sap_conversoes_lote(text, integer) from public, anon, authenticated;
grant execute on function public.sap_conversoes_lote(text, integer) to service_role;

-- Chave na tela da equipe (Rastreio do SAP): salva junto com o resto da configuração. Só admin.
create or replace function public.sap_salvar_rastreamento(p_clinica_id uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  update sap_clinicas set
    meta_pixel_id = nullif(trim(p_dados ->> 'meta_pixel_id'), ''),
    meta_ad_account_id = nullif(trim(p_dados ->> 'meta_ad_account_id'), ''),
    google_ads_customer_id = nullif(trim(p_dados ->> 'google_ads_customer_id'), ''),
    google_acoes_conversao = case when jsonb_typeof(p_dados -> 'google_acoes_conversao') = 'object' then p_dados -> 'google_acoes_conversao' end,
    status_categoria_meta = nullif(p_dados ->> 'status_categoria_meta', ''),
    categoria_verificada_em = nullif(p_dados ->> 'categoria_verificada_em', '')::date,
    conversoes_meta = coalesce((p_dados ->> 'conversoes_meta')::boolean, false),
    conversoes_google = coalesce((p_dados ->> 'conversoes_google')::boolean, false),
    conversoes_da_conversa = coalesce((p_dados ->> 'conversoes_da_conversa')::boolean, false),
    atualizado_em = now()
  where id = p_clinica_id;
end;
$function$;
revoke all on function public.sap_salvar_rastreamento(uuid, jsonb) from public, anon;
grant execute on function public.sap_salvar_rastreamento(uuid, jsonb) to authenticated;
