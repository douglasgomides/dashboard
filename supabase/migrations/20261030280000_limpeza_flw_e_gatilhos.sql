-- Limpeza da auditoria de 30/10/2026:
-- 1. _flw_stage e _flw_steps: cópia antiga de cards e contatos do FlwChat (2.694 linhas com dado pessoal), sem uso
--    desde 01/10 por nenhuma função, rota ou tela. Apagadas.
-- 2. Gatilhos que engoliam erro em silêncio (crm_registrar_evento e sap_conversoes_do_evento): continuam sem derrubar
--    a gravação do lead, mas agora registram o erro no log do banco (raise warning) em vez de sumir com ele.
-- Reversão: as tabelas não voltam (sem uso). Para os gatilhos, trocar "raise warning" por "null" de novo.

drop table if exists public._flw_stage;
drop table if exists public._flw_steps;

do $migra$
declare
  f text;
  def text;
begin
  foreach f in array array['public.crm_registrar_evento()', 'public.sap_conversoes_do_evento()'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('raise warning' in def) > 0 then continue; end if;
    if position('exception when others then
    null;' in def) = 0 then raise exception '%: trecho não encontrado', f; end if;
    execute replace(def, 'exception when others then
    null;', format('exception when others then
    raise warning ''%s: %%'', sqlerrm;', split_part(split_part(f, '.', 2), '(', 1)));
  end loop;
end
$migra$;
