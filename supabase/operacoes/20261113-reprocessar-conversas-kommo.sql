-- NÃO é migração: rodar à mão, só o João, depois de aplicar 20261113100000_contas_certas_no_banco.sql e
-- 20261113110000_historico_diario_por_entrada.sql. Agentes não rodam este arquivo.
-- (Fica em supabase/operacoes/: scripts/banco/aplicar.sh e o workflow "Banco de dados" só leem supabase/migrations.)
--
-- O que faz: volta o cursor das conversas do Kommo (crm_connections.config.kommo_conversas_ate) em janelas de 30
-- dias, para a sincronização ler de novo as mensagens antigas e:
--  - ligar ao lead as conversas gravadas antes do agrupamento por lead (chave antiga = id do talk), sem duplicar;
--  - gravar o autor certo ("Atendente" quando foi uma pessoa da equipe) e marcar o robô pela regra nova.
--
-- Pré-condições (conferir com supabase/audits/historico-diario-conferencia.sql, seções 0 e 1, só leitura):
--  - o código do plano 04 no ar: mensagens de saída do Kommo com autor 'Atendente' nos últimos 7 dias > 0. Sem isso,
--    o reprocesso abriria uma segunda conversa com as mesmas mensagens. NÃO rodar.
--  - a migração 20261113110000 aplicada (registro presente): senão a regra de robô antiga marcaria resposta de gente.
--
-- Como funciona a sincronização: uma conta do Kommo pode servir mais de uma clínica (mesmo subdomínio). As conexões
-- da mesma conta andam juntas, pelo cursor mais atrasado entre elas. Por isso: voltar UMA conexão por conta (a que o
-- passo (a) marca como usar_esta = true) e esperar. Cada execução da sincronização anda um dia por vez, até o tempo
-- dela acabar (~4 min), e grava o cursor depois de cada dia.
-- Enquanto o cursor estiver atrasado, o acompanhamento verificável marca o Kommo como atrasado (cursor com mais de
-- 36 h) e a cobertura das conversas fica "parcial". É esperado e passa quando o cursor volta para perto de agora.
--
-- Passo a passo, uma conta por vez:
--  1. Rodar (a). Escolher uma linha com usar_esta = true e terminou = false. Copiar o id da coluna conexao.
--  2. Rodar (b) trocando os DOIS lugares <COLE_AQUI_O_ID_DA_CONEXAO> pelo id copiado. Deve dizer "UPDATE 1".
--     "UPDATE 0" = o cursor ainda não alcançou agora (esperar) ou já chegou na primeira conversa (terminou).
--  3. Dois minutos depois, rodar (a) de novo: o cursor_atual da conexão deve estar na data do reprocesso_desde (ou
--     andando a partir dela). Se voltou para perto de agora e o reprocesso_desde sumiu, uma sincronização que estava
--     no meio gravou por cima: rodar (b) de novo.
--  4. Esperar o cursor_atual voltar para perto de agora (horas). Rodar a seção 4 da conferência: duplicadas fora da
--     virada = 0. Se der mais que 0, PARAR o reprocesso e avisar com a saída (só client_id e contagens).
--  5. Repetir 2 a 4 até terminou = true (o reprocesso_desde chegou na primeira conversa). Depois, a próxima conta.

-- (a) Conexões do Kommo, cursor, até onde o reprocesso já chegou e a primeira conversa. Só lê.
with cx as (
  select cc.id, cc.client_id, lower(coalesce(cc.subdomain, '')) as conta,
         public.operacao_instante(cc.config->>'kommo_conversas_ate') as cursor_atual,
         cc.config->>'kommo_conversas_cobertura' as cobertura,
         public.operacao_instante(cc.config->>'kommo_reprocesso_desde') as reprocesso_desde,
         (select min(c.iniciada_em) from public.conversas c where c.client_id = cc.client_id and c.provider = 'kommo') as primeira_cliente
    from public.crm_connections cc
   where cc.provider = 'kommo' and cc.active
)
select x.id as conexao, x.client_id,
       left(md5(x.conta), 8) as conta,
       x.id = first_value(x.id) over (partition by x.conta order by x.id) as usar_esta,
       x.cursor_atual, x.cobertura, x.reprocesso_desde,
       min(x.primeira_cliente) over (partition by x.conta) as primeira_conversa,
       coalesce(x.reprocesso_desde <= min(x.primeira_cliente) over (partition by x.conta), false) as terminou,
       x.cursor_atual > now() - interval '36 hours' as cursor_em_dia
  from cx x
 order by conta, conexao;

-- (b) Volta o cursor de UMA conexão 30 dias antes de onde o reprocesso já chegou (na primeira vez, 30 dias antes do
-- cursor), sem passar da véspera da primeira conversa da conta. Mantém as outras chaves do config. Só muda se o
-- cursor já estiver em dia (perto de agora) e o reprocesso ainda não tiver chegado na primeira conversa.
update public.crm_connections cc
   set config = jsonb_set(jsonb_set(coalesce(cc.config, '{}'::jsonb), '{kommo_conversas_ate}', to_jsonb(p.ponto)),
                          '{kommo_reprocesso_desde}', to_jsonb(p.ponto))
  from (
    select x.id,
           to_char(greatest(coalesce(public.operacao_instante(x.config->>'kommo_reprocesso_desde'),
                                     public.operacao_instante(x.config->>'kommo_conversas_ate')) - interval '30 days',
                            prim.em - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ponto,
           prim.em as primeira
      from public.crm_connections x
      cross join lateral (
        select min(c.iniciada_em) as em
          from public.conversas c
          join public.crm_connections y on y.client_id = c.client_id
         where c.provider = 'kommo' and y.provider = 'kommo' and y.active
           and lower(coalesce(y.subdomain, '')) = lower(coalesce(x.subdomain, ''))
      ) prim
     where x.id = '<COLE_AQUI_O_ID_DA_CONEXAO>'::uuid
  ) p
 where cc.id = p.id
   and cc.id = '<COLE_AQUI_O_ID_DA_CONEXAO>'::uuid
   and cc.provider = 'kommo' and cc.active
   and p.primeira is not null
   and public.operacao_instante(cc.config->>'kommo_conversas_ate') > now() - interval '36 hours'
   and coalesce(public.operacao_instante(cc.config->>'kommo_reprocesso_desde'),
                public.operacao_instante(cc.config->>'kommo_conversas_ate')) > p.primeira;
