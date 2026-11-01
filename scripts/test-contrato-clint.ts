// Contrato da API da Clint. Doc: docs/apis/clint.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_CLINT_TOKEN=... npx tsx scripts/test-contrato-clint.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { clintPrice, clintSource, motivosPerdaClint } from "../api/_lib/clint-sync";
import { mensagemClint } from "../api/_lib/conversas-clint";
import { nomesDasTagsClint } from "../api/_lib/clint-tags";

const BASE = "https://api.clint.digital";
const HOSTS = /^api\.clint\.digital$/;
const auth = (env: NodeJS.ProcessEnv) => (env.CONTRATO_CLINT_TOKEN ? { "api-token": env.CONTRATO_CLINT_TOKEN, Accept: "application/json" } : null);

await rodarContrato({
  api: "clint",
  variaveis: ["CONTRATO_CLINT_TOKEN"],
  endpoints: [
    {
      nome: "origins",
      hosts: HOSTS,
      campos: campos(["data: array", "data[].id: string", "data[].name: string", "data[].group?: object|null", "data[].stages[].id: string", "data[].stages[].label: string", "hasNext: boolean"]),
      aoVivo: (env) => { const h = auth(env); return h ? { url: `${BASE}/v1/origins?limit=5&page=1`, headers: h } : null; },
    },
    {
      nome: "deals",
      hosts: HOSTS,
      campos: campos([
        "data: array",
        "data[].id: string",
        "data[].origin_id: string",
        "data[].stage?: string|null",
        "data[].stage_id?: string|null",
        "data[].status: string",
        "data[].value?: number|string|null",
        "data[].created_at: string",
        "data[].updated_at?: string|null",
        // won_at hoje não é usado (a venda é datada pela entrada); é o campo da correção da data de venda.
        "data[].won_at?: string|null",
        "data[].lost_at?: string|null",
        "data[].fields?: object|null",
        "data[].contact?: object|null",
        "data[].contact.id?: string|null",
        "hasNext: boolean",
        "totalCount?: number",
      ]),
      avisos: (corpo) => {
        const fora = new Set<string>();
        for (const d of (corpo as any)?.data ?? []) if (!["OPEN", "WON", "LOST"].includes(String(d?.status ?? "").toUpperCase())) fora.add("status fora de OPEN/WON/LOST (o código conta como aberto)");
        return [...fora];
      },
      aoVivo: (env, ant) => {
        const h = auth(env);
        if (!h) return null;
        const origem = (ant.origins as any)?.data?.[0]?.id;
        return origem ? { url: `${BASE}/v1/deals?origin_id=${encodeURIComponent(origem)}&limit=5&page=1`, headers: h } : "sem funil de exemplo";
      },
    },
    {
      nome: "lost_status",
      hosts: HOSTS,
      campos: campos(["data[].id: string", "data[].name: string"]),
      aoVivo: (env) => { const h = auth(env); return h ? { url: `${BASE}/v1/lost-status?limit=5`, headers: h } : null; },
    },
    {
      nome: "contato",
      hosts: HOSTS,
      // Corpo diferente disto vira "sem tag" por 14 dias (clint-tags.ts): por isso o contrato exige data.tags.
      campos: campos(["data: object", "data.tags: array", "data.tags[].name: string"]),
      aoVivo: (env, ant) => {
        const h = auth(env);
        if (!h) return null;
        const id = (ant.deals as any)?.data?.find((d: any) => d?.contact?.id)?.contact?.id;
        return id ? { url: `${BASE}/v1/contacts/${encodeURIComponent(id)}`, headers: h } : "sem contato de exemplo";
      },
    },
    {
      nome: "canais",
      hosts: HOSTS,
      campos: campos(["data: array", "data[].id: string", "data[].name: string", "data[].type: string", "data[].status?: string", "has_next: boolean"]),
      aoVivo: (env) => { const h = auth(env); return h ? { url: `${BASE}/v2/channel-accounts?limit=5`, headers: h } : null; },
    },
    {
      // Ao vivo exigiria um chat de exemplo (dado de paciente). Fica só offline.
      nome: "mensagens",
      campos: campos(["data[].id: string", "data[].type: string", "data[].created_at: string", "data[].content?: string|null", "data[].content_type?: string", "data[].sent?: boolean", "has_next: boolean"]),
    },
  ],
  normalizadores: (f: any) => {
    const [ganho, aberto] = f.deals.data;
    assert.equal(clintPrice(ganho.value), 1500, "valor em texto vira número");
    assert.equal(clintPrice(aberto.value), 0);
    assert.equal(clintPrice("R$ 10"), null, "texto que não é número não vira preço");
    assert.equal(clintSource(ganho.fields), "Instagram", "parte depois do | fica fora da origem");
    assert.equal(clintSource(aberto.fields), null);
    const motivos = motivosPerdaClint(f.lost_status, "conn");
    assert.deepEqual(motivos.map((m) => m.nome), ["Sem interesse", "Preço"]);
    assert.deepEqual(nomesDasTagsClint(f.contato.data.tags), ["Instagram"], "tag nexo:* é interna");
    const msgs = f.mensagens.data.map(mensagemClint);
    assert.deepEqual(msgs.map((m: any) => m?.direcao), ["entrada", "saida", "sistema"]);
    assert.equal(msgs[1]?.texto, "Mensagem de modelo", "modelo sem content usa o texto formatado");
    assert.equal(msgs[1]?.tipo, "sistema", "envio de campanha não é conversa da equipe");
  },
});
