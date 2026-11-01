// Contrato da API v1 da Digisac. Doc: docs/apis/digisac.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_DIGISAC_SUBDOMINIO=<conta> CONTRATO_DIGISAC_TOKEN=... npx tsx scripts/test-contrato-digisac.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { baseUrl, etapaDoContato, funilDoContato, origemDoContato, statusDoAtendimento } from "../api/_lib/digisac-sync";
import { direcaoDigisac, textoDigisac } from "../api/_lib/conversas-digisac";

const HOSTS = /^[a-z0-9-]+\.digisac\.io$/;
function pedido(env: NodeJS.ProcessEnv, caminho: string, query: Record<string, string | number> = {}) {
  if (!env.CONTRATO_DIGISAC_SUBDOMINIO || !env.CONTRATO_DIGISAC_TOKEN) return null;
  let base: string;
  try { base = baseUrl(env.CONTRATO_DIGISAC_SUBDOMINIO); } catch { return "subdomínio Digisac inválido"; }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries({ perPage: 5, page: 1, ...query }).map(([k, v]) => [k, String(v)])));
  return { url: `${base}${caminho}?${qs}`, headers: { Authorization: `Bearer ${env.CONTRATO_DIGISAC_TOKEN}`, Accept: "application/json" } };
}
const PAGINA = ["data: array", "lastPage: number", "currentPage?: number"];

await rodarContrato({
  api: "digisac",
  variaveis: ["CONTRATO_DIGISAC_SUBDOMINIO", "CONTRATO_DIGISAC_TOKEN"],
  endpoints: [
    { nome: "departamentos", hosts: HOSTS, campos: campos([...PAGINA, "data[].id: string", "data[].name: string"]), aoVivo: (env) => pedido(env, "/departments") },
    { nome: "atendentes", hosts: HOSTS, campos: campos([...PAGINA, "data[].id: string", "data[].name: string", "data[].email?: string|null", "data[].branch?: string|null"]), aoVivo: (env) => pedido(env, "/users") },
    {
      nome: "atendimentos",
      hosts: HOSTS,
      campos: campos([
        ...PAGINA,
        "data[].id: string",
        "data[].isOpen: boolean",
        "data[].userId?: string|null",
        "data[].departmentId?: string|null",
        "data[].contactId?: string|null",
        "data[].startedAt?: string|null",
        "data[].endedAt?: string|null",
        "data[].createdAt: string",
        "data[].updatedAt: string",
        "data[].metrics?: object|null",
        "data[].metrics.waitingTime?: number|null",
        "data[].metrics.messagingTime?: number|null",
      ]),
      aoVivo: (env) => pedido(env, "/tickets", { query: JSON.stringify({ order: [["updatedAt", "DESC"]] }) }),
    },
    {
      nome: "contatos",
      hosts: HOSTS,
      campos: campos([
        ...PAGINA,
        "data[].id: string",
        "data[].isGroup?: boolean",
        "data[].hadChat?: boolean",
        "data[].deletedAt?: string|null",
        "data[].name?: string|null",
        "data[].data?: object|null",
        "data[].createdAt: string",
        "data[].updatedAt: string",
        "data[].tags?: array|null",
        "data[].tags[].label: string",
      ]),
      aoVivo: (env) => pedido(env, "/contacts", { include: "tags" }),
    },
    {
      nome: "mensagens",
      hosts: HOSTS,
      campos: campos([...PAGINA, "data[].id: string", "data[].ticketId: string", "data[].timestamp: string", "data[].isFromMe: boolean", "data[].type: string"]),
      avisos: (corpo) => {
        const tipos = new Set<string>();
        for (const m of (corpo as any)?.data ?? []) tipos.add(String(m?.type ?? ""));
        const conhecidos = ["chat", "ticket", "audio", "image", "video", "document", "sticker", "reaction", "call_log", "vcard", "location", "ciphertext"];
        const novos = [...tipos].filter((t) => t && !conhecidos.includes(t));
        return novos.length ? [`tipo de mensagem novo: ${novos.map((t) => t.slice(0, 20)).join(", ")} (pode ser aviso do sistema contado como paciente)`] : [];
      },
      aoVivo: (env, ant) => {
        const tid = (ant.atendimentos as any)?.data?.[0]?.id;
        if (!env.CONTRATO_DIGISAC_TOKEN) return null;
        return tid ? pedido(env, "/messages", { query: JSON.stringify({ where: { ticketId: tid }, order: [["timestamp", "ASC"]] }) }) : "sem atendimento de exemplo";
      },
    },
  ],
  normalizadores: (f: any) => {
    const [fechado, fila] = f.atendimentos.data;
    assert.equal(statusDoAtendimento(fechado), "COMPLETED");
    assert.equal(statusDoAtendimento(fila), "PENDING", "aberto sem atendente = fila");
    const labels = f.contatos.data[0].tags.map((t: any) => t.label);
    assert.equal(funilDoContato(labels).id, "rafaela");
    assert.equal(etapaDoContato(labels).id, "agendado");
    assert.equal(origemDoContato(labels), "Instagram");
    assert.equal(funilDoContato([]).id, "sem-medico");
    const msgs = f.mensagens.data;
    // msgs[0] é o aviso de sistema "ticket" (isFromMe=false): pegadinha conhecida, de propósito sem assert aqui
    // para não travar a correção (ver docs/apis/digisac.md, pegadinhas).
    assert.equal(direcaoDigisac(msgs[1]), "entrada");
    assert.equal(direcaoDigisac(msgs[2]), "saida");
    assert.equal(textoDigisac(msgs[3]), "transcrição de exemplo");
    assert.equal(textoDigisac(msgs[0]), null);
  },
});
