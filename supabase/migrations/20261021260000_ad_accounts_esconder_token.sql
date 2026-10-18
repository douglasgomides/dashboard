-- Segurança: membro de clínica conseguia ler pela API o token de acesso da Meta da conta de anúncio da própria clínica
-- (client_ad_accounts.access_token): o RLS libera a linha para membros e a role authenticated tinha SELECT em todas as
-- colunas. O navegador só usa ad_account_id, name e active; o sync de anúncios usa a service role.
-- Reversão: grant select on public.client_ad_accounts to authenticated;
revoke select on public.client_ad_accounts from anon, authenticated;
grant select (client_id, ad_account_id, name, active, created_at, provisional) on public.client_ad_accounts to authenticated;
