-- crm_leads era um log de eventos (uma linha por webhook), o que colide
-- com um sync ativo via API que traz o estado atual do lead. Mantém só a
-- linha mais recente por lead (perde o histórico de transições de etapa,
-- que nunca foi usado em nenhuma tela) e vira upsert dali pra frente —
-- mesmo padrão de instagram_posts.
delete from crm_leads a
using crm_leads b
where a.crm_connection_id = b.crm_connection_id
  and a.external_lead_id = b.external_lead_id
  and a.received_at < b.received_at;

delete from crm_leads a
using crm_leads b
where a.crm_connection_id = b.crm_connection_id
  and a.external_lead_id = b.external_lead_id
  and a.received_at = b.received_at
  and a.id > b.id;

alter table crm_leads add constraint crm_leads_connection_external_unique unique (crm_connection_id, external_lead_id);
