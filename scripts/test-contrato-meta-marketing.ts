// Contrato da Meta Marketing API (anúncios). Doc: docs/apis/meta-marketing.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_META_ADS_TOKEN=... CONTRATO_META_ADS_CONTA=<id sem act_> npx tsx scripts/test-contrato-meta-marketing.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { diasAteOLimite, janelaSeteDias, leads } from "../api/_lib/meta-ads-graph-sync";
import { META_GRAPH_URL } from "../api/_lib/meta-graph-versao";

const HOSTS = /^graph\.facebook\.com$/;
const conta = (env: NodeJS.ProcessEnv) => (/^\d+$/.test(env.CONTRATO_META_ADS_CONTA ?? "") && env.CONTRATO_META_ADS_TOKEN ? `act_${env.CONTRATO_META_ADS_CONTA}` : null);
const auth = (env: NodeJS.ProcessEnv) => ({ Authorization: `Bearer ${env.CONTRATO_META_ADS_TOKEN}` });
const NUM_TEXTO = "string|number"; // a Meta manda número como texto; o código converte com Number()

await rodarContrato({
  api: "meta-marketing",
  variaveis: ["CONTRATO_META_ADS_TOKEN", "CONTRATO_META_ADS_CONTA"],
  endpoints: [
    {
      nome: "insights",
      hosts: HOSTS,
      cabecalhos: ["facebook-api-version", "x-business-use-case-usage"],
      campos: campos([
        "data[].date_start: string",
        "data[].campaign_id: string",
        "data[].campaign_name: string",
        "data[].objective?: string",
        `data[].spend: ${NUM_TEXTO}`,
        `data[].impressions: ${NUM_TEXTO}`,
        `data[].reach?: ${NUM_TEXTO}`,
        `data[].clicks?: ${NUM_TEXTO}`,
        `data[].unique_clicks?: ${NUM_TEXTO}`,
        `data[].frequency?: ${NUM_TEXTO}`,
        `data[].inline_link_clicks?: ${NUM_TEXTO}`,
        "data[].actions?: array",
        "data[].actions[].action_type: string",
        `data[].actions[].value: ${NUM_TEXTO}`,
        "paging?: object",
      ]),
      // O código soma toda ação cujo nome CONTÉM "messaging_conversation_started". Duas variantes na mesma linha = soma em dobro.
      avisos: (corpo) => {
        let dobradas = 0;
        for (const l of (corpo as any)?.data ?? []) {
          const n = (l?.actions ?? []).filter((a: any) => String(a?.action_type ?? "").includes("messaging_conversation_started")).length;
          if (n > 1) dobradas++;
        }
        return dobradas ? [`${dobradas} linha(s) com mais de uma ação de conversa: a soma conta em dobro`] : [];
      },
      aoVivo: (env) => {
        const c = conta(env);
        if (!c) return null;
        const { desde, ate } = janelaSeteDias();
        const q = new URLSearchParams({ level: "campaign", time_increment: "1", time_range: JSON.stringify({ since: desde, until: ate }), limit: "25", fields: "date_start,campaign_id,campaign_name,objective,spend,impressions,reach,clicks,unique_clicks,frequency,inline_link_clicks,actions" });
        return { url: `${META_GRAPH_URL}/${c}/insights?${q}`, headers: auth(env) };
      },
    },
    {
      nome: "alcance_janela",
      hosts: HOSTS,
      campos: campos(["data[].campaign_id: string", `data[].reach: ${NUM_TEXTO}`, `data[].impressions: ${NUM_TEXTO}`, `data[].frequency: ${NUM_TEXTO}`]),
      aoVivo: (env) => {
        const c = conta(env);
        return c ? { url: `${META_GRAPH_URL}/${c}/insights?level=campaign&date_preset=last_7d&fields=campaign_id,reach,impressions,frequency&limit=25`, headers: auth(env) } : null;
      },
    },
    {
      nome: "conjuntos",
      hosts: HOSTS,
      campos: campos(["data[].campaign_id: string", "data[].optimization_goal?: string", "data[].destination_type?: string"]),
      aoVivo: (env) => {
        const c = conta(env);
        return c ? { url: `${META_GRAPH_URL}/${c}/adsets?fields=campaign_id,optimization_goal,destination_type&limit=25`, headers: auth(env) } : null;
      },
    },
    {
      nome: "limite",
      hosts: HOSTS,
      campos: campos(["spend_cap?: string|number", "amount_spent: string|number"]),
      aoVivo: (env) => {
        const c = conta(env);
        return c ? { url: `${META_GRAPH_URL}/${c}?fields=spend_cap,amount_spent`, headers: auth(env) } : null;
      },
    },
  ],
  normalizadores: (f: any) => {
    const [l1, l2] = f.insights.data;
    // "lead" já é o total da Meta: o pixel não pode somar de novo.
    assert.equal(leads(l1.actions), 2);
    assert.equal(leads(l2.actions), 0, "linha sem actions vale 0");
    assert.equal(leads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }]), 3, "sem lead, vale o pixel");
    // Uma só ação de conversa por linha na amostra (o código casa por "contém").
    assert.equal(l1.actions.filter((a: any) => a.action_type.includes("messaging_conversation_started")).length, 1);
    // Texto numérico tem de virar número.
    for (const k of ["spend", "impressions", "reach", "clicks", "frequency", "inline_link_clicks"]) assert.ok(Number.isFinite(Number(l1[k])), k);
    const j = janelaSeteDias(new Date("2026-10-21T15:00:00Z"));
    assert.deepEqual(j, { desde: "2026-10-14", ate: "2026-10-20" });
    // spend_cap e amount_spent em centavos (texto): 500 reais de folga a 50 por dia = 10 dias.
    assert.equal(diasAteOLimite(f.limite.spend_cap, f.limite.amount_spent, 50), 10);
    assert.equal(diasAteOLimite(undefined, f.limite.amount_spent, 50), null, "conta sem limite");
  },
});
