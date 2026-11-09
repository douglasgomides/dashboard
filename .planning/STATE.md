---
gsd_state_version: "1.0"
milestone: v5.0
milestone_name: Nexo v5 — Fase 0 + degrau v1
status: planning
last_updated: "2026-11-09T18:01:19.000Z"
last_activity: 2026-11-09
progress:
  total_phases: 14
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

**Core value:** O médico e a equipe confiam no número que estão vendo (todo número com selo gravado em `metricas_selo`).
**Current focus:** Phase 1 — Fase 0 — Confiança nos números (conferência); em paralelo, Phase 2 — Log por rota (primeira entrega de código)

## Current Position

Phase: 1 of 14 (Fase 0 — Confiança nos números (conferência))
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-11-09 — Roadmap do milestone v5.0 criado (14 fases, 60/60 requisitos mapeados)

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

- Roadmap: uma fase = um PR; 14 fases apesar de `granularity: coarse` (a regra do dono prevalece)
- Roadmap: a primeira entrega de código é o log (Phase 2); o PR da Fase 0 abre depois do PR do log
- Roadmap: menu da equipe logo após o log gravando (Phase 3); menu do médico só com a Tela Hoje (Phase 9)
- Roadmap: metas (Phase 7) antes do endpoint e da Tela Hoje; template Meta (Phase 4) cedo, sem código, após a decisão 7; portão de desenho (Phase 11) antes do Quem chamar (Phase 12); check de liberação (Phase 14) por último

### Pending Todos

None yet.

### Blockers/Concerns

- 12 decisões abertas do João (PROJECT.md), nenhuma assumida; mapa decisão × fase em ROADMAP.md
- Fora das 12, a responder antes da fase indicada: nome da tabela do log (`uso_rota` ou `rota_acessos`) antes da Phase 2; `statement_timeout` de produção (8 s ou 30 s) antes da Phase 8; fluxo do botão de WhatsApp (`wa.me` ou API com template) antes das Phases 4 e 11; critério de "log ligado" (o João fixa) antes da Phase 14
- Zod local 3.25.76 vs 4.6.7 no lockfile: rodar `npm ci` antes de mexer em schemas
- Vercel Hobby em 12/12 funções: nada novo em `api/`; juntar mudanças e subir uma vez por PR

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-09 18:01
Stopped at: Roadmap do v5.0 criado; aguardando aprovação do dono
Resume file: None
