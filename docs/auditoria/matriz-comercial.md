# Matriz de rastreabilidade: Anúncios e Comercial

- **Baseline:** commit `477eb43`, antes desta sessão.
- **Atual:** `HEAD` (`68c0e40`) mais a árvore de trabalho.
- **Worktree em reescrita:** `worktree-agent-a6ca50fec15ed8eac` (`.claude/worktrees/agent-a6ca50fec15ed8eac`).
- **Data:** 13/10/2026.
- **Tipo:** auditoria só de leitura. Nenhum arquivo-fonte foi alterado.

**Legenda de status**

| Status | Significado |
|---|---|
| MANTIDO | O elemento continua igual. |
| MOVIDO | Saiu desta tela e está em outra tela ou seção. |
| ALTERADO (aparência) | Mesmo dado, apresentação diferente. |
| ALTERADO (cálculo) | Mudou a fórmula, a régua ou o critério. |
| REMOVIDO | Não existe mais em lugar nenhum da interface. |

**Diferenças por arquivo** (`git diff --stat 477eb43 HEAD`)

| Arquivo | Diferença |
|---|---|
| `anuncios.tsx` | +374 / −326 (reescrita) |
| `atendimento.tsx` | +18 / −17 (só aparência) |
| `analisar.tsx` | +8 / −8 (só aparência) |
| `crm-estrutura.tsx` | +1 (aviso de rolagem) |
| `vendas-kommo.tsx` | +10 / −10 (só aparência) |
| `crm-painel.tsx`, `jornada.tsx`, `conversas.tsx`, `vendas.tsx`, `consultas.tsx`, `automacoes.tsx` | sem diferença |
| `src/lib/anuncios-objetivo.ts` | novo, 814 linhas |
| `src/lib/nav.ts` | novo; a navegação saiu de `_authenticated.$clientId.tsx` |
| `supabase/migrations/20261013200000_correcoes_auditoria_dados.sql` | novo, **não aplicado** |

**Situação da worktree `agent-a6ca50fec15ed8eac`, conferida agora**

- Base: `2ec392c`.
- As rotas `crm-painel.tsx` e `jornada.tsx` **ainda não foram modificadas**: `git status` lista só estes arquivos:
  - `M src/lib/client-data.ts`;
  - `?? src/lib/comercial.ts` (800 linhas);
  - `?? supabase/migrations/20261013150000_crm_diagnostico_comercial.sql`;
  - `?? scripts/test-comercial.ts`.
- Por isso, nas seções de crm-painel e jornada, a coluna "Worktree" diz se a lib nova (`comercial.ts` + RPC `crm_diagnostico_comercial`) **cobre** o dado do baseline. Se não cobre, há **risco de perda** quando a tela for reescrita.

---

## 0. Navegação (acesso às telas)

| Tela | Baseline (`_authenticated.$clientId.tsx` L61-82) | Agora (`src/lib/nav.ts`) | Status | Observação |
|---|---|---|---|---|
| anuncios | Menu "Cliente › Anúncios" (fonte anúncios) | Área **Anúncios** › aba Anúncios (fonte anúncios) | MOVIDO | Continua acessível. |
| crm-painel | Menu "Comercial" (fonte crm) | Área **Comercial** › aba "Funil" (fonte crm) | MOVIDO | O rótulo mudou de "Comercial" para "Funil". |
| atendimento | Menu "WhatsApp" (fonte atendimento) | Comercial › "WhatsApp" | MOVIDO | |
| jornada | Menu "Jornada" (admin) | Comercial › "Jornada" (admin) | MOVIDO | |
| conversas | Menu "Conversas" (admin, fonte atendimento) | **Avançado** › Conversas (recolhido) | MOVIDO | Mais escondido: fica no bloco recolhido. |
| analisar | Menu "A analisar" (admin, fonte crm) | Avançado › A analisar | MOVIDO | Mais escondido. |
| crm-estrutura | **Sem link** no menu, só pela URL | Avançado › "Estrutura do CRM" (admin, fonte crm) | MOVIDO (ganhou acesso) | |
| vendas-kommo | **Sem link** no menu, só pela URL | Avançado › "Vendas (Kommo)" (admin, fonte crm) | MOVIDO (ganhou acesso) | |
| vendas / consultas / automacoes | **Sem link** no menu (placeholders) | Avançado (admin) | MOVIDO (ganhou acesso) | |
| Regra do cliente "só CRM" | `CLIENTES_SO_CRM` e `ROTAS_DO_CRM`, com redirecionamento | Igual (`nav.ts` L122-124 e layout L34-41) | MANTIDO | |

Nenhuma tela do escopo ficou sem caminho de acesso.

---

## 1. Anúncios: `_authenticated.$clientId.anuncios.tsx`

**Fontes de dados**

- **Baseline:** as RPCs `ads_resumo`, `ads_por_dia`, `ads_por_objetivo` e `ads_diagnostico`.
- **Agora:**
  - `getAdsDiagnosticoPorObjetivo`, que lê as tabelas `meta_ads_daily` e `meta_ads_campaigns` direto, com paginação, e calcula no cliente em `src/lib/anuncios-objetivo.ts`;
  - `ads_por_dia`, só para o gráfico e para achar o último gasto.
- As RPCs `ads_resumo` e `ads_por_objetivo` seguem em uso **apenas** no relatório em PDF (`src/lib/relatorio-completo.ts` L117-119).
- `ads_diagnostico` ficou **sem uso** (`getAdsDiagnostico` é código morto).

| Elemento | Tipo | Definição no baseline (linha do baseline) | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Botão Sincronizar (anúncios) | ação-botão | `SyncButton alvo="anuncios"` (L249-251, L263-265) | Topo da tela (L475, L493) | MANTIDO | Alvo de toque de 44px no celular. |
| Motivo da parada | aviso-estado | `MotivoParada`: mostra se `data_ate` tem mais de 3 dias de atraso ou se há `motivo`. Texto "Sem dado novo desde dd/mm" + selo do dono + motivo (L131-153) | Igual (L91-113) | MANTIDO | |
| "Carregando…" | aviso-estado | L236-238 | L462-464 | MANTIDO | |
| Estado vazio, anúncios pausados | aviso-estado | "Anúncios pausados: o último investimento registrado foi em DD/MM/AAAA. Não houve gasto em {período}." O último gasto vem de `ads_por_dia` de 2024-01-01 até o fim do período (L226-246) | Igual (L452-472) | MANTIDO | Condição: antes `!resumo \|\| gasto===0` (RPC); agora `!diag \|\| gasto===0` (tabela). |
| Estado vazio, conta ligada sem gasto | aviso-estado | "A conta de anúncios está ligada, mas ainda não tem nenhum gasto registrado." (L245) | L471 | MANTIDO | |
| Estado vazio, conta não ligada | aviso-estado | "Sem investimento registrado em {período}. Se a clínica anuncia, falta ligar a conta…" (L246) | L472 | MANTIDO | |
| Faixa do estado vazio | insight-texto | "Investimento em anúncios do Meta (Facebook e Instagram), por dia e por campanha." (L253) | L479 | MANTIDO | |
| Faixa de cabeçalho | insight-texto | "Meta Ads · {período} · dados reais da conta" (L279) | "Meta Ads · {período} · {n} campanhas" (L508) | ALTERADO (aparência) | |
| Nota "sem pixel nem formulário" | insight-texto | Ajuda (i) da faixa: "Conversa iniciada é o resultado que dá para medir aqui: esta conta não tem pixel nem formulário instalado, então leads e visitas à página chegam zerados e ficam de fora." (L270-277) | — | REMOVIDO | Substituída por "Cada campanha é julgada pelo resultado do objetivo dela…". Leads e visitas agora entram no cálculo (grupos lead e venda). A remoção é coerente com a mudança de regra. |
| KPI Investido | métrica | `ads_resumo.gasto` = soma de `spend`; dica "{n} campanhas" com `count(distinct campaign_id)` (L283) | KPI "Investido" (L514) | MANTIDO | A contagem agora considera só campanhas com gasto ou impressão > 0 no período. Diferença mínima. |
| KPI Conversas iniciadas | métrica | `ads_resumo.conversas` = soma de `conversations`; dica "Direct e WhatsApp" (L284) | L515, dica "WhatsApp e Direct, de todas as campanhas" | MANTIDO | Mesmo número. |
| KPI Custo por conversa | métrica / regra de cálculo | `ads_resumo.custo_por_conversa` = gasto **total** ÷ conversas **totais**; dica "Investido ÷ conversas"; "—" se não há conversa (L285-291) | L516-522: só o **grupo mensagem**, com dica "Só campanhas de mensagem: R$ X ÷ N conversas" | ALTERADO (cálculo) | Ver C1. |
| KPI Impressões | métrica | soma de `impressions`; dica "CPM R$ X" = gasto ÷ impressões × 1000 (L292) | KPI "**Aparições do anúncio**", dica "R$ X a cada mil aparições" (L523) | ALTERADO (aparência) | Mesma fórmula, nome diferente. |
| KPI Cliques no link | métrica | soma de `link_clicks`; dica "CPC" = gasto ÷ **todos os cliques** (`ads_resumo.cpc`) (L293-299) | L524: dica "R$ X por clique" = gasto ÷ **cliques no link** | ALTERADO (cálculo) | Ver C2: correção de bug. |
| KPI CTR | métrica | `ads_resumo.ctr` = **todos os cliques** ÷ impressões × 100, em "x.xx%"; dica "Cliques ÷ impressões" (L300) | KPI "**Cliques a cada 100 aparições**" = cliques no link ÷ impressões × 100, sem "%" (L525) | ALTERADO (cálculo) | Ver C3. |
| Explicação "O que é" dos KPIs | insight-texto | — | Novo bloco `OQueE` (L527-535), com a referência de mercado do custo por conversa | (novo) | |
| Painel "Diagnóstico das campanhas" | painel | Só aparece se `ads_diagnostico` devolve linhas (L303-427) | Painel "**Campanhas: o que fazer com cada uma**" (L362-422), sempre visível | ALTERADO (cálculo) | Vereditos trocados por categorias por objetivo. Ver C4. |
| Resumo da régua (mediana) | insight-texto / regra | "Régua: mediana da conta, R$ X por conversa". Calculada **no cliente**: mediana superior (`custos[floor(n/2)]`) de **todas** as campanhas com custo, sem filtro de volume (L200-204, L307) | Por campanha: frase `comparacao` "A campanha típica de {objetivo} custa …; esta custa Nx isso" | ALTERADO (cálculo) | **Inconsistência no baseline:** a régua mostrada (mediana da página) não era a régua usada no veredito (mediana SQL de campanhas com 500 impressões ou mais). |
| Ajuda do diagnóstico | insight-texto | "'Escalar' é quem converte a menos de 60% dessa mediana; 'Cortar', quem passa do dobro. Campanha que rodou pouco fica como indeterminada." (L309-315) | Ajuda (i) do painel Campanhas lista `EXPLICA_CATEGORIA` das 6 categorias (L376-384) | ALTERADO (aparência) | Os limites de 0,6x e 2x continuam, agora dentro do objetivo. |
| Cartões-resumo por veredito | métrica / tabela | Para cada veredito presente: selo, gasto, barra (gasto ÷ total), "N campanhas · N conversas" (L317-331) | Botões de **filtro** por categoria: "Categoria N · R$ gasto" (L386-409) | ALTERADO (aparência) | **Perdeu a contagem de conversas por grupo de veredito** e a barra de fatia da verba. |
| Filtro por categoria | filtro | — | Novo: botões "Todas" + categorias, com texto explicativo da categoria escolhida (L386-414) | (novo) | |
| Veredito "Escalar" | regra | SQL: `cpconv <= mediana_cpconv × 0,6` (mediana da conta) | Categoria "**Escalar agora**": custo por resultado ≤ 0,6x a típica do **mesmo objetivo**, sem fadiga | ALTERADO (cálculo) | Ver C4. |
| Veredito "Cortar" | regra | `cpconv >= mediana × 2` | Categoria "Cortar": custo ≥ 2x a típica do objetivo **ou** resultado = 0, **e** atenção abaixo da típica | ALTERADO (cálculo) | Absorveu o antigo "Sem tração". |
| Veredito "Atrai mas não converte" | regra | `conversas = 0 AND ctr(todos os cliques) >= mediana do ctr` | Categoria "**Revisar público**": resultado = 0 ou custo ≥ 2x, **e** CTR de link ≥ referência do grupo | ALTERADO (cálculo) | O rótulo antigo não existe mais. |
| Veredito "Sem tração" | regra | `conversas = 0 AND ctr < mediana` | Categoria "**Cortar**" (resultado 0 e atenção baixa) | ALTERADO (cálculo) | O rótulo antigo não existe mais. |
| Veredito "Manter" | regra | dentro de (0,6x; 2x) da mediana da conta | "Manter": dentro da faixa do objetivo, sem queda de atenção | ALTERADO (cálculo) | |
| Veredito "Volume insuficiente" | regra | `impressões < 500 OR gasto < 30` | "**Sem dados suficientes**": `impressões < 1000 OR gasto < 50`. Também cai aqui: objetivo sem régua (menos de 3 campanhas com volume), "Não medido" (cadastro ou venda no site) e objetivo "outro" | ALTERADO (cálculo) | Limites mais altos. |
| Categoria "Revisar criativo" | regra | Não existia. O SQL calculava `ctr_antes` e `ctr_depois`, mas a tela não mostrava | Nova: CTR de link cai 20% ou mais entre a 1ª e a 2ª metade do período; ou custo de 1x a 2x com queda de 10% ou mais | (novo) | |
| Ordem dos vereditos e cores | regra / aparência | `ORDEM_VEREDITO` Escalar › Cortar › Atrai… › Sem tração › Manter › Volume (L63-99) | `ORDEM_CATEGORIAS` Escalar agora › Cortar › Revisar público › Revisar criativo › Manter › Sem dados (lib L108) | ALTERADO (aparência) | A lista agora vem por categoria e depois por gasto. Antes, só por gasto. |
| Alerta de desperdício | insight-texto / regra | "**R$ X (Y% da verba)** foram para campanhas que não geraram uma única conversa no período" = gasto de "Atrai mas não converte" + "Sem tração" (L206-208, L333-340) | — na tela Anúncios. Foi para o **Resumo** (`resultado.ts` L254-265, cartão "Verba que não entregou"), a **Leitura do período** (`leitura-periodo.ts` L305-330) e o envio do relatório (`relatorio-envio.ts` L517-537) | MOVIDO + ALTERADO (cálculo) | Ver C5. A tela Anúncios não mostra mais o total desperdiçado. |
| Card de campanha: miniatura e link | tabela | Miniatura + nome com link para o permalink, truncado em 64 caracteres (L357, L367-382) | Igual (L282, L288-296) | MANTIDO | |
| Card: selo do veredito | rótulo | `Veredito` (L360) | `SeloCategoria` + selo do objetivo (L285-286) | ALTERADO (aparência) | Novo selo do grupo (mensagem, tráfego…). |
| Card: CTR da campanha | métrica | "CTR x.xx%" com **todos os cliques** (SQL `ads_diagnostico.ctr`), sempre que não nulo (L361-365) | Frase "De cada 100 vezes que o anúncio apareceu, X viraram clique no link", só se impressões ≥ 1000; em tráfego, compara com a referência de médicos (0,83) (L323-334) | ALTERADO (cálculo) | Cliques no link. Fica oculto abaixo de 1000 impressões. |
| Card: motivo | insight-texto | `motivo` do SQL (frases da mediana da conta, L84-97 do SQL) | "Por quê: " + `c.motivo` (L319-322) + frase de comparação (L316-318) | ALTERADO (cálculo) | |
| Card: Investido + barra | métrica | gasto + barra (gasto ÷ total da conta) (L391-399) | `Numero` "Investido" + "N% da verba" (L301) | ALTERADO (aparência) | Barra virou percentual em texto. |
| Card: Conversas + barra | métrica | conversas + barra (conversas ÷ total) (L400-408) | Subtexto "N conversas" dentro de "Resultado" (L306) | ALTERADO (aparência) | **A fatia das conversas totais saiu.** |
| Card: Custo por conversa + barra colorida | métrica / regra | gasto ÷ conversas. Cor: verde ≤ 0,6x mediana, vermelho ≥ 2x, roxo no meio; a barra vai de 0 a max(2x mediana, custo) (L344-353, L409-417) | `Numero` "Custo por conversa" sem barra nem cor, com "não é o objetivo dela" se o grupo não é mensagem (L313) | ALTERADO (aparência) | **A barra colorida contra a mediana saiu.** A comparação ficou em texto. |
| Card: resultado e custo por resultado | métrica | — | Novo: "Resultado ({unidade})" e "Custo por {resultado}" ou "Custo a cada mil aparições" (L302-312) | (novo) | |
| Card: ação, confiança, risco | insight-texto | — | Novos: Ação sugerida, Confiança (alta/média/baixa + motivo), Risco de mexer (L336-357) | (novo) | |
| Nota de rodapé das barras | insight-texto | "Barras de investido e conversas: fatia do total da conta. Barra de custo: comparada à mediana (R$ X); verde = bem abaixo, vermelho = o dobro ou mais." (L423-425) | — | REMOVIDO | Coerente: as barras também saíram. |
| "Se eu tivesse que agir hoje" | insight-texto / ação | — | Novo bloco `AgirHoje` com até 3 ações de verba e valores (L141-178; lib `planoDeAcao` L566-740). Estado vazio: "Nenhuma mudança de verba urgente…" | (novo) | |
| Gráfico de investimento e conversas por dia | gráfico | `ads_por_dia`: barra = gasto do dia, linha = conversas; dois eixos Y; tooltip em R$ e número; data em pt-BR; com ajuda (L429-460) | Igual (L541-565) | MANTIDO | Mudou a posição: agora vem depois das campanhas. |
| Painel "Por objetivo da campanha" | tabela / painel | `ads_por_objetivo`, só **se houver mais de 1 objetivo** (L462-509). Uma linha por objetivo **bruto da Meta** (`LINK_CLICKS`, `OUTCOME_ENGAGEMENT`, "(sem objetivo)"…), com gasto, "N% da verba", barra, N campanhas, N conversas e custo por conversa (gasto do objetivo ÷ conversas do objetivo). Ajuda: "O objetivo escolhido… muda o custo por conversa mais do que qualquer outro ajuste" | Painel "**Para onde foi a verba, por objetivo**" (L181-256). Sempre visível, agrupado em 7 **grupos** (mensagem, cadastro, tráfego, engajamento, reconhecimento, vendas, outros). Por grupo: gasto, % da verba, barra, frase "para que serve", campanhas, resultados na unidade do grupo, custo por resultado e "N conversas (R$ cada)" (fora do grupo mensagem). Alerta novo `conversaMaisBarata`: "Conversa vinda de {grupo} custou R$ X (Nx mais); de mensagem, R$ Y" | ALTERADO (cálculo + aparência) | O **nome bruto do objetivo da Meta não aparece mais**. `OUTCOME_ENGAGEMENT` com 3 ou mais conversas e tráfego com 10 ou mais conversas e taxa de 10% ou mais entram em "mensagem". O custo por conversa do grupo continua sendo gasto ÷ conversas. O `ctr` da RPC já não era exibido no baseline. |
| Nota "alcance não é somado" | aviso | Faixa no rodapé: "Alcance não é somado de propósito (contaria a mesma pessoa várias vezes)", com ajuda (L511-523) | `ListaLimitacoes` item `anuncios-alcance-frequencia`: "Pessoas alcançadas e frequência não aparecem: a soma do alcance de cada dia conta a mesma pessoa várias vezes…" (lib L806-812; tela L567) | MOVIDO | O conteúdo foi preservado e ampliado com a frequência. |
| Limitações | aviso-estado | — | Novos itens: campanhas "Não medido", "pouco volume", "objetivo sem régua" (lib L773-805) | (novo) | |
| Rodapé de referências | insight-texto | — | "Referências de mercado só pintam de cor quando a fonte tem metodologia publicada." (L569-571) | (novo) | |

---

## 2. Comercial / Funil: `_authenticated.$clientId.crm-painel.tsx`

- **Baseline e HEAD:** idênticos, sem diferença.
- **"Worktree":** cobertura pela lib em reescrita (`comercial.ts` / `crm_diagnostico_comercial`). "SIM" significa que o dado existe na lib nova; "NÃO" significa risco de perda se a tela for substituída só pela lib.

| Elemento | Tipo | Definição no baseline (linha) | Onde está agora (HEAD) | Status (HEAD) | Worktree | Observação |
|---|---|---|---|---|---|---|
| Nome do CRM | regra | `nomeCrm`: clint→Clint, rdstation→RD Station, flwchat→WTS Chat, kommo→Kommo, planilha→planilha, senão "CRM" (L37-44) | igual | MANTIDO | parcial (`provider` em `DadosComerciais`) | |
| Botão Sincronizar (crm) | ação-botão | Só para kommo, clint, rdstation ou flwchat e quando não é o cliente-relatório (L344-348) | igual | MANTIDO | NÃO (tela) | |
| "Carregando…" | aviso-estado | L320 | igual | MANTIDO | — | |
| Estado vazio | aviso-estado | "Ainda sem leads sincronizados do {CRM} pra esse cliente." quando `total_leads = 0` (L322-328) | igual | MANTIDO | — | |
| Faixa do cliente-relatório | aviso | Para `clientId 8d4b3b3f-…`: "Relatório semanal 31/08–04/09/2026 · **não atualiza sozinho**", com ajuda sobre o relatório Kommo de 08/09 (L340, L349-360) | igual | MANTIDO | NÃO | ID fixo no código. |
| Faixa "ao vivo" | insight-texto | "CRM {nome} · ao vivo, atualiza todo dia". Kommo acrescenta "· leads, não conversas" e uma ajuda longa sobre leads ≠ conversas do chat (L362-383) | igual | MANTIDO | NÃO | Explicação importante para clientes Kommo. |
| Aviso "A configurar" | aviso-estado | `etapasPorConfirmar` = em disputa > 0 **e** consultas = 0 **e** em atendimento = 0 → "**A configurar:** as etapas de consulta agendada e em atendimento ainda não foram marcadas." (L333-335, L386-390) | igual | MANTIDO | parcial (checklist "Padronizar as etapas do CRM") | |
| KPI Leads na base | métrica | `crm_metricas_essenciais.total_leads` = leads com `removido_na_origem is null` ligados a etapa existente. **Base inteira, sem período** (L393) | igual | MANTIDO | SIM (`base.leads`) | |
| KPI Consultas agendadas | métrica | Leads com etapa contendo "Consulta Agendada" **ou** marcada como `consulta_agendada` em `crm_etapa_kpi`. "—" se a configurar. Base inteira (L394-400) | igual | MANTIDO | ALTERADO na lib: "agendados" = etapa de consulta **ou ganho**, mais "agendados prováveis" pelo nome | Regra muda na reescrita. |
| KPI Em atendimento | métrica | (pipeline com "Atendimento" **e** etapa com "Acompanhamento") **ou** marcada `em_atendimento`. Dica = soma de `price` desses leads (`em_atendimento_valor`) (L401-413) | igual | MANTIDO | **NÃO**: não há `em_atendimento` nem o valor em `comercial.ts` nem no SQL novo | **Risco de perda.** |
| KPI Novos (7 dias) | métrica | `occurred_at > now() − 7 dias` (janela fixa, ignora o seletor) (L414) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| KPI Fonte identificada | métrica | `fonte_preenchida_pct` = 100 × leads com `source` ÷ total, 1 casa decimal. Cor de aviso se 0. Dica "nenhum lead com origem preenchida" ou "dos leads têm origem preenchida" (L415-421) | igual | MANTIDO | ALTERADO na lib (`comOrigem` exclui origem igual ao nome do funil; checklist "Preencher a origem do lead") | |
| Funil "do lead ao resultado" | gráfico / tabela | Seis etapas com barra e % sobre `total_leads`: Leads na base; Ainda em disputa (= total − ganhos − perdidos, "não ganhos nem perdidos"); Em atendimento (+ valor); Consultas agendadas; Ganhos; Perdidos (L424-458). Resumo "{N} leads na base — cada barra é a fatia da base" e ajuda | igual | MANTIDO | ALTERADO: o funil novo tem 4 passos (entraram → atendidos → agendaram → compraram), por período | "Em disputa", "Em atendimento" e "Perdidos" como barra: **sem equivalente direto** na lib nova. |
| Taxa de conversão | métrica / regra | ganhos ÷ (ganhos + perdidos), arredondada; "—" se não há decididos. Subtexto "ganhos ÷ (ganhos + perdidos)" (L330-331, L463-470) | igual | MANTIDO | parcial: a lib usa ganhos ÷ leads e agendados ÷ leads ("de cada 10…") | Definição diferente na reescrita. |
| Selo "base curta" | aviso | Se decididos > 0 e < 30% do total: "só {decididos} de {total} com resultado" (L336, L471-477) | igual | MANTIDO | parcial (`ganhoPoucoRegistrado`, checklist "Registrar ganho e perda") | |
| Painel "No período selecionado" | métrica ×4 | `crm_leads_resumo_periodo`: leads com `occurred_at` (fuso de Brasília) entre de e até. **Leads novos** = contagem; **Ganhos** e **Perdidos** = desfecho **atual** desses leads; **Valor dos cards** = soma de `price` (L483-490) | igual | MANTIDO | parcial: o período existe (`escopo: "periodo"`, `c.ganhos`, `c.perdidos`); **Valor dos cards: NÃO** | |
| Gráfico de novos leads por dia | gráfico | `crm_leads_por_dia_periodo`: barras de leads/dia no fuso de Brasília; dias sem lead não aparecem; vazio "Sem leads criados nesse período." (L139-173) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| Atividade recente | tabela | `crm_atividade_recente(12)`: nome (`contact_name` ou `raw.name` ou "Lead #id"), fonte ("Fonte do Lead" no JSON, ou `source` fora do Kommo, ou "Não informado") · pipeline, selo da etapa, "há N min/h/d"; vazio "Nenhum lead recente." (L243-300) | igual | MANTIDO | **NÃO** | O SQL **não filtra** `removido_na_origem` (problema já no baseline). |
| Leads por fonte | tabela / gráfico | `crm_funil_por_campo_periodo` com padrões "%Fonte do Lead%" e depois "%Origem do Lead%" (o primeiro com valor). Exclui "Não informado"; top 8; % sobre a **soma do top 8**; barra relativa ao maior; vazio "Nenhum lead com fonte identificada ainda." (L175-241, L500-509) | igual | MANTIDO | **NÃO** (a lib só conta `comOrigem`, sem distribuição) | O % não é sobre o total de leads. |
| Leads por tipo de procedimento | tabela / gráfico | Mesmo componente, padrão "%Tipo de Procedim%"; vazio "Nenhum lead com procedimento identificado ainda." (L510-519) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| `getCrmLeadsPorDia` (import) | — | Importado e não usado (L26) | igual | — | — | Código morto. |

---

## 3. Jornada: `_authenticated.$clientId.jornada.tsx`

- **Baseline e HEAD:** idênticos.
- **Escopo do dado:** **base inteira**, sem seletor de período.
- **Corpos SQL:** `jornada_resumo`, `buscar_pessoas` e `jornada_pessoa` **não estão no repositório**. A migração `20261008230000_jornada_leitura.sql` é só um `select 1` que remete a `pg_get_functiondef` no banco. As definições abaixo saem da tela.

| Elemento | Tipo | Definição no baseline (linha) | Onde está agora (HEAD) | Status | Worktree | Observação |
|---|---|---|---|---|---|---|
| Painel "Jornada: do post à venda" | painel | Resumo: "Cada pessoa ligada por telefone, @ do Instagram ou identificador do atendimento…" (L90) | igual | MANTIDO | NÃO (tela) | |
| "Calculando…" e erro | aviso-estado | L91-92 | igual | MANTIDO | — | |
| Pessoas identificadas | métrica | `r.pessoas`, "100% das pessoas" (L96) | igual | MANTIDO | NÃO | |
| Comentaram em posts | métrica | `r.comentaram`, % = ÷ pessoas (L97) | igual | MANTIDO | NÃO | |
| Têm conversa no WhatsApp | métrica | `r.conversaram`, % ÷ pessoas (L98) | igual | MANTIDO | NÃO | |
| Viraram lead no CRM | métrica | `r.viraram_lead`, % ÷ pessoas (L99) | igual | MANTIDO | NÃO | |
| Compraram · receita | métrica | `r.ganhos` + `brl(r.receita)` se > 0, % ÷ pessoas (L100) | igual | MANTIDO | NÃO | |
| Cruzamentos | métrica ×3 | "Comentaram **e** viraram lead", "Conversaram **e** viraram lead", "Comentaram **e** conversaram" (L102-106) | igual | MANTIDO | NÃO | |
| Leads sem pessoa | aviso-estado | Se `leads_sem_pessoa > 0`: "{X} de {total} leads do CRM ainda não foram ligados a uma pessoa (sem telefone, @ ou conversa guardada)…" (L107-112) | igual | MANTIDO | parcial: a lib lê `leads_total` e `leads_sem_pessoa` no modo reduzido; no completo usa `comContato` | |
| Resultado por origem do lead | tabela | `r.por_origem`: Origem, Leads, Vendas, Conversão (= vendas ÷ leads), Receita (L117-124) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| Posts que geraram gente de verdade | tabela | `r.posts`: Post (link, legenda até 70 caracteres), Comentaristas, Viraram lead, Compraram, Receita (L126-136) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| Links rastreados | tabela | `r.links`: Link (título ou short_url), Tipo, Cliques, Conversas, Leads, Vendas (L138-145) | igual | MANTIDO | **NÃO** | **Risco de perda.** |
| Busca de pessoa | filtro / seletor | Campo "Nome, @ ou telefone"; busca a partir de 2 caracteres em `buscar_pessoas`; botões "nome · tel final · @" (L147-161) | igual | MANTIDO | **NÃO** | |
| Linha do tempo da pessoa | tabela | `jornada_pessoa`: eventos com data e `ROTULO`: comentario→"Comentou num post", lead_criado→"Virou lead no CRM", mensagem_whatsapp→"Chamou no WhatsApp", clique_link→"Clicou num link"; mais legenda ou detalhe (L17-22, L162-173) | igual | MANTIDO | **NÃO** | Pela nota da migração, `jornada_pessoa` registra o acesso em `acessos_conversas` (auditoria LGPD). |
| Selos de lead da pessoa | métrica | "Comprou", "Perdido" ou "Em aberto", mais valor e origem; "N conversa(s) no WhatsApp" (L174-181) | igual | MANTIDO | **NÃO** | |

---

## 4. WhatsApp / Atendimento: `_authenticated.$clientId.atendimento.tsx`

| Elemento | Tipo | Definição no baseline (linha / SQL) | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Botão Sincronizar (atendimento) | ação-botão | L92-94, L118 | igual | MANTIDO | |
| "Carregando…" | aviso-estado | L85-87 | igual | MANTIDO | |
| Estado vazio | aviso-estado | "Nenhum atendimento no período ({período}). Se a conta da WTS acabou de ser ligada, use o botão acima." (L89-100) | igual | MANTIDO | |
| Cabeçalho | insight-texto | "Atendimento no WhatsApp · {período}" (L115-117) | igual | MANTIDO | |
| Aviso "clínica inteira" | insight-texto | "Estes números são **da clínica inteira**, não de uma médica… departamento, tag, número e agente foram testados e nenhum separa." (L123-131) | igual | MANTIDO | Texto fixo de um cliente específico, mostrado para todos (problema já no baseline). |
| KPI Atendimentos | métrica | `wts_resumo.atendimentos` = sessões com `started_at` no período; dica "{contatos distintos} pessoas diferentes" (L134) | igual | MANTIDO | A janela muda se a migração nova for aplicada (C6). |
| KPI Espera até a 1ª resposta | métrica | mediana de `wait_seconds`; dica "mediana de {cobertura} atendimentos com o dado" (L135-139) | igual | MANTIDO | Formato `dur`: s / min / h. |
| KPI Tempo até fechar | métrica | mediana de `service_seconds`; dica "quando a conversa é encerrada — não é tempo de atendimento" (L140-144) | igual | MANTIDO | |
| KPI Em andamento agora | métrica | `IN_PROGRESS` entre as sessões **iniciadas no período**; dica "{concluídos} concluídos no período" (L145-149) | igual | MANTIDO | O rótulo "agora" é impreciso (problema já no baseline). |
| Sem roteamento | métrica / regra | `sem_roteamento` ÷ atendimentos × 100; fica âmbar se > 40%. Regra: `department_id is null OR departamento = 'Geral'`. Texto "caíram em 'Geral'" e explicação (L152-166) | igual | MANTIDO | |
| Nota sobre o "tempo até fechar" | insight-texto | "…Um terço dos encerramentos desta conta acontece em lote — o maior teve 216 conversas fechadas no mesmo minuto…" (L172-181) | igual | MANTIDO | Texto fixo de um cliente (problema já no baseline). |
| Gráfico de volume por dia e espera | gráfico | `wts_volume_diario`: barra = atendimentos; linha = espera mediana em minutos (arredondada); eixo direito em "min" (L183-206) | igual (L184-207) | ALTERADO (aparência) | Mudaram a largura dos eixos, os ticks e o preset da legenda. |
| Tabela Por equipe | tabela | `wts_por_departamento`: Equipe, Atendimentos, Fatia (%, 1 casa), Espera, Até fechar. Rótulos especiais "(sem departamento)" e "(equipe excluída na WTS)" (L208-234) | igual | ALTERADO (aparência) | Classe `empilha` e `data-label` para o celular. |
| Tabela Por atendente | tabela | `wts_por_agente`: Atendente, Atendimentos, Concluídos, Espera, Até fechar; só com `user_id` não nulo; "(agente desconhecido)" (L236-262) | igual | ALTERADO (aparência) | Responsivo. |

---

## 5. Conversas: `_authenticated.$clientId.conversas.tsx`

O arquivo não mudou. Saiu do menu principal para o bloco **Avançado**.

| Elemento | Tipo | Definição no baseline (linha) | Agora | Status | Observação |
|---|---|---|---|---|---|
| Painel "Conversas do WhatsApp" + ajuda | painel | "Telefone aparece só com os 4 últimos dígitos. Cada abertura de conversa fica registrada (quem, quando)." (L111-116) | igual | MANTIDO | |
| Aviso de acesso restrito | aviso | "Acesso restrito e registrado. Atualiza sozinho todo dia." (L117-119) | igual | MANTIDO | |
| Botão Puxar mais conversas | ação-botão | POST `/api/sync/manual` com `alvo=conversas`, `limite=150`, uma rodada (L79-105, L121-128) | igual | MANTIDO | |
| Botão Puxar todas | ação-botão | Repete até 60 rodadas, até `restantes = 0` (L129-136) | igual | MANTIDO | |
| Mensagens de status | aviso-estado | "Buscando…", "{n} conversas trazidas… faltam {x}", "Nada mais a buscar.", "Parou: {erro}. {n} trazidas até aqui." | igual | MANTIDO | |
| Lista de conversas | tabela | `listar_conversas` com `p_limite 200`, `offset 0` (**só as 200 primeiras, sem paginação**); filtra `total_msgs > 0`; nome, data da última mensagem, prévia ou "(mídia)", selos telefone / N msgs / "lead" / "via link" (L55-62, L147-174) | igual | MANTIDO | O limite de 200 já existia no baseline. |
| Vazio / carregando / erro | aviso-estado | "Nenhuma conversa guardada ainda…", "Carregando…", mensagem de erro (L139-145) | igual | MANTIDO | |
| Painel de mensagens | tabela | `ler_mensagens`; balões entrada/saída; "Paciente" ou autor ou "Clínica" · dd/mm hh:mm; rótulos de mídia (áudio, imagem, vídeo, documento, figurinha) (L176-207) | igual | MANTIDO | |
| "Escolha uma conversa à esquerda." e "Abrindo…" | aviso-estado | L177, L181 | igual | MANTIDO | |

---

## 6. A analisar: `_authenticated.$clientId.analisar.tsx`

Mudou só a aparência (tabelas responsivas). Saiu do menu para **Avançado**.

| Elemento | Tipo | Definição no baseline (linha) | Agora | Status | Observação |
|---|---|---|---|---|---|
| Cabeçalho "A analisar" | insight-texto | L117-125 | igual | MANTIDO | |
| Bloqueio para quem não é admin | aviso-estado | "Esta aba é só da equipe Doctor Creator." (L127-134) | igual | MANTIDO | |
| Carregando / erro / vazio | aviso-estado | "Carregando as etapas…", erro com dica de migração, "Nada a analisar neste cliente…" (L135-163) | igual | MANTIDO | |
| Pontos de atenção | insight-texto / regra | Por conexão: (a) nenhum ganho ou perdido → "Nenhum card está como ganho ou perdido…"; (b) "{x} de {y} etapas com cards ainda não foram confirmadas…" (L169-199) | igual | MANTIDO | |
| Confirmar em lote | ação-botão | Duas etapas ("Confirmar as N etapas pendentes como estão" → "Sim, confirmar" / "Cancelar"); grava `resultadoAtual` (L36-79) | igual | MANTIDO | |
| Regra `resultadoAtual` | regra | Confirmado → valor da equipe; senão "ganho" se ganhos ≥ perdidos, ganhos ≥ abertos e ganhos > 0; "perdido" se perdidos > abertos e perdidos > 0; senão "aberto" (L26-31) | igual | MANTIDO | |
| Tabela de etapas | tabela | Etapa (+ pipeline), Cards, Valor, "Hoje conta como" (N ganho · N perdido · N aberto), seletor "Significa" (Aberto, Ganho, Perdido) com estado "salvando… / confirmado pela equipe / a confirmar" (L221-290) | igual (L222-290) | ALTERADO (aparência) | `empilha` + `data-label`. |
| Seletor Significa | seletor / ação | Grava `definirEtapaResultado` e invalida o painel Comercial, o kanban e a atividade (L106-115) | igual | MANTIDO | |
| Cards do Comercial (KPI) | tabela / ação | Caixas "Consulta agendada" e "Em atendimento" por etapa; desabilitadas quando a etapa já é marcada pelo nome; rótulo "pelo nome / sugerido / equipe"; aviso "Hoje nenhuma etapa… conta como consulta agendada"; aviso de migração ausente (L300-392) | igual | ALTERADO (aparência) | Responsivo. |

---

## 7. Estrutura do CRM: `_authenticated.$clientId.crm-estrutura.tsx`

Mudança única: aviso "Arraste para o lado para ver todas as etapas →". Ganhou link no Avançado.

| Elemento | Tipo | Definição no baseline (linha) | Agora | Status | Observação |
|---|---|---|---|---|---|
| Texto de introdução | insight-texto | "Raio-x de como o CRM (Kommo) está organizado agora…" (L139-146) | igual | MANTIDO | O texto diz "Kommo" para qualquer CRM. |
| Carregando / vazio | aviso-estado | "Ainda sem leads sincronizados do Kommo pra esse cliente." (L148-153) | igual | MANTIDO | |
| Leads na base | métrica | soma de `total` de `crm_pipeline_kanban` (L130, L158) | igual | MANTIDO | |
| Pipelines ativos | métrica | número de pipelines (L159) | igual | MANTIDO | |
| Etapas configuradas | métrica | número de linhas (L160) | igual | MANTIDO | |
| Marcados "venda ganha" | métrica / regra | soma das etapas com `status_id = 142` (L22, L133, L161) | igual | MANTIDO | Só vale para o Kommo. |
| Etapas nunca usadas | métrica | vazias / total (L162) | igual | MANTIDO | |
| Kanban por pipeline | gráfico / tabela | Cabeçalho com nome, #id, leads e R$; colunas por etapa com total, valor e etiqueta: Ganho (142), Perda (143), Maior bolsão (= máximo), Ativa, vazia esmaecida (L41-106) | igual + aviso de rolagem | ALTERADO (aparência) | |
| "O que a estrutura revela" | insight-texto ×3 | (1) "{X}% da base ({n}) está parada em '{etapa}'… maior bolsão"; (2) "'Venda Ganha' usado em só {won}… ({x,xx}%) contra {lost} perdidos…"; (3) "{vazias} das {total} etapas… nunca receberam um lead" (L179-204) | igual | MANTIDO | |

---

## 8. Vendas (Kommo): `_authenticated.$clientId.vendas-kommo.tsx`

Mudou só a aparência. Ganhou link no Avançado.

| Elemento | Tipo | Definição no baseline (linha) | Agora | Status | Observação |
|---|---|---|---|---|---|
| Texto de introdução | insight-texto | "Cruzamento real de origem × resultado, direto do CRM (Kommo)…" (L75-82) | igual | MANTIDO | |
| Carregando / vazio | aviso-estado | L84-89 | igual | MANTIDO | O vazio usa o total da tabela por fonte. |
| Por fonte do lead | tabela | `crm_funil_por_campo` (**base inteira**), "%Fonte do Lead%" e depois "%Origem do Lead%". Colunas Fonte, Total, Ganhos, Perdidos, Em andamento (= total − ganhos − perdidos), **Taxa de ganho = ganhos ÷ total** (L11-52, L92) | igual | ALTERADO (aparência) | **Inconsistência no baseline:** aqui a taxa é ganhos ÷ total; no crm-painel, ganhos ÷ (ganhos + perdidos). |
| Por tipo de procedimento | tabela | mesma tabela, "%Tipo de Procedim%" (L93) | igual | ALTERADO (aparência) | |
| Leads por etapa (todos os funis) | tabela | `crm_leads_por_etapa`: Pipeline, Etapa, Leads (L95-122) | igual | ALTERADO (aparência) | |

---

## 9. Vendas / Consultas / Automações (placeholders)

| Tela | Elemento | Baseline | Agora | Status |
|---|---|---|---|---|
| vendas | `PhasePlaceholder` "Fase 2 — Atribuição real / O que virou venda" (Hubla, Hotmart, Eduzz, Kiwify) | idêntico | Avançado (admin) | MANTIDO |
| consultas | `PhasePlaceholder` "Fase 2 / O que virou paciente" (Feegow, Ninsaúde) | idêntico | Avançado (admin) | MANTIDO |
| automacoes | `PhasePlaceholder` "Fase 3 — Motor de regras / Automações" | idêntico | Avançado (admin) | MANTIDO |

---

## REMOVIDOS OU SEM CAMINHO DE ACESSO

Nenhuma tela ficou sem caminho de acesso: todas estão em `src/lib/nav.ts`. Os itens abaixo sumiram da interface. A coluna da direita diz onde restaurar a partir de `git show 477eb43:src/routes/_authenticated.$clientId.anuncios.tsx`.

| # | Elemento removido | Onde estava no baseline | Observação para restaurar |
|---|---|---|---|
| R1 | Total desperdiçado na **tela Anúncios** ("R$ X (Y% da verba) foram para campanhas que não geraram uma única conversa") | `anuncios.tsx` L206-208 e L333-340 | O conceito foi **movido** para Resumo, Leitura e Relatório, com outra definição (C5). Para voltar à tela: `diag.desperdicio` já existe em `DiagnosticoAds`. |
| R2 | Barras por campanha: fatia do investimento, **fatia das conversas** e custo colorido contra a mediana (verde ≤ 0,6x, vermelho ≥ 2x) | L390-418 (cores L344-353) | A fatia de conversas por campanha não aparece em nenhum lugar. A cor contra a régua foi substituída pelo selo da categoria e pela borda colorida. |
| R3 | Nota de rodapé das barras | L423-425 | Coerente com R2. |
| R4 | Cartões por veredito com **contagem de conversas por veredito** | L317-331 | Os botões de filtro mostram N e R$, mas não as conversas. |
| R5 | Rótulo da régua única "mediana da conta, R$ X por conversa" | L200-204, L307, L311 | Substituído pela régua por objetivo (frase `comparacao` em cada campanha). |
| R6 | Nome **bruto** do objetivo da Meta (`LINK_CLICKS`, `OUTCOME_ENGAGEMENT`, "(sem objetivo)") no painel por objetivo | L462-509 (L481-483) | Agora agrupado em 7 grupos. O objetivo bruto existe em `CampanhaDiag.objetivo`, mas não aparece na tela. |
| R7 | CTR por campanha abaixo de 1000 impressões | L361-365 | Agora só aparece com 1000 impressões ou mais (L323). |
| R8 | Nota "esta conta não tem pixel nem formulário… leads e visitas chegam zerados" | L270-277 | Removida de propósito: leads e visitas agora são usados. |
| R9 | Rótulos de veredito "Atrai mas não converte", "Sem tração", "Escalar" (sem "agora") e "Volume insuficiente" na tela | L63-99 | Renomeados ou reclassificados (C4). "Escalar" e "Volume insuficiente" continuam como `veredito` interno, usados pela Leitura do período. |
| W1 | **Risco na worktree, crm-painel:** KPI Em atendimento + valor, Novos (7 dias), Valor dos cards no período, gráfico de leads por dia, Atividade recente, Leads por fonte (top 8), Leads por procedimento, faixa Kommo "leads, não conversas", faixa do cliente-relatório, barras "Ainda em disputa" e "Perdidos" | `crm-painel.tsx` L139-300, L340-383, L401-414, L424-458, L483-519 | `src/lib/comercial.ts` e a RPC `crm_diagnostico_comercial` **não** fornecem esses dados. Se a nova tela usar só essa lib, tudo isso some. Hoje (HEAD) nada foi perdido. |
| W2 | **Risco na worktree, jornada:** tabelas Resultado por origem, Posts que geraram gente, Links rastreados, busca de pessoa, linha do tempo, os 5 contadores e os 3 cruzamentos | `jornada.tsx` L87-184 | A lib nova só usa `leads_total` e `leads_sem_pessoa` de `jornada_resumo`. Os corpos SQL não estão versionados (só no banco). |

---

## CÁLCULOS / REGRAS ALTERADOS

| # | Regra | Antes (baseline) | Depois (HEAD / migração) | Classificação |
|---|---|---|---|---|
| C1 | Custo por conversa (KPI da tela Anúncios) | `ads_resumo.custo_por_conversa` = gasto de **todas** as campanhas ÷ todas as conversas. Dica "Investido ÷ conversas" (meta_ads.sql L107) | Só o grupo "mensagem": MESSAGES; OUTCOME_ENGAGEMENT com 3 ou mais conversas; LINK_CLICKS/OUTCOME_TRAFFIC com 10 ou mais conversas e conversas ÷ cliques ≥ 0,10. Conta gasto do grupo ÷ conversas do grupo (`anuncios-objetivo.ts` L86-101, L488-499). A migração não aplicada faz o mesmo no SQL para o PDF, **mas sem a regra tráfego→WhatsApp** (`20261013200000` L30-34, L44-46) | **Mudança de regra** com motivo documentado: inflação por verba de outros objetivos. A fórmula antiga fazia o que a dica dizia, então não era um bug de código. **Divergência pendente:** a tela e o PDF vão diferir em contas com tráfego levando ao WhatsApp. |
| C2 | CPC ("por clique", dica do KPI Cliques no link) | gasto ÷ **todos os cliques** (`ads_resumo.cpc`, meta_ads.sql L105), exibido sob o rótulo "Cliques no link" | gasto ÷ **cliques no link** (tela L524; migração L42) | **Correção de bug comprovada:** numerador e rótulo não batiam. |
| C3 | CTR (conta e campanha) | todos os cliques ÷ impressões × 100 (`ads_resumo` L104; `ads_diagnostico` L62), "x.xx%" | cliques no link ÷ impressões, "a cada 100 aparições" (tela L488, L525; lib L289; migração L41) | **Correção / mudança de definição:** alinha ao rótulo "cliques no link" e ao que a tela explica. A régua de "atenção" dos vereditos também passou a usar cliques no link. |
| C4 | Veredito / categoria das campanhas | SQL `ads_diagnostico` (ads_criativo.sql L67-97). Régua = mediana do custo por conversa entre campanhas com **500 impressões ou mais** da conta inteira; mediana do CTR com todos os cliques. Volume insuficiente: impressões < 500 ou gasto < R$ 30. Sem conversa e CTR ≥ mediana → "Atrai mas não converte". Sem conversa → "Sem tração". Custo ≤ 0,6x → "Escalar". Custo ≥ 2x → "Cortar". Resto → "Manter". **Toda campanha julgada por conversa** | `diagnosticarAds` (lib L232-465). Resultado **pelo objetivo**: conversa, lead (máximo entre leads e conversas), clique no link, mil impressões em engajamento e alcance, visita à página em vendas. Régua = mediana **do mesmo grupo**, exigindo **3 ou mais campanhas** com 1000 impressões e R$ 50 ou mais; senão "Sem dados suficientes". Limites mantidos: 0,6x e 2x. Categorias novas: Escalar agora / Manter / Revisar criativo (queda de CTR de 20% ou mais, ou 1x–2x com queda de 10% ou mais) / Revisar público (sem resultado ou 2x **com** atenção ≥ referência) / Cortar (sem resultado ou 2x **sem** atenção) / Sem dados suficientes (inclui "Não medido" e "outro"). Volume mínimo: 1000 impressões e R$ 50. Em tráfego, sem 3 campanhas, a referência de atenção vira a de mercado (0,8%) | **Mudança de regra**, justificada no cabeçalho da lib: campanhas de tráfego e alcance eram julgadas por conversa e caíam em "Sem tração" ou desperdício. Também corrige uma **inconsistência do baseline**: a régua exibida na página (mediana superior de todas as campanhas, L204) não era a usada no SQL (só com 500 impressões ou mais). |
| C5 | Desperdício | gasto de "Atrai mas não converte" + "Sem tração", ou seja, campanhas com **zero conversas**, qualquer objetivo (anuncios.tsx L206-208) | `desperdicio` = gasto com veredito "Cortar" (≥ 2x a típica do objetivo) + "Sem resultado" (zero resultados **do objetivo**) (lib L496). Exibido no Resumo ("Verba que não entregou", ruim se ≥ 20%, atenção se ≥ 10%), na Leitura do período e no relatório. Não aparece na tela Anúncios | **Mudança de regra** e **mudança de lugar**. Observação: a Leitura diz "campanhas marcadas 'Cortar'" e "marcadas 'Escalar'" (`leitura-periodo.ts` L325-327), mas a tela mostra "Escalar agora". O veredito Cortar também não equivale à categoria Cortar (uma campanha 2x com boa atenção vira "Revisar público"). |
| C6 | Janela de datas do WhatsApp (wts_resumo, wts_por_departamento, wts_por_agente, wts_volume_diario) | `started_at >= p_start::timestamptz` e `< (p_end+1)::timestamptz`, ou seja, meia-noite no fuso da sessão do banco (UTC = 21h em Brasília). Já o `wts_volume_diario` agrupava pelo dia **de Brasília** | Limites `p_start/p_end` em `America/Sao_Paulo` (migração L60-61, 88-89, 110-111, 125-126) | **Correção de bug** (a inconsistência interna confirma: o filtro em UTC e o agrupamento em Brasília no mesmo SQL). **NÃO APLICADA**: a tela continua com a regra antiga até o `db push`. |
| C7 | Por objetivo | `ads_por_objetivo` por objetivo bruto; custo por conversa = gasto ÷ conversas daquele objetivo; só com mais de 1 objetivo | 7 grupos; resultado e custo por resultado próprios; conversas e custo por conversa à parte; comparação explícita entre grupos (`conversaMaisBarata`: barato com 10 ou mais conversas; caro com 15% da verba ou mais; mostra se ≥ 1,5x); sempre visível | Mudança de regra e de apresentação. |
| C8 | Datas de Instagram e comentários (`client-data`, contexto) | `posted_at` comparado com "AAAA-MM-DD" em UTC | `limitesBR` (fuso de Brasília) | Correção de bug. Fora do escopo direto, citada porque está em `client-data.ts`. |
| C9 | Thresholds por objetivo (novos) | — | `MIN_RESULTADOS` para a confiança (mensagem 10, lead 10, tráfego 100, venda 30…); passo de orçamento de 20%; risco alto se for a maior fonte de conversas (≥ 10 conversas e ≥ 20% delas) ou ≥ 25% da verba; baixo se < 8% | Regras novas, sem equivalente no baseline. |

Telas crm-painel, jornada, conversas, analisar, crm-estrutura, vendas-kommo e placeholders: **nenhuma regra de cálculo mudou no HEAD**.

---

## MÉTRICAS POR PÁGINA (baseline 477eb43)

| Página | Métricas e fórmulas (baseline) |
|---|---|
| **Anúncios** | Investido = Σ spend · Campanhas = distinct campaign_id · Conversas = Σ conversations · Custo por conversa = Σ spend ÷ Σ conversations (todas as campanhas) · Impressões = Σ impressions · CPM = spend ÷ impr × 1000 · Cliques no link = Σ link_clicks · CPC = spend ÷ Σ clicks (todos) · CTR = Σ clicks ÷ impr × 100 · Diagnóstico por campanha: gasto, impressões, cliques no link, conversas, CTR (todos os cliques), custo por conversa, frequência média (não exibida), CTR antes e depois (não exibidos), veredito (6) e motivo · Mediana exibida = mediana superior dos custos por conversa de todas as campanhas · Desperdício = gasto das campanhas com zero conversas · Por dia: gasto e conversas · Por objetivo: gasto, % da verba, campanhas, conversas, custo por conversa |
| **Comercial (crm-painel)** | Base inteira: Leads na base, Consultas agendadas (nome "Consulta Agendada" ou marcação), Em atendimento (pipeline "Atendimento" + etapa "Acompanhamento", ou marcação) e valor, Novos 7 dias (`now() − 7d`), Ganhos, Perdidos, Em disputa = total − ganhos − perdidos, Fonte identificada % = source não nulo ÷ total, Taxa de conversão = ganhos ÷ (ganhos + perdidos), alerta de base curta (decididos < 30%) · Período (dia de Brasília pelo `occurred_at`): novos, ganhos, perdidos, valor (Σ price) · Leads por dia · Atividade recente (12) · Top 8 por fonte e por procedimento (% sobre a soma do top 8) |
| **Jornada** | Base inteira: pessoas, comentaram, conversaram, viraram lead, compraram + receita (% ÷ pessoas); os 3 cruzamentos; leads sem pessoa ÷ leads totais · Por origem: leads, vendas, conversão = vendas ÷ leads, receita · Posts: comentaristas, viraram lead, compraram, receita · Links: cliques, conversas, leads, vendas |
| **WhatsApp** | Atendimentos (sessões iniciadas no período, janela UTC), contatos distintos, espera mediana (+ cobertura), tempo mediano até fechar, em andamento (IN_PROGRESS), concluídos (COMPLETED), sem roteamento % = (dept nulo ou "Geral") ÷ atendimentos (âmbar se > 40%) · Por dia: atendimentos e espera mediana (min) · Por equipe: atendimentos, fatia %, medianas · Por atendente: atendimentos, concluídos, medianas |
| **Conversas** | Lista (até 200): total de mensagens, última mensagem, selos lead e via link · Mensagens da conversa |
| **A analisar** | Por etapa: cards, valor, ganhos, perdidos e abertos; resultado inferido (regra `resultadoAtual`) · Alertas: nenhum decidido; N etapas a confirmar · Marcação de KPI por etapa |
| **Estrutura do CRM** | Leads na base, pipelines, etapas, ganhos (status 142), etapas vazias ÷ total, maior bolsão % = maior etapa ÷ total, % de venda ganha (2 casas) e perdidos (143) |
| **Vendas (Kommo)** | Por fonte e por procedimento (base inteira): total, ganhos, perdidos, em andamento = total − ganhos − perdidos, taxa de ganho = ganhos ÷ total · Leads por etapa |
| **Vendas / Consultas / Automações** | Nenhuma (placeholders). |

---

## Resumo (10 linhas)

1. Nenhuma tela do escopo ficou sem acesso. Conversas e A analisar desceram para "Avançado"; Estrutura do CRM, Vendas (Kommo) e os placeholders **ganharam** link (antes só pela URL).
2. Atendimento, Conversas, A analisar, Estrutura do CRM e Vendas (Kommo): **só aparência**. Comercial e Jornada: **idênticos** no HEAD.
3. Anúncios foi reescrita. O que saiu da tela: o desperdício (foi para Resumo, Leitura e Relatório com nova regra), as barras de fatia e o custo colorido por campanha, a fatia de conversas, as conversas por veredito, a régua única e o nome bruto do objetivo.
4. Preservados e movidos: a nota "alcance não é somado" (agora em Limitações), o gráfico diário, os 3 estados vazios, o motivo da parada e o botão de sincronizar.
5. Regra: os vereditos antigos (Escalar/Cortar/Atrai mas não converte/Sem tração/Manter/Volume insuficiente) viraram 6 categorias **por objetivo** (Escalar agora/Manter/Revisar criativo/Revisar público/Cortar/Sem dados suficientes). Mantêm 0,6x e 2x, agora na mediana do mesmo objetivo, que exige 3 ou mais campanhas.
6. Regra: o volume mínimo subiu de 500 impressões e R$ 30 para 1000 impressões e R$ 50. "Atrai mas não converte" virou "Revisar público" e "Sem tração" virou "Cortar". A categoria "Revisar criativo" (fadiga de CTR) é nova.
7. Custo por conversa agora conta só campanhas de mensagem. É mudança de regra: a fórmula antiga fazia o que a dica dizia. A migração não aplicada replica isso para o PDF, mas **sem** a regra tráfego→WhatsApp, e por isso vai divergir da tela.
8. CPC e CTR passaram a usar cliques no link. No CPC é **bug comprovado** (o rótulo dizia "cliques no link"); no CTR é ajuste de definição. A janela de datas do WhatsApp em Brasília é bug comprovado, mas **ainda não aplicado** no banco.
9. A worktree de reescrita ainda não mexeu nas rotas, mas a lib nova (`comercial.ts` / `crm_diagnostico_comercial`) **não cobre** Em atendimento + valor, Novos 7 dias, Valor dos cards, leads por dia, Atividade recente, as distribuições por fonte e procedimento, nem as tabelas da Jornada (origem, posts, links, busca e linha do tempo).
10. Inconsistências do baseline a decidir: a taxa de ganho do Vendas (Kommo) (ganhos ÷ total) é diferente da taxa de conversão do Comercial (ganhos ÷ decididos); `crm_atividade_recente` não exclui leads removidos; os textos do WhatsApp são fixos de um único cliente; o SQL da Jornada não está versionado.
