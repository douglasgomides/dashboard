---
phase: quick-261112-jmh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Tarefa 1 (Carteira), executor A, porta 5199
  - src/routes/_authenticated.admin.index.tsx
  - src/components/nx/admin-base.tsx
  - src/styles/nexo-admin.css
  - tests/e2e/admin-dados.ts
  - tests/e2e/carteira-sem-corte.spec.ts
  - tests/e2e/admin-painel.spec.ts
  - docs/redesenho/molde-da-pagina.md
  # Tarefa 2 (Instagram › Posts), executor B, porta 5198
  - src/lib/texto-que-cabe.ts
  - scripts/test-texto-que-cabe.ts
  - src/routes/_authenticated.$clientId.posts.tsx
  - src/routes/_authenticated.$clientId.top.tsx
  - src/components/nx/instagram.tsx
  - src/styles/nexo-instagram.css
  - src/styles/nexo-blocos.css
  - tests/e2e/posts-sem-corte.spec.ts
  - tests/e2e/instagram-painel.spec.ts
autonomous: true
requirements: [MEDV-04, MENU-07]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Na Carteira, em 1280x800 e 1440x900 (menu lateral aberto) e em 375x812, os botões Abrir resultados e Gerenciar de toda linha ficam inteiros dentro do cartão da lista; nada é cortado pela borda"
    - "Na Carteira, o @ do Instagram nunca quebra no meio da palavra: fica numa linha só, com reticências quando não cabe e o texto inteiro no title"
    - "Na Carteira, a coluna Saúde dos dados e alertas mostra no máximo 3 itens em linha (status com ícone e texto, Nota, e o chip 'N alertas' ou o chip do SAP), cada um numa linha só; com os alertas fechados, cada linha mede no máximo 120 px em 1280 e 1440"
    - "Na Carteira, o chip 'N alertas' abre pelo teclado e pelo toque a lista com todos os chips que antes ficavam empilhados (fontes ruins, erro de dado, acesso, SAP), com os mesmos links; o title lista todos ao passar o mouse"
    - "Em Instagram › Posts, a legenda do Top 5 tem no máximo 2 linhas com reticências e o texto inteiro no title; o chip de tema corta com reticências dentro do cartão, nunca pela borda"
    - "No Ranking de posts, miniatura, legenda de 2 linhas e a data numa linha só ('15/10') cabem; números à direita com tabular-nums; a tabela cabe em 1440 e, se não couber em 1280, rola dentro do cartão com sombra de rolagem visível; o botão Classificar nunca fica cortado; no celular cada post vira um cartão"
    - "No Explorador de posts, os números sobre a miniatura cabem (formato curto: '1,0 mi', '52,9 mil'), a data fica numa linha e o tema é um chip de uma linha com reticências"
    - "Os temas aparecem com acento ('Consultório e relação com paciente', 'Prompts e IA para conteúdo') em Posts e Destaques; o valor do filtro e os agrupamentos continuam com o texto do banco"
    - "Instagram › Posts continua na régua com Detalhes fechado: no máximo 1218 px em 375x812 e 1350 px em 1440x900 (tests/e2e/telas-juntadas.spec.ts passa)"
  artifacts:
    - path: tests/e2e/carteira-sem-corte.spec.ts
      provides: "Checagem de corte da Carteira em 375x812, 1280x800 e 1440x900 (texto cortado sem reticências, botão fora do contêiner, @ quebrado, altura da linha)"
    - path: tests/e2e/posts-sem-corte.spec.ts
      provides: "Checagem de corte de Top 5, Ranking e Explorador em 375x812, 1280x800 e 1440x900, com mock de legenda longa, tema sem acento e números grandes"
    - path: src/lib/texto-que-cabe.ts
      provides: "numeroCurto, numeroOuSemDado, dataDiaMes, ROTULO_DOS_TEMAS e temaParaExibir (regra pura, sem IA)"
    - path: scripts/test-texto-que-cabe.ts
      provides: "Teste tsx das funções de texto que cabe, inclusive os limites de 'mil' e 'mi' e a chave de cada tema do classificador"
    - path: src/styles/nexo-admin.css
      provides: "Linha da carteira por container query, chips de uma linha com reticências, nome e @ sem quebra no meio da palavra, ações que quebram de linha em vez de sair do cartão"
    - path: src/styles/nexo-instagram.css
      provides: "Trilhas de grade com minmax(0, 1fr) na vitrine e na galeria, chips com reticências, data em uma linha, números sobre a miniatura em até 2 linhas, cartões do ranking no celular"
    - path: src/styles/nexo-blocos.css
      provides: "Na origem de toda NxTabela: célula numérica sem quebra e sombra de rolagem lateral visível"
  key_links:
    - from: src/routes/_authenticated.admin.index.tsx
      to: src/components/qualidade-dados.tsx
      via: "useQualidadeDados(clientId) dentro do novo LinhaDaCarteira, com a mesma queryKey de hoje (nenhuma consulta nova) para contar o alerta de dado"
    - from: src/components/nx/admin-base.tsx
      to: src/styles/nexo-admin.css
      via: "AdmChip envolve o texto em span.adm-chip__texto, que só corta com reticências dentro de .adm-carteira .adm-linha"
    - from: src/routes/_authenticated.$clientId.posts.tsx
      to: src/lib/texto-que-cabe.ts
      via: "temaParaExibir, numeroCurto, numeroOuSemDado e dataDiaMes em todo lugar da tela que mostra tema, data ou número de post"
    - from: src/routes/_authenticated.$clientId.posts.tsx
      to: src/components/nx/instagram.tsx
      via: "IgVitrine recebe a prop opcional dica (title da legenda); o Destaques (top.tsx) continua compatível"
---

<objective>
Passada de leitura no Nexo: nada cortado, nada espremido. Pedido do João (12/11/2026, prints do Safari a 1440 px com o menu
lateral aberto): "alguns lugares estão ruins pra ler, estão cortando… tem que ficar mais fácil de ler".

Purpose: a equipe lê a Carteira linha por linha e o médico lê os posts; hoje o botão Gerenciar some na borda, o @ quebra no
meio, cada linha da Carteira tem uns 300 px de chips empilhados, a legenda do Top 5 é cortada no meio da palavra, a data do
ranking quebra uma palavra por linha e o tema aparece sem acento.

Output: duas tarefas independentes, cada uma com a sua lista de arquivos, para dois executores em paralelo:
- Tarefa 1 (executor A, porta 5199): Carteira (A) e a guarda de CSS da área admin.
- Tarefa 2 (executor B, porta 5198): Instagram › Posts (B), a guarda de CSS da área Instagram e da NxTabela, e o mapa de
  acentos dos temas.
A checagem automática de corte (C) fica em um spec novo por tarefa, para os dois não disputarem arquivo.

Por que não há tarefa traçadora: o orquestrador pediu 2 tarefas paralelas em arquivos diferentes. Cada tarefa começa pelo
spec de corte (vermelho) contra a tela real de ponta a ponta e só depois mexe no código, que é o papel do traçador aqui.
</objective>

<execution_context>
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/workflows/execute-plan.md
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/redesenho/molde-da-pagina.md
@.planning/quick/261112-glf-funil-desenhado-e-linha-de-30-dias-nos-c/261112-glf-SUMMARY.md

## Regras que valem para as duas tarefas

- Só regra e apresentação, sem IA. Nenhuma mudança de dado, sync, SQL, migration, `supabase/`, `api/` (leitura de
  `api/_lib/tema-classifier.ts` é permitida, edição não), pacote novo ou `useQuery(` nova.
- Tom nunca só pela cor: todo chip de estado tem ícone ou sinal e texto (molde §i, "Marca de tom com sinal").
- Só tokens de `src/styles/nexo-system.css` (`var(--line)`, `var(--muted-ink)`, `var(--text)`, `var(--white)`, `var(--b1)`,
  `var(--b6)`, `var(--field)` etc.); nenhum hex solto; animação só dentro de `@media (prefers-reduced-motion: no-preference)`.
  `scripts/test-nexo-system-css.ts` confere.
- Texto de 14 px ou mais onde a peça é nova; alvo de toque de 44 px no celular (até 820 px de largura); foco visível.
- Congelados (SAP): `src/components/nx/base.tsx` e a folha que ele importa, `src/components/nx/nx.css` (`.nx-tag` mora lá e o
  SAP usa); `src/components/nx/blocos.tsx` e `src/components/nx/pagina.tsx` também não mudam (molde, "Quem edita cada peça
  compartilhada"). Por isso a reticência do chip entra por um `span` interno de texto e por regras com escopo na folha da área,
  nunca em `nx.css`.
- Culpados já levantados no código (o executor confere e corrige os da sua área):
  - `src/styles/nexo-admin.css`: `.adm-carteira` usa `--adm-cols` com mínimos de 190 + 180 + 330 px mais a coluna das ações,
    e as quebras são por largura da janela (`@media (max-width: 1180px)`), não do cartão; com o menu lateral aberto a 1440 o
    cartão (`.adm-lista-card`, `overflow: hidden`) corta o Gerenciar. `.adm-quem__nome`, `.adm-quem__sub`, `.adm-num b` e
    `.adm-num--roi a` usam `overflow-wrap: anywhere`, que deixa o @ quebrar no meio. A regra `.adm-chips .nx-tag` perto do fim
    da folha põe `white-space: normal`, que quebra o texto do chip em 2 linhas.
  - `src/styles/nexo-instagram.css`: `.ig-vitrine__corpo` e `.ig-galeria__item` são grades sem `grid-template-columns`; a
    trilha implícita `auto` cresce até o chip mais largo (`.nx-tag` é `nowrap`), a legenda fica mais larga que o cartão e o
    `overflow: hidden` do cartão corta a legenda no meio da palavra, com a reticência fora da vista. `.ig-post-celula__texto`
    tem `min-width: 0` e `max-width: 340px` com a legenda em `nowrap`: na tabela automática a coluna encolhe até "A…" e o
    `small` da data quebra uma palavra por linha. `.ig-galeria__nums` é uma fileira só, sem quebra.
  - `src/styles/nexo-blocos.css`: `.nxb-tabela` rola na horizontal, mas sem nenhum sinal visível (no macOS a barra some), e a
    célula numérica pode quebrar.
  - `word-break: break-all` só aparece em `<code>` de URL e de mensagem de erro (`saude-shortio.tsx`, `sap-rastreamento.tsx`,
    `painel-saude-fontes.tsx`, `links.tsx`), onde é o certo; nenhuma tarefa mexe nisso.

## Como medir o corte (cada spec traz a sua cópia, para as tarefas não dividirem arquivo)

Função `cortesEm(page, seletorDaRaiz)` dentro de `page.evaluate`, que devolve a lista de problemas em texto legível (vazia =
passou). Percorre os elementos visíveis da raiz e:
1. Pula o que não se vê: sem `getClientRects()` (inclusive o que está dentro de `details` fechado), `clip-path` diferente de
   `none`, `clip` diferente de `auto`, largura ou altura de até 1 px (`.nxb-oculto`, `.sr-only`), `svg`, `img`, `picture` e o
   que está dentro deles.
2. Corte sem reticências: `scrollWidth > clientWidth + 1`, `overflow-x` em `hidden` ou `clip`, sem `text-overflow: ellipsis`
   e sem `-webkit-line-clamp` → "corte sem reticências: classe 'primeiros 40 caracteres'".
3. Corte sem o texto inteiro: elemento com reticência ou line-clamp que está de fato cortado (`scrollWidth > clientWidth + 1`
   ou `scrollHeight > clientHeight + 1`) sem `title` ou `aria-label` não vazio nele ou num ancestral até a raiz → "cortado
   sem o texto inteiro".
4. Controle fora do contêiner: para cada `a`, `button`, `summary`, `select` e `input` visível, todo ancestral até a raiz com
   `overflow-x` em `hidden` ou `clip` precisa conter o retângulo do controle (folga de 1 px). Ancestral com `auto` ou
   `scroll` só vale se for rolagem declarada: `.nxb-tabela`, `.nx-pagina .ig-vitrine` no celular ou `[data-rola]`.
5. Rolagem não declarada: elemento com `overflow-x` em `auto` ou `scroll` e `scrollWidth > clientWidth + 1` que não está na
   lista do item 4.
Mais `semRolagemLateral` (a página não rola na horizontal: `document.documentElement.scrollWidth <= innerWidth + 1`), igual à
de `tests/e2e/admin-painel.spec.ts`.

## E2E (cada executor na sua worktree)

Build uma vez por worktree depois do último commit de código:
`VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build`. Depois
`PLAYWRIGHT_PORT=<porta> PLAYWRIGHT_SKIP_BUILD=1 npx playwright test <specs> --workers=1`. Tarefa 1 usa a porta 5199 e
Tarefa 2 a 5198; no máximo 3 specs por tarefa. No fim, conferir que a porta ficou sem servidor.

## Testes que já falham (não são desta tarefa)

`npm test`: creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente e tela-honesta
(creative-database oscila). `npx tsc --noEmit` (com `npm run routes:generate` antes): só os 4 erros antigos
(scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Tarefa 1 (executor A): Carteira sem corte, linha compacta e alertas num chip só</name>
  <files>src/routes/_authenticated.admin.index.tsx, src/components/nx/admin-base.tsx, src/styles/nexo-admin.css, tests/e2e/admin-dados.ts, tests/e2e/carteira-sem-corte.spec.ts, tests/e2e/admin-painel.spec.ts, docs/redesenho/molde-da-pagina.md</files>
  <read_first>
    - src/routes/_authenticated.admin.index.tsx (linhas 133 a 205: LinhaSaude, CelulaNota, ChipQualidade, ChipQualidadeCurto; 474 a 580: a lista `.adm-linha`; 653 a 720: a tabela "Por clínica" dos Detalhes)
    - src/components/nx/admin-base.tsx (AdmChip, tomDaCor)
    - src/styles/nexo-admin.css (linhas 91 a 165 e a regra `.adm-chips .nx-tag` perto da linha 339)
    - src/components/qualidade-dados.tsx (useQualidadeDados e a queryKey)
    - tests/e2e/admin-painel.spec.ts e tests/e2e/admin-dados.ts (mockCarteira, CLINICAS)
    - tests/e2e/fixtures.ts (mockAccount, CID), só leitura
  </read_first>
  <behavior>
    - Em 375x812, 1280x800 e 1440x900, `cortesEm(page, 'section[aria-label="Clínicas da carteira"]')` devolve lista vazia e `semRolagemLateral` é verdadeiro.
    - Em toda linha, os links "Abrir resultados" e "Gerenciar" ficam visíveis e com o retângulo dentro da linha e do cartão da lista.
    - Em 1280 e 1440, com os alertas fechados, toda `.adm-linha` mede no máximo 120 px de altura; cada chip em linha da coluna de saúde mede no máximo 26 px (uma linha); a coluna tem no máximo 3 itens em linha.
    - O @ longo do mock (uma palavra só, 26 caracteres ou mais) fica numa linha (altura de uma linha), com `title` contendo o @ inteiro.
    - A linha com mais alertas mostra o chip "N alertas" (N de 2 ou mais); com foco e Enter ele abre e mostra o chip da fonte ruim e o do acesso, com os links de antes; aberto, `cortesEm` continua vazio.
    - O que `tests/e2e/admin-painel.spec.ts` já afirma continua valendo (status "Problema" como primeiro `.nx-tag` da primeira linha, "Não entra há 37 dias" no texto da linha, contagens dos filtros).
  </behavior>
  <action>
    Arquivos que esta tarefa pode tocar (e só estes): src/routes/_authenticated.admin.index.tsx, src/components/nx/admin-base.tsx, src/styles/nexo-admin.css, tests/e2e/admin-dados.ts, tests/e2e/carteira-sem-corte.spec.ts (novo), tests/e2e/admin-painel.spec.ts (só se uma afirmação antiga precisar acompanhar a linha nova, sem afrouxar o que ela confere) e docs/redesenho/molde-da-pagina.md. Nada da Tarefa 2.

    1. Vermelho primeiro. Em tests/e2e/admin-dados.ts troque só o `instagram_handle` da "Dra. Carla Mendes" por um @ de uma palavra longa, por exemplo "dracarlamendesdermatologia" (o `ig_username` do mock já sai do `instagram_handle`; nenhuma contagem muda). Crie tests/e2e/carteira-sem-corte.spec.ts com `cortesEm` e `semRolagemLateral` (ver "Como medir o corte" no contexto), `mockAccount(context, "admin")`, `mockCarteira`, `mockConferencia` e `mockIntegracoes`, nas janelas 375x812, 1280x800 e 1440x900, abrindo `/admin`, esperando as 6 linhas e o fim do "Lendo as fontes…", e afirmando o que está em `<behavior>`. Rode com a porta 5199 e registre no SUMMARY o que falhou antes da correção.

    2. AdmChip (admin-base.tsx): envolva `children` num `span` com a classe `adm-chip__texto` e, quando `titulo` não vier, use como `title` o texto achatado dos filhos (strings e números de `children`, inclusive em array). O ícone continua antes do texto (tom nunca só pela cor). As outras telas da equipe que usam AdmChip não mudam de cara: a reticência só vale dentro de `.adm-carteira .adm-linha` (passo 5).

    3. Linha da carteira (admin.index.tsx): tire o corpo do `.map` de `linhasTabela` para um componente `LinhaDaCarteira` no mesmo arquivo, que recebe o que a linha já usa (cliente, handle, números, cor, saúde, nota, SAP, ROI, fato de acesso, último acesso, `idx`) e chama `useQualidadeDados(c.id)` com a mesma queryKey de hoje (o react-query reaproveita o cache; nenhuma consulta nova). A coluna "Saúde dos dados e alertas" passa a ter no máximo 3 itens em linha:
       a) o chip de status de hoje (AdmChip com ícone e texto: "Problema", "Em dia", "Lendo as fontes…" etc.), sempre o primeiro `.nx-tag` da linha;
       b) o chip da nota, "Nota {n} · {faixa}", com o `title` dos motivos de hoje;
       c) quando houver pelo menos 1 alerta, um `details` com a classe `adm-alertas` cujo `summary` tem a aparência de chip, ícone do pior tom (AlertTriangle para crítico, Clock para atenção) e o texto "1 alerta" ou "N alertas", com `title` listando todos os alertas, um por linha. Alerta = cada fonte vermelha ou amarela (o chip "{fonte}: {status}" de hoje, com o mesmo title), o erro de dado (o texto de ChipQualidadeCurto: "N dados com erro · M afeta(m) a leitura", tom crítico quando há severidade alta) e o fato de acesso ("Sem acesso criado · dar acesso" ou "Não entra há N dias", com os mesmos links para `/admin/$clientId#acesso` e os mesmos title). O painel aberto é uma lista `ul.adm-alertas__lista` no fluxo da linha (nada de posição absoluta, para o `overflow` do cartão não cortar), um item por linha, chips com quebra normal de texto lá dentro, e o chip do SAP como último item quando existir. Sem alerta nenhum, o chip do SAP (com o link de hoje) entra como terceiro item em linha.
       O ChipQualidadeCurto vira função pura do dado (ou sai) e o ChipQualidade antigo continua onde é usado.
    4. Coluna da clínica: o nome fica em até 2 linhas com reticências e `title` com o nome inteiro; a linha de baixo (especialidade · @) fica numa linha só com reticências e `title` com o texto inteiro, para o @ nunca quebrar no meio. Faça o mesmo na linha de baixo da tabela "Por clínica" dos Detalhes (a classe `truncate` mais `title`).
    5. nexo-admin.css, na origem da linha:
       - `.adm-lista-card` vira contêiner (`container-type: inline-size` e `container-name: carteira`); as quebras da lista da carteira que hoje são `@media (max-width: 1180px)` e `@media (max-width: 680px)` passam a `@container carteira`, com limites pela largura do cartão (o executor mede: as ações descem para uma faixa própria, alinhada à direita, antes de qualquer coisa encostar na borda; abaixo de uns 640 px do cartão, uma coluna só, como hoje no celular). O cabeçalho `.adm-lista-head` segue as mesmas colunas e some quando a linha empilha.
       - `--adm-cols` com mínimos que somem menos que o cartão a 1280 com o menu aberto (trilhas `minmax(0, …fr)`; quem precisa de mínimo é o conteúdo, não a trilha).
       - `.adm-acoes` com `flex-wrap: wrap` e os botões com `flex: none` (no celular continuam esticados, como hoje).
       - `.adm-quem__sub` com `white-space: nowrap`, `overflow: hidden` e `text-overflow: ellipsis`; `.adm-quem__nome` com line-clamp de 2 linhas e quebra só entre palavras (`overflow-wrap: break-word`); `.adm-num b` com `white-space: nowrap`; `.adm-num--roi a` com `overflow-wrap: break-word`.
       - Dentro de `.adm-carteira .adm-linha .adm-chips`: `.nx-tag` com `white-space: nowrap`, `max-width: 100%` e `min-width: 0`, e `.adm-chip__texto` com `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis` e `white-space: nowrap`. Esta regra precisa vencer a regra `.adm-chips .nx-tag` com `white-space: normal` do fim da folha (seletor mais específico); fora da carteira a regra antiga continua.
       - `.adm-alertas > summary`: sem o marcador nativo, aparência de chip com tom, altura mínima de 32 px no desktop e 44 px até 820 px, `cursor: pointer`, foco visível com `outline: 2px solid var(--b1)`; `.adm-alertas__lista` em grade com gap de 8 px.
       Só tokens; nenhuma animação nova (a entrada `nx-subir` da linha continua dentro do bloco de movimento reduzido).
    6. Rode o spec novo e o tests/e2e/admin-painel.spec.ts (porta 5199) até passarem. Se uma afirmação antiga quebrar só porque o chip mudou de lugar, ajuste-a para conferir a mesma coisa no lugar novo e registre no SUMMARY.
    7. Em docs/redesenho/molde-da-pagina.md, acrescente ao fim (sem apagar nada) a seção "### k) Nada cortado (12/11/2026)" com as regras desta passada para os planos da 03.1 herdarem: texto cortado sempre com reticências e o texto inteiro no `title`; @, data e número nunca quebram no meio; chip de uma linha com reticências dentro do cartão; trilha de grade e filho de flex com `minmax(0, 1fr)` ou `min-width: 0`; botão sempre inteiro (quebra de linha antes de sair do cartão); tabela larga rola dentro do bloco com sombra de rolagem visível e vira cartão no celular; muitos avisos viram um chip "N alertas" que abre a lista; tema com acento pela lista de exibição (`temaParaExibir`, de `src/lib/texto-que-cabe.ts`); a checagem automática fica em `tests/e2e/carteira-sem-corte.spec.ts` e `tests/e2e/posts-sem-corte.spec.ts`.
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-nexo-system-css.ts && test "$(grep -n '\.adm-quem__sub' src/styles/nexo-admin.css | grep -c 'text-overflow: ellipsis')" -ge 1 && test "$(grep -c 'container-type: inline-size' src/styles/nexo-admin.css)" -ge 1 && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/carteira-sem-corte.spec.ts tests/e2e/admin-painel.spec.ts --workers=1</automated>
  </verify>
  <done>
    O spec novo falhou antes da correção (registrado no SUMMARY) e passa depois em 375x812, 1280x800 e 1440x900; tests/e2e/admin-painel.spec.ts passa; Gerenciar e Abrir resultados ficam inteiros em toda linha; o @ longo fica numa linha com reticências e title; cada linha mede no máximo 120 px em 1280 e 1440 com os alertas fechados; o chip "N alertas" abre pelo teclado com os mesmos links de antes; `npm run routes:generate` e `npx tsc --noEmit` só com os 4 erros antigos; `npm test` só com as falhas conhecidas; a seção "k) Nada cortado" está no molde; nenhum arquivo da Tarefa 2 foi tocado; a porta 5199 ficou sem servidor.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Tarefa 2 (executor B): Instagram › Posts sem corte, datas numa linha, números curtos e temas com acento</name>
  <files>src/lib/texto-que-cabe.ts, scripts/test-texto-que-cabe.ts, src/routes/_authenticated.$clientId.posts.tsx, src/routes/_authenticated.$clientId.top.tsx, src/components/nx/instagram.tsx, src/styles/nexo-instagram.css, src/styles/nexo-blocos.css, tests/e2e/posts-sem-corte.spec.ts, tests/e2e/instagram-painel.spec.ts</files>
  <read_first>
    - src/routes/_authenticated.$clientId.posts.tsx (inteiro: TopDoMes, CELULA_POST, RankingDePosts, Classificador, ExploradorDePosts e todo lugar que mostra `tema`)
    - src/components/nx/instagram.tsx (IgVitrine, linhas 506 a 546)
    - src/styles/nexo-instagram.css (linhas 223 a 270 e 470 a 493)
    - src/styles/nexo-blocos.css (linhas 95 a 127, a NxTabela) e src/components/nx/blocos.tsx (NxTabela, só leitura)
    - src/lib/classificacao-post.ts (normalizarTema, chaveTema), src/lib/format.ts (fmtNum), src/hooks/use-is-mobile.ts (useMediaQuery), só leitura
    - api/_lib/tema-classifier.ts (a lista fixa de temas do classificador), só leitura
    - tests/e2e/instagram-dados.ts (postsFicticios, mockInstagram, rota `**/rest/v1/instagram_posts**`) e tests/e2e/telas-juntadas.spec.ts (régua de altura), só leitura
  </read_first>
  <behavior>
    - numeroCurto: null ou undefined → "—"; 0 → "0"; 999 → "999"; 1000 → "1,0 mil"; 3214 → "3,2 mil"; 52913 → "52,9 mil"; 99960 → "100 mil"; 529400 → "529 mil"; 999600 → "1,0 mi"; 1034000 → "1,0 mi"; 12500000 → "12,5 mi".
    - numeroOuSemDado: null → "Sem dado" (nunca 0); 52913 → "52.913".
    - dataDiaMes: "2026-10-15T13:00:00Z" → "15/10"; perto da meia-noite UTC usa o dia de America/Sao_Paulo ("2026-10-16T01:30:00Z" → "15/10"); null ou data inválida → "Sem data".
    - temaParaExibir: "Consultorio e relacao com paciente" → "Consultório e relação com paciente"; "Prompts e IA para conteudo" → "Prompts e IA para conteúdo"; " consultorio  e relacao com paciente " → "Consultório e relação com paciente"; tema que já tem acento ou que não está na lista volta como veio (limpo por normalizarTema); null, "" e "null" → null.
    - Para todo tema de api/_lib/tema-classifier.ts, `chaveTema(temaParaExibir(t)) === chaveTema(t)` (a lista só põe acento, nunca troca o assunto).
    - No spec e2e, em 375x812, 1280x800 e 1440x900: `cortesEm` vazio no Top 5, no Ranking aberto e no Explorador aberto; legendas com no máximo 2 linhas e `title` com a primeira linha inteira; datas numa linha no formato dd/mm; tema com acento e `title`; números do ranking alinhados à direita com `tabular-nums`; em 1440 a tabela do ranking cabe sem rolar; em 1280 ela cabe ou rola com sombra de rolagem (`background-attachment` com `local`); no celular o ranking é uma lista de cartões, sem tabela; `semRolagemLateral` verdadeiro.
  </behavior>
  <action>
    Arquivos que esta tarefa pode tocar (e só estes): src/lib/texto-que-cabe.ts (novo), scripts/test-texto-que-cabe.ts (novo), src/routes/_authenticated.$clientId.posts.tsx, src/routes/_authenticated.$clientId.top.tsx (só os 2 lugares que mostram `p.tema`), src/components/nx/instagram.tsx (só IgVitrine), src/styles/nexo-instagram.css, src/styles/nexo-blocos.css, tests/e2e/posts-sem-corte.spec.ts (novo) e tests/e2e/instagram-painel.spec.ts (só se uma afirmação antiga precisar acompanhar a mudança, sem afrouxar). Nada da Tarefa 1; blocos.tsx, pagina.tsx, base.tsx e nx.css não mudam.

    1. Vermelho primeiro, em duas frentes:
       a) scripts/test-texto-que-cabe.ts com os casos de `<behavior>` (importando de ../src/lib/texto-que-cabe e ../src/lib/classificacao-post) e a lista de temas copiada de api/_lib/tema-classifier.ts para conferir a chave de cada um. Rode e veja falhar.
       b) tests/e2e/posts-sem-corte.spec.ts com `cortesEm` e `semRolagemLateral` (ver "Como medir o corte"), `mockAccount(context, "admin")` e `mockInstagram(context)`, e depois uma rota própria `**/rest/v1/instagram_posts**` registrada depois do mockInstagram (no Playwright a última rota registrada responde primeiro) com `postsFicticios()` alterados: primeira linha da legenda longa (90 caracteres ou mais, por exemplo "A técnica é essencial. Mas o que muda o resultado é a conversa antes do procedimento, com calma e sem pressa"), temas sem acento do classificador ("Consultorio e relacao com paciente", "Prompts e IA para conteudo", "Metabolismo e composicao corporal") e números grandes num post (alcance 1034000, engajamento 52913, salvamentos 3214), em ordem de salvamentos e com a paginação por `offset` e `limit` da URL feita no próprio spec. Abre `/${CID}/posts?preset=30d` nas 3 janelas, confere o Top 5, abre os Detalhes (`.nx-pagina__detalhe > details > summary`), abre "Ranking de posts" e "Explorador de posts" pelo `summary` e afirma o que está em `<behavior>`. Rode com a porta 5198 e registre no SUMMARY o que falhou antes da correção.

    2. src/lib/texto-que-cabe.ts (regra pura, imports relativos como as outras libs: ./classificacao-post e ./format):
       - `numeroCurto(n)`: abaixo de 1000, o número inteiro em pt-BR; de 1000 até antes de 100 mil, uma casa decimal fixa e " mil"; de 100 mil até antes de 1 milhão, inteiro e " mil"; de 1 milhão em diante, uma casa decimal fixa e " mi"; o arredondamento que chega na faixa de cima sobe de faixa (99960 → "100 mil", 999600 → "1,0 mi"); sem dado → "—".
       - `numeroOuSemDado(n)`: "Sem dado" sem valor, senão fmtNum (molde: número sem dado é "Sem dado", nunca 0).
       - `dataDiaMes(iso)`: "dd/mm" com `timeZone: "America/Sao_Paulo"`; "Sem data" sem valor ou com data inválida.
       - `ROTULO_DOS_TEMAS`: mapa da chave do tema (`chaveTema`) para o nome com acento, para os temas do classificador que perderam acento: Atendimento e vendas na clínica; Autoridade e marca médica; Carreira médica e reflexão; Club e ecossistema de marketing médico; Consultório e relação com paciente; Desinformação e postura profissional; Exames e investigação hormonal; Hormônios e testosterona; IA na prática médica; Metabolismo e composição corporal; Prompts e IA para conteúdo; Quando a paciente não é ouvida; Reflexões e motivacional; Regulação CFM; Reposição hormonal; Saúde íntima e relacionamento; Suplementação. Os outros temas da lista já se escrevem sem acento e passam como vieram.
       - `temaParaExibir(tema)`: `normalizarTema`; vazio → null; senão o rótulo do mapa pela chave, ou o próprio tema limpo.
       O tema só muda na exibição: o valor do `select` do filtro, as chaves de lista e os agrupamentos continuam com o texto do banco.
    3. IgVitrine (instagram.tsx): prop opcional `dica?: string` por item, posta como `title` no `.ig-vitrine__titulo`. O Destaques (top.tsx) continua compatível sem passar nada.
    4. posts.tsx:
       - Top 5: `dica` com a primeira linha inteira; chips do formato e do tema com o texto num `span` de classe `ig-chip__texto` e `title` com o texto inteiro; tema por `temaParaExibir`.
       - Ranking (desktop): colunas "#", "Post", "Tema e funil", "Salvos", "Engajamento", "Alcance" e, para quem edita, "Classificar". A célula do post traz a miniatura, a legenda em até 2 linhas (com `title`) e embaixo, numa linha só, a data por `dataDiaMes` mais o chip do formato com ícone (o formato sai da coluna própria e vai para essa linha; nenhuma informação sai da tabela). "Tema e funil" empilha o chip do tema (com acento, reticências e title) e o chip do funil e estágio de hoje (com o title de hoje). Números por `numeroOuSemDado`, à direita (a NxTabela já põe `nxb-num` nas colunas `numerica`). O botão Classificar continua com o `aria-label` e o `aria-expanded` de hoje. Envolva a NxTabela num `div` de classe `ig-ranking-tabela` para as regras de largura do passo 5.
       - Ranking (celular): com `useMediaQuery("(max-width: 560px)")`, a mesma lista visível (`visiveis`) vira `ol.ig-ranking-cartoes`, um cartão por post: posição, miniatura, legenda de 2 linhas, data e formato numa linha, chips do tema e do funil, os 3 números com o rótulo embaixo (Salvos, Engajamento, Alcance) e o botão Classificar de 44 px para quem edita. O filtro por formato, o "Ver todos" e o Classificador continuam iguais.
       - Explorador, galeria: números sobre a miniatura por `numeroCurto`, cada um com `aria-label` e `title` com o número inteiro e o nome ("Alcance: 1.034.000"; sem dado, "Alcance: sem dado"); data por `dataDiaMes`; tema como chip de uma linha com reticências e `title`; opções do filtro de tema com o rótulo de `temaParaExibir` e o valor de antes.
       - Explorador, tabela: data em uma linha (`white-space: nowrap`), tema por `temaParaExibir` com reticências e title, legenda em até 2 linhas com title, números por `numeroOuSemDado`.
       - Resto da tela (Repetir ou revisar, Conceitos vencedores, Salvamentos por tema e formato, Alcance por tema, Formato por tema, Próximos ângulos, Poucos dados): todo tema mostrado passa por `temaParaExibir`; as chaves (`key`) continuam com o tema do banco.
       - A função `dataCurta` antiga sai (ou passa a chamar `dataDiaMes`); nenhuma data da tela fica no formato "15 de out".
    5. nexo-instagram.css, na origem:
       - `.ig-vitrine__corpo` e `.ig-galeria__item` com `grid-template-columns: minmax(0, 1fr)`; `.ig-vitrine__titulo` com `overflow-wrap: break-word`, mantendo o line-clamp de 2 linhas.
       - `.ig-vitrine__extra` numa linha só (`flex-wrap: nowrap`, `min-width: 0`): o chip do formato fica inteiro (`flex: none`) e o do tema encolhe com reticências; regra de chip que cabe com escopo `.nexo-ig .nx-tag:has(> .ig-chip__texto)` (ou `.nexo-ig .ig-chip`, se preferir pôr uma classe no wrapper) com `max-width: 100%` e `min-width: 0`, e `.ig-chip__texto` com `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis` e `white-space: nowrap`. A altura da vitrine no celular não pode crescer (régua de 1,5 tela: Posts está com 1207 px de 1218 a 375x812).
       - `.ig-post-celula__texto` com `min-width: 200px` e `max-width: 360px`; a legenda com line-clamp de 2 linhas e `white-space: normal`; a linha da data e do formato com `white-space: nowrap`.
       - `.ig-ranking-tabela`: larguras para a tabela caber em 1440 com o menu aberto (padding de célula mais justo, coluna "Tema e funil" com `max-width` e chips com reticências); se não couber em 1280, a rolagem é a da própria `.nxb-tabela`, dentro do cartão.
       - `.ig-ranking-cartoes` (lista de cartões do celular), só com tokens e espaços de 8, 12 e 16 px.
       - `.ig-galeria__nums` com `flex-wrap: wrap` (até 2 linhas) e cada número com `white-space: nowrap`; `.ig-galeria__rodape` com `min-width: 0` nos filhos, data com `white-space: nowrap` e `flex: none`, tema com reticências.
    6. nexo-blocos.css, na origem de toda NxTabela (blocos.tsx não muda): `.nxb-tabela .nxb-num` com `white-space: nowrap`; sombra de rolagem lateral em `.nxb-tabela`, o truque de fundo em camadas (2 cobertas de `var(--white)` com `background-attachment: local` nas bordas, mais 2 sombras com `color-mix` de `var(--text)` presas na borda, com `scroll`), que só aparece quando há conteúdo escondido daquele lado. Sem hex; confira com scripts/test-nexo-system-css.ts.
    7. top.tsx: os 2 lugares que mostram `p.tema` passam por `temaParaExibir` (sem outra mudança).
    8. Rode o teste tsx, o spec novo, tests/e2e/instagram-painel.spec.ts e tests/e2e/telas-juntadas.spec.ts (porta 5198). Registre no SUMMARY as alturas de Posts e de Destaques a 375x812 e 1440x900 com os Detalhes fechados (limites 1218 e 1350). Se Posts passar do limite, encurte sem apagar nada (o que não é trabalho da tela vai para os Detalhes, molde §b).
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-texto-que-cabe.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-nexo-system-css.ts && test "$(grep -n '\.ig-vitrine__corpo' src/styles/nexo-instagram.css | grep -c 'minmax(0, 1fr)')" -ge 1 && test "$(grep -c 'local' src/styles/nexo-blocos.css)" -ge 1 && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build && PLAYWRIGHT_PORT=5198 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/posts-sem-corte.spec.ts tests/e2e/instagram-painel.spec.ts tests/e2e/telas-juntadas.spec.ts --workers=1</automated>
  </verify>
  <done>
    O teste tsx e o spec novo falharam antes (registrado no SUMMARY) e passam depois; tests/e2e/instagram-painel.spec.ts e tests/e2e/telas-juntadas.spec.ts passam, com Posts no máximo em 1218 px (375x812) e 1350 px (1440x900) com os Detalhes fechados; legenda do Top 5 com 2 linhas, reticências e title; chips com reticências dentro do cartão; ranking com data "dd/mm" numa linha, números à direita, cabendo em 1440 e com sombra de rolagem quando rola; ranking em cartões no celular; galeria com números curtos que cabem; temas com acento em Posts e Destaques e filtro com o valor do banco; `npm run routes:generate` e `npx tsc --noEmit` só com os 4 erros antigos; `npm test` só com as falhas conhecidas (o test-texto-que-cabe novo passa); nenhum arquivo da Tarefa 1 foi tocado; a porta 5198 ficou sem servidor.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| banco → navegador | legenda, tema e @ vêm do banco e da Meta e são mostrados como texto e em `title` |
| tela da equipe → tela do médico | a Carteira é só de admin; Posts é da clínica |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-jmh-01 | Tampering | `title`, `aria-label` e chips com legenda, tema e @ (posts.tsx, admin.index.tsx) | low | mitigate | Só texto pelo React (escapado); nenhum `dangerouslySetInnerHTML` novo; o mapa de temas é constante no código |
| T-jmh-02 | Information disclosure | lista "N alertas" da Carteira | low | accept | Mostra só o que a linha já mostrava hoje (status de fonte, contagem de erro de dado, acesso), na tela que já é só de admin; nenhum dado de paciente |
| T-jmh-03 | Information disclosure | cartões do ranking no celular e galeria | low | accept | Mesmos campos da tabela de hoje (legenda, números, tema, funil); nenhum nome, telefone ou e-mail de paciente |
| T-jmh-04 | Denial of service | `useQualidadeDados` no LinhaDaCarteira | low | mitigate | Mesma queryKey de hoje (cache compartilhado e `staleTime` de 10 min), sem consulta nova nem pedido a mais por linha |
| T-jmh-SC | Tampering | npm/pip/cargo installs | high | mitigate | Nenhum pacote novo nesta tarefa; package.json e package-lock.json não mudam |
</threat_model>

<verification>
- Cada executor roda o `<verify>` da sua tarefa na sua worktree, com a sua porta (5199 e 5198), e no máximo 3 specs.
- `npm run routes:generate` e `npx tsc --noEmit`: só os 4 erros antigos.
- `npm test`: só as falhas conhecidas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta; creative-database oscila).
- Diferença contra o HEAD base: package.json, package-lock.json, `supabase/`, `api/`, base.tsx, nx.css, blocos.tsx e pagina.tsx sem mudança; nenhuma `useQuery(` nova em src/routes.
- As duas listas de arquivos não se cruzam: a Tarefa 1 não toca arquivo da Tarefa 2 e vice-versa (o merge das worktrees não tem conflito).
</verification>

<success_criteria>
- Carteira: nenhum corte em 375, 1280 e 1440; Gerenciar sempre inteiro; @ numa linha com reticências; linha de no máximo 120 px no desktop com os alertas fechados; os alertas num chip "N alertas" que abre a lista.
- Posts: Top 5, Ranking e Explorador sem corte nas 3 janelas; datas "dd/mm" numa linha; números curtos na galeria; ranking em cartões no celular; temas com acento; Posts dentro da régua (1218 e 1350).
- A checagem automática de corte fica nos specs novos, para o defeito não voltar.
</success_criteria>

<output>
Criar `.planning/quick/261112-jmh-nada-cortado-leitura-f-cil-na-carteira-e/261112-jmh-SUMMARY.md` no fim, com: o que cada spec pegou antes da correção, as alturas de Posts e de Destaques (375x812 e 1440x900), a largura do cartão da Carteira em que as ações descem de linha, os desvios e as perguntas para o João.
</output>
