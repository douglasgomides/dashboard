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
- Os textos "Próximo passo", "Ação da semana", "Para consertar:", "Motivo:" e "Quem resolve:" continuam iguais.
- Dentro de uma aba a seta abre os Detalhes da própria página (`id="detalhes-{tela}"`), onde está o número que sustenta o passo.
  Na Hoje ela leva à aba de onde a ação saiu.
- A seta nunca envia nem grava nada (CHAM-07: o botão só abre ou navega).

### f) Topo da Hoje (plano 05)

- Saudação grande ("Boa tarde, Dra. Lana") com o nome em cinza mais claro: `PaginaNexo` aceita a prop opcional `saudacao`; a
  pergunta vira o parágrafo logo abaixo. Sem a prop o HTML é o de sempre.
- Chips de contexto (clínica, data e hora do dado) e chips de estado das fontes com bolinha (âmbar quando o dado tem mais de
  1 dia). O período continua no seletor da casca.
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
