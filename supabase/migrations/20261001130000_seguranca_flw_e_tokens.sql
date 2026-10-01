-- Parte 1 (urgente, independente do código): tabelas de importação do FlwChat
-- estavam sem RLS e com todos os privilégios para anon. Guardam contatos de leads.
alter table public._flw_stage enable row level security;
alter table public._flw_steps enable row level security;
revoke all on public._flw_stage from anon, authenticated, public;
revoke all on public._flw_steps from anon, authenticated, public;

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
