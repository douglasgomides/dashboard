# Inventário: Marketing, Conteúdo (plano 03.1-09)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.
A rota /ideias tem 2 visões na mesma tela (Planejar a semana e Encontrar ideias, que é a padrão): uma linha em Telas e os cartões separados por visão. A visão Revisar roteiros saiu em 11/11/2026.
A Inteligência Criativa entra na fase (D-11) e delega ao workspace de `src/features/creative-intelligence`.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/ideias | Encontrar ideias | Quais ideias valem virar conteúdo agora? | D5 | pendente | 03.1-09 | | |
| /_authenticated/$clientId/inteligencia-criativa | Inteligência Criativa | O que a equipe criativa pode produzir agora? | D5 | pendente | 03.1-09 | | |
| /_authenticated/$clientId/inspiracao | Referências salvas | Quais referências valem adaptar para esta clínica? | | pendente | 03.1-09 | | |
| /_authenticated/$clientId/duvidas | Dúvidas do público | O que o público mais pergunta e ainda sem resposta? | D3 | pendente | 03.1-09 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/ideias | Encontrar ideias: Anúncios para gravar | RoteiroCard com BotaoCopiar | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: Perguntas de pacientes | NxKpi | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: Sem fonte | SemFonte · peça congelada do SAP | | 03.1-09 |
| /_authenticated/$clientId/ideias | Planejar a semana: Plano de 7 dias | PlanoDaSemana e PlanejadorSemana · planejador congelado | | 03.1-09 |
| /_authenticated/$clientId/ideias | Planejar a semana: Posts no período | NxKpi | | 03.1-09 |
| /_authenticated/$clientId/ideias | Planejar a semana: Ações da ideia | AcoesDaIdeia e BotaoAcao | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: Ideias de post | IdeiaCard · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: Ideias por etapa do funil | NxCard com NxHBar | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: O que o seu melhor conteúdo tem em comum | NxCard com Exemplos | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: Ideias pela regra original | IdeiasRegraOriginal · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: O que ainda limita as ideias | ListaLimitacoes · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/ideias | Encontrar ideias: De onde vêm as ideias | NxComoCalcula | | 03.1-09 |
| /_authenticated/$clientId/inteligencia-criativa | Espaço de trabalho criativo | CreativeWorkspace · features/creative-intelligence | | 03.1-09 |
| /_authenticated/$clientId/inspiracao | Cases, fáceis de replicar e Reels | NxKpi | | 03.1-09 |
| /_authenticated/$clientId/inspiracao | Referências por especialidade | NxCard com NxHBar | | 03.1-09 |
| /_authenticated/$clientId/inspiracao | Referências salvas | PostCard · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Dúvidas que se repetem | NxKpi | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Assuntos mais perguntados | NxCard com NxHBar | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Dúvidas que mais se repetem | GrupoCard · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Perguntas reais | QuestionCard · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Pedem dose ou remédio | Bloco · cartão Tailwind com SeloTriagem | | 03.1-09 |
| /_authenticated/$clientId/duvidas | O que isso quer dizer | InsightCard · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Dúvidas pela detecção original | DuvidasFrequentesOriginais · cartão Tailwind | | 03.1-09 |
| /_authenticated/$clientId/duvidas | Como as perguntas são lidas | NxComoCalcula | | 03.1-09 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/$clientId/ideias | Revisar roteiros | tirada (João 11/11) | /_authenticated/$clientId/ideias |
