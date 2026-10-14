# Matriz de rastreabilidade — páginas sociais (Resultado, Conteúdo, Posts, Top, Audiência)

Auditoria somente leitura. Nenhum arquivo de código foi alterado.

- **Baseline:** commit `477eb43` ("Conferência de dados + métricas do jeito do Instagram") — UI original.
- **Atual:** `HEAD` (`68c0e40`), árvore de trabalho limpa.
- Commits entre os dois que tocam o escopo: `78633bf` (cria `leitura-do-periodo.tsx`), `a77c5c9` (fuso de Brasília, "Este mês", anúncios por objetivo), `562bf04` (Resultado reescrito; apaga `resumo-do-mes.tsx` e `leitura-do-periodo.tsx`), `3ada73b` (navegação em 5 áreas + ajustes responsivos), `5d8d3b6` (Resultado usa plano de verba de Anúncios), `a89548f` (voz do paciente; mexe em `report-metrics.ts`/`hub-conteudo.ts`).
- `src/components/leitura-do-periodo.tsx` **não existia no baseline** (foi criado em `78633bf` e apagado em `562bf04`). Ele não entra na matriz como baseline. Ver a nota no fim da seção do Resultado.
- Referências "arquivo:linha" de baseline valem para `git show 477eb43:<arquivo>`.

Legenda de status: **MANTIDO** · **MOVIDO** (mesma coisa em outro lugar) · **ALTERADO (aparência)** · **ALTERADO (cálculo)** · **REMOVIDO**.

---

## 0. Navegação e filtro de período (comum às 5 páginas)

| Elemento | Tipo | Definição no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Menu "Resultado" (`/$clientId`) | ação-botão | Sidebar, item "Resultado" (`_authenticated.$clientId.tsx:65`) | Área **Resumo** › aba "Resumo" (`src/lib/nav.ts`) | ALTERADO (aparência) | Mesma URL. Rótulo mudou para "Resumo". |
| Menu "Conteúdo" (`/conteudo`) | ação-botão | Sidebar, item "Conteúdo" (`:66`) | Área **Conteúdo** › aba "Visão" | ALTERADO (aparência) | Rótulo mudou para "Visão". |
| Menu "Posts" (`/posts`) | ação-botão | Sidebar, só se `tem_instagram` (`:67`) | Área Conteúdo › aba "Posts" (mesma regra `fonte: "instagram"`) | MANTIDO | — |
| Menu "Top conteúdos" (`/top`) | ação-botão | Sidebar (`:68`) | Área Conteúdo › aba "Melhores" | ALTERADO (aparência) | Rótulo mudou para "Melhores". |
| Menu "Audiência" (`/audiencia`) | ação-botão | Sidebar (`:69`) | Área Conteúdo › aba "Público" | ALTERADO (aparência) | Rótulo mudou para "Público". |
| Seletor de período (`DateRangePicker`) | filtro | `<select>` com presets `mes_atual, 7d, 30d, 90d, 180d, 365d, personalizado` + datas De/Até; padrão `90d` | Cabeçalho (desktop) e folha inferior "Período" (celular, `variante="lista"`) em `app-shell.tsx` | ALTERADO (aparência) | Mesmos presets e mesmo padrão `90d`. Ganhou "Sobre o período" (texto explicativo) e a versão com botões no celular. |
| Preset "Este mês" | regra de cálculo | `resolveDateRange`: `start` = dia 1, `end` = **último dia do mês** (`date-range.ts:36-38`) | `end` = **hoje** (`date-range.ts:35-40`) | ALTERADO (cálculo) | Correção de bug: o fim no futuro fazia o "período anterior do mesmo tamanho" virar o mês anterior inteiro. Também muda o rótulo do período em todas as páginas ("01/10 a 13/10" em vez de "01/10 a 31/10"). |
| Presets "Últimos N dias" | regra de cálculo | N dias contando hoje, data local | igual | MANTIDO | — |
| Selo de frescor da sincronização (`SyncFreshnessBadge`) | aviso-estado | No cabeçalho do layout | No cabeçalho do `app-shell` (completo e compacto) | MANTIDO | — |

---

## 1. Resultado / Home — `src/routes/_authenticated.$clientId.index.tsx`

A página foi **reescrita** em `562bf04`. Agora ela é montada por `montarResultado()` (`src/lib/resultado.ts`), que junta `lerPeriodo()` (`leitura-periodo.ts`), `cruzar()` (`cruzamento.ts`), `insightsDeAnuncios()` (`anuncios-objetivo.ts`) e `BENCHMARKS` (`benchmarks.ts`). Todas as consultas usam agora `fim = min(end, hoje em America/Sao_Paulo)` (`index.tsx:332-353`).

### 1a. Elementos da página no baseline (`index.tsx@477eb43`)

| Elemento | Tipo | Definição/fórmula no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Botão sincronizar "tudo" (`SyncButton alvo="tudo"`) | ação-botão | Topo da página, à direita (`:441-443`) | Rodapé da página (`index.tsx:566-568`) | MOVIDO | Saiu do topo e foi para o fim, depois de "Ver gráficos do período". |
| Estado "carregando" | aviso-estado | "Carregando métricas…" (`:348-350`) | "Lendo os dados do período…" (`:374`) | ALTERADO (aparência) | — |
| Estado vazio "Sem dados sincronizados nesse período…" + `SyncButton tudo` | aviso-estado | Se `getMonthlyMetrics` volta 0 linhas: caixa amarela, texto e botão sincronizar no meio (`:353-368`) | Não existe mais como tela própria. A página renderiza e mostra o alerta "Nenhum dia com dado do Instagram neste período…" (`resultado.ts:98`) | ALTERADO (aparência) | O alerta só aparece se `fontes.tem_instagram !== false`. O botão sincronizar continua no rodapé. |
| Período anterior (janela de comparação) | regra de cálculo | `diasPeriodo = end − start + 1`; `prevEnd = start − 1`; `prevStart = start − diasPeriodo` (`:319-326`), com `end` sem limite | Mesma fórmula, mas com `fim = min(end, hoje)` (`index.tsx:337-341`) | ALTERADO (cálculo) | Correção de bug (junto com "Este mês"): o período anterior deixa de ser mais longo que o atual. |
| Regra "vs. período anterior" | regra de cálculo | `temAnterior = ant.length ≥ ceil(data.length × 0,8) && data.length ≥ 7`; variação só se `antes > 0`; `% = (atual − antes)/antes`, sem casas decimais, texto "X% vs. período anterior" com seta de tendência (`:385-396`). Conta **todas** as linhas diárias. | `comparavel = comReach.length ≥ 7 && antReach.length ≥ comReach.length × 0,8`, contando só dias com `reach != null`; texto "▲/▼ X% vs. período anterior" (`resultado.ts:164-176`) | ALTERADO (cálculo) | Mantém os 80% e o mínimo de 7 dias, mas o denominador agora é "dias com alcance" e não "linhas". Vale para alcance e novos seguidores. A comparação de **Salvamentos** sumiu junto com o card. |
| Bloco "O que aconteceu" (`ResumoDoMes`) — cabeçalho | insight-texto | Título "O que aconteceu" + `periodLabel` (`resumo-do-mes.tsx:206-221`); some se não houver nenhuma linha | Cartão "Resumo executivo · {periodLabel}" com veredito e lista `r.resumo` (`index.tsx:415-433`) | ALTERADO (aparência) | Mesmo papel. O conteúdo das frases mudou (ver linhas abaixo). |
| Frase "N publicações no período" | insight-texto | `publicados = posts.length` (`resumo-do-mes.tsx:96-102`) | Dentro da 1ª frase do resumo: "{alcance} pessoas viram o perfil e {novos} começaram a seguir, com N publicações." (`resultado.ts:380`) | ALTERADO (aparência) | Só aparece se existir a métrica de alcance (dias com `reach`). Antes aparecia sozinha, só com posts. |
| Frase "A mais salva foi '…', com N salvamentos" (com link) | insight-texto | Post com maior `saved` entre os posts do período, legenda cortada em 60 caracteres e link para `permalink` (`resumo-do-mes.tsx:98-116`) | — (no Resultado). O mesmo post aparece como nº 1 (coroa) em Posts › "Top 5 do período", e em Melhores › "Top 20 posts" ordenado por Salvamentos | REMOVIDO | Some do Resultado. O dado existe em outra tela (Posts/Melhores), mas a frase não. |
| Frase de anúncios: "R$ X investidos… trouxeram N conversas a R$ Y cada" / "…e nenhuma conversa iniciada" | insight-texto | `gasto = ads_resumo.gasto` (RPC, soma de `spend`); `conversas = ads_resumo.conversas` (**todas** as campanhas); custo = `gasto / conversas` (`resumo-do-mes.tsx:122-137`) | Resumo: "R$ X investidos em anúncio; os anúncios de mensagem trouxeram N conversas." (`resultado.ts:381-382`) + card "Custo de cada conversa" = `custoPorConversaMensagem` (`resultado.ts:268-277`) | ALTERADO (cálculo) | O denominador agora são só as conversas das **campanhas de mensagem** (`diagnosticarAds`, leitura direta de `meta_ads_daily`). O ramo "nenhuma conversa iniciada" não existe mais. |
| Frase "N campanhas convertem bem abaixo da mediana… É onde cabe mais verba" | insight-texto | Campanhas com veredito `Escalar` do RPC `ads_diagnostico` (custo/conversa ≤ 0,6 × mediana da conta) + soma de gasto e conversas (`resumo-do-mes.tsx:139-156`) | Insights de "Por que aconteceu" e "Próxima ação" vindos de `insightsDeAnuncios()`/`planoDeAcao()` (categoria "Escalar agora", custo ≤ 60% da campanha típica **do mesmo objetivo**) | ALTERADO (cálculo) | A régua passou de "mediana da conta" para "mediana do mesmo objetivo". |
| Alerta "R$ X foram para campanhas que custam caro demais… Ver quais →" | aviso-estado | `desperdicio = Σ gasto` das campanhas com veredito `Cortar` (≥ 2× mediana) + `Sem tração` + `Atrai mas não converte` (`resumo-do-mes.tsx:158-170`), link para `/anuncios` | Card "Verba que não entregou" = `desperdicio / gasto` em %, com status ≥ 20% ruim, ≥ 10% atenção, senão bom; botão "Ver onde a verba vaza" → `/anuncios` (`resultado.ts:254-267`) | ALTERADO (cálculo) | O valor em R$ virou percentual. `desperdicio` agora = `Cortar` + `Sem resultado` do diagnóstico por objetivo (`anuncios-objetivo.ts:496`). Isso exclui "Não medido" e "Volume insuficiente" e não julga tráfego/alcance por conversa. |
| Frase "N atendimentos no WhatsApp, de M pessoas diferentes, com X de espera" | insight-texto | `wts_resumo.atendimentos`, `contatos_distintos`, `espera_mediana_seg`; formato `dur`: < 60 s → "Ns", < 1 h → "Nmin" (arredonda para baixo) (`resumo-do-mes.tsx:27-34, 174-188`) | Resumo: "N atendimentos no WhatsApp, com X de espera típica…" (`resultado.ts:384`) + card "Tempo até responder" | ALTERADO (cálculo) | "de M pessoas diferentes" (`contatos_distintos`) **saiu** do Resultado (continua em Comercial › WhatsApp `atendimento.tsx:135`). Mudou o arredondamento: agora `max(1, round(s/60)) min` (30 s vira "1 min"). |
| Alerta "X% das conversas não foram encaminhadas… Ver atendimento →" | aviso-estado | `sem_roteamento / atendimentos ≥ 30%` (`resumo-do-mes.tsx:190-201`) | Insight "roteamento" de `lerPeriodo` (`leitura-periodo.ts:390`, mesmo limite `≥ 0,3`), botão "Ver conversas sem responsável" → `/atendimento` | MOVIDO | Mesmo limite de 30%. Agora é um card de insight. |
| KPI "Novos seguidores (bruto)" | métrica | `Σ new_followers` de **todas** as linhas de `getMonthlyMetrics(start,end)`; tendência `vsNovos`; dica "bruto, igual ao Instagram · saíram X · líquido ±Y (N dias medidos)" vinda de `analyzeGrowth` (`:370-378, 454`) | Card "Novos seguidores" (`resultado.ts:213-231`): `Σ new_followers` só dos dias com `reach != null`; valor "+N"; status contra `BENCHMARKS.crescimentoMensal` com `mensal = novos / followers_count × (30 / dias medidos)` | ALTERADO (cálculo) | Base de dias diferente (só dias com alcance). A dica bruto/saíram/líquido saiu do Resultado (continua em Conteúdo › "Crescimento: bruto x líquido"). Ganhou status de mercado. |
| KPI Alcance — variante "Alcance (contas únicas)" | métrica | Se `getResumoPeriodo().alcance_unico != null`: mostra o alcance único; dica "igual ao 'Contas alcançadas'… {de} a {ate} (últimos 30 dias do período) · Soma dos dias: X"; **sem** tendência (`:455-462`) | Card "Pessoas alcançadas" = `unico ?? reachSoma` (`resultado.ts:179-193`) | ALTERADO (cálculo) | **Possível regressão:** a comparação "vs. período anterior" agora aparece mesmo quando o valor é o alcance **único**, mas ela é calculada com a **soma diária** (`variacaoTexto(reachSoma, …)`). O baseline evitava misturar as duas coisas. A dica com o intervalo `de–ate`, o aviso "(últimos 30 dias do período)" e "Soma dos dias" saíram. |
| KPI Alcance — variante "Alcance (soma dos dias)" | métrica | `Σ reach` diário + tendência `vsAlcance` + dica "a mesma pessoa conta em mais de um dia" (`:463-465`) | Mesmo card, com a explicação equivalente | ALTERADO (aparência) | Botão novo "Ver alcance dia a dia" leva a `/conteudo`, mas a tela Conteúdo **não tem** gráfico de alcance diário (ele só existe em Resultado › "Ver gráficos do período"). |
| KPI "Taxa de engajamento" | métrica | Se houver `alcance_unico` **e** `interacoes`: `interacoes / alcance_unico × 100`, 1 casa + "%"; senão `Σ total_interactions / Σ reach × 100`; "—" se reach = 0; dica "fórmula da casa; a Meta não publica taxa" (`:374, 383, 466-472`) | Card "Interação" = `inter / base`, com `inter = periodoIg.interacoes ?? Σ total_interactions` e `base = alcance_unico ?? Σ reach`; mostra "X em cada 100"; status contra `BENCHMARKS.engajamentoPorAlcance`; some se `base` ou `inter` = 0 (`resultado.ts:195-211`) | ALTERADO (cálculo) | O fallback agora pode misturar fontes: interações somadas por dia ÷ alcance **único** (quando `interacoes` é nulo e `alcance_unico` não). O baseline exigia as duas da Meta. Também mudou o formato (de "%" para "em cada 100") e o card some quando é zero. |
| KPI "Salvamentos" | métrica | `periodoIg.salvamentos ?? Σ saves`; tendência só quando vem da soma diária; dica "por data da ação, igual ao Instagram ({de} a {ate})" (`:473-480`) | — | REMOVIDO | Não há card de salvamentos no Resultado. O mais próximo: Posts › KPI "Salvamentos" (soma de `saved` dos posts **publicados** no período, outra definição) e Público › Interações (últimos 30 dias, janela fixa). |
| Aviso de cobertura | aviso-estado | `diasSemDado = diasDoPeriodo − data.length ≥ 3` → "Os números acima somam os N dias que têm dado (dd/mm a dd/mm), e não os D dias…" + `SyncButton alvo="historico"` só para admin; aparecia **abaixo** dos KPIs (`:398-411, 482-489`) | Alerta "Período incompleto: N de D dias têm dado do Instagram (dd/mm a dd/mm). Totais e comparações valem só para esses dias. [O Instagram só entrega cerca de 30 dias…]"; vermelho se faltam > 40%, amarelo se não; `SyncButton historico` para admin quando `diasComDado < diasPeriodo`; **no topo** (`index.tsx:396-412`, `resultado.ts:89-104`) | ALTERADO (cálculo) | Agora conta só dias com `reach != null` e usa `fim` (limitado a hoje). Passou para o topo. Mantém o limite de ≥ 3 dias faltando. |
| KPIs "Melhor formato" / "Formato mais fraco" | métrica | `computeFormatInsight`: formatos com ≥ 3 posts, mediana de `engagement`, precisa de ≥ 2 formatos; valor = rótulo do formato; dica "{mediana} engaj. (mediana) · {n} posts" (`:491-508`) | Os mesmos números estão no texto `InsightDeFormato`, dentro de "Ver gráficos do período" (`index.tsx:558`) | MOVIDO | Os cards sumiram, mas o texto (que já existia) nomeia o melhor e o pior formato com mediana e contagem. Ficou recolhido. |
| Botão "Baixar relatório PDF" | ação-botão | `gerarEBaixarRelatorioCompleto({start, end, periodLabel})`; estado "Gerando PDF…" (`:428-437, 510-519`) | "Baixar PDF completo do período", ao lado de "Montar relatório para o cliente" (`index.tsx:522-534`) | ALTERADO (cálculo) | Passa `end: fim` (limitado a hoje) em vez de `end`. Mudou o texto e a posição (perto do fim da página). |
| Painel "Alcance e sinais de interesse" (`SinaisDeInteresse`) | métrica | 3 KPIs: Alcance (`Σ reach`), **Toques em contato** (`Σ profile_links_taps`, dica "endereço, ligar, e-mail, mensagem"), Novos seguidores (`Σ new_followers`, dica "só últimos 30 dias…") (`:53-69, 521`) | — | REMOVIDO | **"Toques em contato" (`profile_links_taps`) não aparece em mais nenhum lugar da UI nem do PDF.** |
| Nota "Três sinais paralelos, não um funil" + ajuda "A Meta depreciou 'visitas ao perfil'… não um funil sequencial" | insight-texto | `resumo`/`ajuda` do painel acima (`:59-60`) | — | REMOVIDO | Saiu junto com o painel. |
| Gráfico "Alcance e interações" | gráfico | `AreaChart`, X = `date` (MM-DD), séries `Alcance` (`reach`) e `Interações` (`total_interactions`) de todas as linhas; clique → `DrillDownDoDia` (`:413-417, 523-540`) | "Ver gráficos do período" (`<details>` fechado) › "Alcance e interações por dia" (`index.tsx:542-557`) | MOVIDO | Fica recolhido. Agora filtra os dias sem `reach` (`chartData`, `index.tsx:377`) e omite o gráfico se não houver nenhum. Cores mudaram. |
| Drill-down "O que aconteceu em dd/mm/aaaa" | tabela | Posts com `posted_at.slice(0,10) === data clicada`, ordenados por `reach`; vazio: "Nenhum post publicado nesse dia — …" (`:272-296`) | Igual, dentro do gráfico acima (`index.tsx:250-274, 555`) | MOVIDO | Bug que já existia: compara a data **UTC** de `posted_at`, então post depois das 21h de Brasília cai no dia seguinte. |
| Gráfico "Tendência geral" | gráfico | `LineChart` com 2 eixos Y: `Alcance` (esq.) e `Seguidores ganhos` = `new_followers` (dir.), por dia; clique → drill-down próprio (`selectedDateTrend`); vazio "Sem histórico suficiente ainda."; ajuda com `periodLabel` (`:419-423, 542-567`) | — | REMOVIDO | Seguidores por dia existem em Conteúdo › "Crescimento: bruto x líquido" e no PDF ("Seguidores ganhos por dia"), mas não lado a lado com o alcance e sem drill-down. |
| Insight textual de formato (`InsightDeFormato`) | insight-texto | "{período}, **{melhor}** foi o formato mais forte — engajamento (mediana) de X (n posts), +Y% acima da mediana geral da conta. **{pior}** ficou Z% abaixo (n posts) — vale revisar…" (`computeFormatInsight`, `:242-268`) | "Ver gráficos do período" (`index.tsx:220-246, 558`) | MOVIDO | Texto e fórmula iguais; ficou recolhido. |
| Gráfico "Engajamento por formato" | gráfico | `BarChart`: X = formato, Y = `round(median(engagement ?? 0))` por formato (`computeFormatBreakdown`) (`:205-232`) | "Ver gráficos do período" (`index.tsx:560`) | MOVIDO | Igual; recolhido. |
| "Melhores horários para postar" (ranking clicável) | tabela | Grupos dia da semana × período (Madrugada/Manhã/Tarde/Noite, BRT via `brazilWeekdayAndHour`); só grupos com ≥ 2 posts; mediana do `engagement`; top 5; % contra a mediana da conta; clique abre a lista de posts (`:103-203`) | "Ver gráficos do período" (`index.tsx:81-181, 561`) | MOVIDO | Igual; recolhido. |
| Consulta `getResumoPeriodo` (alcance único/interações/salvos da Meta) | regra de cálculo | `staleTime` 20 min, sem retry (`:334-339`) | `staleTime` 5 min, sem retry (`index.tsx:343, 347`) | ALTERADO (aparência) | Só muda o cache. |

### 1b. Elementos novos no Resultado (não existiam no baseline)

| Elemento | Tipo | Onde está agora | Observação |
|---|---|---|---|
| Veredito do período (Bom/Atenção/Ruim/neutro) | insight-texto | Cartão do resumo executivo (`resultado.ts:357-372`) | Pontos dos insights (peso 3/2/1, "atenção" vale metade) + 1 ponto por card verde/vermelho. Limites: `bom ≥ 1,5×ruim`; `ruim ≥ 1,5×bom e ruim ≥ 3`. |
| Frases "Destaque:" e "Ponto de atenção:" | insight-texto | Resumo executivo (`resultado.ts:385-388`) | — |
| Frases de CRM ("N novos contatos entraram no CRM e M viraram paciente/venda") | insight-texto | Resumo executivo (`resultado.ts:383`) | — |
| "Próxima ação recomendada" + "Também nesta semana" | ação-botão | `index.tsx:436-475` | Até 3 ações, com responsável, impacto, confiança e botão. |
| Cards com status: "Posts por semana", "Verba que não entregou", "Custo de cada conversa", "Novos contatos no CRM", "Tempo até responder" | métrica | Seção 1 "Como estão os números" (`resultado.ts:234-308`) | Réguas em `benchmarks.ts`. Posts por semana = posts de feed (`format !== "stories"`) ÷ (diasPeriodo/7). |
| "Por que aconteceu" (O que está travando / O que está funcionando) | insight-texto | Seção 2 (`index.tsx:492-517`) | Achados de `lerPeriodo` (ritmo, concentração, formato, seguir, constância, anúncios, atendimento, roteamento) + plano de verba + cruzamento leads × engajamento + "conectar fontes". |
| Alertas "ontem/hoje ainda fechando na Meta" e "Sem anúncios/CRM/WhatsApp conectado" | aviso-estado | Topo (`resultado.ts:105-113`) | — |
| Limitações (`ListaLimitacoes`) | aviso-estado | `index.tsx:520` | Também traz as "leituras sem dado" de `lerPeriodo`. |
| Botão "Montar relatório para o cliente" | ação-botão | `index.tsx:523` → `/relatorio` | — |

> **Nota sobre `leitura-do-periodo.tsx`** (só existiu em `78633bf..a77c5c9`): veredito, "O que fazer agora" (lista numerada com link "abrir"), "O que está travando/funcionando" com "números usados" expansível, e "N leituras sem dado suficiente". Tudo foi absorvido no Resultado atual (veredito, próxima ação + semana, insights com evidência, `ListaLimitacoes`). Ele nunca fez parte do baseline.

---

## 2. Conteúdo (aba "Visão") — `src/routes/_authenticated.$clientId.conteudo.tsx`

Mudanças: só visuais (`3ada73b`). A regra de cálculo das datas dos posts mudou por causa de `limitesBR` (`a77c5c9`).

| Elemento | Tipo | Definição/fórmula no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Cabeçalho "Conteúdo" + período + ajuda "Seguidores, projeção de 30 dias…" | insight-texto | `:79-93` | Igual | MANTIDO | Na navegação a aba se chama "Visão". |
| Botão `SyncButton alvo="posts"` | ação-botão | Só se `tem_instagram` (`:87-91`) | Igual | MANTIDO | Alvo de toque maior no celular. |
| Estados: carregando / erro de fontes / `SemFonte SEM_INSTAGRAM` / erro de métricas | aviso-estado | `:95-106` | Igual | MANTIDO | — |
| Janela da consulta de posts | regra de cálculo | `getPostsForAnalytics(start, end+"T23:59:59")` → `posted_at ≥ "start"` (00:00 **UTC**) e `≤ end 23:59:59` **UTC** (`:71`) | `limitesBR`: `≥ start 00:00-03:00` e `< (end+1) 00:00-03:00` | ALTERADO (cálculo) | Correção de fuso. Antes entravam posts das 21h–24h BRT do dia anterior ao início e saíam os das 21h–24h BRT do último dia. |
| KPI "Seguidores hoje" | métrica | Último `followers_count` entre `start` e `min(end, hoje UTC)`; dica "última coleta em dd/mm" (`:122-127`, `analyzeFollowers`) | Igual | MANTIDO | — |
| KPI "Variação no período" | métrica | `último − primeiro` ponto (≥ 2 pontos); vermelho se < 0 (`:128-134`) | Igual | MANTIDO | — |
| KPI "Projeção em 30 dias" | métrica | Regressão linear (mínimos quadrados) nos pontos; `projetado = slope×(xLast+30)+intercept`; exige ≥ 5 dias com dado **e** cobertura ≥ 60%; dica "+X por dia, até dd/mm" (`:135-145`, `hub-conteudo.ts:173-211`) | Igual | MANTIDO | — |
| KPI "Dias com contagem" | métrica | `daysWithData de expectedDays`; dica "X% do período (mínimo 60%)" (`:146-152`) | Igual | MANTIDO | — |
| Painel "Crescimento: bruto x líquido" — KPI "Novos seguidores (bruto)" | métrica | `Σ new_followers` dos dias **fechados** (data ≤ hoje UTC − 2) **com saída medida** (`analyzeGrowth`) (`:164-170`) | Igual | MANTIDO | `DIAS_PARA_FECHAR = 2`; "hoje" é a data UTC. |
| KPI "Deixaram de seguir" | métrica | `Σ unfollowers` dos mesmos dias; dica `taxaSaida = saídas/novos` em % (`:171-177`) | Igual | MANTIDO | — |
| KPI "Líquido" | métrica | `novos − saídas`; dica "N dias medidos" (`:178-184`) | Igual | MANTIDO | — |
| Gráfico bruto x líquido | gráfico | `ComposedChart` por dia: barras `Novos` (+) e `Saíram` (−) empilhadas; linha `Líquido`; tooltip marca "(em fechamento)" (`:186-204`) | Igual (`grafico-caixa`, legenda `LEGENDA`, `interval="preserveStartEnd"`, eixo Y 44 px) | ALTERADO (aparência) | — |
| Selos "N dias em fechamento, fora das somas" / "N dias sem saída medida, fora das somas" | aviso-estado | `:205-212` | Igual | MANTIDO | — |
| Gráfico "Evolução de seguidores" | gráfico | `LineChart`: `Seguidores` (medido) + `Projeção` tracejada do último ponto até +30 dias; vazio: "Sem gráfico: …" (`:217-240`) | Igual (`grafico-caixa`, eixo Y 48 px) | ALTERADO (aparência) | — |
| Aviso "Não projetamos: faltam…" + ajuda (inclui a dica "Nos últimos 30 dias a série já é suficiente…") | aviso-estado | `projection.reason` (`:241-247`, `hub-conteudo.ts:176-192`) | Igual | MANTIDO | — |
| Selo "Há dias sem coleta no período" | aviso-estado | Projeção OK e `gaps.length > 0` (`:248-250`) | Igual | MANTIDO | — |
| Estado "Nenhum post no período" | aviso-estado | `fm.total === 0` (`:254-259`) | Igual | MANTIDO | — |
| Destaque "{Formato} alcança mais por post" | métrica | Maior `reachMedian` entre os formatos com ≥ 3 posts (exclui "não classificado"); mostra mediana, nº de posts e salvos médios (`:264-280`) | Igual | MANTIDO | — |
| "Melhor formato: ainda sem resposta" | aviso-estado | `melhorFormatoMotivo` (`:281-285`) | Igual | MANTIDO | — |
| Tabela "Posts por formato" | tabela | `groupStats` por `format` (inclui "não classificado"), ordenado por alcance mediano; top 12; barra; selo "1º"; selos com nº de posts, média de alcance e salvos médios (`:20-54, 288-294`) | Igual | ALTERADO (aparência) | Grade `minmax(min(340px,100%),1fr)` para o celular. |
| Tabela "Posts por pilar / tema" | tabela | Igual, por `tema`; subtítulo "X de Y posts têm tema classificado (classifique os demais na aba Posts)" (`:295-301`) | Igual | MANTIDO | — |
| Estado vazio do grupo + ajuda "Sem {col} informado…" | aviso-estado | `:25-29` | Igual | MANTIDO | — |

---

## 3. Posts — `src/routes/_authenticated.$clientId.posts.tsx`

Mudanças: só visuais (`3ada73b`). A janela de datas mudou via `getRankedPosts` (`a77c5c9`).

| Elemento | Tipo | Definição/fórmula no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Janela da consulta (`getRankedPosts`) | regra de cálculo | `posted_at ≥ "start"` e `≤ "end"` (strings de data = 00:00 **UTC**), ordenado por `saved` desc (`client-data.ts:42-52@477eb43`) | `limitesBR`: `≥ start 00:00-03:00` e `< end+1 00:00-03:00` | ALTERADO (cálculo) | **Correção de bug relevante:** antes, os posts do **último dia inteiro** do período ficavam de fora (e entravam as 21h–24h BRT da véspera do início). |
| Botão `SyncButton alvo="posts"` | ação-botão | `:1061-1063` | Igual | MANTIDO | — |
| Estado "Carregando posts…" | aviso-estado | `:1055` | Igual | MANTIDO | — |
| KPI "Posts no período" | métrica | `posts.length` (`:227-236`) | Igual | MANTIDO | — |
| KPI "Salvamentos" | métrica | `Σ saved` dos posts | Igual | MANTIDO | — |
| KPI "Engajamento" | métrica | `Σ engagement` dos posts | Igual | MANTIDO | — |
| KPI "Com tema" | métrica | `% = round(posts com tema / total × 100)` + "(n/total)" + barra (`:231-254`) | Igual | MANTIDO | — |
| "Top 5 do período" | tabela | 5 primeiros por `saved` (ordem da consulta); coroa no 1º; salvos na miniatura (`:259-299`) | Igual | MANTIDO | — |
| "Ranking de posts" — filtros por formato | filtro | Botões "Todos" + `CONTENT_FORMATS`, com contagem; trocar o filtro reinicia "ver todos" (`:327-354`) | Igual | MANTIDO | — |
| Ranking — cartão do post | tabela | Posição, miniatura, 1ª linha da legenda com link, Salvos/Engajamento/Alcance, data, barra de salvos relativa ao 1º, selos de formato/tema/funil/estágio (`:118-224`) | Igual | MANTIDO | — |
| Ranking — lápis "Classificar" e "+ classificar" | ação-botão | Edita `tema` (input, no blur), `funnel_stage`, `methodology_stage` e `format` via `classifyPost`; invalida `ranked-posts` e `next-angles` (`:122-126, 152-221`) | Igual | MANTIDO | — |
| Ranking — paginação | ação-botão | 10 por página; "Ver todos os N posts" / "Mostrar menos" (`:371-381`) | Igual | MANTIDO | — |
| Ranking — vazios ("Sem posts sincronizados…", "Nenhum post nesse formato…") | aviso-estado | `:356-363` | Igual | MANTIDO | — |
| "O que repetir e o que revisar" | insight-texto | Por tema: mediana de `engagement/reach` por post; só temas com ≥ 10 posts; linha de corte = mediana das medianas; Repetir ≥ corte, Revisar < corte; vazio pede 10 posts classificados (`:413-446`, `report-metrics.ts:179-197`) | Igual | MANTIDO | — |
| "Conceitos vencedores" | tabela | Um post por tema: maior `saved/reach`; top 7; "X% salvam" (`:448-483`) | Igual | MANTIDO | — |
| "Quem mais salva" | tabela | Top 5 por `saved/reach` (`reach > 0`) (`:504-526`) | Igual | MANTIDO | — |
| "Quem mais circula" | tabela | Top 5 Reels por `shares/reach` (`:527-541`) | Igual | MANTIDO | — |
| "Conversão real por tema e formato" | tabela | Mediana de `saved ?? 0` por tema × formato; top 10 (`:546-578`) | Igual | MANTIDO | — |
| "Alcance por tema e por formato" | tabela | `round(median(reach))` por tema e por formato (`:580-637`) | Igual | MANTIDO | — |
| "Tema dentro de cada formato" (matriz) | gráfico | Célula = mediana de `engagement/reach` × 100; cor = `15 + 70 × taxa/máx`; tooltip com nº de posts e alcance mediano (`:641-716`) | Igual + aviso "Arraste para o lado para ver todos os formatos →" e rolagem `rola-x` | ALTERADO (aparência) | — |
| "Melhores ganchos" | tabela | 1ª linha da legenda dos 8 posts com mais `engagement` (`:718-760`) | Igual | MANTIDO | — |
| "Retenção dos reels" | métrica | Hook rate = `(1 − reel_skip_rate) × 100`; KPIs com mediana e média ponderada por `views`; tempo assistido em segundos; top 8; aviso "Baseado em X de Y reels"; painel explicando quando não há dado (Windsor) (`:762-822`) | Igual | MANTIDO | — |
| "Próximos ângulos" | insight-texto | `getNextAngles(clientId)` (RPC; **não usa o período**); selos de tema/funil/estágio/formato + justificativa; vazio pede classificação (`:824-872`) | Igual | MANTIDO | — |
| "Explorador de posts" — busca, tema, formato, ordenação | filtro | Busca na legenda; `<select>` de tema; `<select>` de formato; ordenar por alcance/engajamento/salvos/mais recentes (`:926-949`) | Igual (campos com 44 px no celular) | ALTERADO (aparência) | — |
| Explorador — Galeria/Tabela | seletor | Galeria com 24 por vez e "Ver mais (N restantes)"; tabela com cabeçalhos clicáveis (Data/Alcance/Engaj./Salvos) e link "abrir ↗" (`:950-1039`) | Igual; a tabela vira cartões no celular (`empilha` + `data-label`) | ALTERADO (aparência) | — |

---

## 4. Top conteúdos (aba "Melhores") — `src/routes/_authenticated.$clientId.top.tsx`

| Elemento | Tipo | Definição/fórmula no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Cabeçalho "Top conteúdos" + "Os 20 melhores do período" + ajuda (aviso de números só orgânicos) | insight-texto | `:275-284` | Igual | MANTIDO | Na navegação: "Melhores". |
| Estados (carregando, erro de fontes, sem Instagram, carregando posts, erro) | aviso-estado | `:285-306` | Igual | MANTIDO | — |
| Janela da consulta de posts | regra de cálculo | `getPostsForAnalytics(start, end+"T23:59:59")` — limites em UTC (`:267`) | `limitesBR` (BRT) | ALTERADO (cálculo) | Correção de fuso. |
| Abas "Top 20 posts" / "Top 20 Reels" / "Top 20 stories" | seletor | `:292-299` | Igual | MANTIDO | — |
| Seletor "Ordenar por" (posts/Reels) | filtro | `METRICAS`: Salvamentos (padrão), Alcance, Engajamento, Compartilhamentos, Curtidas, Comentários, Visualizações (em posts só se algum tiver `views`), Salvamentos por alcance (`:308-314`) | Igual | MANTIDO | — |
| Contador "N posts/Reels no período" | métrica | `todosDoTipo.length` (Reel = `ehReel`; feed = `ehPostDeFeed`) | Igual | MANTIDO | — |
| Ranking top 20 | tabela | `topN(posts, tipo, métrica, 20)`; posição com troféu no top 3, gancho, formato, tema, "quando" (dia da semana, data e hora em BRT), valor; números de alcance, salvos, compartilhamentos, curtidas, comentários e, em Reels, visualizações, "Pulam" (`skip×100` se ≤ 1) e tempo médio (`:72-115`) | Igual | MANTIDO | — |
| "O que os melhores têm em comum" | insight-texto | `padroesDoTop(top, todosDoTipo)`: só características que diferem ≥ 15 p.p. (`DIFERENCA_MINIMA`) do conjunto (`:31-56`) | Igual | MANTIDO | — |
| Vazio "Sem posts/Reels com essa métrica" | aviso-estado | `:317-318` | Igual | MANTIDO | — |
| Stories — consulta `instagram_stories` | regra de cálculo | `posted_at ≥ start` (UTC) e `≤ end T23:59:59` (UTC), limite de 2000 (`:133-138`) | `limitesBR(start,end)` (BRT) | ALTERADO (cálculo) | Correção de fuso. |
| Stories — "Ordenar por" | filtro | 7 métricas: alcance, visualizações, interações, respostas, compartilhamentos, visitas ao perfil, novos seguidores (`:117-125, 179-186`) | Igual | MANTIDO | — |
| Stories — ranking top 20 + "N stories guardados no período" | tabela | `:186-216` | Igual | MANTIDO | — |
| Stories — painel "Ranking de stories em breve / Migração pendente" | aviso-estado | Quando a tabela não existe (`:161-176`) | Igual | MANTIDO | — |
| Stories — notas (sem stories / números parciais) | aviso-estado | `:189, 217` | Igual | MANTIDO | — |
| "Stories no ar agora" (ao vivo da Meta) | tabela | `getAudiencia().stories_ao_vivo`: alcance, visualizações, respostas, compartilhamentos (`:221-250`) | Igual | MANTIDO | — |

---

## 5. Audiência (aba "Público") — `src/routes/_authenticated.$clientId.audiencia.tsx`

| Elemento | Tipo | Definição/fórmula no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Cabeçalho "Audiência" + ajuda | insight-texto | `:373-383` | Igual | MANTIDO | Na navegação: "Público". |
| Botão "Atualizar audiência" | ação-botão | `aud.refetch()`; mostra "Lendo da Meta…" enquanto lê (`:384-390`) | Igual | MANTIDO | — |
| Estados (carregando, erro, `nada_a_fazer` → "Audiência indisponível", erro da Meta) | aviso-estado | `:394-400` | Igual | MANTIDO | — |
| Abas Demografia / Alcance e origem / Interações / Melhores horários | seletor | `:39-45, 406-413` | Igual | MANTIDO | — |
| Nota de rodapé "Dados da Meta lidos em… cobrem os últimos N dias; a Meta não permite > 30 dias" | aviso-estado | `:418-421` | Igual | MANTIDO | — |
| Demografia — "Em resumo" | insight-texto | `leituraDemografia(a)` | Igual | MANTIDO | — |
| Demografia — "Idade dos seguidores" | gráfico | Barras por faixa etária (`:84-92`) | Igual | MANTIDO | — |
| Demografia — "Gênero dos seguidores" | gráfico | Barra dividida (`:93-103`) | Igual | MANTIDO | — |
| Demografia — "Seguidores x alcançados" | gráfico | Barras pareadas com % por faixa (`pctDe(valor, total)`) (`:107-121`) | Igual | MANTIDO | — |
| Demografia — "Quem engaja" | gráfico | Barras por idade só se Σ ≥ 50 pessoas (`:122-134`) | Igual | MANTIDO | — |
| Geografia — "Onde estão no Brasil" | gráfico | Mapa por UF (soma das cidades via `ufDaCidade`); Estados top 6; Cidades top 10; ajuda com seguidores sem estado (`:451-470`) | Igual | MANTIDO | — |
| Geografia — "Países" | gráfico | Mapa-múndi (escala de cor pela raiz) + top 6 (`:472-482`) | Igual | MANTIDO | — |
| Alcance — "Em resumo" | insight-texto | `leituraOrigem(a)` | Igual | MANTIDO | — |
| Alcance — "Alcance" seguidores x não seguidores | gráfico | Barra dividida; últimos N dias (`:147-160`) | Igual | MANTIDO | — |
| Alcance — "Visualizações" seguidores x não seguidores | gráfico | `:161-174` | Igual | MANTIDO | — |
| Alcance — "Origem das visualizações" | gráfico | Barras de views por tipo + cartões com views, alcance, interações e selo `interações/alcance` em % (`:178-210`) | Igual | MANTIDO | — |
| Alcance — "Seguiu x deixou de seguir" | métrica | Seguiram, Deixaram de seguir, Saldo (últimos N dias da Meta) (`:213-230`) | Igual | MANTIDO | — |
| Interações — "Em resumo" (2 frases) | insight-texto | "Nos últimos N dias, X% das interações foram {maior}." e "Salvamentos e compartilhamentos… somam X%" (`:242-252`) | Igual | MANTIDO | — |
| Interações — painel "Interações" | gráfico | Barras: curtidas, comentários, salvos e compartilhamentos (Meta, últimos N dias) (`:257-273`) | Igual | MANTIDO | — |
| Interações — "Interações por dia" | gráfico | `BarChart` empilhado por dia (curtidas, comentários, salvamentos, compartilhamentos) de `getMonthlyMetrics(start,end)`; rolagem horizontal com largura mínima de 22 px/dia (`:275-297`) | Igual, sem rolagem horizontal; `grafico-caixa`, `minTickGap=20`, fonte 11, `LEGENDA` | ALTERADO (aparência) | Mesmo dado. |
| Horários — "Em resumo" | insight-texto | `recomendacaoDeHorario({janelas, horasPosts, diasPosts})` | Igual | MANTIDO | — |
| Horários — "Seguidores online" (mapa de calor) | gráfico | Dia da semana × hora em BRT (`:314-316`) | Igual | MANTIDO | — |
| Horários — "5 melhores janelas" | gráfico | `melhoresJanelas(mapa, 5)` (`:320-327`) | Igual | MANTIDO | — |
| Horários — "Por hora do dia" | gráfico | Média dos 7 dias, só a partir das 6h (`:328-336`) | Igual | MANTIDO | — |
| Horários — "E os seus posts?" | gráfico | Mediana de engajamento por hora de publicação, só horas com ≥ 3 posts, top 8 (`:340-350`) | Igual | MANTIDO | — |
| Janela da consulta de posts (Horários) | regra de cálculo | `getPostsForAnalytics(start, end+"T23:59:59")` em UTC (`:303`) | `limitesBR` (BRT) | ALTERADO (cálculo) | Correção de fuso. |

---

## REMOVIDOS OU SEM CAMINHO DE ACESSO

Todas as 5 rotas continuam acessíveis pelo menu, com as mesmas URLs e as mesmas regras de visibilidade. Os itens removidos estão todos no **Resultado**:

| # | Item removido | Local no baseline (`git show 477eb43:…`) | Existe algo equivalente hoje? |
|---|---|---|---|
| R1 | KPI **"Toques em contato"** (`Σ profile_links_taps`), dica "endereço, ligar, e-mail, mensagem" | `src/routes/_authenticated.$clientId.index.tsx:64, 382` (painel `SinaisDeInteresse` `:53-69`, usado em `:521`) | **Não.** O campo não aparece em nenhuma tela nem no PDF. É o único sinal de intenção de contato vindo do Instagram. |
| R2 | Painel "Alcance e sinais de interesse" + nota **"Três sinais paralelos, não um funil"** + ajuda sobre a Meta ter depreciado "visitas ao perfil" | `index.tsx:53-69, 521` | Não (Alcance e Novos seguidores existem como cards; a nota metodológica não existe). |
| R3 | Gráfico **"Tendência geral"** (Alcance × Seguidores ganhos, dois eixos Y, clique → drill-down do dia) | `index.tsx:305, 344-346, 419-423, 542-567` | Parcial: novos seguidores por dia em Conteúdo › "Crescimento: bruto x líquido" e no PDF ("Seguidores ganhos por dia"); não há a sobreposição com alcance nem o drill-down. |
| R4 | KPI **"Salvamentos"** do período (`periodoIg.salvamentos ?? Σ saves`, por data da ação, com variação vs. período anterior) | `index.tsx:380, 396, 473-480` | Parcial: Posts › "Salvamentos" (Σ `saved` dos posts **publicados** no período — outra definição) e Público › Interações (últimos 30 dias, janela fixa). A variação de salvamentos vs. período anterior não existe mais. |
| R5 | Frase **"A mais salva foi '…', com N salvamentos"** (com link) | `src/components/resumo-do-mes.tsx:96-119` (usado em `index.tsx:445-451`) | Sim, em outra tela: Posts › "Top 5 do período" (nº 1) e Melhores › Top 20 posts por Salvamentos. |
| R6 | "de **M pessoas diferentes**" (`wts.contatos_distintos`) na frase de WhatsApp | `resumo-do-mes.tsx:179-180` | Sim, em Comercial › WhatsApp (`atendimento.tsx:135`) e no PDF/relatório. |
| R7 | Ramo **"— e nenhuma conversa iniciada no período"** (gasto > 0 e conversas = 0) | `resumo-do-mes.tsx:133-135` | Parcial: o card "Custo de cada conversa" só aparece se `conversasMensagem > 0`; a ausência de conversas vira insight de anúncios (veredito "Sem resultado"), não essa frase. |
| R8 | Valor em **R$** do desperdício ("R$ X foram para campanhas que custam caro demais…") | `resumo-do-mes.tsx:158-170` | Sim, como **%** no card "Verba que não entregou" (o R$ total investido aparece na explicação; o R$ desperdiçado aparece na tela Anúncios). |
| R9 | Dica do alcance único: intervalo `de–ate`, "(últimos 30 dias do período)" quando `recortado`, e "Soma dos dias: X" | `index.tsx:461` | Não. Fica sem aviso de que o alcance único pode cobrir só os últimos 30 dias de um período maior. |
| R10 | Dica de novos seguidores "saíram X · líquido ±Y (N dias medidos)" | `index.tsx:376-378, 454` | Sim, em Conteúdo › "Crescimento: bruto x líquido". |
| R11 | Cards "Melhor formato" / "Formato mais fraco" | `index.tsx:491-508` | Sim (MOVIDO): texto `InsightDeFormato` dentro de "Ver gráficos do período". Listado aqui só porque o card visível sumiu. |
| R12 | Tela própria de "sem dados" com botão sincronizar no centro | `index.tsx:353-368` | Parcial: alerta "Nenhum dia com dado do Instagram…" no topo + botão sincronizar no rodapé. |

Componentes apagados: `src/components/resumo-do-mes.tsx` (250 linhas; recuperar com `git show 477eb43:src/components/resumo-do-mes.tsx`). `src/components/leitura-do-periodo.tsx` não existia no baseline (`git show a77c5c9:src/components/leitura-do-periodo.tsx` é a última versão).

Itens que ficaram **recolhidos** (continuam acessíveis com 1 clique em "Ver gráficos do período"): gráfico Alcance e interações + drill-down, InsightDeFormato, Engajamento por formato, Melhores horários.

---

## CÁLCULOS ALTERADOS

| # | O que mudou | Antes (477eb43) | Depois (HEAD) | Correção de bug ou mudança de regra? |
|---|---|---|---|---|
| C1 | Fim do preset "Este mês" | `end` = último dia do mês (`date-range.ts:37`) | `end` = hoje | **Correção de bug.** O período anterior do mesmo tamanho virava o mês passado inteiro e os cards mostravam queda falsa. Também muda o rótulo do período em todas as páginas. |
| C2 | Limites de data dos posts (`getRankedPosts`, `getPostsForAnalytics`) — Resultado, Conteúdo, Posts, Melhores e Público/Horários | `gte("posted_at","YYYY-MM-DD")` = 00:00 UTC; `lte` com `"end"` (Posts: 00:00 UTC do último dia → **perdia o último dia inteiro**) ou `"end T23:59:59"` UTC (outros: perdia 21h–24h BRT do último dia) | `limitesBR`: `≥ start T00:00-03:00` e `< (end+1) T00:00-03:00` (`client-data.ts:43-52`) | **Correção de bug** (fuso de Brasília). Em Posts o efeito é grande (o último dia voltou). |
| C3 | Limites de stories (Melhores › stories) e de perguntas (`getPatientQuestionsPeriodo`, fora do escopo) | `≥ start` / `≤ end T23:59:59` em UTC | `limitesBR` | **Correção de bug.** |
| C4 | Fim efetivo das consultas do Resultado e do PDF | `end` | `fim = min(end, hoje BRT)` (`index.tsx:332-337, 387`) | **Correção de bug** (junto com C1). |
| C5 | Regra "vs. período anterior" (80%) | `ant.length ≥ ceil(data.length × 0,8) && data.length ≥ 7` (todas as linhas) | `comReach ≥ 7 && antReach ≥ comReach × 0,8` (só dias com `reach != null`) | **Mudança de regra** (pequena). O limite de 80% e o mínimo de 7 dias foram mantidos. |
| C6 | Comparação do alcance quando o valor é o alcance único | Sem tendência quando o card mostra `alcance_unico` | Mostra a variação da **soma diária** ao lado do **alcance único** (`resultado.ts:185-190`) | **Possível regressão** (mistura duas métricas no mesmo card). Recomendo ocultar a comparação quando `unico != null`, como no baseline. |
| C7 | Taxa de engajamento → "Interação" | Único só se `alcance_unico` **e** `interacoes`; senão soma ÷ soma; formato "X,X%" | `(interacoes ?? Σ total_interactions) / (alcance_unico ?? Σ reach)`; formato "X em cada 100"; status pelo benchmark (média BR ~4,5%) | **Mudança de regra.** Pode misturar interações somadas por dia com alcance único (o numerador fica proporcionalmente maior). Recomendo voltar a exigir os dois da Meta. |
| C8 | Novos seguidores no Resultado | `Σ new_followers` de todas as linhas | `Σ new_followers` só dos dias com `reach != null` + status `mensal = novos/followers_count × 30/diasMedidos` contra `BENCHMARKS.crescimentoMensal` | **Mudança de regra** (base de dias + régua nova). |
| C9 | Aviso de cobertura | `diasDoPeriodo − linhas ≥ 3`, com `diasDoPeriodo` sobre `end` | `diasPeriodo(fim) − dias com reach ≥ 3`; vermelho se > 40% faltando; aviso extra "> 30 dias"; novos alertas de dias abertos e de fontes não conectadas | Mistura de **correção** (fim ≤ hoje) e **mudança de regra/aparência**. |
| C10 | Anúncios: custo por conversa | `gasto total / conversas de todas as campanhas` (RPC `ads_resumo`) | `custoPorConversaMensagem`: só campanhas de mensagem (`diagnosticarAds`) | **Mudança de regra** (intencional, `a77c5c9`: "anúncios por objetivo"). O número de conversas no resumo também passou a ser só de campanhas de mensagem. |
| C11 | Anúncios: desperdício | R$ de `Cortar` (≥ 2× mediana **da conta**) + `Sem tração` + `Atrai mas não converte` (RPC `ads_diagnostico`) | `%` = (`Cortar` ≥ 2× típica **do mesmo objetivo** + `Sem resultado`) ÷ gasto; limites de 20% (ruim) e 10% (atenção); campanhas com < 1000 impressões ou < R$ 50 ficam de fora ("Volume insuficiente"); lead feito no site = "Não medido" | **Mudança de regra** (o commit relata Lana 12% → 3% e Keylon 31% → 17%). |
| C12 | Anúncios: "Escalar" | custo/conversa ≤ 0,6 × mediana da conta | ≤ 60% da campanha típica do mesmo objetivo ("Escalar agora") | **Mudança de regra.** |
| C13 | Formato da espera do WhatsApp (`dur`) | < 60 s → "Ns"; < 1 h → `floor(s/60)` "min" | < 1 h → `max(1, round(s/60))` " min" | Mudança de apresentação/arredondamento. |
| C14 | `computeDuvidasFrequentes` (`report-metrics.ts`, usado no PDF/Dúvidas — fora das 5 páginas) | Jaccard ≥ 0,4 sobre palavras, `count` = nº de comentários | Triagem `analisarVozDoPaciente` (tira spam, o próprio perfil, repetição da mesma pessoa), limiar 0,34, `count` = **pessoas diferentes** | **Mudança de regra** (fora do escopo; registrada porque o arquivo está na lista). |
| C15 | `hub-conteudo.ts` `buildIdeias` / `ideiaParaTexto` / `montarPlano7Dias` (tela Ideias, fora do escopo) | Ideias a partir de perguntas com Jaccard 0,4; modelos por tipo de dúvida | Ideias a partir de grupos de 2+ pessoas, com título, gancho, roteiro, CTA, confiança e aviso CFM | **Mudança de regra** (fora do escopo). `analyzeFollowers`, `analyzeGrowth` e `analyzeFormatsAndTemas` (usados em Conteúdo e Resultado) **não mudaram**. |

Bugs que já existiam e **continuam** (não são regressões): `DrillDownDoDia` compara `posted_at.slice(0,10)` (data UTC), então post depois das 21h BRT cai no dia seguinte (`index.tsx:254`). `analyzeGrowth`/`analyzeFollowers` usam "hoje" em UTC (`hub-conteudo.ts:118, 153` no HEAD).

Inconsistência nova: no Resultado, o card "Pessoas alcançadas" tem o botão "Ver alcance dia a dia", que leva a `/conteudo`, e essa tela não tem gráfico de alcance diário (ele só existe no Resultado › "Ver gráficos do período").

---

## MÉTRICAS POR PÁGINA (baseline 477eb43)

**Resultado (`/$clientId`)**
- Bloco "O que aconteceu": nº de publicações; post mais salvo (salvamentos); gasto em anúncio, conversas e custo por conversa; campanhas "Escalar" (gasto, conversas); desperdício em R$ (Cortar + Sem tração + Atrai mas não converte); atendimentos no WhatsApp, pessoas diferentes, espera mediana; % sem roteamento (≥ 30%).
- KPIs: Novos seguidores (bruto) [+ saíram/líquido na dica, + vs. anterior]; Alcance (contas únicas **ou** soma dos dias, + vs. anterior na soma); Taxa de engajamento (interações ÷ alcance); Salvamentos (+ vs. anterior na soma diária).
- Aviso de cobertura (≥ 3 dias sem dado) + sincronizar histórico (admin).
- Melhor formato / Formato mais fraco (mediana de engajamento, ≥ 3 posts).
- Sinais de interesse: Alcance, Toques em contato, Novos seguidores.
- Gráficos: Alcance e interações (com drill-down); Tendência geral (Alcance × Seguidores ganhos, com drill-down); Engajamento por formato (mediana).
- Insight de formato (texto); Melhores horários (dia × período, mediana de engajamento, ≥ 2 posts, top 5).
- Ações: Sincronizar tudo; Baixar relatório PDF.

**Conteúdo (`/conteudo`)**
- Seguidores hoje; Variação no período; Projeção em 30 dias (≥ 5 dias, ≥ 60% de cobertura); Dias com contagem.
- Crescimento: Novos (bruto), Deixaram de seguir (+ taxa de saída), Líquido; gráfico diário Novos/Saíram/Líquido; selos de dias em fechamento e sem saída medida.
- Evolução de seguidores (medido + projeção).
- Melhor formato por alcance mediano (≥ 3 posts); Posts por formato e por tema (alcance mediano, alcance médio, salvos médios, nº de posts).

**Posts (`/posts`)**
- Posts no período, Salvamentos, Engajamento, % com tema.
- Top 5 por salvos; Ranking por salvos (filtro de formato, classificação).
- Repetir/Revisar (mediana de engajamento/alcance por tema, ≥ 10 posts); Conceitos vencedores (salvos/alcance); Quem mais salva (salvos/alcance); Quem mais circula (compartilhamentos/alcance em Reels); Conversão por tema × formato (mediana de salvos); Alcance mediano por tema e por formato; Matriz tema × formato (mediana de engajamento/alcance); Melhores ganchos (engajamento); Retenção dos reels (hook rate mediana e ponderada, tempo assistido); Próximos ângulos; Explorador (alcance, engajamento, salvos).

**Top conteúdos (`/top`)**
- Top 20 posts / Reels por: salvamentos, alcance, engajamento, compartilhamentos, curtidas, comentários, visualizações, salvamentos por alcance; por post: alcance, salvos, compartilhamentos, curtidas, comentários, (Reels) visualizações, % que pula, tempo médio.
- Padrões do top (diferença ≥ 15 p.p.).
- Stories guardados: alcance, visualizações, interações, respostas, compartilhamentos, visitas ao perfil, novos seguidores; Stories no ar agora: alcance, visualizações, respostas, compartilhamentos.

**Audiência (`/audiencia`)**
- Demografia: idade, gênero, seguidores × alcançados por idade (%), quem engaja por idade, estados, cidades e países.
- Alcance: seguidores × não seguidores (alcance e visualizações), origem das visualizações por tipo (views, alcance, interações, interações/alcance), seguiram/deixaram/saldo.
- Interações: curtidas/comentários/salvos/compartilhamentos (últimos 30 dias) + por dia no período; % da maior interação; % salvos + compartilhamentos.
- Horários: seguidores online (mapa de calor), 5 melhores janelas, média por hora, mediana de engajamento dos posts por hora (≥ 3 posts).
