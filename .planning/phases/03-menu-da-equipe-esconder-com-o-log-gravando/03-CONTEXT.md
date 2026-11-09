# Phase 3: Menu da equipe (esconder com o log gravando) - Context

**Gathered:** 2026-11-09 (sem /gsd-discuss-phase; decisões tomadas pelo João durante o contrato visual e o planejamento)
**Status:** Ready for planning

<domain>
## Phase Boundary

A equipe trabalha com 3 itens de menu (Carteira, Clínica, Conferência e fontes) e acha qualquer tela escondida pela busca (Cmd+K no computador, botão "Buscar tela" no celular), sem perder acesso a nada e com cada abertura gravada (log da Phase 2). As cascas da equipe recebem o sistema visual aprovado (03-UI-SPEC.md). O menu do médico não muda nesta fase (Phase 9). SAP escondido e congelado, sem mudança em `sap_*`.

Requisitos: MENU-01, MENU-02, MENU-03, MENU-04, MENU-07.
</domain>

<decisions>
## Implementation Decisions

- **D-01:** O contrato visual aprovado `03-UI-SPEC.md` é a fonte de verdade do desenho (Cobalto, réplica da referência, sempre claro, Urbanist, moldura + painel branco, ícones de linha, AvatarGerado). — **Reversibility:** costly — troca de fonte e tokens atinge as 80 telas.
- **D-02:** "Clínica" clicado a partir da casca `/admin` abre a última clínica aberta naquele navegador (armazenamento local, só o id); se nunca abriu, fica na Carteira com a dica "Escolha uma clínica". (João, 09/11/2026)
- **D-03:** Estrategista que não é admin do app vê o menu novo da equipe, mas só com o que ele consegue abrir: "Clínica" e a busca das telas permitidas a ele. Carteira e Conferência continuam só para admin. Nenhuma permissão muda. (João, 09/11/2026)
- **D-04:** Contagem medida no código (`src/routeTree.gen.ts`, 09/11/2026): 14 vivas, 70 escondidas, 3 tiradas (87 linhas no registro). Das tiradas, só `$clientId/marketing` é rota; as outras 2 são rótulos repetidos de `/ideias` (a rota fica; fica o rótulo "Revisar roteiros"). Das 70 escondidas, 60 abrem pela busca e 10 só redirecionam (fora do índice da busca). ROADMAP e MENU-01 atualizados. (João aceitou em 09/11/2026)
- **D-05:** `/marketing` continua redirecionando para `/conteudo` (sem mudança para quem tem o link). (João, 09/11/2026)
- **D-06:** Um PR só para a fase (visual + menu), com merge só depois dos 7 dias corridos de log em produção (D-14 da Phase 2). O código pode ser escrito antes; a publicação espera. (João, 09/11/2026)
- **D-07:** Esconder não é bloquear e não apaga nada: telas escondidas continuam abrindo por link e pela busca; nenhuma guarda nova; decisão 3 (o que sai de vez) segue com o João.
- **D-08:** Manter os marcadores `data-origem="menu"` e `"busca"` da Phase 2 nos contêineres novos.

### Claude's Discretion
- Ícones: seguir a recomendação da pesquisa (SVG inline no traço Tabler, ou fixar versão estável do pacote com checkpoint antes de instalar); semente do AvatarGerado do rodapé pelo e-mail; carregar Urbanist 400/500/600/700 (mesmo arquivo variável).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/phases/03-menu-da-equipe-esconder-com-o-log-gravando/03-UI-SPEC.md` — contrato visual aprovado (MUST read)
- `.planning/phases/03-menu-da-equipe-esconder-com-o-log-gravando/03-RESEARCH.md` — tabela rota a rota, arquivos e linhas, testes
- `.planning/PROJECT.md` §Key Decisions — Cobalto, réplica, sempre claro, pizza/medidor, escala tipográfica
- `.planning/ROADMAP.md` §Phase 3; `.planning/REQUIREMENTS.md` MENU-01..07
- `.planning/phases/02-log-por-rota/02-CONTEXT.md` (D-10 origem, D-14 linha de base)
- Prancha aprovada: https://claude.ai/artifact/Dmk7PJ4fqGvF4UQATGMfVQ (arquivo local em scratchpad/prancha-azul-nexo.html)
- `~/dev/nexo-arquitetos/saidas/20261109-141415/03_decisoes_do_arbitro.md` (Decisão 2, quadro de telas)
</canonical_refs>

<code_context>
## Existing Code Insights
Ver 03-RESEARCH.md (registro novo `src/lib/registro-de-telas.ts`; `nav.ts` e menu do médico intactos; Cmd+K em `app-shell.tsx`; casca `/admin` sem busca hoje; especificidade do tema escuro salvo; ordem de CSS por chunk).
</code_context>

<specifics>
## Specific Ideas
- Prancha aprovada é a referência visual concreta.
</specifics>

<deferred>
## Deferred Ideas
- Menu do médico (Hoje + Ajuda e fontes) — Phase 9.
- Decisão 3 (tirar telas de vez) — João.
</deferred>

---
*Phase: 03-menu-da-equipe-esconder-com-o-log-gravando*
*Context gathered: 2026-11-09*
