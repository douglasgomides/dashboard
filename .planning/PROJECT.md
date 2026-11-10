# Nexo v5: refazer do dado à decisão

## What This Is

O Nexo é o painel da Doctor Creator para clínicas e médicos: junta Instagram, anúncios do Meta, CRMs (Kommo, Clint, FlwChat, Digisac, RD Station), WhatsApp (WTS, Digisac) e checkout (Hubla) e mostra o caminho do paciente, de quem chamou até quem fechou. O mesmo código e banco servem o SAP (Sistema de Aquisição de Pacientes, no endereço `sap.`).

O v5 substitui o v4. O Nexo traz muito dado e pouca inteligência, está confuso e cheio de enfeite, e a equipe diz que "está tudo errado nos dados". O v5 refaz a plataforma: visual clean, uma tela por decisão do médico, nenhum número sem selo de confiança, nada apagado sem dado de uso, e IA que só descreve número verde.

## Core Value

**O médico e a equipe confiam no número que estão vendo.** Todo número diz o que conta, de onde vem e se está conferido (selo gravado em `metricas_selo`). Sem confiança, nenhuma inteligência: nenhuma tela mostra ao médico número sem selo, e a IA se cala quando o selo não é verde.

## Business Context

- **Customer**: clínicas e médicos atendidos pela Doctor Creator, e a própria equipe Doctor Creator (estrategistas)
- **Revenue model**: serviço de consultoria/marketing médico; o Nexo é a entrega visível do resultado
- **Success metric**: a equipe para de dizer "está tudo errado nos dados"; o médico abre a tela Hoje e sabe o que fazer na semana
- **Strategy notes**: `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md` (substitui o v4), `FASE0-Lana-27out-02nov.md`, `REFERENCIA-Behance-NEXO-UI.md`, decisões do conselho em `~/dev/nexo-arquitetos/saidas/`, inventário em `~/dev/nexo-arquitetos/contexto/inventario-nexo.md`

## Current Milestone: v5.0 Nexo v5 — Fase 0 + degrau v1

**Goal:** a equipe e o médico da clínica-piloto (Lana) confiam no número que veem, com selo e definição, e o milestone termina quando a condição de liberação da v1.5 é medida.

**Target features:**
- Fase 0: conferência à mão em 3 clínicas de CRMs diferentes contra o CRM ao vivo, com tabela "número × origem × diferença × causa × correção"
- v1 (um PR por item, nesta ordem): log por rota; consultas de verificação; `metricas_selo`; endpoint `hoje`; tela Hoje; job de conferência semanal do Kommo; "Quem chamar hoje" atrás das 4 condições; resumo semanal em sombra para a equipe; pedido do template do WhatsApp à Meta; metas por SQL
- Menu enxuto: 14 rotas vivas, 73 escondidas (abrem por Cmd+K e cada abertura é gravada), 3 tiradas; SAP escondido e congelado
- **Libera a v1.5 quando:** o João fecha as 4 definições; Agendaram e Fecharam em verde na Lana; a secretária acerta ≥18 de 20 na lista; o log por rota está ligado

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
- [ ] Conferência à mão de 1 semana fechada em Lana (Kommo), Marcella (FlwChat) e Antonione (Digisac), contra o CRM ao vivo
- [ ] Tabela "número × origem × diferença × causa × correção" (chamaram, novas/antigas, agendaram, foram, fecharam, faturamento)
- [ ] Correção das causas encontradas (perfil de etapas, cópia do robô do Kommo, período/fuso, fonte desligada)
- [ ] O João fecha as 4 definições (Agendaram, Foram, venda sem valor, par lado a lado) — decisão aberta, não assumida

**v1 — clínica-piloto Lana (equipe + 1 médico, rótulo "em conferência")**
- [ ] Log por rota (cada abertura de tela, inclusive as escondidas via Cmd+K)
- [ ] Consultas de verificação (inclui `post_id`/`ad_id` e timestamp por fonte)
- [ ] `metricas_selo` com 4 estados (verde, neutro, âmbar, não medido) e texto curto
- [ ] Endpoint `hoje` no dispatcher, com status por bloco
- [ ] Tela Hoje em coluna única (Agendaram, Fecharam, Chamaram, Foram, funil, meta)
- [ ] Job de conferência semanal do Kommo
- [ ] "Quem chamar hoje" atrás das 4 condições, com máscara por perfil e log de quem abriu
- [ ] Resumo semanal em sombra só para a equipe
- [ ] Pedido do template do WhatsApp à Meta
- [ ] Metas por SQL
- [ ] Menu: médico com Hoje + Ajuda e fontes; equipe com Carteira, Clínica, Conferência e fontes; telas sem selo só para a equipe com aviso "sem selo"

### Out of Scope

- v1.5 (resumo no WhatsApp ao médico), v2 (FlwChat/Digisac por clínica, "Esta semana", fusões, origem por post) e v3 ("Pergunte ao Nexo") — próximos milestones, cada um liberado por condição medida, nunca por data
- Fusões de telas — só na v2 e só se o log mostrar as telas abertas na mesma sessão
- Apagar telas sem dado de uso — sem dado, esconde; tirar é decisão do João (decisão aberta 3)
- Mexer no schema `sap_*` ou nos 9 workflows n8n desligados do SAP — congelado até 90 dias de log
- Pizza, rosca, gauge, eixo duplo, 3D, funil em cone, eixo truncado, projeção, score sem fórmula, R$ solto — proibidos pelo sistema visual
- Chat livre de IA, três modelos de atribuição, pedido de avaliação no Google, rastrear quem não escreveu — anti-padrões das referências
- E-mails e DNS; qualquer menção a Life'n Tech — regras de trabalho

## Context

- Brownfield: SPA React 19 + TanStack Router/Query (Vite, sem SSR), API em funções Vercel (`api/`), Supabase como sistema de registro com RLS por clínica. Mapa completo em `.planning/codebase/`.
- 90 rotas hoje: ~28 telas no menu da clínica (5 áreas), 11 de admin, ~30 do SAP. Não há dado de uso.
- Já existem: histórico diário `resultados_diarios` (03:30), metas `clinica_metas` (vazia), alertas por e-mail (n8n), cache de 20 min (`resultado_pronto`), corte de 30 s nas consultas, componentes `dbx-*`.
- Conferência da Lana (27/10–02/11), feita contra o banco do Nexo e ainda não contra o Kommo ao vivo: os números batem com uma definição que a tela não explica. Agendaram mostra 11, mas só 7 entraram na etapa (o número é acumulado). Foram mostra 14 e 0 passaram pela etapa (o número vem das vendas). 10 de 13 vendas estão sem valor e 107 pessoas sem classificação nova/antiga. 39% dos cards foram removidos na origem e 98% estão sem valor. Há movimento de etapa só desde 14/10/2025. "Incoming leads" do funil "Atendimento Clínico" está marcado como venda.
- O v4 nunca teve roadmap. O PROJECT.md do v4 registrava como decididas três definições que o v5 deixa abertas; elas voltaram a pendentes.
- Referência visual do Behance: aproveitar layout e componentes (botão com 5 estados, ícones 16/20/24, cartão de contato para "Quem chamar"). Não usar pizza/rosca, menu de 13 itens nem fundo lavanda. Paleta: decisão 4 com direção dada pelo João (azul mais moderno, telas mais clean; sem lilás).
- Preocupações do mapa (`CONCERNS.md`): funções `security definer` sem `search_path`, CI apontando para `claude/doctor-creator-hub-nixvw6`, `api/sync/manual.ts` com 1338 linhas, ~490 `any`, sem cobertura de testes medida.
- Lição registrada: função por linha deixou o Nexo lento (perfil da clínica revertido em 04/11). Medir a velocidade em produção antes de mudar contas pesadas.

## Decisões abertas do João (o GSD não assume nenhuma)

1. As 4 definições da Fase 0: (a) Agendaram conta quem **entrou** na etapa (7) ou quem **chegou ao menos até ela** (11)? (b) Foram conta só quem passou pela etapa de comparecimento (0) ou também quem vendeu (14)? (c) Venda sem valor entra como venda? (d) Mostrar os dois números lado a lado? (O conselho assumiu o par como padrão, mas quem decide é o João.)
2. Confirmar com a equipe da Lana se "Incoming leads" do funil "Atendimento Clínico" é venda.
3. Cortar mais fundo: quais telas são lixo de verdade e saem em vez de ficar escondidas.
4. ~~Paleta~~ **Fechada: Cobalto (`#1F4FD8`), escolhido pelo João em 09/11/2026.** Direção anterior: nem o azul atual `#2563EB` nem o lilás do Behance; trocar por um **azul mais moderno**, com **telas mais clean**. O tom exato (hex, claro/escuro, contraste 4,5:1) e se a barra lateral continua escura ficam para o contrato visual (`/gsd-ui-phase`) da Phase 3, que apresenta 2 a 3 opções para o João escolher. Até lá, o código não muda de cor.
5. Algum cliente foi vendido com SAP?
6. Rodar o SQL de `metricas_selo` (com texto curto), das metas e do opt-in do resumo.
7. Autorizar o job de conferência do Kommo (depois FlwChat e Digisac) e pedir o template à Meta.
8. Piso de cobertura de `post_id` e limite de casamento conversa→card.
9. Lista fechada de verbos e templates de texto.
10. Base contratual do acesso nominal da equipe à lista (LGPD).
11. Autorizar o protótipo estático de 400px com dados da Lana e o teste de 10 segundos com 3 médicos; card sorting com a equipe sobre os 3 itens de menu.
12. Confirmar a chave de IA antes da v3.

## Constraints

- **Banco**: Supabase `cvdnzoqduliopscfsrkc`. A consulta de usuário corta em 30 s. As contas pesadas (~10 s em clínica grande) usam cache de 20 min (`resultado_pronto`) e não podem ficar mais lentas.
- **Mudança de banco em produção** (migrations, SQL de escrita): só o João roda. O agente entrega o arquivo de migração e o sistema de permissão barra a escrita.
- **Vercel Hobby**: 12 funções (limite atingido) e 100 deploys/dia. Rotas novas entram pelo dispatcher `api/sync/manual.ts`; juntar mudanças e subir uma vez.
- **Fluxo de trabalho**: uma fase, um PR. Merge no `douglasgomides/dashboard` autorizado; nunca modo bypass.
- **Verificação**: cada fase termina com print do site no ar conferido, não só com build verde.
- **Liberação por condição**: a construção não espera a Fase 0, mas a liberação espera. Cada degrau só abre por condição medida, nunca por data.
- **IA**: nunca calcula, só descreve dado verde, cita a fonte e o n. Fica calada quando o selo não é verde, o grupo é menor que 5, a fonte tem mais de 1 dia ou a etapa está fora de ordem.
- **Texto para médico**: português claro, sem jargão ("sync", "connection", "token"). Regras do CFM: sem promessa nem previsão, sempre no passado e sem adjetivo.
- **WhatsApp**: conversa 1:1 só pela API oficial; grupos só via Evolution.
- **Sistema visual**: Inter com números tabulares; escala 12/16 a 32/36; texto com sentido ≥14px; alvo de toque ≥44px; reutilizar `dbx-*` antes de criar componente; roxo só em IA; azul de marca novo (mais moderno) definido no contrato visual da Phase 3.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v5 substitui o v4; o milestone v5.0 cobre a Fase 0 e o degrau v1 inteiro | Escolha do João em 09/11/2026; termina na condição de liberação da v1.5 | — Pending |
| Milestone nomeado v5.0; os degraus do brief (v1, v1.5, v2, v3) ficam como etapas do produto | Evita confundir a versão do GSD com os degraus | ✓ Good |
| Primeira entrega de código: log por rota | Destrava as decisões de cortar e fundir com dado de uso | — Pending |
| Uma tela, uma decisão (D1–D5); médico com 2 itens de menu, equipe com 3 | Decisão do conselho para sair do "labirinto" | — Pending |
| Esconder em vez de apagar (73 rotas); tirar só 3 | Nada é apagado sem dado de uso | — Pending |
| Selo gravado em `metricas_selo`, nunca calculado na tela | Confiança auditável por clínica × métrica × versão da definição | — Pending |
| As 4 definições da Fase 0 ficam abertas até o João decidir com a tabela de conferência | O v4 tinha assumido as três; o v5 devolve a decisão ao João | — Pending |
| Planejamento na branch `gsd/nexo-v5` | Separa do v4 | ✓ Good |
| Paleta: **Cobalto** (escolhido pelo João em 09/11/2026 na prancha): `#1F4FD8` marca, `#4675F0`, `#7D9EF6`, `#B6C9FB`, `#DCE6FD`, `#EFF4FF` (degradê 1→2 nos elementos de marca); sem lilás | Decisão 4 fechada pelo João em 09/11/2026 | ✓ Decided |
| Sistema visual = réplica 100% da referência NEXO (Behance) menos as cores: Urbanist com a escala tipográfica da referência (17 estilos; âncoras 40/24/16; corpo 400, títulos 500; inclui os tamanhos de apoio da referência, como 28 do valor de cartão e 12 de legenda), moldura cinza-clara com painel branco, cartões de borda fina, pastilhas, ícones de linha (Tabler), degradê branco→azul, sempre claro (sem fundo preto), gráficos animados; pizza e medidor em semicírculo PERMITIDOS (revoga a proibição do brief); avatares 3D próprios quando não há foto | Pedido e autorização explícitos do João em 09/11/2026 após ver a prancha (https://claude.ai/artifact/Dmk7PJ4fqGvF4UQATGMfVQ) | — Pending |
| Extras da pesquisa na v1: job grava as 2 contagens, validação das 20 linhas no app, botão Buscar no celular, selo cai se o perfil mudar | Delegado ao Claude pelo João em 09/11/2026; revisável | — Pending |
| Ordem: menu da equipe escondido só após log gravando; template Meta cedo (após decisão 7); metas antes da Hoje; portão de desenho antes do Quem chamar | Delegado ao Claude em 09/11/2026; revisável | — Pending |
| Job semanal do Kommo por Vercel Cron (`CRON_SECRET`), alerta de 8 dias, n8n como reserva | Versionado no PR; delegado ao Claude em 09/11/2026; revisável | — Pending |
| Hoje mostra Agendaram/Fecharam da última semana fechada (seg–dom); meta no mês até ontem | Mesma janela da conferência, então o selo vale para o número exibido; delegado ao Claude em 09/11/2026; revisável | — Pending |

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
*Last updated: 2026-11-09 after starting milestone v5.0*
