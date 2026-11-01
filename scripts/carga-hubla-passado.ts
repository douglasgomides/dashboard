/**
 * Carga do passado da Hubla em vendas_checkout, pelo mesmo endpoint do webhook (POST /api/sync/manual?checkout=hubla).
 * Foi assim que entraram as 342 vendas e os 15 reembolsos do Doctor Creator em 31/10/2026 (bruto.origem =
 * carga_list_sales / carga_list_refunds); este script deixa o procedimento repetível e auditável.
 *
 * Procedimento:
 *   1. Exportar da Hubla (ferramenta MCP da Hubla, só leitura), página por página, para arquivos JSON:
 *        list_sales   { dateStart, dateEnd, pageSize: 50, page: 1..N }  -> { sales: [...], periodTotalCents, ... }
 *        list_refunds { pageSize: 50, page: 1..N }                      -> { refunds: [...] }
 *      Guarde cada resposta como veio (um arquivo por página, ou um array de respostas num arquivo só). As respostas
 *      não trazem dado do comprador; mesmo assim, guarde fora do repositório.
 *   2. Conferir sem gravar (padrão): npx tsx scripts/carga-hubla-passado.ts export/*.json
 *      Mostra quantas vendas e reembolsos vão entrar e o total bruto por mês (horário de São Paulo). Compare com
 *      periodTotalCents da Hubla; a Hubla agrupa por dia em UTC, então a venda entre 21h e 0h do último dia do mês
 *      cai no mês seguinte lá e não aqui.
 *   3. Gravar: NEXO_URL=https://<app> SYNC_SECRET=<segredo> CLIENT_ID=<uuid> \
 *        npx tsx scripts/carga-hubla-passado.ts --enviar [--reembolsos-ate=AAAA-MM-DD] export/*.json
 *      Manda em lotes de até 500. Repetir é seguro: o upsert é por cliente + provedor + id, e evento atrasado não
 *      desfaz reembolso nem apaga venda paga (api/_lib/checkout-vendas.ts, mesclar).
 *
 * Regras (as mesmas do webhook, 20261102130000):
 *   - valor: totalCents, BRUTO (o que o comprador pagou, antes da taxa). Venda com vários itens (order bump) é uma
 *     fatura com um total só.
 *   - status paid e in_protest entram como venda (list_sales só traz esses); tipo sell, renewal ou upgrade é guardado,
 *     e renovação/upgrade não conta como paciente novo.
 *   - reembolso: list_refunds traz o PEDIDO de reembolso (id próprio, valor em REAIS, sem o id da fatura). Só os
 *     aceitos (status accepted) entram, como linha própria com id_tipo = refund_request, data = createdAt (o pedido) e
 *     repasse_em = scheduledFor. Depois que o webhook estiver ligado, passe --reembolsos-ate com a data do primeiro
 *     webhook: daí em diante o reembolso chega pela própria fatura, e a linha solta contaria duas vezes (a tela já
 *     ignora pedido solto depois do primeiro webhook, mas não é bom gravar o que não vale).
 *   - a venda reembolsada antes da carga não aparece em list_sales: fica só o pedido de reembolso.
 * Nunca imprime nem grava o segredo; não lê variável nenhuma sem --enviar.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type Venda = {
  externo_id: string; status: string; tipo?: string | null; metodo?: string | null; valor_centavos: number; moeda?: string | null;
  pago_em?: string | null; reembolsado_em?: string | null; produto?: string | null; oferta_id?: string | null;
  origem: "carga_list_sales" | "carga_list_refunds"; id_tipo: "invoice" | "refund_request"; repasse_em?: string | null;
};

const STATUS_VENDA = new Set(["paid", "in_protest"]);
const texto = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Respostas de list_sales e list_refunds (objetos ou arrays de objetos) -> linhas da carga normalizada. */
export function paraCarga(respostas: unknown[], opcoes: { reembolsosAte?: string } = {}): { vendas: Venda[]; ignoradas: number } {
  const porId = new Map<string, Venda>();
  let ignoradas = 0;
  const ate = opcoes.reembolsosAte ? new Date(`${opcoes.reembolsosAte}T00:00:00-03:00`).getTime() : null;
  const planas = respostas.flatMap((r) => (Array.isArray(r) ? r : [r])) as Record<string, unknown>[];
  for (const r of planas) {
    for (const s of (Array.isArray(r?.sales) ? r.sales : []) as Record<string, unknown>[]) {
      const id = texto(s.id), status = texto(s.status, 40), total = Number(s.totalCents);
      if (!id || !status || !STATUS_VENDA.has(status) || !Number.isInteger(total) || total < 0 || !texto(s.paidAt)) { ignoradas++; continue; }
      const itens = Array.isArray(s.items) ? (s.items as Record<string, unknown>[]) : [];
      porId.set(id, {
        externo_id: id, status, tipo: texto(s.type, 40), metodo: texto(s.paymentMethod, 40), valor_centavos: total,
        moeda: texto(s.currency, 8), pago_em: texto(s.paidAt), produto: texto(itens[0]?.name),
        oferta_id: texto(s.offerId) ?? texto(itens[0]?.offerId), origem: "carga_list_sales", id_tipo: "invoice",
      });
    }
    for (const f of (Array.isArray(r?.refunds) ? r.refunds : []) as Record<string, unknown>[]) {
      const id = texto(f.id), criado = texto(f.createdAt), reais = Number(f.amount);
      if (!id || f.status !== "accepted" || !criado || !Number.isFinite(reais) || reais < 0) { ignoradas++; continue; }
      if (ate != null && new Date(criado).getTime() >= ate) { ignoradas++; continue; }
      porId.set(id, {
        externo_id: id, status: "refunded", valor_centavos: Math.round(reais * 100), moeda: texto(f.currency, 8),
        reembolsado_em: criado, repasse_em: texto(f.scheduledFor), origem: "carga_list_refunds", id_tipo: "refund_request",
      });
    }
  }
  return { vendas: [...porId.values()], ignoradas };
}

/** Total por mês (São Paulo), para conferir com a Hubla antes de gravar. */
export function resumoPorMes(vendas: Venda[]): Record<string, { vendas: number; centavos: number; reembolsos: number; reembolso_centavos: number }> {
  const out: Record<string, { vendas: number; centavos: number; reembolsos: number; reembolso_centavos: number }> = {};
  const mes = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  for (const v of vendas) {
    const k = mes((v.pago_em ?? v.reembolsado_em)!);
    const m = (out[k] ??= { vendas: 0, centavos: 0, reembolsos: 0, reembolso_centavos: 0 });
    if (v.id_tipo === "invoice") { m.vendas++; m.centavos += v.valor_centavos; } else { m.reembolsos++; m.reembolso_centavos += v.valor_centavos; }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const args = process.argv.slice(2);
  const enviar = args.includes("--enviar");
  const reembolsosAte = args.find((a) => a.startsWith("--reembolsos-ate="))?.split("=")[1];
  if (reembolsosAte && !/^\d{4}-\d{2}-\d{2}$/.test(reembolsosAte)) throw new Error("--reembolsos-ate=AAAA-MM-DD");
  const arquivos = args.filter((a) => !a.startsWith("--"));
  if (!arquivos.length) throw new Error("uso: npx tsx scripts/carga-hubla-passado.ts [--enviar] [--reembolsos-ate=AAAA-MM-DD] export/*.json");
  const respostas: unknown[] = [];
  for (const f of arquivos) respostas.push(JSON.parse(await readFile(f, "utf8")));
  const { vendas, ignoradas } = paraCarga(respostas, { reembolsosAte });
  console.log(JSON.stringify({ vendas: vendas.filter((v) => v.id_tipo === "invoice").length, reembolsos: vendas.filter((v) => v.id_tipo === "refund_request").length, ignoradas, por_mes: resumoPorMes(vendas) }, null, 2));
  if (!enviar) { console.log("Só conferência. Para gravar, rode de novo com --enviar."); return; }

  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`falta ${k}`); return v; };
  const base = need("NEXO_URL").replace(/\/$/, ""), segredo = need("SYNC_SECRET"), cliente = need("CLIENT_ID");
  if (!/^[0-9a-f-]{36}$/i.test(cliente)) throw new Error("CLIENT_ID inválido");
  let gravadas = 0;
  for (let i = 0; i < vendas.length; i += 500) {
    const resp = await fetch(`${base}/api/sync/manual?checkout=hubla&client_id=${cliente}`, {
      method: "POST", headers: { authorization: `Bearer ${segredo}`, "content-type": "application/json" },
      body: JSON.stringify({ vendas: vendas.slice(i, i + 500) }),
    });
    const corpo = (await resp.json().catch(() => ({}))) as { ok?: boolean; gravadas?: number; motivo?: string };
    if (!resp.ok || !corpo.ok) throw new Error(`lote ${i / 500 + 1}: HTTP ${resp.status} ${corpo.motivo ?? ""}`.trim());
    gravadas += corpo.gravadas ?? 0;
  }
  console.log(`gravadas: ${gravadas}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
}
