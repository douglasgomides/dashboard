# Inventário: Resultados (plano 03.1-03)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
Seção Resultados (03.1-03): as 4 telas estão no molde novo e conferidas em 10/11/2026 contra as capturas de 375 e 1440 px.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/ | Resultados da clínica | Como a clínica foi no período? | D5 | novo | 03.1-03 |  | 10/11/2026 |
| /_authenticated/$clientId/pacientes | Pacientes do período | Onde as pessoas travam do contato até a venda? | D1 | novo | 03.1-03 |  | 10/11/2026 |
| /_authenticated/$clientId/consultas | O que virou paciente | Quantos contatos viraram consulta? |  | novo | 03.1-03 |  | 10/11/2026 |
| /_authenticated/$clientId/vendas | O que virou venda | Quantos contatos viraram venda? |  | novo | 03.1-03 |  | 10/11/2026 |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/ | Avisos de qualidade dos dados | QualidadeDados compacto · cartão Tailwind | NxAviso no detalhe, a partir dos problemas de dado de resultado.r; dado grave também nega a leitura | 03.1-03 |
| /_authenticated/$clientId/ | Retorno do investimento | RetornoInvestimento · ws-panel e ws-metric | NxCard com NxKpi e NxTag de selo, no detalhe Anúncios e retorno; ROI vira fato só com selo confiável | 03.1-03 |
| /_authenticated/$clientId/ | Resultados do Instagram | NxCard com 4 NxKpi (seguidores, taxa de interação, salvamentos) | NxCard com 4 NxKpi, no detalhe recolhido | 03.1-03 |
| /_authenticated/$clientId/ | Prioridade recomendada | NextBestActionPanel · painel azul | saiu: repetia o resumo da clínica (a ação da semana está no resumo) | 03.1-03 |
| /_authenticated/$clientId/ | O que merece atenção nos resultados | NextBestActionCard · cartão Tailwind | saiu: repetia o resumo; as ações estão em O que fazer nesta semana, no detalhe | 03.1-03 |
| /_authenticated/$clientId/ | As 8 respostas do diagnóstico | DiagnosticoEstrategico · cartão Tailwind | NxCard por resposta, no detalhe Todas as análises, com evidência e quem resolve | 03.1-03 |
| /_authenticated/$clientId/ | Outras oportunidades | NextBestActionCard · cartão Tailwind | NxListRow em O que fazer nesta semana, no detalhe | 03.1-03 |
| /_authenticated/$clientId/ | Resumo do período | NxCard com SeloStatus | NxCard com NxTag, no detalhe | 03.1-03 |
| /_authenticated/$clientId/ | Resumo do mês | ResumoDoMes · cartão Tailwind | saiu: repetia o resumo da clínica | 03.1-03 |
| /_authenticated/$clientId/ | O que ajuda a explicar o resultado | InsightCard · cartão Tailwind | NxListRow com evidência e quem resolve, no detalhe | 03.1-03 |
| /_authenticated/$clientId/ | Indicadores com referência de mercado | MetricaCard · cartão Tailwind | NxKpi com NxTag de selo, no detalhe | 03.1-03 |
| /_authenticated/$clientId/ | Melhor formato e formato mais fraco | NxKpi | NxKpi, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Alcance e interações | NxCard com NxLinhaTempo e DrillDownDoDia | NxCard com NxLinhaTempo, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Tendência geral | NxCard com NxLinhaTempo e DrillDownDoDia | NxCard com NxLinhaTempo, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Taxa de interação por formato | NxCard com NxColunas | NxCard com NxColunas, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Posts por formato | NxCard com NxPizza | NxCard com NxPizza, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Melhores horários para postar | NxCard com NxHBar | NxCard com NxHBar, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | Dias com dado do Instagram | NxCard com NxMedidor | NxCard com NxMedidor, no detalhe do Instagram | 03.1-03 |
| /_authenticated/$clientId/ | O que ainda não dá para dizer | ListaLimitacoes · cartão Tailwind | NxListRow em Como lemos estes números, no detalhe | 03.1-03 |
| /_authenticated/$clientId/pacientes | Do primeiro contato à venda | NxCard com CmBarras | NxCard com CmBarras, no detalhe | 03.1-03 |
| /_authenticated/$clientId/pacientes | Pessoas em cada etapa | CmKpi e lista de pessoas | NxKpi no topo, com botão Ver quem são; a lista abre no corpo | 03.1-03 |
| /_authenticated/$clientId/pacientes | Quem chamou | NxCard com NxPizza | NxCard com NxPizza, no detalhe | 03.1-03 |
| /_authenticated/$clientId/pacientes | O que mudou | CmLeitura e LeituraDoPeriodo · dbx-* (databoard-inteligencia) | saiu: virou o fato de variação da leitura do período | 03.1-03 |
| /_authenticated/$clientId/pacientes | Metas do mês | MetasDoMes · dbx-* (databoard-inteligencia) | NxKpi no detalhe (N de M, faltam K), sem ritmo nem projeção; editar metas segue para a equipe | 03.1-03 |
| /_authenticated/$clientId/pacientes | Evolução por dia | EvolucaoDiaria e Minigrafico · dbx-* e Recharts (databoard-evolucao) | NxLinhaTempo no principal | 03.1-03 |
| /_authenticated/$clientId/pacientes | Para chamar agora | ListaDePessoas e BotaoConversa | NxCard com NxListRow no corpo; a lista de pessoas fica fora da leitura | 03.1-03 |
| /_authenticated/$clientId/pacientes | Números que não aparecem aqui | CmRecolhido com CmAviso | NxRecolhido com NxListRow, no detalhe | 03.1-03 |
| /_authenticated/$clientId/pacientes | Avisos sobre a leitura dos números | CmRecolhido com CmMetodo | NxRecolhido com NxAviso, no detalhe | 03.1-03 |
| /_authenticated/$clientId/consultas | O que falta para medir as consultas | PhasePlaceholder · cartão Tailwind | NxVazio em construção, com o que falta e quem resolve | 03.1-03 |
| /_authenticated/$clientId/vendas | O que falta para medir as vendas | PhasePlaceholder · cartão Tailwind | NxVazio em construção, com o que falta e quem resolve | 03.1-03 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/$clientId/ | Acompanhamento do serviço | tirada (João 11/11) | — |
