-- Alertas e papel de funil que faltavam (auditoria de 30/10/2026):
-- 1. "Muitos leads e quase nenhum ganho": a Dra. Lana teve 1 ganho em 4.021 leads com R$ 33 mil investidos e nenhuma
--    regra avisava (o alerta só existia para zero ganho).
-- 2. Ganho sem valor nos últimos 30 dias: o alerta de 90 dias escondia quedas bruscas (Dr. Sergio: desde 12/10 os
--    ganhos chegam sem valor; 0 nas semanas de 19 e 26/10).
-- 3. Funil fechado inteiro como ganho num instante (Dra. Samira: 178 ganhos sem valor às 14:19 de 05/06).
-- 4. Papel do funil: "Atendimento Clínica" (feminino) escapava da regra; funil novo não recebia papel nenhum.
-- Reversão: recriar qualidade_dados sem os três blocos; drop trigger crm_pipeline_papel_regra on crm_pipeline_statuses;
--   drop function crm_papel_pela_regra(text), crm_pipeline_papel_gatilho().

create or replace function public.crm_papel_pela_regra(p_nome text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_nome ~* '(reativa[cç][aã]o|resgate|base antiga)' then 'base'
    when p_nome ~* '(compra|assinatura|carrinho|cart[aã]o recusado|reembolso|chargeback|upsell)' then 'compra'
    when p_nome ~* '(gest[aã]o interna|confirma[cç][aã]o|acompanhamento|atendimento cl[ií]nic[oa]|jornada cir[uú]rgica|programa de benef)' then 'operacional'
    when p_nome ~* '(comercial|procedimento|or[cç]amento)' then 'venda'
  end;
$$;
revoke all on function public.crm_papel_pela_regra(text) from public, anon;
grant execute on function public.crm_papel_pela_regra(text) to authenticated, service_role;

create or replace function public.crm_pipeline_papel_gatilho()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare p text := public.crm_papel_pela_regra(new.pipeline_name);
begin
  if p is not null then
    insert into crm_funil_papel (crm_connection_id, pipeline_id, papel)
    values (new.crm_connection_id, new.pipeline_id, p)
    on conflict (crm_connection_id, pipeline_id) do update set papel = excluded.papel, atualizado_em = now()
      where crm_funil_papel.definido_por = 'regra' and crm_funil_papel.papel is distinct from excluded.papel;
  end if;
  return new;
exception when others then
  raise warning 'crm_pipeline_papel_gatilho: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.crm_pipeline_papel_gatilho() from public, anon, authenticated;
drop trigger if exists crm_pipeline_papel_regra on public.crm_pipeline_statuses;
create trigger crm_pipeline_papel_regra after insert or update of pipeline_name on public.crm_pipeline_statuses
  for each row execute function public.crm_pipeline_papel_gatilho();

-- Aplica a regra atualizada aos funis que já existem (o que a equipe definiu continua).
insert into public.crm_funil_papel (crm_connection_id, pipeline_id, papel)
select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, public.crm_papel_pela_regra(s.pipeline_name)
  from public.crm_pipeline_statuses s
 where public.crm_papel_pela_regra(s.pipeline_name) is not null
on conflict (crm_connection_id, pipeline_id) do update set papel = excluded.papel, atualizado_em = now()
  where public.crm_funil_papel.definido_por = 'regra' and public.crm_funil_papel.papel is distinct from excluded.papel;

do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  ancora text := '  for r in
    select count(distinct o.client_id) n
    from crm_connections c join crm_connections o';
  novo text := '  -- Muitos leads e quase nenhum ganho (menos de 1 a cada 200).
  if v_leads90 >= 200 and v_ganhos90 > 0 and v_ganhos90::numeric / v_leads90 < 0.005 then
    out := out || jsonb_build_object(
      ''id'', ''crm-quase-sem-ganho'', ''fonte'', ''crm'', ''severidade'', ''media'',
      ''titulo'', format(''Só %s ganho(s) marcado(s) para %s pessoas novas em 90 dias'', v_ganhos90, v_leads90),
      ''evidencia'', format(''%s ganhos registrados no CRM para %s pessoas novas nos últimos 90 dias (menos de 1 a cada 200).'', v_ganhos90, v_leads90),
      ''causa'', ''A equipe fecha as vendas mas quase nunca move o card para ganho, ou a venda é registrada em outro sistema.'',
      ''correcao'', ''Mover para ganho quem fechou, com o valor; se a venda fica em outro sistema, dizer qual etapa do CRM significa venda.'',
      ''responsavel'', ''comercial'',
      ''afeta'', ''Taxa de conversão, retorno do investimento, custo por paciente.'');
  end if;

  -- Ganho sem valor nos últimos 30 dias (queda recente que o alerta de 90 dias dilui).
  for r in
    select count(*) g, count(*) filter (where coalesce(price, 0) > 0) gv
      from crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = ''won''
       and occurred_at >= now() - interval ''30 days''
    having count(*) >= 5 and count(*) filter (where coalesce(price, 0) > 0)::numeric / count(*) < 0.5
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-ganho-sem-valor-30d'', ''fonte'', ''crm'', ''severidade'', ''media'',
      ''titulo'', format(''%s de %s ganhos dos últimos 30 dias estão sem valor'', r.g - r.gv, r.g),
      ''evidencia'', format(''Últimos 30 dias: %s ganhos, só %s com valor preenchido.'', r.g, r.gv),
      ''causa'', ''O valor da venda deixou de ser preenchido (à mão ou pela integração do sistema da clínica).'',
      ''correcao'', ''Voltar a preencher o valor em cada ganho; sem isso o retorno do investimento do mês não sai.'',
      ''responsavel'', ''comercial'',
      ''afeta'', ''Receita e retorno do investimento do mês.'');
  end loop;

  -- Funil fechado inteiro como ganho de uma vez (faxina do funil, não venda).
  for r in
    select count(*) n, to_char(to_timestamp((raw_payload->>''closed_at'')::bigint) at time zone ''America/Sao_Paulo'', ''DD/MM/YYYY HH24:MI'') quando
      from crm_leads
     where client_id = p_client_id and removido_na_origem is null and outcome = ''won'' and coalesce(price, 0) = 0
       and raw_payload->>''closed_at'' ~ ''^\d+$''
     group by date_trunc(''minute'', to_timestamp((raw_payload->>''closed_at'')::bigint)), 2
    having count(*) >= 30
     order by 1 desc limit 1
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-ganho-em-lote'', ''fonte'', ''crm'', ''severidade'', ''media'',
      ''titulo'', format(''%s cards foram marcados como ganho no mesmo minuto (%s), sem valor'', r.n, r.quando),
      ''evidencia'', format(''%s ganhos sem valor fechados em %s: parece fechamento em lote do funil, não venda.'', r.n, r.quando),
      ''causa'', ''A equipe encerrou o funil inteiro marcando tudo como ganho.'',
      ''correcao'', ''Marcar como perdido ou arquivar o que não foi venda; ganho é só quem fechou.'',
      ''responsavel'', ''comercial'',
      ''afeta'', ''Número de vendas e taxa de conversão do período desses cards.'');
  end loop;

';
begin
  if position('crm-quase-sem-ganho' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'qualidade_dados: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, novo || ancora);
end
$migra$;
