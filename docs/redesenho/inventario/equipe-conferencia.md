# Inventário: Equipe, Conferência e cadastro do cliente (plano 03.1-14)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo. Nenhum cartão traz chave, token ou dado de cliente.
Configurar este cliente é uma tela de trabalho (formulários): ganha o cabeçalho do molde e a leitura; os formulários ficam no corpo.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/admin/conferencia | Conferência de dados | Os números de cada fonte batem? | | pendente | 03.1-14 | | |
| /_authenticated/admin/$clientId | Configurar este cliente | O cadastro deste cliente está completo? | | pendente | 03.1-14 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/admin/conferencia | Resumo da conferência | AdmContadores e AdmContador | | 03.1-14 |
| /_authenticated/admin/conferencia | Conferidos e ok, gravidade alta, média e baixa | AdmContador e AdmChip | | 03.1-14 |
| /_authenticated/admin/conferencia | Pontos para olhar | CartaoAchado · cartão Tailwind | | 03.1-14 |
| /_authenticated/admin/conferencia | Etapas que falharam | Etapas e IconeEtapa · tabela crua | | 03.1-14 |
| /_authenticated/admin/conferencia | Dado parado | TabelaSemFonte · tabela crua | | 03.1-14 |
| /_authenticated/admin/conferencia | Conferidos e verificados | ListaVerificados · cartão Tailwind | | 03.1-14 |
| /_authenticated/admin/conferencia | Conferência ao vivo | ConferenciaAoVivoResumo · tabela crua | | 03.1-14 |
| /_authenticated/admin/conferencia | Uso das telas | UsoDasTelas · tabela crua | | 03.1-14 |
| /_authenticated/admin/conferencia | Como a conferência funciona | NxComoCalcula | | 03.1-14 |
| /_authenticated/admin/$clientId | Perfil do cliente | AdmSecao com ClientProfileForm | | 03.1-14 |
| /_authenticated/admin/$clientId | Conta Instagram | AdmSecao com ConnectInstagramForm e InstagramAccountsList | | 03.1-14 |
| /_authenticated/admin/$clientId | CRM | AdmSecao com ConnectCrmForm e CrmConnectionsList | | 03.1-14 |
| /_authenticated/admin/$clientId | Dar acesso ao médico | AdmSecao com NewUserForm | | 03.1-14 |
| /_authenticated/admin/$clientId | Usuários vinculados | AdmSecao com MembersList | | 03.1-14 |
| /_authenticated/admin/$clientId | Tarefas da equipe neste cliente | AdmSecao | | 03.1-14 |
