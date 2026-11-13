# Inventário: Equipe, telas abertas pela busca (plano 03.1-15)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.
Estas cinco telas só abrem pela busca de telas da equipe (somente admin, exceto Assistentes de IA); continuam no menu e na busca.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/admin/caixa | Caixa de entrada | O que está esperando a equipe? | | pendente | 03.1-15 | | |
| /_authenticated/admin/referencia | Referência entre clientes | Qual formato rende mais em todas as contas? | | pendente | 03.1-15 | | |
| /_authenticated/admin/relatorios | Relatórios da semana | Quais relatórios da semana já estão prontos? | | pendente | 03.1-15 | | |
| /_authenticated/admin/equipe | Equipe | Quem está na equipe e com qual papel? | | pendente | 03.1-15 | | |
| /_authenticated/assistentes-ia | Assistentes de IA | Quais assistentes estão ligados aos dados do Nexo? | | pendente | 03.1-15 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/admin/caixa | Nada esperando a equipe | cartão Tailwind com CheckCircle2 | | 03.1-15 |
| /_authenticated/admin/caixa | Itens esperando a equipe | cartão Tailwind com AlertTriangle | | 03.1-15 |
| /_authenticated/admin/referencia | Termômetro por formato | BenchmarkEstrategico · cartão Tailwind e tabela | | 03.1-15 |
| /_authenticated/admin/relatorios | Relatórios da semana | cartão Tailwind com Download | | 03.1-15 |
| /_authenticated/admin/equipe | Pessoas da equipe | DadosPessoa · cartão Tailwind | | 03.1-15 |
| /_authenticated/admin/equipe | Nova pessoa | FormPessoa · cartão Tailwind | | 03.1-15 |
| /_authenticated/assistentes-ia | Status | seção de texto · cartão Tailwind | | 03.1-15 |
| /_authenticated/assistentes-ia | Como conectar | seção de texto · cartão Tailwind | | 03.1-15 |
| /_authenticated/assistentes-ia | O que pode ser consultado | seção de texto · cartão Tailwind | | 03.1-15 |
| /_authenticated/assistentes-ia | Acessos concedidos | seção de texto · tabela crua | | 03.1-15 |
| /_authenticated/assistentes-ia | Histórico de consultas | seção de texto · tabela crua | | 03.1-15 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/admin/agentes | Central de Agentes | tirada (João 11/11) | /_authenticated/admin/ |
| /_authenticated/admin/brain | Brand Brain | tirada (João 11/11) | /_authenticated/admin/ |
