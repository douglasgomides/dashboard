-- NÃO é migração: rodar à mão, só o João, no SQL editor do projeto de produção. Agentes não rodam este arquivo.
-- Rodar DEPOIS de aplicar 20261114100000_origem_e_cobertura_do_crm.sql e DEPOIS que a equipe confirmou os canais e
-- funis em Configurar CRM > Guia (a confirmação já refaz o próprio canal; este roteiro refaz o resto).
--
-- O que faz: o gatilho de origem só relê a origem quando o lead é regravado. Os leads parados (sem origem) não
-- passaram pela regra nova (anúncio do Meta no Kommo, campos de anúncio da Clint, etiquetas do card do FlwChat, canal
-- ou funil confirmado). Aqui eles são regravados (source = null), em lotes de 2000, uma conexão por vez, e o gatilho
-- preenche. Só entram no lote os leads que a regra nova consegue preencher: lead que continua sem nada não é tocado,
-- então a repetição chega a "UPDATE 0".
--
-- Como rodar:
--  (a) Colar o SELECT (a) sozinho. Ele mostra, por conexão, quantos leads estão sem origem e quantos a regra nova
--      preenche (coluna vai_preencher). Só lê.
--  (b) Para cada conexão com vai_preencher > 0, copiar o crm_connection_id dela, trocar o texto
--      COLE-AQUI-O-ID-DA-CONEXAO no UPDATE (b) e colar o UPDATE sozinho. Repetir até aparecer "UPDATE 0"
--      (Success. No rows returned / 0 rows). Contar quantos lotes rodaram. Depois, a próxima conexão.
--  (b2) Opcional, por clínica com WhatsApp ligado: o SELECT (b2) aplica a leitura da primeira mensagem, da etapa
--      "paciente recorrente" e do anúncio da conversa aos leads que continuam sem origem (o sync da Clint já faz isso
--      sozinho; para Kommo, FlwChat e Digisac, só por aqui). Trocar COLE-AQUI-O-ID-DA-CLINICA. Devolve quantos mudaram.
--  (c) Colar o SELECT (c) sozinho: o mesmo do (a), depois. vai_preencher tem de ser 0 em todas as conexões.
-- Rodar de novo é seguro: o (b) devolve UPDATE 0.

-- (a) ANTES, por conexão (só lê) --------------------------------------------------------------------------------
select l.crm_connection_id, l.client_id, l.provider,
       count(*) as sem_origem,
       count(*) filter (where
         (l.canal_id is not null and exists (select 1 from public.crm_canais_origem co
            where co.crm_connection_id = l.crm_connection_id and co.canal_id = l.canal_id and co.conclusivo))
         or (public.crm_origem_inferida(l.provider, l.raw_payload)).origem is not null
         or (l.pipeline_id is not null and exists (select 1 from public.crm_canais_origem co
            where co.crm_connection_id = l.crm_connection_id and co.canal_id = 'funil:' || l.pipeline_id and co.conclusivo))
       ) as vai_preencher
  from public.crm_leads l
  join public.crm_connections c on c.id = l.crm_connection_id and c.active
 where nullif(btrim(l.source), '') is null and l.removido_na_origem is null
 group by l.crm_connection_id, l.client_id, l.provider
 order by vai_preencher desc, sem_origem desc;

-- (b) UM LOTE de uma conexão (repetir até UPDATE 0) ---------------------------------------------------------------
update public.crm_leads set source = null
 where id in (
   select l.id from public.crm_leads l
    where l.crm_connection_id = 'COLE-AQUI-O-ID-DA-CONEXAO'::uuid
      and nullif(btrim(l.source), '') is null and l.removido_na_origem is null
      and ((l.canal_id is not null and exists (select 1 from public.crm_canais_origem co
              where co.crm_connection_id = l.crm_connection_id and co.canal_id = l.canal_id and co.conclusivo))
           or (public.crm_origem_inferida(l.provider, l.raw_payload)).origem is not null
           or (l.pipeline_id is not null and exists (select 1 from public.crm_canais_origem co
              where co.crm_connection_id = l.crm_connection_id and co.canal_id = 'funil:' || l.pipeline_id and co.conclusivo)))
    limit 2000);

-- (b2) Opcional: mensagem, etapa e anúncio da conversa, uma clínica ------------------------------------------------
select public.crm_aplicar_origem_externa('COLE-AQUI-O-ID-DA-CLINICA'::uuid) as leads_preenchidos;

-- (c) DEPOIS, por conexão (só lê) -------------------------------------------------------------------------------
select l.crm_connection_id, l.client_id, l.provider,
       count(*) as sem_origem,
       count(*) filter (where
         (l.canal_id is not null and exists (select 1 from public.crm_canais_origem co
            where co.crm_connection_id = l.crm_connection_id and co.canal_id = l.canal_id and co.conclusivo))
         or (public.crm_origem_inferida(l.provider, l.raw_payload)).origem is not null
         or (l.pipeline_id is not null and exists (select 1 from public.crm_canais_origem co
            where co.crm_connection_id = l.crm_connection_id and co.canal_id = 'funil:' || l.pipeline_id and co.conclusivo))
       ) as vai_preencher
  from public.crm_leads l
  join public.crm_connections c on c.id = l.crm_connection_id and c.active
 where nullif(btrim(l.source), '') is null and l.removido_na_origem is null
 group by l.crm_connection_id, l.client_id, l.provider
 order by vai_preencher desc, sem_origem desc;
