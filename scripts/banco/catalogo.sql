-- Impressão digital do esquema public, igual no banco remontado e em produção. Só metadados.
select 'tabela' as tipo, c.relname as nome,
  md5(coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then '!' else '' end, ',' order by a.attname)
    from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')) || case when c.relrowsecurity then ' rls' else ' SEM_RLS' end as assinatura
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select 'view', c.relname, '' from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')
union all
select 'funcao', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  case when p.prosecdef then 'definer' else 'invoker' end || ' ' || coalesce(array_to_string(p.proconfig, ';'), '')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p')
union all
select 'politica', tablename || '.' || policyname, cmd from pg_policies where schemaname = 'public'
union all
select 'indice', indexname, tablename from pg_indexes where schemaname = 'public'
union all
select 'gatilho', t.tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by 1, 2;
