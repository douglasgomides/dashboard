# Requirements: Nexo v5 — Milestone v5.0 (Fase 0 + degrau v1)

**Defined:** 2026-11-09
**Core Value:** O médico e a equipe confiam no número que estão vendo. Todo número diz o que conta, de onde vem e se está conferido (selo gravado em `metricas_selo`).

Fonte: `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md`, `.planning/research/SUMMARY.md`. As 12 decisões abertas do João (ver PROJECT.md) não foram assumidas; requisitos que dependem delas dizem qual.

## v1 Requirements

### Fase 0 — Conferência (CONF)

- [ ] **CONF-01**: A equipe vê a conferência de 1 semana fechada em Lana (Kommo), Marcella (FlwChat) e Antonione (Digisac), feita contra o CRM ao vivo
- [ ] **CONF-02**: A equipe lê a tabela "número × origem × diferença × causa × correção" para chamaram, novas/antigas, agendaram, foram, fecharam e faturamento
- [ ] **CONF-03**: Cada causa encontrada tem correção entregue como migration nova (o João roda)
- [ ] **CONF-04**: O João registra as 4 definições e a resposta sobre "Incoming leads" (decisões 1 e 2); nada é assumido antes disso
- [ ] **CONF-05**: A regra de "cópia do robô do Kommo" é definida por card, com evidência da Fase 0, e é a mesma no Nexo e na conferência
- [ ] **CONF-06**: Um spike mostra até onde vai o histórico de eventos de etapa do Kommo (retenção e cobertura)
- [ ] **CONF-07**: Nenhum nome ou telefone de paciente entra em arquivo commitado; a conferência usa contagens e ids internos

### Log por rota (LOG)

- [ ] **LOG-01**: Cada abertura de tela fica gravada com rota padrão, clínica, papel, sessão e horário, inclusive de quem é da equipe admin
- [ ] **LOG-02**: Cada registro diz a origem da abertura (menu, busca, link direto, redirecionamento, bloqueada)
- [ ] **LOG-03**: A equipe admin vê uma visão agregada de aberturas por rota e período
- [ ] **LOG-04**: O registro não deixa a navegação perceptivelmente mais lenta e nunca grava query string, id de paciente ou URL completa

### Menu (MENU)

- [ ] **MENU-01**: Um registro único classifica as rotas em vivas (14), escondidas (70) e tiradas (3), 87 linhas medidas no código em 09/11/2026 (60 escondidas abrem pela busca; 10 só redirecionam), conferido por teste
  - Nota de 09/11/2026: o teste confere o conjunto de rotas medido em `src/routeTree.gen.ts` (81 telas nessa data: 80 folhas `/_authenticated` + `/sem-acesso`; 90 é a contagem de arquivos em `src/routes`); a divisão 14/73/3 do brief é recontada contra esse conjunto na Phase 3.
- [ ] **MENU-02**: A equipe vê 3 itens no menu: Carteira, Clínica, Conferência e fontes
- [ ] **MENU-03**: A equipe abre qualquer tela escondida pela busca (Cmd+K no computador, botão Buscar visível no celular) e a abertura fica registrada
- [ ] **MENU-04**: As 3 rotas tiradas redirecionam para a tela certa, sem 404
- [ ] **MENU-05**: Telas com número sem selo aparecem só para a equipe, com o aviso "sem selo"
- [ ] **MENU-06**: O médico vê 2 itens no menu: Hoje e Ajuda e fontes (entra junto com a tela Hoje)
- [ ] **MENU-07**: Login, redefinir senha, primeiro acesso, OAuth, sem acesso e `/r/` nunca são escondidos nem redirecionados; o SAP fica congelado, sem mudança de schema

### Consultas de verificação (VERI)

- [ ] **VERI-01**: A equipe vê a cobertura de `post_id`/`ad_id` por clínica e fonte
- [ ] **VERI-02**: A equipe vê, por fonte, a hora do último dado gravado, separada da última tentativa
- [ ] **VERI-03**: A equipe vê a contagem de cards removidos na origem e de cópias do robô por clínica
- [ ] **VERI-04**: As consultas usam `America/Sao_Paulo` e passam em testes de borda (domingo à noite, virada de mês, segunda 00:00)

### Selo de confiança (SELO)

- [ ] **SELO-01**: Cada número tem selo gravado por clínica × métrica × versão da definição, em 4 estados (verde, neutro, âmbar, não medido), com texto curto
- [ ] **SELO-02**: Só o job de conferência e o SQL do João escrevem selo; não existe botão "marcar como conferido"
- [ ] **SELO-03**: O verde volta a neutro em 30 dias e sempre que a versão da definição ou o perfil de etapas da clínica muda
- [ ] **SELO-04**: O usuário vê o selo com ícone e texto (14px) e, ao tocar, lê "o que este número conta"
- [ ] **SELO-05**: "Não medido" nunca aparece como zero, vermelho ou queda
- [ ] **SELO-06**: Se o SQL do selo ainda não rodou em produção, a tela mostra neutro/"não medido" em vez de quebrar
- [ ] **SELO-07**: O histórico diário (`resultados_diarios`) registra a versão da definição usada no cálculo

### Endpoint e tela Hoje (HOJE)

- [ ] **HOJE-01**: A tela Hoje recebe um bloco por métrica com status, selo e hora do dado; um bloco que falha não derruba os outros
- [ ] **HOJE-02**: O médico nunca recebe número sem selo; a equipe recebe o número com o aviso "sem selo"
- [ ] **HOJE-03**: Abrir a Hoje não recalcula conta pesada; o tempo de resposta é medido em produção antes e depois
- [ ] **HOJE-04**: O médico vê a Hoje em coluna única (400px celular, 720px computador) com Agendaram, Fecharam, Chamaram e Foram
- [ ] **HOJE-05**: Agendaram e Fecharam mostram a última semana fechada (seg–dom), com o par escrito ("7 entraram… · 11 chegaram…"; "13 vendas, 3 com valor"); o texto final depende da decisão 1
- [ ] **HOJE-06**: A faixa de fontes diz "cálculo de hoje 03:30" e fica âmbar quando o dado tem mais de 1 dia
- [ ] **HOJE-07**: A frase-resumo segue modelo fixo, no passado, sem adjetivo, e herda o pior selo da tela
- [ ] **HOJE-08**: O funil é barra horizontal de 8px; o destaque de queda aparece só se o funil for monotônico e sem etapa não medida, senão "funil inconsistente nesta clínica"
- [ ] **HOJE-09**: Com meta cadastrada, o médico vê "12 de 20, faltam 8 em 9 dias" (mês até ontem), sem projeção
- [ ] **HOJE-10**: Estados de carregando (após 3 s: "Calculando, clínica grande leva até 30 s"), vazio (diz a condição que falta) e erro aparecem dentro do bloco
- [ ] **HOJE-11**: O médico abre "Ajuda e fontes" e vê de onde vem cada número e quando foi calculado
- [ ] **HOJE-12**: Um teste no CI barra palavras proibidas no texto para o médico ("em risco", "vai", "deve", adjetivos, promessa)

### Job de conferência do Kommo (KOMM)

- [ ] **KOMM-01**: Toda semana a conferência da Lana roda sozinha sobre a semana fechada e grava as duas contagens de cada métrica
- [ ] **KOMM-02**: O resultado vira selo: verde quando bate, âmbar com os dois números quando difere; falha não mexe no selo e fica registrada como "não conferido"
- [ ] **KOMM-03**: O job respeita o limite do Kommo para o domínio inteiro (não por instância), roda uma clínica por chamada e para no 429/403
- [ ] **KOMM-04**: A equipe recebe alerta se a conferência ficar mais de 8 dias sem rodar
- [ ] **KOMM-05**: O job é disparado por Vercel Cron semanal com segredo próprio (`CRON_SECRET`); n8n documentado como reserva

### Quem chamar hoje (CHAM)

- [ ] **CHAM-01**: Antes de qualquer código existe um documento de desenho aprovado pelo João (decisão 10/LGPD, decisão 8/casamento conversa→card, regra do robô, modelo de acesso da secretária, fluxo do botão)
- [ ] **CHAM-02**: A equipe vê até 5 pessoas com motivo mecânico ("escreveu há 3 dias, sem resposta"), sem cards removidos, cópias do robô ou quem já voltou, agendou ou cancelou
- [ ] **CHAM-03**: A máscara é feita no servidor: médico vê iniciais, secretária com acesso nominal vê o primeiro nome, agência vê só a contagem; telefone nunca vem na resposta
- [ ] **CHAM-04**: Cada abertura da lista fica registrada na mesma requisição; se o registro falhar, a lista não abre
- [ ] **CHAM-05**: A secretária da Lana marca 20 linhas como certas ou erradas, com motivo, dentro do app, sem nome gravado
- [ ] **CHAM-06**: A lista só aparece ao médico quando as 4 condições estão gravadas como cumpridas (incluindo ≥18 de 20)
- [ ] **CHAM-07**: O botão abre o WhatsApp oficial com confirmação e nunca envia sozinho

### Resumo semanal em sombra (RESU)

- [ ] **RESU-01**: Toda semana a equipe vê o resumo que o médico receberia: 2 números e 1 ação com verbo da lista fechada
- [ ] **RESU-02**: Com selo não verde, grupo menor que 5, fonte com mais de 1 dia ou etapa fora de ordem, o resumo diz "resumo suspenso: [motivo]"
- [ ] **RESU-03**: Não existe caminho de envio ao médico; o SQL de opt-in é entregue e não é usado

### Template do WhatsApp (TMPL)

- [ ] **TMPL-01**: O João recebe o pacote pronto para pedir o template à Meta (texto no passado, categoria, checagem do WABA e do número), cedo no calendário, depois da decisão 7

### Metas (GOAL)

- [ ] **GOAL-01**: O João recebe o SQL das metas da Lana, ligado à métrica e à versão da definição, antes da tela Hoje
- [ ] **GOAL-02**: Os textos atuais de "meta em risco" (tela e alerta) viram fato, sem previsão

### Liberação da v1.5 (REL)

- [ ] **REL-01**: A equipe vê um check medido da liberação da v1.5: definições fechadas, Agendaram e Fecharam verdes na Lana, secretária ≥18/20, log ligado (o critério de "log ligado" é o João quem fixa)

### Redesenho das telas com inteligência (TELA, LEIT) — Phase 03.1

Escopo de 10/11/2026 (João): a leitura sai só de regras fixas, calculada na hora no navegador; sem IA, sem tabela nova, sem job agendado.

- [ ] **TELA-01**: Existe uma lista versionada de toda tela viva da clínica e da equipe (as rotas do registro fora do SAP, das rotas de acesso, das tiradas e das que só redirecionam) e dos cartões de cada uma, dizendo o que está no desenho novo; um teste falha quando uma tela do registro não tem linha ou quando uma tela marcada como nova ainda tem bloco antigo
- [ ] **TELA-02**: Toda tela viva usa o molde fixo (pergunta, leitura, de 3 a 4 cartões, gráfico principal, detalhe recolhido) montado por um componente de página único (`PaginaNexo`)
- [ ] **TELA-03**: Nenhuma tela viva renderiza bloco no desenho antigo (`ws-panel`, `ws-metric`, `dbx-*`, cartão Tailwind `rounded-xl border`, Recharts, tabela crua)
- [ ] **TELA-04**: As peças duplicadas por área (cabeçalho, leitura, método, aviso, recolhido, chip, barras, vazio) viram uma peça só em `src/components/nx/`, e o CSS comum sai das folhas por área
- [ ] **TELA-05**: As telas em construção (O que virou paciente, O que virou venda, Automações) seguem no menu, no molde, dizendo o que falta e quem resolve; nenhuma tela sai do menu nesta fase
- [ ] **LEIT-01**: Cada tela tem um módulo puro de fatos por regra (tipado e testado em tsx), construído sobre as regras que a tela já usa
- [ ] **LEIT-02**: Cada tela abre com a leitura do período, montada na hora por texto em modelo a partir dos fatos: o que aconteceu, o porquê com o número ao lado de cada afirmação e o próximo passo com quem resolve
- [ ] **LEIT-03**: Com dado faltando, não confiável, fonte parada ou amostra pequena, a leitura mostra "sem leitura: [motivo]", o passo para consertar e quem resolve, sem tirar conclusão
- [ ] **LEIT-04**: Cada tela traz um só próximo passo, com verbo da lista provisória (ligar para, responder, revisar, pausar, reforçar, corrigir, publicar, conferir), motivo e responsável; os outros ficam em "ver mais"
- [ ] **LEIT-05**: A leitura segue o período escolhido na tela e compara só com o período anterior de mesmo tamanho; não guarda nem cita recomendações passadas
- [ ] **LEIT-06**: O topo de Resultados da clínica traz o resumo da clínica em 3 linhas (o que aconteceu, o que mais preocupa, a ação da semana), montado por regra a partir dos fatos das áreas
- [ ] **LEIT-07**: O texto da leitura é leigo, curto e no passado: sem jargão (CTR, CPC, CPM, lead), sem projeção, previsão ou promessa, passa no filtro do CFM e não traz dado pessoal; "trouxe X% dos contatos" só aparece com a origem por post medida e a cobertura visível

## Future Requirements

### v1.5
- **V15-01**: Resumo semanal no WhatsApp oficial ao médico da Lana (2 números + 1 ação), com opt-in, template aprovado e revisor contra `metricas_selo`
- **V15-02**: "Já chamei" / adiar 12 h na lista

### v2
- **V2-01**: FlwChat e Digisac por clínica, cada um com seu job de conferência
- **V2-02**: "Esta semana" dentro da Hoje (1 a 3 ações por regra fixa)
- **V2-03**: Fusões em abas, só se o log mostrar as telas abertas na mesma sessão
- **V2-04**: Origem por post (`post_id`/`ad_id` visível, 20 casos conferidos, ≥5 casadas por post)
- **V2-05**: Metas guiadas por perguntas

### v3
- **V3-01**: "Pergunte ao Nexo" com 5 perguntas fixas, só sobre números verdes (depende da decisão 12)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Apagar telas sem dado de uso | Sem dado, esconde; tirar é decisão do João (decisão 3) |
| Mexer em `sap_*` e nos 9 workflows n8n do SAP | Congelado até 90 dias de log |
| Pizza, rosca, gauge, eixo duplo, 3D, funil em cone, projeção, score sem fórmula, R$ solto | Proibidos pelo sistema visual |
| IA (LLM) na v1 | A IA só descreve número verde; entra na v3 |
| Exportar a lista ou mostrar telefone | LGPD; dado referente à saúde |
| Botão "marcar como conferido" | Selo só por job ou SQL do João |
| Chat livre de IA, 3 modelos de atribuição, pedido de avaliação no Google, rastrear quem não escreveu | Anti-padrões das referências |
| E-mails, DNS, menção a Life'n Tech | Regras de trabalho do João |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CONF-03 | Phase 1 | Pending |
| CONF-04 | Phase 1 | Pending |
| CONF-05 | Phase 1 | Pending |
| CONF-06 | Phase 1 | Pending |
| CONF-07 | Phase 1 | Pending |
| LOG-01 | Phase 2 | Pending |
| LOG-02 | Phase 2 | Pending |
| LOG-03 | Phase 2 | Pending |
| LOG-04 | Phase 2 | Pending |
| MENU-01 | Phase 3 | Pending |
| MENU-02 | Phase 3 | Pending |
| MENU-03 | Phase 3 | Pending |
| MENU-04 | Phase 3 | Pending |
| MENU-05 | Phase 9 | Pending |
| MENU-06 | Phase 9 | Pending |
| MENU-07 | Phase 3 | Pending |
| VERI-01 | Phase 5 | Pending |
| VERI-02 | Phase 5 | Pending |
| VERI-03 | Phase 5 | Pending |
| VERI-04 | Phase 5 | Pending |
| SELO-01 | Phase 6 | Pending |
| SELO-02 | Phase 6 | Pending |
| SELO-03 | Phase 6 | Pending |
| SELO-04 | Phase 6 | Pending |
| SELO-05 | Phase 6 | Pending |
| SELO-06 | Phase 6 | Pending |
| SELO-07 | Phase 6 | Pending |
| HOJE-01 | Phase 8 | Pending |
| HOJE-02 | Phase 8 | Pending |
| HOJE-03 | Phase 8 | Pending |
| HOJE-04 | Phase 9 | Pending |
| HOJE-05 | Phase 9 | Pending |
| HOJE-06 | Phase 9 | Pending |
| HOJE-07 | Phase 9 | Pending |
| HOJE-08 | Phase 9 | Pending |
| HOJE-09 | Phase 9 | Pending |
| HOJE-10 | Phase 9 | Pending |
| HOJE-11 | Phase 9 | Pending |
| HOJE-12 | Phase 9 | Pending |
| KOMM-01 | Phase 10 | Pending |
| KOMM-02 | Phase 10 | Pending |
| KOMM-03 | Phase 10 | Pending |
| KOMM-04 | Phase 10 | Pending |
| KOMM-05 | Phase 10 | Pending |
| CHAM-01 | Phase 11 | Pending |
| CHAM-02 | Phase 12 | Pending |
| CHAM-03 | Phase 12 | Pending |
| CHAM-04 | Phase 12 | Pending |
| CHAM-05 | Phase 12 | Pending |
| CHAM-06 | Phase 12 | Pending |
| CHAM-07 | Phase 12 | Pending |
| RESU-01 | Phase 13 | Pending |
| RESU-02 | Phase 13 | Pending |
| RESU-03 | Phase 13 | Pending |
| TMPL-01 | Phase 4 | Pending |
| GOAL-01 | Phase 7 | Pending |
| GOAL-02 | Phase 7 | Pending |
| REL-01 | Phase 14 | Pending |
| TELA-01 | Phase 03.1 | Pending |
| TELA-02 | Phase 03.1 | Pending |
| TELA-03 | Phase 03.1 | Pending |
| TELA-04 | Phase 03.1 | Pending |
| TELA-05 | Phase 03.1 | Pending |
| LEIT-01 | Phase 03.1 | Pending |
| LEIT-02 | Phase 03.1 | Pending |
| LEIT-03 | Phase 03.1 | Pending |
| LEIT-04 | Phase 03.1 | Pending |
| LEIT-05 | Phase 03.1 | Pending |
| LEIT-06 | Phase 03.1 | Pending |
| LEIT-07 | Phase 03.1 | Pending |

**Coverage:**
- v1 requirements: 72 total
- Mapped to phases: 72
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-09*
*Last updated: 2026-11-10 — TELA-01..05 e LEIT-01..07 da Phase 03.1 (leitura só por regras, escopo do João em 10/11)*
