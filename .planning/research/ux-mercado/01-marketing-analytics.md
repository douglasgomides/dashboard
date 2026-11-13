# Pesquisa de mercado — Telas de análise de redes sociais, anúncios e marketing

**Para quê:** descobrir como os melhores painéis de marketing fazem a informação "entrar no cérebro" de primeira, e o que dá pra trazer pro Nexo.
**Data:** 12/11/2026
**Escopo:** Metricool, Iconosquare, Sprout Social, Later, Meta (Business Suite / Gerenciador de Anúncios), Google Analytics 4, Shopify, Stripe, Triple Whale (Moby), Polar Analytics, Databox, Geckoboard/Klipfolio, Mixpanel, Amplitude, HubSpot, RD Station, mLabs, Reportei, Etus.

> **Como ler:** a parte 1 é o resumo de uma página. A parte 2 tem as notas de cada produto com os links. A parte 3 lista o que **não** fazer. A parte 4 junta os links de imagens pra olhar.
>
> **Aviso honesto:** boa parte das informações vem das páginas e da central de ajuda dos próprios fabricantes, que naturalmente puxam a sardinha pro lado deles. Quando a fonte é de terceiros ou não foi confirmada, eu aviso. Alguns sites (Triple Whale) bloquearam a leitura automática. Nesses casos usei os trechos que apareceram na busca.

---

## 1. Resumo: os 10 padrões mais fortes

O que se repete nos produtos que "parecem inteligentes": **eles não mostram mais números, mostram menos números, e cada número vem com uma frase dizendo se é bom ou ruim e por quê.** A tendência de 2026 é clara: Shopify, Triple Whale, Polar, GA4, Amplitude e Mixpanel estão trocando "painel cheio de gráfico" por "lista curta de descobertas + pergunte à IA".

| # | Padrão | Quem faz | Como ficaria no Nexo | Tela |
|---|---|---|---|---|
| 1 | **Faixa de "descobertas do dia" no topo**: no máximo 3 a 5 cartões, ordenados pelo impacto no negócio, que somem quando ficam velhos | Shopify (3 por dia, somem em 24h; 5 no painel de análise), GA4 (cartões de Insights) | Topo da tela com 3 cartões em frases: "Os agendamentos vindos do Instagram subiram 3 semanas seguidas", "O custo por conversa dobrou desde terça". Cada cartão traz um botão **"Ver por quê"**. | Hoje, Resultados |
| 2 | **Selo de tipo na descoberta**: "Em alta", "Em queda", "Melhor desempenho", "Sequência" | Shopify (Trending Up/Down, Top Performers, Streaks) | Cada cartão ganha um selo colorido curto ("Em queda", "Recorde", "3ª semana seguida"). O olho lê o selo antes do texto. | Hoje, Instagram, Anúncios |
| 3 | **Todo número vem com comparação**: vs. período anterior, vs. meta, vs. mercado. Número sozinho não aparece | Geckoboard (regra de design), Stripe (seletor de comparação), Triple Whale, Iconosquare | Cada indicador grande mostra a seta e o "+18% vs. mês passado". Onde der, também "meta: 40 · faltam 6". Número sem comparação some da tela. | Todas |
| 4 | **Comparar com clínicas parecidas (benchmark)** | Iconosquare (setor, últimos 30 dias), Databox (Benchmark Groups), Meta (benchmarks por pares), mLabs (média do mercado) | "Seu custo por conversa é R$ 9; clínicas de dermatologia da carteira pagam R$ 14. Você está entre as 25% melhores." O Nexo já tem várias clínicas, então pode comparar com a própria carteira, de forma anônima. | Anúncios, Instagram, Resultados |
| 5 | **Nota única de 0 a 100 com "o que fazer pra subir"** | Meta (Opportunity Score: cada recomendação mostra quantos pontos vale) | Uma "nota de saúde" por clínica (ex.: 72/100) com a lista "Responder conversas em até 1h: +12 pontos", "Postar 3x por semana: +8". Transforma número em tarefa. Atenção: a Meta avisa que a nota **não** garante resultado. Dizer isso na tela também. | Hoje, Carteira |
| 6 | **Alerta de coisa fora do normal, sem precisar configurar** | GA4 (detecta mudança anormal sozinho), Amplitude (fora da faixa esperada de 99%), Polar e Triple Whale (agente de anomalia) | O Nexo avisa sozinho: "Hoje chegaram 2 conversas; o normal numa terça é 9 a 14". No gráfico, a faixa do "normal" aparece em cinza e o ponto fora dela fica vermelho. | Hoje, Atendimento, Carteira |
| 7 | **"Por quê?" com um clique** (explicar a mudança) | Shopify ("See why" abre o relatório com o Sidekick já carregado), Amplitude (análise de causa), Mixpanel ("por que esta métrica caiu?"), Polar ("@polar why?") | Em cada queda, um botão "Por quê?" que responde em frases: "A queda veio da campanha X (−70%), que parou no dia 3". | Resultados, Anúncios, Funil |
| 8 | **Resumo diário ou semanal escrito, entregue onde a pessoa já está** (WhatsApp, e-mail, Slack) | Polar (resumo do CEO às 7h, em texto e não em tabela), Reportei (envio por WhatsApp), Triple Whale (Moby no Slack, e-mail, celular), GA4 (e-mail por alerta) | Toda segunda às 8h, o médico recebe no WhatsApp: "Semana boa: 14 agendamentos (+4). Seu melhor post foi o Reels sobre melasma. Atenção: 5 leads sem resposta há 2 dias." Com o link pro Nexo. | Hoje (e fora do Nexo) |
| 9 | **Mapa de calor do "melhor horário pra postar"** e "melhor formato" | Metricool (cor mais escura = melhor horário), mLabs (cartões de melhor dia/horário/formato), Later (7 melhores horários no calendário), Iconosquare | Uma grade dia × hora com cores, mais uma frase: "Seus seguidores estão mais ativos terça e quinta, das 19h às 21h. Reels rendem 2,3x mais alcance que fotos." | Instagram |
| 10 | **Funil com o gargalo destacado**, não só as barras | RD Station (visitas → leads → oportunidades → vendas, achar o gargalo), Geckoboard (tabelas só para exceções) | No funil conversou → lead → atendido → agendou → fechou, a etapa com a maior perda fica vermelha com a frase "Aqui você perde mais: 60% dos atendidos não agendam". Logo abaixo, a lista dos leads parados. | Funil/Pacientes, Atendimento |

**Padrões bônus** que valem citar:
- **Fixar métricas** (Triple Whale): cada pessoa fixa no topo as 4 que mais importam. No Nexo, a agência pode escolher as 4 principais de cada clínica.
- **Pergunte em português** (Mixpanel, Triple Whale, HubSpot, Reportei Chat): caixa "Pergunte ao Nexo", que responde com um gráfico mais uma frase. A Mixpanel criou um "modo verificado" porque perguntas iguais davam respostas diferentes, um risco real.
- **Meta com projeção** (Reportei, Databox): "No ritmo atual, você fecha o mês com 38 agendamentos (meta 40)."
- **Previsão tracejada** (Amplitude): linha cheia é o que já aconteceu, linha tracejada é a projeção, e uma faixa sombreada mostra a margem de incerteza.
- **Menos widgets, letra grande** (Geckoboard/Klipfolio para TV): pensar na Carteira como se fosse uma TV na parede da agência.

---

## 2. Notas por produto

### Shopify (admin, Home e Análises) — a referência mais forte em "descobertas"
- **Primeira tela (Home):** cabeçalho com um globo animado das vendas recentes (o fator "uau"), depois uma barra com 4 métricas (sessões, vendas, pedidos, taxa de conversão, dos últimos 30 dias), as tarefas pendentes com contagem ("12 pedidos para enviar") e um feed de cartões (dicas, descobertas, sugestões do Sidekick). [help.shopify.com/manual/shopify-admin/shopify-home](https://help.shopify.com/en/manual/shopify-admin/shopify-home)
- **Cartões de descoberta:** até 3 por dia, que **expiram em 24h**, gerados só para lojas com volume suficiente (média de 10 pedidos por semana). São de três tipos: tendência vs. período anterior, sequência (alta ou queda em períodos seguidos) e mudança no top 5 (produto, região, canal). [mesma fonte](https://help.shopify.com/en/manual/shopify-admin/shopify-home)
- **Painel de análise (abr/2026):** uma faixa no topo com as **5 descobertas mais importantes, ordenadas pelo impacto no negócio**, com os selos "Trending Up", "Trending Down" e "Top Performers". Um exemplo dado: "vendas de clientes recorrentes subiram 8 semanas seguidas, o que pode indicar que vale expandir a fidelidade". O botão **"See why"** abre o relatório com o Sidekick (a IA) ao lado, já com a descoberta carregada, para perguntar "o que faço agora?". [changelog.shopify.com](https://changelog.shopify.com/posts/data-driven-insights-now-appear-on-your-analytics-dashboard)
- **Reformulação de set/2026:** a IA entrou na camada principal da tela, e não num menu separado. [designcompass.org](https://designcompass.org/en/2026/09/28/shopify-redesign-admin-with-sidekick/) · [shopify.com/blog/admin-new-look](https://www.shopify.com/blog/admin-new-look)
- **Reclamações:** lojistas dizem que cada redesenho "enterra" os dados do negócio debaixo de cartões promocionais e de "ações da IA", e reclamam que o seletor de período sumiu do bloco de métricas. [community.shopify.com (1)](https://community.shopify.com/t/any-new-dashboard-updates-yes-we-still-hate-it/240157) · [community.shopify.com (2)](https://community.shopify.com/t/home-page-stats-widget-no-longer-shows-time-period-or-date-selector/637406)
- **Lição pro Nexo:** a descoberta precisa ser **sobre os dados da clínica**, nunca propaganda do próprio Nexo. E é bom ter regra de volume mínimo: sem dados suficientes, não inventar descoberta.

### Google Analytics 4 — cartões de Insights
- Cartões de "Insights e recomendações" aparecem na página inicial, no "Resumo de relatórios" e no "Resumo de publicidade", com um link "Ver todos os insights" para o painel completo. [support.google.com/analytics/answer/9443595](https://support.google.com/analytics/answer/9443595)
- Há dois tipos. Os **automáticos** (a IA detecta mudanças anormais e tendências novas, sem configurar nada) e os **personalizados** (até 50 regras, com a condição "tem anomalia", em que o próprio GA decide o que é anormal, sem a pessoa definir um limite). Os insights personalizados podem ir por e-mail para pessoas escolhidas. [mesma fonte](https://support.google.com/analytics/answer/9443595) · [Detecção de mudança de tendência](https://support.google.com/analytics/answer/12207035)
- **Reclamações (muitas):** interface "nada intuitiva", relatórios difíceis de achar, botões escondidos, o período escolhido se perde ao trocar de relatório e nomes de métricas confusos. A interface foi o problema nº 1 numa pesquisa com leitores. [martech.org (1)](https://martech.org/marketers-are-having-problems-with-the-ga4-user-interface/) · [martech.org (2)](https://martech.org/10-things-you-hate-about-google-analytics-4/) · [searchengineland.com](https://searchengineland.com/why-people-hate-google-analytics-4-user-interface-428994)
- **Lição pro Nexo:** a ideia dos cartões é boa, mas a navegação do GA4 é o exemplo do que não fazer. O período escolhido precisa valer em todas as telas.

### Stripe — painel de pagamentos
- A página inicial tem gráficos de desempenho mais **avisos importantes** (contestações em aberto, verificações pendentes). A pessoa escolhe quais quadros aparecem e em que ordem. [docs.stripe.com/dashboard/basics](https://docs.stripe.com/dashboard/basics)
- Os gráficos têm 3 seletores: período, agrupamento (hora, dia, semana, mês, que se ajusta sozinho conforme o período) e **período de comparação**. [support.stripe.com](https://support.stripe.com/questions/dashboard-home-charts-overview)
- Tem app de celular com **notificações push** de atividade. [docs.stripe.com/dashboard/basics](https://docs.stripe.com/dashboard/basics)
- **Lição pro Nexo:** avisos que exigem ação ficam junto com os números, no topo. O agrupamento muda sozinho conforme o período, para o gráfico nunca ficar com 365 barrinhas.

### Triple Whale (e a IA Moby) — e-commerce
- A **tela Resumo** junta as métricas de todos os canais em quadros que dá pra mover e redimensionar. Passando o mouse, um 📌 **fixa** a métrica na seção do topo. Clicando no quadro, abre um gráfico de barras com a comparação vs. período anterior. [kb.triplewhale.com](https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard) · [Summary Page Setup](https://www.triplewhale.com/university/summary-page-setup)
- **Moby:** disponível em todo painel para "gerar insights a partir dos dados do painel". Cria gráficos a partir de um pedido em texto, com prévia e aprovação. Dá pra conversar com o Moby a partir do Resumo para investigar uma mudança. [kb.triplewhale.com/collections/summary](https://kb.triplewhale.com/en/collections/19645565-summary) · [product updates](https://triplewhale.com/product-updates)
- **Agentes:** o "agente de anomalia de receita" tem limites ajustáveis e manda resumos e recomendações por Slack, e-mail ou celular. [triplewhale.com/moby-agents](https://www.triplewhale.com/moby-agents) · [agências](https://www.triplewhale.com/moby-agents-agencies)
- A empresa defende o "fim da era do painel": a IA corta o ruído e entrega a conclusão. [blog](https://www.triplewhale.com/blog/the-end-of-the-dashboard-era) (bloqueou a leitura automática, então vi só o título e o trecho da busca)
- **Avaliações:** elogios a "painel intuitivo, insights acionáveis" e ao Moby para respostas rápidas. Um concorrente aponta que os gráficos do Moby precisam de várias tentativas e de revisão. [appnavigator.io](https://appnavigator.io/app/triplewhale-1/reviews/) · [thoughtmetric.io](https://thoughtmetric.io/blog/thoughtmetric-s-custom-reports-feature-vs-triple-whale-s-custom-dashboards-feature) (concorrente, então pode ser parcial)

### Polar Analytics — e-commerce, alertas e resumo diário
- **Alertas inteligentes:** a IA aprende o padrão de cada métrica e avisa quando algo sai do normal. Também dá pra criar alerta com valor fixo. O aviso chega na hora, por e-mail ou Slack. [polaranalytics.com/features/smart-alerts](https://www.polaranalytics.com/features/smart-alerts)
- **Resumo do CEO às 7h** mais uma recapitulação semanal: "em vez de números soltos, a IA escreve uma narrativa", com o gráfico em imagem. Na conversa de um alerta, basta responder "@polar why?" para receber a explicação. [polaranalytics.com/slack-ai-agent-for-ecommerce](https://www.polaranalytics.com/slack-ai-agent-for-ecommerce) (fala do fabricante)
- Um usuário elogia os "sinais vitais" diários (tráfego, conversão, pedidos, gasto em anúncios, custo por cliente). [apps.shopify.com/reviews/856387](https://apps.shopify.com/reviews/856387)
- **Lição pro Nexo:** é o modelo exato do "resumo no WhatsApp". Texto primeiro, gráfico como imagem, e o "por quê?" respondido na própria conversa.

### Meta — Gerenciador de Anúncios e Business Suite
- **Opportunity Score (pontuação de oportunidade):** nota de 0 a 100 que mede o quanto a conta segue as boas práticas. Cada recomendação mostra **quantos pontos vale** (um exemplo de terceiros: corrigir a fragmentação do público vale cerca de 35 pontos, ativar os posicionamentos Advantage+ vale 5). Recomendações descartadas vão para outra aba e não contam. A própria Meta diz que a nota **não reflete o desempenho real**. [jonloomer.com/opportunity-score](https://www.jonloomer.com/opportunity-score/) · [ppc.land](https://ppc.land/meta-launches-opportunity-score-globally-for-all-advertisers/) · [developers.facebook.com](https://developers.facebook.com/blog/post/2025/11/10/unlock-peak-performance-with-new-opportunity-score-features-in-the-marketing-api/) · [hunchads (o que ignorar)](https://www.hunchads.com/blog/meta-opportunity-score-what-to-act-on-and-what-to-ignore)
- **Benchmarks por pares:** fica dentro dos Relatórios de anúncios ("Personalized Insights"), mostra conjuntos de anúncios acima e abaixo dos pares e é difícil de achar. [jonloomer.com](https://www.jonloomer.com/meta-ads-benchmarking-for-personalized-insights-on-performance/)
- **Business Suite, Visão geral:** últimos 28 dias, começando por visualizações e seguidores, com comparação ao período anterior. Segundo uma fonte, também traz uma seção para comparar com páginas parecidas. [leadenforce.com](https://leadenforce.com/blog/how-to-use-insights-overview-in-meta-business-suite-for-better-performance) (de terceiros, não confirmado)
- **Lição pro Nexo:** a "nota com pontos por ação" é o jeito mais claro de transformar diagnóstico em tarefa. E o benchmark que a Meta esconde, o Nexo pode mostrar na cara.

### Metricool — redes sociais (muito usado por agências)
- **Mapa de calor do melhor horário:** cada coluna é um dia e cada linha é uma hora, e quanto mais escura a cor, melhor o horário. A conta é feita com base em quando **os seguidores** estão ativos, e não nos posts da própria conta. Continua funcionando mesmo depois de a Meta tirar isso da API em set/2024. [help.metricool.com](https://help.metricool.com/en/article/best-time-to-post-on-social-media-in-metricool-hj3rgj/)
- **Concorrentes:** um painel com até 100 contas concorrentes (crescimento, frequência, engajamento). [metricool.com/landing-ads-social-media-managers](https://metricool.com/landing-ads-social-media-managers/)
- **Elogios:** custo-benefício e profundidade dos dados. **Reclamações:** painel "poluído" quando se gerenciam muitas marcas, curva de aprendizado, relatórios lentos e erros ocasionais nos números. [bloggingwizard.com](https://bloggingwizard.com/metricool-review/) · [capterra.com](https://www.capterra.com/p/203702/Metricool/reviews) · [thecmo.com](https://thecmo.com/tools/metricool-review/)

### Iconosquare — redes sociais
- **Benchmark do setor:** compara engajamento e alcance no Instagram com outros clientes Iconosquare do mesmo setor, nos últimos 30 dias. [support.iconosquare.com/Industry-Benchmarks](https://support.iconosquare.com/Industry-Benchmarks)
- **"Uma", analista de IA**, que "explica por que seus números mudaram". Tem mais de 100 métricas, painéis personalizados, melhor horário e relatórios automáticos com a marca da agência. [iconosquare.com](https://www.iconosquare.com/)
- **Lição pro Nexo:** benchmark com a própria base de clientes é viável e honesto, desde que se diga "comparado com X clínicas da carteira".

### Sprout Social — redes sociais (empresas grandes)
- **Trellis (agente de IA)** transforma semanas de dados em "resumos prontos para a diretoria". O modo "Analyze" cruza posts, escuta social e mensagens da caixa de entrada. [customerthink.com](https://customerthink.com/?p=1083647) · [sproutsocial.com/insights/ai-social-media-assistant](https://sproutsocial.com/insights/ai-social-media-assistant)
- Tem um relatório "Performance Summary" com métricas escolhidas (impressões, engajamento, visualizações de vídeo, compartilhamentos). [sproutsocial.com/social-media-insights](https://sproutsocial.com/social-media-insights/)
- Fala-se de um botão "AI Summary" (✨) no topo da página de análises, com opções de semana, mês e trimestre, mas a fonte é de terceiros e contraditória. **Não confirmado.**

### Later — Instagram
- **Melhor horário:** calcula os **7 melhores horários** a partir dos posts que mais renderam e mostra direto no **calendário semanal**, onde a decisão de postar acontece. [later.com/blog (ciência do melhor horário)](https://later.com/blog/the-science-behind-best-time-to-post-and-how-were-making-it-smarter/)
- Ranking de posts por impressões, engajamento, curtidas, comentários e salvamentos. As análises **não existem no app de celular**, só no computador. [later.com/instagram-analytics](https://later.com/instagram-analytics/)
- **Lição pro Nexo:** a recomendação aparece onde a ação acontece, e não numa tela separada.

### Databox — painéis de KPI
- **Metas** aparecem no painel como medidor ou barra de progresso. **Benchmark Groups:** comparação anônima com empresas parecidas (setor, porte, faturamento), com uma linha de benchmark sobre o gráfico. [help.databox.com](https://help.databox.com/how-do-i-add-benchmarks-to-my-databoards) · [databox.com/databox-benchmark-groups](https://databox.com/databox-benchmark-groups)
- A comunidade usa benchmark mais previsão para definir uma meta "alcançável". [community.databox.com](https://community.databox.com/integration-use-cases/post/how-to-use-benchmarks-and-forecast-to-create-an-achievable-goal-VI0B8K8byiBXiZL)

### Geckoboard / Klipfolio — painéis de TV (referência de "bater o olho")
- Regras do guia da Geckoboard: um **número com comparação ou indicador de status** comunica mais rápido que um gráfico. Linha para tendência. **Nada de pizza, 3D ou gráfico radial.** No máximo um medidor por painel. Poucas barras. **Tabelas só para exceções** (o que está atrasado, parado), nunca para "mostrar tudo". Hierarquia visual clara e números principais agrupados. Rankings e atividade recente funcionam como âncoras visuais. [geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown](https://www.geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown)
- Indicadores de status deixam "imediatamente claro se você está no rumo ou fora dele", mas indicadores demais viram ruído. [geckoboard.com/product/hardware](https://www.geckoboard.com/product/hardware/) · [guia de boas práticas](https://www.geckoboard.com/learn/guides/data-dashboards-best-practices)
- Klipfolio: fazer uma versão própria para TV, só com o essencial e com zoom de 150% a 175%. [klipfolio.com/blog/tv-dashboard-setup](https://www.klipfolio.com/blog/tv-dashboard-setup)

### Amplitude — análise de produto
- **Anomalia e previsão:** marca como anomalia o ponto fora da faixa de 99% esperada pelo histórico. A previsão aparece como **linha tracejada** com faixa de confiança, e o realizado como linha cheia. A **análise de causa** classifica o que mais contribuiu para a mudança. A IA responde "o que está causando esta anomalia?". [amplitude.com/docs/analytics/anomaly-forecast](https://amplitude.com/docs/en/analytics/anomaly-forecast) · [blog](https://www.amplitude.com/blog/ask-ai-these-three-questions)

### Mixpanel — análise de produto
- O **Spark** (hoje "Mixpanel Agent") recebe uma pergunta em texto e devolve o relatório com o gráfico pronto, que pode ser salvo no painel ou refinado com mais perguntas. Tem um **"modo verificado"** porque perguntas iguais davam respostas diferentes. "Por que esta métrica caiu?" leva a uma explicação estruturada. [mixpanel.com/blog/spark](https://mixpanel.com/blog/spark-bringing-generative-ai-to-mixpanel/) · [docs.mixpanel.com/guides/mixpanel-agent](https://docs.mixpanel.com/guides/mixpanel-agent)

### HubSpot — CRM e marketing
- O ícone da Breeze (a IA) sobre qualquer relatório **"descobre insights"**: gráfico mais um resumo em texto simples das mudanças e do que as causou. Também cria relatórios a partir de texto. [knowledge.hubspot.com (resumir com Breeze)](https://knowledge.hubspot.com/ai/summarize-and-review-data-with-breeze-assistant?data=data) · [criar relatórios com IA](https://knowledge.hubspot.com/reports/create-reports-using-ai?rd=1)
- **Lição pro Nexo:** um botão "✨ Explicar" em cada gráfico, que devolve 2 ou 3 frases.

### RD Station Marketing (Brasil)
- Os painéis prontos incluem **"Funil de Marketing e Vendas"** (visitas → conversões/leads → oportunidades → vendas), com as taxas entre etapas. O argumento é **achar o gargalo**: "muitas visitas e poucos leads". Faz parte dos planos Pro e Advanced. [rdstation.com/produtos/marketing/analises/dashboards-personalizados](https://www.rdstation.com/produtos/marketing/analises/dashboards-personalizados/) · [demonstração de análise do funil](https://www.rdstation.com/demonstracao/marketing/analise-marketing-avancada/) · [rdstation.com/marketing](https://www.rdstation.com/marketing/)

### mLabs (Brasil)
- O relatório de Instagram tem **cartões de melhor dia/horário e de melhor formato**, perfil dos seguidores, ranking de posts e stories, hashtags dos posts com mais alcance e comparação com até 5 concorrentes. Uma **análise com IA compara o perfil com a média do mercado**. Há também envio recorrente por e-mail e portal para o cliente. [mlabs.com.br/gerenciador-instagram/relatorios-do-instagram](https://mlabs.com.br/gerenciador-instagram/relatorios-do-instagram)
- O botão "Melhores horários – IA" fica no agendador e usa o perfil, o segmento e os concorrentes. [mlabs.com.br/ferramenta-analise-concorrentes](https://mlabs.com.br/ferramenta-analise-concorrentes)

### Reportei (Brasil) — relatórios para agências
- Relatórios automáticos enviados **por WhatsApp ou e-mail** (semanal, quinzenal ou mensal). Uma **visão geral de vários clientes numa tela**. **Metas ligadas a métricas reais, com projeção do resultado**, e alertas durante o mês. [reportei.com](https://reportei.com/) · [Reportei Chat AI](https://reportei.com/?p=76552)
- **Relatório com IA:** um texto de análise (visão geral da conta, métricas principais, melhores campanhas, recomendações) **que a agência pode editar** antes de mandar. O "assistente de tráfego" mostra a pior métrica do período e sugere como reverter. [reportei.com/inteligencia-artificial-2](https://reportei.com/inteligencia-artificial-2)
- Uma avaliação reclama que "não tem visão de dashboard de verdade, com campos calculados e visão multicanal". [capterra.com (Reportei)](https://www.capterra.com/p/180418/Reportei/reviews/?page=3)
- **Lição pro Nexo:** o texto da IA **editável pela agência antes de chegar ao médico** resolve o medo de a IA falar besteira. E a "pior métrica do período + como reverter" é uma boa estrutura de cartão.

### Etus (Brasil)
- O forte é o agendamento. Os relatórios são personalizados e focados em Instagram e LinkedIn. Achei pouca informação pública sobre a tela de análise. [tecnoblog.net](https://tecnoblog.net/guias/8-ferramentas-para-gerenciar-suas-redes-sociais/) · [b2bstack.com.br/product/etus](https://www.b2bstack.com.br/product/etus)

---

## 3. O que NÃO fazer

1. **Painel com dezenas de gráficos do mesmo tamanho.** Sem hierarquia, o olho não sabe por onde começar. O Metricool é chamado de "poluído" quando há muitas marcas, e a Geckoboard manda agrupar os números principais e limitar a quantidade. [thecmo](https://thecmo.com/tools/metricool-review/) · [geckoboard](https://www.geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown)
2. **Número sem comparação.** "Alcance: 12.400" não diz se é bom ou ruim. [geckoboard](https://www.geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown)
3. **Pizza, 3D, gráfico radial e vários medidores na mesma tela.** Deixam a leitura mais lenta. [geckoboard](https://www.geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown)
4. **Tabela gigante para "mostrar tudo".** Tabela só para exceções: leads parados, clínicas com dado quebrado. [geckoboard](https://www.geckoboard.com/blog/data-visualization-for-tv-dashboards-a-teardown)
5. **Esconder o que importa atrás de menus.** Esse é o grande trauma do GA4, e o benchmark da Meta também fica "escondido". [martech.org](https://martech.org/marketers-are-having-problems-with-the-ga4-user-interface/) · [jonloomer](https://www.jonloomer.com/meta-ads-benchmarking-for-personalized-insights-on-performance/)
6. **Perder o período escolhido ao trocar de tela.** [searchengineland](https://searchengineland.com/why-people-hate-google-analytics-4-user-interface-428994)
7. **Cartões de "IA" que são propaganda ou óbvios**, enterrando os dados de verdade. Foi a revolta dos lojistas da Shopify. [community.shopify.com](https://community.shopify.com/t/any-new-dashboard-updates-yes-we-still-hate-it/240157)
8. **Tirar controles que as pessoas usam** (a Shopify removeu o seletor de período da Home). [community.shopify.com](https://community.shopify.com/t/home-page-stats-widget-no-longer-shows-time-period-or-date-selector/637406)
9. **Alerta demais.** Indicador de status em excesso vira ruído. É melhor 3 descobertas boas do que 15 medianas. [geckoboard](https://www.geckoboard.com/product/hardware/)
10. **IA que responde diferente para a mesma pergunta, ou que inventa.** A Mixpanel criou um "modo verificado" por isso, e o Moby precisa de revisão. No Nexo: textos montados a partir de regras e números conferidos, revisáveis pela agência como no Reportei. [docs.mixpanel.com](https://docs.mixpanel.com/guides/mixpanel-agent) · [thoughtmetric](https://thoughtmetric.io/blog/thoughtmetric-s-custom-reports-feature-vs-triple-whale-s-custom-dashboards-feature)
11. **Nota que parece promessa.** A Meta avisa que a pontuação não garante resultado. Uma "nota de saúde" no Nexo precisa explicar do que ela é feita. [jonloomer](https://www.jonloomer.com/opportunity-score/)
12. **Descoberta sem dado suficiente.** A Shopify só gera insight com volume mínimo. Clínica com pouco movimento deve ver "ainda não dá pra concluir", e não uma "tendência" de 2 conversas. [help.shopify.com](https://help.shopify.com/en/manual/shopify-admin/shopify-home)
13. **Análise que não funciona no celular** (a Later não tem análise no app). O médico vai olhar o Nexo no celular. [later.com](https://later.com/instagram-analytics/)

---

## 4. Imagens que valem olhar

**Geckoboard — exemplos de painel de TV (bons e ruins)**
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/gauge_data_viz_for_dashboards.png
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/column_chart_data_viz_for_TV_dashboards.png
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/table_data_viz_for_TV_dashboards.png
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/pie_chart_data_viz_for_TV_dashboards.png
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/sales_horse_race_data_visualization.png (ranking em "corrida de cavalos", uma boa ideia para a Carteira)
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/zendesk-agent-performance-real-time-dashboard--1-.png
- https://storage.ghost.io/c/e4/29/e429f33e-3b04-4419-bd74-db08dcf4466b/content/images/2026/03/hubspot-deals-dashboard-example.png

**Polar Analytics — gráfico de métrica e alerta no Slack**
- https://cdn.prod.website-files.com/5d41abab8cacf50ad1df67f2/64631b6d101622cb2b1a4d42_Cart-Abandonment-Rate.svg
- https://cdn.prod.website-files.com/5d41abab8cacf50ad1df67f2/64631c5a101622cb2b1bf7aa_alert-slack.svg

**Iconosquare — telas do produto** (caminhos relativos a https://www.iconosquare.com)
- https://www.iconosquare.com/assets/img/6a99881a5a974c95ed521d45_iconosquare-analytics-overview.avif
- https://www.iconosquare.com/assets/img/6a671c5115bf2c91954ce491_7c000f6e9718fb1d394c2a38b2fcdd5f_Analytics-2.avif (melhor horário)
- https://www.iconosquare.com/assets/img/6ac618edbe4ce54d09d475a0_Analytics-3.avif (painéis personalizados)
- https://www.iconosquare.com/assets/img/6a9ab7aa6f2fc959c17aa561_iconosquare-ai-tools-overview.avif (IA)

**mLabs — relatório de Instagram**
- https://cdn-wp.mlabs.com.br/wp-content/uploads/2025/09/relatorios-instagram-mlabs-1.webp

**Reportei — análise com IA**
- https://lh7-us.googleusercontent.com/9ZXzG0NpfVkhHeNw8lF7L1r3zPx0zfktTLzmTbfXPTbLCF5MoqBLNhtj2HE57SqnAMpTbyklRTqfb2ll7QOagAqsrLS6D25psQK-ugqZoZkTuMuWt3BQhLDiq977123ju2fc2LBmg0N5Y7CeiaYJAPE
- https://lh7-us.googleusercontent.com/R2uPVBnb7Mdky9Cbgg9z04dpZpJDr2MwbyRzjV7NuO0IbxQ6KWUxakfG8wGAAvsK_ECKdgEEyZNO7tsEF12wPLGjMvGlRCokl7rpUdixru-MER2leG-bzmyZh03J709xthyUSXx4dEV457o4sjrjL7M

**Databox — benchmarks**
- https://cdnwebsite.databox.com/wp-content/uploads/2022/10/19044740/NEWSLETTER_benchmarks.png

**RD Station — demonstração**
- https://api-blog.rdstation.com/wp-content/uploads/2024/03/demo.png

**Páginas com imagens/vídeos que não consegui extrair, mas valem abrir no navegador**
- Shopify, nova aparência do admin: https://www.shopify.com/blog/admin-new-look
- Triple Whale, painel do fundador e Moby: https://www.triplewhale.com/founders-dash · https://www.triplewhale.com/moby-agents
- Metricool, mapa de calor do melhor horário: https://help.metricool.com/en/article/best-time-to-post-on-social-media-in-metricool-hj3rgj/
- Amplitude, anomalia e previsão (com capturas): https://amplitude.com/docs/en/analytics/anomaly-forecast
- Meta Opportunity Score (com capturas): https://www.jonloomer.com/opportunity-score/
- Later, melhor horário no calendário: https://later.com/blog/the-science-behind-best-time-to-post-and-how-were-making-it-smarter/
