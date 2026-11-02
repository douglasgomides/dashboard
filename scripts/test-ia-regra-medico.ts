import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { doCliente, temRegraMedico } from "../api/_lib/leitura-cliente";

// A IA do servidor (sugestões, plano da semana, aprendizados, Brand Brain, copiloto, atendente) usa o service role,
// que ignora RLS. Para cliente com regra por médico (crm_filtro_cliente), ler a tabela por client_id traz os
// pacientes dos outros médicos da conta dividida. Essas leituras têm de passar por <tabela>_do_cliente.
const TABELAS = ["conversas_resumos", "conversas_tema", "conversas_origem_anuncio", "conversas", "mensagens", "crm_leads", "crm_lead_eventos", "toques", "pessoas", "wts_sessions"];
const ARQUIVOS = ["agentes-leitura", "agentes", "aprendizado", "plano-semana", "copiloto", "atendente", "crm-negocio-resumo"];
const direta = new RegExp(`from\\(\\s*["'](${TABELAS.join("|")})["']\\s*\\)`, "g");
let conferidas = 0;
for (const nome of ARQUIVOS) {
  const fonte = readFileSync(new URL(`../api/_lib/${nome}.ts`, import.meta.url), "utf8");
  for (const m of fonte.matchAll(direta)) {
    // A instrução inteira (até o próximo ";" ou fim de bloco de Promise.all) da leitura direta.
    const resto = fonte.slice(m.index!, m.index! + 600);
    const instrucao = resto.slice(0, Math.min(...[resto.indexOf(";"), resto.indexOf("),\n")].filter((i) => i >= 0), resto.length));
    const porCliente = /\.eq\(\s*["']client_id["']/.test(instrucao);
    // Leitura de uma conversa/lote já escolhido dentro da regra (conversa_id, id) não amplia o alcance.
    const porItem = /\.(eq|in)\(\s*["'](conversa_id|id)["']/.test(instrucao);
    assert.ok(!porCliente || porItem, `${nome}.ts lê ${m[1]} do cliente inteiro, fora da regra por médico: ${instrucao.split("\n")[0]}`);
    conferidas++;
  }
}
assert.ok(conferidas > 0);
const agentes = readFileSync(new URL("../api/_lib/agentes.ts", import.meta.url), "utf8");
assert.match(agentes, /regraMedico \? Promise\.resolve\(\{ data: \[\] \}\) : admin\.from\("crm_raw_events"\)/, "mensagens cruas do webhook (sem leitura por cliente) ficam de fora com regra");

// O construtor chama a função do cliente com p_client e aceita contagem sem linhas.
const chamadas: unknown[][] = [];
const fake: any = {
  rpc: (...a: unknown[]) => { chamadas.push(a); return { select: () => "ok" }; },
  from: (t: string) => ({ select: (_c: string, o: unknown) => ({ eq: async (k: string, v: string) => { chamadas.push([t, o, k, v]); return { count: v === "com-regra" ? 2 : 0, error: null }; } }) }),
};
assert.equal((doCliente(fake, "conversas_resumos", "cliente") as any).select("resumo"), "ok");
doCliente(fake, "crm_leads", "cliente", { count: "exact", head: true });
assert.deepEqual(chamadas, [["conversas_resumos_do_cliente", { p_client: "cliente" }, undefined], ["crm_leads_do_cliente", { p_client: "cliente" }, { count: "exact", head: true }]]);
assert.equal(await temRegraMedico(fake, "com-regra"), true);
assert.equal(await temRegraMedico(fake, "sem-regra"), false);
assert.deepEqual(chamadas.at(-1), ["crm_filtro_cliente", { count: "exact", head: true }, "client_id", "sem-regra"]);
await assert.rejects(() => temRegraMedico({ from: () => ({ select: () => ({ eq: async () => ({ count: null, error: { message: "x" } }) }) }) } as any, "c"), /regra por médico/);
console.log(`ok ia-regra-medico (${conferidas} leituras diretas conferidas; IA do servidor lê pelas funções do cliente)`);
