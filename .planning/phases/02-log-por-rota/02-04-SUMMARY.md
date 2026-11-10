---
phase: 02-log-por-rota
plan: 04
subsystem: infra
tags: [verificacao, supabase, banco-yml, inp, producao, checkpoint]

requires:
  - phase: 02-log-por-rota
    provides: tabela rota_acessos, origens, aba Uso das telas (planos 02-01, 02-02, 02-03)
provides:
  - suíte da fase verificada na branch (Task 1) com as contagens do CI
  - bloco consulta-pendentes (só leitura) e medidor-inp-menu prontos para o João
affects: [03 esconder telas, 14 log ligado]

actuals:
  tokens: 7700
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Medidor de INP do menu em JS puro de console: Event Timing por interactionId, casado com o clique pelo timeStamp"

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 2 reescrita pelos fatos de produção (02-PRE-MERGE-CHECK.md): produção não tem public._migracoes_repo, então o job producao do banco.yml não aplica nada; a migration vai pelo SQL editor"

requirements-completed: []

status: halted
completed: 2026-11-09
plan_head_before: 1bbb0d92079ba1aedd767a75b2b6ee0e9039653a
plan_head_after: PENDENTE
---

# Phase 2 Plan 04: Fechamento da fase (suíte, pendentes, INP, produção) Summary

**Task 1 concluída: a branch passa na suíte com 12 funções em api/, sem pacote nem menu alterados; o SUMMARY já traz a consulta de pendentes (217 nomes, só leitura) e o medidor-inp-menu validado no Chromium. Parado no checkpoint da Task 2 (João).**

## Estado

- Task 1 (auto): feita e commitada.
- Task 2 (checkpoint:human-action, blocking-human): AGUARDA o João. Texto ajustado pelos fatos de produção (ver "Desvios").
- Task 3 (checkpoint:human-action, blocking-human): não começou; só depois da Task 2.
- Este SUMMARY é parcial (`status: halted`): o agente de continuação completa as seções "Evidências de produção" e fecha `plan_head_after`.

## D-15: base do PR e efeito automático do merge

- Base do PR: `claude/doctor-creator-hub-nixvw6` (ratificada pelo João em 09/11/2026). O PR é aberto depois, pelo passo de ship, quando o João mandar; nada foi empurrado nem aberto aqui.
- O merge dispara o `banco.yml` porque o diff tem `supabase/migrations/**` (push na base).
- Job `homolog`: aplica `20261109120000_rota_acessos.sql` no homolog sozinho, sem aprovação, se `SUPABASE_DB_URL_HOMOLOG` existir (senão o resumo do job diz "Sem SUPABASE_DB_URL_HOMOLOG: nada aplicado.").
- Job `producao`: fica parado no ambiente `producao` até o João aprovar.
- **Fato de produção (02-PRE-MERGE-CHECK.md, consultas de leitura rodadas em 09/11/2026, com autorização do João):** `public._migracoes_repo` não existe em produção; `public.resultados_diarios` existe; `public.rota_acessos` não existe. Se o job `producao` fosse aprovado, o `aplicar.sh` criaria a tabela de registro vazia e pararia na trava "registro vazio num banco com tabelas" (exit 1, "Nada aplicado"): o merge não aplicaria nada em produção. **Recomendação registrada: NÃO aprovar o job `producao` do banco.yml nesta fase; aplicar `supabase/migrations/20261109120000_rota_acessos.sql` pelo SQL editor do Supabase** (o arquivo é idempotente).
- `20261106130000_resultados_diarios.sql` foi editado depois de aplicado (a guarda do cron para o banco de teste; o conteúdo no repo diverge do que rodou). O `aplicar.sh` rastreia por nome em `public._migracoes_repo` e não o roda de novo, nem no homolog nem em produção. Ninguém deve rodá-lo de novo. Não foi rodado por ninguém.

## Task 1: resultados

Origem de cada resultado: "orquestrador" = rodado pelo orquestrador no commit base 1bbb0d9 (mesma árvore de código desta tarefa; nenhum arquivo de código mudou depois); "executor" = rodado neste worktree.

| Passo do CI | Resultado | Quem |
|-------------|-----------|------|
| `npm ci` | dispensado por pedido do dono: `node_modules` ligado por link simbólico (não commitado) | executor |
| `npm run secrets:check` | passou (1118 arquivos) | executor |
| `npm run lint` | limpo | executor |
| `npm run typecheck` | só os erros do baseline: `scripts/test-perfil-da-clinica.ts(385)` e `workers/creative/intelligence.ts` | orquestrador, base 1bbb0d9 |
| `npm test` | 171/177; só as 6 falhas do baseline (test-creative-discovery, test-creative-theme, test-kommo-closed-at, test-nao-medido, test-status-que-nao-mente, test-tela-honesta) | orquestrador, base 1bbb0d9 |
| `npm run build` | exit 0 (orquestrador na base; executor repetiu com as variáveis do CI para os e2e) | orquestrador + executor |
| `tests/e2e/rota-log.spec.ts` + `tests/e2e/uso-das-telas.spec.ts` | 21/21 | orquestrador, base 1bbb0d9 |
| `npm run test:e2e` (suíte inteira) | 308 passaram, 20 falharam (328). As 20 são as falhas que já existiam: 9 listadas em deferred-items.md (navigation-architecture:8 x2, routes:12 /pacientes x2, workspace-navigation:8, :48, :137, :263 x2) e mais 11 (agents-workspace:99 e :109, audit-reliability:4, auth-profile:4 e :31, numbers-first:7 x2, :60, :90, :265, :274) que falham de forma idêntica no commit 8f719b4, anterior à fase (conferido num worktree temporário, já removido: 11 falhas e 37 passes nesses 4 arquivos, igual à branch). Nenhuma falha nova; `navigation-architecture.spec.ts:82` (viewer) passa. O critério "test:e2e sai com 0" não é atingível por falhas do baseline; ver Desvios. | executor |
| `npm run test:interface` | passou: 19 interface checks passed | executor |

Verificações da fase (executor):

| Verificação | Resultado |
|-------------|-----------|
| Funções em `api/` (`.ts` fora de `_lib` e `_assets`) | **12** (baseline em 8f719b4: 12) |
| `git diff --quiet 8f719b4 -- package.json package-lock.json src/lib/nav.ts src/lib/sap-navigation.ts` | exit 0 (iguais; prohibition LOG-01 e T-02-SC) |
| Nome da migration nova casa `^[0-9]+_[a-z0-9_]+\.sql$` | sim; 217 arquivos em supabase/migrations, todos no padrão |
| Telefone nas linhas acrescentadas fora de `.planning` (`+55`, DDD com hífen) | 0 |
| E-mail fora de `example.test` nas linhas acrescentadas | 0 (nenhum e-mail aparece) |
| Medidor `medidor-inp-menu` no Chromium do Playwright | `medidor: ok` (ver abaixo) |

Contagens de migration: 217 na branch (216 em 8f719b4 mais `20261109120000_rota_acessos.sql`).

## Consulta de pendentes (CD-07, D-15): só leitura

Para o João colar no SQL editor, **um banco por vez**. É uma consulta só: a primeira linha traz a contagem do registro (zero faz o `aplicar.sh` parar) e as demais os arquivos que o `aplicar.sh` aplicaria no próximo merge. Em produção, por 02-PRE-MERGE-CHECK.md, o esperado é o erro `relation "public._migracoes_repo" does not exist` (o registro não existe lá). Nada neste bloco escreve.

```sql
-- consulta-pendentes: inicio
select 0 as ordem, 'linhas_no_registro' as item, (select count(*) from public._migracoes_repo)::text as valor
union all
select f.ordem, 'pendente' as item, f.arquivo as valor
from unnest(array[
    '20260822000000_fase1_schema.sql',
    '20260824170000_admin_roles.sql',
    '20260824180000_inspiration_posts.sql',
    '20260824190000_fix_rls_security_holes.sql',
    '20260824200000_crm_connections.sql',
    '20260825150000_drop_methodology_stages.sql',
    '20260825160000_kommo_webhook_ingest.sql',
    '20260825170000_crm_raw_events_capture.sql',
    '20260825213000_instagram_backfill_state.sql',
    '20260825223000_instagram_comments.sql',
    '20260826010000_kommo_pipeline_statuses.sql',
    '20260826020000_crm_leads_sync_state.sql',
    '20260826021500_crm_leads_dedupe_and_unique.sql',
    '20260826023000_crm_leads_allow_sync_event_type.sql',
    '20260826040000_crm_funnel_rpc.sql',
    '20260826050000_crm_pipeline_kanban_rpc.sql',
    '20260826060000_crm_metricas_essenciais_rpc.sql',
    '20260826070000_crm_atividade_recente_rpc.sql',
    '20260908120000_reel_retention_metrics.sql',
    '20260908190000_meta_ads.sql',
    '20260908210000_ads_diagnostico.sql',
    '20260908223000_ads_criativo.sql',
    '20260909140000_crm_normalizado_e_clint.sql',
    '20260909160000_crm_funcoes_multiprovedor.sql',
    '20260909180000_token_meta_por_conta.sql',
    '20260909180502_wts_atendimento.sql',
    '20260909180530_wts_atendimento_rpcs.sql',
    '20260909193000_wts_departamento_extinto.sql',
    '20260909210000_perfil_do_cliente_avatar.sql',
    '20260909220000_crm_reconciliacao.sql',
    '20260910180000_cliente_multiplas_contas_e_equipes_wts.sql',
    '20260911010000_client_fontes.sql',
    '20260930120000_cadastro_campos_legados.sql',
    '20261001120000_sync_status.sql',
    '20261001130000_seguranca_flw_e_tokens.sql',
    '20261001140000_rdstation_provider.sql',
    '20261002120000_flwchat_provider.sql',
    '20261002140000_crm_etapa_resultado.sql',
    '20261002150000_crm_etapa_kpi.sql',
    '20261006150000_crm_periodo.sql',
    '20261007120000_instagram_stories.sql',
    '20261008100000_sync_motivo.sql',
    '20261008200000_jornada_identidade.sql',
    '20261008210000_jornada_ajuste_instagram.sql',
    '20261008220000_jornada_liga_flwchat.sql',
    '20261008230000_jornada_leitura.sql',
    '20261011120000_sap_tracker.sql',
    '20261013120000_seguidores_saidas.sql',
    '20261013150000_crm_diagnostico_comercial.sql',
    '20261013200000_correcoes_auditoria_dados.sql',
    '20261013210000_acompanhamento_acoes.sql',
    '20261013230000_qualidade_dos_dados.sql',
    '20261013233000_crm_base_viva.sql',
    '20261013240000_conversas_leitura.sql',
    '20261013250000_cobertura_periodo.sql',
    '20261013260000_crm_guia_dados.sql',
    '20261013270000_auditoria_comercial.sql',
    '20261014090000_custo_whatsapp.sql',
    '20261014100000_anuncios_acoes.sql',
    '20261014105000_conversas_origem_anuncio.sql',
    '20261014110000_qualidade_leads_campanha.sql',
    '20261014120000_ads_planilha_semanal.sql',
    '20261014120000_shortio_links.sql',
    '20261014130000_conferencias_dados.sql',
    '20261014140000_jornada_funil.sql',
    '20261014150000_pautas_conteudo.sql',
    '20261014160000_campanhas_base.sql',
    '20261014170000_jornada_resumo_periodo.sql',
    '20261014180000_contas_anuncio_compartilhadas.sql',
    '20261014190000_status_fontes_clientes.sql',
    '20261014200000_roi_periodo.sql',
    '20261015090000_sap_tracker_auto.sql',
    '20261015120000_sap_baseline_metas.sql',
    '20261015150000_sap_scores.sql',
    '20261016090000_crm_eventos_visoes.sql',
    '20261016120000_sap_cronograma_pausas.sql',
    '20261016150000_sap_onboarding_acoes.sql',
    '20261016180000_sap_sinais_motivos_auditoria.sql',
    '20261016210000_sap_documentos.sql',
    '20261017090000_sap_nova_clinica.sql',
    '20261017120000_sap_verba_fidelizacao.sql',
    '20261017150000_sap_rastreamento_conversoes.sql',
    '20261017160000_sap_conversoes_reabrir.sql',
    '20261017171119_hosted_credential_boundary.sql',
    '20261017172557_literal_people_search.sql',
    '20261017180000_sap_modo_sessao.sql',
    '20261017200000_sap_auditoria_ia.sql',
    '20261018090000_sap_leads_atencao_atendentes.sql',
    '20261018100000_digisac_conector.sql',
    '20261018120000_movimentos_agendaram_leads_distintos.sql',
    '20261018120000_sap_tarefas_unificadas.sql',
    '20261018130000_funil_agendou_inclui_quem_ja_passou.sql',
    '20261018130000_sap_leads_atencao_comercial.sql',
    '20261018140000_sap_atendente_sem_null.sql',
    '20261018150000_sap_banco_anuncios.sql',
    '20261019120000_sap_prontidao_integridade.sql',
    '20261020120000_cliente_modulos.sql',
    '20261020130000_agentic_core.sql',
    '20261020140000_equipe_pessoas.sql',
    '20261021120000_brand_brain.sql',
    '20261021140000_brand_brain_beta_hub.sql',
    '20261021150000_tem_modulo_servidor.sql',
    '20261021160000_kommo_mensagens_indice.sql',
    '20261021170000_receita_em_jogo.sql',
    '20261021180000_marcella_atendimento_flwchat.sql',
    '20261021190000_robo_nas_conversas.sql',
    '20261021200000_experimento_semana.sql',
    '20261021210000_origem_por_texto.sql',
    '20261021220000_sla_sem_resposta.sql',
    '20261021230000_receita_por_canal.sql',
    '20261021240000_mcp_chamadas.sql',
    '20261021250000_clients_esconder_tokens.sql',
    '20261021260000_ad_accounts_esconder_token.sql',
    '20261021270000_campanhas_ideias.sql',
    '20261021280000_sugestoes_agentes.sql',
    '20261021290000_desempenho_indices_rls.sql',
    '20261021300000_agentes_aprendizados.sql',
    '20261021310000_atendente_piloto.sql',
    '20261021320000_rastreio_links_v2.sql',
    '20261021330000_reels_transcricao.sql',
    '20261021340000_anuncios_mudancas.sql',
    '20261021350000_prova_resultado.sql',
    '20261022002201_crm_operacao_piloto.sql',
    '20261022090000_acompanhamento_verificavel.sql',
    '20261022120000_security_tenant_boundaries.sql',
    '20261022130000_tenant_relationship_integrity.sql',
    '20261022140000_jornada_read_contracts.sql',
    '20261022150000_jornada_revenue.sql',
    '20261022160000_receita_em_jogo_integrity.sql',
    '20261022170000_reconcile_hosted_security.sql',
    '20261022180000_conversoes_da_conversa.sql',
    '20261022190000_consultas_atendimento_rapidas.sql',
    '20261023090000_creative_intelligence.sql',
    '20261023091000_creative_integrity.sql',
    '20261023100000_conteudo_comercial.sql',
    '20261023110000_links_final_personalizado.sql',
    '20261023120000_creative_artes.sql',
    '20261023120001_auditoria_profissional_fluxos.sql',
    '20261023130000_plano_semana.sql',
    '20261023140000_reconcilia_producao.sql',
    '20261023150000_conteudo_comercial_profundo.sql',
    '20261023150001_radar_references_planner.sql',
    '20261023150002_central_atendimento_oficial.sql',
    '20261023150003_central_cancelar_resposta_preparada.sql',
    '20261023160000_reunioes.sql',
    '20261023170000_crm_pessoas_resumo_periodo.sql',
    '20261023170000_relacionamento_pessoas.sql',
    '20261026120000_orcamentos_por_tipo.sql',
    '20261027120000_crm_card_substituido.sql',
    '20261027170000_sap_anexos.sql',
    '20261027180000_sap_anexos_search_path.sql',
    '20261028120000_crm_base_nao_abordada.sql',
    '20261028150000_funis_periodo_e_canal.sql',
    '20261029120000_roi_por_objetivo.sql',
    '20261029130000_origem_pelo_canal_kommo.sql',
    '20261029150000_crm_contato_tags.sql',
    '20261029160000_fontes_e_numeros_unicos.sql',
    '20261030120000_crm_sem_apagados.sql',
    '20261030130000_crm_conferencia.sql',
    '20261030140000_origem_por_todos_os_sinais.sql',
    '20261030150000_origem_tags_contato_clint.sql',
    '20261030160000_origem_rotulos_anuncio_e_base.sql',
    '20261030170000_lead_novo_por_pessoa.sql',
    '20261030180000_pessoa_kommo_contato_primeiro.sql',
    '20261030190000_auditoria_alertas_medios.sql',
    '20261030200000_clientes_de_teste.sql',
    '20261030205000_origem_pela_mensagem_e_etapa.sql',
    '20261030210000_ia_falhas_por_conversa.sql',
    '20261030220000_eventos_sem_reclassificacao.sql',
    '20261030230000_regua_origem_igual_roi.sql',
    '20261030240000_clint_formulario_antes_das_tags.sql',
    '20261030250000_alertas_ganho_e_papel_funil.sql',
    '20261030260000_alerta_funil_fora_da_config.sql',
    '20261030270000_limite_de_gasto_anuncios.sql',
    '20261030280000_limpeza_flw_e_gatilhos.sql',
    '20261030290000_alcance_7_dias.sql',
    '20261030300000_card_fechado_na_origem.sql',
    '20261031100000_vendas_do_periodo.sql',
    '20261031110000_roi_receita_dos_anuncios.sql',
    '20261031111000_fechado_sem_resultado_nas_telas.sql',
    '20261031112000_fila_do_whatsapp.sql',
    '20261031120000_tema_unico_e_pessoas.sql',
    '20261031130000_preco_sem_resposta.sql',
    '20261031131000_agentes_saude.sql',
    '20261031140000_links_curtos_piloto.sql',
    '20261031150000_pacientes_do_periodo.sql',
    '20261031160000_pacientes_kommo_e_tempo.sql',
    '20261031161000_papel_atendimento_clinica.sql',
    '20261031162000_pacientes_crm_compartilhado.sql',
    '20261031170000_vendas_checkout.sql',
    '20261101100000_prova_resultado_agendou_comercial.sql',
    '20261101110000_roi_vendas_com_canal.sql',
    '20261101130000_nao_medido_no_lugar_de_zero.sql',
    '20261102100000_status_que_nao_mente.sql',
    '20261102110000_instagram_dia_certo.sql',
    '20261102120000_data_real_da_venda.sql',
    '20261102130000_hubla_cobertura.sql',
    '20261102140000_tela_honesta.sql',
    '20261102150000_apis_resilientes.sql',
    '20261102160000_crm_por_medico.sql',
    '20261102170000_crm_por_medico_rapido.sql',
    '20261102180000_conferencia_ao_vivo.sql',
    '20261102190000_restos_auditoria.sql',
    '20261102210000_docs_apis_itens.sql',
    '20261103090000_sap_formularios.sql',
    '20261104100000_perfil_da_clinica.sql',
    '20261105100000_perfil_da_clinica_resto.sql',
    '20261105110000_atendimento_pelas_conversas.sql',
    '20261105120000_resultado_pronto.sql',
    '20261105130000_resultado_pronto_geral.sql',
    '20261105140000_perfil_da_clinica_telas_restantes.sql',
    '20261105150000_funis_periodo_venda_por_pessoa.sql',
    '20261105160000_recuperacao_sem_resposta.sql',
    '20261105170000_jornada_compraram_e_whatsapp_kommo.sql',
    '20261106120000_clinica_metas.sql',
    '20261106130000_resultados_diarios.sql',
    '20261109120000_rota_acessos.sql'
]) with ordinality as f(arquivo, ordem)
where not exists (select 1 from public._migracoes_repo r where r.arquivo = f.arquivo)
order by 1;
-- consulta-pendentes: fim
```

## Medidor de INP do menu (LOG-04, critério 4)

Para o João colar no console do DevTools do Chrome (JavaScript puro, sem import, sem depender do código da fase, não faz requisição nem usa storage, só escreve no console). Cada número é a duração de um clique no link do menu lateral (do clique até a tela seguinte ser pintada), não o INP da página inteira. Como usar: colar, esperar "medidor-inp-menu ligado", clicar no menu (esperando cada tela aparecer), digitar `inpMenu("admin")` ou `inpMenu("viewer")` e copiar a última linha, a que começa com `INP-MENU`.

```javascript
// medidor-inp-menu: inicio
(function () {
  var seletorMenu = 'aside[aria-label="Menu principal"]';
  if (!document.querySelector(seletorMenu)) {
    console.log("menu principal não encontrado");
    return;
  }
  if (typeof PerformanceObserver === "undefined") {
    console.log("Event Timing indisponível neste navegador (use o Chrome)");
    return;
  }
  var cliques = [];
  var interacoes = {};
  document.addEventListener("click", function (event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;
    if (!alvo.closest("a[href]")) return;
    if (!alvo.closest(seletorMenu)) return;
    cliques.push(event.timeStamp);
  }, true);
  function guardar(lista) {
    lista.forEach(function (entrada) {
      if (!entrada.interactionId) return;
      var atual = interacoes[entrada.interactionId] || { duracao: 0, inicioClique: null };
      if (entrada.duration > atual.duracao) atual.duracao = entrada.duration;
      if (entrada.name === "click") atual.inicioClique = entrada.startTime;
      interacoes[entrada.interactionId] = atual;
    });
  }
  var observador = new PerformanceObserver(function (lista) { guardar(lista.getEntries()); });
  try {
    observador.observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch (erro) {
    console.log("Event Timing indisponível neste navegador (use o Chrome)");
    return;
  }
  window.inpMenu = function (conta) {
    guardar(observador.takeRecords());
    var lista = Object.keys(interacoes).map(function (k) { return interacoes[k]; });
    var amostras = [];
    var abaixoDe16 = 0;
    cliques.forEach(function (momento, i) {
      var achada = null;
      lista.forEach(function (it) {
        if (it.inicioClique !== null && Math.abs(it.inicioClique - momento) <= 1) achada = it;
      });
      var ms = 16;
      if (achada) { ms = Math.round(achada.duracao); } else { abaixoDe16++; }
      amostras.push(ms);
      console.log("clique " + (i + 1) + ": " + ms + " ms");
    });
    var ordenadas = amostras.slice().sort(function (a, b) { return a - b; });
    var meio = Math.floor(ordenadas.length / 2);
    var mediana = ordenadas.length === 0 ? null
      : (ordenadas.length % 2 ? ordenadas[meio] : Math.round((ordenadas[meio - 1] + ordenadas[meio]) / 2));
    console.log("INP-MENU " + JSON.stringify({ conta: conta, amostras: amostras, abaixoDe16: abaixoDe16, mediana: mediana }));
  };
  console.log("medidor-inp-menu ligado");
})();
// medidor-inp-menu: fim
```

Regras do medidor: clique fora do menu lateral não conta; clique sem interação reportada pelo navegador (abaixo de 16 ms) entra como 16 e é contado em `abaixoDe16` (mesma regra no antes e no depois); a mediana de número par é a média das duas do meio, arredondada.

## Para o João: Task 2 (checkpoint, antes do merge), texto ajustado

Nada disto muda banco nem site. Detalhes do ajuste na seção "Desvios".

1. **Decisão de produção (substitui a consulta de pendentes em produção):** responder se aceita o que 02-PRE-MERGE-CHECK.md mostra: produção não tem `public._migracoes_repo`, então o job `producao` do banco.yml **não deve ser aprovado** e a migration `20261109120000_rota_acessos.sql` será aplicada por você no SQL editor do Supabase (cvdnzoqduliopscfsrkc) na Task 3. Se preferir rodar a consulta de pendentes em produção mesmo assim, o resultado esperado é o erro de relação inexistente.
2. **Homolog (opcional):** se o banco de homolog existir, rodar o bloco consulta-pendentes lá e responder a contagem (primeira linha) e a lista. Esperado: contagem > 0 e lista com uma linha só, `20261109120000_rota_acessos.sql`; `20261106130000_resultados_diarios.sql` não pode aparecer. Se o resumo do job homolog disser "Sem SUPABASE_DB_URL_HOMOLOG", responder "homolog sem banco configurado". Se o homolog trouxer outros arquivos, só segue se você escrever, com estas palavras, que aceita que o merge aplique esses arquivos no homolog.
3. **Conta viewer (obrigatória):** usar uma viewer que você controla, de preferência da CLÍNICA TESTE SAP V2 (`eh_teste = true`, fora da visão agregada por padrão, D-09). Se não existir, criar em /admin/[CLÍNICA TESTE SAP V2] → Criar acesso → Papel Viewer, com um e-mail seu.
4. **Medir o antes** (o site no ar ainda não tem o log):
   a. Em https://dash.doctorcreator.com.br, logado como admin, abrir a clínica Lana, DevTools → Console, colar o bloco medidor-inp-menu inteiro e Enter. Tem de aparecer "medidor-inp-menu ligado"; se aparecer "menu principal não encontrado", parar e avisar.
   b. Pelo menos 5 trocas de tela clicando nos itens do menu lateral, alternando Pacientes e Atendimento, esperando a tela aparecer antes do próximo clique. Não recarregar a página (recarregar apaga o medidor; se acontecer, colar de novo e recomeçar a conta).
   c. Digitar `inpMenu("admin")` e Enter; copiar a última linha (a que começa com INP-MENU).
   d. Sair, entrar com a conta viewer (o login recarrega a página), colar o bloco de novo, pelo menos 5 trocas entre duas telas do menu lateral, digitar `inpMenu("viewer")` e copiar a linha INP-MENU.
5. **Responder com** "pendentes ok" (ou o que diferir), a decisão do item 1, a contagem e a lista do homolog (ou "homolog sem banco configurado"), a clínica e o papel da conta viewer (sem e-mail) e as duas linhas INP-MENU de antes, coladas como o console imprimiu.

Aviso de privacidade: não colar e-mail, user_id nem linha bruta; só contagens e as linhas INP-MENU.

## Para o João: Task 3 (depois da Task 2), texto ajustado

1. O PR sai pelo passo de ship (`/gsd-ship 2`), base `claude/doctor-creator-hub-nixvw6`; você faz o merge (sem bypass) e espera a Vercel publicar. O merge dispara o banco.yml: o job `homolog` aplica a migration no homolog sozinho (conferir "Aplicando 20261109120000_rota_acessos.sql" e "Migrações aplicadas: 1", se houver homolog configurado). **Não aprovar o job `producao`** (ele só criaria o registro vazio e pararia); se quiser, rejeitar a espera para não deixar a execução pendurada.
2. Aplicar em produção só pelo SQL editor: colar e rodar o arquivo `supabase/migrations/20261109120000_rota_acessos.sql` (idempotente). Não rodar `20261106130000_resultados_diarios.sql` de novo.
3. Conferir o cron: `select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';` → 1 linha com `40 6 * * *`. Conferir também `select to_regclass('public.rota_acessos');` → `rota_acessos`.
4. Repetir o passo 4 da Task 2 (mesmo medidor, mesmas duas contas, mesmas telas, pelo menos o mesmo número de trocas por conta) e copiar as duas linhas INP-MENU de depois. Na aba Network, o POST `rota_acessos` sai depois das requisições da tela. Bloquear a URL `*rota_acessos*` (Network → Block request URL) e abrir 3 telas pelo menu: todas abrem.
5. Print de /admin/conferencia → aba "Uso das telas", 7 dias, em "Clínicas" e em "Equipe", com aberturas reais; conferir "Registro ligado desde" e o rótulo "só redireciona".
6. Depois de 24 h (leitura):
   - `select eh_equipe, papel, count(*) from public.rota_acessos where criado_em > now() - interval '24 hours' group by 1, 2 order by 1, 2;` → pelo menos (true, admin) e (false, viewer)
   - `select count(*) from public.rota_acessos where rota ~ '[?#]' or rota !~ '^/' or rota ~* 'https?:' or rota ~* '[0-9a-f]{8}-[0-9a-f]{4}';` → 0
   - `select min(criado_em) from public.rota_acessos;` → data de início do log (D-14)
   - `select origem, count(*) from public.rota_acessos group by 1 order by 2 desc;` → informativo
   - `select count(*) from public.rota_acessos where origem <> 'bloqueada' and rota in ('/_authenticated/', '/_authenticated/$clientId/aquisicao', '/_authenticated/$clientId/conversas', '/_authenticated/$clientId/marketing', '/_authenticated/$clientId/sap/', '/_authenticated/$clientId/sap/etapas', '/_authenticated/$clientId/sap/execucao', '/_authenticated/$clientId/sap/leitura', '/_authenticated/$clientId/sap/metas', '/_authenticated/admin/aquisicao', '/_authenticated/sap/$clientId/semana', '/_authenticated/sap/$clientId/passo-a-passo');` → 0 (D-16)
7. Responder "no ar" com as duas linhas INP-MENU de depois, as saídas das consultas (só contagens e a data) e o print conferido.

## Critério 1 do ROADMAP como ajustado pela D-16 (ratificada pelo João em 09/11/2026)

Tela negada por guarda (admin, SAP) grava `bloqueada` e o destino grava `redirecionamento`. As 12 rotas que só redirecionam pela configuração não ganham linha própria: quem passa por elas aparece na tela de destino com origem `redirecionamento`, e a aba as mostra com o rótulo "só redireciona". A consulta da D-16 (Task 3, passo 6) deve devolver 0.

## Evidências de produção (a preencher na continuação)

- Registro `public._migracoes_repo`, produção: não existe (02-PRE-MERGE-CHECK.md). Homolog: PENDENTE (resposta do João).
- Conta viewer (clínica e papel, sem e-mail): PENDENTE.
- Linhas INP-MENU de antes (admin e viewer, coladas como saíram): PENDENTE.
- Mediana combinada do antes: PENDENTE.
- Linhas INP-MENU de depois, mediana combinada, diferença (limite 50 ms): PENDENTE (Task 3).
- cron `rota-acessos-limpeza` em produção: PENDENTE (Task 3).
- Consultas de 24 h, privacidade, origens e D-16 (só contagens): PENDENTE (Task 3).
- Data de início do log (min(criado_em)): PENDENTE; STATE: "log por rota ligado em produção desde DD/MM/AAAA; Phase 3 pode esconder telas a partir de DD/MM/AAAA + 7 dias corridos" (D-14).
- Print da aba "Uso das telas" conferido: PENDENTE.

## Deviations from Plan

**1. [Pedido do orquestrador, fatos de produção] Task 2 e Task 3 reescritas quanto ao job `producao` e à consulta de pendentes em produção**
- **Found during:** pré-conferência do orquestrador (02-PRE-MERGE-CHECK.md), antes da Task 2.
- **Issue:** a Task 2 exige "produção devolve exatamente `20261109120000_rota_acessos.sql` com registro > 0"; mas `public._migracoes_repo` não existe em produção, então a consulta de produção não pode devolver isso e o job `producao` do banco.yml, se aprovado, criaria o registro vazio e pararia na trava. A Task 3 manda "aprovar o job producao ... ou SQL editor".
- **Fix:** o checkpoint pede ao João a decisão de não aprovar o job `producao` e aplicar a migration pelo SQL editor (alternativa já permitida pela Task 3); a consulta de pendentes passa a valer só para o homolog (opcional). A intenção do plano (CD-07: nenhuma migration inesperada aplicada, `20261106130000_resultados_diarios.sql` não reexecutada) fica garantida por outro caminho: a aplicação em produção é só o arquivo da fase, rodado à mão, e o registro vazio impede o `aplicar.sh` de aplicar qualquer outra. O critério "a lista de produção é exatamente rota_acessos e registro > 0" não é atingível e fica substituído por "produção sem registro, nada aplicado pelo workflow, migration aplicada pelo SQL editor".
- **Files modified:** nenhum (só este SUMMARY).

**2. [Rule 3 - Bloqueio menor] Consulta de pendentes em uma só instrução**
- **Found during:** Task 1.
- **Issue:** o SQL editor do Supabase mostra só o resultado da última instrução; duas consultas separadas esconderiam a contagem do registro.
- **Fix:** uma consulta com `union all`: a primeira linha é a contagem do registro e as demais os pendentes, em ordem. Continua só leitura e cobre os 217 nomes.
- **Files modified:** nenhum (só este SUMMARY).

**3. [Reuso de resultados do orquestrador] `npm ci`, `typecheck`, `npm test`, build e 2 specs e2e não foram repetidos**
- Por pedido do dono (velocidade): `node_modules` por link simbólico; resultados do orquestrador no commit base 1bbb0d9 reaproveitados e rotulados acima. O executor rodou o que faltava: secrets:check, lint, build com as variáveis do CI, `test:e2e` completo, `test:interface`, os cortes de grep e o medidor.

**4. [Escopo] `npm run test:e2e` não sai com 0 por 20 falhas do baseline**
- **Found during:** Task 1.
- **Issue:** o critério pede saída 0; a suíte tem 20 falhas que existem sem a fase (9 já em deferred-items.md; 11 novas no registro, idênticas em 8f719b4).
- **Fix:** nenhum (fora do escopo, não causadas pela fase); registradas em deferred-items.md. Nenhum teste da fase falha (rota-log, uso-das-telas, routes exceto /pacientes, navigation-architecture:82 passam).
- **Files modified:** .planning/phases/02-log-por-rota/deferred-items.md

**Total deviations:** 4. Sem mudança de código nem de escopo.

## Issues Encountered

Ver "Task 1: resultados". Falhas de e2e que já existiam no base 9c8344d estão em `.planning/phases/02-log-por-rota/deferred-items.md`.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma superfície nova (este plano não altera código). O medidor não faz requisição nem usa storage (conferido por grep, T-02-24).

## User Setup Required

**Ação do João:** Task 2 e Task 3 acima. Nenhum SQL foi rodado pelo agente em banco remoto; o banco.yml não foi acionado.

