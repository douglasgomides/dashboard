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
