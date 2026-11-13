# Molde da página do Nexo (Phase 03.1)

Este documento é o contrato do molde. A fase 03.1 não tem UI-SPEC própria: o que vale para o desenho de toda tela viva do
Nexo (clínica e equipe) está aqui. O contrato visual de base (cores, fonte, moldura, cartões, movimento) continua sendo o
`03-UI-SPEC.md` da Phase 3; este documento só acrescenta a página, a leitura e as peças de bloco.

Quem escreve e quem lê: o plano 03.1-01 cria o código (`PaginaNexo`, `LeituraDaTela` e as peças de bloco); o 03.1-02
escreve este contrato e o inventário; cada seção (03.1-03 em diante) aplica o molde nas suas telas.

## Regras que valem para a fase inteira

- **A leitura é só regra, calculada na hora; sem IA (João, 10/11).** Nada é guardado, não há tabela nova, migration, job
  agendado nem chamada de IA. A leitura segue o período escolhido na tela e é montada no navegador, a partir do que a tela já
  carrega, por modelos de frase em português leigo.
- **Nenhuma tela sai do menu, nem muda de situação.** O campo `situacao` de `src/lib/registro-de-telas.ts` não é usado
  para decidir o escopo e não é alterado. As telas da fase aparecem por seção e aba (`secoesDaClinica`, `telasPorArea` e
  `indiceDaBusca`).
- **Sem projeção, previsão ou promessa.** A leitura nunca cita "Projeção em 30 dias" nem "meta em risco". "Trouxe X% dos
  contatos" só aparece quando a origem por post está medida, com a cobertura visível; sem isso, a leitura diz "sem leitura:
  origem por post não medida".
- **Nenhum dado pessoal** (nome, telefone, e-mail de paciente) em fato ou na leitura.
- **Nada no banco:** nenhuma mudança em `supabase/`, nenhum arquivo novo em `api/`, nenhum pacote novo.

## SAP congelado e átomos permitidos

O SAP não muda nesta fase. Os arquivos que o SAP alcança pelo grafo de imports estão congelados com o desenho antigo e
nenhum plano os altera, nem para acrescentar um export:

`src/components/sem-fonte.tsx`, `planejador-conteudo.tsx`, `estrategias-ia.tsx`, `agentes-ia.tsx`, `prova-resultado.tsx`,
`operacao-recuperacao.tsx`, `agentes-trabalho.tsx`, `acompanhamento-servico.tsx`, `grafico.tsx`, `plano-semana.tsx`,
`visual.tsx`, `botao-copiar.tsx`, `copiloto-secao.tsx`, `troca-produto.tsx`.

Peças nx e de casca que o SAP também usa (nenhum plano edita): `src/components/nx/base.tsx`, `nx/graficos.tsx`,
`nx/plano-pecas.tsx`, `nx/plano-semana-painel.tsx`, `workspace-ui.tsx`, `avatar-gerado.tsx`, `logout-button.tsx`,
`product-brand.tsx`, `icons/tabler.tsx`.

Uma tela nova não importa bloco de arquivo congelado. Os **átomos** abaixo são a exceção permitida: `InfoDica`, `Ajuda`,
`Miniatura`, `IconeFormato` (de `visual.tsx`) e `BotaoCopiar`. Hooks e funções (nome em minúscula, ou começando com `use`)
também podem ser importados.

## Quem edita cada peça compartilhada

`src/components/nx/pagina.tsx`, `src/components/nx/blocos.tsx`, `src/lib/leitura/tipos.ts`, `portao.ts`, `texto.ts` e
`adaptadores.ts` só mudam no 03.1-01 e no 03.1-17. Uma seção que precise de mudança nelas registra o desvio no SUMMARY dela e
resolve no próprio arquivo da área.

## Ordem fixa da página

1. Cabeçalho: rótulo da tela, pergunta, chip da decisão (quando a tela responde uma).
2. Leitura do período (`LeituraDaTela`).
3. Cartões: de 3 a 4.
4. Principal: um gráfico.
5. Corpo: só em telas de trabalho (formulário, quadro, fila, lista).
6. Detalhe: dentro de "Detalhes", fechado.

Sem `children` livres: cada peça entra pela prop do seu lugar.

## `PaginaNexo`

Props:

| Prop | Tipo | Regra |
|---|---|---|
| `tela` | `TelaId` | um dos 45 ids (43 rotas; `/ideias` tem 3 visões: `ideias-roteiros`, `ideias-semana`, `ideias-encontrar`) |
| `titulo` | `string` | o rótulo do registro |
| `pergunta` | `string` | até 80 caracteres e termina em "?" |
| `decisao?` | `DecisaoMedico` | só quando a tela serve a uma das decisões D1 a D5 |
| `meta?` | `ReactNode` | em geral o rótulo do período |
| `acao?` | `ReactNode` | botão da página (por exemplo, Atualizar) |
| `leitura` | `ReactNode` | sempre `LeituraDaTela` |
| `cartoes?` | `readonly [ReactNode, ReactNode?, ReactNode?, ReactNode?]` | no máximo 4, garantido pelo tipo |
| `principal?` | `ReactNode` | um gráfico nx |
| `corpo?` | `ReactNode` | telas de trabalho: formulário, quadro, fila, lista |
| `detalhe?` | `ReactNode` | vai dentro de `NxRecolhido` "Detalhes", fechado |

Classes: `nx-pagina`, `nx-pagina__topo`, `nx-pagina__cartoes`, `nx-pagina__principal`, `nx-pagina__corpo`,
`nx-pagina__detalhe`. Atributo `data-tela` com o id da tela.

Cabeçalho: rótulo da tela em 14/500 `var(--muted-ink)`; `h1` com a pergunta em 24/500 `var(--text)`; chip da decisão.
Rótulos das decisões (`ROTULO_DECISAO`):

| Id | Rótulo |
|---|---|
| D1 | Onde perco paciente |
| D2 | Quem chamar hoje |
| D3 | O que trouxe paciente que fechou |
| D4 | Estou no ritmo da meta |
| D5 | O que fazer esta semana |

D2 não é usado nesta fase.

## `LeituraDaTela`

Props: `fatos: FatosDaTela | null`, `carregando: boolean`, `erro?: string | null`, `semSelo?: boolean`,
`resumo?: TextoDoResumo`, `id?: string`.

Textos fixos:

- Título: **Leitura do período** (ou "Situação de hoje" quando `fatos.tipoPeriodo` é "hoje", ou "Resumo da clínica" no modo
  resumo).
- Subtítulo: "dd/mm a dd/mm, comparado com dd/mm a dd/mm"; sem período anterior: "dd/mm a dd/mm".
- Linhas: "O que aconteceu", "Por quê", "Próximo passo". No modo resumo: "O que aconteceu", "O que mais preocupa", "Ação da semana".
- Responsável: "Quem resolve: {ROTULO_RESPONSAVEL}". Motivo do passo: "Motivo: {motivo}".
- Mais passos: `details` com "Ver mais ({n})".
- Sem leitura: "Sem leitura: {motivo}", "Para consertar: {passo}", "Quem resolve: {responsável}".
- Carregando: esqueleto e, depois de 3 s, "Calculando, clínica grande leva até 30 s".
- Erro: "Não deu para montar a leitura agora." e "Isso não quer dizer que o número é zero."
- Fatos nulo sem carregar: "Sem leitura: não há dado neste período.", "Para consertar: Conferir a conexão das fontes.",
  "Quem resolve: Equipe Doctor Creator".
- Chip "sem selo" ao lado do título quando `semSelo` (**PROVISÓRIO** até a resposta do João no 03.1-03).

Número ao lado de cada afirmação: cada `Numeral.exibicao` em `strong.nx-leitura__num` logo depois da frase, com
`tabular-nums`. O sinal (subiu, caiu, atenção) é pela forma e leva `aria-hidden`. A seção usa `aria-labelledby` no `h2`;
texto de 14 px ou mais; `summary` com 44 px; só tokens; animação só sob `prefers-reduced-motion: no-preference`.

### Verbos do próximo passo (D-10)

Lista **PROVISÓRIA** (decisão do João em 10/11; a decisão aberta 9 do brief continua dele): ligar para, responder, revisar,
pausar, reforçar, corrigir, publicar, conferir. No código ela é `VERBOS_PROVISORIOS`, marcada como PROVISÓRIA.

Cada tela traz um próximo passo só (D-05), com o motivo e quem resolve; os outros ficam em "Ver mais".

### Honestidade (D-03)

Com dado incompleto ou não confiável a leitura diz o problema e para. O portão (`portaoDoPeriodo`) decide antes de qualquer
conclusão, nesta ordem: falta de dado, fonte parada, rastreio suspeito, selo ilegível, funil fora de ordem, erro de dado na
origem e amostra menor que `LIMITES.leitura.grupoMinimo` (5).

### Linguagem (D-04)

Para o médico, em português leigo: sem jargão (CTR, CPC, CPM, CPL, ROAS, lead), frases curtas no passado, número ao lado. Os
termos técnicos ficam só nas tabelas de detalhe.

## Peças de bloco (`src/components/nx/blocos.tsx`)

Uma vez só no sistema; cada uma leva `data-peca`.

| Peça | Props | Observação |
|---|---|---|
| `NxVazio` | `titulo`, `falta`, `quem?: Responsavel`, `passo?`, `acao?`, `emConstrucao?` | "O que falta:", "Quem resolve:", chip "Em construção" |
| `NxAviso` | `tom: "critico" \| "atencao" \| "info"`, `titulo`, `children?`, `detalhe?` | aviso curto |
| `NxRecolhido` | `titulo`, `resumo?`, `id?`, `aberto?`, `children` | `details` fechado, `summary` com 44 px |
| `NxTabela` | `rotulo`, `colunas: { chave; titulo; numerica? }[]`, `linhas`, `vazio?`, `chaveDaLinha?` | cabeçalho fixo, rolagem horizontal só dentro do bloco, números à direita com `tabular-nums`, `caption` oculta |
| `NxCarregando` | `texto?`, `linhas?` | mensagem de 3 s |
| `NxErro` | `texto`, `onTentar?` | "Isso não quer dizer que o número é zero.", botão "Tentar de novo" de 44 px |

## Cartões, principal e detalhe

- Cartões: 3 a 4 `NxKpi`. Número sem dado é "Sem dado", nunca 0.
- Principal: um gráfico nx. `NxPizza` e `NxMedidor` são permitidos (revogação de 09/11), mas **só no detalhe**; rosca não.
- Cartões de projeção e "meta em risco": ficam esperando a resposta do João no 03.1-03 e a leitura nunca os cita.
- Termos técnicos só no detalhe.

## Tokens e tamanhos

- Só variáveis (`var(--b1)`, `var(--line)`, `var(--muted-ink)`, `var(--text)` etc.), nenhum hex solto; as folhas novas são
  `src/styles/nexo-pagina.css` e `src/styles/nexo-blocos.css`. `scripts/test-nexo-system-css.ts` confere.
- Espaçamento: 4 / 8 / 12 / 16 / 24 / 32.
- Texto de 14 px ou mais. Alvo de toque de 44 px ou mais.
- Animação só dentro de `@media (prefers-reduced-motion: no-preference)`.
- Fonte Urbanist, corpo 400, títulos 500; `font-variant-numeric: tabular-nums` em número de coluna.

## O inventário (formato)

O inventário fica em `docs/redesenho/inventario/`, 11 arquivos, um por plano de seção. Cada um tem duas tabelas.

Tabela `## Telas`, uma linha por rota viva da fase (43 no total):

```
| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
```

- **Rota**: o `routeId` do registro, sem crase.
- **Estado**: `pendente` ou `novo`. Uma tela só vira `novo` quando a rota usa `<PaginaNexo` e `<LeituraDaTela`, nenhum bloco
  antigo é alcançado pelo fecho de imports e todo cartão tem "Depois".
- **Pergunta**: termina em "?" e tem até 80 caracteres (obrigatório para `novo`).
- **Conferido**: data `dd/mm/aaaa` (obrigatório para `novo`).
- **Exceção**: vazia, ou `arquivo.tsx — motivo` (motivo com 20 caracteres ou mais); tira só aquele arquivo do fecho.

Tabela `## Cartões e blocos`, uma linha por cartão ou bloco de cada tela:

```
| Rota | Card ou bloco | Antes | Depois | Plano |
```

Toda tela tem pelo menos uma linha de cartão. Na rota `/ideias`, cada cartão leva o prefixo da visão ("Revisar roteiros:",
"Planejar a semana:", "Encontrar ideias:").

`scripts/test-telas-inventario.ts` roda no `npm test`. Falha quando: uma tela do registro fica sem linha; há linha a mais;
tela sem linha de cartão; tela `novo` cuja rota não usa `PaginaNexo` e `LeituraDaTela`, que ainda alcança bloco antigo
pelo fecho de imports ou que tem cartão sem "Depois". A constante `EXIGIR_TODAS_NOVAS` começa `false`; o 03.1-17 troca para
`true` (nenhuma linha pendente).

## Telas juntadas, abas e a Hoje (03.1.1)

Regras da fase 03.1.1 (referência visual aprovada pelo João em 10/11/2026, D-07, mais o mecanismo de abas e a régua de altura
emendada). Os planos 03.1-07 a 03.1-17, ao serem revistos, herdam tudo isto. Nada acima foi apagado.

### a) Como a tela juntada funciona (D-04 emendado)

- Tela juntada é uma lista de abas no registro (`SECOES_JUNTADAS`, em `src/lib/registro-de-telas.ts`). Cada aba é o caminho da
  tela antiga: o endereço antigo já é a aba, sem redirecionar, e a aba escolhida fica no endereço.
- O log por rota guarda só o `routeId` da tela aberta (o que vem depois do `?` nunca chega a ele). Como a aba é o caminho antigo,
  o log grava aba por aba sem migration. Um `?aba=` não chegaria ao log.
- A pasta é desenhada pela casca (`TelaJuntada`, em `src/components/nx/abas-em-pasta.tsx`), nunca pela tela. Juntar nunca empilha
  duas telas: cada aba abre uma tela só, no molde.

### b) Régua de altura (D-04 e MEDV-04 emendados)

- Com o detalhe fechado, a aba aberta mede no máximo 1,5 vez a altura da janela em 375x812 e em 1440x900.
- É teste para as abas das 3 telas juntadas do médico (Instagram, Onde os pacientes travam, De onde vêm os pacientes) e para a
  Hoje. As abas da equipe ficam medidas e registradas e viram teste quando o plano 03.1 de cada uma a puser no molde: quem fizer
  isso acrescenta a aba à asserção de `tests/e2e/telas-juntadas.spec.ts`.
- Como medir: `alturaDaAbaAberta`, em `tests/e2e/apoio-telas-juntadas.ts`, mede o elemento `[data-juntada]` (faixa de abas mais o
  corpo da aba) e só vale com a leitura carregada e todo `details` fechado. A medida não passa à toa com a tela vazia: tela que
  depende de leitura ao vivo (o Público do Instagram) precisa do mock do dado (`mockAudiencia`).
- Para encurtar sem apagar nada: o que não é o trabalho da tela vai para o detalhe recolhido ou para o filtro segmentado, nunca
  se apaga informação. Nas 4 abas do Instagram foi assim: o gráfico da distância entre os primeiros (Destaques), o ranking de
  posts (Posts) e a cobertura em ordem da contagem de seguidores (Desempenho) foram para os Detalhes; o que pede atenção
  (cobertura abaixo de 60%, estimativa não calculada) continua à vista.
- No celular (até 560 px) o molde fica mais compacto sem tirar nada: o botão da tela sobe para a linha do rótulo; o sinal da
  leitura (▲ ▼ ! ●) fica ao lado do rótulo; os cartões viram uma fileira que rola sozinha (a página não rola na horizontal);
  a vitrine de posts também; os gráficos ficam mais baixos; o cartão do corpo perde a moldura própria dentro da pasta. Espaços
  só em 8, 12 e 16. Tela nova no molde ganha isto de graça; quem montar peça nova precisa deixá-la caber nessa fileira.

### c) Abas e níveis (D-07)

- Aba ativa branca, encaixada no corpo da pasta, sem borda entre os dois; as outras abas são pílulas translúcidas.
- Contagem em cinza ao lado do rótulo, publicada pela própria aba, sem consulta nova. Aba contável sem número mostra "—", nunca
  "0", porque zero medido é diferente de não medido.
- Três níveis, três desenhos: seção (menu), aba em pasta (tela juntada) e filtro segmentado dentro do cartão (pílula preta no
  escolhido, com a contagem em cinza). Dois níveis nunca usam o mesmo desenho.

### d) Cartões (D-07)

- Cabeçalho: ícone num círculo, título e subtítulo curto com o número de contexto ("Semana · 28 de 34 agendamentos").
- Botão redondo ↗ no canto só quando o cartão abre outro lugar (é isso que mantém a Hoje curta: o cartão resume e o ↗ leva ao
  detalhe).
- Número grande com a legenda embaixo. A variação vai numa pílula azul-clara ("−18% vs período anterior"), sem cor de "bom" ou
  "ruim" que a regra não sustente; a seta mostra só a direção.
- No máximo uma ação por cartão, em pílula com a seta escura.
- Tela que monta cartão novo usa `NxCartaoNumero` (`src/components/nx/cartoes.tsx`). Os `NxKpi` já existentes dentro de
  `.nx-pagina` herdam o ícone redondo e a pílula azul-clara pelo CSS de `src/styles/nexo-pagina.css`, porque `base.tsx` é
  congelado (o SAP usa) e a herança só vale dentro de `.nx-pagina`, que nenhuma tela do SAP usa.

### e) Leitura (D-07)

- O próximo passo, a "Ação da semana" do resumo e o "Para consertar" da leitura sem dado são a pílula de ação: pílula azul-clara
  com o verbo e o número, mais o botão redondo escuro com a seta (`NxAcaoPilula`).
- Os textos "Próximo passo", "Falta dado:", "Próximo passo para resolver:", "Motivo:" e "Quem resolve:" valem (12/11/2026: "Ação da
  semana" virou "Próximo passo", "Sem leitura:" virou "Falta dado:" e "Para consertar:" virou "Próximo passo para resolver:"; veja
  "Menos texto" abaixo).
- Dentro de uma aba a seta abre os Detalhes da própria página (`id="detalhes-{tela}"`), onde está o número que sustenta o passo.
  Na Hoje ela leva à aba de onde a ação saiu.
- A seta nunca envia nem grava nada (CHAM-07: o botão só abre ou navega).

### f) Topo da Hoje (plano 05)

- Saudação grande ("Boa tarde, Dra. Lana") com o nome em cinza mais claro: `PaginaNexo` aceita a prop opcional `saudacao`; com ela o
  topo tem um título só (sem o rótulo da tela e sem a etiqueta da decisão) e a pergunta fica só para leitor de tela. Sem a prop o
  HTML é o de sempre. Logo abaixo, o número grande "N ações esta semana" (`destaqueDoTopo`).
- Chips de contexto (data e hora do dado, sem o nome da clínica, que já está na casca) e chips de estado das fontes com bolinha
  (âmbar quando o dado tem mais de 1 dia). O "sem selo" é uma bolinha cinza que abre a frase (`NxChip ponto`). O período continua
  no seletor da casca.
- Cartão "Próximo" com degradê suave de tokens e botão escuro, com a ação de maior impacto da semana.

### g) Detalhes pequenos (D-07)

- Laranja (`var(--or)`) para abaixo da meta ou não confirmado; o texto diz "abaixo da meta" ou "não confirmado", a cor só reforça.
- Listrado para o que faltou, com o texto "Sem dado" (nunca 0).
- Linha tracejada para a meta, numa barra de 8 px, com o rótulo da meta.
- Contagem em cinza ao lado de cada rótulo e hora do dado ao lado do estado.
- Só entram onde o dado sustenta: nenhum lugar ganha cor que a regra não sustenta (`.nx-abaixo-da-meta`, `.nx-faltou` e
  `.nx-meta-tracejada` em `src/styles/nexo-cartoes.css`).

### h) Limites

- Só tokens nx. A paleta é a decisão aberta 4 do João e não muda aqui.
- Nada abaixo de peso 500 (os números grandes ficam em 500 ou mais).
- Nada disto pode estourar a régua de 1,5 tela.

### i) Menos texto (12/11/2026)

Pedido do João: "acho ela hoje pouco visual ainda, muito texto; as informações devem entrar facilmente no cérebro". Regras para os
planos da 03.1 herdarem:

- **Topo de título único na Hoje:** a saudação grande e o número "N ações esta semana"; nada de rótulo, pergunta visível, etiqueta da
  decisão ou chip da clínica.
- **Número antes do texto:** em todo cartão e no Próximo passo a ordem é o número (manchete), a legenda, as barras, o "Ver números" e
  só então a ação.
- **Legenda de uma frase e até 90 caracteres** (`MAX_CARACTERES_DA_LEGENDA`): o que passa disso vai inteiro para o "Ver números"; a
  regra nunca corta no meio de palavra.
- **Barras de comparação (`NxBarras`):** a regra calcula a proporção (`Fato.comparacao`, `fracao` de 0 a 1) e a peça só desenha. Cada
  linha tem nome acessível próprio ("Post de foto: 1.230 pessoas"), nunca "% atingido"; o que faltou é listrado. Na leitura, com
  barras, o número técnico longo sai da linha (fica nos Detalhes).
- **Marca de tom com sinal:** cada ação da Hoje mostra o tom que a regra já calcula (▲ bom, ! atenção, ▼ ruim, ● neutro), com cor e
  com o nome do tom para leitor de tela (`MarcaDoTom`). Nunca só a cor.
- **Quem resolve em chip** com o nome ("Social media"); o rótulo "Quem resolve:" fica só para leitor de tela.
- **Um nome por coisa:** "Próximo passo" (resumo, leituras e Hoje), "Post de foto", "Falta dado: motivo" e "Próximo passo para
  resolver:". Nada de "mediano", "taxa de salvamento" nem "÷" no texto do médico.
- **Bolinhas no carrossel do celular:** uma por cartão, a do cartão à vista marcada (`nx-pagina__pontos`, só no celular).

### j) Funil desenhado e linha de 30 dias (12/11/2026)

O João aprovou os sketches 001 (variante A2) e 002 (variante A). Regras para os planos da 03.1 herdarem:

- **Nomes do João (D-06, só os nomes):** Conversou · Virou lead · Atendido · Agendou · Fechou (`NOMES_DO_FUNIL`). Valem no funil
  desenhado; a leitura mantém os nomes dela porque o filtro de jargão (`texto.ts`) proíbe "lead" no texto da leitura.
- **Largura:** escala de raiz com mínimo de 8% (`larguraDaEtapa`); valor 0 e sem valor dão o mínimo. O número escrito é sempre o real.
- **Ligação em trapézio** entre as faixas, com "N% passam"; abaixo do mínimo de base (`LIMITES.funil`) a pílula diz "N de M", nunca %.
  Etapas que contam populações diferentes (pessoas contra cards do CRM, pacientes antigos contra pessoas novas) não ganham %: a ligação
  é uma faixa reta e neutra, sem pílula, e a explicação vai para a gaveta.
- **Maior perda** em vermelho com ▼ (pílula "▼ Maior perda: X → Y (N% passam) ↗" que abre a etapa de chegada) só quando a regra aponta
  e o funil não está fora de ordem. Qualquer ligação com taxa acima de 1 liga o aviso de fora de ordem e apaga a maior perda.
- **Contorno tracejado e ▲/▼** só com o período anterior já em memória (em Do contato à venda, pelo diário). Nenhuma consulta nova:
  o período anterior de pessoas únicas continua proibido (estoura 8 s). Sem período anterior, sem contorno.
- **Falta dado:** etapa sem medida vira o toco cinza listrado "Falta dado" com "—" no número, nunca barra nem 0; as ligações vizinhas
  ficam neutras e a gaveta diz o motivo.
- **Gaveta** em `<dialog>` nativo (`showModal`): folha presa embaixo no celular, centrada no desktop; Esc e clique no fundo fecham e o
  foco volta para a etapa. Mostra só contagens (nenhum nome, telefone ou e-mail) e aceita uma ação da tela ("Ver quem são").
- **Jornada:** as faixas começam em Conversou; Alcance, Engajamento e Comentário ou direct ficam na faixa "Antes da conversa" (chips de
  uma linha), porque o alcance achataria as 5 etapas do comercial no mínimo mesmo na escala de raiz. A lista de 7 etapas com o que
  falta medir continua nos Detalhes.
- **Contagem das abas Funil e Jornada:** pessoas que viraram lead no período, lida de `pacientes_periodo` sem consulta nova; zero e
  erro mostram "—".
- **Linha de 30 dias** (`NxLinhaDe30Dias`, prop opcional `serie` de `NxCartaoNumero`): só em cartão cuja série diária já está em
  memória. Dia sem dado é buraco (a linha quebra, nunca desce a zero) e a média ignora o buraco; média tracejada; dica "dia: valor" ao
  passar o dedo ou o mouse; o toque fixa "dia: valor · ▲/▼ N% vs média do mês". O gráfico é um slider de teclado (setas, Home, End,
  Enter) e o conjunto tem resumo para leitor de tela. Menos de 2 dias com valor: não desenha.
- **"média do mês"** com 28 a 31 dias; senão "média do período".
- **Régua de 1,5 tela:** continua valendo (1218 px a 375x812, 1350 px a 1440x900). Para caber, a faixa é de 38 px e a ligação de 18 px
  no desktop (22 px e 8 px até 560 px) e a legenda do contorno fica na linha da pílula da maior perda.

### Grupos da equipe

Plano 03.1.1-08 (D-02 com a emenda de 11/11/2026, quando o João tirou do Nexo os grupos Plano e Agentes, Estratégias e campanhas,
Automações e Brand Brain). Sob Clínica a equipe vê 9 seções, nesta ordem: O que fazer hoje, Resultados da clínica, Onde os
pacientes travam, De onde vêm os pacientes, Instagram, Relatório do período, Conteúdo, Atendimento e Configurar CRM. As 6
primeiras são as telas do médico (3 telas únicas e 3 telas juntadas); as 3 últimas são os grupos da equipe e moram em
`SECOES_JUNTADAS` com `publico: "equipe"`.

- **Conteúdo:** Criativa (`/inteligencia-criativa`), Referências (`/inspiracao`), Dúvidas (`/duvidas`), Ideias (`/ideias`).
- **Atendimento:** Qualidade (`/atendimento`), Central (`/central-atendimento`), Contatos (`/crm-contatos`).
- **Configurar CRM:** Guia (`/crm-guia`), Papel do funil (`/analisar`), Etapas (`/crm-estrutura`).
- **Por que Ideias está em Conteúdo:** `/ideias` (Encontrar ideias e, em `?visao=semana`, Planejar a semana) continua tela depois de
  11/11 e precisava de um lugar (nada some). Entrou como a aba Ideias, no lugar de Campanhas, que saiu. O João confirma no
  checkpoint do 08.
- **Continuam onde estão** (itens Carteira e Conferência e fontes, mais a busca): Carteira, Integrações, Conferência de dados,
  Configurar este cliente, Caixa de entrada, Referência entre clientes, Relatórios da semana, Equipe e Assistentes de IA.
- **Saíram em 11/11/2026** e não aparecem em nenhuma seção (só redirecionam): Plano da semana, Prioridades da equipe, Oportunidades
  de melhoria, Reuniões, Agentes e entregas, Estratégias e campanhas, Automações, Central de Agentes e Brand Brain.
- **Quem vê o quê:** a seção do médico a equipe vê inteira (a equipe vê pelo menos o que o médico vê), só com o filtro de fonte que a
  pasta já aplica a todos. O grupo da equipe só existe para admin e estrategista, sem filtro de fonte (a equipe abre toda tela em
  qualquer clínica), e a parte `somenteAdmin` (Criativa, Etapas) só para admin. O médico que abre `/duvidas` por link vê a tela sem a
  pasta; nenhum grupo da equipe é item do menu do médico.
- **Título da tela:** nos grupos da equipe a casca mantém o título e a descrição da tela antiga ("Qualidade do atendimento"), e a
  pasta diz o grupo ("Abas de Atendimento"). Só as 3 telas juntadas do médico trocam o título pelo da tela juntada.
- **Busca da equipe:** acha a aba pelo nome antigo e também pelo nome da seção e da aba, e o apoio do resultado diz onde ela mora
  ("Onde os pacientes travam › Funil", "Atendimento › Contatos"). "Ver todas as telas" continua agrupado pelas áreas antigas.

#### Quem põe cada aba da equipe no molde

Cada aba abre hoje a tela antiga como ela é, sem contagem. A altura de cada uma está medida e registrada em
`test-results/alturas-equipe-03.1.1.json` (aba, rota, largura, altura, janela, razão), nas 2 janelas de `TELAS_DE_MEDIDA`; o arquivo é
gerado por `tests/e2e/telas-juntadas.spec.ts` e não é versionado. A medida não tem limite. Quem pôr a tela no molde, no plano 03.1
indicado (revisto antes de rodar), troca a anotação da aba por asserção de no máximo 1,5 tela com o detalhe fechado em
`tests/e2e/telas-juntadas.spec.ts` (com `alturaDaAbaAberta`, o mock do dado da tela e a leitura carregada) e passa a publicar a contagem da
aba (`usePublicarContagem`, `contagem` no registro).

| Aba da equipe | Tela antiga | Plano 03.1 (revisto) | Obrigação do plano |
| --- | --- | --- | --- |
| Conteúdo › Criativa | Inteligência Criativa (`/inteligencia-criativa`) | 03.1-09 | molde, contagem e asserção de altura da aba |
| Conteúdo › Referências | Referências salvas (`/inspiracao`) | 03.1-09 | molde, contagem e asserção de altura da aba |
| Conteúdo › Dúvidas | Dúvidas do público (`/duvidas`) | 03.1-09 | molde, contagem e asserção de altura da aba |
| Conteúdo › Ideias | Encontrar ideias e Planejar a semana (`/ideias`) | 03.1-09 | molde nas 2 visões, contagem e asserção de altura da aba |
| Atendimento › Qualidade | Qualidade do atendimento (`/atendimento`) | 03.1-12 | molde, contagem e asserção de altura da aba |
| Atendimento › Central | Central de atendimento (`/central-atendimento`) | 03.1-12 | molde, contagem e asserção de altura da aba |
| Atendimento › Contatos | Contatos e oportunidades (`/crm-contatos`) | 03.1-10 | molde, contagem e asserção de altura da aba |
| Configurar CRM › Guia | Guia de organização do CRM (`/crm-guia`) | 03.1-10 | molde, contagem e asserção de altura da aba |
| Configurar CRM › Papel do funil | Papel de cada funil (`/analisar`) | 03.1-10 | molde, contagem e asserção de altura da aba |
| Configurar CRM › Etapas | Etapas do CRM (`/crm-estrutura`) | 03.1-10 | molde, contagem e asserção de altura da aba |

Efeito do agrupamento nos planos pausados, para rever antes de rodar: 03.1-07 (Estratégias e campanhas saiu; fica o desenho nx dos
componentes de anúncio), 03.1-09 (Criativa, Referências, Dúvidas e Ideias no grupo Conteúdo; Revisar roteiros saiu), 03.1-10 (Guia,
Papel do funil e Etapas no grupo Configurar CRM; Contatos no grupo Atendimento), 03.1-11 (sobra só o Relatório, que continua tela
única), 03.1-12 (Qualidade e Central de atendimento no grupo Atendimento), 03.1-13 e 03.1-14 (sem mudança), 03.1-15 (Central de
Agentes e Brand Brain saíram; as outras telas da busca sem mudança), 03.1-16 (a faixa antiga de abas da seção e o CSS `.nx-abas`
ficam sem uso e podem sair) e 03.1-17 (inventário estrito com a Hoje, specs cruzados e asserção de altura das abas da equipe que já
estiverem no molde).

### k) Nada cortado (12/11/2026)

Passada de leitura pedida pelo João (prints a 1440 px com o menu lateral aberto): nada cortado, nada espremido. As regras abaixo valem
para toda tela que os planos da 03.1 ainda vão pôr no molde.

- Texto que não cabe é cortado com reticências (uma linha, ou `-webkit-line-clamp` de 2 linhas) e o texto inteiro vai no `title`.
  Nunca corta sem reticências e nunca esconde sem o texto inteiro à mão.
- @ do Instagram, data e número nunca quebram no meio: `white-space: nowrap` e, se não couber, reticências com `title`. O nome da
  pessoa pode ocupar 2 linhas, quebrando só entre palavras (`overflow-wrap: break-word`, nunca `anywhere` nem `break-all`).
- Chip de uma linha só, com o texto num `span` próprio (`adm-chip__texto` na área da equipe) que corta com reticências dentro do
  cartão. A regra de corte tem escopo na folha da área; `.nx-tag` e `nx.css` não mudam (o SAP usa).
- Trilha de grade e filho de flex que contêm texto levam `minmax(0, 1fr)` ou `min-width: 0`: quem precisa de mínimo é o conteúdo, não a
  trilha. Trilha automática cresce até o chip mais largo e o `overflow: hidden` do cartão corta o resto.
- Botão sempre inteiro: se não couber na linha, a linha quebra (as ações descem para uma faixa própria, alinhada à direita) antes de
  o botão encostar na borda do cartão. As quebras da lista olham a largura do cartão (`container-type: inline-size`), não a da
  janela, porque com o menu lateral aberto o cartão é bem menor que a janela.
- Tabela larga rola dentro do bloco, com sombra de rolagem visível (no macOS a barra some), e vira lista de cartões no celular.
- Muitos avisos na mesma linha viram um chip "N alertas" que abre a lista (`details` com `summary` de chip, lista no fluxo da linha,
  nada de posição absoluta), com os mesmos chips e links de antes. A linha da coluna de saúde fica com no máximo 3 itens em linha.
- Tema com acento pela lista de exibição (`temaParaExibir`, de `src/lib/texto-que-cabe.ts`); o valor do filtro e os agrupamentos
  continuam com o texto do banco.
- A checagem automática fica em `tests/e2e/carteira-sem-corte.spec.ts` e `tests/e2e/posts-sem-corte.spec.ts` (função `cortesEm`, que
  devolve em texto o que está cortado). Tela nova do molde copia a função para o seu spec.

### l) Formato 5 segundos (12/11/2026)

Pedido do João depois de ver 8 pilotos em HTML ("melhorou demais", "gostei, segue"): quem bate o olho por 5 segundos numa tela sai sabendo se
está bom ou ruim, por quê e o que fazer. Vale para as 8 telas desta fase (Hoje, Resultados da clínica, Do contato à venda, Atendimento ›
Qualidade, Instagram › Desempenho, Anúncios, Carteira e o Fechamento do mês) e é o contrato que as próximas fases herdam. Nada do que a tela
mostrava antes foi apagado: tudo mora no "Ver tudo" (MEDV-02), com os mesmos números.

**Ordem fixa** (a mesma em toda tela): veredito (uma palavra com sinal e UMA frase com o número grande) → até 3 números (cada um com ▲ ▼ ou =
contra o período anterior da própria clínica e a linha de 30 dias) → uma prova visual grande → de 3 a 5 descobertas (frase curta, uma ação
que só navega e um "Por quê?" que abre de 2 a 3 fatores em barra) → "Ver tudo" fechado no fim, com a leitura de antes e todo o resto.

**`PaginaNexo`:** ganhou 3 props opcionais, `veredito`, `descobertas` e `resumoDoVerTudo`. Com `veredito` a ordem é cabeçalho, veredito,
cartões, `principal` (a prova), descobertas, `corpo` e o "Ver tudo" (`id` `detalhes-{tela}`, a `leitura` primeiro e depois o `detalhe`).
Sem `veredito` a página é a de sempre: nenhuma outra tela mudou.

**Peças** (todas só apresentação: nenhuma busca, grave ou envie; todo texto sai como texto do React, nunca HTML):

- `NxVeredito` (`data-peca="veredito"`): quando o portão nega, mostra os mesmos textos honestos da leitura ("Falta dado: motivo", "Próximo
  passo para resolver:", "Quem resolve: ..."), nunca uma conclusão. `NxDescobertas`: cada descoberta tem selo com sinal, quem resolve, UM
  botão que só navega (ou abre um lugar da própria tela) e o "Por quê?" de 2 a 3 barras; o fator que falta é barra listrada com "Falta dado".
  `NxSelo`: sinal e palavra, nunca só a cor. Todas em `src/components/nx/cinco-segundos.tsx`.
- `NxNotaDoDia` e `NxEtapasContraAntes` (Hoje), `NxAneis` e `NxAgoraContraAntes` (Resultados), `NxPessoasNaMesa` (Do contato à venda),
  `NxDiasComFaixa` (Atendimento e o "Por quê?" dos dias de verba baixa), `NxOQueFunciona` (Instagram), `NxReguaDosDias` (Anúncios),
  `NxPainelDaClinica` (Carteira) e `NxHistoriaDoMes` (Fechamento do mês).
- `NxAneis`: o anel é progresso contra o próprio passado aprovado pelo João (anel cheio = igual ao período anterior, volta a mais = acima),
  não é a rosca proibida.

**Regras** (módulos puros, sem React, banco, rede nem IA): `src/lib/leitura/cinco-segundos.ts` (o contrato: `variacaoPropria`,
`checarFraseCinco`, `GUARDA_SEM_COMPARAR_CLINICAS`), `cinco-hoje.ts`, `nota-do-dia.ts`, `cinco-resultados.ts`, `cinco-pacientes.ts`,
`cinco-atendimento.ts`, `cinco-instagram.ts`, `cinco-anuncios.ts` e `entrada-da-hoje.ts` (em `src/lib/leitura/`), mais
`src/lib/faixa-do-normal.ts`, `mapa-dos-posts.ts`, `carteira-urgencia.ts` e `fechamento-do-mes.ts` (em `src/lib/`). A frase de cada tela sai
de uma regra, nunca de texto escrito no componente.

**A nota do dia (D-03, só na Hoje):** nota de 0 a 100 com a palavra (0 a 49 Ruim, 50 a 69 Atenção, 70 a 84 Bom, 85 a 100 Ótimo). Cada fator
compara a clínica com o próprio período anterior: 50 é igual a antes, cada 2% melhor soma 1 ponto, cada 2% pior tira 1, e a nota é a média
dos fatores com dado. Fator sem dado confiável fica de fora e aparece como "Falta dado", nunca como 0. Sempre escrita como regra do Nexo, com
"não garante resultado".

**Nunca comparar clínicas (D-02):** nenhum texto, nota ou ordem de tela da clínica usa outra clínica, média da carteira, mediana ou ranking.
Só vale o período anterior, a faixa do normal, o melhor dia e a tendência da própria clínica. `GUARDA_SEM_COMPARAR_CLINICAS` reprova a frase
que tente, e os testes unitários e os de e2e a conferem no texto visível.

**Sem envio, sem caixa de exemplo, sem projeção (D-04 e D-05):** nenhuma tela desta fase envia, compartilha ou baixa nada (o resumo semanal
no WhatsApp, o "Enviar teste", Compartilhar e o PDF do mês ficam para uma fase própria); o rótulo de cada ação é de navegação, nunca "Avisar"
nem "Enviar". As caixas "EXEMPLO · dado ainda não medido" dos pilotos não foram feitas, e nenhuma frase estima conversa perdida nem projeta
resultado. Só dado medido chega à tela; o que falta é "Falta dado" em cinza com o motivo. O portão do rastreio suspeito dos anúncios fica de
pé: com milhares de cliques no link e só umas poucas conversas contadas o veredito diz "Falta dado" e manda o conserto para o gestor de tráfego, sem culpar a campanha.

**Altura:** o limite não sobe. Com o "Ver tudo" fechado, até 1218 px a 375x812 e 1350 px a 1440x900. Para caber, a escada de compressão é
sempre a mesma: primeiro o desenho (as 3 descobertas lado a lado a partir de 1100 px, botão e "Por quê?" na mesma linha, número e legenda na
mesma linha, cartões sem ícone e sem a linha de 30 dias no celular, cabeçalho só com a pergunta, o botão de sincronizar da equipe descendo
para o "Ver tudo"); depois o texto (o número em jogo sai do cabeçalho da descoberta, as barras do "Por quê?" dizem o mesmo); por último as
descobertas 4 e 5 vão para o "Ver tudo". Nunca se sobe o limite. A asserção de altura de Atendimento › Qualidade mora em
`tests/e2e/cinco-segundos-atendimento.spec.ts`.

**Hoje e a guarda de texto (A-01):** na Hoje a guarda do texto da tela, `GUARDA_DE_TEXTO_DA_TELA_HOJE`, libera só Agendaram e Fecharam (o
João liberou mostrar cada etapa contra o período anterior); a guarda das ações, `GUARDA_DE_TEXTO_DA_HOJE`, e a guarda de número seguem como
estavam.

**Leituras baratas que entraram** (todas só leitura, com `retry` falso e `staleTime` de 5 minutos; a falha de uma só vira "Falta dado" na
própria linha e nunca derruba a tela): as linhas de `ads_resumo` do período e do anterior (Hoje e Resultados, uma linha cada), as linhas do
período anterior de `wts-dia` e `wts-resumo` (Atendimento) e os resultados diários do período para o gargalo depois do anúncio (Anúncios, a
mesma chave de Resultados e da Hoje, no máximo 31 linhas). As demais telas leem só o que já carregavam.

**Conferência de privacidade:** os pilotos têm número e nome de cliente reais e o repositório é público. `scripts/checar-dados-dos-pilotos.mjs`
procura trechos dos pilotos nas linhas novas de um diff (`--pilotos` e `--base`) e tem de dar "0 trechos dos pilotos nas linhas novas". Os
testes usam só dado fictício.

**O que o João decidiu depois do plano (12/11/2026):**

- **A-02:** só estas 8 telas agora. Destaques, Posts, Público, No CRM, Consultas, Vendas, Jornada, Por origem, Links e Conteúdo × Comercial
  mantêm o desenho que têm até uma rodada futura.
- **A-03:** os "Indicadores de mercado" são referências publicadas do setor, não são as nossas clínicas, e podem ficar em Resultados › "Ver
  tudo".
- **A-04:** a "Referência entre clientes" é análise interna só da equipe e fica como está. D-02 vale para as telas da clínica e para a
  ordem da Carteira; a análise interna da equipe pode comparar clientes.

A única pergunta que continua aberta: se "Sem acesso criado" conta como problema nos alertas da Carteira.
