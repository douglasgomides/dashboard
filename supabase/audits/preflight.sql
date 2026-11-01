-- Preflight do Dashboard para homologação. SOMENTE LEITURA.
-- Execute o arquivo inteiro pelo SQL editor/psql com um papel de auditoria que
-- possa inspecionar o catálogo. Não precisa ler pacientes, payloads ou tokens.
-- Todos os resultados são metadados; nenhum corpo de função/policy é exibido.
-- O histórico é apenas detectado: sua ausência não interrompe a auditoria.
-- Não aplica migrações, não valida constraints e não executa as contagens geradas.
-- Em READ ONLY, qualquer tentativa acidental de escrever em tabelas persistentes
-- aborta. Os limites locais terminam com a transação.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

select 'environment' as section,
       current_database() as database_name,
       current_user as audit_role,
       session_user as session_role,
       current_setting('server_version') as server_version,
       current_setting('server_version_num')::integer as server_version_num,
       current_setting('server_version_num')::integer >= 150000 as supports_security_invoker,
       current_setting('transaction_read_only') as transaction_read_only,
       current_setting('transaction_isolation') as transaction_isolation,
       pg_is_in_recovery() as replica,
       r.rolsuper or r.rolbypassrls as audit_role_bypasses_rls
from pg_roles r where r.rolname = current_user;

-- Não presume que supabase_migrations existe, nem consulta statements (que
-- podem conter dados históricos). A consulta opcional retorna só versões.
with history as (
  select c.oid, n.nspname, c.relname,
         exists (select 1 from pg_attribute a where a.attrelid = c.oid
                 and a.attname = 'version' and a.attnum > 0 and not a.attisdropped) as has_version
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations' and c.relkind in ('r', 'p')
)
select 'migration_history' as section,
       exists (select 1 from history) as history_exists,
       coalesce((select has_version from history), false) as version_column_exists,
       (select format(
         'begin transaction read only; set local statement_timeout = ''30s''; set local row_security = off; select count(*) as recorded_versions, min(%I)::text as first_version, max(%I)::text as last_version, count(*) filter (where %I = %L) as latest_hardening_recorded from %I.%I; rollback;',
         'version', 'version', 'version', '20261022170000', nspname, relname)
        from history where has_version) as history_count_sql;

-- As 141 versões de migração têm três timestamps repetidos no histórico
-- anterior ao hardening. Atualize este manifesto se adicionar arquivos.
-- Uma linha por versão no Supabase não equivale a um
-- arquivo por versão; não exigir count(*)=133 nem reparar o histórico aqui.
select 'migration_manifest_note' as section,
       194 as repository_sql_files,
       190 as repository_distinct_versions,
       array['20261014120000', '20261018120000', '20261018130000']::text[] as historical_duplicate_versions,
       '20261102120000'::text as latest_repository_version;

-- Paths vazios são seguros nas RPCs recentes, que qualificam seus objetos.
-- Resumo para triagem. As sete contagens de falhas devem ser zero depois
-- das migrações; defaults futuros e constraints legadas têm seções próprias.
with relations as (
  select c.* from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
), functions as (
  select p.* from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
)
select 'security_summary' as section,
       (select count(*) from relations where relkind in ('r', 'p') and not relrowsecurity) as tables_without_rls,
       (select count(*) from relations where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')) as anonymous_relations,
       (select count(*) from relations where relkind = 'v' and not coalesce(reloptions @> array['security_invoker=true'], false)) as views_without_invoker,
       (select count(*) from functions where has_function_privilege('anon', oid, 'EXECUTE')) as anonymous_functions,
       (select count(*) from functions where prosecdef and not coalesce(proconfig @> array['search_path=public, pg_temp'] or proconfig @> array['search_path=""'], false)) as unsafe_definer_paths,
       (select count(*) from relations where relkind in ('r', 'p') and has_table_privilege('authenticated', oid, 'TRUNCATE')) as authenticated_truncate_tables;

-- Confere os contratos necessários sem executar funções de aplicação (algumas
-- RPCs de leitura gravam trilha de acesso e seriam proibidas em READ ONLY).
with expected(signature) as (values
  ('public.is_app_admin()'),
  ('public.is_client_member(uuid)'),
  ('public.pode_editar_acoes(uuid)'),
  ('public.tem_modulo(uuid,text)'),
  ('public.jornada_resumo(uuid)'),
  ('public.jornada_resumo(uuid,date,date)'),
  ('public.buscar_pessoas(uuid,text)'),
  ('public.jornada_pessoa(uuid)'),
  ('public.listar_conversas(uuid,integer,integer)'),
  ('public.ler_mensagens(uuid)'),
  ('public.brain_propor(uuid,jsonb,uuid)'),
  ('public.agentes_marcar_marco(uuid,uuid,integer,text)')
)
select 'required_function' as section, signature, to_regprocedure(signature) is not null as present
from expected order by signature;

-- Inventário e privilégios EFETIVOS: inclui grants herdados e por coluna.
select 'table_security' as section, n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') as anon_has_access,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE') as authenticated_can_truncate,
       has_table_privilege('authenticated', c.oid, 'TRIGGER,REFERENCES') as authenticated_can_define_relations,
       c.relowner = (select oid from pg_roles where rolname = current_user) as audit_role_owns_table,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

select 'view_security' as section, n.nspname as schema_name, c.relname as view_name,
       coalesce(c.reloptions @> array['security_invoker=true'], false) as security_invoker,
       has_table_privilege('anon', c.oid, 'SELECT')
         or has_any_column_privilege('anon', c.oid, 'SELECT') as anon_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname;

select 'function_security' as section,
       p.oid::regprocedure::text as signature,
       p.prosecdef as security_definer,
       not p.prosecdef or coalesce(p.proconfig @> array['search_path=public, pg_temp'] or p.proconfig @> array['search_path=""'], false) as trusted_search_path,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
order by p.oid::regprocedure::text;

-- Identifica a presença do gate sem imprimir expressões que possam conter
-- constantes sensíveis adicionadas por alterações manuais no ambiente.
select 'policy_security' as section, c.relname as table_name, p.polname as policy_name,
       p.polcmd as command, p.polpermissive as permissive,
       array(select case when role_id = 0 then 'PUBLIC' else pg_get_userbyid(role_id) end
             from unnest(p.polroles) as role_id order by role_id) as policy_roles,
       p.polqual is not null as has_using,
       p.polwithcheck is not null as has_check,
       case when c.relname in ('instagram_posts', 'content_angle_suggestions') and p.polcmd = 'w'
         then coalesce(pg_get_expr(p.polqual, p.polrelid) like '%pode_editar_acoes%', false)
          and coalesce(pg_get_expr(p.polwithcheck, p.polrelid) like '%pode_editar_acoes%', false)
       end as update_requires_editor
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relnamespace = 'public'::regnamespace
order by c.relname, p.polname;

select 'schema_security' as section, r.role_name,
       has_schema_privilege(r.role_name, 'public', 'CREATE') as can_create_public_objects
from (values ('anon'), ('authenticated')) as r(role_name);

select 'sequence_security' as section, c.relname as sequence_name,
       has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') as anon_has_access
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
order by c.relname;

-- Mostra somente nomes de colunas, nunca valores. Tokens de conexão são
-- administráveis pelo app_admin e dependem de RLS; os tokens legados abaixo
-- não devem ter SELECT sequer para authenticated.
with expected(table_name, column_name, expected_authenticated_select, access_model) as (values
  ('clients', 'wts_api_token', false, 'server_only'),
  ('clients', 'digisac_token', false, 'server_only'),
  ('clients', 'digisac_url', false, 'server_only'),
  ('clients', 'ticket_medio', true, 'client_metadata'),
  ('client_ad_accounts', 'access_token', false, 'server_only'),
  ('crm_connections', 'access_token', true, 'admin_only_rls'),
  ('crm_connections', 'webhook_secret', true, 'admin_only_rls'),
  ('instagram_account_secrets', 'meta_access_token', true, 'admin_only_rls'),
  ('instagram_posts', 'reach', true, 'metrics_server_write_only'),
  ('instagram_posts', 'client_id', true, 'tenant_identity_server_write_only'),
  ('instagram_posts', 'tema', true, 'editor_classification')
)
select 'column_security' as section, e.table_name, e.column_name, e.access_model,
       e.expected_authenticated_select,
       has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT') as authenticated_select,
       has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') as authenticated_update,
       has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES') as anon_has_access
from expected e
join pg_class c on c.relname = e.table_name and c.relnamespace = 'public'::regnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = e.column_name and a.attnum > 0 and not a.attisdropped
order by e.table_name, e.column_name;

-- Grants futuros a anon/PUBLIC, incluindo defaults globais IMPLÍCITOS.
-- PostgreSQL concede EXECUTE de funções a PUBLIC por padrão. REVOKE IN SCHEMA
-- não subtrai esse grant global: os grants de schema apenas acrescentam acesso.
-- Uma linha aqui não significa exposição atual (ver function_security), mas
-- exige que futuras migrações revoguem EXECUTE explicitamente ou que o default
-- global seja revisado por papel proprietário. Este arquivo não o modifica.
with owners as (
  select c.relowner as owner_oid from pg_class c where c.relnamespace = 'public'::regnamespace
  union select p.proowner from pg_proc p where p.pronamespace = 'public'::regnamespace
  union select d.defaclrole from pg_default_acl d where d.defaclnamespace in (0, 'public'::regnamespace)
), global_defaults as (
  select o.owner_oid, t.object_type,
         case when d.oid is null then 'global_implicit' else 'global_explicit' end as default_source,
         coalesce(d.defaclacl, acldefault(t.object_type, o.owner_oid)) as acl
  from owners o cross join (values ('r'::"char"), ('f'::"char"), ('S'::"char")) t(object_type)
  left join pg_default_acl d on d.defaclrole = o.owner_oid and d.defaclnamespace = 0 and d.defaclobjtype = t.object_type
), defaults as (
  select owner_oid, object_type, default_source, acl from global_defaults
  union all
  select d.defaclrole, d.defaclobjtype, 'public_schema', d.defaclacl
  from pg_default_acl d where d.defaclnamespace = 'public'::regnamespace
)
select 'anonymous_default_grant' as section,
       pg_get_userbyid(d.owner_oid) as object_owner,
       d.default_source,
       d.object_type,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type
from defaults d cross join lateral aclexplode(d.acl) a
where a.grantee = 0 or a.grantee = (select oid from pg_roles where rolname = 'anon')
order by object_owner, default_source, object_type, grantee, a.privilege_type;

-- TRUNCATE/REFERENCES/TRIGGER futuros por owner. Não assume que postgres
-- possa administrar defaults de supabase_admin no ambiente hospedado.
with owners as (
  select relowner as owner_oid from pg_class where relnamespace='public'::regnamespace
  union select defaclrole from pg_default_acl where defaclnamespace in (0,'public'::regnamespace)
), defaults as (
  select o.owner_oid, 'global'::text as default_scope,
    coalesce(d.defaclacl,acldefault('r',o.owner_oid)) as acl
  from owners o left join pg_default_acl d on d.defaclrole=o.owner_oid and d.defaclnamespace=0 and d.defaclobjtype='r'
  union all
  select defaclrole,'public_schema',defaclacl from pg_default_acl
  where defaclnamespace='public'::regnamespace and defaclobjtype='r'
)
select 'unsafe_table_default_grant' as section, pg_get_userbyid(d.owner_oid) as object_owner,
  d.default_scope, case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
  a.privilege_type, pg_has_role(current_user,d.owner_oid,'MEMBER') as audit_role_can_manage_owner
from defaults d cross join lateral aclexplode(d.acl) a
where a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
  and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
order by object_owner,default_scope,grantee,a.privilege_type;

select 'unvalidated_constraint' as section,
       n.nspname as schema_name, c.relname as table_name, k.conname as constraint_name,
       k.contype as constraint_type, k.condeferrable as deferrable,
       k.confmatchtype as foreign_key_match_type
from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not k.convalidated
order by c.relname, k.conname;

-- GERA uma consulta por FK de isolamento (inclui as já validadas). Não executa.
-- Todos os identificadores vêm do catálogo e são escapados com %I; o rótulo
-- é escapado com %L. Só COUNT é retornado: nenhum identificador de paciente,
-- telefone, e-mail, payload, credencial ou amostra de registros sai do banco.
-- MATCH SIMPLE: se qualquer coluna da FK é nula, a relação é opcional e válida.
-- row_security=off NÃO desativa RLS: a consulta falha se o papel não puder
-- auditar todas as linhas. Isso evita interpretar uma contagem filtrada como 0.
-- Execute os count_sql revisados separadamente em homologação. Não use \gexec
-- sem revisar. Cada string tem sua própria transação READ ONLY e ROLLBACK.
with tenant_keys as (
  select k.oid, k.conname, k.convalidated, k.confmatchtype,
         cn.nspname as child_schema, child.relname as child_table,
         pn.nspname as parent_schema, parent.relname as parent_table,
         string_agg(format('c.%I is not null', ca.attname), ' and ' order by key.ordinality) as non_null_columns,
         string_agg(format('p.%I = c.%I', pa.attname, ca.attname), ' and ' order by key.ordinality) as join_columns
  from pg_constraint k
  join pg_class child on child.oid = k.conrelid join pg_namespace cn on cn.oid = child.relnamespace
  join pg_class parent on parent.oid = k.confrelid join pg_namespace pn on pn.oid = parent.relnamespace
  cross join lateral unnest(k.conkey, k.confkey) with ordinality as key(child_attnum, parent_attnum, ordinality)
  join pg_attribute ca on ca.attrelid = child.oid and ca.attnum = key.child_attnum
  join pg_attribute pa on pa.attrelid = parent.oid and pa.attnum = key.parent_attnum
  where cn.nspname = 'public' and k.contype = 'f' and right(k.conname, 10) = '_tenant_fk'
  group by k.oid, k.conname, k.convalidated, k.confmatchtype, cn.nspname, child.relname, pn.nspname, parent.relname
)
select 'tenant_violation_query' as section,
       conname as constraint_name, child_schema, child_table, parent_schema, parent_table,
       convalidated as already_validated,
       confmatchtype = 's' as supported_match_simple,
       case when confmatchtype = 's' then format(
         'begin transaction read only; set local statement_timeout = ''30s''; set local lock_timeout = ''5s''; set local row_security = off; select %L::text as constraint_name, count(*)::bigint as legacy_violations from %I.%I c where %s and not exists (select 1 from %I.%I p where %s); rollback;',
         conname, child_schema, child_table, non_null_columns, parent_schema, parent_table, join_columns)
       end as count_sql
from tenant_keys order by child_table, conname;

commit;
