# Inventário: Marketing, Anúncios (plano 03.1-07)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/anuncios | Resultados dos anúncios | O dinheiro dos anúncios virou conversa? | D3 | pendente | 03.1-07 | | |
| /_authenticated/$clientId/links | Links rastreados | De qual link vêm as conversas e as vendas? | D3 | pendente | 03.1-07 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/anuncios | O que fazer agora | OQueFazer com InsightCard · cartão Tailwind | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Aviso de rastreio das conversas | NxAlertaCurto e NxNota | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Investido, conversas, custo por conversa e cliques | NxKpi | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Investimento e conversas por dia | NxCard com NxBarrasLinha | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Do anúncio à conversa | NxCard com NxFunil | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Para onde foi a verba, por objetivo | OndeFoiAVerba · Painel Tailwind com BarraFina | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Conta de anúncio compartilhada | ContaCompartilhada · NxNota | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Campanha por campanha | DiagnosticoCampanhas · cartão Tailwind e tabela | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Comparação com o período anterior | ComparativoConta · tabela crua | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Qualidade das conversas por campanha | QualidadeLeadsCampanha · tabela crua | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Posts impulsionados e seguidores | SeguidoresImpulsionados · Recharts, tabela crua e Painel de visual.tsx | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Veredito da conta | Veredito · Selo de visual.tsx | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Detalhes recolhidos | tabela crua e cartão Tailwind na própria rota | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Planilha dos anúncios | AdsPlanilhaPainel · Recharts e 3 tabelas | | 03.1-07 |
| /_authenticated/$clientId/anuncios | Como estes números são calculados | NxComoCalcula e MetodologiaAnuncios | | 03.1-07 |
| /_authenticated/$clientId/links | Cliques, conversas, agendaram e vendas | NxKpi | | 03.1-07 |
| /_authenticated/$clientId/links | De onde vêm as conversas | NxCard com NxHBar | | 03.1-07 |
| /_authenticated/$clientId/links | Do clique à venda | NxCard com NxFunil | | 03.1-07 |
| /_authenticated/$clientId/links | Todos os links | LinkRow com QrLink · cartão Tailwind | | 03.1-07 |
| /_authenticated/$clientId/links | Gerar link novo | Gerador · formulário com cartão Tailwind | | 03.1-07 |
| /_authenticated/$clientId/links | Como os links contam | NxComoCalcula | | 03.1-07 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/$clientId/campanhas | Estratégias e campanhas | tirada (João 11/11) | /_authenticated/$clientId/hoje |
| /_authenticated/$clientId/anuncios | Gestor de anúncios | tirada (João 11/11) | — |
