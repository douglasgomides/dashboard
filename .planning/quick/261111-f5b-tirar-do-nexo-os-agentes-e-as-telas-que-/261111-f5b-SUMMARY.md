---
phase: quick-261111-f5b
plan: 01
subsystem: agentes, navegação, registro de telas
tags: [agentes-desligados, redirecionamento, registro-de-telas, e2e]
status: complete
requirements: [MENU-01, MENU-04]
commits: 3
plan_head_before: 79fb656
plan_head_after: 9cf58c4
actuals:
  tokens: 120000
  tasks: 3
  commits: 3
key-files:
  created:
    - tests/e2e/telas-tiradas.spec.ts
  modified:
    - src/lib/agentes-catalogo.ts
    - api/_lib/agentes.ts
    - api/sync/manual.ts
    - api/sync/wts.ts
    - src/lib/registro-de-telas.ts
    - src/lib/uso-das-telas.ts
    - src/lib/nav.ts
    - src/components/nx/planejamento.tsx
    - src/styles/nexo-anuncios.css
  deleted:
    - src/components/nx/agentes-paineis.tsx
    - tests/e2e/brain.spec.ts
    - tests/e2e/reunioes.spec.ts
---

# Quick 261111-f5b: tirar do Nexo os agentes e as telas que ninguém usa

Agentes desligados no servidor por uma constante só (`AGENTES_DESLIGADOS`), 9 telas viradas redirecionamento, a visão Revisar roteiros fora e 3 painéis de agente removidos, com registro, menu, busca, inventário e testes refletindo a decisão do João de 11/11/2026.

## Commits

| Tarefa | Commit | O que entrou |
|---|---|---|
| 1 | 3f1be57 | Constante `AGENTES_DESLIGADOS`, `/api/sync/manual` e `wts.ts` desligados, `enfileirarAgendados(admin, { agentes })`, 3 testes da API |
| 2 | f1f89cc | 9 rotas só redirecionam, Revisar roteiros fora, painéis fora, `agentes-paineis.tsx` apagado, nav.ts, registro, uso-das-telas, testes de unidade e inventário |
| 3 | 9cf58c4 | `telas-tiradas.spec.ts` novo, 14 specs ajustados ou apagados, `links-do-medico.ts`, correção de contraste |

## Números finais

- Registro: 87 linhas = 14 vivas + 61 escondidas + 12 tiradas.
- Índice de produção do admin: 57 (7 vivas + 50 escondidas). Desenvolvimento: 58 (51 escondidas). Ver todas as telas: 57.
- `ROTAS_SO_REDIRECIONAM`: 21.
- Seções do admin: Resultados, Marketing (11), Comercial, Relatórios, Administração.
- Menu do médico: principais Resultados e Relatórios; detalhes Marketing e Comercial; Marketing com 4 telas.

## Termo escolhido no teste do singular de busca-equipe

"Referência entre clientes" (`buscarTelasEquipe(ADMIN, ...)` devolve 1 tela). "Caixa de entrada" devolve 2 (junto com Central de atendimento), por isso não serve. "Brand Brain" em ESCONDIDAS virou "Caixa de entrada" (`/admin/caixa`).

## Diferença exata de links-do-medico.ts

Saíram só 4 pares, como o plano previa:
- barra: `["Entregas e aprovações", "/${CID}/plano?preset=30d"]`
- barraInferior: `["Entregas", "/${CID}/plano?preset=30d"]`
- folha: `["Plano da semana", "/${CID}/plano?preset=30d"]` e `["Revisar roteiros", "/${CID}/ideias?preset=30d&visao=roteiros"]`

Nenhuma outra diferença. A lista foi colada da saída real do teste "trava".

## Resultados dos testes

- 5 scripts da API (test-api-security, test-api-crm-probe, test-api-modern-integrations, test-agentes-motor, test-api-agent-persistence): passam.
- Unidade (registro, uso-das-telas, workspace-navigation, product-sitemap, telas-inventario, telas-juntadas): passam.
- `npm test`: 182/188; só as 6 falhas antigas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta).
- `tsc`: só as 2 falhas antigas (test-perfil-da-clinica, workers/creative/intelligence). eslint limpo nos arquivos tocados.
- Gates: nenhum arquivo SAP (`/sap-`, `.sap.`, `/sap/`) mudou; package.json, package-lock.json e supabase/ intactos (diff contra 79fb656).
- e2e (build com Supabase falso, `--workers=1`, até 4 specs por comando): telas-tiradas, routes, uso-das-telas, busca-equipe, comercial-painel, telas-juntadas, agentes-nx, agents-workspace, service-delivery (SAP), plano-painel, anuncios-painel, resultados-painel e "nexo design" passam.

### Falhas de e2e que sobraram (todas medidas no HEAD 79fb656, numa cópia limpa, e iguais lá)

| Spec | Motivo |
|---|---|
| workspace-navigation :8, :131 (agora :132), :157 (agora :158) | Já falhavam no HEAD. Títulos e resumo da Home mudaram nos planos 03.1.1 ("Onde os pacientes travam", "Não foi possível carregar o resumo") |
| navigation-architecture :6 (375 e 1440) e :77 | Já falhavam: `/conteudo` abre com h1 "Instagram" e Comercial abre em outra aba |
| menu-equipe :118 | Já falhava: abas de Marketing juntadas (7 links, o teste espera o total) |
| product-design :141 (4 casos "Nexo home") | Já falhavam: região "Por onde começar" |
| blocos-nx :110 e :133 (375 e 1440) | Já falhavam: `/conteudo` e `/anuncios` juntadas |

O teste "trava do médico" (menu-equipe :196) falhou uma vez dentro de um lote (Comercial apontou para /atendimento, corrida com o carregamento das fontes) e passa isolado, antes e depois.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Contraste do "· N anúncios" em Ideias por etapa do funil**
- **Found during:** Task 3 (product-design "nexo design", 4 casos)
- **Issue:** `/ideias` agora abre em Encontrar ideias (antes abria em Revisar roteiros). Nessa visão o texto de apoio `<small>· 0 anúncios</small>` usa o azul da barra (#4675f0), 4,14:1 sobre branco, abaixo de 4,5:1 (axe color-contrast). O erro já existia na visão, mas o teste só passava por abrir em outra.
- **Fix:** `.nexo-mkt .nx-hb__linha em small { color: var(--muted-ink); }` em `src/styles/nexo-anuncios.css`.
- **Files modified:** src/styles/nexo-anuncios.css
- **Commit:** 9cf58c4

**2. [Rule 3 - Blocking] Dois testes de busca-equipe fora da lista do plano**
- **Found during:** Task 3 (primeiro lote)
- **Issue:** `busca-equipe.spec.ts` ainda esperava 66 telas no índice (59 escondidas) e a lista antiga de 3 tiradas; "Encontrar ideias" deixou de ser tirada.
- **Fix:** 57/50 e a lista das 12 tiradas. O teste "as tiradas não aparecem" ignora o título "Plano da semana", que também é nome de tela viva do SAP congelado.
- **Files modified:** tests/e2e/busca-equipe.spec.ts
- **Commit:** 9cf58c4

**3. [Rule 3 - Blocking] Mensagens vazias do planejador da semana**
- **Found during:** Task 2
- **Issue:** `planejamento.tsx` citava "Revisar roteiros" no vazio do planejador, e a visão saiu.
- **Fix:** o texto passa a falar só de "Encontrar ideias"; "leve um roteiro ao planejador" virou "leve uma ideia ao planejador".
- **Files modified:** src/components/nx/planejamento.tsx
- **Commit:** f1f89cc

### Outras observações (sem mudança de comportamento)

- O plano mandava gravar os logs de e2e em `test-results/`, mas o Playwright apaga essa pasta ao começar; os logs foram para o scratchpad.
- No `service-delivery.spec.ts` o link "Ver entrega" do SAP leva à rota própria do SAP (`/sap/{CID}/agentes`), não à tela tirada, então as asserções do SAP ficaram como estavam.
- O plano citava `git diff --quiet 2129664 -- <peças SAP>`; usei 79fb656 como base (a base real da worktree).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Nada novo em endpoint, autenticação ou acesso a arquivo além do que o `<threat_model>` já cobre (T-261111-01 a 08). A guarda do `/admin` continua rodando antes dos redirects de `/admin/agentes` e `/admin/brain`, e o e2e do viewer confirma.

## Self-Check: PASSED

- Commits 3f1be57, f1f89cc e 9cf58c4 existem na branch.
- `src/components/nx/agentes-paineis.tsx`, `tests/e2e/brain.spec.ts` e `tests/e2e/reunioes.spec.ts` apagados de propósito (as únicas deleções).
- `tests/e2e/telas-tiradas.spec.ts` e esta SUMMARY existem.

## Notas para o orquestrador

(Copiadas do plano.)


### Escolhas desta tarefa (discrição do planejador)

1. **/ideias sem beforeLoad.**
   - O pedido dizia que todo endereço antigo redireciona para Resultados. Mas /ideias continua tela (Planejar a semana e Encontrar ideias), e o teste D-03 de scripts/test-registro-de-telas.ts proíbe beforeLoad em rota que o estrategista acha na busca.
   - Por isso ?visao=roteiros e /ideias sem visao abrem Encontrar ideias, sem 404, e o atalho tirado aponta para C/ideias.
   - Os links de regra "Ver ideias prontas" passam a cair na visão que eles anunciam.
2. **Painel tirado além da lista.** Saiu também "Acompanhamento Doctor Creator", de Resultados da clínica (index.tsx). Ele só lia as entregas dos agentes, e o "Ver entrega" voltaria para a mesma tela.
3. **Atendente piloto.** Ele morava em /agentes (NxPainelAgentes), e não em /atendimento. Sai com /agentes e com o arquivo agentes-paineis.tsx.
4. **validateSearch mantido.** /agentes e /admin/brain mantêm o validateSearch porque peças congeladas do SAP fazem Link tipado para elas.
5. **Agendamento (revisão do orquestrador, 11/11).** Em brain_enfileirar e agendar:
   - continuam atualizarPlanos, a expiração das propostas antigas (não é IA nem fila, e tira sozinha da Caixa de entrada o que ninguém vai decidir) e operacao_sap_conferir;
   - saem sugestoes_medir, aprenderTodas, o laço dos FLUXOS e operations/acessos_criticos;
   - operacao_verificar também sai, porque só reconfere casos de operacao_recuperacao, que só nascem de proposta do agente de recuperação. Ela não é do SAP, e a tabela está vazia.

   rodar, resumo_equipe e o pedido do admin não fazem nada.

### Fica para decisão do João ou do orquestrador

Os 3 primeiros itens ficam como estão nesta tarefa, sem mudança.

- **Caixa de entrada.** /admin/caixa, fica pelo D-02, é toda alimentada pelos agentes: falhas, aprovações, roteiros, estratégias e Brain. Com os agentes desligados, ela vai dizer "Nada esperando a equipe" para sempre, e os links dela caem nas telas redirecionadas. Não está na lista do João, então não foi mexida.
- **Peças do SAP congeladas que apontam para telas tiradas:**
  - agentes-trabalho.tsx: "Conferir execuções" vai para /admin/agentes e "Revisar memória" para /admin/brain;
  - sap-acessos-operacao.tsx: "Central de Agentes".

  Agora elas caem na Carteira. Na tela Agentes do SAP, "preparar" cria uma execução na fila que nunca roda.
- **Reuniões.** O alvo "reuniao" do manual.ts (IA que processa a reunião e propõe itens ao Brain) continua aberto para admin. Não está na lista, e a tela dele saiu.
- **Textos que ficam desatualizados:**
  - REQUIREMENTS.md: MENU-01 (contagem 14/70/3, agora 14/61/12) e MEDV-01 (grupos Plano e Agentes);
  - PROJECT.md: a decisão aberta 3 agora está resolvida;
  - 03.1.1-CONTEXT.md: D-02 e D-03 ficam superados para estas telas.
- **Tamanho.** São cerca de 50 arquivos. A Task 1 sobe sozinha, se o orquestrador quiser publicar o desligamento antes.

### SECOES_JUNTADAS (plano 01)

Conferido: nenhuma parte aponta para tela tirada.
- travam: pacientes, crm-painel, consultas, vendas e jornada.
- origem: vendas-kommo, conteudo-comercial, anuncios e links.
- instagram: conteudo, top, posts e audiencia.

/anuncios continua parte (só perde um painel dentro de um details fechado, então a altura não sobe). juntadaDoCaminho de /CID/plano continua null.

### O que fica obsoleto em 03.1.1-05-PLAN.md

- **L148 (interfaces) e L195 (Task 1, passo 4): as contagens.**
  - Base nova: folhas 85, vivas 14 e total 87 iguais; escondidas 61 e tiradas 12; produção 57 (7 vivas e 50 escondidas); desenvolvimento 58; Ver todas 57.
  - Com a Hoje: 88 = 15 + 61 + 12, e não 15 + 70 + 3; produção 58 com 8 vivas, e não 67; desenvolvimento 59, e não 68; Ver todas 58, e não 67; vivasSemAcesso 8.
  - ROTAS_SO_REDIRECIONAM já está em 21. Em test-uso-das-telas.ts e em uso-das-telas.spec.ts, o 81 vira 82 como previsto, e o 21 de "só redireciona" não muda.
- **L136:** a lista de acao.rota inclui "/$clientId/agentes" (src/lib/proximas-acoes.ts:219), que agora redireciona. A Hoje não pode gerar ação com esse destino. "/$clientId/ideias" abre Encontrar ideias por padrão.
- **L174 (read_first, index.tsx "linhas 1-60 e 500-620") e L132 (MonthlyOverview 519-551):** os números sobem algumas linhas, porque saem os imports dos agentes. O trecho depois de 880 muda: sai o recolhido "acompanhamento".
- **A acrescentar ao 05 (não é obsoleto):**
  - trocar o destino das 7 tiradas da clínica de /$clientId para /$clientId/hoje: os 7 arquivos de rota, o destino `${C}/` dessas linhas no registro e o bloco novo de test-registro-de-telas.ts. telas-tiradas.spec.ts lê o destino do registro;
  - as 2 do admin continuam na Carteira, e o atalho Revisar roteiros continua em C/ideias.

### O que fica obsoleto em 03.1.1-06-PLAN.md

- **L34 (truth D-03):** "Plano da semana, Revisar roteiros, Agentes e entregas continuam abrindo pelo endereço" não vale mais: agora redirecionam. Trocar o exemplo por telas que ficam, por exemplo Dúvidas do público e Planejar a semana.
- **L67 (resolution), L153 (Task 1, passo 8) e L249 (T-03.1.1-17):** "goto /{CID}/plano ... o pathname continua o mesmo" não vale mais para /plano. Usar /{CID}/duvidas e /{CID}/ideias.
- **L147 (Task 1, passo 2):** itemAtualDoMedico de /{id}/plano continua null, mas /plano não é mais tela. Trocar por /{id}/duvidas.
- **L181 (Task 2, passo 1):** "plano da semana devolve []" continua passando, mas não prova mais nada.
- **L148 (Task 1, passo 3, "Nenhuma outra linha de nav.ts muda") e L166 (acceptance "git diff --stat 8f950ed HEAD -- src/lib/nav.ts mostra 1 linha mudada"):** nav.ts muda nesta tarefa. A base do diff tem que ser o commit desta tarefa.
- **L114 (interfaces):** a referência a workspace-navigation.spec.ts "caso das linhas 258-283" e a service-delivery.spec.ts "linha 32 conta 3 links da nav do médico" mudam:
  - os principais do médico já são 2 (Resultados e Relatórios);
  - service-delivery.spec.ts fica só com o SAP, então a asserção de 3 links do ramo hub não existe mais. Esse arquivo no files_modified e na Task 3 do 06 perde o ramo hub.
- **L223 (acceptance `! grep ... "Entregas e aprovações" tests/e2e/links-do-medico.ts`):** essa metade já passa depois desta tarefa, porque a baseline mudou.
- **links-do-medico.ts:** já sai daqui sem Entregas e aprovações, Entregas, Plano da semana e Revisar roteiros. O 06 parte dessa lista.

### O que fica obsoleto em 03.1.1-07-PLAN.md

- **L31 (truth):** a ordem das seções perde Plano, Agentes e Automações. Ficam 9: O que fazer hoje, Resultados da clínica, Onde os pacientes travam, De onde vêm os pacientes, Instagram, Relatório do período, Conteúdo, Atendimento e Configurar CRM.
- **L32 (truth):** os grupos Plano (Semana, Prioridades, Melhorias e Reuniões) e Agentes (Entregas, Central e Roteiros) não existem mais. Conteúdo perde Campanhas e fica Criativa, Referências e Dúvidas.
- **L33 (truth):** Brand Brain e Automações deixam de "continuar onde estão": foram tiradas.
- **Obsoletos inteiros:**
  - L35 (truth W6);
  - L54 (key_link TelaJuntada em /admin/agentes);
  - L112 (interfaces W6);
  - L180 (Task 2, passo 2, admin.tsx);
  - as partes W6 de L143, L144, L162, L182, L184 e L199;
  - L260 (T-03.1.1-18);
  - L276 (success criteria da Central).

  src/routes/_authenticated.admin.tsx sai do files_modified do 07: só servia ao W6. As entradas "/admin/agentes" e "/admin/brain" de TITULO ficam mortas e podem sair junto.
- **L36 e L110:** o estrategista sem "Reuniões, Criativa, Central de Agentes" fica só sem Criativa.
- **L37:** o exemplo /plano vira /duvidas.
- **L78 e L81 (objective e output):** saem Plano, Agentes, Automações e "a pasta Agentes também na casca /admin".
- **L101-L104 e L108 (interfaces):** saem as linhas "plano" e "agentes", C/campanhas do grupo "conteudo" e C/automacoes da ordem.
- **L118 (planos pausados):** 03.1-07 (Campanhas), 03.1-09 (Revisar roteiros), 03.1-11 (tudo menos o Relatório) e 03.1-15 (Central de Agentes e Brand Brain) perdem essas telas.
- **Task 1 inteira (L134-L165, "Grupo Plano de ponta a ponta"):** o tracer do 07 era o grupo Plano, que não existe mais. Trocar por Conteúdo ou Atendimento.
  - L143: IdDaSecao sem "plano" e "agentes", e sem o casamento de /admin/agentes.
  - L148: as seções passam de 12 para 9, e saem "clicar Plano abre /{CID}/plano" e "o estrategista não vê Reuniões".
  - L149: saem os testes do grupo Plano.
  - L160: grep -cE de 5 grupos passa a 3.
  - L165: o done muda.
- **Task 2 (L169-L201):**
  - o nome perde "Agentes com a Central na casca /admin";
  - L179: "agentes acha Agentes e entregas, Central de Agentes e Revisar roteiros" e "plano da semana continua com a tela antiga em primeiro" não valem mais;
  - L182, L184 e L198: as abas da equipe passam de 17 para 9 (Conteúdo 3, Atendimento 3 e Configurar CRM 3), e "Central de Agentes, Reuniões e Criativa" vira só Criativa.
- **Checkpoint do João:**
  - L227 e L228 (itens 8 e 9): seções com Plano, Agentes e Automações, e "a aba Central leva à Central de Agentes";
  - L229 (item 10): o exemplo "Revisar roteiros" não acha mais nada;
  - L235 (pergunta 4): lista Plano e Agentes.
