# Inventário: O que fazer hoje (plano 03.1.1-05)

Conferido contra o arquivo de rota em 11/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura da rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`, seção "Telas juntadas, abas e a Hoje (03.1.1)". Tela nova (D-01 e D-06 da 03.1.1, aprovada pelo João em 10/11/2026):
é a primeira versão da tela Hoje da Phase 9, na mesma rota (`/hoje`). Os 4 números da Phase 9 (Agendaram, Fecharam, Chamaram e Foram) não aparecem aqui.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/hoje | O que fazer hoje | O que fazer esta semana? | D5 | novo | 03.1.1-05 |  | 11/11/2026 |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/hoje | Topo com saudação e chips | — (tela nova) | Saudação grande ("Bom dia", "Boa tarde" ou "Boa noite" e o nome da clínica em cinza mais claro), chips de contexto (clínica e dado até dd/mm) e chips de estado das fontes com bolinha (âmbar com mais de 1 dia) | 03.1.1-05 |
| /_authenticated/$clientId/hoje | Próximo | — (tela nova) | Cartão de destaque com degradê suave e botão escuro: a "Ação da semana" de Resultados da clínica, com o número e quem resolve | 03.1.1-05 |
| /_authenticated/$clientId/hoje | Ações da semana em cartões | — (tela nova) | Até 4 NxCartaoNumero (ícone no círculo, subtítulo "Quem resolve", ↗ para a tela juntada, número grande com legenda) e uma ação em pílula com a seta para a aba de origem | 03.1.1-05 |
| /_authenticated/$clientId/hoje | Sem leitura | — (tela nova) | "Sem leitura: motivo", "Para consertar:" e "Quem resolve:", o mesmo motivo da leitura de Resultados da clínica | 03.1.1-05 |
| /_authenticated/$clientId/hoje | Poucas ações | — (tela nova) | Com 0 a 2 ações a tela mostra as que existem e "Poucas ações nesta semana: motivo"; nunca inventa ação para chegar a 3 | 03.1.1-05 |
