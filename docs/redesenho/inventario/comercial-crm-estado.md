# Inventário: Comercial, estado do CRM (plano 03.1-10)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.
Contatos e oportunidades e Etapas do CRM são quadros de trabalho (kanban): ganham o cabeçalho do molde e a leitura; o quadro não muda.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/crm-guia | Guia de organização do CRM | O CRM da clínica está organizado do jeito que o painel precisa? | | pendente | 03.1-10 | | |
| /_authenticated/$clientId/analisar | Papel de cada funil | O que cada etapa do CRM significa hoje? | | pendente | 03.1-10 | | |
| /_authenticated/$clientId/crm-estrutura | Etapas do CRM | Quantas etapas do CRM ainda estão sem papel marcado? | | pendente | 03.1-10 | | |
| /_authenticated/$clientId/crm-contatos | Contatos e oportunidades | Quem está esperando retorno no CRM? | D2 | pendente | 03.1-10 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/crm-guia | Passos prontos, leads, ganhos e perdidos | CmKpi | | 03.1-10 |
| /_authenticated/$clientId/crm-guia | Passo a passo | NxCard com CheckCircle2 | | 03.1-10 |
| /_authenticated/$clientId/crm-guia | As etapas de hoje e o que cada uma vira | NxCard com tabela crua | | 03.1-10 |
| /_authenticated/$clientId/crm-guia | Como o funil principal deve ficar | CmRecolhido | | 03.1-10 |
| /_authenticated/$clientId/crm-guia | Manual de organização do CRM | ManualCrm · CmRecolhido | | 03.1-10 |
| /_authenticated/$clientId/analisar | Funis, etapas com cards, etapas a confirmar e fechados sem resultado | CmKpi | | 03.1-10 |
| /_authenticated/$clientId/analisar | Aviso de etapas sem significado | CmAviso | | 03.1-10 |
| /_authenticated/$clientId/analisar | Papel de cada funil | SecaoPapelFunil · 3 tabelas cruas | | 03.1-10 |
| /_authenticated/$clientId/analisar | Confirmar em lote | ConfirmarEmLote · formulário | | 03.1-10 |
| /_authenticated/$clientId/analisar | Cards do Comercial | SecaoKpi · tabela crua | | 03.1-10 |
| /_authenticated/$clientId/crm-estrutura | O que a estrutura revela | KanbanBoard · cartão Tailwind | | 03.1-10 |
| /_authenticated/$clientId/crm-estrutura | Etapas e papéis | KanbanBoard · cartão Tailwind | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Fila de entrada | FilaEntrada · quadro de trabalho | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Contatos sem oportunidade | ListaCrm · quadro de trabalho | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Oportunidades por etapa | RotinaCrm e CardAberto · kanban | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Histórico da oportunidade | DetalheCrm · BottomSheet | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Nova oportunidade | NovoCard · BottomSheet | | 03.1-10 |
| /_authenticated/$clientId/crm-contatos | Seletor de período | DateRangePicker · cartão Tailwind | | 03.1-10 |
