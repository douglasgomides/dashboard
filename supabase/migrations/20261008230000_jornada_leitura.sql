-- Já aplicado no banco em 08/10/2026 (via SQL editor/MCP). Registro para o repositório.
-- Funções de leitura da tela Jornada: jornada_resumo(p_client), jornada_pessoa(p_pessoa), buscar_pessoas(p_client, p_q).
-- Todas checam is_app_admin() ou is_client_member(); jornada_pessoa grava o acesso em acessos_conversas.
-- O corpo completo está no banco (pg_get_functiondef). Para recriar, rode: select pg_get_functiondef('public.jornada_resumo(uuid)'::regprocedure);
select 1;
