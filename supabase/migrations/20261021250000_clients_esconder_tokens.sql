-- Segurança: membro de clínica (médico, equipe da clínica) conseguia ler pela API os tokens do provedor de WhatsApp
-- da própria clínica (clients.wts_api_token, digisac_token, digisac_url): o RLS libera a linha e a role authenticated
-- tinha SELECT em todas as colunas. Agora authenticated só lê as colunas não secretas; servidor (service role) segue
-- lendo tudo. O navegador nunca usou essas colunas (getClient já seleciona colunas explícitas).
-- Reversão: grant select on public.clients to authenticated;
revoke select on public.clients from anon, authenticated;
grant select (id, name, specialty, instagram_handle, cfm_score_status, active, created_at, meta_ad_account_id,
  wts_company_id, avatar_url, wts_department_ids, em_onboarding, ads_planilha_url, ticket_medio) on public.clients to authenticated;
