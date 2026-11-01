# Hubla (webhook de vendas)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Vendas do checkout de um cliente. **O Nexo não chama a API da Hubla**: recebe o webhook repassado pelo n8n e uma carga do
passado feita por fora do repositório. Outubro bate exatamente; meses antes da carga mostram zero, e o webhook ainda não estava gravando
em 01/11/2026.

## 1. O que usamos

- **Versão:** webhook **v2** (`version` "2.0.0"; a doc de Lead diz "sempre v2.0.0"). O código guarda a versão só no bruto e não confere.
- **Entrada:** `POST /api/sync/manual?checkout=hubla&client_id=<uuid>` com `Authorization: Bearer <SYNC_SECRET>`, chamado pelo n8n
  (`api/sync/manual.ts:86-88`; `api/_lib/checkout-vendas.ts`). A validação do `x-hubla-token` fica no n8n (**não verificado**).
- **Doc oficial:** <https://hubla.gitbook.io/docs/webhooks/eventos-v2>, <https://hubla.gitbook.io/docs/webhooks/boas-praticas>,
  <https://hubla.gitbook.io/docs/webhooks/eventos>. **Não abertas em 01/11/2026** (403 no proxy); trechos de busca.

| Corpo | Campos lidos | Código |
|---|---|---|
| webhook (`{type, event}`, ou só `event`, ou `{body:{event}}`) | `type` ou `event.type`; `event.invoice.id, status, type (sell/renewal/upgrade), parentInvoiceId` (ou `-offer-` no id), `amount.subtotalCents` (primeiro) e `amount.totalCents`, `paidAt, refundedAt, chargebackAt, updatedAt, paymentMethod, currency, payer.phone` (só vira chave), `paymentSession.utm`; `event.product` ou `products[0].name`; `offers[0].id` ou `invoice.offerId` | `checkout-vendas.ts:130-213` |
| carga (`[...]` ou `{vendas:[...]}`) | `externo_id, status, tipo, metodo, valor_centavos, moeda, pago_em, reembolsado_em, produto, oferta_id, telefone, parent_externo_id, utm` | `checkout-vendas.ts:215-264` |

Na API da Hubla (vista pela Hubla MCP, só leitura): a venda traz `items[]` (vários produtos numa fatura), `subscriptionId`, `sellerNetCents`
e `split`; o reembolso traz id próprio, `amount` **em reais** (não centavos) e **não traz o id da fatura**.

## 2. Significado de cada número

- **"Fecharam" com checkout** = pessoas distintas com fatura pai paga no período, no horário de **São Paulo**. Sem telefone, hoje é igual ao
  número de faturas (a legenda "pessoas que compraram" exagera).
- **Valor** = soma das faturas pagas mais as filhas pagas, em **R$ bruto** (antes da taxa da Hubla).
- **Fuso:** a Hubla agrupa por dia em **UTC**; o Nexo em São Paulo. Uma venda paga às 00:26 UTC do dia 1º cai no mês anterior no Nexo:
  explica todas as diferenças de julho a setembro.
- **Reembolsos e chargebacks** aparecem à parte e não são descontados. Venda reembolsada antes da carga não aparece.
- **Em protesto** (`in_protest`) conta como venda na Hubla e não no Nexo. **Renovação** conta como paciente novo no Nexo.

## 3. Limites

- Não se aplica ao webhook. Limites da API da Hubla **não verificados**. O código não pagina (um evento por chamada).
- **Nova tentativa:** depende da Hubla e do n8n (**não verificado**). O Nexo responde 401 sem token, 400 corpo inválido, 200 com 0 gravadas
  para evento sem fatura, 500 em falha do banco. O upsert é idempotente (reenvio é seguro). Não há reconciliação para webhook perdido.

## 4. Token

- **n8n → Nexo:** `SYNC_SECRET` comparado em tempo constante (`checkout-vendas.ts:339-350`). O `client_id` vem na URL definida no n8n:
  fluxo mal configurado gravaria no cliente errado.
- **Hubla → n8n:** `x-hubla-token`, validado no n8n (não verificado).
- **Dado pessoal:** `semDadosPessoais` tira comprador, e-mail, telefone, documento e endereço antes de gravar (`checkout-vendas.ts:89-113`).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Eventos chegam fora de ordem; a doc manda usar `invoice.version` | **Não** (um `expired` depois do `paid` tira a venda) | `checkout-vendas.ts:322-337` |
| `subtotalCents` × `totalCents`: carga usa total, webhook usa subtotal | Parcial (decisão pendente) | `checkout-vendas.ts:202` |
| Order bump: uma fatura com vários itens e o total já somado; a função ainda soma as filhas | Não verificado (nenhum webhook real gravado) | migração `20261031170000:82-84` |
| Reembolso de `list_refunds` sem id da fatura, em reais, na data do repasse | Parcial (conversão certa; ligação e data erradas) | carga feita fora do repositório |
| Fuso: Hubla em UTC, Nexo em São Paulo | Sim (o Nexo está certo para a clínica; falta explicar na tela) | `pacientes_periodo` |
| Venda em protesto conta na Hubla | **Não** | migração `20261031170000:86` |
| Renovação de assinatura não é paciente novo | **Não** | migração `20261031170000:86` |
| Webhook sem `paidAt` usa `updatedAt` ou a hora do recebimento | Parcial | `checkout-vendas.ts:204` |
| Mesma fatura chegando mais de uma vez | Sim (upsert) | `checkout-vendas.ts:316` |
| Dado pessoal do comprador | Sim (removido) | `checkout-vendas.ts:89-113` |
| Hubla parada mostra zero em vez de "não medido"; só volta ao CRM depois de 180 dias | **Não** | migração `20261031170000:60-70, 95` |

## 6. Mudanças anunciadas

**Não verificado** (doc bloqueada). O código aceita qualquer corpo com `event.invoice` e não rejeita a v1.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 31/10/2026 | Carga do passado (jul–out) feita por fora do repositório, sem ligação dos reembolsos | Pendente: carga desde o início pelo repositório |
| 31/10/2026 | Regra "usar Hubla se houve venda nos últimos 180 dias" zerou maio e junho (eram 90 vendas) | Pendente: Hubla só a partir da primeira venda gravada |
| 01/11/2026 | Webhook não gravava (passo do n8n desligado esperando credencial) | Pendente: ligar o n8n |

## Teste de contrato

`scripts/test-contrato-hubla.ts`: só offline (não há GET). Passa webhook pago, reembolso, evento sem fatura e carga pelo
`normalizarWebhookHubla`/`normalizarCorpo` reais. A amostra usa subtotal = total para não travar a decisão sobre qual valor usar.
Conferência ao vivo recomendada (rotina separada, fora deste teste): total do mês no Nexo × `list_sales` da Hubla.
