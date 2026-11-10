# Inventário: Plano de ação e Relatórios (plano 03.1-11)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.
Automações é tela em construção (TELA-05): vira o molde "em construção" honesto, com o que falta e quem resolve.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/plano | Plano da semana | O que a equipe faz esta semana? | D5 | pendente | 03.1-11 | | |
| /_authenticated/$clientId/reunioes | Reuniões | O que ficou combinado com a clínica? | D5 | pendente | 03.1-11 | | |
| /_authenticated/$clientId/proximas-acoes | Prioridades da equipe | Qual é o próximo passo da equipe? | D5 | pendente | 03.1-11 | | |
| /_authenticated/$clientId/agentes | Agentes e entregas | O que os agentes entregaram e o que espera revisão? | D5 | pendente | 03.1-11 | | |
| /_authenticated/$clientId/oportunidades | Oportunidades de melhoria | O que melhorar primeiro? | D5 | pendente | 03.1-11 | | |
| /_authenticated/$clientId/automacoes | Automações | O que o Nexo vai fazer sozinho? | | pendente | 03.1-11 | | |
| /_authenticated/$clientId/relatorio | Relatório do período | Como foi o período para enviar à clínica? | D5 | pendente | 03.1-11 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/plano | Plano de ação da semana | PlanoSemana · plano-semana congelado | | 03.1-11 |
| /_authenticated/$clientId/reunioes | Como funciona | NxCard com PlanoComo | | 03.1-11 |
| /_authenticated/$clientId/reunioes | Anote a reunião | NxCard com Editor | | 03.1-11 |
| /_authenticated/$clientId/reunioes | Reuniões registradas | NxCard com PlanoLinha e PlanoContadores | | 03.1-11 |
| /_authenticated/$clientId/reunioes | Resumo da reunião | NxCard com PlanoChip | | 03.1-11 |
| /_authenticated/$clientId/reunioes | O que entregar nesta semana | NxCard com PlanoLinha | | 03.1-11 |
| /_authenticated/$clientId/reunioes | Memórias para o Brain | NxCard com PlanoVazio | | 03.1-11 |
| /_authenticated/$clientId/proximas-acoes | Prioridade, responsável, categoria e status | PlanoContadores e PlanoChip | | 03.1-11 |
| /_authenticated/$clientId/proximas-acoes | Ações abertas por prioridade | CartaoAcao · PlanoLinha | | 03.1-11 |
| /_authenticated/$clientId/proximas-acoes | Avisos de dado | PlanoAviso | | 03.1-11 |
| /_authenticated/$clientId/proximas-acoes | Como as prioridades são escolhidas | PlanoComo | | 03.1-11 |
| /_authenticated/$clientId/agentes | Painel dos agentes | PainelAgentes · agentes-ia congelado | | 03.1-11 |
| /_authenticated/$clientId/oportunidades | O que melhorar primeiro | NextBestActionPanel · painel azul | | 03.1-11 |
| /_authenticated/$clientId/oportunidades | Oportunidades por andamento | PlanoLinha e PriorityBadge | | 03.1-11 |
| /_authenticated/$clientId/oportunidades | Contadores por status | PlanoContadores | | 03.1-11 |
| /_authenticated/$clientId/oportunidades | O que o painel ainda não consegue dizer | ListaLimitacoes · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/oportunidades | Como a prioridade é calculada | PlanoComo | | 03.1-11 |
| /_authenticated/$clientId/automacoes | O que falta para as automações | PhasePlaceholder · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Números do período | NxKpi | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Alcance e interações por dia | NxCard com NxLinhaTempo | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que aconteceu | LeituraDoPeriodo · InsightCard | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que fazer | InsightCard · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Recomendações que passaram na checagem | Checagem · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Versões para enviar | EditorVersao com Previa · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que entra no texto | OQueEntra · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Dados incompletos | PlanoAviso | | 03.1-11 |
