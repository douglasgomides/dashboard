-- Listas de base importadas no Clint (Dra. Marcelly: "Base (não abordado)" em Toxina, Preenchimento, Fotona…) não são
-- leads novos. Com config.etapas_base, o sync do Clint (api/_lib/clint-sync.ts ehEtapaBase) marca esses cards em
-- removido_na_origem enquanto estão na etapa de base, e desmarca quando a equipe os tira dela.
-- Reversão: remover config.etapas_base da conexão e rodar o sync (ou update crm_leads set removido_na_origem = null ...).

comment on column public.crm_leads.removido_na_origem is
  'Quando o lead deixou de valer como item vivo: sumiu na varredura de reconciliação; (FlwChat com cards_por_item) foi substituído por um card mais novo do mesmo item, em raw_payload.substituido_por; ou (Clint com etapas_base) está numa lista de base ainda não abordada. Nulo = vale.';
