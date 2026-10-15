-- SAP · Lote F (05.03 Plano de Rastreamento e Mensuração).
-- 1) Checklist de teste antes de subir anúncio (seção 9): 16 itens, cada um com status e evidência.
--    "Liberado para subir" = todos os obrigatórios aprovados e conferidos pelo Coordenador.
-- 2) Configuração de rastreamento da clínica: status da categoria saúde e bem-estar (seção 7, recheck a cada 15 dias),
--    ações de conversão do Google e as chaves que ligam o envio (desligado por padrão: nada sai sem autorização).
-- 3) Fila de conversões offline (seção 6): cada mudança de etapa do CRM marcada como marco do SAP (sap_etapa_marco)
--    vira uma linha com o nome NEUTRO da etapa (EtapaA qualificado, EtapaB agendou, EtapaC compareceu, EtapaD fechou).
--    Quem envia é o n8n (credenciais ficam lá), pelas funções sap_conversoes_lote e sap_conversoes_resultado,
--    que só a service_role chama. Telefone e e-mail saem daqui já com SHA-256; nunca sai nome de serviço ou de etapa
--    do CRM, só o nome neutro.

alter table public.sap_clinicas
  add column if not exists status_categoria_meta text check (status_categoria_meta in ('sem_restricao','basica','intermediaria','total')),
  add column if not exists categoria_verificada_em date,
  add column if not exists google_acoes_conversao jsonb,
  add column if not exists conversoes_meta boolean not null default false,
  add column if not exists conversoes_google boolean not null default false;

create table if not exists public.sap_rastreamento_teste (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  item integer not null check (item between 1 and 16),
  status text not null default 'pendente' check (status in ('pendente','aprovado','reprovado','nao_se_aplica')),
  evidencia text,
  feito_por uuid default auth.uid(),
  feito_em timestamptz not null default now(),
  primary key (clinica_id, item)
);
alter table public.sap_rastreamento_teste enable row level security;
create policy "sap ler testes de rastreamento" on public.sap_rastreamento_teste for select to authenticated using (public.sap_pode_ler(clinica_id));
grant select on public.sap_rastreamento_teste to authenticated;

alter table public.sap_clinicas
  add column if not exists rastreamento_conferido_por text,
  add column if not exists rastreamento_conferido_em date;

create table if not exists public.sap_conversoes (
  id bigserial primary key,
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  external_lead_id text not null,
  etapa text not null check (etapa in ('EtapaA','EtapaB','EtapaC','EtapaD')),
  plataforma text not null check (plataforma in ('meta','google')),
  ocorreu_em timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente','enviado','falhou','expirado','bloqueado','sem_dados')),
  motivo text,
  tentativas integer not null default 0,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (clinica_id, crm_connection_id, external_lead_id, etapa, plataforma)
);
create index if not exists sap_conversoes_fila on public.sap_conversoes (plataforma, status, ocorreu_em);
alter table public.sap_conversoes enable row level security;
create policy "admin le conversoes" on public.sap_conversoes for select to authenticated using (public.is_app_admin());
grant select on public.sap_conversoes to authenticated;

-- Marco do SAP → etapa neutra. Pensando e não fechou passaram pela consulta: contam como compareceu.
create or replace function public.sap_etapa_neutra(p_marco text)
returns text language sql immutable set search_path to 'public'
as $function$
  select case p_marco
    when 'qualificado' then 'EtapaA'
    when 'agendado' then 'EtapaB'
    when 'compareceu' then 'EtapaC'
    when 'pensando' then 'EtapaC'
    when 'nao_fechou' then 'EtapaC'
    when 'fechou' then 'EtapaD'
  end;
$function$;

-- Enfileira um evento do CRM (se a clínica é do SAP e a etapa tem marco). Nunca derruba quem chamou.
create or replace function public.sap_enfileirar_conversao(e public.crm_lead_eventos)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_clinica uuid;
  v_etapa text;
begin
  select id into v_clinica from sap_clinicas where client_id = e.client_id limit 1;
  if v_clinica is null then return; end if;
  if e.tipo = 'ganhou' then
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
$function$;
revoke all on function public.sap_enfileirar_conversao(public.crm_lead_eventos) from public, anon, authenticated;

create or replace function public.sap_conversoes_do_evento()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  begin
    perform public.sap_enfileirar_conversao(new);
  exception when others then
    null;
  end;
  return new;
end;
$function$;
revoke all on function public.sap_conversoes_do_evento() from public, anon, authenticated;

create trigger sap_conversoes_crm_eventos
  after insert on public.crm_lead_eventos
  for each row execute function public.sap_conversoes_do_evento();

-- Quando a equipe marca (ou corrige) o marco de uma etapa, os eventos dos últimos 7 dias nessa etapa entram na fila.
create or replace function public.sap_conversoes_do_marco()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare r public.crm_lead_eventos;
begin
  begin
    for r in select * from crm_lead_eventos ev
      where ev.crm_connection_id = new.crm_connection_id and ev.pipeline_para = new.pipeline_id and ev.status_para = new.status_id
        and ev.tipo in ('entrou','mudou_etapa') and ev.ocorreu_em >= now() - interval '7 days'
    loop
      perform public.sap_enfileirar_conversao(r);
    end loop;
  exception when others then
    null;
  end;
  return new;
end;
$function$;
revoke all on function public.sap_conversoes_do_marco() from public, anon, authenticated;

create trigger sap_conversoes_marco
  after insert or update of marco on public.sap_etapa_marco
  for each row when (new.marco is not null)
  execute function public.sap_conversoes_do_marco();

-- Lote para o envio (n8n). Antes de devolver, fecha o que não pode mais ir:
--   expirado: Meta aceita até 7 dias de atraso; Google (conversões otimizadas para leads) até 63 dias;
--   bloqueado: Meta com restrição total da categoria saúde e bem-estar (fundo de funil fica só no Tracker);
--   sem_dados: lead sem telefone nem e-mail (não há como a plataforma casar).
-- Só devolve clínicas com o envio ligado (conversoes_meta / conversoes_google) e, no Google, com a ação da etapa.
create or replace function public.sap_conversoes_lote(p_plataforma text, p_limite integer default 200)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v jsonb;
begin
  if p_plataforma not in ('meta','google') then raise exception 'plataforma invalida'; end if;

  update sap_conversoes c set status = 'expirado', motivo = 'passou do prazo da plataforma'
  where c.plataforma = p_plataforma and c.status in ('pendente','falhou')
    and c.ocorreu_em < now() - case when p_plataforma = 'meta' then interval '7 days' else interval '63 days' end;

  update sap_conversoes c set status = 'bloqueado', motivo = 'categoria saúde e bem-estar com restrição total'
  from sap_clinicas s
  where p_plataforma = 'meta' and c.plataforma = 'meta' and c.status = 'pendente' and s.id = c.clinica_id
    and s.status_categoria_meta = 'total';

  update sap_conversoes c set status = 'sem_dados', motivo = 'lead sem telefone e sem e-mail no CRM'
  where c.plataforma = p_plataforma and c.status = 'pendente'
    and not exists (select 1 from crm_leads l where l.crm_connection_id = c.crm_connection_id and l.external_lead_id = c.external_lead_id
      and (nullif(trim(l.contact_phone), '') is not null or nullif(trim(l.contact_email), '') is not null));

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
  com_lead as (
    select f.*, l.price, l.provider,
      case when nullif(trim(l.contact_email), '') is not null
        then encode(sha256(convert_to(lower(trim(l.contact_email)), 'UTF8')), 'hex') end as em,
      case when length(regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g')) between 10 and 13 then
        encode(sha256(convert_to(
          case when length(regexp_replace(l.contact_phone, '\D', '', 'g')) in (10, 11)
            then '55' || regexp_replace(l.contact_phone, '\D', '', 'g')
            else regexp_replace(l.contact_phone, '\D', '', 'g') end, 'UTF8')), 'hex') end as ph
    from fila f
    left join lateral (select * from crm_leads l where l.crm_connection_id = f.crm_connection_id and l.external_lead_id = f.external_lead_id
      order by l.received_at desc nulls last limit 1) l on true
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
    'origem_crm', coalesce(provider, 'crm'),
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

-- Resultado do envio, devolvido pelo n8n. Falha conta tentativa; na terceira, para de tentar.
create or replace function public.sap_conversoes_resultado(p_ids bigint[], p_ok boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update sap_conversoes set
    status = case when p_ok then 'enviado' else 'falhou' end,
    enviado_em = case when p_ok then now() else enviado_em end,
    motivo = case when p_ok then null else left(coalesce(p_motivo, 'falha no envio'), 500) end,
    tentativas = tentativas + 1
  where id = any(p_ids);
end;
$function$;
revoke all on function public.sap_conversoes_resultado(bigint[], boolean, text) from public, anon, authenticated;
grant execute on function public.sap_conversoes_resultado(bigint[], boolean, text) to service_role;

create or replace function public.sap_salvar_teste_rastreamento(p_clinica_id uuid, p_item integer, p_status text, p_evidencia text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_rastreamento_teste (clinica_id, item, status, evidencia, feito_por, feito_em)
  values (p_clinica_id, p_item, p_status, nullif(trim(p_evidencia), ''), auth.uid(), now())
  on conflict (clinica_id, item) do update set status = excluded.status, evidencia = excluded.evidencia,
    feito_por = excluded.feito_por, feito_em = now();
  -- Qualquer mudança no checklist pede nova conferência do Coordenador.
  update sap_clinicas set rastreamento_conferido_por = null, rastreamento_conferido_em = null where id = p_clinica_id;
end;
$function$;

create or replace function public.sap_conferir_rastreamento(p_clinica_id uuid, p_por text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  update sap_clinicas set rastreamento_conferido_por = nullif(trim(p_por), ''),
    rastreamento_conferido_em = case when nullif(trim(p_por), '') is null then null else current_date end
  where id = p_clinica_id;
end;
$function$;

create or replace function public.sap_salvar_rastreamento(p_clinica_id uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to 'public'
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
    atualizado_em = now()
  where id = p_clinica_id;
end;
$function$;

revoke all on function public.sap_salvar_teste_rastreamento(uuid, integer, text, text) from public, anon;
revoke all on function public.sap_conferir_rastreamento(uuid, text) from public, anon;
revoke all on function public.sap_salvar_rastreamento(uuid, jsonb) from public, anon;
grant execute on function public.sap_salvar_teste_rastreamento(uuid, integer, text, text) to authenticated;
grant execute on function public.sap_conferir_rastreamento(uuid, text) to authenticated;
grant execute on function public.sap_salvar_rastreamento(uuid, jsonb) to authenticated;

-- Carga inicial: eventos dos últimos 7 dias das clínicas do SAP (o que é mais antigo a Meta já não aceita).
do $$
declare r public.crm_lead_eventos;
begin
  for r in select ev.* from crm_lead_eventos ev
    where ev.ocorreu_em >= now() - interval '7 days'
      and exists (select 1 from sap_clinicas s where s.client_id = ev.client_id)
  loop
    perform public.sap_enfileirar_conversao(r);
  end loop;
end $$;
