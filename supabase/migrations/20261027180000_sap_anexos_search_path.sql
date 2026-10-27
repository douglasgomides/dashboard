-- SAP · Anexos: as duas RPCs SECURITY DEFINER de 20261027170000 saíram com search_path só 'public'. O padrão do projeto
-- (scripts/test-db-security.ts) é 'public, pg_temp', para tabela temporária do usuário não ser resolvida antes do schema.
-- Reversão: alter function ... set search_path to 'public';
alter function public.sap_salvar_anexo(uuid, text, text, text) set search_path = public, pg_temp;
alter function public.sap_apagar_anexo(uuid, text) set search_path = public, pg_temp;
