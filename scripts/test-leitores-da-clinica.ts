// Guarda estática: nenhum leitor em api/ conta crm_leads por client_id para uma tela ou um agente.
// Em conta de CRM compartilhada (várias clínicas na mesma conta), client_id traz a conta inteira; a leitura da clínica é
// public.crm_leads_do_cliente(p_client), que aplica o filtro dela. Leituras por conexão, por id de lead ou de sync/escrita
// ficam na lista abaixo, cada uma com o motivo.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

/**
 * Arquivo -> motivo. Só os arquivos que hoje têm leitura por client_id, todos de sync, conferência ou ligação por id;
 * cada entrada precisa continuar sendo usada (a lista não cresce sem motivo).
 */
const PERMITIDOS: Record<string, string> = {
  "api/_lib/conferencia-ao-vivo.ts": "conferência da equipe: dono de cada sessão pelo card, por clínica da conta, para separar conversas",
  "api/_lib/wts-sync.ts": "sync: dono de cada sessão pelo card, por clínica da conta, para separar conversas",
  "api/_lib/conversas-clint.ts": "sync de conversas: liga conversa ao lead, filtrado também pela conexão",
  "api/_lib/conversas-digisac.ts": "sync de conversas: liga conversa ao lead pelos ids externos da conexão",
  "api/_lib/conversas-kommo.ts": "sync de conversas: liga conversa ao lead pelos ids externos da conexão",
  "api/_lib/crm-negocio-resumo.ts": "só a conta própria (ehNegocioProprio), por conexão Clint dela; não é conta compartilhada",
  "api/sync/manual.ts": "sonda manual da equipe: pega um id de lead do Kommo para testar a API",
};

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.ts$/.test(nome)) out.push(p);
  }
  return out;
}

/** A cadeia que começa em `.from("crm_leads")`: até a vírgula, o ponto e vírgula ou o parêntese que fecha fora dela. */
export function cadeiasDeCrmLeads(fonte: string): string[] {
  const cadeias: string[] = [];
  const re = /\.from\(\s*["']crm_leads["']\s*\)/g;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) {
    let prof = 0;
    let i = m.index;
    for (; i < fonte.length; i++) {
      const ch = fonte[i];
      if (ch === "(" || ch === "[" || ch === "{") prof++;
      else if (ch === ")" || ch === "]" || ch === "}") { if (--prof < 0) break; }
      else if (prof === 0 && (ch === "," || ch === ";")) break;
    }
    cadeias.push(fonte.slice(m.index, i));
  }
  return cadeias;
}

/** Leitura (select sem escrita na mesma cadeia) filtrada por client_id. */
export function contaPorClientId(cadeia: string): boolean {
  if (!/\.select\(/.test(cadeia)) return false;
  if (/\.(upsert|update|delete|insert)\(/.test(cadeia)) return false;
  return /\.(eq|in|match)\(\s*["']client_id["']/.test(cadeia) || /\.match\(\s*\{[^}]*client_id/.test(cadeia);
}

// A regra pega o padrão e deixa passar o certo (exemplos inventados).
assert.equal(contaPorClientId(cadeiasDeCrmLeads(`const n = admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("client_id", c);`)[0]), true);
assert.equal(contaPorClientId(cadeiasDeCrmLeads(`await Promise.all([a, admin.from("crm_leads").select("source")\n  .eq("client_id", c).limit(10), b]);`)[0]), true);
assert.equal(contaPorClientId(cadeiasDeCrmLeads(`await s.from("crm_leads").upsert(rows).select("id").eq("client_id", c);`)[0]), false);
assert.equal(contaPorClientId(cadeiasDeCrmLeads(`await s.from("crm_leads").select("id").eq("crm_connection_id", x);`)[0]), false);
assert.deepEqual(cadeiasDeCrmLeads(`x.from("crm_leads").select("a").eq("client_id", f(1, 2)), y`), [`.from("crm_leads").select("a").eq("client_id", f(1, 2))`]);

const achados: string[] = [];
const permitidosUsados = new Set<string>();
for (const dir of ["api"]) {
  for (const arq of arquivos(join(RAIZ, dir))) {
    const rel = relative(RAIZ, arq).split("\\").join("/");
    const fonte = readFileSync(arq, "utf8");
    const ruins = cadeiasDeCrmLeads(fonte).filter(contaPorClientId);
    if (!ruins.length) continue;
    if (PERMITIDOS[rel]) { permitidosUsados.add(rel); continue; }
    for (const c of ruins) achados.push(`${rel}: ${c.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

const sobrando = Object.keys(PERMITIDOS).filter((a) => !permitidosUsados.has(a));
assert.deepEqual(sobrando, [], "entrada da lista sem leitura por client_id: tire da lista");
assert.deepEqual(achados, [], `leitura de crm_leads por client_id fora da lista; use admin.rpc("crm_leads_do_cliente", { p_client }):\n${achados.join("\n")}`);
for (const a of ["api/_lib/copiloto.ts", "api/_lib/agentes.ts"]) {
  assert.match(readFileSync(join(RAIZ, a), "utf8"), /rpc\(\s*["']crm_leads_do_cliente["']/, `${a} lê as contagens pela clínica`);
}
console.log(`leitores da clínica ok (${permitidosUsados.size} arquivos de sync/escrita na lista: ${[...permitidosUsados].sort().join(", ") || "nenhum"})`);
