-- Parte 1 (urgente, independente do código): tabelas de importação do FlwChat
-- estavam sem RLS e com todos os privilégios para anon. Guardam contatos de leads.
-- São tabelas temporárias de uma importação manual, não estruturas do app.
-- Endurece quando existem, sem exigir sua criação em um banco novo.
do $$
declare tabela text;
begin
  foreach tabela in array array['_flw_stage', '_flw_steps'] loop
    if to_regclass(format('public.%I', tabela)) is not null then
      execute format('alter table public.%I enable row level security', tabela);
      execute format('revoke all on public.%I from anon, authenticated, public', tabela);
    end if;
  end loop;
end $$;

-- Parte 2 (aplicar SÓ depois que o front com colunas explícitas estiver no ar):
-- tokens deixam de ser legíveis por membros. O service_role e as funções
-- security definer continuam enxergando tudo.
revoke select on public.clients from authenticated;
grant select (id, name, specialty, instagram_handle, cfm_score_status, active, created_at,
              meta_ad_account_id, wts_company_id, avatar_url, wts_department_ids, em_onboarding)
  on public.clients to authenticated;

revoke select on public.client_ad_accounts from authenticated;
grant select (client_id, ad_account_id, name, active, created_at, provisional)
  on public.client_ad_accounts to authenticated;
