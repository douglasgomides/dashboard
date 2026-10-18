-- Delta do catálogo hospedado, conferido em 17/10/2026. Os grants de SELECT
-- integrais persistiam em produção: não depender de reaplicar migrações antigas.
-- Aplicar com o frontend que já seleciona colunas explícitas. Nenhum valor é
-- lido/alterado; service_role e policies de administração permanecem intactos.
-- Revogar só SELECT da tabela não remove grants já existentes POR COLUNA.
do $$
declare tabela text; colunas text;
begin
  foreach tabela in array array['clients', 'client_ad_accounts'] loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
    from pg_attribute a
    where a.attrelid = format('public.%I', tabela)::regclass and a.attnum > 0 and not a.attisdropped;
    execute format('revoke select on public.%I from public, anon, authenticated', tabela);
    execute format('revoke select (%s) on public.%I from public, anon, authenticated', colunas, tabela);
  end loop;
end $$;

-- A allowlist usa apenas colunas já existentes: ticket_medio é criada mais
-- tarde no bootstrap, mas precisa continuar legível no catálogo hospedado atual.
-- digisac_url é configuração interna e não volta a ser exposta.
do $client_metadata$
declare colunas text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
  from pg_attribute a
  where a.attrelid = 'public.clients'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any(array['id','name','specialty','instagram_handle','cfm_score_status','active','created_at',
      'meta_ad_account_id','wts_company_id','avatar_url','wts_department_ids','em_onboarding','ads_planilha_url','ticket_medio']);
  execute format('grant select (%s) on public.clients to authenticated', colunas);
end;
$client_metadata$;
grant select (client_id, ad_account_id, name, active, created_at, provisional)
  on public.client_ad_accounts to authenticated;

-- Staging de importações já está com RLS sem policies no catálogo real:
-- isso é deny-by-default para usuários, não uma falha que exija abrir acesso.
-- Fecha também privilégios diretos por coluna de eventuais importações antigas.
-- Não cria staging nem inventa sua estrutura nos ambientes que não o possuem.
do $$
declare tabela text; colunas text;
begin
  foreach tabela in array array['_flw_stage', '_flw_steps'] loop
    if to_regclass(format('public.%I', tabela)) is not null then
      execute format('alter table public.%I enable row level security', tabela);
      execute format('revoke all on public.%I from public, anon, authenticated', tabela);
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
      from pg_attribute a
      where a.attrelid = format('public.%I', tabela)::regclass and a.attnum > 0 and not a.attisdropped;
      if colunas is not null then
        execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon, authenticated', colunas, tabela);
      end if;
    end if;
  end loop;
end $$;
