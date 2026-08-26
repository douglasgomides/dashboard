-- O sync ativo via API (kommo-leads-sync.ts) grava snapshots completos do
-- lead, não um evento de webhook — precisa de um event_type próprio pra
-- não fingir ser um "add" que nunca aconteceu.
alter table crm_leads drop constraint crm_leads_event_type_check;
alter table crm_leads add constraint crm_leads_event_type_check check (event_type = any (array['add','status','delete','sync']));
