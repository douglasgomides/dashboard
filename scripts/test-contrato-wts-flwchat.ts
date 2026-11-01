// Contrato da API da WTS Chat / FlwChat (Helena, api.wts.chat). Doc: docs/apis/wts-flwchat.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_WTS_TOKEN=... [CONTRATO_FLW_PAINEL=<id do painel>] npx tsx scripts/test-contrato-wts-flwchat.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { duracaoParaSegundos } from "../api/_lib/wts-sync";
import { direcaoDaMensagem, acharOrigemAnuncio } from "../api/_lib/conversas-wts";
import { origemDaDescricao, origemDasTags, tipoDasTags } from "../api/_lib/flwchat-sync";

const BASE = "https://api.wts.chat";
const HOSTS = /^api\.wts\.chat$/;
const pedido = (env: NodeJS.ProcessEnv, caminho: string) =>
  env.CONTRATO_WTS_TOKEN ? { url: `${BASE}${caminho}`, headers: { Authorization: `Bearer ${env.CONTRATO_WTS_TOKEN}`, Accept: "application/json" } } : null;

await rodarContrato({
  api: "wts-flwchat",
  variaveis: ["CONTRATO_WTS_TOKEN", "CONTRATO_FLW_PAINEL (opcional)"],
  endpoints: [
    { nome: "departamentos", hosts: HOSTS, campos: campos(["[].id: string", "[].name: string"]), aoVivo: (env) => pedido(env, "/core/v1/department") },
    // A sessão aponta para userId, não para id: se userId sumir, todo atendente vira "desconhecido".
    { nome: "agentes", hosts: HOSTS, campos: campos(["[].userId: string|null", "[].name: string", "[].email?: string|null", "[].profile?: string|null"]), aoVivo: (env) => pedido(env, "/core/v1/agent") },
    {
      nome: "sessoes",
      hosts: HOSTS,
      campos: campos([
        "items: array",
        "hasMorePages: boolean",
        "items[].id: string",
        "items[].createdAt: string",
        "items[].startAt?: string|null",
        "items[].endAt?: string|null",
        "items[].status: string",
        "items[].departmentId?: string|null",
        "items[].userId?: string|null",
        "items[].contactId?: string|null",
        "items[].timeWait?: string|null",
        "items[].timeService?: string|null",
        "items[].firstResponseAt?: string|null",
      ]),
      avisos: (corpo) => {
        const conhecidos = ["COMPLETED", "IN_PROGRESS", "PENDING", "HIDDEN"];
        const fora = new Set<string>();
        for (const s of (corpo as any)?.items ?? []) if (s?.status && !conhecidos.includes(s.status)) fora.add(String(s.status).slice(0, 20));
        const dur = ((corpo as any)?.items ?? []).filter((s: any) => s?.timeWait && duracaoParaSegundos(s.timeWait) == null).length;
        return [...(fora.size ? [`status novo: ${[...fora].join(", ")}`] : []), ...(dur ? [`${dur} timeWait fora do formato HH:MM:SS`] : [])];
      },
      aoVivo: (env) => pedido(env, "/chat/v1/session?PageSize=5&PageNumber=1&OrderBy=createdat&OrderDirection=DESCENDING"),
    },
    {
      nome: "mensagens",
      hosts: HOSTS,
      campos: campos(["items: array", "items[].id: string", "items[].direction: string", "items[].type?: string", "items[].text?: string|null"]),
      aoVivo: (env, ant) => {
        const id = (ant.sessoes as any)?.items?.[0]?.id;
        if (!env.CONTRATO_WTS_TOKEN) return null;
        return id ? pedido(env, `/chat/v1/session/${encodeURIComponent(id)}/message?PageSize=5&PageNumber=1`) : "sem sessão de exemplo";
      },
    },
    {
      nome: "contato",
      hosts: HOSTS,
      campos: campos(["id: string", "phoneNumber?: string|null", "name?: string|null", "nameWhatsapp?: string|null", "email?: string|null"]),
      aoVivo: (env, ant) => {
        const id = (ant.sessoes as any)?.items?.find((s: any) => s?.contactId)?.contactId;
        if (!env.CONTRATO_WTS_TOKEN) return null;
        return id ? pedido(env, `/core/v1/contact/${encodeURIComponent(id)}`) : "sem contato de exemplo";
      },
    },
    {
      nome: "painel",
      hosts: HOSTS,
      campos: campos(["id: string", "title?: string|null", "steps: array", "steps[].id: string", "steps[].title?: string|null"]),
      aoVivo: (env) => (env.CONTRATO_FLW_PAINEL ? pedido(env, `/crm/v1/panel/${encodeURIComponent(env.CONTRATO_FLW_PAINEL)}?includeDetails=Steps`) : "sem CONTRATO_FLW_PAINEL"),
    },
    {
      nome: "cards",
      hosts: HOSTS,
      campos: campos([
        "items: array",
        "hasMorePages: boolean",
        "items[].id: string",
        "items[].stepId?: string|null",
        "items[].monetaryAmount?: number|null",
        "items[].createdAt?: string|null",
        "items[].updatedAt?: string|null",
        "items[].customFields?: object|null",
        "items[].contactIds?: array|null",
        "items[].archived?: boolean",
      ]),
      aoVivo: (env) => (env.CONTRATO_FLW_PAINEL ? pedido(env, `/crm/v1/panel/card?panelId=${encodeURIComponent(env.CONTRATO_FLW_PAINEL)}&pageSize=5&pageNumber=1`) : "sem CONTRATO_FLW_PAINEL"),
    },
    { nome: "etiquetas", hosts: HOSTS, campos: campos(["items[].id: string", "items[].name: string"]), aoVivo: (env) => pedido(env, "/core/v1/tag?pageSize=5") },
    {
      nome: "contatos_tags",
      hosts: HOSTS,
      campos: campos(["items: array", "hasMorePages: boolean", "items[].id: string", "items[].tagIds?: array|null", "items[].updatedAt?: string|null"]),
      aoVivo: (env) => pedido(env, "/core/v1/contact?IncludeDetails=Tags&orderBy=updatedAt&orderDirection=DESCENDING&pageSize=5&pageNumber=1"),
    },
  ],
  normalizadores: (f: any) => {
    const [fechada, fila] = f.sessoes.items;
    assert.equal(duracaoParaSegundos(fechada.timeWait), 750);
    assert.equal(duracaoParaSegundos(fechada.timeService), 4195);
    assert.equal(duracaoParaSegundos(fila.timeWait), null);
    assert.equal(duracaoParaSegundos("100:00:00"), 360000, "horas acumuladas acima de 24");
    assert.deepEqual(f.mensagens.items.map((m: any) => direcaoDaMensagem(m.direction)), ["entrada", "saida", "entrada"]);
    assert.equal(acharOrigemAnuncio(f.mensagens.items), null, "sem referral na amostra");
    // Formato da doc oficial (helena.readme.io, PublicMessageDetailsDTO.utm = PublicUtmDTO), valores fictícios.
    const comUtm = acharOrigemAnuncio([{ id: "wm-9", direction: "FROM_HUB", details: { utm: {
      sourceId: "ad-ficticio-1", source: "facebook", clid: "clid-ficticio", headline: "Título fictício", referralUrl: "https://exemplo.invalid/anuncio",
    } } }]);
    assert.equal(comUtm?.ad_id, "ad-ficticio-1");
    assert.equal(comUtm?.ctwa_clid, "clid-ficticio", "utm.clid é o ctwa_clid");
    assert.equal(comUtm?.source_url, "https://exemplo.invalid/anuncio", "utm.referralUrl é o link do anúncio");
    assert.equal(comUtm?.headline, "Título fictício");
    assert.equal(origemDaDescricao(f.cards.items[0].description), "Instagram");
    const nomes = new Map<string, string>(f.etiquetas.items.map((t: any) => [t.id, t.name]));
    const tags = f.contatos_tags.items[0].tagIds.map((id: string) => nomes.get(id));
    assert.equal(origemDasTags(tags), "Instagram");
    assert.equal(tipoDasTags(tags), "Paciente");
  },
});
