-- Dra. Marcella Brasil: o FlwChat dela (Synkronos) roda na mesma API da WTS. Aponta a sincronização de atendimento
-- (sessões + conversas) para o token da conexão FlwChat dela. wts_company_id é só a chave de agrupamento da conta.
-- Reversão: update clients set wts_company_id = null, wts_api_token = null where id = '41bd8808-461e-4f77-8c65-a89eece9e538';
update public.clients c
set wts_company_id = 'flwchat-synkronos-marcella',
    wts_api_token = (select cc.access_token from public.crm_connections cc where cc.client_id = c.id and cc.provider = 'flwchat' and cc.active order by cc.created_at limit 1)
where c.id = '41bd8808-461e-4f77-8c65-a89eece9e538' and c.wts_company_id is null;
