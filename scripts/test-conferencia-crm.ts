import assert from "node:assert/strict";
import { contarNoCrm, divergeDemais, contaVivosNoNexo, type BuscarJson, type ConexaoConferida } from "../api/_lib/conferencia-crm";

const conn = (provider: string, extra: Partial<ConexaoConferida> = {}): ConexaoConferida => ({
  id: "c1", client_id: "cli", provider, subdomain: "exemplo", access_token: "tok-falso", config: {}, ...extra,
});

async function main() {
  // Limite: só alerta acima de 3% E de 30 leads. Os leads do dia entre uma sincronização e outra não alertam.
  assert.equal(divergeDemais(8516, 8596), false, "HOMS: 80 de diferença em 8.596 (0,9%) não alerta");
  assert.equal(divergeDemais(20111, 11444), true, "Lana antes da reconciliação: alerta");
  assert.equal(divergeDemais(854, 856), false);
  assert.equal(divergeDemais(50, 10), true);
  assert.equal(divergeDemais(25, 0), false, "menos de 30 leads nunca alerta");

  // Kommo: pagina até não haver próxima página; conta todos os leads.
  const paginas: string[] = [];
  const kommo: BuscarJson = async (url, headers) => {
    paginas.push(url);
    assert.equal(headers.Authorization, "Bearer tok-falso");
    const u = new URL(url);
    // Funis com uma etapa de Entrada (type 1): os leads dela não vêm na listagem padrão e somam à parte.
    if (u.pathname.endsWith("/pipelines")) return { status: 200, corpo: { _embedded: { pipelines: [{ id: 10, _embedded: { statuses: [{ id: 100, type: 1 }, { id: 101, type: 0 }] } }] } } };
    if (u.searchParams.get("filter[statuses][0][status_id]") === "100") return { status: 200, corpo: { _embedded: { leads: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }, _links: {} } };
    const p = Number(u.searchParams.get("page"));
    if (p < 3) return { status: 200, corpo: { _embedded: { leads: Array(250).fill({}) }, _links: { next: {} } } };
    return { status: 200, corpo: { _embedded: { leads: Array(96).fill({}) }, _links: {} } };
  };
  assert.deepEqual(await contarNoCrm(conn("kommo"), kommo), { total: 600, metodo: "total", aviso: null });
  assert.equal(paginas.length, 5);
  // Kommo sem token próprio usa o token geral do servidor; sem nenhum, não inventa número.
  assert.equal((await contarNoCrm(conn("kommo", { access_token: null }), kommo, { tokenKommoPadrao: "tok-falso" })).total, 600);
  const semToken = await contarNoCrm(conn("kommo", { access_token: null }), kommo);
  assert.equal(semToken.total, null);
  assert.match(semToken.aviso!, /sem token/);
  // Erro da API não vira zero.
  const erro = await contarNoCrm(conn("kommo"), async () => ({ status: 401, corpo: null }));
  assert.equal(erro.total, null);
  assert.match(erro.aviso!, /401/);

  // Clint: soma o totalCount de cada funil lido.
  const clint: BuscarJson = async (url) => ({ status: 200, corpo: { totalCount: url.includes("origin_id=a") ? 169 : 2198 } });
  assert.equal((await contarNoCrm(conn("clint", { config: { origins: ["a", "b"] } }), clint)).total, 2367);

  // FlwChat: soma os cards abertos dos painéis, marcado como "so_abertos" (não alerta).
  const flw: BuscarJson = async () => ({ status: 200, corpo: { totalItems: 123 } });
  assert.deepEqual(await contarNoCrm(conn("flwchat", { config: { panel_ids: ["p1", "p2"] } }), flw), { total: 246, metodo: "so_abertos", aviso: null });

  // RD Station e Digisac.
  assert.equal((await contarNoCrm(conn("rdstation"), async () => ({ status: 200, corpo: { total: 156 } }))).total, 156);
  const dig = await contarNoCrm(conn("digisac"), async () => ({ status: 200, corpo: { total: 3326 } }), { digisac: { url: "https://x.digisac.co/", token: "t" } });
  assert.deepEqual(dig, { total: 3326, metodo: "contatos", aviso: null });

  // Kommo compara com os vivos; os outros com tudo o que o Nexo guardou.
  assert.equal(contaVivosNoNexo("kommo"), true);
  assert.equal(contaVivosNoNexo("clint"), false);
  assert.equal(contaVivosNoNexo("rdstation"), true);
  assert.equal(contaVivosNoNexo("flwchat"), false);
  console.log("test-conferencia-crm: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
