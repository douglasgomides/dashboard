-- Desempenho (relatório do Supabase, out/2026), sem mudar quem acessa o quê:
-- 1. Índice nas 19 chaves estrangeiras sem índice (conversas, mensagens e crm_raw_events são tabelas grandes).
-- 2. Regras de acesso que recalculavam auth.uid() a cada linha passam a calcular uma vez por consulta.
-- Aplicada em partes (índices das tabelas grandes um a um) para não segurar trava longa.
-- Reversão: drop dos índices *_fk_idx e voltar auth.uid() sem o select nas 3 regras.

create index if not exists anuncios_acoes_client_fk_idx on public.anuncios_acoes (client_id);
create index if not exists aprovacoes_client_fk_idx on public.aprovacoes (client_id);
create index if not exists brain_itens_execucao_fk_idx on public.brain_itens (execucao_id);
create index if not exists campanhas_ideias_execucao_fk_idx on public.campanhas_ideias (execucao_id);
create index if not exists conversas_lead_fk_idx on public.conversas (lead_id);
create index if not exists conversas_pessoa_fk_idx on public.conversas (pessoa_id);
create index if not exists conversas_resumos_client_fk_idx on public.conversas_resumos (client_id);
create index if not exists crm_raw_events_connection_fk_idx on public.crm_raw_events (crm_connection_id);
create index if not exists ia_execucoes_execucao_fk_idx on public.ia_execucoes (execucao_id);
create index if not exists links_rastreados_post_fk_idx on public.links_rastreados (instagram_post_id);
create index if not exists mensagens_client_fk_idx on public.mensagens (client_id);
create index if not exists pautas_conteudo_post_fk_idx on public.pautas_conteudo (post_id);
create index if not exists pessoas_equipe_client_fk_idx on public.pessoas_equipe (client_id);
create index if not exists sap_conversoes_connection_fk_idx on public.sap_conversoes (crm_connection_id);
create index if not exists sap_papeis_pessoa_fk_idx on public.sap_papeis (pessoa_id);
create index if not exists sap_papeis_user_fk_idx on public.sap_papeis (user_id);
create index if not exists sap_tarefa_historico_clinica_fk_idx on public.sap_tarefa_historico (clinica_id);
create index if not exists sugestoes_agentes_execucao_fk_idx on public.sugestoes_agentes (execucao_id);
create index if not exists toques_link_fk_idx on public.toques (link_id);

alter policy "read own membership or admin reads all" on public.client_members
  using (public.is_app_admin() or user_id = (select auth.uid()) or public.is_client_member(client_id));
alter policy "sap ler propria pref" on public.sap_usuario_pref using (user_id = (select auth.uid()));
alter policy "mcp: a pessoa ve as proprias chamadas, admin ve todas" on public.mcp_chamadas
  using (user_id = (select auth.uid()) or public.is_app_admin());
