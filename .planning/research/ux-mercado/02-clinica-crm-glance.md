# Pesquisa de mercado de UX: software de clínica, CRMs, apps "de bater o olho" e painéis de agência

Pesquisado em 12/11/2026. O escopo é software de clínica e marketing médico, CRMs e funis de venda, apps de consumo que fazem o número "entrar no cérebro" (Oura, Whoop, Apple, Strava, Duolingo, bancos, Spotify) e painéis de agência com muitos clientes (relevantes para a Carteira).
Ferramentas de redes sociais e de anúncios ficaram com outro pesquisador e não entram aqui.

**Aviso de honestidade.** Quase tudo vem de páginas oficiais, centrais de ajuda e changelogs, com link em cada afirmação. Quando a fonte é material de venda da própria empresa ou blog de terceiros, isso está dito.
Os softwares brasileiros de clínica (Doctoralia Pro, iClinic, Feegow, Amigo, Clinicorp, Ninsaúde) publicam muito pouco sobre as próprias telas de relatório. Não encontrei documentação pública da tela de estatísticas de nenhum deles. Isso também é um achado: **ninguém no mercado brasileiro de clínica está mostrando "inteligência" de forma pública e convincente.** O espaço está aberto para o Nexo.

---

## 1. Resumo de uma página: os 10 padrões mais fortes

| # | Padrão | Quem faz bem | Como ficaria no Nexo | Tela |
|---|---|---|---|---|
| 1 | **Uma nota do dia + uma palavra-veredito + uma frase.** Um número de 0 a 100, uma faixa com nome ("Ótimo / Bom / Atenção") e uma frase curta que diz o que fazer. | Oura (Readiness: "Optimal, you're ready for action!" / "Pay attention, you're not fully recovered") | No topo do Hoje: "Clínica hoje: **72 – Bom**. Muita conversa chegando, mas 9 pessoas esperam resposta há mais de 2 h." Uma nota só, com a frase embaixo. | Hoje |
| 2 | **No máximo três mostradores grandes no topo, sempre na mesma ordem e com as mesmas cores.** Verde, amarelo e vermelho querem dizer a mesma coisa em todas as telas. | Whoop (Sleep, Recovery, Strain), Apple Fitness (três anéis) | Três anéis no Resultados: **Conversas → Agendamentos → Pacientes fechados**, cada um contra a meta do mês. Anel fechado quer dizer meta batida. | Resultados, Hoje |
| 3 | **"Por que mudou": a nota se abre nos fatores que a puxaram.** Cada fator ganha uma barrinha, e o que está ruim fica vermelho com o rótulo "atenção". | Oura (contribuintes), Salesforce Einstein (fatores que ajudam e que atrapalham) | Tocou na nota, abre: "O que puxou para baixo: tempo de resposta no WhatsApp (vermelho) e custo por conversa subiu 30%. O que ajudou: 3 posts acima da média." | Hoje, Carteira |
| 4 | **Funil com a % de passagem entre cada etapa e o tempo parado em cada uma.** Mostra onde o paciente "cai" e quanto tempo ele fica esperando. | Close (conversão entre etapas e "tempo médio para avançar"), Kommo (entrou / está / perdido por etapa), RD Station (conversão, venda e perda por etapa) | Funil horizontal: Conversou → Lead → Atendido → Agendou → Fechou. Entre cada par vai a % grande, e a etapa que mais perde ganha destaque e uma frase: "Você perde 61% entre *atendido* e *agendou*. É aqui que mora o dinheiro." | Funil/Pacientes |
| 5 | **Transformar o "buraco" em dinheiro.** Em vez de "9 leads sem resposta", mostrar "R$ 14 mil esperando resposta". | NexHealth ("Lapsed patient revenue potential", "Uncollected gap"), Weave ("chamada perdida = receita perdida") | Cartão no Hoje: "**12 pessoas** pediram preço e não agendaram. Pelo seu ticket médio, isso vale **cerca de R$ 18 mil**." Com botão "Ver lista". | Hoje, Atendimento |
| 6 | **O próximo passo fica do lado do número.** Cada alerta vem com a ação ali mesmo, sem a pessoa ter que ir procurar. | NexHealth ("o próximo passo fica ao lado do número": mandar recall, preencher a lista de espera), Tebra (um botão "Gerenciar" em cada bloco) | Cada cartão do Hoje termina com um verbo: "Responder agora", "Chamar de volta", "Ver quem sumiu". | Hoje, Atendimento |
| 7 | **Comparar com algo que dá sentido**: a semana passada até o mesmo dia, a meta, a média da própria clínica e outras clínicas parecidas. | Strava (semana atual × mesmo ponto da semana passada), Apple Fitness (90 dias × 365 com setas), Strava Relative Effort (faixa "normal para você"), Birdeye (nota × concorrentes), Tebra (comparação com práticas da região e especialidade) | Cada número grande ganha uma etiqueta pequena: "↑ 18% vs. semana passada até hoje" ou "dentro do normal para você". No Anúncios: "Seu custo por conversa: R$ 9. Clínicas da mesma especialidade na carteira: R$ 12." | Resultados, Anúncios, Instagram |
| 8 | **Carteira em forma de "semáforo" filtrável**: uma linha por cliente, colunas com KPIs coloridos pela meta, filtro "só os vermelhos" e alerta de integração caída. | Swydo (Monitoring Overview, filtro por KPI no estado "vermelho"), AgencyAnalytics (Roll-up "central de comando de segunda de manhã", aviso de integração desconectada), Whatagraph (destaca metas e limites, alerta no Slack) | Carteira abre já ordenada por "quem precisa de você", com um chip por problema ("Meta sem dados há 3 dias", "WhatsApp desconectado") e a nota de qualidade em cor. Botão "Só os que pioraram". | Carteira |
| 9 | **Resumo que chega até a pessoa (push, e-mail, WhatsApp) em vez de esperar que ela abra o painel.** | Linear Pulse (resumo diário ou semanal por IA, até em áudio), Revolut (resumo semanal de gastos por push), Swydo e Whatagraph (alerta por e-mail e Slack), Reportei Controle (alerta por e-mail) | Toda segunda às 8 h, o médico recebe no WhatsApp 3 linhas e 1 link: "Semana: 41 conversas (+12%), 9 agendamentos, 3 fechados. Atenção: 7 sem resposta. Toque para ver." | Hoje (fora do app) |
| 10 | **História com começo, meio e fim (estilo Stories / Wrapped)** para o fechamento do mês: cartões em tela cheia, um número por cartão, linguagem de conquista e botão de compartilhar. | Spotify Wrapped (cartões estilo Stories, com movimento), Strava Year in Sport | "Seu mês na Doctor Creator": 5 cartões ("Você recebeu 312 conversas", "Seu melhor post trouxe 41 delas", "17 viraram pacientes", "Cada R$ 1 em anúncio voltou R$ 6"). Serve de *tchan* na reunião mensal com o médico. | Resultados (mensal) |

**Os três de maior impacto para a reclamação do dono** ("tem que entrar no cérebro"): o **#1** (nota + veredito + frase), o **#4** (funil com a % e o ponto onde mais cai) e o **#5** (buraco em reais). Os três trocam "números soltos" por "o que isso significa e quanto vale".

---

## 2. Notas por produto

### 2.1 Software de clínica e marketing médico

**NexHealth Insights (EUA, odonto e médico).** É o exemplo mais forte do grupo.
- Ordem da tela: filtros (período, unidade, "dados atualizados há 9 h") → "Practice Health Summary" com 5 cartões (agendamentos, comparecimentos, pacientes novos, produção, recebimentos) → linha do tempo de agendamentos com média semanal → produção × recebido, com o "Uncollected gap" em destaque → saldos por idade → comparecimento e falta de pacientes novos × recorrentes → pacientes "sumidos" (6–12, 12–24, 24+ meses) com o "lapsed patient revenue potential" e a mediana do caso → de onde vieram os pacientes novos (agendamento online, campanha, por conta própria). [nexhealth.com/features/insights](https://www.nexhealth.com/features/insights)
- O texto da própria página explica a ideia de "inteligência": "Se paciente novo falta o dobro do recorrente, isso é um achado, e tem conserto." O próximo passo (mandar recall, preencher a vaga da lista de espera) fica ao lado do número. [mesma fonte]
- Etiqueta de origem em todo paciente novo, para "colocar o próximo real de marketing onde traz paciente". [nexhealth.com/features/reports](https://www.nexhealth.com/features/reports)
- Lição para o Nexo: o "Uncollected gap" e a "receita recuperável" são exatamente o padrão #5.

**Weave (EUA, odonto).**
- Lançou o Practice Analytics em 09/2023 para mostrar "oportunidades perdidas" de cuidado, volume, receita e uso da agenda. Integra com Dentrix, Open Dental e Eaglesoft. [Becker's Dental](https://beckersdental.com/dental-technology/41888-weave-adds-practice-analytics-tool.html), [Dental Products Report](https://www.dentalproductsreport.com/view/new-software-feature-from-weave-empowers-dental-practices)
- A narrativa central é "chamada perdida = paciente e receita perdidos". A inteligência de chamadas mostra a origem de quem ligou e o que aconteceu depois: agendou, desligou ou pediu retorno. Sugere medir atendidas × perdidas por dia e hora, a velocidade de resposta e a conversão de chamada de paciente novo. [getweave.com/dental-call-tracking](https://www.getweave.com/dental-call-tracking/)
- Existe o "Missed Call Text", uma mensagem automática para quem ligou e não foi atendido. No fórum, usuários pedem um painel de produção e metas e pedem para tirar as chamadas abandonadas da % de perdidas (definição de métrica importa). [feedback.getweave.com](https://feedback.getweave.com/forums/952282-analytics/filters/hot?page=2)
- No Nexo, isso vira o Atendimento: "conversas sem resposta" tratadas como dinheiro na mesa.

**Tebra / PatientPop (EUA).**
- A ordem do Performance Dashboard é: seletor de médico e período → **Retorno sobre investimento** (com botão de calculadora de ROI) → pesquisas e avaliações → presença online (70+ diretórios monitorados) → agendamentos online → agendamentos vindos de recall → lembretes enviados e confirmados → recalls que viraram consulta → pesquisas enviadas. Cada bloco tem o seu botão "Gerenciar…". [helpme.tebra.com – Navigate the Performance Dashboard](https://helpme.tebra.com/Marketing/Performance_Dashboard/Navigate_the_Performance_Dashboard)
- O ROI vem primeiro na tela. Isso é bom para quem paga uma agência (o médico do Nexo).
- O marketing promete posição na busca, pedidos de consulta e reputação num só painel, além da comparação "com práticas da sua região e especialidade". [patientpop.com/how-it-works](https://www.patientpop.com/how-it-works/)

**Birdeye (reputação e mensagens, forte em saúde).**
- O **Birdeye Score** é a média de 3 notas (sentimento, reputação e listagens), "uma visão em tempo real da saúde online do negócio". [support.birdeye.com – Birdeye Score](https://support.birdeye.com/en_US/insights-ai/understanding-birdeye-score-)
- A nota de reputação junta média das avaliações, volume e frequência de resposta, comparada com o setor. [birdeye.helpjuice.com – Reputation Score](https://birdeye.helpjuice.com/insights-ai/understanding-reputation-score-)
- O Competitors AI mostra a sua nota ao lado da nota dos concorrentes, com um **resumo em texto gerado por IA** e recomendações. [birdeye.helpjuice.com – Competitors AI](https://birdeye.helpjuice.com/en_US/insights-ai-competitors-ai/how-do-i-use-competitors-ai-in-the-insights-ai-tab), [press release View 2024](https://birdeye.com/sg/press/birdeye-unveils-insights-ai-and-competitors-ai-at-view-2024/)
- No Nexo: uma nota composta e explicável, e a comparação com clínicas parecidas da própria carteira (anônima).

**Podium (mensagens e avaliações).**
- A home nova (01/2025) é uma "central" com estes blocos: painel do funcionário de IA (consultas marcadas, mensagens, **tempo economizado**) → telefonia → pagamentos → disparos → **origens de lead** → **ranking da equipe** (tempo de resposta) → avaliações. Tem filtro de período e unidade e um botão de feedback em cada bloco. [podium.com – new homepage](https://www.podium.com/whats-new/podiums-new-homepage/)
- "Tempo economizado" é um bom número de valor para mostrar ao médico (quanto a agência e a automação pouparam).

**Jane App (clínicas, Canadá).**
- O Practitioner Dashboard abre pelo Day Sheet (a agenda do dia). Mostra pacientes únicos divididos em novo × recorrente, visitas, **ocupação** (tempo reservado ÷ turno), faturado, recebido, prontuários pendentes, top 5 tratamentos, média de visitas por paciente e top 10 pacientes. [jane.app/guide – dashboard metrics](https://jane.app/guide/what-do-my-dashboard-metrics-mean-a8255ab8-9af4-42cf-80f6-2e641dd68be3)
- Cada métrica tem uma definição clara do que conta e do que não conta (faltas ficam fora, por exemplo). O Nexo precisa desse "o que este número conta" num toque.
- Não tem comparação com o período anterior nem meta. É um bom exemplo do que *não* basta.

**Cliniko (clínicas, Austrália).**
- Gráficos fixos no topo de cada seção de relatório (agendamentos, pacientes acumulados, receita de 12 meses, receita por profissional, pacientes novos por mês em "Marketing"). Não dá para filtrar e o que aparece muda por perfil de usuário. [help.cliniko.com – graphs on reports page](https://help.cliniko.com/en/articles/11596221-understanding-the-graphs-on-your-reports-page)
- O relatório de origem de indicação fica em Relatórios > Marketing. [cliniko.com/blog – referral sources](https://www.cliniko.com/blog/how-to/referral-sources-and-growing-your-clinic/)
- O que aprender: a mesma tela muda conforme quem olha (médico × secretária × dono).

**Solutionreach, Healthgrades.** O material público é só de venda ("+US$ 95 mil de receita com recall"), sem documentação de tela. [solutionreach.com/blog](https://www.solutionreach.com/blog/healthcare-analytics-software), [gappsy review](https://www.gappsy.com/tools/solutionreach/). O WebMD, primo do Healthgrades, define bem "visualização de perfil" e "pedido de consulta" como lead. [doctor.webmd.com – metrics explained](https://doctor.webmd.com/learnmore/performance-dashboard-metrics-explained)

**Ninsaúde Apolo (Brasil).** Tem página de "análise inteligente" com gráfico de atendimentos, horário de pico e sazonalidade, **mapa de calor de onde moram os pacientes** (para marketing segmentado), financeiro e ranking ABC de produtividade. Integra com Power BI. [ninsaude.com – real-time insights](https://www.ninsaude.com/en/real-time-insights-medical-software). O mapa de calor por bairro é uma ideia boa e barata para o Nexo ("seus pacientes vêm destes bairros"; ajuda a segmentar anúncio).

**Doctoralia Pro, iClinic, Feegow, Amigo, Clinicorp (Brasil).** Não encontrei documentação pública das telas de estatística.
- iClinic tem uma coleção "Relatórios gerenciais" na central de ajuda, que não consegui abrir. [intercom.help/iclinic](https://intercom.help/iclinic-bc30384852a6/pt-BR/)
- A Doctoralia publica dados de mercado úteis como benchmark: médicos com mais de 100 avaliações recebem até 30× mais agendamentos. [medicinasa.com.br – perfil paciente Doctoralia](https://medicinasa.com.br/perfil-paciente-doctoralia/)
- O Panorama das Clínicas 2024 (Doctoralia + Feegow) diz que só 59% dos médicos analisam relatórios de produtividade. [Afya](https://educacaomedica.afya.com.br/blog/metricas-para-medicos)
- Leitura: o médico brasileiro não lê relatório. Para ele precisa ser veredito e ação, não tabela.

### 2.2 CRMs e funis de venda

**Close.** É o funil mais didático.
- Barras por etapa com a **% de conversão entre etapas**. Tocar no espaço entre duas etapas mostra o exemplo "72%: 26 oportunidades foram direto de *Demo* para *Proposta*".
- No topo: nº de oportunidades, taxa de ganho, tempo médio até fechar, valor médio e **Sales Velocity** (nº × valor × taxa ÷ dias).
- "Tempo médio para avançar" em cada etapa.
- Avisa que somar as etapas não dá o total.
[help.close.com – Opportunity Funnels](https://help.close.com/docs/opportunity-funnels-report), [changelog](https://close.com/changelog/opportunity-funnel-report-beta)

**Kommo (amoCRM), muito usado com WhatsApp no Brasil.**
- O primeiro widget do Win-Loss é uma coluna por etapa com três números: **está na etapa / entrou na etapa / perdeu na etapa**. Muitos entram e poucos ficam quer dizer que a etapa flui. Muitos perdidos quer dizer gargalo. Tocar no número abre a lista de leads.
- Tem widget separado de ciclo de vida médio (tempo por etapa) e de previsão de vendas.
[support.kommo.com – win-loss](https://support.kommo.com/docs/win-loss-statistics.md)
- O tour mostra a taxa de ganho e perda, o **tempo de resposta da equipe a lead novo**, onde mais se perde e a previsão de leads ganhos e receita até 60 dias. [kommo.com/tour/analytics](https://kommo.com/tour/analytics)
- Para o Nexo: o "tempo de resposta a lead novo" é a métrica do Atendimento.

**Pipedrive Insights.**
- O funil mostra uma coluna por etapa com a % de negócios que chegou até ela e a taxa de ganho no topo. Medindo por quantidade, mostra também **"quantos negócios você precisa ganhar para manter essa taxa"**, o que transforma a taxa em meta concreta. A tabela embaixo tem as abas Negócios e Resumo. [support.pipedrive.com – deal conversion](https://support.pipedrive.com/en/article/insights-reports-deal-conversion)
- Conta só a primeira entrada na etapa. Um negócio que pula etapa conta como tendo passado por ela. [community.pipedrive.com](https://community.pipedrive.com/discussion/comment/9886)

**RD Station CRM (Brasil).**
- Relatório de conversões por etapa com um gráfico novo de **conversão, vendas e perdas por etapa**, motivos de perda por responsável, equipe e etapa, e comparação entre vendedores.
- O "Resumo do Funil" ganhou o indicador **"negociações esfriando"**, junto de "sem tarefa", "tarefa atrasada" e "sem valor".
[rdstation.com/blog – novidades abril 2025](https://www.rdstation.com/blog/vendas/novidades-de-abril-rd-station-crm)
- O "CRM Live" é um painel em tempo real para a TV do time. [rdstation.com/blog – relatórios](https://www.rdstation.com/blog/vendas/processo-comercial/relatorios-de-vendas/)
- O "esfriando" é uma palavra perfeita para o Nexo: "7 pacientes esfriando (sem contato há 3+ dias)".

**Clint CRM (Brasil, o CRM usado pela Doctor Creator).** O funil é montado com as etapas do negócio e motivos de perda por funil, e mudar de etapa dispara automação. Clientes elogiam o painel por funcionário (conversões e fechamentos). Os planos limitam o nº de relatórios (5 ou 10). [clint.digital/blog](https://www.clint.digital/blog/?p=3636), [clint.digital/planos](https://clint.digital/planos). Não achei página de relatório para clínica.

**HubSpot (Breeze).**
- O Deal Insights dá nota a cada negócio em tempo real (chance de fechar) e **sugere o próximo passo**.
- O Deal Loss Agent lê os negócios perdidos e aponta padrões: objeções comuns, etapa onde o impulso cai e concorrentes citados.
[hubspot.com – analyze and forecast pipeline](https://www.hubspot.com/products/artificial-intelligence/use-cases/sales-analyze-and-forecast-pipeline)
- A previsão por IA usa os ganhos dos últimos 3 meses. [knowledge.hubspot.com – AI projections](https://knowledge.hubspot.com/forecast/improve-forecasting-with-ai-projections)
- Para o Nexo: um "por que perdemos" automático lendo os motivos de perda e as conversas do WhatsApp ("40% dos que não agendaram citaram preço").

**Salesforce Einstein / Pipeline Inspection.**
- A nota de 1–99 aparece como **faixa colorida Alta / Média / Baixa**, não como número cru.
- Uma **seta vermelha ou verde** indica que a faixa mudou.
- Passar o mouse mostra os fatores que ajudam e que atrapalham.
- O "Deal progress" avisa se o negócio está parado tempo demais na etapa em comparação com negócios parecidos.
[trailhead – deal health](https://trailhead.salesforce.com/content/learn/modules/sell-smarter-with-pipeline-inspection/understand-deal-health-with-insights-and-scores), [admin.salesforce.com](https://admin.salesforce.com/blog/2021/what-you-can-do-with-einstein-opportunity-scoring)
- Ideia para a Carteira: nota de qualidade em 3 faixas + seta de mudança + fatores num toque.

**Attio.** O funil tem duas visões: "% que passou" e "% entre etapas", que destaca onde cai. Tem também relatórios de tempo na etapa e de mudança de etapa. O manual avisa que o funil conta quem *já esteve* na etapa, por isso o total parece maior que o do pipeline, "e isso não quer dizer que está errado". [attio.com/help – funnel report](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-funnel-report)
Lição: explicar a regra de contagem evita desconfiança ("o número não bate").

### 2.3 Apps de consumo que fazem o dado "entrar no cérebro"

**Oura.**
- A aba Today tem, nesta ordem: atalhos para as 3 notas (Sono, Prontidão, Atividade) → "Daily Highlight" (um insight que muda com a hora do dia) → linha do tempo do dia com marcações → "Discoveries" (como os seus hábitos se ligam às mudanças). [ouraring.com/blog – new app experience](https://ouraring.com/blog/new-oura-app-experience/)
- A nota de 0–100 tem faixa e frase: 85+ "Optimal, you're ready for action!", 70–84 "Good, you've recovered well enough", abaixo disso "Pay attention, you're not fully recovered". [ouraring.com/blog – readiness score](https://ouraring.com/blog/readiness-score/), [support.ouraring.com – faixas](https://support.ouraring.com/hc/en-us/articles/360057791533)
- Nove "contribuintes" com barra. O que precisa de atenção ganha **barra vermelha e o rótulo "pay attention"**. Os contribuintes são calculados contra a **sua própria média** de 14 dias, não contra uma regra genérica. [mesmas fontes]
- No Nexo: a nota do dia da clínica e os fatores comparados com o normal *daquela* clínica.

**Whoop.**
- No topo da home ficam três mostradores, Sono, Recuperação e Esforço, reordenados para seguir o dia. Cada um leva à sua tela detalhada. [whoop.com – new home screen](https://www.whoop.com/thelocker/the-all-new-whoop-home-screen)
- Usa um vocabulário de 3 cores fixo (verde, amarelo, vermelho) em todas as telas. A nota principal é enorme e o texto de apoio é pequeno. O "coaching" é embutido: a recuperação define a meta de esforço do dia. [925studios – Whoop design breakdown](https://www.925studios.co/blog/whoop-design-breakdown)
- Crítica: "quem é novo pode achar a quantidade de informação intimidadora", e a home leva a mais de 20 telas, então nem sempre fica claro como aprofundar. [the5krunner](https://the5krunner.com/2023/03/28/new-whoop-home-screen-looks-pretty-but-is-it-as-intuitive/)
- Crítica de texto: jargão deixa o usuário sem saber o que fazer. [925studios]

**Apple Fitness.**
- O resumo junta tudo numa tela: os anéis de hoje no topo e, ao tocar, o histórico. [MacStories – Fitness app iOS 14](https://www.macstories.net/stories/the-new-fitness-app-in-ios-14/)
- As tendências comparam os últimos 90 dias com os últimos 365 e usam **setas** para melhor ou pior em cada área. [iPhoneLife](https://iphonelife.com/content/understanding-fitness-trends-apple-fitness-challenges)
- Anel = progresso até a meta, e a volta extra mostra que passou da meta. [support.apple.com – Activity](https://support.apple.com/guide/watch/track-daily-activity-with-apple-watch-apd3bf6d85a6/7.0/watchos/7.0)
- O anel é o jeito mais rápido de ler "quanto falta para a meta".

**Strava.**
- O "Weekly Snapshot" fica no topo do feed e mostra a semana atual contra o **mesmo ponto da semana passada**. Tocar abre o detalhe. [road.cc](https://road.cc/content/tech-news/stravas-weekly-snapshot-makes-me-feel-bad-307315)
- O gráfico de Relative Effort mostra a carga acumulada da semana e uma **faixa branca de "normal para você"** (média móvel de 3 semanas). [support.strava.com – Relative Effort](https://support.strava.com/hc/en-us/articles/360000197364-Relative-Effort-Summit-), [the5krunner – Relative Effort](https://the5krunner.com/2019/03/28/strava-relative-effort/)
- No Nexo: comparar sempre "até o mesmo dia" e mostrar a faixa normal em vez de uma linha solta.

**Duolingo (sequência / streak).**
- Separou a sequência da meta diária: basta 1 lição para manter. O "congelamento de sequência" existe porque "a vida acontece". [UX Magazine](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design)
- A aversão à perda é o motor principal. [Smashing Magazine 2026](https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/), [Mobbin – estudo de 859 streaks](https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs)
- No Nexo: "**14 dias seguidos** respondendo todo lead em menos de 1 h". Isso cria um hábito na secretária. Usar com cuidado (ver anti-padrões).

**Nubank e Revolut (insights de gastos).**
- O Nubank tem um "resumo inteligente dos gastos" com histórico de 36 meses. [blog.nubank.com.br](https://blog.nubank.com.br/dicas-para-simplificar-rotina-financeira/)
- O Revolut mostra se você **está no ritmo** do orçamento, com indicador vermelho quando vai estourar, e manda resumo semanal por push (há usuários pedindo para desligar). [financialmarket.ro – Revolut analytics](https://www.financialmarket.ro/fintech/digital-trends/revolut-introduces-new-and-improved-analytics-in-the-app/), [community.revolut.com](https://community.revolut.com/t/how-to-disable-weekly-spending-info/149566)
- No Nexo: projetar "no ritmo atual, o mês fecha com 38 agendamentos (meta 45)".

**Spotify Wrapped.**
- Cartões em tela cheia no estilo Stories, com animação. Transforma uso em significado ("você é o personagem principal") e termina no botão de compartilhar. [dev.to – Wrapped UX](https://dev.to/bhumica08/what-i-learned-from-spotify-wrappeds-ux-magic-and-how-id-build-it-40nk), [nogood.io](https://nogood.io/blog/spotify-wrapped-marketing-strategy/), [Spotify Engineering – animações 2023](https://engineering.atspotify.com/2024/1/exploring-the-animation-landscape-of-2023-wrapped)
- No Nexo: o "fechamento do mês" para o médico.

**Linear Pulse.** Um resumo pessoal gerado por IA, diário ou semanal, que dá até para **ouvir em áudio**. Chegou ao celular em 11/2025. [linear.app/changelog – Pulse](https://linear.app/changelog/2025-04-16-pulse), [Pulse on mobile](https://linear.app/changelog/2025-11-13-pulse-on-mobile). No Nexo: um áudio de 30 s no WhatsApp do médico com o resumo da semana.

**Google Business Profile – Performance.**
- Começa por "como os clientes encontraram você" (Busca × Maps, busca pelo nome × busca genérica). Depois vêm as ações (ligações, rotas, site), com ligações por dia da semana e hora. [support.google.com/business – Performance](https://support.google.com/business/answer/9918094?hl=en-GB)
- Avisa limites: a ligação só conta quem tocou no botão. [support.google.com/business/answer/7689763](https://support.google.com/business/answer/7689763?hl=en-IN)
- No Nexo: "como os pacientes te acharam" como primeira pergunta do Resultados, e "horário em que mais chegam conversas" no Atendimento.

**Robinhood, Wise.** Não aprofundei nesta rodada. São conhecidos por um número grande no topo com a variação do dia em verde ou vermelho, mas não busquei fonte oficial; fica como referência a verificar.

### 2.4 Painéis de agência com muitos clientes (para a Carteira)

**Swydo.**
- O Monitoring Overview mostra os KPIs de **todos os clientes numa tela**. Dá para **filtrar clientes pelo estado do KPI** (por exemplo, só os "vermelhos"). A meta por KPI é opcional. [help.swydo.com – track KPIs](https://help.swydo.com/en/articles/9820183-how-to-track-kpis-using-monitoring-and-alerts)
- Alertas desde 12/2025, com regra do tipo "Custo subiu mais de 15%" e uma visão de todos os alertas de todos os clientes. [changelog.swydo.com – Alerts](https://changelog.swydo.com/122054-swydo-alerts-your-new-ally-to-stay-on-top-of-performance), [help.swydo.com – alerts](https://help.swydo.com/en/articles/12958262-how-to-use-alerts)

**AgencyAnalytics.**
- A Roll-up Table é a "central de comando de segunda de manhã": uma linha por cliente, métricas lado a lado, linha de totais e médias, agrupamento por marca, unidade ou setor, e % de comparação embaixo de cada número. [agencyanalytics.com – roll-up table](https://agencyanalytics.com/features/rollup-table)
- Alerta por meta de KPI e **aviso para todos quando uma integração desconecta**. [mesma fonte], [agencyanalytics.com/features/alerts](https://agencyanalytics.com/features/alerts)
- Tem metas com acompanhamento diário e benchmark entre clientes (ex.: o CPC médio de todos os clientes). [agencyanalytics.com/blog – update](https://agencyanalytics.com/blog/shareable-link-update)

**Whatagraph.** O Overview junta clientes, canais e unidades e **destaca automaticamente** as métricas que bateram a meta ou passaram do limite. Alerta por e-mail ou Slack. Tem visão por gerente de conta ("quem precisa de atenção"). [whatagraph.com/overview](https://whatagraph.com/overview)

**Reportei (Brasil).** O Overview é a visão de todos os projetos numa tela, com abas por nicho, serviço ou região, linha de totais e valor de referência (meta ou limite) por métrica, e filtro por membro da equipe. Os alertas por e-mail ficam no "Reportei Controle". [reportei.com – Overview](https://reportei.com/reportei-overview-analise-as-metricas-mais-importantes-de-cada-projeto-em-uma-unica-tela/), [central de ajuda](https://reportei.com/central-de-ajuda/como-criar-novas-visoes-paginas-e-adicionar-metricas-na-overview/)

**DashThis.** É o contra-exemplo: um painel por cliente e **nenhuma visão consolidada**, então é preciso abrir cliente por cliente. [swydo.com – vs DashThis](https://swydo.com/compare/swydo-vs-dashthis/) (fonte concorrente), [dashthis.com/agency-dashboard](https://dashthis.com/agency-dashboard)

**Síntese para a Carteira.** Os melhores combinam quatro coisas:
- uma linha por cliente;
- cor pela meta;
- filtro "só problemas";
- alerta de integração caída.

Nenhum deles tem uma **nota de saúde única e explicada por cliente**. O Nexo já tem a nota de qualidade, e isso é um diferencial se ela vier com "por que" (padrão #3) e seta de mudança (estilo Salesforce).

---

## 3. Anti-padrões a evitar

1. **Tela que pune sem contexto.** O Weekly Snapshot do Strava compara a semana ainda pela metade, soma esportes diferentes e não pode ser desligado. Usuários dizem que "faz me sentir mal". [road.cc](https://road.cc/content/tech-news/stravas-weekly-snapshot-makes-me-feel-bad-307315) → No Nexo: comparar sempre "até o mesmo dia" e não somar coisas diferentes (seguidor + conversa + lead).
2. **Informação demais na primeira tela.** Na home do Whoop, "quem é novo pode achar intimidador" e não fica claro como aprofundar. [the5krunner](https://the5krunner.com/2023/03/28/new-whoop-home-screen-looks-pretty-but-is-it-as-intuitive/) → Máximo de 3 números grandes no topo, e o resto vai para o toque.
3. **Jargão.** Texto técnico mata uma tela bonita. [925studios](https://www.925studios.co/blog/whoop-design-breakdown) → Escrever "custo para alguém te chamar no WhatsApp", não "CPL" nem "CPA".
4. **Painel por cliente sem visão consolidada** (DashThis). A agência tem que abrir um por um. [swydo.com](https://swydo.com/compare/swydo-vs-dashthis/)
5. **Número que "não bate" sem explicação.** Funis que contam quem já passou pela etapa dão totais maiores que o pipeline, e o Attio precisou escrever "isso não quer dizer que está errado". [attio.com/help](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-funnel-report) → Um "i" com "o que este número conta" em cada número.
6. **Métrica com definição injusta.** Usuários do Weave pedem para tirar as chamadas abandonadas da % de perdidas. [feedback.getweave.com](https://feedback.getweave.com/forums/952282-analytics/filters/hot?page=2) → Definir com cuidado o que é "conversa sem resposta" (mensagem fora do horário? spam?).
7. **Resumo por push que não se pode desligar.** Há usuários do Revolut pedindo para desligar o resumo semanal. [community.revolut.com](https://community.revolut.com/t/how-to-disable-weekly-spending-info/149566) → Resumo no WhatsApp com opção de frequência.
8. **Gamificação manipuladora.** Sequências podem virar check-in vazio sem resultado real, e reforço variável pode ser explorador. [UX Magazine](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design), [estudo de caso Duolingo](https://jiwonvyoo.github.io/portfolio/case/duolingo/duo.html) → Ligar a sequência a algo que gera paciente (responder rápido), não a "abrir o app".
9. **Meta rígida que ninguém ajusta.** No Whoop, o usuário não ajusta a própria zona, e a meta só sobe, sem semana leve. [925studios](https://www.925studios.co/blog/whoop-design-breakdown) → Meta por clínica, editável, que considera feriados e férias do médico.
10. **Mostrar 0 ou vazio sem dizer por quê.** A página do NexHealth mostra cartões com "$0", o que parece dado faltando. [nexhealth.com/features/insights](https://www.nexhealth.com/features/insights) → No Nexo, "sem dados porque o Instagram está desconectado desde 08/11" vale mais que um "0".
11. **Relatório que o médico não lê.** Só 59% dos médicos analisam relatórios de produtividade. [Afya / Panorama Doctoralia-Feegow](https://educacaomedica.afya.com.br/blog/metricas-para-medicos) → Tabela vai para o fundo da tela, e o veredito e a ação vêm em cima.

---

## 4. Imagens e telas oficiais que valem a olhada

**Oura**
- Aba Today: https://ouraring.com/blog/wp-content/uploads/2024/10/Today.png
- Today (alta resolução): https://ouraring.com/blog/wp-content/uploads/2024/10/Today-Tab-Oura-App-Final.jpg
- Vitals: https://ouraring.com/blog/wp-content/uploads/2024/10/Vitals.png
- My Health: https://ouraring.com/blog/wp-content/uploads/2024/10/MyHealth.png
- Cartão de Readiness (nota + contribuintes): https://ouraring.com/blog/wp-content/uploads/2024/02/readiness-card.png

**Whoop**
- Animação da nova home (arquivo): https://web.archive.org/web/20230510133240/https://www.whoop.com/uploads/2023/03/2_22_2023_Home_Redesign_English_Touchestones_WBG.gif
- Telas da home nova (the5krunner): https://imagedelivery.net/_jGo7Cp8DLHLbI9FzBn6-Q/the5krunner.com/2023/03/IMG_1533.png/w=300,h=649 (e IMG_1534 a IMG_1540 no mesmo caminho)

**Close (funil)**
- Funil: https://close-prd-help-docs.s3.us-west-2.amazonaws.com/feature-guide/reports/opportunity-funnels-report/opportunity_funnel_chart_e925f2.png
- Tooltip da % entre etapas: https://close-prd-help-docs.s3.us-west-2.amazonaws.com/feature-guide/reports/opportunity-funnels-report/conversion_rate_tooltip_a23102.png

**Pipedrive (funil e win/loss)**
- Funil: https://kb-cms.pipedriveassets.com/dealconversion3.png
- Tabela do funil: https://kb-cms.pipedriveassets.com/dealconversion10.png
- Win/loss: https://kb-cms.pipedriveassets.com/dealconversion2.gif

**RD Station CRM**
- Gráfico de conversões por etapa: https://api-blog.rdstation.com/wp-content/uploads/2025/08/Grafico-de-Conversoes-720x248.png
- Filtros avançados: https://api-blog.rdstation.com/wp-content/uploads/2025/08/Filtros-Avancados-720x346.png

**Salesforce Pipeline Inspection** (base: https://res.cloudinary.com/hy4kyit2a/f_auto/fl_lossy/q_70/learn/modules/sell-smarter-with-pipeline-inspection/understand-deal-health-with-insights-and-scores/images/)
- Notas em faixas + popup: `7a5769e5cf5b66755693675d1ea3a372_kix.f3eg4bjqfjxl.png`
- Linha do tempo de atividade: `a5e83d6a330cdeb76e988ac18adcfcb9_kix.7sf1l3gs4vkj.png`

**HubSpot**
- Deal Insights: https://www.hubspot.com/hs-fs/hubfs/deal_insights_thumbnail.png
- Deal Loss Agent: https://www.hubspot.com/hs-fs/hubfs/breeze-use-cases/assets/use-cases/deal_loss_agent@2x.png

**Tebra Performance Dashboard**
- ROI e blocos: https://helpme.tebra.com/@api/deki/files/14988/Engage_PerformanceDashboard_NavigateROI.png?revision=1
- Detalhes: https://helpme.tebra.com/@api/deki/files/14987/Engage_PerformanceDashboard_NavigateDetails.png?revision=1

**Ninsaúde** (mapa de calor e gráficos)
- https://siteimg.ninsaude.com/assets/img/en/analise-inteligente_mapas-calor.webp
- https://siteimg.ninsaude.com/assets/img/en/analise-inteligente_grafico-agendamento.webp

**AgencyAnalytics** (Carteira)
- Roll-up table: https://9kwkhatg7a3q9d2z.public.blob.vercel-storage.com/assets/client-performance-metric-roll-up-table-bfc54019f9.avif
- Multi-cliente: https://9kwkhatg7a3q9d2z.public.blob.vercel-storage.com/assets/multi-client-agency-dashboard-example-7daf503285.avif
- Widget de metas: https://9kwkhatg7a3q9d2z.public.blob.vercel-storage.com/assets/add-goal-tracking-to-digital-marketing-dashboards-81565ed113.avif

**Whatagraph** (Carteira)
- Overview: https://media.whatagraph.com/Overview_hero_f97e55ff45.png?width=992
- Metas e limites: https://media.whatagraph.com/Overview_goals_929bd65c0a.png?width=992
- Por gerente de conta: https://media.whatagraph.com/Overview_Account_managers_c95a336846.png?width=992
- Alerta no Slack: https://media.whatagraph.com/Overview_Slack_notification_794bc618c1.png?width=992

**Reportei Overview**
- https://reportei.com/wp-content/uploads/2024/07/painel-Overview-visao-geral-1024x583.png
- https://reportei.com/wp-content/uploads/2024/07/overview-comparison-value-pt_br.png

**Cliniko.** Os links das imagens da central de ajuda expiram. Melhor abrir a página: https://help.cliniko.com/en/articles/11596221-understanding-the-graphs-on-your-reports-page

**Páginas sem imagem estática útil, mas que vale abrir no navegador:** NexHealth Insights (https://www.nexhealth.com/features/insights), cuja tela de exemplo é a melhor referência de "clínica inteligente" que encontrei, e Kommo Win-Loss (https://support.kommo.com/docs/win-loss-statistics.md).
