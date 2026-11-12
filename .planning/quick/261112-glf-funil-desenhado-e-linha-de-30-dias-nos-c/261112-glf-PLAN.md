---
phase: quick-261112-glf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/funil-desenhado.ts
  - scripts/test-funil-desenhado.ts
  - src/components/nx/funil-desenhado.tsx
  - src/styles/nexo-funil-desenhado.css
  - src/lib/leitura/fatos-comercial.ts
  - src/routes/_authenticated.$clientId.crm-painel.tsx
  - src/routes/_authenticated.$clientId.pacientes.tsx
  - src/routes/_authenticated.$clientId.jornada.tsx
  - src/lib/registro-de-telas.ts
  - scripts/test-telas-juntadas.ts
  - tests/e2e/telas-juntadas.spec.ts
  - src/lib/linha-30-dias.ts
  - scripts/test-linha-30-dias.ts
  - src/components/nx/cartoes.tsx
  - src/styles/nexo-cartoes.css
  - src/routes/_authenticated.$clientId.anuncios.tsx
  - src/routes/_authenticated.$clientId.conteudo.tsx
  - docs/redesenho/molde-da-pagina.md
autonomous: true
requirements: [MEDV-02, MEDV-04, LEIT-03]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Em Onde os pacientes travam › Funil › No CRM, o médico vê o funil desenhado (sketch 001, A2) com as etapas Conversou · Virou lead · Atendido · Agendou · Fechou (nomes do João, 12/11/2026, D-06): faixas centradas em escala de raiz com mínimo, ligações em trapézio com a pílula 'N% passam', a ligação da maior perda em vermelho com ▼ e a pílula '▼ Maior perda: X → Y (N% passam) ↗' que abre essa etapa"
    - "Em Funil › Do contato à venda, o mesmo funil desenhado é o gráfico principal; as etapas com comparação diária em memória mostram '▲/▼ N% vs mês antes' (no celular só o %) e o contorno tracejado do período anterior; tocar numa etapa abre a gaveta com a quebra, o período anterior e 'Ver quem são'"
    - "Na Jornada, o funil desenhado começa em Conversou e Alcance, Engajamento e Comentário ou direct aparecem logo acima, com os nomes de hoje, numa faixa 'Antes da conversa'"
    - "Etapa sem medida vira o toco cinza 'Falta dado' (nunca barra nem 0), base abaixo do mínimo mostra 'N de M' sem %, população diferente entre etapas não ganha %, e funil fora de ordem mostra o aviso e não aponta a maior perda"
    - "As abas Funil e Jornada mostram em cinza a contagem de pessoas que viraram lead no período ('—' antes de abrir, nunca '0'), sem consulta nova"
    - "Os cartões que já têm série diária em memória (Investido e Conversas iniciadas em Anúncios, Seguidores hoje em Desempenho, os cartões de pessoas em Do contato à venda) mostram a linha de 30 dias (sketch 002, A): área, média tracejada, dica 'dia: valor' com ponto ao passar o dedo ou o mouse, e o toque fixa 'dia: valor · ▲/▼ N% vs média do mês'; o teclado anda pelos dias"
    - "Com os Detalhes fechados, cada aba medida continua com no máximo 1218 px em 375x812 e 1350 px em 1440x900 (D-04, MEDV-04)"
  artifacts:
    - path: src/lib/funil-desenhado.ts
      provides: "NOMES_DO_FUNIL, tipos EtapaDesenhada/FunilDesenhado, geometria (larguraDaEtapa, larguraDoAnterior, poligonoDaLigacao, textoDaPassagem, resumoAcessivel) e os adaptadores deFunilComercial, dePacientesDoPeriodo, daJornada"
    - path: src/components/nx/funil-desenhado.tsx
      provides: "NxFunilDesenhado (funil A2 + gaveta em dialog nativo)"
    - path: src/styles/nexo-funil-desenhado.css
      provides: "estilos do funil e da gaveta, só tokens"
    - path: src/lib/linha-30-dias.ts
      provides: "pontos, caminho, média, índice do dedo, texto do dia, comparação com a média e resumo acessível da série diária"
    - path: src/components/nx/cartoes.tsx
      provides: "NxLinhaDe30Dias e a prop opcional serie de NxCartaoNumero"
    - path: scripts/test-funil-desenhado.ts
      provides: "teste tsx da geometria e dos 3 adaptadores (honestidade incluída)"
    - path: scripts/test-linha-30-dias.ts
      provides: "teste tsx da série diária"
  key_links:
    - from: src/routes/_authenticated.$clientId.crm-painel.tsx
      to: src/lib/funil-desenhado.ts
      via: "deFunilComercial(diag.data) alimenta NxFunilDesenhado no principal"
    - from: src/routes/_authenticated.$clientId.pacientes.tsx
      to: src/lib/funil-desenhado.ts
      via: "dePacientesDoPeriodo(q.data, variação do diário) no principal; usePublicarContagem com leads_novos"
    - from: src/routes/_authenticated.$clientId.jornada.tsx
      to: src/lib/funil-desenhado.ts
      via: "daJornada(funilDaJornada, funil do diagnóstico) no principal; usePublicarContagem com a etapa lead"
    - from: src/lib/registro-de-telas.ts
      to: src/components/nx/abas-em-pasta.tsx
      via: "contagem 'pessoas que viraram lead no período' nas abas funil e jornada lida por contagemDaAba"
    - from: src/components/nx/cartoes.tsx
      to: src/lib/linha-30-dias.ts
      via: "NxCartaoNumero serie -> NxLinhaDe30Dias"
---

<objective>
Levar os dois sketches aprovados pelo João em 12/11/2026 para o Nexo de verdade: (1) o funil desenhado (sketch 001, variante A2) no lugar dos funis de hoje em Onde os pacientes travam (Funil › Do contato à venda, Funil › No CRM, Jornada), com os nomes Conversou · Virou lead · Atendido · Agendou · Fechou (decisão aberta 1 / D-06, só os nomes, registrada em .planning/STATE.md); (2) a linha de 30 dias (sketch 002, variante A) como prop opcional de NxCartaoNumero nos cartões que já têm série diária em memória.

Purpose: a maior perda entre etapas e a tendência do mês entram de relance, sem ler. Só apresentação e regra pura sobre o que as telas já carregam (D-05 da 03.1.1: sem IA, sem consulta nova, sem tabela, sem migration, sem SQL, sem sync, sem pacote novo). Nada some (D-03): o que sai da vista vai para os Detalhes.

Output: lib pura + peça NxFunilDesenhado + CSS; funil nas 3 telas; contagem das abas Funil e Jornada; NxLinhaDe30Dias e a prop serie; molde atualizado; testes tsx novos; e2e ajustados; SUMMARY em português, no formato de 261112-e8e.
</objective>

<execution_context>
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/workflows/execute-plan.md
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/sketches/001-funil-desenhado/index.html
@.planning/sketches/001-funil-desenhado/README.md
@.planning/sketches/002-cartao-com-grafico/index.html
@.planning/sketches/002-cartao-com-grafico/README.md
@.planning/quick/261112-e8e-menos-texto-mais-visual-no-nexo/261112-e8e-SUMMARY.md
@.planning/phases/03.1.1-tela-o-que-fazer-hoje-para-o-m-dico/03.1.1-CONTEXT.md
@docs/redesenho/molde-da-pagina.md

Fatos do código já conferidos no planejamento (não precisa redescobrir):
- Hoje o funil aparece em 3 lugares: crm-painel (principal, `NxFunil` de anuncios-graficos.tsx, passos entraram → atendidos → agendaram → compraram de `montarFunil` em src/lib/comercial.ts, via `useDiagnosticoComercial`); jornada (principal, o mesmo `NxFunil` com as 7 etapas de src/lib/jornada-funil.ts via `useFunilDaJornada` em src/components/jornada-funil.tsx, que já busca também o diagnóstico comercial e pacientes_periodo); pacientes (dentro dos Detalhes, um `CmBarras` com Chamaram, Em negociação, Agendaram, Foram na consulta, Fecharam; o principal é "Evolução por dia" com `NxLinhaTempo`).
- `NxFunil` continua usado por anuncios.tsx e links.tsx (outro funil, de anúncio e de link): NÃO mexer nele nem em anuncios-graficos.tsx (o molde reserva o arquivo ao 03.1-07). A peça nova tem nome e arquivo próprios.
- "Atendido": o passo `atendidos` de comercial.ts ("saíram da primeira etapa do CRM", conta ganho e perdido) é o número já buscado mais próximo do papel `em_atendimento` (crm_perfil_etapa.papel); em pacientes_periodo, `negociacao` é "em atendimento agora" (aberto, com movimento no período, fora do agendamento) e as listas `listas.negociacao/agendaram/fecharam` trazem `itens` com a chave de pessoa `pessoa` e o `total` (a lista pode vir cortada).
- `diag.data.dados.whatsapp.conversas` vem de `getWtsResumo(clientId, start, end)` (src/lib/client-data.ts): é do período.
- `foraDeOrdem(passos)` existe em src/lib/leitura/fatos-comercial.ts (linha 78), sem export.
- O filtro de jargão da leitura (`JARGAO` em src/lib/leitura/texto.ts, arquivo que o molde reserva) proíbe "lead" no texto da leitura: por isso a leitura NÃO muda de nomes; os nomes do João valem no funil desenhado (gráfico), não no texto da leitura. Anotar no SUMMARY como pergunta para o João.
- Pacientes compara com o período anterior pelo diário (`somas.atual`/`somas.antes`, `vc(k)` = `variacaoPct`), campos `CAMPOS_DIARIOS` = mandaram_mensagem, leads_novos, antigos, agendaram, negociacao, compareceram, fecharam. Rodar pacientes_periodo para o período anterior é proibido (estoura 8 s nas clínicas grandes, comentário na própria rota). crm-painel e jornada não têm período anterior em memória.
- Não há sheet/dialog nx; o padrão do app é `<dialog>` nativo com `showModal()` (src/components/app-shell.tsx, ~linha 155). Não há pasta src/components/ui.
- recharts está no package.json, mas a linha de 30 dias é SVG inline, sem pacote novo.
- Cartões de pessoas de pacientes são `NxKpi` (base.tsx, congelado pelo SAP): a linha entra pelo slot `extra` que o NxKpi já tem, sem editar base.tsx.
- Alturas a 375x812 depois de 261112-e8e (limite 1218): Funil › Do contato à venda 1160, Jornada 1218 (sem folga), Anúncios 1209, Instagram Desempenho 1115. A 1440x900 (limite 1350): todas até 1312. `tests/e2e/telas-juntadas.spec.ts` (~linhas 418-473) mede as partes pacientes, crm-painel e jornada nas 2 janelas.
- Baselines dos gates (medidos no HEAD 36f57ef): `components/nx/anuncios-graficos` aparece 1 vez em crm-painel.tsx e 1 em jornada.tsx; `NxFunilDesenhado` 0 nas rotas; "Pessoas em cada etapa" 1 em pacientes.tsx; "pessoas que viraram lead no período" 0 no registro; `usePublicarContagem` 0 em pacientes.tsx e jornada.tsx; `NxLinhaDe30Dias` 0 em cartoes.tsx.

Ambiente: máquina fraca. Testes de unidade são scripts tsx: `node --import ./scripts/test-network-guard.mjs --import tsx scripts/NOME.ts` (seguir o estilo de import de scripts/test-funil-taxa.ts). `src/routeTree.gen.ts` é gitignored: rodar `npm run routes:generate` antes do tsc (no worktree, não commitar o arquivo). tsc tem 4 erros antigos (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts). `npm test` tem falhas antigas conhecidas: creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta (creative-database instável). Playwright: no máximo 4 specs por rodada, `--workers=1`, depois de `VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build`, com `PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): funil desenhado de ponta a ponta em Funil › No CRM (crm-painel)</name>
  <files>src/lib/funil-desenhado.ts, scripts/test-funil-desenhado.ts, src/components/nx/funil-desenhado.tsx, src/styles/nexo-funil-desenhado.css, src/lib/leitura/fatos-comercial.ts, src/routes/_authenticated.$clientId.crm-painel.tsx</files>
  <read_first>.planning/sketches/001-funil-desenhado/index.html (a função render, bloco "A2", e o CSS .f2-* e #gaveta são a especificação visual), src/components/nx/anuncios-graficos.tsx (linhas 174-226, o funil de hoje, só para ler), src/lib/comercial.ts (linhas 46-63 Contagem, 278-306 PassoFunil/Funil, 359-495 montarFunil), src/lib/leitura/fatos-comercial.ts (linhas 60-90), src/lib/funil-taxa.ts (passagem, fmtNdeM, minimoDaBase), src/components/nx/cartoes.tsx (NxBarras), src/components/nx/blocos.tsx (NxAviso), src/components/app-shell.tsx (linhas 150-175, dialog nativo), src/routes/_authenticated.$clientId.crm-painel.tsx (linhas 240-400), src/styles/nexo-system.css (tokens)</read_first>
  <behavior>
    - larguraDaEtapa: escala de raiz (raiz(valor/maior) x 100) com mínimo de 8%; valor 0 dá o mínimo; nunca passa de 100
    - larguraDoAnterior: com variação de +25% e valor 125 o anterior estimado é 100; sem variação, ou com 1 + pct/100 menor ou igual a 0, devolve null
    - poligonoDaLigacao(100, 50) devolve "polygon(0% 0, 100% 0, 75% 100%, 25% 100%)" (margem = (100 - largura)/2, no máximo 2 casas)
    - textoDaPassagem: taxa 0.094 vira "9% passam" (mesmo formato de fmtFracao); só fração {n:3,m:12} vira o texto de fmtNdeM; semPassagem ou nada vira null
    - deFunilComercial com o funil da Lana do sketch (entraram 2283, atendidos 217, agendaram 39, compraram 18, whatsapp 5808 conversas, escopo periodo) devolve 5 etapas com os nomes NOMES_DO_FUNIL, a ligação Conversou → Virou lead sem % (contas diferentes) e a maior perda Virou lead → Atendido
    - passo com valor null vira etapa Falta dado (valor null, motivo = aviso do passo) e as ligações vizinhas ficam neutras (sem %)
    - base abaixo do mínimo: a ligação mostra "N de M", nunca %
    - funil fora de ordem (foraDeOrdem verdadeiro): maiorPerda null e o aviso de fora de ordem presente
    - WhatsApp desligado, conversas null ou escopo "base": Conversou vira Falta dado com o motivo
  </behavior>
  <action>
Primeiro o teste (RED), depois o código (GREEN), um commit por passo lógico.

1. src/lib/leitura/fatos-comercial.ts: só acrescentar `export` na função `foraDeOrdem` já existente (mesma regra, uma regra só no sistema). Não mudar texto, regra nem VERSAO_REGRAS_COMERCIAL.

2. src/lib/funil-desenhado.ts (novo, módulo puro: sem React, sem banco, sem IA; só `import type` de comercial.ts, jornada-funil.ts e pacientes.ts, e funções de funil-taxa.ts e metricas.ts):
   - `NOMES_DO_FUNIL` = Conversou, Virou lead, Atendido, Agendou, Fechou, `as const`, com comentário: "Nomes do João em 12/11/2026 (decisão aberta 1 / D-06, só os nomes; registrado em .planning/STATE.md). Valem no funil desenhado; a leitura mantém os nomes dela porque o filtro de jargão de texto.ts proíbe a palavra no texto da leitura."
   - Tipos: `EtapaDesenhada` com id, nome, valor (number | null; null = Falta dado), texto (número formatado pt-BR ou "Falta dado"), estimado (boolean, mostra "≈" antes do número), motivo (por que falta), explicacao (frase curta para a gaveta), variacao ({ pct; sobe } | null, só quando o período anterior está em memória), passagem (da etapa anterior para esta: { taxa: number | null; fracao: {n,m} | null; sem: string | null } | null) e detalhe (BarraDoFato[] de src/lib/leitura/tipos.ts, para a gaveta desenhar com NxBarras). `FunilDesenhado` com etapas, maiorPerda ({ de: índice; para: índice; texto: "N% passam" } | null), foraDeOrdem (boolean) e aviso (string | null).
   - Geometria e textos: `larguraDaEtapa(valor, maior, minimo = 8)`, `maiorDaEscala(etapas)` (maior entre os valores atuais e os anteriores estimados, para o contorno nunca cortar), `larguraDoAnterior(etapa, maior)`, `poligonoDaLigacao(w1, w2)`, `textoDaPassagem(p)`, `rotuloDoAnterior(dias)` ("mês antes" com 28 a 31 dias, senão "período anterior") e `resumoAcessivel(titulo, funil)` (uma frase por etapa com número, variação e passagem ou o motivo de não ter %, mais a maior perda).
   - Adaptador `deFunilComercial(d: { funil: Funil; dados: DadosComerciais })` para crm-painel: Conversou = `dados.whatsapp.conversas` quando `whatsapp.conectado`, o valor não é null e `dados.escopo === "periodo"`; senão Falta dado com o motivo certo ("O WhatsApp da clínica não está ligado ao Nexo." / "As conversas do WhatsApp não vieram neste período." / "Poucos leads no período: o CRM foi lido na base inteira, sem conversas do período."). Virou lead = passo entraram, Atendido = atendidos, Agendou = agendaram, Fechou = compraram; passo com valor null vira Falta dado com `aviso` como motivo; passo `estimado` mantém o número com estimado verdadeiro e o aviso na explicacao. Ligações: Conversou → Virou lead sempre `sem` ("Conversas do WhatsApp e cards do CRM são contas diferentes: lead de formulário não passa pela conversa."); as outras usam `pctDoAnterior`/`fracaoDoAnterior` do passo só quando a etapa desenhada de cima tem valor (se a de cima é Falta dado, a ligação fica neutra e a porcentagem com a base de `passo.anterior` vai para a explicacao da etapa). maiorPerda = `funil.maiorPerda` mapeado para índices (entraram 1, atendidos 2, agendaram 3, compraram 4), texto pela `pctDoAnterior` do passo de chegada, ou 1 - pct; com `foraDeOrdem(funil.passos)` verdadeiro, maiorPerda null, foraDeOrdem verdadeiro e aviso "Funil fora de ordem: uma etapa tem mais gente que a anterior, então a maior perda não é apontada.". Detalhe de cada etapa só com números de `dados.c` que não são null (Virou lead: Ainda na primeira etapa = naEntrada, Já atendidos = atendidos, Perdidos, Fechados = ganhos; Atendido: Agendaram = agendados, Fecharam = ganhos, Perdidos; Agendou: Em consulta agendada = emConsulta, Fecharam; Fechou: Fechados; Conversou: Conversas no período, Com espera medida = respondidas), `fracao` relativa ao maior número da própria lista. Só contagens: nenhum nome, telefone ou e-mail.

3. scripts/test-funil-desenhado.ts (novo, tsx, `node:assert`): os casos do bloco behavior, com o funil da Lana do sketch e variações sem dado, base pequena e fora de ordem. Rodar e ver falhar antes do código.

4. src/components/nx/funil-desenhado.tsx (novo): `NxFunilDesenhado({ titulo, funil, rotuloDoAnterior = "mês antes", antes?, acaoDaEtapa? })`, memo, só apresentação (não busca nem grava nada, CHAM-07). Importa só peças nx permitidas (NxBarras de cartoes.tsx, NxAviso de blocos.tsx) e a lib; nenhum arquivo congelado do molde. Desenho igual ao `#f2` do sketch:
   - `figure` com `data-peca="funil-desenhado"` e `figcaption` só para leitor de tela com `resumoAcessivel`.
   - Topo: quando há maiorPerda, botão pílula vermelha "▼ Maior perda: {de} → {para} ({texto}) ↗" (tokens --dn-bg/--dn-ink, sinal ▼ no texto, nunca só a cor) que abre a gaveta da etapa de chegada; quando foraDeOrdem, `NxAviso tom="atencao"` com o aviso no lugar da pílula.
   - Grade de 3 colunas (150px 1fr 96px; até 560 px 92px 1fr 58px, espaço 8): cada etapa é um `button type="button"` com `aria-haspopup="dialog"` cobrindo as 3 colunas: à esquerda o nome (negrito) e, quando há variação, "▲ N%"/"▼ N%" com as tintas --up-ink/--dn-ink mais o texto "vs {rotuloDoAnterior}" (escondido até 560 px, fica só o %); no meio o trilho centrado com o contorno tracejado (borda 1.5px dashed var(--b3), largura `larguraDoAnterior`, só com variação) e a faixa (degradê var(--b1) → var(--b2), largura `larguraDaEtapa`); à direita o número grande (com "≈" quando estimado). Etapa Falta dado: no meio um toco cinza curto e listrado com o texto "Falta dado" (var(--field), var(--muted-ink), listra como .nx-faltou) e "—" à direita. Nome acessível do botão: "{nome}: {texto}, {variação}, {passagem ou o motivo de não ter %}. Abrir detalhe".
   - Entre etapas, ligação `aria-hidden` de 30 px (até 560 px, 16 px): trapézio com clip-path `poligonoDaLigacao` em var(--b6); a da maior perda em var(--dn-bg) com a pílula "▼ N% passam" em var(--dn-ink); com fração, pílula "N de M" cinza; com `sem` ou vizinha Falta dado, faixa reta neutra sem pílula. A pílula branca com sombra fica centrada como `.f2-lig .pct`.
   - Legenda de uma linha só quando alguma etapa tem variação ("faixa = este período · tracejado = {rotuloDoAnterior}").
   - `antes` (slot opcional) é desenhado entre o topo e a grade (a Jornada usa na Task 2).
   - Gaveta: `<dialog>` nativo aberto com `showModal()` (padrão de app-shell.tsx), classe `nx-funil-d__gaveta`: até 560 px folha presa embaixo, largura cheia, cantos de cima arredondados; acima disso, centrada com largura máxima de 520 px. Conteúdo: h3 "{nome}: {texto}"; linha "▲/▼ N% vs {rotuloDoAnterior}" quando há variação; o motivo quando Falta dado; a explicacao; `NxBarras` com `detalhe`; `acaoDaEtapa?.(etapa, fechar)` (slot para "Ver quem são" na Task 2); botão "✕" de 44 px com aria-label "Fechar". Esc fecha (nativo), o clique no fundo fecha, e o foco volta para o botão da etapa que abriu. A etapa aberta ganha o anel `box-shadow 0 0 0 4px var(--b5)` na faixa.
   - Foco visível (`:focus-visible`, contorno var(--focus)) em todo botão; alvo de toque de 44 px no fechar e na pílula.

5. src/styles/nexo-funil-desenhado.css (novo, importado pela peça): só `var(--...)`, nenhum hex (scripts/test-nexo-system-css.ts lê toda nexo-*.css); prefixo `nx-funil-d`; faixa de 46 px no desktop e 30 px até 560 px; texto de 14 px ou mais, exceto a pílula da ligação e o "vs" (12 px, como a pílula do funil de hoje no celular); transição de largura e a subida da gaveta só dentro de `@media (prefers-reduced-motion: no-preference)`.

6. src/routes/_authenticated.$clientId.crm-painel.tsx: no `principal`, trocar o funil em degraus pelo `NxFunilDesenhado` com `deFunilComercial(diag.data)` (useMemo), no mesmo `NxCard id="funil-comercial"` "Onde o funil quebra", subtítulo "Conversou → Fechou · {periodoTxt} · toque numa etapa". Tirar o mapeamento antigo das etapas e o import do anuncios-graficos e qualquer import que ficar sem uso. Sem período anterior em memória nesta tela: sem contorno e sem ▲/▼ (nenhuma consulta nova). Os Detalhes ("Onde o funil quebra, passo a passo" com FunilOndeQuebra e o resto) ficam como estão (D-03).

7. Rodar o e2e da Task e conferir as alturas de crm-painel (aba Funil › No CRM) nas 2 janelas.
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-funil-desenhado.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-leitura-comercial.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-nexo-system-css.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-telas-inventario.ts && test "$(grep -c 'components/nx/anuncios-graficos' 'src/routes/_authenticated.$clientId.crm-painel.tsx')" = 0 && test "$(grep -c NxFunilDesenhado 'src/routes/_authenticated.$clientId.crm-painel.tsx')" -ge 1 && npm run routes:generate && test -z "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v -E 'scripts/test-perfil-da-clinica.ts|workers/creative/intelligence.ts')" && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/telas-juntadas.spec.ts tests/e2e/comercial-painel.spec.ts --workers=1</automated>
  </verify>
  <done>Em /{cliente}/crm-painel o principal é o funil desenhado com as 5 etapas do João, ligações em trapézio, maior perda em vermelho com ▼ e a pílula que abre a gaveta; Falta dado, "N de M" e fora de ordem se comportam como no behavior; o teste tsx passa; tsc sem erro novo; telas-juntadas (com a régua de altura de No CRM) e comercial-painel passam. Commits: teste, lib, peça + CSS, rota.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: funil desenhado em Do contato à venda (pacientes) e na Jornada, mais a contagem das abas Funil e Jornada</name>
  <files>src/lib/funil-desenhado.ts, scripts/test-funil-desenhado.ts, src/routes/_authenticated.$clientId.pacientes.tsx, src/routes/_authenticated.$clientId.jornada.tsx, src/styles/nexo-funil-desenhado.css, src/lib/registro-de-telas.ts, scripts/test-telas-juntadas.ts, tests/e2e/telas-juntadas.spec.ts</files>
  <read_first>src/lib/pacientes.ts (linhas 1-130: Numero, ItemPessoa, PacientesPeriodo, avisoAgendouMenosQueFechou), src/lib/jornada-funil.ts (inteiro), src/components/jornada-funil.tsx (useFunilDaJornada), src/routes/_authenticated.$clientId.pacientes.tsx (linhas 115-420), src/routes/_authenticated.$clientId.jornada.tsx (linhas 90-220), src/components/nx/abas-em-pasta.tsx (usePublicarContagem, contagemDaAba), src/routes/_authenticated.$clientId.conteudo-comercial.tsx (linhas 110-120, o jeito de publicar), src/lib/registro-de-telas.ts (linhas 430-473), scripts/test-telas-juntadas.ts (linhas 60-70), tests/e2e/telas-juntadas.spec.ts (linhas 290-310 e 410-480), tests/e2e/apoio-telas-juntadas.ts (mockPessoas, mockCrm)</read_first>
  <behavior>
    - dePacientesDoPeriodo: Conversou = mandaram_mensagem, Virou lead = leads_novos, Agendou = agendaram, Fechou = fecharam, cada um com a variação que a rota passa
    - Atendido = pessoas distintas (chave `pessoa`) de listas.negociacao, agendaram e fecharam, só quando cada uma das 3 listas veio inteira (itens.length === total) e negociacao tem valor; senão Falta dado com o motivo; Atendido nunca tem variação nem contorno (o diário não tem esse campo)
    - Ligações em pacientes: Conversou → Virou lead e Virou lead → Atendido sem % (pacientes antigos entram em uma e não na outra); Atendido → Agendou pela passagem com base de leads; Agendou → Fechou pela passagem com base de agendamentos só quando fecharam ≤ agendaram, senão sem % com o texto de avisoAgendouMenosQueFechou
    - Maior perda em pacientes: a menor taxa abaixo de 1 entre as ligações com taxa
    - daJornada: devolve a faixa "antes" com Alcance, Engajamento, Comentário ou direct (nomes de hoje, número ou Falta dado) e o funil de 5 etapas: Conversou = conversa, Virou lead = lead, Atendido = passo atendidos do diagnóstico (só com escopo periodo, valor e confiavel; senão Falta dado), Agendou = agendamento, Fechou = venda
    - Ligações da Jornada: Conversou → Virou lead e Agendou → Fechou herdam taxa, fração ou semPassagem da etapa de chegada; as duas ligações de Atendido são sempre sem % (cards do CRM contra pessoas)
    - Maior perda da Jornada: a maiorQueda de jornada-funil só quando de e para ficam vizinhas no funil desenhado; qualquer ligação desenhada com taxa acima de 1 liga foraDeOrdem e apaga a maior perda
    - etapa sem_integracao ou parcial sem valor vira Falta dado com a explicacao e o que falta (integração, dado, onde) na explicacao da gaveta
  </behavior>
  <action>
1. src/lib/funil-desenhado.ts: acrescentar os adaptadores do behavior. `dePacientesDoPeriodo({ dados, variacao })`, com `variacao: (chave) => { pct; sobe } | null` vinda da rota (a lib não importa hook). A explicacao de cada etapa é curta e vem do `TEXTO_NUMERO` já existente (legenda). Detalhe: Conversou = Pessoas novas e Pacientes antigos (numeros.leads_novos/antigos); Atendido = Em atendimento agora (negociacao), Agendaram, Fecharam; Agendou = Foram na consulta (compareceram, só medido) e Fecharam; Fechou = Fecharam. Motivos de Falta dado: `motivo_sem_dado` do Numero; Atendido com lista cortada: "A lista de quem foi atendido não veio inteira, então não dá para contar sem repetir pessoas.". `daJornada({ funil, comercial })` devolve `{ antes, funil }`. Textos `sem` (frases curtas, sem nome de pessoa): "Virou lead conta só pessoas novas, e quem conversou inclui pacientes antigos: sem % entre as duas."; "Atendido inclui pacientes antigos: sem % sobre as pessoas novas."; "Atendido conta cards do CRM, e Virou lead conta pessoas: sem % entre as duas."; "Agendou conta pessoas, e Atendido conta cards do CRM: sem % entre as duas.". Testes novos no scripts/test-funil-desenhado.ts primeiro (RED), depois o código.

2. src/routes/_authenticated.$clientId.pacientes.tsx:
   - `principal` passa a ser `NxCard id="funil"` "Do contato à venda", subtítulo "{rotuloPeriodo} · toque numa etapa", com `NxFunilDesenhado` alimentado por `dePacientesDoPeriodo` (useMemo; variação pelo `vc` que a tela já tem, convertida para { pct; sobe } só quando o tom não é "flat") e `rotuloDoAnterior(comparacao.dias)`. `acaoDaEtapa`: botão "Ver quem são" que fecha a gaveta e chama o `abrir(chave)` que já existe (Conversou → mandaram_mensagem, Virou lead → leads_novos, Atendido → negociacao, Agendou → agendaram, Fechou → fecharam), só para etapa com valor. Assim o "toque para ver quem são" do funil antigo continua.
   - O cartão "Evolução por dia" (`NxCard id="evolucao"` com NxLinhaTempo e "Como ler este gráfico") muda, sem nenhuma alteração por dentro, do principal para o primeiro item dos Detalhes (nada some, D-03).
   - O cartão dos Detalhes que desenhava o funil antigo com `CmBarras` sai: o funil desenhado o substitui (o pedido é substituir, não somar). "Em negociação" e "Foram na consulta" continuam visíveis na gaveta (Atendido e Agendou) e nos cartões. Tirar imports que ficarem sem uso (o anuncios-graficos continua por causa do NxComoCalcula).
   - `usePublicarContagem` antes de qualquer `return` antecipado: rota "/_authenticated/$clientId/pacientes", período start/end, valor: carregando → undefined; erro ou sem dado → null; senão `numeros.leads_novos?.valor || null` (zero vira null e a aba mostra "—", nunca "0", como em conteudo-comercial.tsx).

3. src/routes/_authenticated.$clientId.jornada.tsx: no `principal`, o mesmo `NxCard id="funil-da-jornada"` "Do alcance à venda" (subtítulo "{medidas} de 7 etapas · toque numa etapa") com `NxFunilDesenhado` de `daJornada(funilDaJornada, diagnóstico)` e o slot `antes` com a faixa "Antes da conversa": lista horizontal de 3 chips (nome de hoje + número, ou "Falta dado" listrado), `aria-label="Antes da conversa"`. Decisão (documentar no SUMMARY): as faixas começam em Conversou porque o alcance (centenas de milhares) achataria as 5 etapas do comercial no mínimo mesmo na escala de raiz, e porque a Jornada está exatamente em 1218 px; as 3 etapas do Instagram continuam com o nome e o número à vista, e a lista completa de 7 etapas com o que falta para medir (JornadaFunil) continua nos Detalhes. O diagnóstico vem do que a tela já carrega (`doFunil`/`diag`, mesma chave de React Query, nenhuma consulta nova). Tirar o mapeamento antigo das etapas e o import do anuncios-graficos. `usePublicarContagem` com rota "/_authenticated/$clientId/jornada": carregando → undefined; valor da etapa lead só quando ela conta pessoas (o `pac` de useFunilDaJornada veio), senão null; zero vira null.

4. src/lib/registro-de-telas.ts: abas funil e jornada passam a `contagem: "pessoas que viraram lead no período"`; trocar os 2 comentários que esperavam a decisão aberta 1 por: "O João deu os nomes das etapas em 12/11/2026 (D-06, só os nomes). A contagem é Virou lead: as pessoas novas do período que a primeira parte já carrega (pacientes_periodo), sem consulta nova; zero e erro mostram '—'." scripts/test-telas-juntadas.ts: atualizar a lista esperada das contagens. tests/e2e/telas-juntadas.spec.ts: onde hoje se espera que Funil e Jornada não tenham contagem, esperar "—" com o sr-only "sem número" antes de abrir e, depois de abrir /pacientes com o mock de pessoas, o número de pessoas novas do mock na aba Funil.

5. Alturas (régua D-04/MEDV-04 de telas-juntadas.spec.ts, Detalhes fechados): Funil › Do contato à venda, Funil › No CRM e Jornada até 1218 px a 375x812 e até 1350 px a 1440x900. Alavancas permitidas, nesta ordem, só no CSS do funil e sem tirar informação: faixa de 28 px e ligação de 14 px até 560 px; legenda dentro do subtítulo do cartão; a pílula da maior perda no slot `acao` do NxCard (mesma linha do título) em vez de linha própria; chips do "Antes da conversa" numa linha só com rolagem lateral dentro da faixa. Não aumentar o limite, não apagar nada e não mexer em pagina.tsx, blocos.tsx nem base.tsx. Se ainda passar, parar e relatar as medidas no SUMMARY.
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-funil-desenhado.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-telas-juntadas.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-telas-inventario.ts && test "$(grep -c 'Pessoas em cada etapa' 'src/routes/_authenticated.$clientId.pacientes.tsx')" = 0 && test "$(grep -c 'components/nx/anuncios-graficos' 'src/routes/_authenticated.$clientId.jornada.tsx')" = 0 && test "$(grep -c 'pessoas que viraram lead no período' src/lib/registro-de-telas.ts)" -ge 2 && test "$(grep -c usePublicarContagem 'src/routes/_authenticated.$clientId.pacientes.tsx')" -ge 2 && test "$(grep -c usePublicarContagem 'src/routes/_authenticated.$clientId.jornada.tsx')" -ge 2 && npm run routes:generate && test -z "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v -E 'scripts/test-perfil-da-clinica.ts|workers/creative/intelligence.ts')" && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/telas-juntadas.spec.ts tests/e2e/comercial-painel.spec.ts --workers=1</automated>
    <human-check>Abrir Do contato à venda, No CRM e Jornada em 375 e 1440 px e comparar com a variante A2 do sketch 001: faixas centradas, trapézios, ligação vermelha da maior perda, toco "Falta dado", gaveta que abre e fecha com Esc e devolve o foco.</human-check>
  </verify>
  <done>Do contato à venda tem o funil desenhado como gráfico principal com ▲/▼ e contorno do período anterior nas 4 etapas com diário, Atendido medido pela união das listas ou "Falta dado" com o motivo, e "Ver quem são" na gaveta; "Evolução por dia" está nos Detalhes; a Jornada tem o funil de 5 etapas com a faixa "Antes da conversa"; as abas Funil e Jornada mostram a contagem de pessoas que viraram lead ("—" antes de abrir); testes tsx, tsc e os 2 e2e passam, com as alturas dentro do limite. Commits: testes + adaptadores, pacientes, jornada, contagem.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: linha de 30 dias no NxCartaoNumero e nos cartões que já têm série diária; molde atualizado</name>
  <files>src/lib/linha-30-dias.ts, scripts/test-linha-30-dias.ts, src/components/nx/cartoes.tsx, src/styles/nexo-cartoes.css, src/routes/_authenticated.$clientId.anuncios.tsx, src/routes/_authenticated.$clientId.conteudo.tsx, src/routes/_authenticated.$clientId.pacientes.tsx, docs/redesenho/molde-da-pagina.md</files>
  <read_first>.planning/sketches/002-cartao-com-grafico/index.html (funções linha() e a interação de svg[data-s], variante A), src/components/nx/cartoes.tsx (inteiro), src/styles/nexo-cartoes.css, src/routes/_authenticated.$clientId.anuncios.tsx (linhas 370-440 e 540-590), src/routes/_authenticated.$clientId.conteudo.tsx (linhas 110-125 e 185-240), src/routes/_authenticated.$clientId.pacientes.tsx (CartaoDePessoas, ~linha 400 em diante, e `diario`), docs/redesenho/molde-da-pagina.md (seção i)</read_first>
  <behavior>
    - pontosDaLinha(valores, 300, 64) põe o maior valor a 92% da altura (y = 64 - v/max x 64 x 0.92) e x de 0 a 300; dia null não vira ponto: o caminho quebra ali (um "M" novo), nunca desce a zero
    - mediaDaSerie ignora null; sem nenhum valor devolve null
    - indiceMaisProximo(0.5, 30) devolve 15 (arredondado e preso entre 0 e n-1)
    - textoDoDia("2026-10-14", 685) devolve o dia da semana curto pt-BR com dd/mm e o valor ("ter., 14/10: 685" ou o formato que toLocaleDateString der, lido em T12:00Z para não trocar de dia por fuso)
    - comparacaoComAMedia(685, 194, 30) devolve sobe verdadeiro e "▲ 253% vs média do mês"; com 7 dias diz "vs média do período"; média 0 ou null devolve null
    - resumoDaSerie devolve "{rotulo} por dia, {dd/mm} a {dd/mm}: média N; maior N em dd/mm; menor N em dd/mm" e acrescenta "; N dias sem dado" quando há null
    - menos de 2 dias com valor: a peça não desenha nada
  </behavior>
  <action>
1. scripts/test-linha-30-dias.ts primeiro (RED), depois src/lib/linha-30-dias.ts (módulo puro, sem React) com as funções do behavior, mais `caminhoDaLinha` e `caminhoDaArea` (área fechada até a base, por trecho contínuo) e `yDaMedia`.

2. src/components/nx/cartoes.tsx: nova peça exportada `NxLinhaDe30Dias({ rotulo, datas, valores, formatar? })`, SVG inline sem pacote (o sketch A): viewBox 0 0 300 64 com preserveAspectRatio none, altura 56 px (40 px até 560 px) pelo CSS; área em var(--b6), linha em var(--b1) de 2 px com vector-effect non-scaling-stroke, média tracejada em var(--muted-2) (3 3); ponto de 4 px var(--b1) com borda var(--white) e a dica escura "dia: valor" (var(--text) de fundo, texto var(--white)) que segue o dedo ou o mouse por Pointer Events (pointermove mostra, pointerleave esconde, `touch-action: pan-y` para a página continuar rolando na vertical); o toque ou clique fixa embaixo a linha "<b>{dia}</b>: {valor} · {comparacaoComAMedia}" em var(--b6) com `aria-live="polite"`. Acessibilidade: o conjunto é `role="group"` com aria-label = `resumoDaSerie`; a área do gráfico é `role="slider"` com tabIndex 0, aria-valuemin 1, aria-valuemax n, aria-valuenow, aria-valuetext = textoDoDia do dia em foco; setas esquerda e direita, Home e End mudam o dia (mostra ponto e dica), Enter e Espaço fixam; foco visível. Sinal ▲/▼ sempre no texto, nunca só a cor. Nova prop opcional `serie?: { rotulo; datas; valores; formatar? }` em `NxCartaoNumeroProps`, desenhada logo depois da pílula de variação (ordem do sketch: número, pílula, linha) e antes da meta e da ação; não desenha com `semMedida` nem com menos de 2 dias. A pílula de variação (`NxPilulaVariacao`) continua a mesma (D-07: azul-clara, a seta só mostra a direção). Cartão sem série fica como está. Estilos em src/styles/nexo-cartoes.css, prefixo `nx-linha30`, só tokens, sem hex, animação só em `prefers-reduced-motion: no-preference`.

3. Ligar a série onde ela já está em memória (nenhuma `useQuery` nova, nenhuma chamada nova):
   - anuncios.tsx: "Investido" com o gasto por dia e "Conversas iniciadas" com as conversas por dia, ambos da série `porDia` que a tela já monta (gasto formatado com fmtBRL).
   - conteudo.tsx: "Seguidores hoje" com `seg.points` (data, seguidores). O alcance por dia só entra se houver um cartão de alcance e a série diária já estiver em memória; hoje não há cartão de alcance nesta tela, então anotar no SUMMARY.
   - pacientes.tsx: `CartaoDePessoas` recebe a série do `diario.data` que a tela já carrega (Mandaram mensagem, Agendaram, Fecharam, Foram na consulta; dia sem valor fica null) e desenha `NxLinhaDe30Dias` dentro do `extra` do NxKpi, antes do botão "Ver quem são" (base.tsx não muda; o aria-label "Agendaram: N. Ver quem são" do botão continua igual).
   - Procurar com grep outro NxCartaoNumero com série diária já em memória (Hoje, Destaques, Posts, Por origem, crm-painel); ligar só os que têm, e listar no SUMMARY os ligados e os que ficaram sem linha com o motivo (Público é a leitura ao vivo da Meta; Leads novos do CRM não tem série diária).

4. Alturas: as abas que ganharam linha continuam dentro da régua (Anúncios estava em 1209 a 375x812). Alavancas permitidas, nesta ordem, sem tirar informação: linha de 40 px até 560 px; se Anúncios ainda passar de 1218, o gráfico diário do principal (barras de gasto com a linha de conversas) vai inteiro para o primeiro item dos Detalhes, porque os 2 cartões agora mostram as mesmas séries diárias (nada some, como fez 261112-e8e com os gráficos do Instagram). Se ainda passar, parar e relatar as medidas.

5. docs/redesenho/molde-da-pagina.md: nova seção "j) Funil desenhado e linha de 30 dias (12/11/2026)" com as regras: nomes do João; escala de raiz com mínimo de 8%; ligação em trapézio com "N% passam", "N de M" abaixo do mínimo e sem % quando as etapas contam populações diferentes; maior perda em vermelho com ▼ só quando a regra aponta e o funil não está fora de ordem; contorno tracejado e ▲/▼ só com período anterior em memória; toco "Falta dado"; gaveta em dialog nativo; na Jornada as faixas começam em Conversou e as 3 etapas do Instagram ficam na faixa "Antes da conversa"; a linha de 30 dias só com série diária já em memória, dia sem dado é buraco (nunca 0), média tracejada, slider de teclado e resumo para leitor de tela; "média do mês" com 28 a 31 dias, senão "média do período".

6. Fechamento: `npm test` (só as falhas antigas conhecidas), tsc filtrado, os 4 e2e abaixo, conferir que package.json, package-lock.json, supabase/ e api/ não mudaram desde o início do plano e que não entrou `useQuery(` nova em src/routes, e escrever o SUMMARY em português no formato de 261112-e8e (commits, verificação, alturas medidas de cada aba nas 2 janelas, desvios, a decisão da Jornada, a fonte de Atendido em cada tela e a pergunta para o João sobre os nomes na leitura).
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-linha-30-dias.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-funil-desenhado.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-nexo-system-css.ts && test "$(grep -c NxLinhaDe30Dias src/components/nx/cartoes.tsx)" -ge 2 && test "$(grep -c 'serie={' 'src/routes/_authenticated.$clientId.anuncios.tsx')" -ge 2 && test -z "$(npm test 2>&1 | grep '^FAIL' | grep -v -E 'creative-discovery|creative-theme|kommo-closed-at|nao-medido|status-que-nao-mente|tela-honesta|creative-database')" && npm run routes:generate && test -z "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v -E 'scripts/test-perfil-da-clinica.ts|workers/creative/intelligence.ts')" && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/telas-juntadas.spec.ts tests/e2e/anuncios-painel.spec.ts tests/e2e/instagram-painel.spec.ts tests/e2e/comercial-painel.spec.ts --workers=1</automated>
  </verify>
  <done>Investido, Conversas iniciadas, Seguidores hoje e os cartões de pessoas de Do contato à venda mostram a linha de 30 dias com média tracejada, dica ao passar, dia fixado com "▲/▼ N% vs média do mês" e teclado; cartões sem série não mudaram; o molde tem a seção j; npm test só com as falhas antigas; tsc sem erro novo; os 4 e2e passam com as alturas dentro do limite; SUMMARY escrito. Commits: teste + lib, peça + prop, ligações nas telas, molde.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dado já carregado → tela | contagens do CRM, de pacientes_periodo, do diário e da Meta que a tela já tem em memória viram desenho; nada novo cruza a rede |
| tela → médico | o que o funil e a linha afirmam precisa ser honesto (zero medido ≠ sem dado) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-glf-01 | Information disclosure | gaveta do funil (funil-desenhado.tsx) e adaptadores | medium | mitigate | os adaptadores só levam contagens para `detalhe`, `explicacao` e `motivo`; nenhum nome, telefone ou e-mail; a lista de pessoas só abre pelo `abrir(chave)` que pacientes já tem, com a checagem de papel de hoje; o teste tsx confere que o detalhe só tem números |
| T-glf-02 | Tampering (número enganoso) | funil-desenhado.ts | high | mitigate | Falta dado no lugar de barra ou 0; "N de M" abaixo de minimoDaBase via passagem(); sem % entre populações diferentes; maior perda apagada com foraDeOrdem (regra exportada de fatos-comercial, uma só); Atendido de pacientes só com as 3 listas inteiras; contorno do período anterior só com a variação já calculada pela tela; casos cobertos em scripts/test-funil-desenhado.ts |
| T-glf-03 | Tampering (número enganoso) | linha-30-dias.ts | medium | mitigate | dia sem dado quebra a linha (nunca 0); média ignora null; menos de 2 dias não desenha; testes em scripts/test-linha-30-dias.ts |
| T-glf-04 | Denial of service | pacientes, jornada, crm-painel, anúncios | low | mitigate | nenhuma consulta nova (pacientes_periodo do período anterior é proibido: estoura 8 s); adaptadores em useMemo; ouvintes de ponteiro só no SVG, estado só muda com o índice |
| T-glf-05 | Elevation of privilege | papéis e soEquipe | low | accept | nada de papel, menu ou permissão muda; a contagem da aba é só o número que a primeira parte já carregou |
| T-glf-SC | Tampering | npm/pip/cargo installs | high | mitigate | nenhum pacote novo: SVG inline (recharts existe, não é usado aqui); package.json e package-lock.json conferidos sem mudança no fechamento |
</threat_model>

<verification>
- scripts/test-funil-desenhado.ts e scripts/test-linha-30-dias.ts passam; test-leitura-comercial, test-telas-juntadas, test-telas-inventario e test-nexo-system-css passam.
- `npm test`: só as falhas antigas conhecidas.
- `npx tsc --noEmit` (com `npm run routes:generate` antes): só os 4 erros antigos.
- Playwright (`--workers=1`, build de e2e): telas-juntadas (régua de altura de pacientes, crm-painel e jornada nas 2 janelas, mais a contagem nova), comercial-painel, anuncios-painel, instagram-painel.
- package.json, package-lock.json, supabase/, api/ e os arquivos de sync sem mudança; nenhuma `useQuery(` nova em src/routes; anuncios-graficos.tsx, base.tsx, pagina.tsx, blocos.tsx, tipos.ts, portao.ts, texto.ts e adaptadores.ts sem mudança.
</verification>

<success_criteria>
- O funil A2 com os nomes do João está nas 3 telas onde o funil aparecia (Do contato à venda, No CRM, Jornada), substituindo o funil antigo, com Falta dado, "N de M", sem % entre populações diferentes e aviso de fora de ordem.
- As abas Funil e Jornada mostram a contagem de pessoas que viraram lead no período.
- Os cartões com série diária em memória mostram a linha de 30 dias interativa e acessível; os outros não mudaram.
- Toda aba medida continua com no máximo 1218 px a 375x812 e 1350 px a 1440x900.
- Nenhum dado, sync, SQL, migration, endpoint ou pacote novo; leitura só por regra.
</success_criteria>

<output>
Create `.planning/quick/261112-glf-funil-desenhado-e-linha-de-30-dias-nos-c/261112-glf-SUMMARY.md` when done
</output>
