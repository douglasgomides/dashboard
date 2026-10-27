-- Card substituído por um card mais novo do mesmo item (Support Clinic → WTS, Dr. Sergio Maia).
-- A integração cria um card novo a cada mudança de status do orçamento; o antigo fica parado em Pendente ou Orçado.
-- O sync do FlwChat (config.cards_por_item, api/_lib/flwchat-sync.ts marcarSubstituidos) marca esse card em
-- removido_na_origem e grava raw_payload.substituido_por; as funções do CRM já ignoram removido_na_origem.
-- A marcação é refeita a cada sync. Reversão: update crm_leads set removido_na_origem = null
--   where provider = 'flwchat' and raw_payload->>'substituido_por' is not null;

comment on column public.crm_leads.removido_na_origem is
  'Quando o lead deixou de existir como item vivo na origem: sumiu na varredura de reconciliação, ou (FlwChat com cards_por_item) foi substituído por um card mais novo do mesmo item, indicado em raw_payload.substituido_por. Nulo = vale.';
