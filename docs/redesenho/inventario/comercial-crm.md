# Inventário: Comercial, CRM e funil (plano 03.1-08)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/crm-painel | Funil comercial | Onde o funil comercial está quebrando? | D1 | pendente | 03.1-08 | | |
| /_authenticated/$clientId/jornada | Jornada comercial | Quantas pessoas chegam até a venda e onde se perdem? | D1 | pendente | 03.1-08 | | |
| /_authenticated/$clientId/vendas-kommo | Resultados por origem do CRM | De qual origem vêm os contatos que fecham? | D3 | pendente | 03.1-08 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/crm-painel | Aviso de dado do CRM com erro | CmAviso e QualidadeDados · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Leads novos, cards criados, ganhos e perdidos | CmKpi | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Onde o funil quebra | FunilOndeQuebra · CmBarras | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | O que está travando | ProblemasPorTipo · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Leads por dia | NxCard com NxLinhaTempo (TendenciaDeLeads) | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Atividade recente | AtividadeRecente · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | De onde vêm estes números | CmMetodo | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Funis do período e orçamentos por tipo | FunisPeriodo e OrcamentosPorTipo · tabelas cruas | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Visões comerciais | VisoesComerciais (crm-visoes) · 3 tabelas cruas | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Links rastreados | LinksShortio · dbx-* | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Resumo do atendimento | AtendimentoResumo · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Base geral do CRM | BaseVivaCrm com NxMedidor | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Checklist de dados | ChecklistDados · CmRecolhido | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Negócio próprio | CrmNegocioProprio · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/crm-painel | Diagnóstico comercial | ComercialDiagnostico · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/jornada | Diagnóstico comercial | ComercialDiagnostico · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/jornada | Negócio próprio | CrmNegocioProprio · cartão Tailwind e tabela crua | | 03.1-08 |
| /_authenticated/$clientId/jornada | Pessoas identificadas, conversaram, viraram lead e compras | CmKpi | | 03.1-08 |
| /_authenticated/$clientId/jornada | Onde a jornada quebra | JornadaFunil e FunilOndeQuebra | | 03.1-08 |
| /_authenticated/$clientId/jornada | Do lead à venda | NxCard com CmBarras | | 03.1-08 |
| /_authenticated/$clientId/jornada | O que limita esta leitura | ListaLimitacoes · cartão Tailwind | | 03.1-08 |
| /_authenticated/$clientId/jornada | Resultado por origem do lead | Tabela · tabela crua | | 03.1-08 |
| /_authenticated/$clientId/jornada | Posts que geraram gente de verdade | Tabela · tabela crua | | 03.1-08 |
| /_authenticated/$clientId/jornada | Links rastreados | Tabela · tabela crua | | 03.1-08 |
| /_authenticated/$clientId/jornada | Linha do tempo de uma pessoa | NxCard com busca | | 03.1-08 |
| /_authenticated/$clientId/jornada | Checklist de rastreamento | ChecklistDados · CmRecolhido | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Leads, ganhos, perdidos e em aberto | CmKpi | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Leads e ganhos por origem | NxCard com CmBarras | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Fatia de cada origem | NxCard com NxPizza | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Em resumo | CmLeitura | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Por fonte do lead e por procedimento | FunilTable · tabela crua | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Leads por etapa | NxCard com FunilTable · tabela crua | | 03.1-08 |
| /_authenticated/$clientId/vendas-kommo | Como ler este relatório | CmMetodo | | 03.1-08 |
