-- Prepara crm_leads para mais de um CRM, sem tocar em nada que já funciona.
--
-- Hoje as funções do banco (crm_metricas_essenciais, crm_funil_por_campo,
-- crm_leads_por_dia…) leem tudo de dentro do raw_payload no formato do Kommo:
-- created_at como epoch numérico, os ids mágicos 142/143 para ganho e perda, e
-- custom_fields_values como array de {field_name, values[]}.
--
-- A Clint entrega o mesmo significado em outro formato: created_at em ISO,
-- status como texto WON/LOST/OPEN, e campos personalizados num objeto plano.
-- Em vez de encher o raw_payload da Clint com um formato falso de Kommo, ou
-- de dobrar cada função em dois caminhos, o significado sobe do JSON para
-- colunas. Cada sync normaliza na ENTRADA; quem lê passa a ler coluna.
--
-- Esta migration é só aditiva: cria as colunas e preenche as linhas do Kommo
-- que já existem. Nenhuma função é alterada aqui — isso vem depois, com os
-- números da Lana Torres conferidos antes e depois.

alter table public.crm_connections
  drop constraint if exists crm_connections_provider_check;

alter table public.crm_connections
  add constraint crm_connections_provider_check
  check (provider in ('kommo', 'feegow', 'ninsaude', 'clint'));

alter table public.crm_leads
  add column if not exists occurred_at timestamptz,
  add column if not exists outcome text check (outcome in ('open', 'won', 'lost')),
  add column if not exists source text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

comment on column public.crm_leads.occurred_at is
  'Quando o lead/negócio foi criado no CRM de origem, já normalizado. Kommo manda epoch; Clint manda ISO.';
comment on column public.crm_leads.outcome is
  'Desfecho normalizado. Kommo codifica em status_id (142 ganho, 143 perdido); Clint manda status textual.';
comment on column public.crm_leads.source is
  'Origem do lead. No Kommo vem do campo personalizado "Fonte do Lead"; na Clint é a origem do negócio.';

-- Backfill do que já está no banco (só Kommo hoje). Deriva do raw_payload que
-- as funções já liam, então não inventa dado nenhum — só materializa.
update public.crm_leads
set occurred_at = to_timestamp((raw_payload->>'created_at')::bigint)
where provider = 'kommo'
  and occurred_at is null
  and raw_payload ? 'created_at'
  and nullif(raw_payload->>'created_at', '') is not null;

update public.crm_leads
set outcome = case status_id
                when '142' then 'won'
                when '143' then 'lost'
                else 'open'
              end
where provider = 'kommo' and outcome is null;

update public.crm_leads cl
set source = sub.valor
from (
  select l.id,
    (select v->>'value'
     from jsonb_array_elements(l.raw_payload->'custom_fields_values') f,
          jsonb_array_elements(f->'values') v
     where f->>'field_name' ilike '%Fonte do Lead%'
     limit 1) as valor
  from public.crm_leads l
  where l.provider = 'kommo'
    and jsonb_typeof(l.raw_payload->'custom_fields_values') = 'array'
) sub
where cl.id = sub.id and sub.valor is not null and cl.source is null;

create index if not exists crm_leads_occurred_at_idx
  on public.crm_leads(client_id, occurred_at desc);
create index if not exists crm_leads_outcome_idx
  on public.crm_leads(client_id, outcome);

-- Configuração por conexão. Na Clint guarda quais origens pertencem ao
-- cliente: a conta tem 20 origens e o recorte é decisão de negócio, que muda
-- sem precisar de deploy.
alter table public.crm_connections
  add column if not exists config jsonb not null default '{}'::jsonb;

comment on column public.crm_connections.config is
  'Configuração específica do provedor. Na Clint guarda {"origins": [...]}.';

-- crm_leads tem o SEU PRÓPRIO check de provider, separado do de
-- crm_connections. Esquecer este aqui fez o primeiro sync da Clint buscar os
-- 2.681 negócios com sucesso e falhar em todas as gravações.
alter table public.crm_leads drop constraint if exists crm_leads_provider_check;

alter table public.crm_leads
  add constraint crm_leads_provider_check
  check (provider in ('kommo', 'feegow', 'ninsaude', 'clint'));
