-- Quais fontes de dado este cliente realmente tem ligadas.
--
-- Existe para o menu parar de mostrar aba vazia. Mariela Muniz e Dra. Juliana
-- Paola viam "Painel CRM", "Vendas × origem" e "Estrutura do CRM" — as três
-- leem crm_leads, que é tabela de Kommo e Clint. O CRM delas é o Clinic Desk,
-- que vive em wts_sessions. As abas abriam zeradas.
--
-- Aba vazia no menu do cliente é pior que aba que não existe: ela sugere que
-- falta dado, quando na verdade falta fonte.

drop function if exists public.client_fontes(uuid);
create function public.client_fontes(p_client_id uuid)
returns table(
  tem_instagram boolean,
  tem_anuncios boolean,
  tem_crm boolean,
  tem_atendimento boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    exists (select 1 from instagram_accounts i
             where i.client_id = p_client_id and i.active),
    exists (select 1 from client_ad_accounts a
             where a.client_id = p_client_id and a.active)
      or exists (select 1 from clients c
                  where c.id = p_client_id
                    and c.meta_ad_account_id is not null
                    and c.meta_ad_account_id <> ''),
    exists (select 1 from crm_connections x
             where x.client_id = p_client_id and x.active),
    exists (select 1 from clients c
             where c.id = p_client_id and c.wts_company_id is not null)
  where public.is_app_admin() or public.is_client_member(p_client_id);
$$;
