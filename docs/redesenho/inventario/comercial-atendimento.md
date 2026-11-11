# Inventário: Comercial, atendimento (plano 03.1-12)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo.
A Central de atendimento é uma fila de trabalho: ganha o cabeçalho do molde e a leitura da fila; o quadro não muda (decisão da passada de 10/11).

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/atendimento | Qualidade do atendimento | O atendimento responde rápido o bastante? | D2 | pendente | 03.1-12 | | |
| /_authenticated/$clientId/central-atendimento | Central de atendimento | Quais conversas estão esperando resposta? | D2 | pendente | 03.1-12 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/atendimento | Atendimentos, espera até a 1ª resposta e sem roteamento | CmKpi | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Volume por dia e espera até a 1ª resposta | NxCard com NxLinhaTempo | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Por equipe | NxCard com CmBarras | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Em resumo | CmLeitura | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Aviso sobre o que o número não mede | CmAviso | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Conversas do WhatsApp | ConversasWhatsapp e NumerosWhatsapp · cartão Tailwind | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Conversas por dia | AtendimentoConversas · Recharts | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Custo do WhatsApp | CustoWhatsapp · cartão Tailwind | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Tabelas por equipe e por atendente | CmRecolhido com tabela crua | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Resumo do atendimento | AtendimentoResumo · cartão Tailwind | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Auditoria comercial | AuditoriaComercial · cartão Tailwind e tabela crua | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Experimento da semana | ExperimentoSemana · cartão Tailwind | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Origem da conversão | OrigemConversao · cartão Tailwind e tabela crua | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Receita por canal | ReceitaPorCanal · cartão Tailwind e tabela crua | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Motivos comparados | MotivosComparados · cartão Tailwind e tabela crua | | 03.1-12 |
| /_authenticated/$clientId/atendimento | Como ler | CmMetodo | | 03.1-12 |
| /_authenticated/$clientId/central-atendimento | Fila e conversas | ListaCentral · crm-box | | 03.1-12 |
| /_authenticated/$clientId/central-atendimento | Escolha uma conversa | Conversa e DetalheCentral · crm-box | | 03.1-12 |
| /_authenticated/$clientId/central-atendimento | Canais e conexão | Canais e ConfigCentral · crm-box | | 03.1-12 |
| /_authenticated/$clientId/central-atendimento | Acesso de consulta | CentralDaClinica · crm-box | | 03.1-12 |
| /_authenticated/$clientId/central-atendimento | Ativação oficial pendente | SeloRelacionamento · crm-box | | 03.1-12 |

## Tiradas (João 11/11)

Decisão do João em 11/11/2026 ("tira isso aí, ninguém usa"): estas telas e blocos saíram do Nexo, e o endereço antigo redireciona, sem 404. Vai para "—" quer dizer que só o bloco saiu e a tela continua.

| Rota | Tela ou bloco | Situação | Vai para |
|---|---|---|---|
| /_authenticated/$clientId/atendimento | Fila esquecida | tirada (João 11/11) | — |
