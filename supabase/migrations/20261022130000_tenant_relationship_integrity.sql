-- Duas FKs independentes para client_id e parent_id aceitam um filho de A
-- apontando para pai de B. Policies e RPCs passam a confiar em relações falsas.
-- As chaves compostas conferem o tenant, inclusive nas escritas de service_role.
-- NOT VALID mantém a migração compatível com dados legados: protege INSERT e
-- mudanças de chave imediatamente, sem apagar/corrigir silenciosamente dados.
-- Após auditar dados existentes, validar com ALTER TABLE ... VALIDATE CONSTRAINT.
create unique index if not exists instagram_accounts_id_client_uidx on public.instagram_accounts(id, client_id);
create unique index if not exists instagram_posts_id_client_uidx on public.instagram_posts(id, client_id);
create unique index if not exists crm_connections_id_client_uidx on public.crm_connections(id, client_id);
create unique index if not exists crm_leads_id_client_uidx on public.crm_leads(id, client_id);
create unique index if not exists pessoas_id_client_uidx on public.pessoas(id, client_id);
create unique index if not exists links_rastreados_id_client_uidx on public.links_rastreados(id, client_id);
create unique index if not exists conversas_id_client_uidx on public.conversas(id, client_id);
create unique index if not exists agente_execucoes_id_client_uidx on public.agente_execucoes(id, client_id);

-- As FKs simples existentes conservam suas ações ON DELETE (CASCADE / SET NULL).
-- Eventos não tinham FK anterior: seguem a exclusão da conexão, sem órfãos.
-- MATCH SIMPLE permite que um vínculo opcional fique nulo sem zerar client_id.
do $$
declare r record;
begin
  for r in select * from (values
    ('instagram_posts', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_account_daily_metrics', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_stories', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_comments', 'instagram_post_id', 'instagram_posts'),
    ('crm_leads', 'crm_connection_id', 'crm_connections'),
    ('crm_raw_events', 'crm_connection_id', 'crm_connections'),
    ('crm_leads', 'pessoa_id', 'pessoas'),
    ('crm_lead_eventos', 'crm_connection_id', 'crm_connections'),
    ('links_rastreados', 'instagram_post_id', 'instagram_posts'),
    ('toques', 'pessoa_id', 'pessoas'),
    ('toques', 'link_id', 'links_rastreados'),
    ('toques', 'instagram_post_id', 'instagram_posts'),
    ('conversas', 'pessoa_id', 'pessoas'),
    ('conversas', 'lead_id', 'crm_leads'),
    ('mensagens', 'conversa_id', 'conversas'),
    ('conversas_resumos', 'conversa_id', 'conversas'),
    ('conversas_origem_anuncio', 'conversa_id', 'conversas'),
    ('pautas_conteudo', 'post_id', 'instagram_posts'),
    ('aprovacoes', 'execucao_id', 'agente_execucoes'),
    ('ia_execucoes', 'execucao_id', 'agente_execucoes'),
    ('brain_itens', 'execucao_id', 'agente_execucoes')
  ) as rel(child_table, parent_column, parent_table)
  loop
    if not exists (select 1 from pg_constraint
      where conrelid = format('public.%I', r.child_table)::regclass
        and conname = r.child_table || '_' || r.parent_column || '_tenant_fk') then
      execute format('alter table public.%I add constraint %I foreign key (%I, client_id) references public.%I(id, client_id)%s not valid',
        r.child_table, r.child_table || '_' || r.parent_column || '_tenant_fk', r.parent_column, r.parent_table,
        case when r.child_table = 'crm_lead_eventos' then ' on delete cascade' else '' end);
    end if;
  end loop;
end $$;
