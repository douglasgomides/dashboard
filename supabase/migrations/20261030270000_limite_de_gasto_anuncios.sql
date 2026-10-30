-- Limite de gastos da conta de anúncios (auditoria de 30/10/2026): a conta para de entregar quando atinge o spend_cap,
-- sem erro em campanha nenhuma, e ninguém lia o limite (Antônio a cerca de 10 dias, Sergio cerca de 24, Marcella cerca
-- de 1 mês). O sync pela Graph grava quantos dias de gasto faltam; o alerta avisa com 10 dias de antecedência.
-- Reversão: alter table client_ad_accounts drop column limite_gasto_dias, drop column limite_lido_em; recriar
--   qualidade_dados sem o bloco "ads-limite-perto".

alter table public.client_ad_accounts add column if not exists limite_gasto_dias numeric;
alter table public.client_ad_accounts add column if not exists limite_lido_em timestamptz;

do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  ancora text := '  -- Muitos leads e quase nenhum ganho (menos de 1 a cada 200).';
  novo text := '  for r in
    select ad_account_id, limite_gasto_dias d
      from client_ad_accounts
     where client_id = p_client_id and active and limite_gasto_dias is not null and limite_gasto_dias < 10
       and limite_lido_em > now() - interval ''3 days''
     order by limite_gasto_dias limit 1
  loop
    out := out || jsonb_build_object(
      ''id'', ''ads-limite-perto'', ''fonte'', ''anuncios'', ''severidade'', case when r.d < 3 then ''alta'' else ''media'' end,
      ''titulo'', format(''O limite de gastos da conta de anúncios acaba em cerca de %s dia(s)'', round(r.d)),
      ''evidencia'', format(''Conta %s: pelo gasto médio dos últimos 7 dias, o limite de gastos definido na conta é atingido em cerca de %s dia(s). Ao atingir, a Meta para todas as campanhas.'', r.ad_account_id, round(r.d)),
      ''causa'', ''A conta tem um limite total de gastos definido em Faturamento.'',
      ''correcao'', ''Aumentar ou zerar o limite de gastos em Faturamento, no Gerenciador de Anúncios, antes de ele acabar.'',
      ''responsavel'', ''cliente'',
      ''afeta'', ''Entrega de todas as campanhas da conta.'');
  end loop;

';
begin
  if position('ads-limite-perto' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'qualidade_dados: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, novo || ancora);
end
$migra$;

-- Conta de anúncios compartilhada com outro cliente (HOMS e Dra. Ana: as campanhas de uma aparecem no ROI da outra).
-- O aviso existia em Anúncios e na Conferência, não no ROI.
do $migra$
declare
  def text := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  a1 text := '    ''crm_compartilhado_com'', coalesce((select jsonb_agg(name order by name) from outros), ''[]''::jsonb)
  ) end;';
  n1 text := '    ''crm_compartilhado_com'', coalesce((select jsonb_agg(name order by name) from outros), ''[]''::jsonb),
    ''anuncios_compartilhados_com'', coalesce((
      select jsonb_agg(distinct c2.name)
        from client_ad_accounts a join client_ad_accounts b on b.ad_account_id = a.ad_account_id and b.client_id <> a.client_id and b.active
        join clients c2 on c2.id = b.client_id and c2.active
       where a.client_id = p_client_id and a.active), ''[]''::jsonb)
  ) end;';
begin
  if position('anuncios_compartilhados_com' in def) > 0 then return; end if;
  if position(a1 in def) = 0 then raise exception 'roi_periodo: trecho não encontrado; revisar a migration'; end if;
  execute replace(def, a1, n1);
end
$migra$;
