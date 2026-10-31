-- Trava de origem das vendas no retorno do investimento (diagnóstico de medição, 31/10/2026, PR 2 da Onda 1):
-- A tela só olhava a origem dos leads. Doctor Creator, 90 dias: 99% dos leads têm texto de origem, mas só 17 das 176
-- vendas têm canal conhecido. 131 vendas estão em "Funil de compra, sem origem". O ROI de -98% saía de 1 venda de
-- anúncio, sem aviso. Agora roi_periodo devolve também "ganhos_com_canal": vendas do período (mesma regra do CTE
-- "gan") com origem anúncio (no card ou em outro card da mesma pessoa) ou com origem classificada por
-- crm_origem_classifica. Texto de origem que não vira canal (ex.: "Material de isca") não conta. A tela exige 70% ou
-- mais (LIMITES.roi.ganhosComCanalMinimo em src/lib/limites.ts); o limite fica no código, não no SQL.
-- Só acrescenta uma chave ao json de saída: segurança, grants e RLS da função não mudam.
-- Reversão: em roi_periodo, tirar a linha
--   'ganhos_com_canal', (select count(*) from gan where anuncio or origem_classe is not null),
-- (mesmo padrão DO-block com pg_get_functiondef e replace, trocando o trecho novo pelo antigo).

do $migra$
declare
  def text := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  a1 text := '''receita_anuncio'', coalesce((select sum(price) from gan where anuncio and price > 0), 0),';
  n1 text := '''receita_anuncio'', coalesce((select sum(price) from gan where anuncio and price > 0), 0),
    ''ganhos_com_canal'', (select count(*) from gan where anuncio or origem_classe is not null),';
begin
  if position('ganhos_com_canal' in def) > 0 then return; end if;
  if position(a1 in def) = 0 then
    raise exception 'roi_periodo: trecho não encontrado; revisar a migration';
  end if;
  execute replace(def, a1, n1);
end
$migra$;
