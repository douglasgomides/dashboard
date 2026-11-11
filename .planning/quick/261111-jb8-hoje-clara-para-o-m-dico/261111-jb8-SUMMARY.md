---
phase: quick-261111-jb8
plan: 01
subsystem: tela Hoje (O que fazer hoje)
tags: [hoje, leitura, manchete, soEquipe, saudacao, nx]
requires: [03.1.1-05]
provides:
  - "acoesDaHoje com destaque, contexto, numerosTecnicos, areaHoje, familia, soEquipe e paraEquipe"
  - "JARGAO_DA_HOJE, MAX_CARACTERES_DA_MANCHETE, MAXIMO_POR_AREA, FAMILIA_DO_FATO, checarTextoDaHoje"
  - "nomeDaSaudacao so com titulo de medico; VERSAO_REGRAS_HOJE = 2"
affects: [src/lib/leitura/fatos-hoje.ts, src/components/nx/hoje.tsx, src/routes/_authenticated.$clientId.hoje.tsx]
key-files:
  modified:
    - src/lib/leitura/tipos.ts
    - src/lib/leitura/fatos-hoje.ts
    - src/lib/leitura/fatos-instagram.ts
    - src/lib/leitura/adaptadores.ts
    - src/lib/leitura-periodo.ts
    - src/lib/insight.ts
    - src/lib/resultado.ts
    - src/routes/_authenticated.$clientId.hoje.tsx
    - src/components/nx/hoje.tsx
    - src/styles/nexo-hoje.css
    - docs/redesenho/inventario/hoje.md
    - scripts/test-leitura-hoje.ts
    - scripts/test-leitura-periodo.ts
    - tests/e2e/hoje.spec.ts
decisions:
  - "Saudacao so mostra o nome quando clients.name comeca por titulo de medico (Dr, Dr., Dra, Dra., Doutor, Doutora); clients.name e o nome da clinica"
  - "conectar-fontes continua visivel para o medico: conectar CRM ou WhatsApp depende da clinica"
  - "Familia formato = formato + formato-melhor-taxa + formato-sem-comparacao; nao foi preciso acrescentar outros ids"
  - "Trecho inteiro do numero (a2) como ultimo recurso da manchete, para a Acao da semana de Resultados nao ficar fora da Hoje"
metrics:
  tasks: 3
  completed: 2026-11-11
actuals:
  tasks: 3
  commits: 3
plan_head_before: 9067f802a05d05095b3d793731b66153eb90ed04
plan_head_after: 681276f528f00773e6828c2b829a8d247a6f32f0
status: complete
---

# Quick 261111-jb8: Hoje clara para o medico

Os 4 defeitos do print a 1440 px foram corrigidos: a saudacao nao usa nem corta o nome da clinica, a manchete do Proximo e dos cartoes e curta e leiga (numero tecnico num "Ver numeros" fechado), cada area tem no maximo 2 acoes sem achado repetido, e a arrumacao interna da equipe so aparece para admin e estrategista na linha "Para a equipe".

## Commits

| Task | Commit | O que |
|---|---|---|
| 1 (tracer) | cc4132f | soEquipe na regra, paraEquipe, checagem de papel na rota, NxParaEquipe, saudacao so com titulo de medico |
| 2 | 924f72e | manchete, JARGAO_DA_HOJE, checarTextoDaHoje, areaHoje, FAMILIA_DO_FATO, maximo 2 por area, manchete da regra de formatos |
| 3 | 681276f | desenho do D-07 (manchete, Ver numeros, contexto, Quem resolve junto da pilula), inventario, e2e (l), (l2), (m) |

## Medidas com os mocks realistas

Alturas do teste (e), limite 1218 px a 375x812 e 1350 px a 1440x900:

| Perfil | Janela | Altura | Acoes |
|---|---|---|---|
| viewer | 375x812 | 784 px (0,97x) | 3 |
| viewer | 1440x900 | 644 px (0,72x) | 3 |
| admin | 375x812 | 832 px (1,02x) | 3 |
| admin | 1440x900 | 672 px (0,75x) | 3 |

Contagem de acoes com os mocks realistas: 3 (nao foi preciso relaxar o (a) nem mexer nos mocks). Lista final a 1440 px (id, area, familia, manchete):

1. formato, instagram, formato, "Post de foto alcancou e foi mais salvo" (Proximo, com Ver numeros fechado)
2. post-mais-salvo, instagram, post-mais-salvo, "10 salvamentos"
3. anuncios-custo-conversa, anuncios, anuncios-custo-conversa, "R$ 1.740,00 ÷ 87 conversas."

posts-sem-tema ficou so em "Para a equipe" (admin e estrategista); o viewer nao tem a linha nem o texto "sem classificacao" no DOM.

## Verificacao

- Build e playwright: hoje.spec (29 testes), resultados-painel.spec e leitura.spec (10 testes) passam com `--workers=1`.
- Os 7 scripts de leitura (hoje, periodo, instagram, resultados, base, resultado, resumo-relatorio) passam. test-nexo-system-css e test-telas-inventario passam. ESLint sai 0 nos arquivos do plano.
- `npm run typecheck`: so os 2 arquivos que ja falhavam (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts).
- `npm test`: so as 6 falhas antigas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta).
- package.json e package-lock.json sem mudanca; nenhum arquivo do SAP tocado; a rota da Hoje continua com 3 `useQuery(`.
- Capturas: `/private/tmp/claude-501/-Users-joao-dev-dashboard-gsd/6a1a2e6f-b21e-4a15-9785-d9993d677b10/scratchpad/redesenho/hoje-v2-1440.png` e `hoje-v2-375.png` (admin, mocks realistas, pagina inteira). Conferidas no olho: nenhum achado repetido.

## Deviations from Plan

**1. [Rule 1 - Bug] Ultimo recurso (a2) para a manchete: trecho inteiro do numero**
- **Found during:** Task 2
- **Issue:** com as opcoes (a) a (d) ao pe da letra, a fixture da Lana ficou com 1 acao e a Acao da semana de Resultados (atendimento: "Quem chama no WhatsApp espera 47 min pela primeira resposta.", 59 caracteres, numero longo com "mediana") deixou de entrar. Isso quebraria o (f) (o Proximo e a Acao da semana) e a regra de 3 a 5 acoes do plano 05.
- **Fix:** depois de (a), (b) e (c), um trecho inteiro do numero (partido em "; ", " · " ou ", ") que comeca por algarismo ou R$, curto e leigo vira o destaque ("640 atendimentos"). O numero tecnico inteiro continua em numerosTecnicos e nunca corta no meio de uma palavra. Todos os comportamentos descritos no plano continuam valendo. Com isso a Lana tem 3 acoes.
- **Files modified:** src/lib/leitura/fatos-hoje.ts, scripts/test-leitura-hoje.ts
- **Commit:** 924f72e

**2. [Rule 1 - Bug] A frase da acao nao passa pela guarda de numero da Phase 9**
- **Found during:** Task 2
- **Issue:** o plano diz que a frase da acao passa em checarTextoDaHoje sem max, e essa funcao inclui a GUARDA_DE_NUMERO_DA_HOJE. Isso derrubaria frases de acao legitimas que falam de consulta ("Conferir ... quantas conversas viraram consulta"), o que o e2e (b) do plano 05 diz expressamente poder acontecer.
- **Fix:** a frase da acao e a frase do fato continuam checadas como no plano 05 (guarda de texto, mais JARGAO_DA_HOJE e o filtro de linguagem do montarTexto); a guarda de numero vale para destaque, legenda e numeros, como antes. checarTextoDaHoje (as 3 checagens juntas) vale para manchete e numeros.
- **Files modified:** src/lib/leitura/fatos-hoje.ts
- **Commit:** 924f72e

**3. [Ajuste menor]** `.nx-hoje__numeros summary` tem altura minima de 28 px e 44 px em tela de toque (`pointer: coarse`), para nao estourar a regua de 1,5 tela.

Fora isso: plano executado como escrito. Titulo, porque, acao e base do achado `formato` nao mudaram (as outras telas seguem iguais), por isso a legenda do Proximo ainda diz "Estatico ganha nas duas frentes" enquanto a manchete diz "Post de foto".

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. A linha "Para a equipe" e filtro de apresentacao (T-jb8-01/02): papel carregando ou sem papel conta como medico, o componente nao e montado para o medico, e nenhuma consulta nova foi criada.

## Self-Check: PASSED

- Arquivos do plano existem e estao nos commits cc4132f, 924f72e e 681276f (todos ancestrais de HEAD).
- `git rev-list --count 9067f80..HEAD` = 3.
