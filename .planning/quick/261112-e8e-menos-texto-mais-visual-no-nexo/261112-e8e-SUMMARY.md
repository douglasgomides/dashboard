---
phase: quick-261112-e8e
plan: 01
subsystem: nexo-hoje-e-leituras
tags: [nexo, hoje, leitura, visual, acessibilidade, regra-pura]
status: complete
requires:
  - 03.1.1 (Hoje, telas juntadas, molde da página)
  - 03.1.1-UI-REVIEW.md (Top 5 mudanças)
provides:
  - Hoje com topo de título único e total "N ações esta semana"
  - NxBarras (barras de comparação com nome acessível próprio)
  - Fato.comparacao e AcaoDaHoje.barras (a regra calcula, a tela desenha)
  - MarcaDoTom e chip de Quem resolve
  - Nomes únicos (Próximo passo, Post de foto, Falta dado)
  - Contagem em cinza em Desempenho e Instagram (De onde vêm)
  - Bolinhas no carrossel de cartões do celular
affects:
  - src/components/nx/pagina.tsx
  - src/components/nx/hoje.tsx
  - src/components/nx/cartoes.tsx
  - src/lib/leitura/*
requirements: [MEDV-05, MEDV-04, LEIT-03, LEIT-04, LEIT-07]
key-files:
  created: []
  modified:
    - src/routes/_authenticated.$clientId.hoje.tsx
    - src/components/nx/pagina.tsx
    - src/components/nx/hoje.tsx
    - src/components/nx/cartoes.tsx
    - src/components/nx-chip.tsx
    - src/lib/leitura/tipos.ts
    - src/lib/leitura/texto.ts
    - src/lib/leitura/fatos-hoje.ts
    - src/lib/leitura/adaptadores.ts
    - src/lib/leitura/fatos-instagram.ts
    - src/lib/leitura/fatos-comercial.ts
    - src/lib/leitura-periodo.ts
    - src/lib/insight.ts
    - src/lib/resultado.ts
    - src/lib/anuncios-objetivo.ts
    - src/lib/registro-de-telas.ts
    - src/routes/_authenticated.$clientId.conteudo.tsx
    - src/routes/_authenticated.$clientId.conteudo-comercial.tsx
    - src/styles/nexo-pagina.css
    - src/styles/nexo-hoje.css
    - src/styles/nexo-cartoes.css
    - docs/redesenho/molde-da-pagina.md
decisions:
  - "Com barras, o número técnico longo (mais de 60 caracteres) sai da linha da leitura: as barras já mostram cada valor e a conta inteira continua nos Detalhes; número curto continua ao lado da frase"
  - "A aba Público fica sem contagem: é a leitura ao vivo da Meta (janela fixa de 30 dias) e não há lista de dias em memória; contar exigiria consulta nova"
  - "Aviso de poucas ações é só o motivo, sem a palavra 'leituras' e sem repetir o total do topo"
metrics:
  duration: "sessão única"
  completed: 2026-11-12
  tasks: 3
  commits: 9
plan_head_before: a23bbae7d0492d38ab0447219a0a36b8a3ac4ee2
plan_head_after: cc7a0758022b836ec8f618aef704c83c793c249b
actuals:
  tokens: 35000
  tasks: 3
  commits: 9
---

# Phase quick-261112-e8e Plan 01: Menos texto, mais visual no Nexo Summary

Hoje com título único e "N ações esta semana", Próximo passo na ordem número, legenda de 90, barras e ação, tom e Quem resolve em chip, 8 frases longas viraram frase curta com barra, um nome por coisa, contagem em cinza em 2 abas e bolinhas no carrossel do celular. Só regra pura e apresentação: nenhuma consulta nova, nada de IA, dado, sync ou SQL.

## Commits (em ordem)

| # | Hash | Item | O que entrou |
|---|------|------|--------------|
| 1 | f0eedac | Item 1 (tracer) | Topo da Hoje: saudação + "N ações esta semana" (`data-peca="total-da-semana"`), sem rótulo, pergunta visível, D5 nem chip da clínica; `NxChip ponto` (bolinha do selo, mesmo nome acessível) |
| 2 | fe77847 | Item 2 | `BarraDoFato`/`ComparacaoDoFato`, `MAX_CARACTERES_DA_LEGENDA = 90`, `AcaoDaHoje.barras`, `NxBarras`, Próximo na ordem dos cartões, `VERSAO_REGRAS_HOJE = 3` |
| 3 | eb69562 | Item 3 | `MarcaDoTom` (sinal + cor + "Sinal: tom") e chip `nx-hoje__quem` (rótulo só para leitor de tela) |
| 4 | 713ebdd | Item 4 | 8 frases + CRM compartilhado viram frase curta com número/barra; `LinhaTexto.barras`; `FraseComNumero` desenha `NxBarras` |
| 5 | fde59fa | Item 5 | "Próximo passo", "Post de foto", "Falta dado:", "Próximo passo para resolver:", sem "mediano"/"taxa"/"contas", aviso sem "leituras", "÷" fora da Hoje |
| 6 | 5a595eb | Correção (Rule 1) | Barras da leitura cabem na régua de 1,5 tela (ver Deviations) |
| 7 | 8535282 | Extra 6 | Contagem em cinza em Desempenho ("dias com dado") e Instagram de De onde vêm ("posts no período") |
| 8 | dbd3960 | Extra 7 | Bolinhas do carrossel de cartões no celular |
| 9 | cc7a075 | Molde | `docs/redesenho/molde-da-pagina.md`: seção "i) Menos texto (12/11/2026)" e topo da Hoje atualizado |

## Verificação final

- `npx tsc --noEmit`: só os 4 erros antigos esperados (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts); nenhum novo. Foi preciso copiar `src/routeTree.gen.ts` (gitignored, gerado) do checkout principal para o worktree, sem commitar.
- Scripts de leitura (hoje, periodo, instagram, comercial, anuncios, resultados, base) e `test-telas-juntadas`: passam.
- `npm test`: 184/190; as 6 falhas são exatamente as antigas conhecidas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta). Nenhuma falha nova.
- Playwright (build de e2e, `--workers=1`): hoje, leitura, telas-juntadas e instagram-painel, 178 testes, todos passam. `anuncios-painel.spec.ts` foi atualizado por troca de texto e não rodou aqui (máquina fraca, no máximo 4 specs). Também atualizei `resultados-painel.spec.ts` (texto "Ação da semana" e "Sem leitura:"), que não estava na lista do plano e também não rodou.
- Alturas do teste (e) da Hoje (perfil, janela, px, ações): viewer 375x812 = 800 px (3 ações); viewer 1440x900 = 720 px (3); admin 375x812 = 848 px (3); admin 1440x900 = 748 px (3). Limites 1218 px e 1350 px respeitados.
- Alturas das abas juntadas a 375x812 (limite 1218): Instagram Desempenho 1115, Destaques 1144, Posts 1207, Público 1118; Funil (do contato à venda) 1160; Jornada 1218 (exatamente no limite, sem folga); De onde vêm › Instagram 1211; Anúncios 1209. A 1440x900 (limite 1350): todas até 1312.
- Lista de ações dos mocks realistas (e2e (m)): formato, post-mais-salvo, anuncios-custo-conversa, a mesma de antes. A base de leitura-periodo sem "mediano" não mudou a lista da Hoje.
- Conferido: package.json e package-lock.json sem mudança; nenhum arquivo de sync, SQL, migration ou api/ tocado; nenhuma `useQuery(` nova em src/routes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Barras da leitura estouravam a régua de 1,5 tela a 375 px**
- **Found during:** extra 6 (rodando `telas-juntadas.spec.ts`, testes MEDV-04)
- **Issue:** depois do item 4, 4 abas passaram de 1218 px a 375x812 (Desempenho 1273, Destaques 1302, Jornada 1250, De onde vêm › Instagram 1249). Causas: `.nx-leitura li` (nexo-anuncios.css) dava faixa cinza e espaço às linhas das barras; o número técnico longo ("Reels: alcance típico 1.340, …") somado às barras ocupava 4 linhas; rótulos quebravam.
- **Fix:** linhas das barras sem a faixa cinza; com barras, o número com mais de 60 caracteres sai da linha (as barras mostram os valores; a conta inteira fica nos Detalhes); colunas por subgrid (rótulo, barra, valor alinhados, com fallback); barra do que faltou listrada no trecho preenchido.
- **Files modified:** src/components/nx/pagina.tsx, src/styles/nexo-cartoes.css, src/styles/nexo-pagina.css
- **Commit:** 5a595eb (commit à parte para não misturar com os itens; foi a única adição fora dos 7 itens e do molde)

**2. [Rule 1 - Bug] "Os anúncios está sem dado novo"**
- **Found during:** item 5 (ao reescrever `avisoDePoucasAcoes`)
- **Issue:** o plural "os anúncios" usava o verbo no singular.
- **Fix:** "estão" para anúncios; o teste de aviso foi atualizado.
- **Commit:** fde59fa

**3. [Rule 3 - Blocking] e2e que dependiam de texto trocado, fora da lista do plano**
- `resultados-painel.spec.ts` (rótulo "Ação da semana" e "Sem leitura: a tela ainda não tem a fonte ligada") e a espera de "Poucas ações nesta semana" em `hoje.spec.ts` foram atualizadas junto do item 5.

### Desvios de escopo do plano (por decisão de leitura do código)

- **Aba Público sem contagem.** O plano pedia contar "dias com dado" também em Público a partir de `diario.data`, mas `audiencia.tsx` é a leitura ao vivo da Meta (janela fixa de 30 dias) e não tem lista de dias em memória. Seguindo a regra do plano ("se não houver lista em memória, fica sem contagem e o motivo vai para o SUMMARY"), `contagem` continua `null` em Público, com o motivo escrito em comentário no registro. Funil e Jornada continuam `null` com o motivo da decisão aberta 1 (D-06) escrito ao lado de cada uma. O teste `telas-juntadas.spec.ts` ficou: Público sem contagem, Desempenho "—" antes de abrir e número depois.
- **Frase "formato" (caso duas frentes).** O título passa a "{Formato} alcança mais e é o mais salvo." e o "porque" é a frase da comparação com "; X% salvam." no fim.
- **"mediana" feminina.** Além de "mediano", troquei "espera mediana" por "espera típica" em leitura-periodo.ts (base e título da regra de espera), porque a mesma palavra de dentro do app continuaria à vista.
- **Efeito-post "parecida".** A frase antiga tinha 101 caracteres; foi encurtada para "Conversas parecidas nos dias com post e nos dias sem post do mesmo dia da semana." e ganhou barras como as outras.
- **Texto visível do chip de Quem resolve no e2e.** O plano dizia "innerText sem 'Quem resolve'", mas o texto `sr-only` entra no innerText; o teste confere o texto visível removendo o `sr-only` e confere o textContent com o rótulo.
- **Ledger de commits (#3968).** Gravar o arquivo-ledger em `.git/worktrees/.../` foi negado pela permissão do ambiente e não tentei contornar; `plan_head_before` vem do HEAD base conferido no início (a23bbae) e `commits: 9` foi medido com `git rev-list --count a23bbae..HEAD`.

## Known Stubs

Nenhum. As barras e a contagem vêm de dado que a tela já carrega; nada recebe vazio ou mock fixo.

Texto de "Sem leitura" que ficou fora do molde (não mexi): `src/components/comercial-diagnostico.tsx:169` (`texto: "Sem leitura"`); comentários em fatos-anuncios.ts, fatos-comercial.ts, fatos-hoje.ts e texto.ts ainda citam "Sem leitura".

## Threat Flags

Nenhuma superfície nova (sem endpoint, sem consulta, sem mudança de papel). Mitigações do plano mantidas: selo continua 1 por tela com o nome acessível (T-e8e-01); barra com nome próprio, nunca "% atingido", e o que faltou listrado (T-e8e-02); checagem de papel e `soEquipe` intocadas, e2e (n) passa (T-e8e-03); rótulo e valor de cada barra passam em `checarTextoDaHoje` e barra reprovada não é desenhada (T-e8e-04); ouvinte de scroll passivo e estado só muda com o índice (T-e8e-05); nenhum pacote novo (T-e8e-SC).

## Self-Check: PASSED

- Arquivos: SUMMARY e os 22 arquivos de código/docs listados existem no worktree.
- Commits f0eedac, fe77847, eb69562, 713ebdd, fde59fa, 5a595eb, 8535282, dbd3960, cc7a075 são ancestrais de HEAD.
