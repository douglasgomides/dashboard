---
gsd_state_version: "1.0"
milestone: v5.0
milestone_name: Nexo v5 — Fase 0 + degrau v1
current_phase: 03.1.1
current_phase_name: Redesenho das telas com inteligência
status: executing
stopped_at: Phase 3 UI-SPEC approved
last_updated: "2026-11-12T17:58:31.683Z"
last_activity: 2026-11-12
last_activity_desc: Phase 03.1 execution started
state_head: 27d4928aeb9ef936f5458dd9ba32cb5eb2d8b0d4
progress:
  total_phases: 16
  completed_phases: 0
  total_plans: 35
  completed_plans: 12
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

**Core value:** O médico e a equipe confiam no número que estão vendo (todo número com selo gravado em `metricas_selo`).
**Current focus:** Phase 03.1 — Redesenho das telas com inteligência

## Current Position

Phase: 03.1.1 — READY TO EXECUTE
Plan: 2 of 17
Status: Ready to execute
Last activity: 2026-11-12 - Completed quick task 261112-jmh: Nada cortado na Carteira e em Posts

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:
- 12/11/2026 (João): nomes das etapas do funil comercial = Conversou · Virou lead · Atendido · Agendou · Fechou (decisão aberta 1 / D-06, só os nomes; o resto da Phase 9 segue aberto). Funil desenhado = sketch 001 variante A2; cartão = sketch 002 variante A (linha de 30 dias).

- Roadmap: uma fase = um PR; 14 fases apesar de `granularity: coarse` (a regra do dono prevalece)
- Roadmap: a primeira entrega de código é o log (Phase 2); o PR da Fase 0 abre depois do PR do log
- Roadmap: menu da equipe logo após o log gravando (Phase 3); menu do médico só com a Tela Hoje (Phase 9)
- Roadmap: metas (Phase 7) antes do endpoint e da Tela Hoje; template Meta (Phase 4) cedo, sem código, após a decisão 7; portão de desenho (Phase 11) antes do Quem chamar (Phase 12); check de liberação (Phase 14) por último

### Pending Todos

None yet.

### Blockers/Concerns

- 12 decisões abertas do João (PROJECT.md), nenhuma assumida; mapa decisão × fase em ROADMAP.md
- Fora das 12, a responder antes da fase indicada: `statement_timeout` de produção (8 s ou 30 s) antes da Phase 8; fluxo do botão de WhatsApp (`wa.me` ou API com template) antes das Phases 4 e 11; critério de "log ligado" (o João fixa) antes da Phase 14
- Zod local 3.25.76 vs 4.6.7 no lockfile: rodar `npm ci` antes de mexer em schemas
- Vercel Hobby em 12/12 funções: nada novo em `api/`; juntar mudanças e subir uma vez por PR

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261111-f5b | Tirar do Nexo os agentes e as telas que ninguém usa | 2026-11-11 | a7f4392 | [261111-f5b-tirar-do-nexo-os-agentes-e-as-telas-que-](./quick/261111-f5b-tirar-do-nexo-os-agentes-e-as-telas-que-/) |
| 261111-jb8 | Hoje clara para o médico | 2026-11-11 | 40624e3 | [261111-jb8-hoje-clara-para-o-m-dico](./quick/261111-jb8-hoje-clara-para-o-m-dico/) |
| 261111-ofr | Carteira com alertas honestos e leituras corrigidas | 2026-11-11 | 5703336 | [261111-ofr-carteira-com-alertas-honestos-e-leituras](./quick/261111-ofr-carteira-com-alertas-honestos-e-leituras/) |
| 261112-e8e | Menos texto, mais visual no Nexo (Top 5 do UI review) | 2026-11-12 | bc19e53 | [261112-e8e-menos-texto-mais-visual-no-nexo](./quick/261112-e8e-menos-texto-mais-visual-no-nexo/) |
| 261112-glf | Funil desenhado (A2) e linha de 30 dias nos cartões | 2026-11-12 | ea36241 | [261112-glf-funil-desenhado-e-linha-de-30-dias-nos-c](./quick/261112-glf-funil-desenhado-e-linha-de-30-dias-nos-c/) |
| 261112-jmh | Nada cortado: leitura fácil na Carteira e nos posts do Instagram | 2026-11-12 | 27d4928 | [261112-jmh-nada-cortado-leitura-f-cil-na-carteira-e](./quick/261112-jmh-nada-cortado-leitura-f-cil-na-carteira-e/) |

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Redesenho das telas com inteligência (URGENT)

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-09T22:55:29.685Z
Stopped at: Phase 3 UI-SPEC approved
Resume file: .planning/phases/03-menu-da-equipe-esconder-com-o-log-gravando/03-UI-SPEC.md
