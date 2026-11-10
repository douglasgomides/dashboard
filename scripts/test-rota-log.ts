import assert from "node:assert/strict";
import {
  ESPERA_ASSENTAR_MS,
  JANELA_DEDUPE_MS,
  SUPABASE_FALSO_DO_E2E,
  VALIDADE_MARCADOR_MS,
  criarDeduplicador,
  decidirPendente,
  deveGravar,
  ehTabelaAusente,
  montarLinha,
  origemDaNavegacao,
  origemDoClique,
  type LinhaRota,
} from "../src/lib/rota-log";

const CID = "11111111-2222-3333-4444-555555555555";
const AGORA = 1_000_000;

// Constantes combinadas no plano.
assert.equal(JANELA_DEDUPE_MS, 2000, "D-07: janela de 2 s");
assert.equal(VALIDADE_MARCADOR_MS, 10000, "marcador de menu/busca vale 10 s");
assert.equal(ESPERA_ASSENTAR_MS, 500, "espera para a tela assentar");
assert.ok(ESPERA_ASSENTAR_MS < JANELA_DEDUPE_MS, "a espera tem que caber dentro da janela do dedupe");

// origemDaNavegacao
// D-10: URL canônica digitada (primeira, sem ação) é direto.
assert.equal(origemDaNavegacao({ acoes: [], primeira: true, marcador: null, agora: AGORA }), "direto");
// Qualquer REPLACE é redirecionamento, sozinho, depois de PUSH, com marcador e na primeira tela.
assert.equal(origemDaNavegacao({ acoes: ["REPLACE"], primeira: true, marcador: null, agora: AGORA }), "redirecionamento", "exceção da D-10: URL não canônica corrigida com replace");
assert.equal(origemDaNavegacao({ acoes: ["REPLACE"], primeira: false, marcador: null, agora: AGORA }), "redirecionamento");
assert.equal(origemDaNavegacao({ acoes: ["PUSH", "REPLACE"], primeira: false, marcador: null, agora: AGORA }), "redirecionamento");
assert.equal(origemDaNavegacao({ acoes: ["PUSH", "REPLACE"], primeira: false, marcador: { origem: "menu", em: AGORA - 100 }, agora: AGORA }), "redirecionamento", "o replace vence o marcador");
// Marcador recente vira a origem do clique.
assert.equal(origemDaNavegacao({ acoes: ["PUSH"], primeira: false, marcador: { origem: "menu", em: AGORA - 500 }, agora: AGORA }), "menu");
assert.equal(origemDaNavegacao({ acoes: ["PUSH"], primeira: false, marcador: { origem: "busca", em: AGORA - 500 }, agora: AGORA }), "busca");
// Marcador vencido ou ausente: link.
assert.equal(origemDaNavegacao({ acoes: ["PUSH"], primeira: false, marcador: { origem: "menu", em: AGORA - 10001 }, agora: AGORA }), "link");
assert.equal(origemDaNavegacao({ acoes: ["PUSH"], primeira: false, marcador: null, agora: AGORA }), "link");
// CD-02: voltar e avançar do navegador são link, mesmo com marcador antigo.
assert.equal(origemDaNavegacao({ acoes: ["BACK"], primeira: false, marcador: null, agora: AGORA }), "link");
assert.equal(origemDaNavegacao({ acoes: ["FORWARD"], primeira: false, marcador: null, agora: AGORA }), "link");
assert.equal(origemDaNavegacao({ acoes: ["GO"], primeira: false, marcador: null, agora: AGORA }), "link");
assert.equal(origemDaNavegacao({ acoes: ["BACK"], primeira: false, marcador: { origem: "menu", em: AGORA - 100 }, agora: AGORA }), "link", "voltar não herda o marcador do menu");
// Sem ação e não é a primeira: link.
assert.equal(origemDaNavegacao({ acoes: [], primeira: false, marcador: null, agora: AGORA }), "link");

// origemDoClique
const clique = {
  button: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  ehLink: true, alvoDoLink: null as string | null, origemDoContainer: "menu" as string | null,
};
assert.equal(origemDoClique(clique), "menu");
assert.equal(origemDoClique({ ...clique, origemDoContainer: "busca" }), "busca");
assert.equal(origemDoClique({ ...clique, alvoDoLink: "" }), "menu", "target vazio navega na mesma aba");
assert.equal(origemDoClique({ ...clique, alvoDoLink: "_self" }), "menu");
assert.equal(origemDoClique({ ...clique, button: 1 }), null, "clique do meio abre em outra aba");
assert.equal(origemDoClique({ ...clique, button: 2 }), null);
assert.equal(origemDoClique({ ...clique, ctrlKey: true }), null);
assert.equal(origemDoClique({ ...clique, metaKey: true }), null);
assert.equal(origemDoClique({ ...clique, altKey: true }), null);
assert.equal(origemDoClique({ ...clique, shiftKey: true }), null);
assert.equal(origemDoClique({ ...clique, alvoDoLink: "_blank" }), null);
assert.equal(origemDoClique({ ...clique, ehLink: false }), null, "clique fora de link");
assert.equal(origemDoClique({ ...clique, origemDoContainer: "outra" }), null, "valor desconhecido no contêiner");
assert.equal(origemDoClique({ ...clique, origemDoContainer: null }), null, "sem contêiner");

// decidirPendente (D-16)
assert.equal(decidirPendente("REPLACE", "/a/audiencia", "/a"), "descartar", "o app trocou a tela por outra com replace");
assert.equal(decidirPendente("REPLACE", "/a/x", "/a/x"), "esperar", "replace só da query string não apaga a tela");
for (const acao of ["PUSH", "BACK", "FORWARD", "GO"] as const) {
  assert.equal(decidirPendente(acao, "/a/x", "/a/y"), "gravar", `${acao} para outro pathname: o usuário saiu de uma tela mostrada`);
  assert.equal(decidirPendente(acao, "/a/x", "/a/x"), "gravar", `${acao} no mesmo pathname`);
}

// criarDeduplicador (D-07)
let relogio = 5000;
const dup = criarDeduplicador(() => relogio);
const linha = (rota: string, client_id: string | null, sessao: string): LinhaRota => ({ rota, client_id, origem: "link", sessao });
assert.equal(dup(linha("/r", CID, "sessao-aaaa")), false, "primeira vez nunca é duplicata");
relogio = 5000 + 1999;
assert.equal(dup(linha("/r", CID, "sessao-aaaa")), true, "1999 ms depois, mesma rota, clínica e sessão");
assert.equal(dup(linha("/r", "99999999-2222-3333-4444-555555555555", "sessao-aaaa")), false, "outra clínica conta");
assert.equal(dup(linha("/r", CID, "sessao-bbbb")), false, "outra sessão conta");
assert.equal(dup(linha("/outra", CID, "sessao-aaaa")), false, "outra rota conta");
relogio = 5000 + 2000;
assert.equal(dup(linha("/r", CID, "sessao-aaaa")), false, "aos 2000 ms já não é duplicata");
relogio = 20000;
assert.equal(dup(linha("/s", null, "sessao-aaaa")), false);
assert.equal(dup(linha("/s", null, "sessao-aaaa")), true, "client_id nulo contra nulo na mesma rota e sessão");
relogio = 30000;
dup(linha("/t", null, "sessao-aaaa"));
assert.equal(dup.tamanho(), 1, "entradas mais velhas que a janela saem do mapa");

// deveGravar (D-04, CD-01)
for (const host of ["dash.doctorcreator.com.br", "nexo.doctorcreator.com.br", "sap.doctorcreator.com.br", "DASH.DOCTORCREATOR.COM.BR"]) {
  assert.equal(deveGravar(host, false, "https://x.supabase.co"), true, host);
}
for (const host of ["", "localhost", "127.0.0.1", "x.vercel.app", "doctorcreator.com.br", "dash.doctorcreator.com.br.evil.com"]) {
  assert.equal(deveGravar(host, false, SUPABASE_FALSO_DO_E2E), false, `sem a chave: ${host || "(vazio)"}`);
}
assert.equal(deveGravar("127.0.0.1", true, SUPABASE_FALSO_DO_E2E), true);
for (const url of ["https://exemplo.supabase.co", "http://localhost:9/", "", undefined]) {
  assert.equal(deveGravar("127.0.0.1", true, url), false, `a chave do e2e não vale com ${String(url)}`);
}

// montarLinha
const base = { origem: "link" as const, sessao: "sessao-aaaa" };
assert.deepEqual(montarLinha({ ...base, routeId: "/_authenticated/$clientId/", params: { clientId: CID } }), { client_id: CID, rota: "/_authenticated/$clientId/", origem: "link", sessao: "sessao-aaaa" });
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/$clientId/", params: { clientId: "nao-existe" } }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/$clientId/", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/$clientId/", params: undefined }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/admin/conferencia", params: {} })?.client_id, null);
assert.ok(montarLinha({ ...base, routeId: "/sem-acesso", params: {} }));
assert.equal(montarLinha({ ...base, routeId: "/login", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "__root__", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/a?x=1", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/a#x", params: {} }), null);
assert.equal(montarLinha({ ...base, routeId: "/_authenticated/" + "a".repeat(200), params: {} }), null);
assert.deepEqual(
  Object.keys(montarLinha({ ...base, routeId: "/_authenticated/$clientId/", params: { clientId: CID, leadId: "x" } })!).sort(),
  ["client_id", "origem", "rota", "sessao"],
  "params extras não entram na linha",
);

// ehTabelaAusente
for (const code of ["42P01", "42883", "PGRST202", "PGRST205"]) assert.equal(ehTabelaAusente({ code }), true, code);
assert.equal(ehTabelaAusente({ status: 404 }), true);
assert.equal(ehTabelaAusente(null), false);
assert.equal(ehTabelaAusente(undefined), false);
for (const status of [401, 403, 500]) assert.equal(ehTabelaAusente({ status }), false, String(status));

console.log("test-rota-log: ok");
