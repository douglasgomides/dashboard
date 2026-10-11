-- Sistema de Aquisição de Pacientes (SAP) · Tracker
-- Aditivo: só cria tabelas sap_*, uma view e policies de leitura nelas.
-- Não altera nenhuma tabela existente. Escrita só via service role
-- (api/sap/lead.ts e workflows "SAP |" do n8n).
-- Campos seguem o modelo de dados comum do SAP (PADRAO_V2, seção 12).

create table if not exists public.sap_clinicas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  nome text not null,
  cidade text,
  especialidade text,
  d0 date,
  status text default 'onboarding' check (status in ('onboarding','rodando','pausada','encerrada')),
  servicos text[] default '{}',
  whatsapp_numero text,
  meta_pixel_id text,
  meta_ad_account_id text,
  google_ads_customer_id text,
  clickup_folder_id text,
  created_at timestamptz default now()
);
create index if not exists sap_clinicas_client on public.sap_clinicas (client_id);

create table if not exists public.sap_leads (
  id text primary key,                                   -- L-AAAAMMDD-NNN
  clinica_id uuid references public.sap_clinicas(id) on delete cascade,
  data_entrada timestamptz default now(),
  canal text check (canal in ('Meta Ads','Google Ads','Orgânico','Indicação','Impulsionamento','Outro')),
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  servico text,
  pontuacao text check (pontuacao in ('A','B','C')),
  tempo_primeira_resposta_min numeric,
  agendou boolean default false,
  data_consulta timestamptz,
  compareceu text check (compareceu in ('Sim','Não','Remarcou')),
  decisao text check (decisao in ('Fechou','Não fechou','Pensando')),
  motivo_categoria text check (motivo_categoria in ('Preço','Tempo para decidir','Cônjuge ou família','Medo ou insegurança','Comparando com outro profissional','Sem indicação clínica','Outro')),
  motivo_literal text,
  valor_apresentado numeric,
  valor_fechado numeric,
  toque_fechamento text check (toque_fechamento in ('Consulta','F1','F2','F3','F4','F5')),
  status_cadencia text check (status_cadencia in ('Ativa','Pausada','Encerrada')),
  -- rastreamento: dado pessoal só em hash SHA-256 (LGPD)
  telefone_hash text, email_hash text,
  meta_lead_id text, fbclid text, fbc text, fbp text, gclid text, wbraid text, gbraid text,
  capi_enviado_em timestamptz,
  google_offline_enviado_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sap_leads_clinica_data on public.sap_leads (clinica_id, data_entrada);
create index if not exists sap_leads_telefone_hash on public.sap_leads (clinica_id, telefone_hash);
create index if not exists sap_leads_meta_lead on public.sap_leads (meta_lead_id);

create table if not exists public.sap_eventos (
  id bigserial primary key,
  lead_id text references public.sap_leads(id) on delete cascade,
  clinica_id uuid references public.sap_clinicas(id) on delete cascade,
  tipo text not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists sap_eventos_lead on public.sap_eventos (lead_id);
create index if not exists sap_eventos_clinica on public.sap_eventos (clinica_id, created_at);

create table if not exists public.sap_metricas_diarias (
  clinica_id uuid references public.sap_clinicas(id) on delete cascade,
  data date not null,
  canal text not null,
  investimento numeric default 0,
  impressoes bigint default 0,
  alcance bigint default 0,
  cliques bigint default 0,
  leads_plataforma bigint default 0,
  primary key (clinica_id, data, canal)
);

create table if not exists public.sap_metas (
  clinica_id uuid references public.sap_clinicas(id) on delete cascade,
  mes date not null,
  etapa text not null check (etapa in ('leads','qualificados','agendamentos','consultas','fechamentos','receita')),
  meta numeric not null,
  primary key (clinica_id, mes, etapa)
);

create or replace view public.sap_funil_semanal with (security_invoker = true) as
select
  l.clinica_id,
  date_trunc('week', l.data_entrada)::date as semana,
  count(*) as leads,
  count(*) filter (where l.pontuacao in ('A','B')) as qualificados,
  count(*) filter (where l.agendou) as agendamentos,
  count(*) filter (where l.compareceu = 'Sim') as consultas,
  count(*) filter (where l.decisao = 'Fechou') as fechamentos,
  coalesce(sum(l.valor_fechado) filter (where l.decisao = 'Fechou'), 0) as receita,
  percentile_cont(0.5) within group (order by l.tempo_primeira_resposta_min) as mediana_1a_resposta_min
from public.sap_leads l
group by 1, 2;

-- Leitura: admin ou membro do cliente do Hub ligado à clínica.
create or replace function public.sap_pode_ler(p_clinica_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() or exists (
    select 1 from public.sap_clinicas c
    where c.id = p_clinica_id and c.client_id is not null and public.is_client_member(c.client_id)
  );
$$;
grant execute on function public.sap_pode_ler(uuid) to authenticated;

alter table public.sap_clinicas enable row level security;
alter table public.sap_leads enable row level security;
alter table public.sap_eventos enable row level security;
alter table public.sap_metricas_diarias enable row level security;
alter table public.sap_metas enable row level security;

drop policy if exists "sap ler clinicas" on public.sap_clinicas;
create policy "sap ler clinicas" on public.sap_clinicas
  for select to authenticated using (public.sap_pode_ler(id));

drop policy if exists "sap ler leads" on public.sap_leads;
create policy "sap ler leads" on public.sap_leads
  for select to authenticated using (public.sap_pode_ler(clinica_id));

drop policy if exists "sap ler eventos" on public.sap_eventos;
create policy "sap ler eventos" on public.sap_eventos
  for select to authenticated using (public.sap_pode_ler(clinica_id));

drop policy if exists "sap ler metricas" on public.sap_metricas_diarias;
create policy "sap ler metricas" on public.sap_metricas_diarias
  for select to authenticated using (public.sap_pode_ler(clinica_id));

drop policy if exists "sap ler metas" on public.sap_metas;
create policy "sap ler metas" on public.sap_metas
  for select to authenticated using (public.sap_pode_ler(clinica_id));
