-- Preço pedido sem resposta, contado por conversa (auditoria do Plano de ação de 30/10/2026). A tela Prioridades
-- calculava "pediram preço" menos "receberam preço" com os dois totais do funil. Como há quem recebe o valor sem ter
-- pedido, a conta dava negativo e virava zero: na Dra. Marcella, 88 pedidos e 91 apresentados davam 0, mas 27
-- conversas pediram o preço e não receberam. Agora auditoria_comercial devolve funil.preco_sem_resposta, contado
-- direto em cada conversa lida (pediu e não recebeu), na mesma base do resto do funil.
-- Reversão: recriar auditoria_comercial sem a linha 'preco_sem_resposta' (versão de 20261013270000).

do $migra$
declare
  def text := pg_get_functiondef('public.auditoria_comercial(uuid,date,date)'::regprocedure);
  ancora text := '''preco_apresentado'', (select count(*) from base where (j->>''preco_apresentado'')::boolean),';
  novo text := '''preco_sem_resposta'', (select count(*) from base where (j->>''preco_pedido'')::boolean and not coalesce((j->>''preco_apresentado'')::boolean, false)),';
begin
  if position('preco_sem_resposta' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'auditoria_comercial: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, ancora || '
      ' || novo);
end
$migra$;
