-- Prontidão de segurança reconciliada após PR169 + 20261022170000. HOMOLOGAÇÃO SOMENTE.
-- Projeto obrigatório no MCP: tezpmowkupeoabzzbxpf. NUNCA executar em produção.
-- O nome do banco (postgres) não identifica o projeto; o operador confere o project_id.
-- Aprovações positivas PR169 pertencem a operacao_verificavel.sql (39 cenários).
-- No cloud/API calls; no production data or real identities are used.
-- Run as the branch database owner with permission to SET ROLE.
-- Supabase auth.uid()/auth.jwt() and roles are USED, never redefined here.
-- JWT claims are simulated at the PostgreSQL boundary, not signed Auth tokens.
-- Expected permission failures are captured as SQLSTATEs, not swallowed.
-- Every successful check rolls its writes back in a PL/pgSQL subtransaction.
-- All fixtures, temporary helpers and temporary default changes roll back.
-- Public nextval defaults use a temporary negative counter during this batch:
-- PostgreSQL sequences are not transactional and must not be consumed.
-- The ONLY result SELECT is immediately before the final ROLLBACK; MCP retains it.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local idle_in_transaction_session_timeout = '120s';
set local row_security = on;
do $claims$ begin
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
end $claims$;

create temporary table codex_hosted_checks (
  ordinal integer not null, name text not null, passed boolean not null,
  expected_state text, observed_state text, assertion_error text
) on commit drop;
create temporary table codex_hosted_counter (value bigint not null) on commit drop;
insert into codex_hosted_counter values (-9000000000100);
create temporary table codex_hosted_sequences (
  schema_name text, sequence_name text, before_value bigint, before_called boolean
) on commit drop;

create function pg_temp.codex_fixture_id() returns bigint
language sql volatile security definer set search_path = pg_temp, pg_catalog
as $id$ update pg_temp.codex_hosted_counter set value=value-1 returning value $id$;

-- Fail before inserting fixtures if an unreviewed trigger can make external
-- calls or invoke a sequence explicitly. Ordinary sequence DEFAULTs are replaced.
do $guard$
declare r record; v bigint; called boolean;
begin
  assert current_user in ('postgres','supabase_admin'), 'Run only as the homologation database owner';
  assert to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null, 'Real Supabase Auth helpers are required';
  assert not exists(select 1 from public.clients where id::text like 'fefec0de-%'), 'Fixture namespace already exists; do not overwrite it';
  assert not exists(select 1 from auth.users where id::text like 'fefec0de-%'), 'Fixture auth namespace already exists; do not overwrite it';
  -- IDENTITY conhecido: perfil_respostas.id e operacao_historico.id (PR169).
  -- Esta suíte não insere nessas tabelas nem chama seus fluxos. As sequências
  -- permanecem incluídas na comparação before/after; qualquer consumo falha.
  assert not exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attidentity<>'' and not(c.relname in ('perfil_respostas','operacao_historico') and a.attname='id')), 'Review new identity columns before testing without sequence consumption';
  assert not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and (t.tgrelid in ('auth.users'::regclass) or t.tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace))
      and p.prosrc ~* '(net\s*\.|http_(post|get|request)|dblink|nextval\s*\(|setval\s*\()'
  ), 'Review side-effecting triggers before running fixtures';
  for r in select schemaname,sequencename from pg_sequences where schemaname='public' loop
    execute format('select last_value,is_called from %I.%I',r.schemaname,r.sequencename) into v,called;
    insert into pg_temp.codex_hosted_sequences values (r.schemaname,r.sequencename,v,called);
  end loop;
  for r in
    select c.oid::regclass as rel,a.attname from pg_attrdef d
    join pg_class c on c.oid=d.adrelid join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
    where c.relnamespace='public'::regnamespace and pg_get_expr(d.adbin,d.adrelid) ~ '^nextval\('
  loop execute format('alter table %s alter column %I set default pg_temp.codex_fixture_id()',r.rel,r.attname); end loop;
end $guard$;

create function pg_temp.codex_hosted_check(
  p_name text, p_role text, p_user uuid, p_sql text, p_expected jsonb,
  p_state text default null, p_extra jsonb default '{}'::jsonb, p_post_sql text default null
) returns void language plpgsql security invoker
as $check$
declare actual jsonb; observed text; ok boolean := false; post_ok boolean; detail text;
begin
  assert p_role in ('postgres','anon','authenticated','service_role'), 'Unexpected test role';
  perform set_config('request.jwt.claims', (p_extra || jsonb_build_object('role',p_role) || case when p_user is null then '{}'::jsonb else jsonb_build_object('sub',p_user) end)::text, true);
  perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
  perform set_config('request.jwt.claim.role',p_role,true);
  execute format('set local role %I',p_role);
  begin
    execute p_sql into actual;
    if p_state is not null then raise exception using errcode='CZ002',message='Expected SQLSTATE was not raised'; end if;
    if actual is distinct from p_expected then raise exception using errcode='CZ002',message='Observed result did not match expected assertion'; end if;
    if p_post_sql is not null then
      reset role;
      execute p_post_sql into post_ok;
      if post_ok is distinct from true then raise exception using errcode='CZ002',message='Postcondition did not hold'; end if;
    end if;
    ok := true;
    -- A controlled exception rolls back successful DML/RPC audit writes too.
    raise exception using errcode='CZ001',message='codex check rollback';
  exception
    when sqlstate 'CZ001' then null;
    when others then
      get stacked diagnostics observed=returned_sqlstate,detail=message_text;
      ok := p_state is not null and observed=p_state;
  end;
  reset role;
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','',true);
  insert into pg_temp.codex_hosted_checks
    select count(*)+1,p_name,ok,p_state,observed,
      case when ok then null else left(coalesce(detail,'Assertion did not hold'),180) end
    from pg_temp.codex_hosted_checks;
end $check$;

-- Fixtures: two tenants, an editor who belongs to BOTH, a viewer in A only,
-- an outsider, and an app admin. All identities are fictional and have no login.
insert into auth.users(id,email) values ('fefec0de-0000-4000-8000-000000000003','editor@codex-hosted.example.test');
insert into auth.users(id,email) values ('fefec0de-0000-4000-8000-000000000004','viewer@codex-hosted.example.test');
insert into auth.users(id,email) values ('fefec0de-0000-4000-8000-000000000005','outsider@codex-hosted.example.test');
insert into auth.users(id,email) values ('fefec0de-0000-4000-8000-000000000006','admin@codex-hosted.example.test');
insert into public.app_admins(user_id) values ('fefec0de-0000-4000-8000-000000000006');
insert into public.clients(id,name,wts_api_token,digisac_token,active) values ('fefec0de-0000-4000-8000-000000000001','CODEX HOSTED FIXTURE A','fixture-wts','fixture-digisac',false);
insert into public.instagram_accounts(id,client_id,windsor_account_id) values ('fefec0de-0000-4000-8000-000000000010','fefec0de-0000-4000-8000-000000000001','codex-fixture-A');
insert into public.instagram_posts(id,client_id,instagram_account_id,windsor_media_id,reach,caption) values ('fefec0de-0000-4000-8000-000000000020','fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000010','codex-fixture-A',100,'Fictional public caption');
insert into public.crm_connections(id,client_id,provider,access_token,webhook_secret) values ('fefec0de-0000-4000-8000-000000000030','fefec0de-0000-4000-8000-000000000001','kommo','fixture-token','fixture-secret');
insert into public.pessoas(id,client_id,nome,telefone,email) values ('fefec0de-0000-4000-8000-000000000040','fefec0de-0000-4000-8000-000000000001','Fixture Person A','+55 85 99999-1234','person-a@codex-hosted.example.test');
insert into public.crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,raw_payload,pessoa_id,occurred_at) values ('fefec0de-0000-4000-8000-000000000060','fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000030','kommo','codex-fixture-A','add','won',500,'{}','fefec0de-0000-4000-8000-000000000040',now());
insert into public.conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em) values ('fefec0de-0000-4000-8000-000000000050','fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000040','wts','codex-fixture-A',now(),now());
insert into public.mensagens(id,conversa_id,client_id,direcao,texto,enviada_em,externo_id) values ('fefec0de-0000-4000-8000-000000000120','fefec0de-0000-4000-8000-000000000050','fefec0de-0000-4000-8000-000000000001','entrada','Fictional message A',now(),'codex-fixture-A');
insert into public.links_rastreados(id,client_id,codigo_ref,tipo,destino_url) values ('fefec0de-0000-4000-8000-000000000070','fefec0de-0000-4000-8000-000000000001','codex-fixture-A','bio','https://example.test');
insert into public.agente_execucoes(id,client_id,agente,fluxo,objetivo) values ('fefec0de-0000-4000-8000-000000000080','fefec0de-0000-4000-8000-000000000001','fixture','fixture','Fictional test workflow');
insert into public.sap_clinicas(id,client_id,nome) values ('fefec0de-0000-4000-8000-000000000090','fefec0de-0000-4000-8000-000000000001','Fictional clinic A');
insert into public.meta_ads_campaigns(client_id,ad_account_id,campaign_id,name) values ('fefec0de-0000-4000-8000-000000000001','act-codex-fixture-A','codex-fixture-A','Fictional campaign');
insert into public.meta_ads_daily(client_id,ad_account_id,campaign_id,date,spend) values ('fefec0de-0000-4000-8000-000000000001','act-codex-fixture-A','codex-fixture-A',current_date,10);
insert into public.cliente_modulos(client_id,modulo,status) values ('fefec0de-0000-4000-8000-000000000001','brand_brain','beta');
insert into public.clients(id,name,wts_api_token,digisac_token,active) values ('fefec0de-0000-4000-8000-000000000002','CODEX HOSTED FIXTURE B','fixture-wts','fixture-digisac',false);
insert into public.instagram_accounts(id,client_id,windsor_account_id) values ('fefec0de-0000-4000-8000-000000000011','fefec0de-0000-4000-8000-000000000002','codex-fixture-B');
insert into public.instagram_posts(id,client_id,instagram_account_id,windsor_media_id,reach,caption) values ('fefec0de-0000-4000-8000-000000000021','fefec0de-0000-4000-8000-000000000002','fefec0de-0000-4000-8000-000000000011','codex-fixture-B',100,'Fictional public caption');
insert into public.crm_connections(id,client_id,provider,access_token,webhook_secret) values ('fefec0de-0000-4000-8000-000000000031','fefec0de-0000-4000-8000-000000000002','kommo','fixture-token','fixture-secret');
insert into public.pessoas(id,client_id,nome,telefone,email) values ('fefec0de-0000-4000-8000-000000000041','fefec0de-0000-4000-8000-000000000002','Fixture Person B','+55 85 99999-1234','person-b@codex-hosted.example.test');
insert into public.crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,raw_payload,pessoa_id,occurred_at) values ('fefec0de-0000-4000-8000-000000000061','fefec0de-0000-4000-8000-000000000002','fefec0de-0000-4000-8000-000000000031','kommo','codex-fixture-B','add','won',500,'{}','fefec0de-0000-4000-8000-000000000041',now());
insert into public.conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em) values ('fefec0de-0000-4000-8000-000000000051','fefec0de-0000-4000-8000-000000000002','fefec0de-0000-4000-8000-000000000041','wts','codex-fixture-B',now(),now());
insert into public.mensagens(id,conversa_id,client_id,direcao,texto,enviada_em,externo_id) values ('fefec0de-0000-4000-8000-000000000121','fefec0de-0000-4000-8000-000000000051','fefec0de-0000-4000-8000-000000000002','entrada','Fictional message B',now(),'codex-fixture-B');
insert into public.links_rastreados(id,client_id,codigo_ref,tipo,destino_url) values ('fefec0de-0000-4000-8000-000000000071','fefec0de-0000-4000-8000-000000000002','codex-fixture-B','bio','https://example.test');
insert into public.agente_execucoes(id,client_id,agente,fluxo,objetivo) values ('fefec0de-0000-4000-8000-000000000081','fefec0de-0000-4000-8000-000000000002','fixture','fixture','Fictional test workflow');
insert into public.sap_clinicas(id,client_id,nome) values ('fefec0de-0000-4000-8000-000000000091','fefec0de-0000-4000-8000-000000000002','Fictional clinic B');
insert into public.meta_ads_campaigns(client_id,ad_account_id,campaign_id,name) values ('fefec0de-0000-4000-8000-000000000002','act-codex-fixture-B','codex-fixture-B','Fictional campaign');
insert into public.meta_ads_daily(client_id,ad_account_id,campaign_id,date,spend) values ('fefec0de-0000-4000-8000-000000000002','act-codex-fixture-B','codex-fixture-B',current_date,10);
insert into public.cliente_modulos(client_id,modulo,status) values ('fefec0de-0000-4000-8000-000000000002','brand_brain','beta');
insert into public.client_members(client_id,user_id,role) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000003','strategist'),('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000004','viewer'),('fefec0de-0000-4000-8000-000000000002','fefec0de-0000-4000-8000-000000000003','strategist');
insert into public.content_angle_suggestions(id,client_id,rationale) values ('fefec0de-0000-4000-8000-000000000110','fefec0de-0000-4000-8000-000000000001','Fictional rationale');
insert into public.toques(id,client_id,pessoa_id,tipo,instagram_post_id,link_id,ocorreu_em,fonte,externo_id) values ('fefec0de-0000-4000-8000-000000000131','fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000040','comentario','fefec0de-0000-4000-8000-000000000020','fefec0de-0000-4000-8000-000000000070',now(),'instagram','codex-fixture-1');
insert into public.toques(id,client_id,pessoa_id,tipo,instagram_post_id,link_id,ocorreu_em,fonte,externo_id) values ('fefec0de-0000-4000-8000-000000000132','fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000040','comentario','fefec0de-0000-4000-8000-000000000020','fefec0de-0000-4000-8000-000000000070',now(),'instagram','codex-fixture-2');

-- Guarda a definição de TODAS as funções public/Auth, sem exibir seus corpos.
-- Não se redefine auth.uid/jwt, is_app_admin, is_client_member ou qualquer helper global.
create temporary table codex_hosted_functions on commit drop as
  select p.oid,md5(pg_get_functiondef(p.oid)) as fingerprint
  from pg_proc p where p.pronamespace in ('public'::regnamespace,'auth'::regnamespace) and p.prokind='f';

-- Tabela temporária de mesmo nome reproduz o vetor de shadowing legado.
create temporary table crm_connections(client_id uuid,provider text,active boolean,created_at timestamptz) on commit drop;
insert into pg_temp.crm_connections values ('fefec0de-0000-4000-8000-000000000001','HIJACKED_FIXTURE',true,now());

do $tests$
begin
  perform pg_temp.codex_hosted_check('anon: real auth.uid and role context', 'anon', null::uuid, $sql$select to_jsonb(current_user::text = 'anon' and auth.uid() is null and auth.jwt()->>'role' = 'anon')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: real auth.uid and role context', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(current_user::text = 'authenticated' and auth.uid() is not distinct from 'fefec0de-0000-4000-8000-000000000004'::uuid and auth.jwt()->>'role' = 'authenticated')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: real auth.uid and role context', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$select to_jsonb(current_user::text = 'authenticated' and auth.uid() is not distinct from 'fefec0de-0000-4000-8000-000000000003'::uuid and auth.jwt()->>'role' = 'authenticated')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: real auth.uid and role context', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(current_user::text = 'authenticated' and auth.uid() is not distinct from 'fefec0de-0000-4000-8000-000000000006'::uuid and auth.jwt()->>'role' = 'authenticated')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('service_role: real auth.uid and role context', 'service_role', null::uuid, $sql$select to_jsonb(current_user::text = 'service_role' and auth.uid() is null and auth.jwt()->>'role' = 'service_role')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: public tables all use RLS', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: views use invoker rights', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind='v' and not coalesce(reloptions @> array['security_invoker=true'],false)))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: anon has no table privileges', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: anon has no public RPC access', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prokind='f' and has_function_privilege('anon',oid,'EXECUTE')))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: trusted definer search_path', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prosecdef and not coalesce(proconfig @> array['search_path=public, pg_temp'] or proconfig @> array['search_path=""'],false)))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: authenticated cannot truncate', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege('authenticated',oid,'TRUNCATE')))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: authenticated cannot create in public', 'postgres', null::uuid, $sql$select to_jsonb(not has_schema_privilege('authenticated','public','CREATE'))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('anon: deny client table', 'anon', null::uuid, $sql$select to_jsonb(count(*)) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('anon: deny ads view', 'anon', null::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('anon: deny reporting RPC', 'anon', null::uuid, $sql$select public.ads_resumo('fefec0de-0000-4000-8000-000000000001',current_date,current_date)$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: views isolate fixture tenants', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: views isolate fixture tenants', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '2'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('outsider: views isolate fixture tenants', 'authenticated', 'fefec0de-0000-4000-8000-000000000005'::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: views isolate fixture tenants', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '2'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('service_role: both fixture tenants', 'service_role', null::uuid, $sql$select to_jsonb(count(*)) from public.meta_ads_daily_v where client_id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '2'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: own client visible without secrets', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(name)) from public.clients where id in ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000002')$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('user_metadata cannot grant admin or membership', 'authenticated', 'fefec0de-0000-4000-8000-000000000005'::uuid, $sql$select to_jsonb(not public.is_app_admin() and not public.is_client_member('fefec0de-0000-4000-8000-000000000001'))$sql$, 'true'::jsonb, null, '{"user_metadata": {"is_admin": true, "role": "admin", "client_id": "fefec0de-0000-4000-8000-000000000001"}, "app_metadata": {}}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: CRM connection secrets hidden by RLS', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.crm_connections where id in ('fefec0de-0000-4000-8000-000000000030','fefec0de-0000-4000-8000-000000000031')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: cannot create CRM connection', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$with changed as (insert into public.crm_connections(id,client_id,provider) values ('fefec0de-0000-4000-8000-000000000301','fefec0de-0000-4000-8000-000000000001','kommo') returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: CRM connection secrets hidden by RLS', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$select to_jsonb(count(*)) from public.crm_connections where id in ('fefec0de-0000-4000-8000-000000000030','fefec0de-0000-4000-8000-000000000031')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot create CRM connection', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (insert into public.crm_connections(id,client_id,provider) values ('fefec0de-0000-4000-8000-000000000301','fefec0de-0000-4000-8000-000000000001','kommo') returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: client wts_api_token column denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(wts_api_token) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: client digisac_token column denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(digisac_token) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: ad account access_token denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(access_token) from public.client_ad_accounts where client_id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: client wts_api_token column denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(wts_api_token) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: client digisac_token column denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(digisac_token) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ad account access_token denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(access_token) from public.client_ad_accounts where client_id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: CRM credentials remain manageable', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(count(access_token)) from public.crm_connections where id in ('fefec0de-0000-4000-8000-000000000030','fefec0de-0000-4000-8000-000000000031')$sql$, '2'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: CRM configuration update allowed', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$with changed as (update public.crm_connections set subdomain='fixture' where id='fefec0de-0000-4000-8000-000000000030' returning id) select to_jsonb(count(*)) from changed$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('service_role: legacy client credential access retained', 'service_role', null::uuid, $sql$select to_jsonb(wts_api_token='fixture-wts' and digisac_token='fixture-digisac') from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: classification update changes zero rows', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$with changed as (update public.instagram_posts set tema='Forbidden' where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: suggestion update changes zero rows', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$with changed as (update public.content_angle_suggestions set status='accepted' where id='fefec0de-0000-4000-8000-000000000110' returning id) select to_jsonb(count(*)) from changed$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: classifies own post', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.instagram_posts set tema='Fixture classification' where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: updates suggestion status', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.content_angle_suggestions set status='accepted' where id='fefec0de-0000-4000-8000-000000000110' returning id) select to_jsonb(count(*)) from changed$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot mutate post reach', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.instagram_posts set reach=999 where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot mutate post client_id', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.instagram_posts set client_id='fefec0de-0000-4000-8000-000000000002' where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot mutate post account_id', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.instagram_posts set instagram_account_id='fefec0de-0000-4000-8000-000000000011' where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot mutate post caption', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.instagram_posts set caption='Forbidden' where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('editor: cannot replace suggestion rationale', 'authenticated', 'fefec0de-0000-4000-8000-000000000003'::uuid, $sql$with changed as (update public.content_angle_suggestions set rationale='Forbidden' where id='fefec0de-0000-4000-8000-000000000110' returning id) select to_jsonb(count(*)) from changed$sql$, 'true'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('service_role: metric sync permitted', 'service_role', null::uuid, $sql$with changed as (update public.instagram_posts set reach=200 where id='fefec0de-0000-4000-8000-000000000020' returning id) select to_jsonb(count(*)) from changed$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: raw messages unavailable', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.mensagens where conversa_id='fefec0de-0000-4000-8000-000000000050'$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: own messages via audited RPC', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.ler_mensagens('fefec0de-0000-4000-8000-000000000050')$sql$, '1'::jsonb, null, '{}'::jsonb, $post$select count(*)=1 from public.acessos_conversas where user_id='fefec0de-0000-4000-8000-000000000004' and client_id='fefec0de-0000-4000-8000-000000000001' and conversa_id='fefec0de-0000-4000-8000-000000000050' and acao='abrir'$post$);
  perform pg_temp.codex_hosted_check('viewer: foreign messages RPC empty', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.ler_mensagens('fefec0de-0000-4000-8000-000000000051')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: conversation page is bounded', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.listar_conversas('fefec0de-0000-4000-8000-000000000001',-1,-5)$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: foreign conversation list empty', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.listar_conversas('fefec0de-0000-4000-8000-000000000002',200,0)$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: person search tenant-isolated', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000002','Fixture')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: wildcard search not SQL wildcard', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','%_')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: person output redacts contact identifiers', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(r->'pessoa'->>'telefone_final'='…1234' and not (r->'pessoa' ? 'email') and not (r->'pessoa' ? 'telefone')) from (select public.jornada_pessoa('fefec0de-0000-4000-8000-000000000040') r) x$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: foreign person returns null', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(public.jornada_pessoa('fefec0de-0000-4000-8000-000000000041') is null)$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: duplicate interactions do not duplicate revenue', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb((r->>'receita')::numeric=500 and (r->'posts'->0->>'receita')::numeric=500 and (r->'links'->0->>'receita')::numeric=500) from (select public.jornada_resumo('fefec0de-0000-4000-8000-000000000001',current_date,current_date) r) x$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('service_role: enabled module permitted', 'service_role', null::uuid, $sql$select to_jsonb(public.tem_modulo('fefec0de-0000-4000-8000-000000000001','brand_brain'))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 01: instagram_posts rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.instagram_posts(client_id,instagram_account_id,windsor_media_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000011','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 02: instagram_account_daily_metrics rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.instagram_account_daily_metrics(client_id,instagram_account_id,date) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000011','2026-01-01')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 03: instagram_stories rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.instagram_stories(client_id,instagram_account_id,ig_media_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000011','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 04: instagram_comments rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.instagram_comments(client_id,instagram_post_id,external_comment_id,text) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000021','invalid','Fixture')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 05: crm_leads rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000031','kommo','invalid','add','{}'::jsonb)$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 06: crm_raw_events rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.crm_raw_events(client_id,crm_connection_id,event_key,raw_payload) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000031','invalid','{}'::jsonb)$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 07: crm_leads rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.crm_leads(client_id,crm_connection_id,pessoa_id,provider,external_lead_id,event_type,raw_payload) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000030','fefec0de-0000-4000-8000-000000000041','kommo','invalid','add','{}'::jsonb)$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 08: crm_lead_eventos rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.crm_lead_eventos(client_id,id,crm_connection_id,external_lead_id,tipo) values ('fefec0de-0000-4000-8000-000000000001',-9000000000001,'fefec0de-0000-4000-8000-000000000031','invalid','entrou')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 09: links_rastreados rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.links_rastreados(client_id,instagram_post_id,codigo_ref,tipo,destino_url) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000021','invalid','bio','https://example.test')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 10: toques rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.toques(client_id,pessoa_id,tipo,ocorreu_em,fonte,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000041','comentario','2026-01-01','fixture','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 11: toques rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.toques(client_id,link_id,tipo,ocorreu_em,fonte,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000071','clique_link','2026-01-01','fixture','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 12: toques rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.toques(client_id,instagram_post_id,tipo,ocorreu_em,fonte,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000021','comentario','2026-01-01','fixture','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 13: conversas rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.conversas(client_id,pessoa_id,provider,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000041','wts','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 14: conversas rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.conversas(client_id,lead_id,provider,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000061','wts','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 15: mensagens rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.mensagens(client_id,conversa_id,direcao,enviada_em,externo_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000051','entrada','2026-01-01','invalid')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 16: conversas_resumos rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.conversas_resumos(client_id,conversa_id,resumo) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000051','{}'::jsonb)$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 17: conversas_origem_anuncio rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.conversas_origem_anuncio(client_id,conversa_id) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000051')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 18: pautas_conteudo rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.pautas_conteudo(client_id,post_id,titulo,formato,objetivo) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000021','Fixture','reels','autoridade')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 19: aprovacoes rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.aprovacoes(client_id,execucao_id,passo,risco,resumo) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000081','invalid','medio','Fixture')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 20: ia_execucoes rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.ia_execucoes(client_id,id,execucao_id,finalidade,ok) values ('fefec0de-0000-4000-8000-000000000001',-9000000000002,'fefec0de-0000-4000-8000-000000000081','Fixture',true)$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FK 21: brain_itens rejects foreign parent', 'service_role', null::uuid, $sql$insert into public.brain_itens(client_id,execucao_id,memoria,chave,valor,fonte) values ('fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000081','identidade','invalid','Fixture','Fixture')$sql$, 'true'::jsonb, '23503', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('tenant FKs preserve optional SET NULL', 'service_role', null::uuid, $sql$with removed as (delete from public.pessoas where id='fefec0de-0000-4000-8000-000000000040' returning id) select to_jsonb(count(*)) from removed$sql$, '1'::jsonb, null, '{}'::jsonb, $post$select pessoa_id is null and client_id='fefec0de-0000-4000-8000-000000000001' from public.crm_leads where id='fefec0de-0000-4000-8000-000000000060'$post$);
  perform pg_temp.codex_hosted_check('tenant FKs preserve client cascading delete', 'service_role', null::uuid, $sql$with removed as (delete from public.clients where id='fefec0de-0000-4000-8000-000000000001' returning id) select to_jsonb(count(*)) from removed$sql$, '1'::jsonb, null, '{}'::jsonb, $post$select not exists(select 1 from public.conversas where client_id='fefec0de-0000-4000-8000-000000000001')$post$);
end $tests$;

do $current_contracts$
begin
  perform pg_temp.codex_hosted_check('catalog: effective credential/classification column grants', 'postgres', null::uuid, $sql$select to_jsonb(
  not has_column_privilege('authenticated','public.clients','digisac_url','SELECT')
  and has_column_privilege('authenticated','public.clients','ticket_medio','SELECT')
  and not has_column_privilege('authenticated','public.instagram_posts','reach','UPDATE')
  and not has_column_privilege('authenticated','public.instagram_posts','client_id','UPDATE')
  and has_column_privilege('authenticated','public.instagram_posts','tema','UPDATE')
  and not has_column_privilege('authenticated','public.content_angle_suggestions','rationale','UPDATE')
  and has_column_privilege('authenticated','public.content_angle_suggestions','status','UPDATE'))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: no explicit anon column grants survive', 'postgres', null::uuid, $sql$select to_jsonb(not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind in('r','p','v') and has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: temporary table cannot shadow crm_provider', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select to_jsonb(public.crm_provider('fefec0de-0000-4000-8000-000000000001')='kommo')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: internal Digisac URL denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(digisac_url) from public.clients where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'null'::jsonb, '42501', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: ticket metadata remains readable', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.clients where id='fefec0de-0000-4000-8000-000000000001' and ticket_medio is null$sql$, '1'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: ticket RPC denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001',100.25)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('outsider: ticket RPC denied', 'authenticated', 'fefec0de-0000-4000-8000-000000000005'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001',100.25)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ticket rejects 0', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','0'::numeric)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ticket rejects -1', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','-1'::numeric)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ticket rejects NaN', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','NaN'::numeric)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ticket rejects Infinity', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','Infinity'::numeric)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: ticket rejects -Infinity', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','-Infinity'::numeric)$sql$, 'null'::jsonb, 'P0001', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: malformed numeric ticket rejected', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001','not-a-ticket'::numeric)$sql$, 'null'::jsonb, '22P02', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('admin: decimal ticket retained exactly', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$with action as materialized(select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001',100.25)) select to_jsonb(count(*)) from action$sql$, '1'::jsonb, null, '{}'::jsonb, $post$select ticket_medio=100.25 from public.clients where id='fefec0de-0000-4000-8000-000000000001'$post$);
  perform pg_temp.codex_hosted_check('admin: null ticket accepted', 'authenticated', 'fefec0de-0000-4000-8000-000000000006'::uuid, $sql$with action as materialized(select public.definir_ticket_cliente('fefec0de-0000-4000-8000-000000000001',null)) select to_jsonb(count(*)) from action$sql$, '1'::jsonb, null, '{}'::jsonb, $post$select ticket_medio is null from public.clients where id='fefec0de-0000-4000-8000-000000000001'$post$);
  perform pg_temp.codex_hosted_check('service_role: finite ticket constraint cannot be bypassed', 'service_role', null::uuid, $sql$update public.clients set ticket_medio='NaN'::numeric where id='fefec0de-0000-4000-8000-000000000001'$sql$, 'null'::jsonb, '23514', '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('catalog: search accepts known hosted or bootstrap contract', 'postgres', null::uuid, $sql$select to_jsonb(pg_get_function_result('public.buscar_pessoas(uuid,text)'::regprocedure) in ('TABLE(id uuid, nome text, ig_username text, telefone_final text, origem text)','TABLE(id uuid, nome text, telefone_final text, ig_username text)'))$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: search rejects empty', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: search rejects one character', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','x')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: search rejects over 100 characters', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: short phone fragments are not searchable', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','123')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: phone search masks returned identifier', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)=1 and bool_and(telefone_final='…1234')) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','1234')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('outsider: search does not disclose fixture people', 'authenticated', 'fefec0de-0000-4000-8000-000000000005'::uuid, $sql$select to_jsonb(count(*)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','Fixture')$sql$, '0'::jsonb, null, '{}'::jsonb, null);
end $current_contracts$;

-- Positive literal match plus a nonmatching person prevents a wildcard false positive.
insert into public.pessoas(id,client_id,nome,ig_username,telefone)
 values ('fefec0de-0000-4000-8000-000000000042','fefec0de-0000-4000-8000-000000000001','Literal %_ synthetic person','fixture_literal_handle','+55 85 99999-4321');
insert into public.conversas_resumos(conversa_id,client_id,resumo)
 values ('fefec0de-0000-4000-8000-000000000050','fefec0de-0000-4000-8000-000000000001','{"recuperavel":"talvez","comercial":"inválido"}');
-- A baseline won lead of 500 + five finite prices => numeric median 350.
-- Nonfinite historical CRM values must not enter the ticket median or JSON.
insert into public.crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,raw_payload,occurred_at)
 select 'fefec0de-0000-4000-8000-000000000001','fefec0de-0000-4000-8000-000000000030','kommo','codex-numeric-'||v.n,'add','won',v.price::numeric,'{}',now()
 from (values('1','100'),('2','200'),('3','300'),('4','400'),('5','500'),('6','NaN'),('7','Infinity'),('8','-Infinity')) v(n,price);

do $literal_and_revenue$
begin
  perform pg_temp.codex_hosted_check('viewer: literal wildcard characters match only their literal row', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)=1 and bool_and(id='fefec0de-0000-4000-8000-000000000042'::uuid)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','%_')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: trimmed handle search strips leading at sign', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(count(*)=1 and bool_and(id='fefec0de-0000-4000-8000-000000000042'::uuid)) from public.buscar_pessoas('fefec0de-0000-4000-8000-000000000001','  @fixture_literal_handle  ')$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: malformed JSON boolean and nonfinite CRM yield finite aggregate', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(r= '{"recuperaveis":0,"ticket":350,"fonte_ticket":"crm","vendas_crm":6,"valor":0}'::jsonb) from(select public.receita_em_jogo('fefec0de-0000-4000-8000-000000000001',current_date,current_date) r)x$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('viewer: foreign revenue RPC returns null', 'authenticated', 'fefec0de-0000-4000-8000-000000000004'::uuid, $sql$select to_jsonb(public.receita_em_jogo('fefec0de-0000-4000-8000-000000000002',current_date,current_date) is null)$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
  perform pg_temp.codex_hosted_check('outsider: revenue RPC returns null', 'authenticated', 'fefec0de-0000-4000-8000-000000000005'::uuid, $sql$select to_jsonb(public.receita_em_jogo('fefec0de-0000-4000-8000-000000000001',current_date,current_date) is null)$sql$, 'true'::jsonb, null, '{}'::jsonb, null);
end $literal_and_revenue$;

-- Reading sequence state does not advance it. The temporary default changes
-- above must prevent every fixture/trigger/RPC from consuming a public sequence.
do $sequences$
declare r record; v bigint; called boolean; stable boolean := true;
begin
  for r in select * from pg_temp.codex_hosted_sequences loop
    execute format('select last_value,is_called from %I.%I',r.schema_name,r.sequence_name) into v,called;
    stable := stable and v is not distinct from r.before_value and called is not distinct from r.before_called;
  end loop;
  insert into pg_temp.codex_hosted_checks
    select count(*)+1,'sequence state unchanged',stable,null,null,
      case when stable then null else 'A public sequence changed; stop and inspect' end
    from pg_temp.codex_hosted_checks;
end $sequences$;

do $global_helpers$
begin
  insert into pg_temp.codex_hosted_checks
    select count(*)+1,'global public/Auth function definitions unchanged',
      not exists(select 1 from pg_temp.codex_hosted_functions f left join pg_proc p on p.oid=f.oid
        where p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from f.fingerprint),
      null,null,null from pg_temp.codex_hosted_checks;
end $global_helpers$;

do $complete$ begin
  assert (select count(*) from pg_temp.codex_hosted_checks)=109, 'Incomplete prontidao_seguranca suite';
end $complete$;

select jsonb_build_object(
  'suite','prontidao_seguranca', 'intended_branch','tezpmowkupeoabzzbxpf',
  'required_delta','20261022170000', 'database',current_database(),
  'auth_helpers','real Supabase Auth; PostgreSQL JWT context simulated',
  'fixtures','fictional; namespace fefec0de-', 'rollback_required',true,
  'expected_checks',109, 'checks',count(*), 'passed',count(*) filter(where passed),
  'failed',count(*) filter(where not passed), 'ok',bool_and(passed) and count(*)=109,
  'failures',coalesce(jsonb_agg(jsonb_build_object('name',name,'expected_state',expected_state,
    'observed_state',observed_state,'error',assertion_error) order by ordinal) filter(where not passed),'[]'::jsonb),
  'results',jsonb_agg(jsonb_build_object('name',name,'passed',passed,'expected_state',expected_state,
    'observed_state',observed_state) order by ordinal)
) as prontidao_seguranca_report from pg_temp.codex_hosted_checks;
rollback;
