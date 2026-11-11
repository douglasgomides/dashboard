# Roadmap: Nexo

## Milestones

- 🚧 **v5.0 Nexo v5 — Fase 0 + degrau v1** - Phases 1-14 (em andamento)

## v5.0 — Nexo v5 — Fase 0 + degrau v1

**Milestone Goal:** a equipe e o médico da clínica-piloto (Lana) confiam no número que veem, com selo e definição; o milestone termina quando a condição de liberação da v1.5 é medida.

## Overview

O milestone v5.0 leva a clínica-piloto Lana (equipe + 1 médico, rótulo "em conferência") do "está tudo errado nos dados" até um check medido da liberação da v1.5. A trilha de código segue a ordem do brief, um PR por fase: log por rota → menu da equipe → consultas de verificação → selo → metas → endpoint `hoje` → Tela Hoje → job do Kommo → portão de desenho → Quem chamar → resumo em sombra → check de liberação. Três fases correm ao lado dela sem segurá-la: a Fase 0 (conferência à mão, Phase 1), o pacote do template à Meta (Phase 4, sem código) e o documento de desenho do Quem chamar (Phase 11). A construção não espera a Fase 0; a liberação espera: nenhum número fica verde antes de o João fechar as 4 definições.

**Regras que valem para todas as fases:**
- Uma fase, um PR (merge em `douglasgomides/dashboard`; nunca modo bypass). Por isso são 14 fases, mesmo com `granularity: coarse` no config: a regra do dono prevalece.
- Migration e SQL de escrita: o agente entrega o arquivo e só o João roda. O código degrada (neutro/"não medido") se a tabela ainda não existir.
- Fase com tela ou comportamento termina com print do site no ar conferido, não só com build verde.
- Nenhum arquivo novo em `api/` (12/12 funções na Vercel Hobby); rota nova entra pelo dispatcher `api/sync/manual.ts`.
- As 12 decisões abertas do João (PROJECT.md) não são assumidas; cada fase diz quais a bloqueiam.
- Nenhum nome ou telefone de paciente em arquivo commitado.
- Conta pesada não fica mais lenta: medir em produção antes e depois (lição de 04/11).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Fase 0 — Confiança nos números (conferência)** - Conferência à mão de 1 semana fechada em 3 clínicas, contra o CRM ao vivo; tabela de diferenças e causas; correções; o João fecha as definições (paralela)
- [ ] **Phase 2: Log por rota** - Cada abertura de tela gravada, inclusive escondidas e equipe admin (primeira entrega de código)
- [ ] **Phase 3: Menu da equipe (esconder com o log gravando)** - Equipe com 3 itens; 70 telas escondidas (60 abertas pela busca); 3 tiradas com redirecionamento
- [ ] **Phase 4: Pacote do template do WhatsApp à Meta** - Pacote pronto para o João pedir o template, cedo no calendário (sem código, paralela, após a decisão 7)
- [ ] **Phase 5: Consultas de verificação** - Cobertura de `post_id`/`ad_id`, hora do último dado por fonte, cards removidos e cópias do robô, no fuso de São Paulo
- [ ] **Phase 6: Selo de confiança (`metricas_selo`)** - Selo gravado por clínica × métrica × versão, em 4 estados, com texto curto e "o que este número conta"
- [ ] **Phase 7: Metas por SQL** - SQL das metas da Lana ligado à métrica e à versão; texto de meta vira fato, sem previsão
- [ ] **Phase 8: Endpoint `hoje`** - Um bloco por métrica com status, selo e hora do dado, sem recalcular conta pesada
- [ ] **Phase 9: Tela Hoje** - Tela de coluna única do médico com Agendaram, Fecharam, Chamaram, Foram, funil e meta; menu do médico com Hoje e Ajuda e fontes
- [ ] **Phase 10: Job de conferência semanal do Kommo** - Conferência semanal automática da Lana contra o Kommo que grava o selo
- [ ] **Phase 11: Quem chamar hoje — portão de desenho** - Documento de desenho aprovado pelo João antes de qualquer código da lista
- [ ] **Phase 12: Quem chamar hoje — construção** - Lista de até 5 pessoas com máscara no servidor, registro de abertura e liberação pelas 4 condições
- [ ] **Phase 13: Resumo semanal em sombra** - Resumo que o médico receberia, só para a equipe, sem caminho de envio
- [ ] **Phase 14: Check de liberação do degrau 1.5** - Check medido das 4 condições de liberação da v1.5 (última fase)

## Phase Details

### Phase 1: Fase 0 — Confiança nos números (conferência)

**Goal**: A equipe e o João têm a evidência para fechar as definições: a conferência de 1 semana fechada em 3 clínicas de CRMs diferentes, contra o CRM ao vivo, com cada diferença explicada e cada causa corrigida.
**Depends on**: Nothing (first phase)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06, CONF-07
**Bloqueado por decisões abertas**: 1 (as 4 definições) e 2 ("Incoming leads" do funil "Atendimento Clínico" é venda?) saem desta fase: o João decide com a tabela na mão, e a fase só fecha com o registro dele. A correção ligada ao "Incoming leads" espera a decisão 2. Nenhuma das duas segura as fases de código.
**Success Criteria** (what must be TRUE):
  1. A equipe lê a tabela "número × origem × diferença × causa × correção" de 1 semana fechada em Lana (Kommo), Marcella (FlwChat) e Antonione (Digisac), para chamaram, novas/antigas, agendaram, foram, fecharam e faturamento, com o lado da origem lido no CRM ao vivo, não no banco do Nexo
  2. Cada causa encontrada aponta para uma migration nova, entregue em arquivo que o João roda (o agente não aplica); depois que ele roda, o print do site no ar conferido mostra os números corrigidos nas 3 clínicas, e a velocidade das telas pesadas, medida em produção antes e depois, não piora
  3. A regra de "cópia do robô do Kommo" é uma só, por card, com a evidência da conferência, e dá o mesmo resultado no Nexo e na conferência para os mesmos cards; o spike registra até onde vai o histórico de eventos de etapa do Kommo (retenção e cobertura)
  4. Nenhum arquivo commitado traz nome ou telefone de paciente: a conferência usa contagens e ids internos (conferido no diff do PR)
  5. As 4 definições e a resposta sobre "Incoming leads" ficam registradas pelo João; até esse registro, nenhum documento, tela ou selo trata uma definição como fechada

**Plans**: TBD
**Nota**: roda em paralelo à trilha de código desde o início. A primeira entrega de código é o log (Phase 2): o PR desta fase, com as migrations de correção e a regra do robô, só abre depois do PR do log. As Phases 5, 10 e 11 usam a saída CONF-05 (regra do robô) assim que ela existir, sem esperar a fase inteira fechar.

### Phase 2: Log por rota

**Goal**: Cada abertura de tela fica gravada, inclusive das telas escondidas e da equipe admin, para que esconder, cortar e decidir o SAP se apoiem em dado de uso.
**Depends on**: Nothing (primeira entrega de código)
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04
**Bloqueado por decisões abertas**: nenhuma. O critério de "log ligado" da liberação da v1.5 é fixado pelo João e medido na Phase 14; não bloqueia esta.
**Success Criteria** (what must be TRUE):
  1. Toda tela que abre de fato (pelo menu, pela busca, por link direto ou por redirecionamento) grava uma linha com rota padrão, clínica, papel, sessão, horário e origem; uma tela negada por guarda grava `bloqueada` (e o destino grava `redirecionamento`); as 12 rotas que só redirecionam pela configuração não ganham linha própria e aparecem como "só redireciona" na aba (ratificado pelo João em 09/11/2026); em produção aparecem linhas de admin e de viewer nas primeiras 24 h
  2. Nenhuma linha gravada contém query string, id de paciente ou URL completa (conferido por consulta de leitura nas linhas de produção)
  3. A equipe admin abre uma visão agregada de aberturas por rota e período; quem não é admin não lê o log
  4. A navegação não fica perceptivelmente mais lenta (medida em produção antes e depois) e uma falha ao gravar não trava a tela
  5. A tabela do log chega como migration em arquivo que o João roda; print do site no ar conferido com a visão agregada mostrando aberturas reais

**Plans:** 3/4 plans executed

Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Fatia traçadora: abertura grava em rota_acessos (migration, RLS, gatilho) + Wave 0 do cron

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Origem completa (menu, busca, link, direto, redirecionamento, bloqueada), dedupe de 2 s, retenção de 180 dias

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Leitura agregada (RPC rota_acessos_resumo) e aba "Uso das telas" em /admin/conferencia

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 02-04-PLAN.md — Suíte do CI verde, PR na base claude/doctor-creator-hub-nixvw6 e verificação no site no ar com o João (migration, 24 h, privacidade, velocidade, print)

### Phase 3: Menu da equipe (esconder com o log gravando)

**Goal**: A equipe trabalha com 3 itens de menu e acha qualquer tela escondida pela busca, sem perder acesso a nada e com cada abertura gravada.
**Depends on**: Phase 2 (o log precisa estar gravando e conferido em produção há 7 dias corridos, com linhas de admin e de viewer, antes de esconder qualquer tela: é a linha de base; D-14 de 02-CONTEXT.md)
**Requirements**: MENU-01, MENU-02, MENU-03, MENU-04, MENU-07
**Bloqueado por decisões abertas**: 3 (quais telas saem de vez além das 3 do brief: a lista final espera o João; esta fase esconde sem apagar), 5 (algum cliente foi vendido com SAP? muda como o SAP fica escondido por cliente; até a resposta, o SAP segue escondido e congelado, sem remover rota), 11 (card sorting com a equipe sobre os 3 itens: os rótulos finais esperam).
**Success Criteria** (what must be TRUE):
  1. A equipe vê só Carteira, Clínica e Conferência e fontes no menu; o menu do médico não muda nesta fase (muda junto com a Tela Hoje, na Phase 9)
  2. A equipe abre qualquer uma das 60 telas escondidas que abrem (as outras 10 escondidas só redirecionam) por Cmd+K no computador e pelo botão Buscar visível no celular, e a abertura aparece no log com a origem da busca
  3. As 3 rotas tiradas levam à tela certa, sem 404; login, redefinir senha, primeiro acesso, OAuth, sem acesso e `/r/` abrem exatamente como antes; nenhuma tabela `sap_*` muda
  4. Um teste no CI confere o registro único: 87 linhas = 14 vivas + 70 escondidas + 3 tiradas (medido em `src/routeTree.gen.ts`, aceito pelo João em 09/11/2026)
     (Nota de 09/11/2026: o teste confere o conjunto de rotas medido em `src/routeTree.gen.ts`, 81 telas nessa data (80 folhas `/_authenticated` + `/sem-acesso`; 90 é a contagem de arquivos em `src/routes`); a divisão 14/73/3 do brief é recontada contra esse conjunto na Phase 3.)
  5. Print do site no ar conferido: menu da equipe no computador e no celular, e uma tela escondida aberta pela busca

**Plans:** 7 plans (um PR só para a fase)

Plans:
**Wave 1** *(só depois do merge da Phase 2 em claude/doctor-creator-hub-nixvw6 e do pull em gsd/nexo-v5)*
- [ ] 03-01-PLAN.md — Checkpoint de entrada (Phase 2 no ar) + fatia traçadora (registro → busca nova → casca da clínica → log com origem busca) + teste do registro 87 = 14/70/3 (59 escondidas no índice de produção; estrategista só acha telas sem guarda)

**Wave 2** *(blocked on Wave 1 completion; os dois planos rodam em paralelo, sem arquivo em comum)*
- [ ] 03-02-PLAN.md — Menu da equipe de 3 itens no computador (casca da clínica), estrategista, ícones Tabler inline, trava dos links do médico
- [ ] 03-03-PLAN.md — Sistema visual: tokens Cobalto, sempre claro (equipe e médico), Urbanist 16 px, moldura, limpeza e movimento; SAP intacto

**Wave 3** *(blocked on Wave 2 completion; os dois planos rodam em paralelo, sem arquivo em comum)*
- [ ] 03-04-PLAN.md — Celular da equipe (Buscar tela e folha Menu), rodapé com AvatarGerado; médico sem o controle Aparência e com a marca N, mesmos itens
- [ ] 03-05-PLAN.md — Busca completa (chips, Ver todas, teclado, estados) + e2e da busca por área, do estrategista abrindo cada tela, das tiradas e das rotas de acesso

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03-06-PLAN.md — Casca /admin com o mesmo menu, a mesma busca e a última clínica + axe + specs antigos do menu

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 03-07-PLAN.md — Suíte do CI e regras da fase; [BLOCKING] merge só após 7 dias de log, com velocidade de antes e rotas de acesso anotadas; [BLOCKING] site no ar conferido (prints, velocidade de depois, rotas de acesso)

**UI hint**: yes

### Phase 03.1: Redesenho das telas com inteligência (INSERTED)

**Goal:** Toda tela do Nexo (clínica e equipe) e todo card usam o desenho da prancha, e cada página diz em linguagem simples o que aconteceu, por que aconteceu e o que fazer, em vez de só mostrar números. Pedido do João em 10/11/2026: "vc n refez todas as telas e nem todos os cards. a informação em cada página ainda continua confusa e sem inteligência".
**Requirements**: TELA-01, TELA-02, TELA-03, TELA-04, TELA-05, LEIT-01, LEIT-02, LEIT-03, LEIT-04, LEIT-05, LEIT-06, LEIT-07
**Escopo (João, 10/11/2026):** a leitura sai só de regras fixas, calculada na hora no navegador; sem IA, sem tabela nova, sem migration e sem job agendado ("sem isso de IA porque fica muito caro pra manter a plataforma").
**Depends on:** Phase 3
**Success Criteria** (what must be TRUE):
  1. Nenhuma tela viva da clínica ou da equipe fica com card ou bloco no desenho antigo; há uma lista de telas e cards conferida tela por tela
  2. Cada tela abre com a leitura do período: o que aconteceu, o porquê (com o número que sustenta) e o próximo passo, com quem resolve
  3. A leitura só afirma o que o dado sustenta: dado faltando ou não confiável aparece como tal, nunca vira conclusão
  4. O João olha cada tela e diz que entende sem explicação

**Plans:** 6/17 plans executed em 9 ondas (um PR só para a fase; no máximo 2 planos e uma publicação na VPS por onda; cada plano na própria worktree)

Plans:
**Wave 1**
- [x] 03.1-01-PLAN.md — Tracer: Resultados com a leitura por regra no molde (PaginaNexo, LeituraDaTela, fatos, portão, texto) + peças de bloco nx + receita de publicação na VPS
- [x] 03.1-02-PLAN.md — Inventário das 43 telas e dos cartões de cada uma, com teste no CI, e o contrato do molde

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03.1-03-PLAN.md — Resultados: resumo da clínica em 3 linhas (D-07), Pacientes e as telas em construção; publica; o João olha
- [x] 03.1-04-PLAN.md — Peças antigas compartilhadas que o SAP não usa no desenho nx; porta do Playwright configurável

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03.1-05-PLAN.md — Marketing / Instagram (5 telas); publica; o João olha
- [x] 03.1-06-PLAN.md — Versões nx dos painéis de agente, do planejador e das estratégias (o SAP fica igual)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03.1-07-PLAN.md — Marketing / Anúncios, campanhas e links (rastreio suspeito vira "sem leitura"); publica; o João olha
- [ ] 03.1-08-PLAN.md — Comercial / Funil, Jornada e Resultados por origem

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 03.1-09-PLAN.md — Marketing / Conteúdo (Ideias, Referências, Dúvidas, Inteligência Criativa, D-11); publica com o CRM do 08; o João olha
- [ ] 03.1-10-PLAN.md — Comercial / Guia, Papel de cada funil, Etapas do CRM e Contatos

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 03.1-11-PLAN.md — Plano de ação e Relatório do período; publica com o CRM do 10; o João olha
- [ ] 03.1-12-PLAN.md — Comercial / Qualidade do atendimento e Central

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 03.1-13-PLAN.md — Equipe / Carteira e Integrações; publica com o Atendimento do 12; o João olha
- [ ] 03.1-14-PLAN.md — Equipe / Conferência de dados e Configurar este cliente

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 03.1-15-PLAN.md — Equipe / telas abertas pela busca (7 telas)
- [ ] 03.1-16-PLAN.md — Limpeza das peças duplicadas e dos componentes antigos sem uso

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 03.1-17-PLAN.md — Inventário estrito (43 de 43), specs cruzados verdes, publicação final, PR único e o olhar final do João (critério 4)

### Phase 03.1.1: Tela O que fazer hoje para o médico (INSERTED)

**Goal:** Visão do médico com 6 telas (Hoje, Resultados da clínica, Onde os pacientes travam, De onde vêm os pacientes, Instagram, Relatório do período) e as telas repetidas juntadas em abas, sem apagar nenhuma, mais a primeira versão da tela Hoje (a mesma da Phase 9, que depois ganha os números com selo) com 3 a 5 ações tiradas das leituras por regra (sem IA). A equipe continua vendo tudo, agrupado. Cada aba cabe em no máximo uma tela e meia de altura, com o detalhe fechado: nada de página gigante de rolagem. Os endereços antigos levam à aba certa. Lista aprovada pelo João em 10/11/2026 (ver 03.1.1-CONTEXT.md). A fase 03.1 pausa depois da etapa 3 e continua em cima das telas juntadas.
**Success criteria:**
1. O médico vê no menu só: O que fazer hoje, Resultados da clínica, Onde os pacientes travam, De onde vêm os pacientes, Instagram e Relatório do período.
2. Toda tela antiga continua abrindo, como aba de uma tela juntada ou pelo endereço antigo, que leva à aba certa; nenhuma informação some.
3. Em 375 e 1440 px, a aba aberta de cada tela juntada do médico e a Hoje têm no máximo 1,5 altura de tela com o detalhe fechado (teste automático); as abas da equipe ficam medidas e viram teste quando a 03.1 as puser no molde.
4. A Hoje mostra de 3 a 5 ações, cada uma com o número que a sustenta e quem resolve; com dado ruim diz "sem leitura: motivo".
5. O João entende a visão do médico sem explicação.

**Requirements**: MEDV-01, MEDV-02, MEDV-03, MEDV-04, MEDV-05
**Depends on:** Phase 03.1, etapas 1 a 3 (o resto da 03.1 vem depois desta)
**Plans:** 1/7 plans executed (um PR só para a fase; um executor por vez, cada um commita o próprio trabalho; o orquestrador publica depois do 04 e do 07)

Plans:
**Wave 1**
- [x] 03.1.1-01-PLAN.md — Tracer: abas em pasta de ponta a ponta na tela juntada Instagram (aba = caminho da tela antiga, log aba por aba pelo routeId sem migration, contagem sem consulta nova, medida de altura)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 03.1.1-02-PLAN.md — D-07 nas peças compartilhadas do molde (pílula de ação na leitura, cartão com ícone no círculo, número com legenda, variação em pílula, laranja/listrado/tracejado); Instagram em 1,5 tela; contrato em molde-da-pagina.md

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 03.1.1-03-PLAN.md — Onde os pacientes travam (Funil com 2 partes, Consultas, Vendas, Jornada) e Por origem no molde, no D-07 e em 1,5 tela

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03.1.1-04-PLAN.md — Anúncios, Links e Conteúdo × Comercial no molde e em 1,5 tela (26 medidas no médico); publica; o João olha as 3 telas juntadas

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 03.1.1-05-PLAN.md — O que fazer hoje: primeira versão da tela Hoje da Phase 9 (3 a 5 ações por regra, aviso de poucas ações, sem leitura, sem selo, D-07, 1,5 tela)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 03.1.1-06-PLAN.md — Menu do médico com 6 itens, entrada na Hoje e busca do médico; specs do menu antigo atualizados

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 03.1.1-07-PLAN.md — Equipe agrupada (Plano, Agentes com a Central, Conteúdo, Atendimento, Configurar CRM), busca com "Seção › Aba", alturas da equipe registradas; publica; o João olha a visão do médico e a da equipe (critério 5)

### Phase 4: Pacote do template do WhatsApp à Meta

**Goal**: O João tem o pacote pronto para pedir o template à Meta cedo no calendário, para que a aprovação externa não segure a v1.5.
**Depends on**: Nothing (não é código; começa quando a decisão 7 for autorizada)
**Requirements**: TMPL-01
**Bloqueado por decisões abertas**: 7 (autorizar o pedido do template à Meta: sem ela a fase não começa), 9 (lista fechada de verbos e modelos de texto: o texto do template sai dela). Fora das 12: o fluxo do botão do "Quem chamar" (`wa.me` ou API com template) muda o pedido; ele é apresentado ao João no portão de desenho (Phase 11).
**Success Criteria** (what must be TRUE):
  1. O João recebe o texto do template em português, no passado, sem adjetivo, promessa ou previsão, com uma amostra preenchida sem dado real de paciente e a categoria proposta com o motivo
  2. O pacote traz a checagem do WABA e do número (conta, número na API oficial, verificação), dizendo o que foi conferido e o que ainda falta
  3. O pacote fica registrado no repositório (nome, versão, categoria); o pedido à Meta é feito pelo João, e o agente não envia nada à Meta

**Plans**: TBD
**Nota**: paralela à trilha de código; não segura as fases seguintes.

### Phase 5: Consultas de verificação

**Goal**: A equipe vê, por clínica e por fonte, se o dado da origem permite conferir (cobertura de `post_id`/`ad_id`, hora do último dado, cards removidos e cópias do robô), tudo no fuso de São Paulo.
**Depends on**: Phase 2 (ordem do brief: verificação depois do log)
**Requirements**: VERI-01, VERI-02, VERI-03, VERI-04
**Bloqueado por decisões abertas**: 8, só para os pisos (cobertura mínima de `post_id` e limite de casamento conversa→card): as consultas mostram a cobertura e o n, sem julgar se passa no piso.
**Success Criteria** (what must be TRUE):
  1. A equipe vê a cobertura de `post_id`/`ad_id` por clínica e fonte, com o n; onde a fonte não traz o campo, aparece "não medido", nunca um 0% inventado
  2. A equipe vê, por fonte, a hora do último dado gravado separada da hora da última tentativa
  3. A equipe vê, por clínica, a contagem de cards removidos na origem e de cópias do robô, com a mesma regra da conferência
  4. Os testes de borda passam em `America/Sao_Paulo`: domingo à noite, virada de mês e segunda 00:00 caem no dia e na semana certos
  5. As consultas só leem (nenhuma escrita no banco; função ou view nova chega como migration em arquivo que o João roda); print do site no ar conferido com o resultado na área da equipe

**Plans**: TBD
**Nota**: a contagem de cópias do robô usa a regra da Fase 0 (CONF-05) assim que ela existir. Pode andar ao lado da Phase 3 enquanto ela espera os 7 dias de linha de base do log.

### Phase 6: Selo de confiança (`metricas_selo`)

**Goal**: Cada número passa a ter um selo gravado por clínica × métrica × versão da definição, em 4 estados e com texto curto, e nenhuma tela inventa selo.
**Depends on**: Phase 5 (evidência e fuso testados antes do selo)
**Requirements**: SELO-01, SELO-02, SELO-03, SELO-04, SELO-05, SELO-06, SELO-07
**Bloqueado por decisões abertas**: 6 (o João rodar o SQL de `metricas_selo` com o texto curto: até lá o site mostra neutro/"não medido", sem quebrar), 1 (nenhum verde e nenhuma versão 1 de definição antes de o João fechar as 4 definições).
**Success Criteria** (what must be TRUE):
  1. O usuário vê o selo (verde, neutro, âmbar ou não medido) com ícone e texto curto de 14px nos números que já aparecem na tela e, ao tocar, lê "o que este número conta"; "não medido" nunca aparece como zero, vermelho ou queda
  2. Não existe botão "marcar como conferido"; um teste confirma que usuário logado não escreve selo: só o job de conferência e o SQL do João escrevem
  3. Testes confirmam que um verde volta a neutro em 30 dias e sempre que muda a versão da definição ou o perfil de etapas da clínica
  4. Antes de o João rodar o SQL, o site no ar mostra neutro/"não medido" sem erro; depois, mostra o selo gravado (print do site no ar conferido nos dois momentos)
  5. As migrations (tabelas do selo e versão da definição no histórico diário) chegam em arquivo que o João roda; depois disso, cada linha nova de `resultados_diarios` diz a versão da definição usada

**Plans**: TBD
**UI hint**: yes

### Phase 7: Metas por SQL

**Goal**: A Lana tem metas cadastradas, ligadas à métrica e à versão da definição, antes da tela Hoje, e todo texto de meta passa a dizer fato, sem previsão.
**Depends on**: Phase 6 (a meta se liga à versão da definição gravada pelo selo)
**Requirements**: GOAL-01, GOAL-02
**Bloqueado por decisões abertas**: 6 (o João rodar o SQL das metas), 1 (qual versão da definição as metas de Agendaram e Fecharam usam: o SQL deixa a versão explícita e não escolhe a definição pelo João).
**Success Criteria** (what must be TRUE):
  1. O João recebe o arquivo SQL das metas da Lana, com cada meta ligada a uma métrica e a uma versão da definição; o agente não roda o SQL
  2. Depois que o João roda, uma consulta de leitura mostra as metas da Lana cadastradas para as métricas certas
  3. A tela e o alerta diário deixam de dizer "meta em risco" ou qualquer previsão e passam a dizer o fato (quanto foi feito e quanto falta, até ontem); print do site no ar conferido e um alerta de teste conferido

**Plans**: TBD

### Phase 8: Endpoint `hoje`

**Goal**: A tela Hoje tem de onde ler: um bloco por métrica com status, selo e hora do dado, sem recalcular conta pesada e sem entregar ao médico número sem selo.
**Depends on**: Phase 6, Phase 7 (o bloco de meta lê as metas cadastradas)
**Requirements**: HOJE-01, HOJE-02, HOJE-03
**Bloqueado por decisões abertas**: 1 (rótulos finais e verde de Agendaram e Fecharam: até lá os blocos levam as duas contagens e nenhum selo verde).
**Success Criteria** (what must be TRUE):
  1. Uma chamada ao `hoje` devolve um bloco por métrica com status, selo e hora do dado; com um bloco forçado a falhar, os outros chegam normais
  2. Chamado como médico, um bloco sem selo chega sem número; chamado pela equipe, chega com o número e o aviso "sem selo"; quem não tem acesso à clínica é recusado
  3. Abrir a Hoje não recalcula conta pesada: o tempo de resposta do `hoje` e das telas pesadas é medido em produção antes e depois do PR, e as telas pesadas não ficam mais lentas
  4. O deploy continua com 12 funções (a rota entra pelo dispatcher) e o SQL novo chega em migration que o João roda; print do site no ar conferido: resposta do `hoje` em produção, chamada como médico e como equipe, anexada ao PR

**Plans**: TBD

### Phase 9: Tela Hoje

**Goal**: O médico da Lana abre a Hoje no celular ou no computador e lê, numa coluna, Agendaram, Fecharam, Chamaram e Foram com selo, fonte, funil e meta; o menu dele passa a ter só Hoje e Ajuda e fontes.
**Depends on**: Phase 3 (registro único de rotas), Phase 8
**Requirements**: HOJE-04, HOJE-05, HOJE-06, HOJE-07, HOJE-08, HOJE-09, HOJE-10, HOJE-11, HOJE-12, MENU-05, MENU-06
**Bloqueado por decisões abertas**: 1 (texto final do par de Agendaram e de Fecharam), 4 (paleta: sem resposta, vale a identidade atual, azul `#2563EB` e roxo só em IA), 5 (o que fazer com o redirecionamento de clínica SAP na entrada), 9 (modelo da frase-resumo e verbos), 11 (protótipo de 400px com dados da Lana e teste de 10 s com 3 médicos: o aceite visual espera).
**Success Criteria** (what must be TRUE):
  1. O médico vê a Hoje em coluna única (400px no celular, 720px no computador) com Agendaram e Fecharam da última semana fechada (seg–dom) escritos como par ("7 entraram… · 11 chegaram…"; "13 vendas, 3 com valor"), mais Chamaram e Foram, cada um com seu selo
  2. A faixa de fontes diz "cálculo de hoje 03:30" e fica âmbar com dado de mais de 1 dia; a frase-resumo segue o modelo fixo, no passado, sem adjetivo, e herda o pior selo; o funil é barra de 8px e diz "funil inconsistente nesta clínica" quando não é monotônico ou tem etapa não medida
  3. Com meta cadastrada, o médico vê "12 de 20, faltam 8 em 9 dias", sem projeção; carregando (após 3 s, "Calculando, clínica grande leva até 30 s"), vazio (com a condição que falta) e erro aparecem dentro do bloco, sem derrubar a tela
  4. O menu do médico tem só Hoje e Ajuda e fontes, onde ele vê de onde vem cada número e quando foi calculado; as telas com número sem selo saem do médico e ficam para a equipe com o aviso "sem selo"
  5. Um teste no CI barra palavras proibidas no texto para o médico ("em risco", "vai", "deve", adjetivos, promessa); print do site no ar conferido no celular e no computador com a Lana

**Nota de 10/11/2026 (João)**: a primeira versão da Hoje nasce na Phase 03.1.1 (ações por regra, aviso "sem selo"); esta fase evolui a mesma tela, sem criar outra. O médico vê 6 itens desde a 03.1.1; aqui o João decide se o menu dele encolhe para Hoje e Ajuda e fontes (MENU-06) ou fica com 6.

**Plans**: TBD
**UI hint**: yes

### Phase 10: Job de conferência semanal do Kommo

**Goal**: Toda semana a Lana é conferida sozinha contra o Kommo e o resultado vira selo (verde quando bate, âmbar com os dois números quando difere), sem estourar o limite do Kommo.
**Depends on**: Phase 5 (consultas e fuso), Phase 6 (selo)
**Requirements**: KOMM-01, KOMM-02, KOMM-03, KOMM-04, KOMM-05
**Bloqueado por decisões abertas**: 7 (autorizar o job em produção: até lá ele é construído e testado sem rodar em produção, e a verificação no ar espera), 1 (verde de Agendaram e Fecharam com versão da definição: até lá o job grava as duas contagens e nenhum selo fica verde).
**Success Criteria** (what must be TRUE):
  1. Depois de autorizado, o job roda sozinho toda semana sobre a semana fechada (seg–dom, horário de São Paulo) e grava as duas contagens de cada métrica da Lana, visíveis para a equipe
  2. Quando bate, o selo fica verde com a data da conferência; quando difere, âmbar com os dois números escritos; quando a leitura falha, o selo não muda e a execução fica registrada como "não conferido"
  3. Em teste com respostas simuladas, o job roda uma clínica por chamada, respeita o limite do Kommo para o domínio inteiro e para no 429/403
  4. A equipe recebe alerta quando a conferência passa de 8 dias sem rodar; o disparo é o Vercel Cron semanal com `CRON_SECRET` próprio, e o caminho reserva pelo n8n está documentado
  5. As migrations chegam em arquivo que o João roda; print do site no ar conferido com o selo gravado pelo job na Lana

**Plans**: TBD
**Nota**: usa a regra de cópia do robô da Fase 0 (CONF-05).

### Phase 11: Quem chamar hoje — portão de desenho

**Goal**: Antes de qualquer código da lista, o João aprova um documento de desenho que diz como a lista protege o paciente e a clínica.
**Depends on**: Phase 5 (consulta de hora do último dado e de tempo parado)
**Requirements**: CHAM-01
**Bloqueado por decisões abertas**: 10 (base contratual do acesso nominal da equipe à lista, LGPD) e 8 (limite de casamento conversa→card): o documento só é aprovado com as duas respondidas pelo João; 9 (textos do motivo e do botão). Fora das 12: o fluxo do botão (`wa.me` ou API com template) e o modelo de acesso da secretária, que o documento apresenta para o João escolher.
**Success Criteria** (what must be TRUE):
  1. O documento de desenho cobre: base do acesso nominal (decisão 10), limite de casamento conversa→card (decisão 8), regra do robô por card (da Fase 0), modelo de acesso da secretária e fluxo do botão
  2. O documento diz como medir os ≥18 de 20 dentro do app, sem nome gravado, e como cada uma das 4 condições fica gravada antes de a lista aparecer ao médico
  3. O João aprova o documento por escrito, com data; até lá nenhum código da lista entra em PR
  4. O documento não traz nome nem telefone de paciente; os exemplos usam dado sintético ou agregado

**Plans**: TBD
**Nota**: precisa da regra do robô da Fase 0 (CONF-05), não da fase inteira. Pode ser escrito durante as Phases 6 a 10; a Phase 12 só começa com ele aprovado.

### Phase 12: Quem chamar hoje — construção

**Goal**: A equipe vê até 5 pessoas para chamar hoje, com motivo mecânico, máscara feita no servidor e registro de cada abertura; o médico só vê a lista quando as 4 condições estão gravadas como cumpridas.
**Depends on**: Phase 9 (botão na Hoje), Phase 10 (cards removidos e conferência em dia), Phase 11 (documento aprovado)
**Requirements**: CHAM-02, CHAM-03, CHAM-04, CHAM-05, CHAM-06, CHAM-07
**Bloqueado por decisões abertas**: 10 e 8 (pelo portão da Phase 11), 7 (template aprovado, se o fluxo escolhido do botão usar template), 9 (texto do motivo).
**Success Criteria** (what must be TRUE):
  1. A equipe vê até 5 pessoas com motivo mecânico ("escreveu há 3 dias, sem resposta"), sem cards removidos, cópias do robô ou quem já voltou, agendou ou cancelou
  2. Chamando por papel em produção, o médico recebe iniciais, a secretária com acesso nominal recebe o primeiro nome e a agência só a contagem; nenhuma resposta traz telefone
  3. Cada abertura da lista grava um registro na mesma requisição; com o registro forçado a falhar, a lista não abre
  4. A secretária da Lana marca 20 linhas como certas ou erradas, com motivo, dentro do app, sem nome gravado; a lista só aparece ao médico quando as 4 condições estão gravadas como cumpridas (incluindo ≥18 de 20)
  5. O botão abre o WhatsApp oficial com confirmação e nunca envia sozinho; as migrations chegam em arquivo que o João roda; print do site no ar conferido (lista da equipe e Hoje do médico com a lista ainda bloqueada)

**Plans**: TBD
**UI hint**: yes

### Phase 13: Resumo semanal em sombra

**Goal**: Toda semana a equipe lê o resumo que o médico receberia, sem que nada seja enviado ao médico, para medir se o resumo da v1.5 pode sair.
**Depends on**: Phase 9 (mesmas regras de texto e números da Hoje), Phase 10 (selo gravado pelo job)
**Requirements**: RESU-01, RESU-02, RESU-03
**Bloqueado por decisões abertas**: 9 (lista fechada de verbos: a ação do resumo só usa verbos dela), 6 (só para rodar o SQL de opt-in, que nesta fase é entregue e não usado).
**Success Criteria** (what must be TRUE):
  1. Toda semana a equipe vê o resumo com 2 números e 1 ação com verbo da lista fechada, e os números são os mesmos do selo gravado
  2. Com selo não verde, grupo menor que 5, fonte com mais de 1 dia ou etapa fora de ordem, a equipe vê "resumo suspenso: [motivo]"
  3. Não existe caminho de envio ao médico (nenhum botão, rota ou job envia); o SQL de opt-in é entregue em arquivo e não é usado
  4. As migrations chegam em arquivo que o João roda; print do site no ar conferido com o resumo de uma semana, ou o "resumo suspenso" com o motivo, na área da equipe

**Plans**: TBD

### Phase 14: Check de liberação do degrau 1.5

**Goal**: A equipe vê, medido, se a v1.5 pode ser liberada (as 4 condições, cada uma com estado e fonte), e o milestone termina quando esse check é medido.
**Depends on**: Phase 2 (log), Phase 10 (verde pelo job), Phase 12 (validação das 20 linhas), Phase 13 (última fase do milestone)
**Requirements**: REL-01
**Bloqueado por decisões abertas**: nenhuma bloqueia a construção do check; ele mede a decisão 1 (definições fechadas) sem assumi-la. Fora das 12: o critério de "log ligado" é o João quem fixa.
**Success Criteria** (what must be TRUE):
  1. A equipe vê as 4 condições, cada uma com estado medido e fonte: definições fechadas pelo João, Agendaram e Fecharam verdes na Lana (lidos de `metricas_selo`), secretária com ≥18 de 20 (da validação no app) e log ligado
  2. "Log ligado" é medido pelo critério que o João fixou; antes disso, a condição aparece como "critério não fixado", nunca como cumprida
  3. Nenhuma condição aparece cumprida sem dado gravado, e o check não tem botão para marcar condição como cumprida
  4. Print do site no ar conferido com o check medido na Lana

**Plans**: TBD

## Decisões abertas × fases

Nenhuma decisão é assumida. A tabela diz onde cada uma segura o trabalho.

| # | Decisão do João | Fases que ela bloqueia |
|---|-----------------|------------------------|
| 1 | As 4 definições (Agendaram, Foram, venda sem valor, par lado a lado) | 1 (sai daqui), 6, 7, 8, 9, 10; medida na 14 |
| 2 | "Incoming leads" do funil "Atendimento Clínico" é venda? | 1 |
| 3 | Quais telas saem de vez | 3 |
| 4 | Paleta (azul atual ou lilás/roxo) | 9 |
| 5 | Algum cliente foi vendido com SAP? | 3, 9 |
| 6 | Rodar o SQL de `metricas_selo`, das metas e do opt-in | 6, 7, 13 |
| 7 | Autorizar o job do Kommo e o pedido do template à Meta | 4, 10, 12 |
| 8 | Piso de cobertura de `post_id` e limite de casamento conversa→card | 5 (só os pisos), 11, 12 |
| 9 | Lista fechada de verbos e modelos de texto | 4, 9, 11, 12, 13 |
| 10 | Base contratual do acesso nominal à lista (LGPD) | 11, 12 |
| 11 | Protótipo de 400px, teste de 10 s com 3 médicos, card sorting | 3, 9 |
| 12 | Chave de IA antes da v3 | nenhuma neste milestone |

## Progress

**Execution Order:**
- Trilha de código, um PR por fase: 2 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 12 → 13 → 14. A Phase 5 pode andar enquanto a Phase 3 espera os 7 dias de linha de base do log.
- Em paralelo, sem segurar a trilha de código: Phase 1 (começa já; o PR abre depois do PR do log; fecha quando o João registra as definições), Phase 4 (começa quando a decisão 7 for autorizada) e Phase 11 (documento escrito durante as Phases 6 a 10; a Phase 12 só começa com ele aprovado).
- A liberação espera a Fase 0: nenhum selo verde antes de o João registrar as 4 definições.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fase 0 — Confiança nos números (conferência) | 0/TBD | Not started | - |
| 2. Log por rota | 3/4 | In Progress | - |
| 3. Menu da equipe (esconder com o log gravando) | 0/TBD | Not started | - |
| 4. Pacote do template do WhatsApp à Meta | 0/TBD | Not started | - |
| 5. Consultas de verificação | 0/TBD | Not started | - |
| 6. Selo de confiança (`metricas_selo`) | 0/TBD | Not started | - |
| 7. Metas por SQL | 0/TBD | Not started | - |
| 8. Endpoint `hoje` | 0/TBD | Not started | - |
| 9. Tela Hoje | 0/TBD | Not started | - |
| 10. Job de conferência semanal do Kommo | 0/TBD | Not started | - |
| 11. Quem chamar hoje — portão de desenho | 0/TBD | Not started | - |
| 12. Quem chamar hoje — construção | 0/TBD | Not started | - |
| 13. Resumo semanal em sombra | 0/TBD | Not started | - |
| 14. Check de liberação do degrau 1.5 | 0/TBD | Not started | - |
