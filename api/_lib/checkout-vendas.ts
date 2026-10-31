import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { VercelRequest, VercelResponse } from "./http-types.js";

// Vendas do checkout (Hubla primeiro) gravadas em vendas_checkout. Rota: POST /api/sync/manual?checkout=hubla&client_id=<uuid>,
// chamada pelo n8n (máquina a máquina) com Authorization: Bearer <SYNC_SECRET>. Fica em manual.ts porque o plano da
// Vercel aceita no máximo 12 funções.
//
// Corpo aceito:
//   a) o webhook da Hubla, como chega no n8n: { type, event: { invoice, product | products, ... } }, ou o próprio
//      `event`, ou { body: { event } } (nó HTTP do n8n repassando o corpo inteiro);
//   b) a carga do passado, já normalizada: [{ externo_id, status, tipo, metodo, valor_centavos, pago_em, produto,
//      oferta_id, telefone?, parent_externo_id?, reembolsado_em?, moeda?, utm? }] ou { vendas: [...] }.
//
// O que foi assumido do webhook da Hubla (formato tirado do fluxo n8n que já recebe as vendas; o resto, da Hubla v2):
//   - tipo do evento em `type` (raiz) ou `event.type`: "invoice.payment_succeeded", "invoice.refunded",
//     "invoice.chargeback", "invoice.status_updated"... Evento sem `invoice` (assinatura, lead, carrinho) é ignorado.
//   - status: `invoice.status` quando vem (paid, refunded, chargeback, in_protest, unpaid, expired, canceled...);
//     sem ele, o tipo do evento decide (payment_succeeded = paid, refunded = refunded, chargeback = chargeback).
//   - id da fatura em `invoice.id`. Order bump e combo: a fatura filha tem "-offer-" no id e `parentInvoiceId`; ela é
//     gravada com parent_externo_id e não conta como venda à parte (o valor dela soma na pai).
//   - valor em `invoice.amount.subtotalCents` (preferido) ou `invoice.amount.totalCents`, em centavos.
//   - datas em `invoice.paidAt`, `invoice.refundedAt` / `invoice.chargebackAt`. Venda paga sem `paidAt` usa
//     `invoice.updatedAt` ou a hora do recebimento; reembolso sem data usa a hora do recebimento.
//   - comprador em `invoice.payer` {firstName, lastName, document, email, phone}: só o telefone é lido, para virar
//     telefone_chave (DDD + 8 últimos dígitos, igual a public.chave_telefone). Nada do comprador é gravado.
//   - produto em `event.product` {id, name} ou `event.products[0]` {id, name, offers: [{id}]}; oferta em
//     `offers[0].id` ou `invoice.offerId`; tipo em `invoice.type` (sell, renewal, upgrade); método em
//     `invoice.paymentMethod`; UTMs em `invoice.paymentSession.utm` {source, medium, campaign, term, content}.
//   - o header `x-hubla-idempotency` não é necessário: o upsert é por cliente + provedor + id da fatura, então o mesmo
//     evento repetido regrava a mesma linha.
// Nunca loga o corpo: só contagens e o motivo curto.

export const PROVEDORES = ["hubla", "hotmart", "eduzz", "kiwify"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export type VendaNormalizada = {
  externo_id: string;
  parent_externo_id: string | null;
  status: string;
  tipo: string | null;
  metodo: string | null;
  /** null quando o evento não trouxe valor (vale o que já estiver gravado). */
  valor_centavos: number | null;
  moeda: string;
  pago_em: string | null;
  reembolsado_em: string | null;
  produto: string | null;
  oferta_id: string | null;
  utm: Record<string, string> | null;
  telefone_chave: string | null;
  bruto: unknown;
};

export type Normalizacao = { ok: true; vendas: VendaNormalizada[]; ignorado?: string } | { ok: false; motivo: string };

/** Mesma regra de public.chave_telefone: DDD + 8 últimos dígitos, sem o 55 do Brasil. */
export function chaveTelefone(raw: unknown): string | null {
  let n = String(raw ?? "").replace(/\D/g, "");
  if (n.startsWith("55") && n.length >= 12) n = n.slice(2);
  n = n.replace(/^0+/, "");
  return n.length === 10 || n.length === 11 ? n.slice(0, 2) + n.slice(-8) : null;
}

const ESTADOS: Record<string, string> = {
  paid: "paid", approved: "paid", completed: "paid", succeeded: "paid", payment_succeeded: "paid", pago: "paid", aprovado: "paid",
  refunded: "refunded", refund: "refunded", reembolsado: "refunded",
  chargeback: "chargeback", charged_back: "chargeback", chargedback: "chargeback",
  in_protest: "in_protest", protest: "in_protest", dispute: "in_protest", disputed: "in_protest",
};
export function normalizarStatus(s: unknown): string | null {
  const t = String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!t) return null;
  return ESTADOS[t] ?? t.slice(0, 40);
}
function statusDoTipoEvento(tipo: string): string | null {
  const t = tipo.toLowerCase();
  if (/chargeback/.test(t)) return "chargeback";
  if (/refund/.test(t)) return "refunded";
  if (/protest|dispute/.test(t)) return "in_protest";
  if (/payment_succeeded|paid|approved|newsale|sale\.created/.test(t)) return "paid";
  if (/payment_failed|failed/.test(t)) return "failed";
  if (/expired/.test(t)) return "expired";
  if (/cancel/.test(t)) return "canceled";
  return null;
}

// Chaves que carregam dado do comprador (removidas em qualquer nível do bruto). "name" só fica em produto e oferta.
const CHAVE_PESSOAL = /^(payer|user|customer|buyer|client|recipient|owner|affiliate|seller|address|billing_?address|shipping_?address|first_?name|last_?name|full_?name|social_?name|name|email|e_?mail|phone|phone_?number|cell_?phone|mobile|whatsapp|document|document_?number|cpf|cnpj|rg|ip|ip_?address|user_?agent|birth_?date|birthday|zip_?code|zip|cep|postal_?code|street|number|complement|neighborhood|city|state|country|url|checkout_?url|link)$/i;
const PAI_COM_NOME = /^(product|products|offer|offers|item|items|plan)$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DOCUMENTO_OU_TELEFONE = /^\+?[\d\s().\-/]+$/;
const pareceDocumentoOuTelefone = (t: string) => DOCUMENTO_OU_TELEFONE.test(t) && t.replace(/\D/g, "").length >= 10;

/** Cópia do evento sem dado pessoal: tira comprador, nome, e-mail, telefone, documento, endereço e links. */
export function semDadosPessoais(valor: unknown, pai = ""): unknown {
  if (Array.isArray(valor)) return valor.map((v) => semDadosPessoais(v, pai));
  if (valor && typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVE_PESSOAL.test(k) && !(k.toLowerCase() === "name" && PAI_COM_NOME.test(pai))) continue;
      const limpo = semDadosPessoais(v, k);
      if (limpo !== undefined) out[k] = limpo;
    }
    return out;
  }
  if (typeof valor === "string") {
    if (EMAIL.test(valor) || pareceDocumentoOuTelefone(valor.trim())) return undefined;
    return valor.slice(0, 500);
  }
  return valor;
}

const texto = (v: unknown, max = 200): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const data = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const centavos = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
function telefoneDe(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [o.ddi, o.ddd ?? o.areaCode, o.number ?? o.phone].filter((x) => x != null).join("");
  }
  return v;
}
function utmDe(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const t = texto((v as Record<string, unknown>)[k] ?? (v as Record<string, unknown>)[`utm_${k}`]);
    if (t && !EMAIL.test(t)) out[k] = t;
  }
  return Object.keys(out).length ? out : null;
}

const obj = z.record(z.string(), z.unknown());
const faturaHubla = z.looseObject({
  id: z.union([z.string().min(1).max(200), z.number()]),
  status: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  parentInvoiceId: z.union([z.string(), z.number()]).optional().nullable(),
  amount: obj.optional().nullable(),
  payer: obj.optional().nullable(),
  paymentSession: obj.optional().nullable(),
});

function eventoDe(corpo: unknown): { tipo: string; evento: Record<string, unknown> } | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  const c = corpo as Record<string, unknown>;
  const camadas = [c, c.body as Record<string, unknown> | undefined].filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  for (const camada of camadas) {
    const ev = camada.event;
    if (ev && typeof ev === "object" && !Array.isArray(ev)) {
      const e = ev as Record<string, unknown>;
      return { tipo: texto(camada.type) ?? texto(e.type) ?? "", evento: e };
    }
  }
  if (c.invoice) return { tipo: texto(c.type) ?? "", evento: c };
  return null;
}

/** Normaliza um evento de webhook da Hubla numa venda (ou nenhuma, quando o evento não é de fatura). */
export function normalizarWebhookHubla(corpo: unknown, agora = new Date()): Normalizacao {
  const e = eventoDe(corpo);
  if (!e) return { ok: false, motivo: "corpo sem evento da Hubla" };
  if (!e.evento.invoice) return { ok: true, vendas: [], ignorado: "evento sem fatura" };
  const f = faturaHubla.safeParse(e.evento.invoice);
  if (!f.success) return { ok: false, motivo: "fatura sem id" };
  const inv = f.data as z.infer<typeof faturaHubla> & Record<string, unknown>;
  const status = normalizarStatus(inv.status) ?? statusDoTipoEvento(e.tipo);
  if (!status) return { ok: true, vendas: [], ignorado: "evento sem status de fatura" };

  const externo = String(inv.id).slice(0, 200);
  const pai = texto(inv.parentInvoiceId) ?? (externo.includes("-offer-") ? externo.split("-offer-")[0] : null);
  const produtos = Array.isArray(e.evento.products) ? (e.evento.products as unknown[]) : [];
  const produto = (e.evento.product && typeof e.evento.product === "object" ? e.evento.product : produtos[0]) as Record<string, unknown> | undefined;
  const comOfertas = [produto, ...produtos].find((p) => Array.isArray((p as Record<string, unknown> | undefined)?.offers)) as Record<string, unknown> | undefined;
  const ofertas = (comOfertas?.offers ?? []) as Record<string, unknown>[];
  const oferta = (e.evento.offer && typeof e.evento.offer === "object" ? e.evento.offer : ofertas[0]) as Record<string, unknown> | undefined;
  const amount = (inv.amount ?? {}) as Record<string, unknown>;
  const reembolso = status === "refunded" || status === "chargeback";

  return {
    ok: true,
    vendas: [{
      externo_id: externo,
      parent_externo_id: pai && pai !== externo ? pai : null,
      status,
      tipo: texto(inv.type, 40),
      metodo: texto(inv.paymentMethod ?? inv.method, 40),
      valor_centavos: centavos(amount.subtotalCents) ?? centavos(amount.totalCents),
      moeda: (texto(inv.currency ?? amount.currency, 8) ?? "BRL").toUpperCase(),
      pago_em: data(inv.paidAt) ?? (status === "paid" ? data(inv.updatedAt) ?? agora.toISOString() : null),
      reembolsado_em: reembolso ? data(inv.refundedAt ?? inv.chargebackAt ?? inv.updatedAt) ?? agora.toISOString() : null,
      produto: texto(produto?.name),
      oferta_id: texto(oferta?.id ?? inv.offerId),
      utm: utmDe((inv.paymentSession as Record<string, unknown> | null | undefined)?.utm),
      telefone_chave: chaveTelefone(telefoneDe((inv.payer as Record<string, unknown> | null | undefined)?.phone)),
      bruto: semDadosPessoais({ type: e.tipo || null, version: (corpo as Record<string, unknown>).version ?? null, event: e.evento }),
    }],
  };
}

const vendaCarga = z.object({
  externo_id: z.string().trim().min(1).max(200),
  parent_externo_id: z.string().trim().min(1).max(200).nullable().optional(),
  status: z.string().trim().min(1).max(40),
  tipo: z.string().max(40).nullable().optional(),
  metodo: z.string().max(40).nullable().optional(),
  valor_centavos: z.number().int().nonnegative(),
  moeda: z.string().max(8).nullable().optional(),
  pago_em: z.string().nullable().optional(),
  reembolsado_em: z.string().nullable().optional(),
  produto: z.string().max(200).nullable().optional(),
  oferta_id: z.string().max(200).nullable().optional(),
  telefone: z.string().max(40).nullable().optional(),
  utm: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();
export const cargaSchema = z.array(vendaCarga).min(1).max(1000);

/** Normaliza a carga do passado (já no formato da tabela; o telefone vira só a chave). */
export function normalizarCarga(lista: unknown): Normalizacao {
  const p = cargaSchema.safeParse(lista);
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, motivo: `carga inválida${i?.path.length ? ` em ${i.path.join(".")}` : ""}` };
  }
  const vendas: VendaNormalizada[] = [];
  for (const v of p.data) {
    const status = normalizarStatus(v.status)!;
    const pago = v.pago_em == null ? null : data(v.pago_em);
    const reemb = v.reembolsado_em == null ? null : data(v.reembolsado_em);
    if ((v.pago_em && !pago) || (v.reembolsado_em && !reemb)) return { ok: false, motivo: `data inválida na venda ${v.externo_id}` };
    vendas.push({
      externo_id: v.externo_id,
      parent_externo_id: v.parent_externo_id ?? null,
      status,
      tipo: v.tipo ?? null,
      metodo: v.metodo ?? null,
      valor_centavos: v.valor_centavos,
      moeda: (v.moeda ?? "BRL").toUpperCase(),
      pago_em: pago,
      reembolsado_em: reemb,
      produto: v.produto ?? null,
      oferta_id: v.oferta_id ?? null,
      utm: utmDe(v.utm),
      telefone_chave: chaveTelefone(v.telefone),
      bruto: { origem: "carga" },
    });
  }
  return { ok: true, vendas };
}

/** Webhook ou carga, conforme o corpo. */
export function normalizarCorpo(provider: Provedor, corpo: unknown, agora = new Date()): Normalizacao {
  let c = corpo;
  if (typeof c === "string") {
    try { c = JSON.parse(c); } catch { return { ok: false, motivo: "corpo não é JSON" }; }
  }
  if (Array.isArray(c)) return normalizarCarga(c);
  if (c && typeof c === "object" && Array.isArray((c as Record<string, unknown>).vendas)) return normalizarCarga((c as Record<string, unknown>).vendas);
  if (provider !== "hubla") return { ok: false, motivo: "webhook deste provedor ainda não é lido; envie a carga normalizada" };
  return normalizarWebhookHubla(c, agora);
}

const REEMBOLSO = new Set(["refunded", "chargeback"]);

/** Grava as vendas (upsert por cliente + provedor + fatura) e liga à pessoa pelo telefone_chave do mesmo cliente. */
export async function gravarVendas(admin: SupabaseClient, clientId: string, provider: Provedor, vendas: VendaNormalizada[]): Promise<number> {
  // A mesma fatura repetida no lote vira uma linha (a última manda, sem desfazer um reembolso).
  const porId = new Map<string, VendaNormalizada>();
  for (const v of vendas) porId.set(v.externo_id, mesclar(porId.get(v.externo_id), v));
  const lista = [...porId.values()];
  if (!lista.length) return 0;

  const chaves = [...new Set(lista.map((v) => v.telefone_chave).filter((k): k is string => !!k))];
  const pessoa = new Map<string, string>();
  for (let i = 0; i < chaves.length; i += 200) {
    const { data: ps, error } = await admin.from("pessoas").select("id, telefone_chave").eq("client_id", clientId).in("telefone_chave", chaves.slice(i, i + 200));
    if (error) throw new Error("falha ao ler pessoas");
    for (const p of ps ?? []) if (p.telefone_chave && !pessoa.has(p.telefone_chave)) pessoa.set(p.telefone_chave, p.id);
  }

  const antes = new Map<string, Partial<VendaNormalizada>>();
  const ids = lista.map((v) => v.externo_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rs, error } = await admin.from("vendas_checkout")
      .select("externo_id, status, valor_centavos, pago_em, reembolsado_em, produto, oferta_id, telefone_chave")
      .eq("client_id", clientId).eq("provider", provider).in("externo_id", ids.slice(i, i + 200));
    if (error) throw new Error("falha ao ler vendas gravadas");
    for (const r of rs ?? []) antes.set(r.externo_id, r as Partial<VendaNormalizada>);
  }

  const linhas = lista.map((nova) => {
    const v = mesclar(antes.get(nova.externo_id), nova);
    return {
      client_id: clientId, provider, externo_id: v.externo_id, parent_externo_id: v.parent_externo_id, status: v.status,
      tipo: v.tipo, metodo: v.metodo, valor_centavos: v.valor_centavos ?? 0, moeda: v.moeda, pago_em: v.pago_em,
      reembolsado_em: v.reembolsado_em, produto: v.produto, oferta_id: v.oferta_id, utm: v.utm,
      telefone_chave: v.telefone_chave, pessoa_id: v.telefone_chave ? pessoa.get(v.telefone_chave) ?? null : null,
      bruto: v.bruto, recebido_em: new Date().toISOString(),
    };
  });
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await admin.from("vendas_checkout").upsert(linhas.slice(i, i + 500), { onConflict: "client_id,provider,externo_id" });
    if (error) throw new Error(error.code === "23503" ? "cliente não encontrado" : "falha ao gravar vendas");
  }
  return linhas.length;
}

/** O evento novo manda, mas campo que não veio fica como estava e "pago" atrasado não desfaz reembolso. */
export function mesclar(velha: Partial<VendaNormalizada> | undefined, nova: VendaNormalizada): VendaNormalizada {
  if (!velha) return nova;
  const manterReembolso = REEMBOLSO.has(String(velha.status)) && nova.status === "paid";
  return {
    ...nova,
    status: manterReembolso ? String(velha.status) : nova.status,
    // A primeira data gravada fica: evento repetido sem data (que cai na hora do recebimento) não a empurra para frente.
    reembolsado_em: manterReembolso || REEMBOLSO.has(String(velha.status)) ? velha.reembolsado_em ?? nova.reembolsado_em ?? null : nova.reembolsado_em ?? null,
    valor_centavos: nova.valor_centavos ?? velha.valor_centavos ?? null,
    pago_em: velha.pago_em ?? nova.pago_em ?? null,
    produto: nova.produto ?? velha.produto ?? null,
    oferta_id: nova.oferta_id ?? velha.oferta_id ?? null,
    telefone_chave: nova.telefone_chave ?? velha.telefone_chave ?? null,
  };
}

function segredoConfere(token: string, segredo: string): boolean {
  return timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(segredo).digest());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ ok: false, motivo: "use POST" }); return; }
  const SYNC_SECRET = process.env.SYNC_SECRET, url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SYNC_SECRET || !url || !chave) { res.status(500).json({ ok: false, motivo: "servidor sem configuração" }); return; }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !segredoConfere(token, SYNC_SECRET)) { res.status(401).json({ ok: false, motivo: "token inválido" }); return; }

  const provider = z.enum(PROVEDORES).safeParse(req.query.checkout);
  if (!provider.success) { res.status(400).json({ ok: false, motivo: "checkout desconhecido" }); return; }
  const clientId = z.string().uuid().safeParse(req.query.client_id);
  if (!clientId.success) { res.status(400).json({ ok: false, motivo: "client_id inválido" }); return; }

  const n = normalizarCorpo(provider.data, req.body);
  if (!n.ok) { res.status(400).json({ ok: false, motivo: n.motivo }); return; }
  if (!n.vendas.length) { res.status(200).json({ ok: true, gravadas: 0, ignorado: n.ignorado ?? null }); return; }

  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const gravadas = await gravarVendas(admin, clientId.data, provider.data, n.vendas);
    console.info("[checkout] vendas gravadas", { provider: provider.data, gravadas });
    res.status(200).json({ ok: true, gravadas });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "falha ao gravar vendas";
    console.error("[checkout] falha", { provider: provider.data, motivo });
    res.status(motivo === "cliente não encontrado" ? 400 : 500).json({ ok: false, motivo });
  }
}
