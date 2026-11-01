// Contrato da API v1 do RD Station CRM. Doc: docs/apis/rdstation.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_RD_TOKEN=... npx tsx scripts/test-contrato-rdstation.ts
// A v1 exige o token na query (?token=): o script nunca imprime a URL.
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { rdOutcome } from "../api/_lib/rdstation-sync";

const BASE = "https://crm.rdstation.com/api/v1";
const HOSTS = /^crm\.rdstation\.com$/;
const pedido = (env: NodeJS.ProcessEnv, caminho: string, q: Record<string, string> = {}) =>
  env.CONTRATO_RD_TOKEN ? { url: `${BASE}/${caminho}?${new URLSearchParams({ token: env.CONTRATO_RD_TOKEN, ...q })}`, headers: { Accept: "application/json" } } : null;

await rodarContrato({
  api: "rdstation",
  variaveis: ["CONTRATO_RD_TOKEN"],
  endpoints: [
    {
      // O código aceita lista na raiz ou { deal_pipelines: [...] }; a amostra é a lista.
      nome: "funis",
      hosts: HOSTS,
      transformar: (c) => (Array.isArray(c) ? c : (c as any)?.deal_pipelines),
      campos: campos(["[].id: string", "[].name: string", "[].deal_stages: array", "[].deal_stages[]._id?: string", "[].deal_stages[].name: string"]),
      aoVivo: (env) => pedido(env, "deal_pipelines"),
    },
    {
      nome: "deals",
      hosts: HOSTS,
      campos: campos([
        "deals: array",
        "has_more: boolean",
        "total?: number",
        "deals[]._id: string",
        "deals[].name?: string|null",
        "deals[].amount_total?: number|null",
        "deals[].win: boolean|null",
        "deals[].hold?: boolean|null",
        // closed_at hoje não é usado (a venda é datada pela entrada): é o campo da correção da data de venda.
        "deals[].closed_at?: string|null",
        "deals[].created_at: string",
        "deals[].updated_at?: string|null",
        "deals[].deal_stage?: object|null",
        "deals[].deal_stage._id?: string",
        "deals[].deal_source?: object|null",
        "deals[].contacts?: array",
      ]),
      avisos: (corpo) => {
        const total = Number((corpo as any)?.total);
        return Number.isFinite(total) && total >= 10_000 ? ["total passou de 10 mil: a listagem da v1 corta nesse ponto"] : [];
      },
      aoVivo: (env) => pedido(env, "deals", { limit: "5", page: "1" }),
    },
  ],
  normalizadores: (f: any) => {
    const [ganho, aberto] = f.deals.deals;
    assert.equal(rdOutcome(ganho.win), "won");
    assert.equal(rdOutcome(aberto.win), "open", "win null = em aberto");
    assert.equal(rdOutcome(false), "lost");
    assert.ok(Number.isFinite(Date.parse(ganho.created_at)), "data com fuso -03:00 legível");
    assert.ok(Number.isFinite(Date.parse(ganho.closed_at)));
  },
});
