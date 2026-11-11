# Inventário: Plano de ação e Relatórios (plano 03.1-11)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/relatorio | Relatório do período | Como foi o período para enviar à clínica? | D5 | pendente | 03.1-11 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/relatorio | Números do período | NxKpi | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Alcance e interações por dia | NxCard com NxLinhaTempo | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que aconteceu | LeituraDoPeriodo · InsightCard | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que fazer | InsightCard · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Recomendações que passaram na checagem | Checagem · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Versões para enviar | EditorVersao com Previa · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | O que entra no texto | OQueEntra · cartão Tailwind | | 03.1-11 |
| /_authenticated/$clientId/relatorio | Dados incompletos | PlanoAviso | | 03.1-11 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/$clientId/plano | Plano da semana | tirada (João 11/11) | /_authenticated/$clientId/ |
| /_authenticated/$clientId/reunioes | Reuniões | tirada (João 11/11) | /_authenticated/$clientId/ |
| /_authenticated/$clientId/proximas-acoes | Prioridades da equipe | tirada (João 11/11) | /_authenticated/$clientId/ |
| /_authenticated/$clientId/agentes | Agentes e entregas | tirada (João 11/11) | /_authenticated/$clientId/ |
| /_authenticated/$clientId/oportunidades | Oportunidades de melhoria | tirada (João 11/11) | /_authenticated/$clientId/ |
| /_authenticated/$clientId/automacoes | Automações | tirada (João 11/11) | /_authenticated/$clientId/ |
