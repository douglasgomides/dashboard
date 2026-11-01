# Google Planilhas (planilha de anúncios)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Para clientes cuja conta de anúncios ainda não está liberada, o Nexo lê a planilha de distribuição de conteúdo da equipe pelo
**link público de exportação CSV**. Não é uma API: não tem versão, token nem limite documentado. O risco é a planilha **mudar de colunas**
ou **guardar linhas que já saíram da origem**.

## 1. O que usamos

- **Chamada:** `GET` no link `https://docs.google.com/spreadsheets/...` gravado em `clients.ads_planilha_url`, seguindo redirecionamento,
  prazo de 30 s (`ads-planilha-sync.ts:250-262`).
- **Doc oficial:** não há doc de "API" para isso; o formato é o CSV que o Google exporta. Nada a ler.
- **Colunas exigidas** (`ads-planilha-sync.ts:136-160`; se faltar uma, erro "Planilha mudou de formato"):
  Dia da Análise, Status, Ações, Nome da Campanha, Link do Post, Tipo, Orçamento, Valor Investido Total, Seguidores Antes, Valor no Período,
  Seguidores Após, Seguidores Periodo, Custo por Seguidor, Custo por Mensagem, Mensagens Antes, Mensagens Depois, Mensagens Período.
- Grava em `ads_planilha_semanal` (upsert por dia + link do post).

## 2. Significado de cada número

- **`valor_periodo`:** investimento da semana da análise ("Valor no Período"); **`valor_total`:** acumulado ("Valor Investido Total").
- **Seguidores do período** só vale se fechar com antes/depois; senão é anulado (e o custo por seguidor também).
- **Negativos** são anulados. Linha com data no futuro é mantida, mas sem `valor_periodo`.
- **Sem data:** linhas do bloco final (posts ativos agora) ficam com a data `2099-12-31` e aparecem à parte.
- **Fuso:** "hoje" é calculado como UTC−3 fixo (`ads-planilha-sync.ts:250`).

## 3. Limites

- Sem limite documentado; sem paginação (CSV inteiro). Uma chamada por cliente por rodada.
- **Link fechado:** o Google responde 200 com a **página de login** (HTML). O código detecta (`ads-planilha-sync.ts:261`).

## 4. Token

- **Nenhum.** O link precisa estar "qualquer pessoa com o link pode ver". Quem mantém: a equipe que edita a planilha.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Página de login com 200 quando o link não está aberto | Sim | `ads-planilha-sync.ts:261` |
| Coluna renomeada ou removida | Sim (erro "mudou de formato") | `ads-planilha-sync.ts:158-159` |
| CSV com aspas e quebra de linha dentro do campo | Sim | `ads-planilha-sync.ts:57-90` |
| Upsert sem remover o que saiu da origem deixa linhas órfãs | **Não** (ex.: R$ 2.039 numa semana, num cliente) | `ads-planilha-sync.ts:265-268`; `src/lib/client-data.ts:494` |
| Semana com data no futuro (30/12/2026) | Parcial (mantém a linha, zera o período) | `ads-planilha-sync.ts:174-176` |
| Semanas com investimento vazio | Não verificado (não comparado com a planilha real) | — |
| Erro ao gravar o status da planilha é ignorado | **Não** | `ads-planilha-sync.ts:273-282` |
| Planilha carregada uma vez e nunca mais (link removido) | **Não** (sem aviso) | `clients.ads_planilha_url` nulo |

## 6. Mudanças anunciadas

Nenhuma (não é uma API). A mudança que importa é a da **própria planilha**: o teste de contrato ao vivo confere o cabeçalho.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 21/10/2026 | Planilha de um cliente lida uma vez e não atualizada mais | Pendente |
| 10/2026 | Linhas órfãs e semana no futuro em outro cliente | Pendente: apagar o que saiu da origem a cada leitura completa |

## Teste de contrato

`scripts/test-contrato-google-planilhas.ts`. Offline: passa o CSV da amostra pelo `interpretarPlanilha` real. Ao vivo:
`CONTRATO_AO_VIVO=1 CONTRATO_PLANILHA_URL=<link de exportação CSV>`; confere **só o cabeçalho** (nenhuma linha é impressa). Como não há
token, este é o único contrato que segue redirecionamento (o Google redireciona o link de exportação).
