-- Status que não mente (auditoria de confiabilidade de 01/11/2026).
--
-- 1. sync_status_contas: a leitura de CADA conta de anúncios por CADA via (Graph e Windsor). O status de anúncios do
--    cliente passa a ser a junção de todas as contas ativas dele (api/_lib/anuncios-status.ts): "ok" só quando toda
--    conta foi lida por inteiro. Antes bastava uma conta trazer linha, a Windsor gravava sempre "sem erro" e o motivo
--    de conta parada era sobrescrito pela outra conta do mesmo cliente (Dra. Lana, HOMS, Dra. Glauce).
-- 2. sync_status.precisa_reconferir: quantas linhas de dia passado com gasto > 0 a origem devolveu zeradas e o sync
--    NÃO regravou (caso do dia 21/09 zerado em 4 clientes). Alguém precisa conferir na origem.
-- 3. sync_status_geral: integrações da conta inteira, sem cliente. Começa com o Short.io, cuja falha não ficava
--    registrada em lugar nenhum.
-- 4. client_sync_status: o WhatsApp passa a ler também as conversas (Kommo, Clint, FlwChat, Digisac), como
--    fontes_base/status_das_fontes já fazem desde 20261029160000. Antes 8 clientes com conversas chegando todo dia
--    viam "WhatsApp: sem dado" no cabeçalho. Mesma assinatura.
--
-- Não destrutiva: só cria tabela, adiciona coluna e recria a função com a mesma assinatura.
-- Reversão: recriar client_sync_status pela definição de 20261013230000 (atendimento só por wts_sessions);
--           as tabelas novas e a coluna podem ficar (o código antigo não as lê).

alter table public.sync_status add column if not exists precisa_reconferir integer not null default 0;

create table if not exists public.sync_status_contas (
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id text not null,
  via text not null check (via in ('graph', 'windsor')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_rows integer,
  precisa_reconferir integer not null default 0,
  motivo text,
  motivo_dono text,
  updated_at timestamptz not null default now(),
  primary key (client_id, ad_account_id, via)
);

alter table public.sync_status_contas enable row level security;
revoke all on table public.sync_status_contas from public, anon, authenticated;
grant select on table public.sync_status_contas to authenticated;
grant select, insert, update, delete on table public.sync_status_contas to service_role;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sync_status_contas'
                   and policyname = 'membro ou admin le sync_status_contas') then
    create policy "membro ou admin le sync_status_contas" on public.sync_status_contas
      for select to authenticated
      using (public.is_app_admin() or public.is_client_member(client_id));
  end if;
end $pol$;

create table if not exists public.sync_status_geral (
  fonte text primary key check (fonte in ('shortio')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_rows integer,
  updated_at timestamptz not null default now()
);

alter table public.sync_status_geral enable row level security;
revoke all on table public.sync_status_geral from public, anon, authenticated;
grant select on table public.sync_status_geral to authenticated;
grant select, insert, update, delete on table public.sync_status_geral to service_role;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sync_status_geral'
                   and policyname = 'admin le sync_status_geral') then
    create policy "admin le sync_status_geral" on public.sync_status_geral
      for select to authenticated
      using (public.is_app_admin());
  end if;
end $pol$;

create or replace function public.client_sync_status(p_client_id uuid)
returns table(fonte text, last_attempt_at timestamptz, last_success_at timestamptz, last_error text, last_rows integer,
  data_ate date, motivo text, motivo_dono text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ig date; v_ig_posts date; v_ads date; v_crm date; v_wts date; v_conv date;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then return; end if;
  select max(date) into v_ig from instagram_account_daily_metrics where client_id = p_client_id and reach is not null;
  select max(metrics_updated_at)::date into v_ig_posts from instagram_posts where client_id = p_client_id;
  if v_ig is not null and v_ig_posts is not null then v_ig := least(v_ig, v_ig_posts);
  else v_ig := coalesce(v_ig, v_ig_posts); end if;
  select coalesce(
    (select max(date) from meta_ads_daily where client_id = p_client_id),
    (select max(analise_em) from ads_planilha_semanal where client_id = p_client_id and analise_em <= current_date)
  ) into v_ads;
  select max(coalesce(occurred_at, received_at))::date into v_crm from crm_leads where client_id = p_client_id;
  -- WhatsApp: WTS ou qualquer conversa gravada (mesma regra de fontes_base).
  select max(started_at)::date into v_wts from wts_sessions where client_id = p_client_id;
  select max(ultima_msg_em)::date into v_conv from conversas where client_id = p_client_id;
  v_wts := greatest(v_wts, v_conv);
  return query
  select f.fonte, s.last_attempt_at, s.last_success_at, s.last_error, s.last_rows,
         case f.fonte when 'instagram' then v_ig when 'anuncios' then v_ads when 'crm' then v_crm when 'atendimento' then v_wts else s.last_success_at::date end,
         s.motivo, s.motivo_dono
  from (values ('instagram'),('comentarios'),('anuncios'),('crm'),('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = p_client_id and s.fonte = f.fonte;
end;
$function$;
revoke all on function public.client_sync_status(uuid) from public, anon;
grant execute on function public.client_sync_status(uuid) to authenticated, service_role;
