# Nexo v4: do dado à decisão

## What This Is

O Nexo é o painel da Doctor Creator para clínicas e médicos: junta Instagram, anúncios do Meta, CRMs (Kommo, Clint, FlwChat, Digisac, RD Station), WhatsApp (WTS, Digisac) e checkout (Hubla) e mostra o caminho do paciente, de quem chamou até quem fechou. O mesmo código e banco servem o SAP (Sistema de Aquisição de Pacientes, no endereço `sap.`).

Esta etapa (v4) transforma o Nexo de "muito dado via API" em algo que o médico **queira usar**: primeiro números em que a equipe confia, depois um caminho de leitura guiado que responde "como estou?" e "o que eu faço?".

## Core Value

**O médico e a equipe confiam no número que estão vendo.** Todo número de Resultados diz o que conta, de onde vem e se está conferido. Sem isso, nenhuma tela nova ou resumo de IA serve, porque vai explicar com confiança um número errado.

## Business Context

- **Customer**: clínicas e médicos atendidos pela Doctor Creator, e a própria equipe Doctor Creator (estrategistas)
- **Revenue model**: serviço de consultoria/marketing médico; o Nexo é a entrega visível do resultado
- **Success metric**: a equipe para de dizer "está tudo errado nos dados"; o médico abre o Nexo e sabe o que fazer na semana
- **Strategy notes**: `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v4.md`, `FASE0-Lana-27out-02nov.md`, `auditoria-databox-x-nexo.html`

## Requirements

### Validated

<!-- Já existe no código e está no ar. -->

- ✓ Login, primeiro acesso (`/bem-vindo`) e acesso por clínica com papéis `owner`/`strategist`/`viewer` via RLS — existing
- ✓ Sincronização de Instagram, Meta Ads, Meta Graph, comentários, Kommo (inclui webhook), Clint, WTS, Digisac, FlwChat, RD Station, Short.io, Windsor, Google Sheets — existing
- ✓ Botão de sincronizar manual com selo de atualização da fonte (`sync-freshness-badge`) — existing
- ✓ Resultados da clínica com variação contra o período anterior (base mínima de 30, teto de 300%), gráfico diário, funil e "O que mudou" por regras fixas — existing
- ✓ Funil de paciente por pessoa (chamaram → agendaram → foram → fecharam) com perfil de etapas do CRM por clínica — existing
- ✓ Fonte de cada número visível; "não medido" no lugar de zero quando a fonte não mede — existing
- ✓ Histórico diário `resultados_diarios` gravado todo dia às 03:30 (20 clínicas desde 08/09) — existing
- ✓ Cache de 20 min das contas pesadas (`resultado_pronto`); limite de consulta 30 s — existing
- ✓ Alertas diários por e-mail no n8n (queda de contatos, meta em risco) — existing
- ✓ Tabela de metas por clínica (sem metas cadastradas) — existing
- ✓ Menu do médico reduzido (14 de ~30 telas escondidas dele, seguem para a equipe) — existing
- ✓ Diagnóstico das fontes em 4 abas; "Clientes do Nexo" em cartões — existing
- ✓ Relatório PDF, Inteligência Criativa (worker), copiloto/agentes de IA (`api/_lib/ia.ts`, OpenAI com reserva Anthropic), servidor MCP somente leitura — existing
- ✓ Produto SAP (formulários, plano, metas, semana, gerador) no mesmo banco — existing

### Active

**Fase 0 — Confiança nos números**
- [ ] Conferência à mão de 1 semana fechada em 3 clínicas de CRMs diferentes: Lana (Kommo, já feita contra o banco do Nexo), Marcella (FlwChat), Antonione (Digisac), também contra o CRM ao vivo
- [ ] Tabela "número × origem × diferença × causa × correção" para chamaram, novas/antigas, agendaram, foram na consulta, fecharam, faturamento
- [ ] Correções das causas encontradas (perfil de etapas, cópia do robô do Kommo, período/fuso, fonte desligada)
- [ ] "Agendaram" mostra os dois números lado a lado: quem entrou na etapa e quem chegou até ela ou além
- [ ] "Foram na consulta" conta só a etapa de comparecimento; quando o CRM não usa a etapa, mostra "não medido"
- [ ] Venda sem valor conta como venda, mas o total em R$ diz "X de Y vendas com valor"
- [ ] Selo de confiança e definição ("o que este número conta") em cada cartão de Resultados: verde conferido, amarelo regra diferente do CRM, vermelho não medido

**Fase 1 — Descoberta rápida**
- [ ] Uso real levantado do banco/logs: quem entra, com que frequência, quais telas abre
- [ ] Respostas do João/equipe em checklist curto: 3 decisões semanais do médico, o que a equipe pergunta toda semana, reclamações sobre os números

**Fase 2 — Mapa decisão → dado → regra → saída**
- [ ] Para as 5 decisões do médico e a visão da equipe: qual dado, qual regra de cruzamento, qual saída na tela

**Fase 3 — Fluxo de leitura guiado (protótipo)**
- [ ] Tela "Hoje" e tela "Semana" para o médico, com dado real das 3 clínicas, nos 5 passos do brief (como foi o período; onde perco paciente; quem chamar hoje; o que trouxe paciente que fechou; o que fazer esta semana)
- [ ] Visão da equipe: quais clínicas precisam de atenção hoje e por quê, uma linha cada
- [ ] Cada passo abre o detalhe só se a pessoa quiser; telas técnicas continuam para a equipe

### Out of Scope

- IA que explica o "por quê" (resumo diário, "pergunte ao Nexo") — próximo milestone; só faz sentido depois que os números forem confiáveis
- Refazer as ~30 telas existentes — o protótipo de 2 telas vem antes de tocar no resto
- E-mails e DNS — regra de trabalho do João
- Qualquer menção a Life'n Tech — regra de trabalho

## Context

- Brownfield: SPA React 19 + TanStack Router/Query (Vite, sem SSR), API em funções Vercel (`api/`), Supabase como sistema de registro com RLS por clínica. Mapa completo em `.planning/codebase/`.
- O problema, nas palavras do João (06/11/2026): o Nexo traz muito dado mas não traz inteligência; parece um labirinto, é genérico, ninguém olha e sabe o que fazer.
- Os médicos abrem o Nexo, mas não se sabe o que olham primeiro.
- A equipe diz "está tudo errado nos dados" — problema número 1.
- Conferência da Lana (27/10–02/11): os números estão certos para uma definição que a tela não explica. Agendaram 11 vs 7 entradas na etapa (regra acumulada); Foram na consulta 14 vs 0 (vem das vendas); 10 de 13 vendas sem valor; 107 pessoas sem classificação novas/antigas; 39% dos cards removidos na origem; 98% sem valor; movimentos de etapa só desde 14/10/2025; "Incoming leads" do funil "Atendimento Clínico" marcado como venda (confirmar com a equipe da clínica).
- Causas já conhecidas: perfil de etapas do CRM por clínica mal aplicado (Marcelly), robô do Kommo copia o lead ao ganhar desde 01/11, "Fecharam" conta quem foi marcado ganho no período (pode passar de "Agendaram"), comparecimento não medido quando o CRM não usa a etapa, vendas sem valor.
- Comparativo Databox: faltam alertas, relatório automático, AI Analyst, minigráficos e linhas. O Nexo já é melhor em funil por pessoa, fonte de cada número e CRMs/WhatsApp do Brasil.
- Preocupações do mapa (`CONCERNS.md`): funções `security definer` sem `search_path`, CI apontando para `claude/doctor-creator-hub-nixvw6`, `api/sync/manual.ts` com 1338 linhas, ~490 `any`, sem medida de cobertura de testes.
- Lição registrada: função por linha deixou o Nexo lento (perfil da clínica revertido em 04/11) — medir velocidade em produção antes de mudar contas pesadas.

## Constraints

- **Banco**: Supabase `cvdnzoqduliopscfsrkc`; consulta de usuário corta em 30 s; contas pesadas (~10 s em clínica grande) usam cache de 20 min (`resultado_pronto`) — não pode ficar mais lento
- **Vercel Hobby**: 12 funções (limite atingido), 100 deploys/dia — rotas novas entram pelo dispatcher `api/sync/manual.ts`
- **IA no servidor**: `api/_lib/ia.ts` (OpenAI com reserva Anthropic, registro de custo) — confirmar a chave antes de depender dela
- **Mudança de banco em produção**: só o João roda o SQL; o agente entrega o arquivo de migração
- **Fluxo de trabalho**: uma fase, um PR; PR aberto pelo Chrome com base `claude/doctor-creator-hub-nixvw6`; merge no dashboard autorizado; nunca modo bypass
- **Verificação**: cada fase termina com print do site no ar conferido, não só build verde
- **Texto**: claro para o médico, sem jargão de fonte ("sync", "connection")

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fase 0 é confiança nos números, antes de qualquer tela nova | "Está tudo errado nos dados" é o problema nº 1; IA sobre número errado engana | — Pending |
| Milestone vai das Fases 0 a 3; IA fica para o próximo | Inteligência só depois de números confiáveis e do fluxo de leitura validado | — Pending |
| "Agendaram" mostra os dois números lado a lado (entraram na etapa · chegaram até ela ou além) | Quem confere no CRM acha um número, o Nexo mostra outro; os dois juntos explicam a diferença | — Pending |
| "Foram na consulta" conta só a etapa de comparecimento; sem etapa = "não medido" | Hoje vem das vendas e passa de "Agendaram", o que soa como erro | — Pending |
| Venda sem valor conta como venda; R$ mostra "X de Y vendas com valor" | 98% dos cards sem valor; o total sozinho engana | — Pending |
| Conferência em Lana (Kommo), Marcella (FlwChat), Antonione (Digisac) | Cobre 3 CRMs diferentes | — Pending |
| Descoberta = uso real do banco/logs + checklist respondido pelo João | Rápido, sem depender de entrevistas | — Pending |
| Protótipo inclui a visão da equipe (clínicas que precisam de atenção, uma linha cada) | A equipe também precisa de "o que fazer hoje" | — Pending |
| Uma tela, uma decisão; cruzamento vale mais que fonte | Princípios do brief para sair do "labirinto" | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-06 after initialization*
