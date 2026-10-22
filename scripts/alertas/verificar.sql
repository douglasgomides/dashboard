-- Alertas de produção (só leitura). Saída: um array JSON de {gravidade, chave, texto}.
--   critico: a coleta de uma fonte não rodou com sucesso para ninguém nas últimas 26 horas.
--   atencao: erro de sincronização de uma clínica; fonte de clínica parada; IA falhando; leitura de temas parada.
-- Fonte marcada como "não usa" (fontes_nao_usadas) não gera alerta. Anúncios parados sem erro podem ser campanha
-- pausada, então só alertam com erro. Nunca lê conversa, contato ou dado de paciente.
set default_transaction_read_only = on;
with
coleta as (
  select 'critico' gravidade, 'coleta:' || fonte chave,
    'Coleta de ' || fonte || ' sem sucesso há ' || round(extract(epoch from now() - max(last_success_at)) / 3600) || ' horas (todas as clínicas).' texto
  from sync_status group by fonte
  having max(last_success_at) < now() - interval '26 hours'
),
erros as (
  select 'atencao', 'erro:' || s.client_id || ':' || s.fonte,
    c.name || ' · ' || s.fonte || ': ' || left(regexp_replace(s.last_error, '\s+', ' ', 'g'), 160)
  from sync_status s join clients c on c.id = s.client_id and c.active
  where s.last_error is not null
    and not exists (select 1 from fontes_nao_usadas n where n.client_id = s.client_id and n.fonte = s.fonte)
),
paradas as (
  select 'atencao', 'parada:' || f.client_id || ':' || f.fonte,
    c.name || ' · ' || f.fonte || ': ' || coalesce('último dado em ' || to_char(f.data_ate, 'DD/MM') || ' (' || (current_date - f.data_ate) || ' dias)', 'nenhum dado coletado ainda')
  from public.status_fontes_clientes() f join clients c on c.id = f.client_id
  where f.cadastro and not f.nao_usa and f.fonte <> 'anuncios' and f.last_error is null
    and (f.data_ate is null or current_date - f.data_ate > 3)
),
ia as (
  select 'atencao', 'ia:' || finalidade,
    'IA · ' || finalidade || ': ' || count(*) filter (where not ok) || ' de ' || count(*) || ' execuções falharam nas últimas 24 horas.'
  from ia_execucoes where criado_em > now() - interval '24 hours'
  group by finalidade
  having count(*) >= 10 and count(*) filter (where not ok)::numeric / count(*) > 0.2
),
temas as (
  select 'atencao', 'temas:parada',
    'Leitura de temas das conversas parada: nenhuma leitura nas últimas 6 horas e ' || count(*) || ' conversas da última semana sem tema.'
  from conversas cv
  where cv.iniciada_em > now() - interval '7 days'
    and not exists (select 1 from conversas_tema t where t.conversa_id = cv.id)
    and not exists (select 1 from conversas_tema t where t.gerado_em > now() - interval '6 hours')
  having count(*) > 0
),
tudo as (
  select * from coleta union all select * from erros union all select * from paradas union all select * from ia union all select * from temas
)
select coalesce(json_agg(json_build_object('gravidade', gravidade, 'chave', chave, 'texto', texto) order by gravidade, chave), '[]') from tudo;
