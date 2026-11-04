# Hubla (webhook de vendas)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (páginas `.md` de
> `hubla.gitbook.io/docs`) e código no commit `89ae33c`. As linhas citadas mudam com as correções. "Não verificado" = não confirmado na
> doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Vendas do checkout de um cliente. **O Nexo não chama a API da Hubla**: recebe o webhook repassado pelo n8n e uma carga do
passado. O código já segue a doc nos pontos que mais quebram: valor bruto em `totalCents`, ordem pelo `invoice.version`, fatura "filha"
do modo de compatibilidade (`-offer-` + `parentInvoiceId`) sem somar em dobro. A doc trouxe duas novidades: o **modo de envio**
(`x-hubla-delivery-mode`: `standard` × `compatibility`) muda quantos avisos chegam por venda, e a lista oficial de status **não tem
`in_protest`** (tem `disputed`).

## 1. O que usamos

- **Versão:** webhook **v2** (`"version": "2.0.0"` em todos os exemplos de Fatura). O código guarda a versão só no bruto e não confere.
- **Entrada:** `POST /api/sync/manual?checkout=hubla&client_id=<uuid>` com `Authorization: Bearer <SYNC_SECRET>`, chamado pelo n8n
  (`api/sync/manual.ts:87-89`; `api/_lib/checkout-vendas.ts`). A validação do `x-hubla-token` fica no n8n (**não verificado**: o fluxo
  do n8n não está no repositório).
- **Doc oficial (lida em 01/11/2026):** índice <https://hubla.gitbook.io/docs/llms.txt>;
  [Webhooks: introdução](https://hubla.gitbook.io/docs/webhooks/introducao),
  [Como enviar seus dados](https://hubla.gitbook.io/docs/webhooks/como-enviar-seus-dados),
  [Proteja seu endpoint](https://hubla.gitbook.io/docs/webhooks/proteja-seu-endpoint),
  [Boas práticas](https://hubla.gitbook.io/docs/webhooks/boas-praticas),
  [Histórico de eventos](https://hubla.gitbook.io/docs/webhooks/historico),
  [Eventos de Fatura](https://hubla.gitbook.io/docs/webhooks/eventos/fatura),
  [Solicitação de reembolso](https://hubla.gitbook.io/docs/webhooks/eventos/solicitacao-de-reembolso),
  [API Pública: introdução](https://hubla.gitbook.io/docs/api-publica/introducao) e
  [configuração](https://hubla.gitbook.io/docs/api-publica/configuracao).

| Corpo | Campos lidos | Código |
|---|---|---|
| webhook (`{type, event}`, ou só `event`, ou `{body:{event}}`) | `type` ou `event.type`; `event.invoice.id, status, type (sell/renewal/upgrade), parentInvoiceId` (ou `-offer-` no id), `amount.totalCents` (e `subtotalCents` só na falta), `version`, `statusAt[]` (`when` + `status`: data do pagamento = 1º `paid`, do reembolso = último `refunded`/`chargeback`), `modifiedAt` (última alteração; desempate da ordem), `paidAt, refundedAt, chargebackAt, updatedAt` só como reserva (não existem no webhook v2 oficial), `paymentMethod, currency, payer.phone` (só vira chave), `paymentSession.utm`; `event.product` ou `products[0]` | `checkout-vendas.ts:194-264` |
| carga (`[...]` ou `{vendas:[...]}`) | `externo_id, status, tipo, metodo, valor_centavos, moeda, pago_em, reembolsado_em, produto, oferta_id, telefone, parent_externo_id, utm` | `checkout-vendas.ts:266-302` |

## 2. Significado de cada número

- **Valor (verificado):** exemplo da doc: `subtotalCents: 120000`, `discountCents: 24000`, `prorataCents: 0`, `installmentFeeCents: 16320`,
  `totalCents: 112320`. Ou seja, **`total` = `subtotal` − desconto (cupom) + juros do parcelamento (+ pró-rata)**; o `subtotal` é o preço
  antes de cupom e de juros. Desde 23/09/2026 cada valor vem também em reais (`amount.total` = `totalCents`/100). O Nexo usa `totalCents`
  (o que o comprador pagou, com juros e sem cupom), em R$ bruto, antes da taxa da Hubla (repasse em `receivers[].totalCents`).
- **Status (verificado):** `invoice.status_updated` vem "em toda transição de status: `unpaid`, `paid`, `overdue`, `refunded`, `disputed`,
  `chargeback`, `canceled`" (há também o evento de fatura expirada). **`in_protest` não está na lista**: o código traduz `disputed`
  para `in_protest` e conta como venda (`checkout-vendas.ts:44, 85`) — decisão de negócio a confirmar.
- **"Fecharam" com checkout** = pessoas distintas com fatura pai paga no período, no horário de **São Paulo**.
- **Fuso:** a Hubla agrupa por dia em UTC; o Nexo em São Paulo.
- **Reembolsos e chargebacks** aparecem à parte e não são descontados.
- **Renovação** (`invoice.type = renewal`) conta como paciente novo no Nexo: **regra de negócio pendente**.

## 3. Limites

- **Webhook (verificado):** "A Hubla não garante a entrega dos eventos na ordem em que foram gerados"; "Utilize a propriedade 'version'
  presente nas entidades de assinatura e fatura para garantir que apenas as atualizações mais recentes sejam processadas". O código faz
  isso (`checkout-vendas.ts:371-420`).
- **Modo de envio (verificado):** "**Integração recomendada** — envia um aviso por venda"; "**Modo de compatibilidade** — numa venda com
  mais de um produto, envia dois avisos para cada produto" (2 × N). Nos "avisos do produto", `invoice.id` vira `<id-da-fatura>-offer-<posição>`
  ("Esse identificador não existe na Hubla"), `parentInvoiceId` aponta para a real e os centavos são rateados, podendo vir fracionários
  (`3618.9999999999995`). Os "avisos da venda" repetem a fatura real com o total inteiro. O Nexo: upsert por id da fatura (avisos da venda
  colapsam) e filha `-offer-` gravada com `parent_externo_id`, sem somar ao valor da pai (`checkout-vendas.ts:20-25, 205`). **Qual modo a
  regra do cliente usa: não verificado** (está no painel da Hubla e no cabeçalho `x-hubla-delivery-mode`, que o n8n não repassa).
- **Idempotência (verificado):** `x-hubla-idempotency` "identifica o aviso, não a venda". A doc manda colapsar por `type` +
  `parentInvoiceId ?? invoice.id` + `invoice.status`. O código não precisa do cabeçalho (upsert por fatura + mescla por versão).
- **Novas tentativas:** **não verificado** — a doc mostra o "número de tentativas realizadas" no histórico e permite reprocessar qualquer
  evento manualmente, mas não publica quantas tentativas automáticas nem por quanto tempo. Também não diz se o n8n repassa o 500.
- **API Pública (verificado, o Nexo não usa):** base `https://backend-bff-public-api.platform.hub.la`, chave no `Authorization` "sem o prefixo
  Bearer", no máximo 5 tokens ativos; acima do teto, `429` com `Retry-After` e cabeçalhos `X-RateLimit-Limit/Remaining/Reset`.

## 4. Token

- **n8n → Nexo:** `SYNC_SECRET` comparado em tempo constante (`checkout-vendas.ts:425-436`). O `client_id` vem na URL definida no n8n.
- **Hubla → n8n (verificado):** `x-hubla-token` "presente em todas as requisições", obtido em Integrações > Webhook > Autenticação. A Hubla
  envia também de "uma lista específica de endereços IP". Sem TLS 1.3 ("os webhooks da Hubla não são compatíveis com TLS v1.3").
- **Dado pessoal:** `semDadosPessoais` tira comprador, e-mail, telefone, documento e endereço antes de gravar (`checkout-vendas.ts:112`).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Eventos fora de ordem; usar `invoice.version` (doc) | **Sim** (versão; sem versão, o status não regride) | `checkout-vendas.ts:360-420` |
| `subtotalCents` × `totalCents` (total = subtotal − cupom + juros) | **Sim** (usa `totalCents`, como a carga) | `checkout-vendas.ts:223` |
| Modo de compatibilidade: 2 × N avisos e fatura fabricada `-offer-` com valor rateado | **Sim** (upsert por fatura; filha não soma à pai) | `checkout-vendas.ts:205`; `supabase/migrations/20261102130000_hubla_cobertura.sql:122-127` |
| Status `disputed` (doc) tratado como `in_protest` e contado como venda | Decisão pendente | `checkout-vendas.ts:44, 85` |
| Reembolso de `list_refunds` sem id da fatura, em reais | Parcial (conversão certa; ligação pendente) | `scripts/carga-hubla-passado.ts` |
| Renovação de assinatura não é paciente novo | **Não** (regra de negócio) | `supabase/migrations/20261102130000_hubla_cobertura.sql` |
| Datas do webhook v2 em `statusAt[]`/`modifiedAt`, não em `paidAt`/`updatedAt` | Sim (desde 02/11/2026; hora do recebimento só sem nenhuma data) | `checkout-vendas.ts` (`quandoStatusHubla`), `scripts/test-contrato-hubla.ts` com amostra no formato oficial |
| Mesma fatura chegando mais de uma vez | Sim (upsert) | `checkout-vendas.ts:353` |
| Dado pessoal do comprador | Sim (removido) | `checkout-vendas.ts:112` |
| Hubla parada mostra zero em vez de "não medido" | Sim desde `20261102130000` (Hubla só a partir da primeira venda gravada) | `supabase/migrations/20261102130000_hubla_cobertura.sql` |

## 6. Mudanças anunciadas (verificado em 01/11/2026)

- **Modo de envio por regra** ("Integração recomendada" × "Modo de compatibilidade"): "Nada muda sozinho"; a troca é manual na regra.
  Trocar para a recomendada muda `products[].id` (id do produto em vez do id da oferta) e passa a mandar 1 aviso por venda.
- Desde 23/09/2026, `amount` traz também os valores em reais.
- **Fim da v1/v2 do webhook: não anunciado** — a doc atual só mostra eventos v2.0.0 e não fala em desligar versão.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 31/10/2026 | Carga do passado (jul–out) feita por fora do repositório, sem ligação dos reembolsos | `scripts/carga-hubla-passado.ts`; ligação dos reembolsos pendente |
| 31/10/2026 | Regra "usar Hubla se houve venda nos últimos 180 dias" zerou maio e junho | Hubla só a partir da primeira venda gravada (`20261102130000`) |
| 01/11/2026 | Webhook não gravava (passo do n8n desligado esperando credencial) | Pendente: ligar o n8n |

## Teste de contrato

`scripts/test-contrato-hubla.ts`: só offline (não há GET). Passa webhook pago, reembolso, evento sem fatura e carga pelo
`normalizarWebhookHubla`/`normalizarCorpo` reais. Conferência ao vivo recomendada (rotina separada): total do mês no Nexo × `list_sales`.
