-- Funil novo na Clint que o Nexo não lê (auditoria de 30/10/2026: "Black November 26" da Dra. Marcelly entrou sem
-- aviso). O sync grava em crm_connections.config.funis_fora_da_config os funis da conta que nenhuma conexão lê; aqui
-- vira alerta para a equipe decidir se entra no Nexo.
-- Reversão: recriar qualidade_dados sem o bloco "crm-funil-fora".

do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  ancora text := '  -- Muitos leads e quase nenhum ganho (menos de 1 a cada 200).';
  novo text := '  for r in
    select string_agg(f, '', '' order by f) nomes, count(*) n
      from crm_connections x, jsonb_array_elements_text(coalesce(x.config->''funis_fora_da_config'', ''[]''::jsonb)) f
     where x.client_id = p_client_id and x.active
    having count(*) > 0
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-funil-fora'', ''fonte'', ''crm'', ''severidade'', ''baixa'',
      ''titulo'', format(''%s funil(is) do CRM não entram no Nexo'', r.n),
      ''evidencia'', ''Funis da conta que nenhuma conexão lê: '' || left(r.nomes, 300) || ''.'',
      ''causa'', ''Funil criado no CRM depois da configuração da conexão.'',
      ''correcao'', ''Equipe Doctor Creator: confirmar com a clínica se o funil deve entrar e incluí-lo na conexão.'',
      ''responsavel'', ''equipe_hub'',
      ''afeta'', ''Leads e vendas desses funis.'');
  end loop;

';
begin
  if position('crm-funil-fora' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'qualidade_dados: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, novo || ancora);
end
$migra$;
