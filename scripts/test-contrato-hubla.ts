// Contrato do webhook v2 da Hubla (repassado pelo n8n) e da carga normalizada. Doc: docs/apis/hubla.md.
// Sem modo ao vivo: o Nexo não chama a API da Hubla, só recebe o webhook. A conferência ao vivo é a comparação
// de totais por mês com list_sales (ver docs/apis/hubla.md, "O que usamos").
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { normalizarCorpo, normalizarWebhookHubla } from "../api/_lib/checkout-vendas";

const FATURA = [
  "event: object",
  "event.invoice: object",
  "event.invoice.id: string|number",
  "event.invoice.status?: string|null",
  "event.invoice.type?: string|null",
  "event.invoice.amount?: object|null",
  "event.invoice.amount.totalCents?: number|string",
  "event.invoice.amount.subtotalCents?: number|string",
  "event.invoice.paidAt?: string|null",
];

await rodarContrato({
  api: "hubla",
  endpoints: [
    {
      nome: "webhook_pago",
      campos: campos([
        "type: string",
        "version?: string",
        ...FATURA,
        // version da fatura: a doc manda usar para descartar evento fora de ordem; o código ainda não lê.
        "event.invoice.version?: number|string",
        "event.invoice.paymentMethod?: string",
        "event.invoice.payer?: object|null",
        "event.invoice.paymentSession?: object|null",
        "event.product?: object",
        "event.products?: array",
        "event.products[].offers?: array",
      ]),
    },
    { nome: "webhook_reembolso", campos: campos(["type: string", ...FATURA, "event.invoice.refundedAt?: string|null"]) },
    { nome: "webhook_sem_fatura", campos: campos(["type: string", "event: object"]) },
    { nome: "carga", campos: campos(["[].externo_id: string", "[].status: string", "[].valor_centavos: number", "[].pago_em?: string|null"]) },
  ],
  normalizadores: (f: any) => {
    const pago = normalizarWebhookHubla(f.webhook_pago, new Date("2026-10-20T13:01:00Z"));
    assert.ok(pago.ok && pago.vendas.length === 1, "venda paga lida");
    if (!pago.ok) return;
    const v = pago.vendas[0];
    assert.equal(v.externo_id, "inv-exemplo-0001");
    assert.equal(v.status, "paid");
    assert.equal(v.valor_centavos, 49700, "amostra com subtotal = total, para não travar a decisão sobre qual usar");
    assert.equal(v.pago_em, "2026-10-20T13:00:00.000Z");
    assert.equal(v.produto, "Produto de exemplo");
    assert.equal(v.oferta_id, "ofr-exemplo-1");
    assert.deepEqual(v.utm, { source: "instagram", medium: "bio", campaign: "exemplo" });
    assert.ok(v.telefone_chave, "telefone vira só a chave");
    assert.ok(!JSON.stringify(v.bruto).includes("comprador@exemplo.com"), "comprador não vai para o bruto");
    const reemb = normalizarWebhookHubla(f.webhook_reembolso);
    assert.ok(reemb.ok && reemb.vendas[0].status === "refunded" && reemb.vendas[0].reembolsado_em === "2026-10-25T10:00:00.000Z");
    const ign = normalizarWebhookHubla(f.webhook_sem_fatura);
    assert.ok(ign.ok && ign.vendas.length === 0 && ign.ignorado === "evento sem fatura");
    const carga = normalizarCorpo("hubla", f.carga);
    assert.ok(carga.ok && carga.vendas[0].valor_centavos === 120000 && carga.vendas[0].pago_em === "2026-09-01T00:26:00.000Z");
  },
});
