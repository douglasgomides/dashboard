-- Reconciliação repositório × produção (conferência de 20/10/2026, scripts/banco/comparar.ts).
-- Traz para o repositório o que existia só em produção, criado à mão antes de as migrações passarem pelo CI, para que
-- o esquema remontado do repositório seja igual ao de produção. Tudo idempotente: em produção não muda nada além de
-- (1) o search_path de prova_resultado, alinhado ao do repositório, e (2) a remoção da função de teste plano_teste_x.
-- A correção de acesso de onb_submissions (leitura e edição só para admin) já foi aplicada em produção em 20/10/2026.
-- Reversão: as tabelas e funções abaixo já existiam em produção; não há o que reverter além do search_path
--   (alter function public.prova_resultado(uuid, integer) set search_path = public).

-- Formulário público de entrada das clínicas (o envio é anônimo; ler e editar, só a equipe).
create table if not exists public.onb_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  clinic_name text, contact_name text, email text, role text, specialty text, city text,
  status text default 'Formulário recebido',
  answers jsonb not null default '{}',
  checklist jsonb not null default '{}',
  internal_notes text, telefone text, link_grupo text, link_sistema text,
  docs jsonb not null default '{}',
  relatorio_diagnostico text,
  docs_done jsonb not null default '{}',
  checklist_pre jsonb, ficha_baseline jsonb
);
create index if not exists onb_submissions_created_idx on public.onb_submissions (created_at desc);
alter table public.onb_submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'onb_submissions' and policyname = 'onb_insert_anyone') then
    create policy onb_insert_anyone on public.onb_submissions for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'onb_submissions' and policyname = 'onb_select_auth') then
    create policy onb_select_auth on public.onb_submissions for select to authenticated using (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'onb_submissions' and policyname = 'onb_update_auth') then
    create policy onb_update_auth on public.onb_submissions for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
  end if;
end $$;
alter policy onb_select_auth on public.onb_submissions using (public.is_app_admin());
alter policy onb_update_auth on public.onb_submissions using (public.is_app_admin()) with check (public.is_app_admin());
revoke delete on public.onb_submissions from anon, authenticated;

-- Respostas da campanha de perfilamento (sincronizadas com o Brevo pelo servidor; sem acesso pelo navegador).
create table if not exists public.perfil_respostas (
  id bigint generated always as identity primary key,
  email text not null,
  perfil text not null,
  origem text default 'campanha-perfilamento',
  synced_brevo boolean default false,
  created_at timestamptz default now(),
  brevo_status integer,
  brevo_resp text
);
create index if not exists perfil_respostas_email_idx on public.perfil_respostas (lower(email));
alter table public.perfil_respostas enable row level security;
revoke all on public.perfil_respostas from anon, authenticated;

-- Contatos do Kommo aplicados em lote nos leads (só o servidor).
create or replace function public.aplicar_contatos_kommo(p_conn uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $function$
declare n integer;
begin
  update public.crm_leads l
  set contact_phone = coalesce(nullif(x.phone, ''), l.contact_phone),
      contact_email = coalesce(nullif(x.email, ''), l.contact_email),
      contact_name  = coalesce(nullif(x.nome, ''), l.contact_name)
  from jsonb_to_recordset(p_linhas) as x(id text, phone text, email text, nome text)
  where l.crm_connection_id = p_conn and l.external_lead_id = x.id;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.aplicar_contatos_kommo(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_contatos_kommo(uuid, jsonb) to service_role;

-- Tempo de resposta por conversa (versão anterior, mantida para telas abertas; a atual é leitura_conversas).
create or replace function public.conversas_leitura(p_client uuid, p_limite integer default 200)
returns table(conversa_id uuid, msgs_paciente bigint, msgs_clinica bigint, primeira_resposta_seg integer, mediana_resposta_comercial_seg integer, maior_espera_seg integer, esperas_longas integer, vezes_paciente integer, ultima_de text, ultima_msg_em timestamptz, aguardando_seg integer, lead_etapa text, lead_resultado text)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with conv as (
    select c.id, c.lead_id from conversas c
    where c.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
    order by c.ultima_msg_em desc nulls last
    limit least(coalesce(p_limite, 200), 500)
  ),
  m as (
    select m.conversa_id, m.direcao, m.enviada_em, lag(m.direcao) over (partition by m.conversa_id order by m.enviada_em, m.id) as dir_ant
    from mensagens m join conv on conv.id = m.conversa_id
    where m.direcao in ('entrada', 'saida')
  ),
  vezes as (
    select v.conversa_id, v.enviada_em as inicio,
      (select min(s.enviada_em) from mensagens s where s.conversa_id = v.conversa_id and s.direcao = 'saida' and s.enviada_em > v.enviada_em) as resposta,
      row_number() over (partition by v.conversa_id order by v.enviada_em) as n,
      (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') between 1 and 5 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 17)
      or (extract(isodow from v.enviada_em at time zone 'America/Sao_Paulo') = 6 and extract(hour from v.enviada_em at time zone 'America/Sao_Paulo') between 8 and 11) as comercial
    from m v where v.direcao = 'entrada' and v.dir_ant is distinct from 'entrada'
  ),
  esperas as (select conversa_id, n, comercial, extract(epoch from resposta - inicio)::int as seg from vezes where resposta is not null),
  ult as (select distinct on (conversa_id) conversa_id, direcao, enviada_em from m order by conversa_id, enviada_em desc)
  select conv.id,
    (select count(*) from m where m.conversa_id = conv.id and m.direcao = 'entrada'),
    (select count(*) from m where m.conversa_id = conv.id and m.direcao = 'saida'),
    (select e.seg from esperas e where e.conversa_id = conv.id and e.n = 1),
    (select percentile_cont(0.5) within group (order by e.seg)::int from esperas e where e.conversa_id = conv.id and e.comercial),
    (select max(e.seg) from esperas e where e.conversa_id = conv.id),
    (select count(*)::int from esperas e where e.conversa_id = conv.id and e.seg > 3600),
    (select count(*)::int from vezes v where v.conversa_id = conv.id),
    case ult.direcao when 'entrada' then 'paciente' when 'saida' then 'clinica' end,
    ult.enviada_em,
    case when ult.direcao = 'entrada' then extract(epoch from now() - ult.enviada_em)::int end,
    (select cps.status_name from crm_leads cl left join crm_pipeline_statuses cps on cps.crm_connection_id = cl.crm_connection_id and cps.pipeline_id = cl.pipeline_id and cps.status_id = cl.status_id where cl.id = conv.lead_id limit 1),
    (select cl.outcome from crm_leads cl where cl.id = conv.lead_id)
  from conv left join ult on ult.conversa_id = conv.id;
$function$;
revoke all on function public.conversas_leitura(uuid, integer) from public, anon;
grant execute on function public.conversas_leitura(uuid, integer) to authenticated, service_role;

-- Situação das fontes de todas as clínicas (admin ou servidor).
create or replace function public.status_fontes_clientes()
returns table(client_id uuid, fonte text, cadastro boolean, data_ate date, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with c as (
    select id from clients
    where active and (public.is_app_admin() or auth.uid() is null)
  ),
  d as (
    select c.id,
      (select case when a is not null and b is not null then least(a, b) else coalesce(a, b) end
         from (select (select max(date) from instagram_account_daily_metrics m where m.client_id = c.id and m.reach is not null) a,
                      (select max(metrics_updated_at)::date from instagram_posts p where p.client_id = c.id) b) x) as ig,
      coalesce((select max(date) from meta_ads_daily m where m.client_id = c.id),
               (select max(analise_em) from ads_planilha_semanal s where s.client_id = c.id and s.analise_em <= current_date)) as ads,
      (select max(coalesce(occurred_at, received_at))::date from crm_leads l where l.client_id = c.id) as crm,
      (select max(started_at)::date from wts_sessions w where w.client_id = c.id) as wts,
      exists (select 1 from instagram_accounts i where i.client_id = c.id and i.active) as tem_ig,
      exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.active)
        or exists (select 1 from clients x where x.id = c.id and coalesce(x.meta_ad_account_id, '') <> '') as tem_ads,
      exists (select 1 from crm_connections x where x.client_id = c.id and x.active) as tem_crm,
      exists (select 1 from clients x where x.id = c.id and x.wts_company_id is not null) as tem_wts
    from c
  )
  select d.id, f.fonte,
    case f.fonte when 'instagram' then d.tem_ig when 'anuncios' then d.tem_ads when 'crm' then d.tem_crm else d.tem_wts end,
    case f.fonte when 'instagram' then d.ig when 'anuncios' then d.ads when 'crm' then d.crm else d.wts end,
    s.last_error, s.motivo, s.motivo_dono,
    exists (select 1 from fontes_nao_usadas n where n.client_id = d.id and n.fonte = f.fonte)
  from d
  cross join (values ('instagram'), ('anuncios'), ('crm'), ('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = d.id and s.fonte = f.fonte;
$function$;
revoke all on function public.status_fontes_clientes() from public, anon;
grant execute on function public.status_fontes_clientes() to authenticated, service_role;

-- Alinhamentos: search_path igual ao do repositório e remoção da função de teste do plano da semana.
alter function public.prova_resultado(uuid, integer) set search_path = public, pg_temp;
drop function if exists public.plano_teste_x(uuid);
