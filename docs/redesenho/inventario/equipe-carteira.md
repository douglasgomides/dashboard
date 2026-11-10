# Inventário: Equipe, Carteira e Integrações (plano 03.1-13)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo. Nenhum cartão traz nome de clínica ou de paciente.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/admin/ | Carteira | Quais clínicas da carteira precisam de atenção hoje? | | pendente | 03.1-13 | | |
| /_authenticated/admin/integracoes | Integrações | Quais conexões estão desligadas ou com erro? | | pendente | 03.1-13 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/admin/ | Resumo da carteira | AdmContadores e AdmContador | | 03.1-13 |
| /_authenticated/admin/ | Lista de clínicas da carteira | desenhada direto na rota · dbx-*, cartão Tailwind e tabela crua | | 03.1-13 |
| /_authenticated/admin/ | Clínicas na carteira e precisam de atenção | AdmContador · dbx-* e panel | | 03.1-13 |
| /_authenticated/admin/ | Fonte parada, fonte atrasada e médico sem login | AdmContador e AdmChip | | 03.1-13 |
| /_authenticated/admin/ | Fontes, acesso e configuração | PainelSaudeFontes · cartão Tailwind e tabela | | 03.1-13 |
| /_authenticated/admin/ | Saúde de cada clínica | LinhaSaude e CelulaSaude · tabela | | 03.1-13 |
| /_authenticated/admin/ | Selo de confiança | SeloConfianca · cartão Tailwind | | 03.1-13 |
| /_authenticated/admin/ | Qualidade dos dados | ChipQualidade e ChipQualidadeCurto | | 03.1-13 |
| /_authenticated/admin/ | Retorno do investimento dos últimos 30 dias | AdmChip e NxNota | | 03.1-13 |
| /_authenticated/admin/ | Sem resposta agora | SemRespostaAgora · tabela crua | | 03.1-13 |
| /_authenticated/admin/ | Links rastreados sem cliente | LinksSemCliente e SaudeShortio · dbx-* | | 03.1-13 |
| /_authenticated/admin/ | Novo cliente só do Nexo | NewClientForm e AdmSecao | | 03.1-13 |
| /_authenticated/admin/ | Novo admin da equipe | NewAdminForm e AdmSecao | | 03.1-13 |
| /_authenticated/admin/integracoes | Resumo das conexões | AdmContadores · em dia, com erro, desatualizadas e sem registro | | 03.1-13 |
| /_authenticated/admin/integracoes | Conexões que precisam de você | NxAlertaCurto | | 03.1-13 |
| /_authenticated/admin/integracoes | Conectores | CardConector · AdmChip | | 03.1-13 |
| /_authenticated/admin/integracoes | De onde vem o estado e o que é planejado | NxComoCalcula | | 03.1-13 |
