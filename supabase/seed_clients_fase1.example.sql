-- Template pra cadastrar manualmente os 2 clientes piloto da Fase 1.
-- NÃO é uma migration (não roda automático) — copie, preencha e rode no SQL
-- editor do Supabase (ou psql) depois de criar seu usuário via Auth.
--
-- Os windsor_account_id abaixo já existem e estão ativos no workspace
-- Windsor.ai (conector "instagram") — troque pelos 2 clientes piloto reais.
-- Alguns exemplos de contas já conectadas no workspace, pra referência:
--   17841400129990523  Dra. Kika Nunes | Pediatra e Mãe 40+ (dra.kikanunes)
--   17841407864715522  Dr Carlos Preto - Curitiba (drcarlospreto)
--   17841402220512354  Dra. Marcella Brasil (dra.marcellabrasil)
--   17841404991643173  Dr Antonio Eduardo Pereira (dr.antonioeduardo)
-- (lista completa: MCP Windsor.ai get_connectors, conector "instagram")

-- 1) Cliente
insert into public.clients (name, specialty, instagram_handle, cfm_score_status)
values ('Nome do médico(a)', 'Especialidade', '@handle', null)
returning id; -- guarde esse id pros passos seguintes

-- 2) Conta Instagram (Windsor) — substitua :client_id e :windsor_account_id
insert into public.instagram_accounts (client_id, windsor_account_id, ig_username, connected_manually)
values (:'client_id', ':windsor_account_id', '@handle', true);

-- 3) Acesso — vincula o usuário (auth.users.id, já criado via Supabase Auth)
--    que vai enxergar este cliente no painel.
insert into public.client_members (client_id, user_id, role)
values (:'client_id', ':user_id', 'strategist');
