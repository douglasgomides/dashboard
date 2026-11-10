# Inventário: Resultados (plano 03.1-03)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/ | Resultados da clínica | Como a clínica foi no período? | D5 | pendente | 03.1-03 | | |
| /_authenticated/$clientId/pacientes | Pacientes do período | Onde as pessoas travam do contato até a venda? | D1 | pendente | 03.1-03 | | |
| /_authenticated/$clientId/consultas | O que virou paciente | Quantos contatos viraram consulta? | | pendente | 03.1-03 | | |
| /_authenticated/$clientId/vendas | O que virou venda | Quantos contatos viraram venda? | | pendente | 03.1-03 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/ | Avisos de qualidade dos dados | QualidadeDados compacto · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | Retorno do investimento | RetornoInvestimento · ws-panel e ws-metric | | 03.1-03 |
| /_authenticated/$clientId/ | Resultados do Instagram | NxCard com 4 NxKpi (seguidores, taxa de interação, salvamentos) | | 03.1-03 |
| /_authenticated/$clientId/ | Acompanhamento do serviço | AcompanhamentoServico · peça congelada do SAP | | 03.1-03 |
| /_authenticated/$clientId/ | Prioridade recomendada | NextBestActionPanel · painel azul | | 03.1-03 |
| /_authenticated/$clientId/ | O que merece atenção nos resultados | NextBestActionCard · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | As 8 respostas do diagnóstico | DiagnosticoEstrategico · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | Outras oportunidades | NextBestActionCard · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | Resumo do período | NxCard com SeloStatus | | 03.1-03 |
| /_authenticated/$clientId/ | Resumo do mês | ResumoDoMes · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | O que ajuda a explicar o resultado | InsightCard · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | Indicadores com referência de mercado | MetricaCard · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/ | Melhor formato e formato mais fraco | NxKpi | | 03.1-03 |
| /_authenticated/$clientId/ | Alcance e interações | NxCard com NxLinhaTempo e DrillDownDoDia | | 03.1-03 |
| /_authenticated/$clientId/ | Tendência geral | NxCard com NxLinhaTempo e DrillDownDoDia | | 03.1-03 |
| /_authenticated/$clientId/ | Taxa de interação por formato | NxCard com NxColunas | | 03.1-03 |
| /_authenticated/$clientId/ | Posts por formato | NxCard com NxPizza | | 03.1-03 |
| /_authenticated/$clientId/ | Melhores horários para postar | NxCard com NxHBar | | 03.1-03 |
| /_authenticated/$clientId/ | Dias com dado do Instagram | NxCard com NxMedidor | | 03.1-03 |
| /_authenticated/$clientId/ | O que ainda não dá para dizer | ListaLimitacoes · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Do primeiro contato à venda | NxCard com CmBarras | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Pessoas em cada etapa | CmKpi e lista de pessoas | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Quem chamou | NxCard com NxPizza | | 03.1-03 |
| /_authenticated/$clientId/pacientes | O que mudou | CmLeitura e LeituraDoPeriodo · dbx-* (databoard-inteligencia) | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Metas do mês | MetasDoMes · dbx-* (databoard-inteligencia) | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Evolução por dia | EvolucaoDiaria e Minigrafico · dbx-* e Recharts (databoard-evolucao) | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Para chamar agora | ListaDePessoas e BotaoConversa | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Números que não aparecem aqui | CmRecolhido com CmAviso | | 03.1-03 |
| /_authenticated/$clientId/pacientes | Avisos sobre a leitura dos números | CmRecolhido com CmMetodo | | 03.1-03 |
| /_authenticated/$clientId/consultas | O que falta para medir as consultas | PhasePlaceholder · cartão Tailwind | | 03.1-03 |
| /_authenticated/$clientId/vendas | O que falta para medir as vendas | PhasePlaceholder · cartão Tailwind | | 03.1-03 |
