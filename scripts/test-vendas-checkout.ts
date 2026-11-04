import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chaveTelefone, gravarVendas, mesclar, normalizarCorpo, normalizarStatus, normalizarWebhookHubla, novaEhMaisRecente,
  pesoStatus, semDadosPessoais, type VendaNormalizada,
} from "../api/_lib/checkout-vendas";
import manual from "../api/sync/manual";
import { paraCarga, resumoPorMes } from "./carga-hubla-passado";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import { avisoCheckout, fonteDoNumero, legendaDoNumero, textoReembolsos, textoRenovacoes, type Numero } from "../src/lib/pacientes";

// Migrações 20261031170000 (vendas do checkout como fonte de "Fecharam") e 20261102130000 (cobertura, order bump,
// ordem dos eventos, protesto, renovação e pessoas) em banco descartável. Nunca conecta à produção nem chama a Hubla;
// os dados são fictícios.
type R = Record<string, any>;
const MIGRACAO = "20261031170000_vendas_checkout.sql";
const COBERTURA = "20261102130000_hubla_cobertura.sql";
const parado = "77777777-7777-4777-8777-777777777777", paradoSemCrm = "88888888-8888-4888-8888-888888888888";
const conn3 = "99999999-9999-4999-8999-999999999999";
const cid = "11111111-1111-4111-8111-111111111111", semCheckout = "22222222-2222-4222-8222-222222222222";
const dono = "33333333-3333-4333-8333-333333333333", intruso = "44444444-4444-4444-8444-444444444444";
const conn = "55555555-5555-4555-8555-555555555555", conn2 = "66666666-6666-4666-8666-666666666666";
const pessoaAna = "aaaaaaaa-0000-4000-8000-000000000001";
const TEL_ANA = "+55 (21) 99999-0001", EMAIL = "ana.ficticia@example.test", CPF = "123.456.789-09";

function webhook(tipo: string, invoice: R, extra: R = {}): R {
  return {
    type: tipo, version: "2.0.0",
    event: {
      product: { id: "prod-1", name: "Mentoria Doctor" },
      products: [{ id: "prod-1", name: "Mentoria Doctor", offers: [{ id: "oferta-1" }] }],
      user: { firstName: "Ana", lastName: "Souza", email: EMAIL, phone: TEL_ANA, document: CPF },
      invoice: {
        status: "paid", type: "sell", paymentMethod: "credit_card", currency: "BRL",
        amount: { subtotalCents: 50000, totalCents: 52000 },
        payer: { firstName: "Ana", lastName: "Souza", document: CPF, email: EMAIL, phone: TEL_ANA },
        paymentSession: { url: `https://pay.example.test/c?email=${EMAIL}`, utm: { source: "instagram", medium: "bio", campaign: "out26", term: null, content: "reel-3" } },
        address: { street: "Rua Fictícia", number: "10", zipCode: "20000-000", city: "Rio" },
        ...invoice,
      },
      ...extra,
    },
  };
}

// --- 1. Normalização do webhook (sem banco) ---------------------------------------------------------------------
{
  assert.equal(chaveTelefone(TEL_ANA), "2199990001");
  assert.equal(chaveTelefone("021 99999-0001"), "2199990001");
  assert.equal(chaveTelefone("123"), null);
  assert.equal(normalizarStatus("APPROVED"), "paid");
  assert.equal(normalizarStatus("charged-back"), "chargeback");

  // Datas do webhook v2 oficial: statusAt[] (when + status) e modifiedAt; o aviso chega muito depois (reprocessado).
  {
    const chegou = new Date("2030-01-01T00:00:00Z");
    const hist = (...xs: [string, string][]) => xs.map(([status, when]) => ({ status, when }));
    const pago = normalizarWebhookHubla(webhook("invoice.status_updated", {
      id: "inv-v2", status: "paid", version: 2, statusAt: hist(["unpaid", "2026-10-05T12:59:00Z"], ["paid", "2026-10-05T13:00:00Z"]),
      saleDate: "2026-10-05T12:59:00Z", modifiedAt: "2026-10-05T13:00:00Z",
    }), chegou);
    assert.ok(pago.ok);
    assert.equal(pago.vendas[0].pago_em, "2026-10-05T13:00:00.000Z", "pago_em = when do paid, não a hora do aviso");
    assert.equal(pago.vendas[0].atualizado_em, "2026-10-05T13:00:00.000Z", "atualizado_em = modifiedAt");
    const estorno = normalizarWebhookHubla(webhook("invoice.status_updated", {
      id: "inv-v2", status: "chargeback", version: 5,
      statusAt: hist(["unpaid", "2026-10-05T12:59:00Z"], ["paid", "2026-10-05T13:00:00Z"], ["disputed", "2026-10-07T09:00:00Z"], ["chargeback", "2026-10-20T15:00:00Z"]),
      modifiedAt: "2026-10-20T15:00:01Z",
    }), chegou);
    assert.ok(estorno.ok);
    assert.equal(estorno.vendas[0].status, "chargeback");
    assert.equal(estorno.vendas[0].reembolsado_em, "2026-10-20T15:00:00.000Z", "reembolsado_em = when do chargeback");
    assert.equal(estorno.vendas[0].pago_em, "2026-10-05T13:00:00.000Z");
    const protesto = normalizarWebhookHubla(webhook("invoice.status_updated", {
      id: "inv-v3", status: "disputed", statusAt: hist(["paid", "2026-10-06T10:00:00Z"], ["disputed", "2026-10-08T10:00:00Z"]), modifiedAt: "2026-10-08T10:00:00Z",
    }), chegou);
    assert.ok(protesto.ok && protesto.vendas[0].status === "in_protest" && protesto.vendas[0].pago_em === "2026-10-06T10:00:00.000Z");
    // Sem histórico: a última alteração (modifiedAt) vale antes da hora do aviso; sem nada, a hora do aviso.
    const semHist = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-v4", modifiedAt: "2026-10-09T10:00:00Z" }), chegou);
    assert.ok(semHist.ok && semHist.vendas[0].pago_em === "2026-10-09T10:00:00.000Z");
    const nada = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-v5" }), chegou);
    assert.ok(nada.ok && nada.vendas[0].pago_em === chegou.toISOString());
    const pendente = normalizarWebhookHubla(webhook("invoice.status_updated", { id: "inv-v6", status: "unpaid", statusAt: hist(["unpaid", "2026-10-09T10:00:00Z"]) }), chegou);
    assert.ok(pendente.ok && pendente.vendas[0].pago_em === null, "fatura não paga não ganha data de pagamento");
    // Ordem dos eventos por modifiedAt quando a versão falta.
    const velho = normalizarWebhookHubla(webhook("invoice.status_updated", { id: "inv-v7", status: "paid", modifiedAt: "2026-10-01T10:00:00Z" }), chegou);
    const novo = normalizarWebhookHubla(webhook("invoice.status_updated", { id: "inv-v7", status: "refunded", modifiedAt: "2026-10-03T10:00:00Z" }), chegou);
    assert.ok(velho.ok && novo.ok);
    assert.equal(novaEhMaisRecente(velho.vendas[0], novo.vendas[0]), true, "modifiedAt desempata");
  }

  const n = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00.000Z" }));
  assert.ok(n.ok);
  const v = n.vendas[0];
  assert.equal(v.externo_id, "inv-1");
  assert.equal(v.parent_externo_id, null);
  assert.equal(v.status, "paid");
  assert.equal(v.valor_centavos, 52000, "valor bruto: totalCents, como a carga do passado e a Hubla");
  assert.equal(v.pago_em, "2026-10-05T13:00:00.000Z");
  assert.equal(v.reembolsado_em, null);
  assert.equal(v.produto, "Mentoria Doctor");
  assert.equal(v.oferta_id, "oferta-1");
  assert.equal(v.tipo, "sell");
  assert.equal(v.metodo, "credit_card");
  assert.deepEqual(v.utm, { source: "instagram", medium: "bio", campaign: "out26", content: "reel-3" });
  assert.equal(v.telefone_chave, "2199990001");
  const bruto = JSON.stringify(v.bruto);
  for (const pessoal of ["Ana", "Souza", EMAIL, "99999-0001", CPF, "Rua Fictícia", "20000-000", "pay.example.test"])
    assert.ok(!bruto.includes(pessoal), `bruto sem "${pessoal}"`);
  assert.ok(bruto.includes("Mentoria Doctor") && bruto.includes("inv-1") && bruto.includes("instagram"), "bruto guarda produto, fatura e UTM");

  // Sem invoice.status: o tipo do evento decide. Só totalCents: vale ele.
  const sem = normalizarWebhookHubla({ event: { type: "invoice.refunded", invoice: { id: "inv-2", amount: { totalCents: 1000 } } } }, new Date("2026-10-20T10:00:00Z"));
  assert.ok(sem.ok);
  assert.equal(sem.vendas[0].status, "refunded");
  assert.equal(sem.vendas[0].valor_centavos, 1000);
  assert.equal(sem.vendas[0].reembolsado_em, "2026-10-20T10:00:00.000Z");
  assert.equal(sem.vendas[0].produto, null);

  // Order bump: fatura filha com "-offer-" aponta para a pai.
  const filha = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-1-offer-abc", parentInvoiceId: "inv-1", amount: { subtotalCents: 9700 } }));
  assert.ok(filha.ok);
  assert.equal(filha.vendas[0].parent_externo_id, "inv-1");
  const filha2 = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-9-offer-x" }));
  assert.ok(filha2.ok);
  assert.equal(filha2.vendas[0].parent_externo_id, "inv-9", "sem parentInvoiceId, a pai sai do id");

  // Formatos que chegam pelo n8n: { body: { event } } e o evento direto.
  const n8n = normalizarCorpo("hubla", { body: webhook("x", { id: "inv-3" }) });
  assert.ok(n8n.ok && n8n.vendas[0].externo_id === "inv-3");
  const direto = normalizarCorpo("hubla", JSON.stringify(webhook("x", { id: "inv-4" }).event));
  assert.ok(direto.ok && direto.vendas[0].externo_id === "inv-4");

  // Evento sem fatura é ignorado; corpo sem evento e fatura sem id são recusados.
  assert.deepEqual(normalizarWebhookHubla({ type: "subscription.activated", event: { subscription: { id: "s" } } }), { ok: true, vendas: [], ignorado: "evento sem fatura" });
  assert.equal(normalizarCorpo("hubla", { qualquer: 1 }).ok, false);
  assert.deepEqual(normalizarWebhookHubla({ event: { invoice: { status: "paid" } } }), { ok: false, motivo: "fatura sem id" });
  assert.equal(normalizarCorpo("hotmart", { event: {} }).ok, false, "webhook de outro checkout ainda não é lido");

  // Carga do passado, normalizada: telefone vira só a chave; campo a mais é recusado.
  const carga = normalizarCorpo("hubla", [{ externo_id: "h-1", status: "paid", tipo: "sell", metodo: "pix", valor_centavos: 100, pago_em: "2026-10-01T12:00:00Z", produto: "P", oferta_id: "o", telefone: TEL_ANA }]);
  assert.ok(carga.ok);
  assert.equal(carga.vendas[0].telefone_chave, "2199990001");
  assert.ok(!JSON.stringify(carga.vendas[0]).includes("99999-0001"));
  assert.equal(normalizarCorpo("hubla", [{ externo_id: "h-1", status: "paid", valor_centavos: 1, email: EMAIL }]).ok, false);
  assert.equal(normalizarCorpo("hubla", { vendas: [{ externo_id: "h-1", status: "paid", valor_centavos: -1 }] }).ok, false);

  // "Pago" que chega depois do reembolso não desfaz o reembolso; campo que não veio fica como estava.
  const pago = (n.vendas[0]);
  const reemb: VendaNormalizada = { ...pago, status: "refunded", reembolsado_em: "2026-10-09T00:00:00.000Z", valor_centavos: null, pago_em: null };
  const m1 = mesclar(pago, reemb);
  assert.equal(m1.status, "refunded");
  assert.equal(m1.valor_centavos, 52000);
  assert.equal(m1.pago_em, pago.pago_em);
  assert.equal(mesclar(m1, pago).status, "refunded");
  assert.equal(mesclar(pago, { ...pago, pago_em: "2026-10-30T00:00:00.000Z" }).pago_em, pago.pago_em, "reenvio não muda a data do pagamento");
  assert.equal(mesclar(m1, { ...reemb, reembolsado_em: "2026-10-30T00:00:00.000Z" }).reembolsado_em, "2026-10-09T00:00:00.000Z");

  // Evento fora de ordem (a Hubla não garante a ordem): sem versão, o status não regride.
  assert.deepEqual([pesoStatus("refunded"), pesoStatus("chargeback"), pesoStatus("paid"), pesoStatus("in_protest"), pesoStatus("expired")], [2, 2, 1, 1, 0]);
  for (const atrasado of ["expired", "unpaid", "canceled", "failed", "pending"]) {
    const m = mesclar(pago, { ...pago, status: atrasado, pago_em: null, valor_centavos: null });
    assert.equal(m.status, "paid", `"${atrasado}" atrasado não apaga a venda paga`);
    assert.equal(m.pago_em, pago.pago_em);
    assert.equal(m.valor_centavos, 52000);
  }
  assert.equal(mesclar(pago, { ...pago, status: "in_protest" }).status, "in_protest", "protesto depois do pago vale");
  assert.equal(mesclar({ ...pago, status: "in_protest" }, pago).status, "paid", "protesto resolvido volta a pago");
  assert.equal(mesclar(pago, { ...pago, status: "chargeback", reembolsado_em: "2026-10-10T00:00:00.000Z" }).status, "chargeback");
  // Com invoice.version: evento de versão menor é ignorado; de versão maior vale (sem desfazer reembolso).
  const v3 = normalizarWebhookHubla(webhook("invoice.status_updated", { id: "inv-v", status: "in_protest", version: 3, updatedAt: "2026-10-06T10:00:00Z", amount: { totalCents: 7000 } }));
  const v2 = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-v", status: "paid", version: 2, updatedAt: "2026-10-05T10:00:00Z", paidAt: "2026-10-05T10:00:00Z", amount: { totalCents: 6000 } }));
  assert.ok(v3.ok && v2.ok);
  assert.equal(v3.vendas[0].versao, 3);
  assert.equal(novaEhMaisRecente(v3.vendas[0], v2.vendas[0]), false);
  const mv = mesclar(v3.vendas[0], v2.vendas[0]);
  assert.equal(mv.status, "in_protest", "versão 2 depois da 3 é ignorada");
  assert.equal(mv.valor_centavos, 7000);
  assert.equal(mv.versao, 3);
  assert.equal(mv.pago_em, "2026-10-05T10:00:00.000Z", "mas preenche o que faltava (data do pagamento)");
  const semVersao = { ...v2.vendas[0], versao: null };
  assert.equal(novaEhMaisRecente(v3.vendas[0], semVersao), false, "sem versão, o updatedAt desempata");
  assert.equal(mesclar(v3.vendas[0], { ...semVersao, atualizado_em: null }).status, "paid", "sem ordem nenhuma, protesto e pago têm o mesmo peso");
  const reembV5 = { ...v3.vendas[0], status: "refunded", versao: 5, reembolsado_em: "2026-10-08T00:00:00.000Z" };
  assert.equal(mesclar(reembV5, { ...v2.vendas[0], versao: 6 }).status, "refunded", "nem versão maior faz pago desfazer reembolso");
  // Valor: subtotal só quando não há total.
  const soSub = normalizarWebhookHubla(webhook("x", { id: "s", amount: { subtotalCents: 4000 } }));
  assert.ok(soSub.ok && soSub.vendas[0].valor_centavos === 4000);

  // Carga do passado com a origem de produção: o pedido de reembolso solto (list_refunds) guarda o repasse à parte.
  const cargaR = normalizarCorpo("hubla", [{ externo_id: "rr-1", status: "refunded", valor_centavos: 2500, reembolsado_em: "2026-10-13T10:00:00Z",
    repasse_em: "2026-10-20T10:00:00Z", origem: "carga_list_refunds", id_tipo: "refund_request" }]);
  assert.ok(cargaR.ok);
  assert.deepEqual(cargaR.vendas[0].bruto, { origem: "carga_list_refunds", id_tipo: "refund_request", criado_em: "2026-10-13T10:00:00.000Z", repasse_em: "2026-10-20T10:00:00.000Z" });
  assert.equal(normalizarCorpo("hubla", [{ externo_id: "rr-2", status: "paid", valor_centavos: 1, pago_em: "2026-10-01T00:00:00Z", id_tipo: "refund_request" }]).ok, false, "pedido de reembolso não é venda paga");

  // Script da carga do passado (scripts/carga-hubla-passado.ts): respostas de list_sales e list_refunds, no formato da
  // ferramenta da Hubla (valores fictícios), viram a carga que o endpoint aceita.
  const exportHubla = [
    { sales: [
      { id: "s-1", status: "paid", type: "sell", paymentMethod: "pix", currency: "BRL", totalCents: 9700, paidAt: "2026-09-01T00:26:00.000Z", items: [{ id: "p", name: "Curso A" }] },
      { id: "s-2", status: "in_protest", type: "renewal", paymentMethod: "credit_card", currency: "BRL", totalCents: 121560, paidAt: "2026-09-10T15:00:00.000Z", items: [{ id: "q", name: "Club" }, { id: "r", name: "Bump" }] },
      { id: "s-3", status: "refunded", type: "sell", totalCents: 100, paidAt: "2026-09-11T15:00:00.000Z" },
    ], periodTotalCents: 131260 },
    [{ refunds: [
      { id: "rf-1", amount: 391, currency: "BRL", status: "accepted", scheduledFor: "2026-10-05T02:10:41.129Z", createdAt: "2026-09-28T02:10:40.706Z" },
      { id: "rf-2", amount: 99.9, currency: "BRL", status: "accepted", scheduledFor: "2026-11-12T00:00:00.000Z", createdAt: "2026-11-05T00:00:00.000Z" },
      { id: "rf-3", amount: 10, currency: "BRL", status: "pending", createdAt: "2026-09-01T00:00:00.000Z" },
    ] }],
  ];
  const pc = paraCarga(exportHubla, { reembolsosAte: "2026-11-01" });
  assert.deepEqual(pc.vendas.map((x) => [x.externo_id, x.status, x.valor_centavos]), [["s-1", "paid", 9700], ["s-2", "in_protest", 121560], ["rf-1", "refunded", 39100]],
    "bruto em centavos; reembolso em reais vira centavos; recusado, pendente e o pedido depois do webhook ficam fora");
  assert.equal(pc.ignoradas, 3);
  assert.deepEqual(resumoPorMes(pc.vendas), { "2026-08": { vendas: 1, centavos: 9700, reembolsos: 0, reembolso_centavos: 0 },
    "2026-09": { vendas: 1, centavos: 121560, reembolsos: 1, reembolso_centavos: 39100 } }, "mês em São Paulo (a Hubla agrupa em UTC)");
  const pn = normalizarCorpo("hubla", { vendas: pc.vendas });
  assert.ok(pn.ok, "o endpoint aceita a carga do script");
  assert.deepEqual(pn.vendas.find((x) => x.externo_id === "rf-1")!.bruto, { origem: "carga_list_refunds", id_tipo: "refund_request", criado_em: "2026-09-28T02:10:40.706Z", repasse_em: "2026-10-05T02:10:41.129Z" });
  assert.deepEqual(pn.vendas.find((x) => x.externo_id === "s-2")!.bruto, { origem: "carga_list_sales", id_tipo: "invoice" });

  assert.deepEqual(semDadosPessoais({ a: "2026-10-05", b: "11999990000", c: [{ email: "x" }], product: { name: "P" }, name: "Fulano" }), { a: "2026-10-05", c: [{}], product: { name: "P" } });

  // Textos da tela.
  const ck = { valor: 3, fonte: "checkout", provedor: "hubla", motivo_sem_dado: null, responsavel: null, reembolsos: { vendas: 1, valor_total: 200 } } as Numero;
  assert.equal(legendaDoNumero("fecharam", ck), "pessoas que compraram no período, pela Hubla");
  assert.equal(legendaDoNumero("fecharam", { ...ck, fonte: "crm" }), "pessoas que compraram no período");
  assert.equal(legendaDoNumero("fecharam", { ...ck, unidade: "vendas" }), "vendas pagas no período, pela Hubla", "sem ligar à pessoa, conta vendas");
  assert.equal(avisoCheckout(ck), null);
  assert.equal(avisoCheckout({ ...ck, crm_antes_de: "2026-06-30", vendas_crm: 2 }), "Antes de 30/06/2026, conta pelo CRM: as vendas da Hubla chegam ao Nexo desde essa data.");
  assert.equal(avisoCheckout({ ...ck, crm_antes_de: "2026-06-30", vendas_crm: 0 }), "Conta só a partir de 30/06/2026, quando as vendas da Hubla começam no Nexo; antes disso, o CRM não marca venda.");
  assert.match(avisoCheckout({ ...ck, crm_depois_de: "2026-10-30" })!, /Depois de 30\/10\/2026, conta pelo CRM: a Hubla não manda venda/);
  assert.equal(avisoCheckout({ ...ck, sem_pessoa: 2, unidade: "pessoas" }), "2 vendas sem telefone contam como uma pessoa cada.");
  assert.match(avisoCheckout({ ...ck, fonte: "crm", checkout_desde: "2026-06-30" })!, /^Conta pelo CRM: as vendas do checkout só chegam ao Nexo desde 30\/06\/2026/);
  assert.match(avisoCheckout({ ...ck, fonte: "crm", checkout_parado_desde: "2026-10-30" })!, /não manda venda ao Nexo desde 30\/10\/2026/);
  assert.equal(textoRenovacoes({ ...ck, renovacoes: { vendas: 1, valor_total: 50 } }, (x) => `R$ ${x}`), "1 renovação de assinatura no período (R$ 50), fora de Fecharam");
  for (const t of [avisoCheckout({ ...ck, crm_antes_de: "2026-06-30", crm_depois_de: "2026-10-30", sem_pessoa: 1 })!, fonteDoNumero("fecharam", ck)]) assert.ok(!/[—–]/.test(t), "sem travessão");
  assert.match(fonteDoNumero("fecharam", ck), /^Hubla: vendas pagas/);
  assert.equal(textoReembolsos(ck, (x) => `R$ ${x}`), "1 reembolso ou chargeback no período (R$ 200)");
  assert.equal(textoReembolsos({ ...ck, reembolsos: { vendas: 0, valor_total: 0 } }, String), null);
  for (const t of [legendaDoNumero("fecharam", ck), fonteDoNumero("fecharam", ck), textoReembolsos(ck, String)!]) assert.ok(!/[—–]/.test(t), "sem travessão");
}

// --- 2. Endpoint: autenticação e validação, sem banco ------------------------------------------------------------
{
  const env = { ...process.env }, fetchOriginal = globalThis.fetch;
  const chamar = async (query: Record<string, string>, body: unknown, auth?: string) => {
    const req = Object.assign(Readable.from([]), { method: "POST", query, body, headers: auth ? { authorization: auth } : {} }) as unknown as VercelRequest;
    let status = 200, result: any;
    const res = { headersSent: false, writableEnded: false, statusCode: 200, setHeader() { return this; },
      status(this: { statusCode: number }, n: number) { status = n; this.statusCode = n; return this; },
      json(v: unknown) { result = v; return this; }, send(v: unknown) { result = v; return this; }, end() { return this; } } as unknown as VercelResponse;
    await manual(req, res);
    return { status, result };
  };
  const logs: string[] = [], info = console.info, err = console.error;
  try {
    globalThis.fetch = async () => { throw new Error("o teste do endpoint não chega a serviço externo"); };
    console.info = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
    console.error = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
    process.env.SYNC_SECRET = "segredo-ficticio-de-teste"; process.env.SUPABASE_URL = "https://offline.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-ficticia";
    const q = { checkout: "hubla", client_id: cid };
    assert.equal((await chamar(q, webhook("x", { id: "i" }))).status, 401, "sem token");
    assert.equal((await chamar(q, webhook("x", { id: "i" }), "Bearer errado")).status, 401);
    const ok = "Bearer segredo-ficticio-de-teste";
    assert.deepEqual(await chamar({ ...q, client_id: "nao-uuid" }, {}, ok), { status: 400, result: { ok: false, motivo: "client_id inválido" } });
    assert.deepEqual(await chamar({ ...q, checkout: "paypal" }, {}, ok), { status: 400, result: { ok: false, motivo: "checkout desconhecido" } });
    assert.deepEqual(await chamar(q, { nada: true }, ok), { status: 400, result: { ok: false, motivo: "corpo sem evento da Hubla" } });
    assert.deepEqual(await chamar(q, { type: "lead.created", event: { lead: {} } }, ok), { status: 200, result: { ok: true, gravadas: 0, ignorado: "evento sem fatura" } });
    assert.ok(!logs.join(" ").includes(EMAIL) && !logs.join(" ").includes("99999"), "nada pessoal no log");
  } finally {
    globalThis.fetch = fetchOriginal; console.info = info; console.error = err;
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
  }
}

// --- 3. Banco: tabela, RLS, gravação e pacientes_periodo --------------------------------------------------------
const db = new PGlite();
/** O pedaço do cliente do Supabase que gravarVendas usa, executado no PGlite como service_role. */
function clienteFalso(): SupabaseClient {
  const consulta = (tabela: string) => {
    const filtros: { col: string; op: "eq" | "in"; v: unknown }[] = [];
    let cols = "*";
    const exec = async () => {
      const args: unknown[] = [];
      const where = filtros.map((f) => { args.push(f.v); return f.op === "eq" ? `${f.col} = $${args.length}` : `${f.col}::text = any($${args.length}::text[])`; });
      await db.exec("set role service_role");
      try { return { data: (await db.query(`select ${cols} from public.${tabela}${where.length ? ` where ${where.join(" and ")}` : ""}`, args)).rows, error: null }; }
      catch (e) { return { data: null, error: e }; }
      finally { await db.exec("reset role"); }
    };
    const b: any = {
      select(c: string) { cols = c; return b; },
      eq(col: string, v: unknown) { filtros.push({ col, op: "eq", v }); return b; },
      in(col: string, v: unknown[]) { filtros.push({ col, op: "in", v }); return b; },
      then(ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) { return exec().then(ok, ko); },
      async upsert(linhas: R[], o: { onConflict: string }) {
        await db.exec("set role service_role");
        try {
          for (const l of linhas) {
            const ks = Object.keys(l), conflito = o.onConflict.split(",");
            await db.query(`insert into public.${tabela}(${ks.join(",")}) values (${ks.map((_, i) => `$${i + 1}`).join(",")})
              on conflict (${conflito.join(",")}) do update set ${ks.filter((k) => !conflito.includes(k)).map((k) => `${k} = excluded.${k}`).join(",")}`,
              ks.map((k) => (l[k] !== null && typeof l[k] === "object" ? JSON.stringify(l[k]) : l[k])));
          }
          return { error: null };
        } catch (e) { return { error: e }; } finally { await db.exec("reset role"); }
      },
    };
    return b;
  };
  return { from: consulta } as unknown as SupabaseClient;
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb,'{}')::jsonb $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  await db.exec("set time zone 'America/Sao_Paulo'");
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO));
  assert.ok(arquivos.includes(COBERTURA));
  for (const f of arquivos.filter((f) => f <= COBERTURA)) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  await db.exec(await readFile(new URL(MIGRACAO, pasta), "utf8")); // rodar de novo não muda nada
  await db.exec(await readFile(new URL(COBERTURA, pasta), "utf8"));
  const def = (await db.query<R>("select pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(def.split("[checkout-cobertura] início").length, 2, "o bloco entra uma vez só");
  assert.ok(!def.includes("cliente_usa_checkout(p_client) as usa"), "a regra dos 180 dias saiu");

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B'),($3,'Clínica fictícia C'),($4,'Clínica fictícia D')", [cid, semCheckout, parado, paradoSemCrm]);
  await q("insert into auth.users(id,email) values ($1,'dono@example.test'),($2,'intruso@example.test')", [dono, intruso]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner'),($5,$2,'owner'),($6,$2,'owner')", [cid, dono, semCheckout, intruso, parado, paradoSemCrm]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}'),($3,$4,'clint',true,'{}'),($5,$6,'clint',true,'{}')", [conn, cid, conn2, semCheckout, conn3, parado]);
  await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial','s1','Fechado'),($2,'p1','Comercial','s1','Fechado'),($3,'p1','Comercial','s1','Fechado')", [conn, conn2, conn3]);
  await q("insert into pessoas(id,client_id,nome,telefone,telefone_chave) values ($1,$2,'Ana Souza',$3,'2199990001')", [pessoaAna, cid, TEL_ANA]);
  // Venda no CRM das duas clínicas: na A, o checkout passa a mandar; na B, o CRM continua.
  for (const [c, cl] of [[conn, cid], [conn2, semCheckout]])
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name)
      values ($1,$2,'clint','L1','sync','{}','p1','s1','won',777,'2026-10-10T14:00:00Z','Bruno')`, [c, cl]);
  // Na A, mais duas vendas do CRM antes de o checkout começar (10/08 e 05/09); na C, uma em maio/2025.
  for (const [c, cl, ext, quando] of [[conn, cid, "L2", "2026-08-10T14:00:00Z"], [conn, cid, "L3", "2026-09-05T14:00:00Z"], [conn3, parado, "L9", "2025-05-10T14:00:00Z"]])
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name)
      values ($1,$2,'clint',$3,'sync','{}','p1','s1','won',300,$4,'Caio')`, [c, cl, ext, quando]);

  const como = async (user: string | null) => {
    await q("reset role");
    if (!user) { await q("set role anon"); return; }
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await q("set role authenticated");
  };
  const ler = async (cliente: string, de = "2026-10-01", ate = "2026-10-31") =>
    (await q("select public.pacientes_periodo($1,$2,$3) r", [cliente, de, ate])).rows[0].r as R;

  // Sem venda do checkout: o CRM, como antes.
  await como(dono);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, false);
  let r = await ler(cid);
  assert.equal(r.numeros.fecharam.fonte, "crm");
  assert.equal(Number(r.numeros.fecharam.valor_total), 777);

  // Webhooks da Hubla gravados pela mesma função do endpoint.
  const admin = clienteFalso();
  const gravar = async (corpo: unknown, agora?: Date) => {
    const n = normalizarCorpo("hubla", corpo, agora);
    assert.ok(n.ok, "normaliza");
    return gravarVendas(admin, cid, "hubla", n.vendas);
  };
  await q("reset role");
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00Z" })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00Z" })), 1, "o mesmo evento de novo");
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1-offer-b", parentInvoiceId: "inv-1", paidAt: "2026-10-05T13:00:00Z", amount: { subtotalCents: 9700 } })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1-offer-b", parentInvoiceId: "inv-1", paidAt: "2026-10-05T13:00:00Z", amount: { subtotalCents: 9700 } })), 1, "filha repetida");
  // "Expirada" atrasada não apaga a venda paga.
  assert.equal(await gravar(webhook("invoice.expired", { id: "inv-1", status: "expired" })), 1);
  // Filha sem a pai (a pai não chegou): vale como venda, pelo valor dela.
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-7-offer-x", paidAt: "2026-10-06T13:00:00Z", amount: { totalCents: 5000 } })), 1);
  // Em protesto (versão 2) e depois um "pago" de versão 1 atrasado: continua em protesto, e conta como venda.
  assert.equal(await gravar(webhook("invoice.status_updated", { id: "inv-8", status: "in_protest", version: 2, paidAt: "2026-10-22T13:00:00Z", payer: {}, amount: { totalCents: 7000 } })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-8", status: "paid", version: 1, paidAt: "2026-10-22T13:00:00Z", payer: {}, amount: { totalCents: 6500 } })), 1);
  // Outra pessoa (sem cadastro no Nexo), paga e depois reembolsada no período; e uma terceira paga em setembro.
  const outra = { firstName: "Bia", email: "bia@example.test", phone: "11988887777" };
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-2", paidAt: "2026-10-07T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1);
  assert.equal(await gravar(webhook("invoice.refunded", { id: "inv-2", status: "refunded", refundedAt: "2026-10-12T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-2", paidAt: "2026-10-07T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1, "pago atrasado");
  // Carga do passado: uma venda sem telefone em outubro e uma de setembro; e um chargeback em outubro de venda de setembro.
  assert.equal(await gravar([
    { externo_id: "h-3", status: "paid", tipo: "sell", metodo: "pix", valor_centavos: 12034, pago_em: "2026-10-20T12:00:00Z", produto: "Curso", oferta_id: "o2" },
    { externo_id: "h-4", status: "paid", tipo: "renewal", metodo: "pix", valor_centavos: 5000, pago_em: "2026-09-20T12:00:00Z", produto: "Curso", oferta_id: "o2" },
    { externo_id: "h-5", status: "chargeback", valor_centavos: 4000, pago_em: "2026-09-21T12:00:00Z", reembolsado_em: "2026-10-03T12:00:00Z", produto: "Curso" },
    // Pedidos de reembolso soltos (list_refunds): 13/10, antes do primeiro webhook (14/10, abaixo), conta; 15/10, depois, não.
    { externo_id: "rr-1", status: "refunded", valor_centavos: 2500, reembolsado_em: "2026-10-13T12:00:00Z", origem: "carga_list_refunds", id_tipo: "refund_request" },
    { externo_id: "rr-2", status: "refunded", valor_centavos: 9900, reembolsado_em: "2026-10-15T12:00:00Z", origem: "carga_list_refunds", id_tipo: "refund_request" },
  ]), 5);
  // A carga de novo (o mesmo export reenviado) sobre o que o webhook gravou: inv-2 segue reembolsada.
  assert.equal(await gravar([{ externo_id: "inv-2", status: "paid", valor_centavos: 30000, pago_em: "2026-10-07T13:00:00Z", origem: "carga_list_sales", id_tipo: "invoice" }]), 1);
  // O primeiro webhook foi gravado em 14/10 (os outros, agora): a partir daí, o reembolso solto não conta.
  await q("update vendas_checkout set recebido_em = '2026-10-14T00:00:00Z' where externo_id = 'inv-1' and client_id = $1", [cid]);

  const linhas = (await q("select * from vendas_checkout order by externo_id")).rows;
  assert.equal(linhas.length, 10, "upsert idempotente: uma linha por fatura");
  const inv1 = linhas.find((l) => l.externo_id === "inv-1")!;
  assert.equal(inv1.pessoa_id, pessoaAna, "ligada à pessoa pelo telefone_chave");
  assert.equal(inv1.telefone_chave, "2199990001");
  assert.equal(inv1.utm.source, "instagram");
  assert.equal(linhas.find((l) => l.externo_id === "inv-2")!.status, "refunded", "pago atrasado (webhook ou carga) não desfaz o reembolso");
  assert.equal(inv1.status, "paid", "expirada atrasada não apaga a venda");
  assert.equal(Number(inv1.valor_centavos), 52000);
  const inv8 = linhas.find((l) => l.externo_id === "inv-8")!;
  assert.deepEqual([inv8.status, Number(inv8.valor_centavos), inv8.bruto.versao_fatura], ["in_protest", 7000, 2], "versão 1 depois da 2 é ignorada");
  assert.equal(linhas.find((l) => l.externo_id === "inv-1-offer-b")!.parent_externo_id, "inv-1");
  const tudo = JSON.stringify(linhas);
  for (const pessoal of [EMAIL, "bia@example.test", "Souza", "Bia", CPF, "99999-0001", "988887777", "Rua Fictícia"])
    assert.ok(!tudo.includes(pessoal), `nenhuma linha guarda "${pessoal}"`);
  const colunas = (await q("select array_agg(column_name::text order by column_name) c from information_schema.columns where table_schema='public' and table_name='vendas_checkout'")).rows[0].c as string[];
  for (const proibida of ["telefone", "email", "nome", "documento"]) assert.ok(!colunas.includes(proibida), `sem coluna ${proibida}`);

  // Com checkout: "fecharam" sai da Hubla. Ana (inv-1 com o bump, e a filha órfã inv-7), h-3 e inv-8 (em protesto);
  // inv-2 reembolsada e h-4 (setembro) ficam fora; a venda do CRM de 10/10 também (o checkout cobre outubro).
  await como(dono);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, true);
  const cob = (await q("select * from public.checkout_cobertura($1)", [cid])).rows[0];
  assert.equal(new Date(cob.desde).toISOString(), "2026-09-20T12:00:00.000Z", "a cobertura começa na primeira venda gravada");
  assert.equal(new Date(cob.webhook_desde).toISOString(), "2026-10-14T00:00:00.000Z");
  assert.equal(cob.parado, false);
  r = await ler(cid);
  const f = r.numeros.fecharam;
  assert.equal(f.fonte, "checkout");
  assert.equal(f.provedor, "hubla");
  assert.equal(f.valor, 3, "pessoas distintas: Ana conta uma vez");
  assert.equal(f.vendas, 4, "o order bump não é venda à parte");
  assert.equal(f.vendas_crm, 0);
  assert.equal(Number(f.valor_total), 520 + 50 + 120.34 + 70, "a pai já traz o total: a filha não soma de novo");
  assert.equal(f.em_protesto, 1);
  assert.equal(f.sem_pessoa, 2);
  assert.equal(f.unidade, "pessoas");
  assert.equal(f.crm_antes_de, null);
  assert.equal(f.crm_depois_de, null);
  assert.deepEqual({ vendas: f.reembolsos.vendas, valor_total: Number(f.reembolsos.valor_total) }, { vendas: 3, valor_total: 300 + 40 + 25 },
    "reembolso e chargeback à parte; o pedido solto depois do primeiro webhook não conta duas vezes");
  const itens = r.listas.fecharam.itens as R[];
  assert.equal(r.listas.fecharam.total, 4);
  assert.ok(itens.every((i) => i.fonte === "checkout"));
  const ana = itens.find((i) => i.nome === "Ana" && Number(i.valor) === 520)!;
  assert.equal(ana.produto, "Mentoria Doctor");
  assert.equal(ana.procedimento, "Mentoria Doctor");
  assert.equal(ana.data, "2026-10-05");
  assert.deepEqual(itens.filter((i) => i.nome == null).map((i) => i.data).sort(), ["2026-10-20", "2026-10-22"]);
  assert.ok(!JSON.stringify(r).includes("2199990001") && !JSON.stringify(r).includes("99990001"), "a chave do telefone não sai do banco");
  // Setembro atravessa o início da cobertura (20/09): antes, o CRM (05/09); depois, a Hubla. A renovação (h-4) não é
  // paciente novo e vai para 'renovacoes'; o chargeback de outubro não entra.
  const set = (await ler(cid, "2026-09-01", "2026-09-30")).numeros.fecharam;
  assert.equal(set.fonte, "checkout");
  assert.equal(set.vendas, 1);
  assert.equal(set.vendas_crm, 1);
  assert.equal(set.crm_antes_de, "2026-09-20");
  assert.deepEqual({ vendas: set.renovacoes.vendas, valor_total: Number(set.renovacoes.valor_total) }, { vendas: 1, valor_total: 50 });
  assert.equal(set.reembolsos.vendas, 0);
  // P0: agosto, todo antes da primeira venda gravada, vem do CRM (antes: 0 pela Hubla).
  const ago = (await ler(cid, "2026-08-01", "2026-08-31")).numeros.fecharam;
  assert.equal(ago.fonte, "crm");
  assert.equal(ago.valor, 1);
  assert.equal(Number(ago.valor_total), 300);
  assert.equal(ago.checkout_desde, "2026-09-20");
  // Antes da cobertura e sem venda no CRM (o caso do Doctor Creator em maio/2026): "sem dado", e não 0.
  const jul = (await ler(cid, "2026-07-01", "2026-07-31")).numeros.fecharam;
  assert.equal(jul.valor, null);
  assert.equal(jul.alerta, "checkout-sem-cobertura");
  assert.equal(jul.checkout_desde, "2026-09-20");
  assert.equal(jul.motivo_sem_dado, "As vendas da Hubla só chegam ao Nexo desde 20/09/2026, e o CRM não marca venda nesse período. Não dá para contar quem fechou.");

  // Checkout parado (C: vendas só em março/2025, sem telefone, pela carga): março pela Hubla, contando vendas; maio,
  // depois de parado, pelo CRM com o aviso; sem CRM (D), "sem dado" em vez de 0.
  await q("reset role");
  for (const c of [parado, paradoSemCrm]) {
    const nc = normalizarCorpo("hubla", [
      { externo_id: "a-1", status: "paid", tipo: "sell", valor_centavos: 10000, pago_em: "2025-03-10T15:00:00Z" },
      { externo_id: "a-2", status: "paid", tipo: "sell", valor_centavos: 20000, pago_em: "2025-03-12T15:00:00Z" },
    ]);
    assert.ok(nc.ok);
    await gravarVendas(admin, c, "hubla", nc.vendas);
  }
  await como(dono);
  const cobC = (await q("select * from public.checkout_cobertura($1)", [parado])).rows[0];
  assert.equal(cobC.parado, true);
  assert.equal(new Date(cobC.ate).toISOString(), "2025-03-12T15:00:00.000Z");
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [parado])).rows[0].x, false, "parado não usa o checkout (não espera 180 dias)");
  const mar = (await ler(parado, "2025-03-01", "2025-03-31")).numeros.fecharam;
  assert.deepEqual([mar.fonte, mar.valor, mar.vendas, mar.unidade, mar.sem_pessoa, mar.crm_depois_de], ["checkout", 2, 2, "vendas", 2, "2025-03-12"]);
  const mai = (await ler(parado, "2025-05-01", "2025-05-31")).numeros.fecharam;
  assert.deepEqual([mai.fonte, mai.valor, mai.checkout_parado_desde], ["crm", 1, "2025-03-12"]);
  const abr = (await ler(parado, "2025-04-01", "2025-04-30")).numeros.fecharam;
  assert.deepEqual([abr.valor, abr.alerta, abr.checkout_parado_desde], [null, "checkout-parado", "2025-03-12"], "parado e sem venda no CRM: sem dado");
  const maiD = (await ler(paradoSemCrm, "2025-05-01", "2025-05-31")).numeros.fecharam;
  assert.equal(maiD.valor, null, "sem CRM, parado é sem dado, não 0");
  assert.equal(maiD.alerta, "checkout-parado");
  assert.match(maiD.motivo_sem_dado, /A Hubla não manda venda ao Nexo desde 12\/03\/2025/);
  const fevD = (await ler(paradoSemCrm, "2025-02-01", "2025-02-28")).numeros.fecharam;
  assert.equal(fevD.valor, null);
  assert.match(fevD.motivo_sem_dado, /As vendas da Hubla só chegam ao Nexo desde 10\/03\/2025/);

  // A outra clínica, sem checkout, segue pelo CRM.
  await como(intruso);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [semCheckout])).rows[0].x, false);
  const b = await ler(semCheckout);
  assert.equal(b.numeros.fecharam.fonte, "crm");
  assert.equal(Number(b.numeros.fecharam.valor_total), 777);
  assert.equal(b.numeros.fecharam.reembolsos, undefined);

  // Acesso: quem não é da clínica não lê as vendas nem os números; anon nada; ninguém do app escreve.
  assert.equal((await q("select count(*)::int n from vendas_checkout")).rows[0].n, 0, "RLS esconde as vendas de outra clínica");
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, false, "não revela se a outra clínica usa checkout");
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [cid]), /sem acesso/);
  await assert.rejects(() => q("insert into vendas_checkout(client_id,provider,externo_id,status,valor_centavos) values ($1,'hubla','z','paid',1)", [semCheckout]), /permission denied/);
  await como(dono);
  assert.equal((await q("select count(*)::int n from vendas_checkout where client_id = $1", [cid])).rows[0].n, 10);
  await assert.rejects(() => q("update vendas_checkout set status='paid'"), /permission denied/);
  await assert.rejects(() => q("delete from vendas_checkout"), /permission denied/);
  await como(null);
  await assert.rejects(() => q("select * from vendas_checkout"), /permission denied/);
  await assert.rejects(() => q("select public.cliente_usa_checkout($1)", [cid]), /permission denied/);
  await assert.rejects(() => q("select * from public.checkout_cobertura($1)", [cid]), /permission denied/);
  await q("reset role");
  await assert.rejects(() => q("insert into vendas_checkout(client_id,provider,externo_id,status,valor_centavos) values ($1,'paypal','z','paid',1)", [cid]), /check/);

  console.log("vendas do checkout: ok");
} finally {
  await db.close();
}
