---
status: awaiting_human_verify
trigger: "Carteira (admin) mostra Douglas Gomides com 'Anúncios: erro', '3 dados com erro · 1 afeta a leitura', Nota 55. sync_status.last_error de anúncios = 'Conta final 2463: Meta: uso em 202% do limite da conta. Chamadas pausadas por cerca de 29 min...'. Dado completo até 11/11. João: isso não pode acontecer."
created: 2026-11-12T16:00:00Z
updated: 2026-11-12T16:40:00Z
goal: find_and_fix
---

## Current Focus

hypothesis: CONFIRMADA. A pausa temporária por limite de uso da Meta (MetaLimiteError) chega aos escritores de status como string e era gravada em sync_status.last_error sem checar se o dado ainda estava em dia.
test: teste que reproduz o caso (leitura Graph com a mensagem de produção, dado até ontem) falha no código antigo (estado "erro") e passa no novo (estado "ok" com aviso dono meta).
expecting: depois do deploy, a próxima rodada de anúncios do Douglas grava last_error nulo e motivo "Conta final 2463: Atualizado até ontem · a Meta pediu uma pausa; a próxima rodada tenta de novo." (dono meta); o chip vira "Anúncios: em dia" e o item sync-erro-anuncios some do qualidade_dados.
next_action: aguardar confirmação do João depois do deploy e da próxima rodada (a linha de produção atual só limpa quando o sync rodar de novo; a tela já pinta "Em dia" para a linha antiga assim que o front for publicado).
bug_class: Bohrbug (determinístico: mesma mensagem gera o mesmo erro gravado)
reasoning_checkpoint:
  hypothesis: "A pausa por limite da Meta aparece como erro porque anuncios-status.ts (gravarResumo) e sync-status.ts (recordSyncStatus) gravam last_error para qualquer string de erro, sem checar se o dado da fonte ainda está em dia; qualidade_dados_calc e statusDaFonte tratam qualquer last_error como falha."
  confirming_evidence:
    - "last_error observado em produção é exatamente a mensagem de meta-limite.ts mensagem(): 'Meta: uso em 202% do limite da conta. Chamadas pausadas por cerca de 29 min...' com prefixo 'Conta final 2463:' que só avaliarConta acrescenta (anuncios-status.ts:111)"
    - "gravarResumo grava last_error = r.ok ? null : erroCurto(r.erro) e r.ok só é true se TODAS as contas estão em estado 'ok'; estado 'erro' vem de leitura.erro != null sem olhar ultimoDado (anuncios-status.ts:97-112)"
    - "qualidade_dados_calc (20261029130000_origem_pelo_canal_kommo.sql:173-186) cria 'sync-erro-<fonte>' severidade alta para todo last_error not null"
  falsification_test: "Um teste que passa uma leitura Graph com a mensagem de pausa e ultimoDado = ontem para avaliarConta/resumirCliente: se ok=false e erro != null, a hipótese vale; depois da correção deve dar ok=true, erro=null, motivo com dono meta; com ultimoDado antigo continua erro."
  fix_rationale: "Decidir na camada TypeScript que grava o status (um helper puro compartilhado), porque o SQL não pode mudar. Pausa + dado em dia vira motivo informativo (dono meta); pausa + dado velho continua last_error (problema real)."
  blind_spots: "Não li os cabeçalhos reais da Meta para a conta 2463 nem sei o agendamento do n8n (fora do repositório); não consultei produção (proibido nesta tarefa). O número de vezes que a mesma conta aparece em client_ad_accounts também é desconhecido."
  candidate_causes:
    - "code: pausa gravada como last_error sem checar frescor do dado (confirmada)"
    - "config/data: volume de chamadas da conta 2463 (127 campanhas, janela de 30 dias por campanha por dia, reforços por janelas curtas, botão com 90 dias, mesma conta ligada a mais de um cliente) leva a 202% do limite (provável contribuinte, não confirmável sem produção)"
  and_gate: "sim: o sintoma visível exige as duas condições juntas, (1) a conta passar do limite e (2) o TypeScript gravar a pausa como last_error. Cortar (2) elimina o sintoma com dado em dia; reduzir (1) diminui a frequência da pausa."

## Symptoms

<!-- DATA_START -->
expected: pausa da Meta por limite de uso com dado em dia (data_ate >= ontem) aparece como aviso informativo, não como erro; nota e chips não caem.
actual: Carteira mostra "Anúncios: erro", "3 dados com erro · 1 afeta a leitura", Nota 55 para Douglas Gomides (client_id ba5231d4-a973-47da-9018-82af6c5a5661).
errors: "Conta final 2463: Meta: uso em 202% do limite da conta. Chamadas pausadas por cerca de 29 min para não prolongar o bloqueio; a próxima rodada tenta de novo."
reproduction: sync_status fonte=anuncios: last_attempt_at 2026-11-12 15:11:59, last_success_at 2026-11-12 02:12:25, data_ate 2026-11-11 (leitura SELECT feita pelo orquestrador).
started: 12/11/2026 (pausa em andamento)
<!-- DATA_END -->

## Eliminated

## Evidence

- timestamp: 2026-11-12T16:05:00Z
  checked: api/_lib/meta-limite.ts
  found: o limitador lança MetaLimiteError (mensagem "Meta: <motivo>. Chamadas pausadas por cerca de N min ..."). O bloqueio é por token (hash) ou app, em memória do processo. Uso >= 90% nos cabeçalhos bloqueia as PRÓXIMAS chamadas daquele token.
  implication: a mensagem é a única pista que sobra depois que o erro vira string nos syncs.

- timestamp: 2026-11-12T16:10:00Z
  checked: api/_lib/meta-ads-graph-sync.ts (catch por conta) e api/_lib/anuncios-status.ts (avaliarConta, gravarResumo)
  found: o catch faz r.errors.push(err.message); leituraDaGraph passa as strings; avaliarConta marca a conta como estado "erro" e gravarResumo grava last_error = "Conta final XXXX: ..." (erroCurto 600). Não há nenhuma conferência de ultimoDado antes.
  implication: causa raiz da classificação para anúncios.

- timestamp: 2026-11-12T16:15:00Z
  checked: supabase/migrations/20261029130000_origem_pelo_canal_kommo.sql (qualidade_dados_calc), scripts/alertas/verificar.sql
  found: item 'sync-erro-<fonte>' severidade 'alta' para QUALQUER sync_status.last_error not null; o alerta horário de produção também abre issue para qualquer last_error.
  implication: basta o TypeScript parar de gravar last_error na pausa com dado em dia; nenhuma migração.

- timestamp: 2026-11-12T16:20:00Z
  checked: api/_lib/sync-status.ts (recordSyncStatus, recordSyncStatusPorCliente, registrarMotivoInstagram), api/sync/manual.ts (executar), api/sync/meta-graph.ts, api/sync/meta-comments.ts
  found: Instagram (Graph) e comentários passam pelo mesmo recordSyncStatus; os erros da Meta chegam como strings com prefixo ("posts: ...", "seguidores: ..."). registrarMotivoInstagram sobrescreve motivo (null) a cada rodada. manual.ts (botão) também chama recordSyncStatus com errosLista[0].
  implication: o ponto comum é recordSyncStatus; anúncios têm escritor próprio (gravarResumo) que decide por conta.

- timestamp: 2026-11-12T16:25:00Z
  checked: src/lib/status-fonte.ts, src/lib/motivos.ts
  found: statusDaFonte pinta "Erro" vermelho para qualquer last_error; com aviso e dono != origem/manual e dias<=1 em anúncios pinta amarelo "Atenção · uma conta com aviso". motivoDoErro não reconhece a pausa e devolve "Erro técnico ... dono nos".
  implication: o chip "Anúncios: erro" lê last_error direto (acompanha a correção do servidor); o aviso "meta" com dado em dia precisa de tratamento neutro.

- timestamp: 2026-11-12T16:40:00Z
  checked: onde cada escritor de status decide o que é erro (api/_lib/anuncios-status.ts, api/_lib/sync-status.ts, api/sync/manual.ts) e se algum SQL lê sync_status_contas
  found: caminhos que gravam a pausa em last_error: (1) gravarResumo (anúncios, consolidado por conta); (2) recordSyncStatus, via recordSyncStatusPorCliente (Instagram Graph em api/sync/meta-graph.ts, comentários em api/sync/meta-comments.ts) e via o botão (manual.ts executar, que usava errosLista[0]). sync_status_contas só é lida por anuncios-status.ts (nenhum SQL), então pode continuar guardando a pausa por conta.
  implication: dois pontos de correção (anuncios-status.ts e sync-status.ts) mais a escolha do "primeiro erro real" em recordSyncStatusPorCliente e manual.ts.

- timestamp: 2026-11-12T16:50:00Z
  checked: registrarValidadeToken (sync-status.ts) e registrarMotivoInstagram
  found: o aviso de token vencendo só entra se motivo atual é nulo ou também de token; registrarMotivoInstagram sobrescreve motivo a cada rodada. Um aviso de pausa gravado antes mascararia o aviso de token vencendo.
  implication: o aviso de token passa a substituir o de pausa (a pausa é passageira); sem aviso de token a trocar, a pausa fica.

- timestamp: 2026-11-12T17:00:00Z
  checked: volume de chamadas à Meta por rodada (meta-ads-graph-sync.ts, diagnostico-anuncios.ts, manual.ts, conferencia.ts, meta-token-validade.ts)
  found: por vínculo cliente x conta, por rodada, no mínimo 4 chamadas (insights de 30 dias, conjuntos, alcance de 7 dias, limite de gastos), mais 2 a 5 de diagnóstico quando a conta está parada. Com erro de carga (timeout/unknown error/code 1,2/5xx), o insights de 30 dias refaz em 16 janelas de 2 dias, cada uma com até 2 tentativas (limit 50 e depois 25, páginas até acabar): para 127 campanhas, 6 + 11 = 17 chamadas por janela, até 272 chamadas numa rodada só. O botão do cliente usa 90 dias (46 janelas no fallback; se a conta entregar com mais de ~110 campanhas todos os dias, a primeira tentativa passa de 10 mil linhas, 20 páginas, e estoura a trava "paginação incompleta" depois de gastar 20 chamadas). Antes da correção a mesma conta ligada a 2 clientes repetia tudo.
  implication: a conta do Douglas (127 campanhas, já conhecida por estourar 30 s no insights de 30 dias) é o pior caso do código; ver o relatório final (números e decisões de produto).

## Resolution

root_cause: A pausa por limite de uso da Meta (MetaLimiteError, texto "Meta: ... Chamadas pausadas por cerca de N min ...") chega aos escritores de status como string de erro comum e era gravada em sync_status.last_error sem checar se o dado da fonte ainda estava em dia (anuncios-status.ts gravarResumo e sync-status.ts recordSyncStatus). qualidade_dados_calc e statusDaFonte leem qualquer last_error como falha de integração, então uma pausa de 29 min com dado completo até ontem derrubou a nota e acendeu "Anúncios: erro". Contribuinte do volume: conta final 2463 (127 campanhas) chegou a 202% do limite por consulta cara (campanha x dia x 30 dias, alcance e cliques únicos) com fallback em 16 janelas e botão de 90 dias; o código também lia a mesma conta uma vez por vínculo de cliente.
fix: helper puro src/lib/pausa-meta.ts (detector da mensagem, texto do aviso, escolha do primeiro erro real); régua dadoEmDiaParaPausa em src/lib/status-fonte.ts; anuncios-status.ts (avaliarConta suaviza pausa com dado até ontem em aviso dono meta, sem derrubar o estado nem carimbar sucesso); sync-status.ts (recordSyncStatus: pausa com dado em dia vai para motivo dono meta, sem last_error, para Instagram e comentários; token vencendo vence a pausa); manual.ts e recordSyncStatusPorCliente (primeiro erro real); tela (statusDaFonte verde "Em dia" com aviso; motivoDoErro dono meta); meta-ads-graph-sync.ts (leitura da Meta uma vez por conta e token na rodada).
verification: scripts/test-pausa-meta.ts e scripts/test-meta-ads-graph-rodada.ts (o primeiro falha no código antigo, o segundo falha sem a leitura única; ambos passam no código novo). npm test: 186/192 passam; as 6 falhas são as conhecidas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta); status-que-nao-mente falha na linha 107 antes e depois, e sem essa linha o resto passa com o código novo. tsc: só os 4 erros antigos. eslint nos arquivos mudados: limpo. Falta: confirmação em produção depois do deploy e da próxima rodada.
files_changed:
  - src/lib/pausa-meta.ts
  - src/lib/status-fonte.ts
  - src/lib/motivos.ts
  - api/_lib/meta-limite.ts
  - api/_lib/sync-status.ts
  - api/_lib/anuncios-status.ts
  - api/_lib/meta-ads-graph-sync.ts
  - api/sync/manual.ts
  - scripts/test-pausa-meta.ts
  - scripts/test-meta-ads-graph-rodada.ts
  - scripts/support/supabase-memoria.ts
  - docs/apis/meta-marketing.md
