---
phase: quick-261112-glf
plan: 01
subsystem: nexo-funil-e-cartoes
tags: [nexo, funil, grafico, acessibilidade, regra-pura, sketch-001, sketch-002]
status: complete
requires:
  - 03.1.1 (telas juntadas, molde da página)
  - 261112-e8e (menos texto, mais visual)
  - sketches 001 (variante A2) e 002 (variante A), aprovados pelo João em 12/11/2026
provides:
  - NxFunilDesenhado (funil A2 com gaveta em dialog nativo)
  - src/lib/funil-desenhado.ts (geometria, textos e os adaptadores comercial, pacientes e jornada)
  - NxLinhaDe30Dias e a prop opcional serie de NxCartaoNumero
  - src/lib/linha-30-dias.ts (pontos, caminho, média, dia, comparação e resumo da série diária)
  - Contagem em cinza das abas Funil e Jornada (pessoas que viraram lead no período)
affects:
  - src/routes/_authenticated.$clientId.crm-painel.tsx
  - src/routes/_authenticated.$clientId.pacientes.tsx
  - src/routes/_authenticated.$clientId.jornada.tsx
  - src/routes/_authenticated.$clientId.anuncios.tsx
  - src/routes/_authenticated.$clientId.conteudo.tsx
  - src/lib/registro-de-telas.ts
  - docs/redesenho/molde-da-pagina.md
requirements: [MEDV-02, MEDV-04, LEIT-03]
key-files:
  created:
    - src/lib/funil-desenhado.ts
    - src/components/nx/funil-desenhado.tsx
    - src/styles/nexo-funil-desenhado.css
    - src/lib/linha-30-dias.ts
    - src/components/nx/linha-de-30-dias.tsx
    - src/styles/nexo-linha-30-dias.css
    - scripts/test-funil-desenhado.ts
    - scripts/test-linha-30-dias.ts
  modified:
    - src/lib/leitura/fatos-comercial.ts
    - src/components/nx/cartoes.tsx
    - src/styles/nexo-resultados.css
    - scripts/test-telas-juntadas.ts
    - tests/e2e/telas-juntadas.spec.ts
    - tests/e2e/comercial-painel.spec.ts
    - tests/e2e/anuncios-painel.spec.ts
decisions:
  - "Nomes do João (D-06, só os nomes) valem no funil desenhado; a leitura mantém os nomes dela porque o filtro de jargão de texto.ts proíbe a palavra 'lead'"
  - "Percentual da passagem no formato de fmtFracao ('9,4% passam'), não arredondado para inteiro como no exemplo do plano"
  - "Atendido em Do contato à venda só com as 3 listas inteiras (itens.length === total) e os 3 números medidos; senão Falta dado com o motivo"
  - "Jornada: as faixas começam em Conversou; Alcance, Engajamento e Comentário ou direct ficam na faixa 'Antes da conversa'"
  - "Ligação sem % (populações diferentes ou vizinha sem dado) é faixa reta neutra, sem pílula"
  - "Maior perda e fora de ordem: qualquer taxa acima de 1 liga o aviso e apaga a maior perda"
  - "Linha de 30 dias nos cartões de pessoas divide a mesma linha de 44 px com 'Ver quem são' para não estourar a régua"
metrics:
  duration: "sessão única, dois executores (o segundo fez a peça da linha e as ligações em Anúncios e Desempenho)"
  completed: 2026-11-12
  tasks: 3
plan_head_before: 746c51a5a889fecea29589bfee09bedec06fd850
plan_head_after: 19c5a0e378b704f724e731987a40a55004273136
commits: 22
actuals:
  tokens: 110000
  tasks: 3
  commits: 22
---

# Phase quick-261112-glf Plan 01: Funil desenhado e linha de 30 dias nos cartões Summary

O funil A2 com os nomes do João (Conversou · Virou lead · Atendido · Agendou · Fechou) substitui o funil de hoje em Funil › Do contato à venda, Funil › No CRM e Jornada, e a linha de 30 dias (sketch 002, A) entra nos cartões que já têm série diária em memória. Só regra pura e apresentação: nenhuma consulta nova, nenhum dado, sync, SQL, migration, endpoint ou pacote novo.

## Commits (em ordem)

`commits: 22` medido com `git rev-list --count 746c51a..HEAD`. Os 22 incluem o commit de merge do segundo executor, que repetiu 3 commits da lib da linha (teste, lib e serieContinua: 21f7c97, 8bd95e7 e 06272d2 com o mesmo conteúdo de d7b6609, 1977a74 e 3462b51); o merge não teve conflito.

| # | Hash | O que entrou |
|---|------|--------------|
| 1 | b7f91bc | Teste do funil desenhado (RED) |
| 2 | 18e7cab | Lib: geometria, textos, `deFunilComercial`; `foraDeOrdem` exportada de fatos-comercial |
| 3 | 8883599 | Peça `NxFunilDesenhado` e CSS do funil |
| 4 | c7c9282 | Rota crm-painel com o funil desenhado |
| 5 | d1d5d56 | Ajuste de altura de No CRM (faixa e ligação mais baixas, subtítulo sem o período) |
| 6 | 9669c61 | Testes dos adaptadores de pacientes e da jornada (RED) |
| 7 | e2cb3f7 | `dePacientesDoPeriodo` e `daJornada` |
| 8 | a8bc441 | Rota pacientes: funil no principal, Evolução por dia nos Detalhes, "Ver quem são" na gaveta; ajuste de comercial-painel.spec |
| 9 | f7b7d2b | Rota jornada com a faixa "Antes da conversa"; legenda na linha da pílula |
| 10 | 01a5dc5 | Contagem das abas Funil e Jornada (registro, teste tsx, e2e) |
| 11 a 13 | d7b6609, 1977a74, 3462b51 | Teste (RED), lib e `serieContinua` da linha de 30 dias |
| 14 a 16 | 21f7c97, 8bd95e7, 06272d2 | Os mesmos três itens, do segundo executor |
| 17 | 0c8e945 | `NxLinhaDe30Dias` e a prop `serie` de `NxCartaoNumero` |
| 18 | 0aed06c | Linha em Investido, Conversas iniciadas e Seguidores hoje |
| 19 | 6c7b111 | Gráfico diário de Anúncios vai para os Detalhes e a linha dos cartões o substitui |
| 20 | aa6e4ee | Merge do segundo executor |
| 21 | 6f0e894 | Linha de 30 dias nos cartões de pessoas de Do contato à venda |
| 22 | 19c5a0e | Molde: seção "j) Funil desenhado e linha de 30 dias" |

## Verificação

- `npx tsc --noEmit` (com `npm run routes:generate` antes): só os 4 erros antigos (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts).
- Testes tsx: test-funil-desenhado, test-linha-30-dias, test-leitura-comercial, test-nexo-system-css, test-telas-juntadas e test-telas-inventario passam.
- `npm test`: só as 6 falhas antigas conhecidas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta).
- Playwright (build de e2e, `--workers=1`, porta 5199): telas-juntadas, comercial-painel, anuncios-painel e instagram-painel, 152 testes, todos passam, depois do último commit de código. Porta 5199 sem servidor depois.
- Conferido contra o HEAD base (746c51a): package.json, package-lock.json, supabase/, api/, anuncios-graficos.tsx, base.tsx, pagina.tsx, blocos.tsx, tipos.ts, portao.ts, texto.ts e adaptadores.ts sem mudança; nenhuma `useQuery(` nova em src/routes.

### Alturas medidas, Detalhes fechados (limite 1218 px a 375x812 e 1350 px a 1440x900)

| Aba | 375x812 | 1440x900 |
|-----|---------|----------|
| Funil › Do contato à venda | 1196 | 1342 |
| Funil › No CRM | 1217 | 1340 |
| Jornada | 1141 | 1308 |
| Anúncios (cenário com gasto) | 987 | 1008 |
| Instagram › Desempenho | 1151 | 1266 |
| Instagram › Posts | 1207 | 1288 |
| Instagram › Destaques e Público | 1144 e 1118 | 1130 e 1166 |
| De onde vêm › Instagram | 1211 | 1217 |
| De onde vêm › Links | 1131 | 1124 |

No CRM a 375 px tem só 1 px de folga.

### A fonte de Atendido em cada tela

- **Funil › No CRM:** o passo `atendidos` do diagnóstico comercial ("saíram da primeira etapa do CRM"); vale o `escopo` do período.
- **Funil › Do contato à venda:** pessoas distintas (chave `pessoa`) de `listas.negociacao`, `agendaram` e `fecharam`, só com as 3 listas inteiras e os 3 números medidos. Nunca tem variação nem contorno (o diário não tem o campo). Com listas cortadas, Falta dado com o motivo; é o que se vê nos mocks e2e, que cortam cada lista em 3 pessoas.
- **Jornada:** o passo `atendidos` do diagnóstico, só com escopo do período, valor e confiança; senão Falta dado.

### Cartões com a linha de 30 dias

- **Ligados:** Investido e Conversas iniciadas (Anúncios, série `porDia`), Seguidores hoje (Desempenho, `seg.points`) e os cartões de pessoas de Do contato à venda (Mandaram mensagem, Agendaram, Fecharam, Foram na consulta; série do diário já carregado, só dias fechados, dia sem linha ou sem valor é buraco).
- **Sem linha, com o motivo:** Público (leitura ao vivo da Meta, sem lista de dias em memória); Leads novos do CRM (sem série diária); Desempenho não tem cartão de alcance, então o alcance por dia não entrou; cartões de pessoas sem dado (ex.: Foram na consulta sem medida) não desenham nada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Funil desenhado estourava a régua de altura de No CRM e de Do contato à venda**
- **Found during:** Task 1 (e2e telas-juntadas, MEDV-04): No CRM deu 1319 px a 375 e 1432 px a 1440 (linha de base antes: 1167 e 1248); Do contato à venda deu 1370 px a 1440.
- **Fix:** faixa de 38 px e ligação de 18 px no desktop (22 px e 8 px até 560 px, mais baixas que as alavancas do plano: 28 e 14); pílula da maior perda compacta no celular; subtítulo de No CRM "Conversou → Fechou · toque numa etapa" (o período já está nos cartões de número logo acima); a legenda do contorno sobe para a linha da pílula da maior perda. Nenhuma informação saiu.
- **Files modified:** src/styles/nexo-funil-desenhado.css, src/components/nx/funil-desenhado.tsx, src/routes/_authenticated.$clientId.crm-painel.tsx
- **Commits:** d1d5d56, f7b7d2b

**2. [Rule 1 - Bug] Cartões de pessoas com a linha estouravam Do contato à venda (1242 px e 1412 px)**
- **Found during:** fechamento (e2e telas-juntadas depois de ligar a série em pacientes).
- **Fix:** a linha e "Ver quem são" dividem uma só linha de 44 px (`.nxr-extra`, botão à esquerda na tela, linha antes dele na ordem do teclado). Alturas voltaram a 1196 e 1342.
- **Files modified:** src/routes/_authenticated.$clientId.pacientes.tsx, src/styles/nexo-resultados.css
- **Commit:** 6f0e894

**3. [Rule 3 - Blocking] e2e fora da lista do plano**
- tests/e2e/comercial-painel.spec.ts afirmava a lista "Pessoas em cada etapa" nos Detalhes; passou a afirmar o funil desenhado (figura, etapa, gaveta, Esc devolvendo o foco, "Ver quem são" levando à lista). tests/e2e/anuncios-painel.spec.ts foi ajustado pelo segundo executor para o gráfico diário nos Detalhes.

### Desvios de decisão

- **Formato do percentual:** o plano dava "9% passam" para 0,094 e dizia "mesmo formato de fmtFracao"; os dois se contradizem. Segui fmtFracao ("9,4% passam"), igual ao resto do app.
- **"Ver quem são" da gaveta não alterna:** usa `mostrar()` (sempre abre a lista) em vez de `abrir()` (que fecharia a lista já aberta).
- **Atendido de pacientes exige também Agendaram e Fecharam medidos** (além de negociação e das 3 listas inteiras), para não contar sem repetir pessoas quando a fonte faltou.
- **Ligação sem % é faixa reta neutra** (largura da menor das duas etapas, sem pílula), como o plano descreve, em vez de trapézio.
- **Lib da linha duplicada nos commits:** os dois executores escreveram teste e lib da linha com o mesmo conteúdo; ficou um arquivo só, sem conflito.

## Known Stubs

Nenhum. O funil e a linha desenham dado que a tela já carrega; etapa ou dia sem medida aparece como "Falta dado" ou buraco, nunca como zero.

## Threat Flags

Nenhum. Nenhum endpoint, caminho de autenticação ou acesso a arquivo novo. A gaveta só leva contagens (o teste tsx confere que `detalhe` só tem número) e a lista de pessoas só abre pelo `abrir`/`mostrar` que pacientes já tinha, com a checagem de papel de hoje.

## Perguntas para o João

1. **Nomes na leitura:** o funil desenhado usa Conversou · Virou lead · Atendido · Agendou · Fechou, mas o texto da leitura continua com os nomes dela (Entraram, Foram atendidos…), porque o filtro de jargão (`JARGAO` em texto.ts) proíbe a palavra "lead". Quer que a leitura passe a usar os mesmos nomes? Isso exige mudar o filtro e a VERSAO_REGRAS.
2. **Funil mais baixo:** para caber na régua de 1,5 tela, a faixa é de 38 px (22 px no celular) e a ligação de 18 px (8 px no celular). No celular a pílula "N% passam" cobre um pedaço das faixas. Prefere assim, ou aceita subir a régua dessas abas?
3. **Subtítulo de No CRM sem o período:** "Conversou → Fechou · toque numa etapa". O período continua nos cartões de número logo acima. Pode ficar assim?
4. **Seguidores hoje parece uma linha reta:** a escala da linha começa no zero e o total de seguidores varia pouco de um dia para o outro, então a linha fica quase plana. Quer que, nesse cartão, a escala comece perto do menor valor do mês (o que mostra a variação, mas exagera a diferença)?
5. **Linha em Desempenho:** a tela não tem cartão de alcance, então o alcance por dia não ganhou linha. Quer um cartão de alcance só para isso?

## Self-Check: PASSED

- Arquivos criados conferidos: src/lib/funil-desenhado.ts, src/components/nx/funil-desenhado.tsx, src/styles/nexo-funil-desenhado.css, src/lib/linha-30-dias.ts, src/components/nx/linha-de-30-dias.tsx, src/styles/nexo-linha-30-dias.css, scripts/test-funil-desenhado.ts, scripts/test-linha-30-dias.ts.
- Commits conferidos na ancestralidade do HEAD (19c5a0e): b7f91bc, 18e7cab, 8883599, c7c9282, d1d5d56, 9669c61, e2cb3f7, a8bc441, f7b7d2b, 01a5dc5, 6f0e894, 19c5a0e.
