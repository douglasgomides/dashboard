import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { folhasDaArvore, montarTabela, PERIODOS, ROTAS_SO_REDIRECIONAM, rotaLegivel, type LinhaResumo } from "../src/lib/uso-das-telas";

// Lê os ids da árvore de rotas direto do texto de src/routeTree.gen.ts (arquivo gerado por npm run routes:generate).
// Não importa o arquivo: ele puxa componentes React.
const gerado = await readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8").catch(() => {
  throw new Error("src/routeTree.gen.ts não existe: rode npm run routes:generate antes deste teste");
});
const inicio = gerado.indexOf("export interface FileRoutesById");
assert.ok(inicio >= 0, "FileRoutesById não encontrado em routeTree.gen.ts");
const bloco = gerado.slice(inicio, gerado.indexOf("\n}", inicio));
const ids = [...bloco.matchAll(/^\s*(?:'([^']+)'|(__root__)):/gm)].map((m) => m[1] ?? m[2]);
assert.ok(ids.includes("__root__") && ids.includes("/login") && ids.includes("/sem-acesso"), "ids da árvore lidos");

// Folhas: 82 telas (81 folhas /_authenticated + /sem-acesso; a Hoje de 03.1.1 é a 82ª). Os 90 arquivos de src/routes incluem layouts e rotas fora do log.
const folhas = folhasDaArvore(ids);
assert.equal(folhas.length, 82);
assert.ok(folhas.includes("/sem-acesso"));
assert.ok(folhas.includes("/_authenticated/$clientId/"));
for (const layout of ["/_authenticated", "/_authenticated/$clientId", "/_authenticated/admin", "/_authenticated/sap", "/login", "__root__"])
  assert.ok(!folhas.includes(layout), `${layout} não é tela`);

// As 21 rotas que só redirecionam (12 de antes e 9 tiradas em 11/11/2026) estão todas entre as folhas.
assert.equal(ROTAS_SO_REDIRECIONAM.size, 21);
for (const id of ROTAS_SO_REDIRECIONAM) assert.ok(folhas.includes(id), `${id} está nas folhas`);

assert.deepEqual([...PERIODOS], [7, 30, 90]);

// Nome legível.
assert.equal(rotaLegivel("/_authenticated/$clientId/pacientes"), "/[clínica]/pacientes");
assert.equal(rotaLegivel("/_authenticated/$clientId/"), "/[clínica]/");
assert.equal(rotaLegivel("/_authenticated/sap/$clientId/painel"), "/sap/[clínica]/painel");
assert.equal(rotaLegivel("/_authenticated/admin/conferencia"), "/admin/conferencia");
assert.equal(rotaLegivel("/_authenticated/"), "/");
assert.equal(rotaLegivel("/sem-acesso"), "/sem-acesso");

// Resumo nulo ou indefinido: uma linha por folha, tudo zero.
for (const vazio of [null, undefined]) {
  const tabela = montarTabela(folhas, vazio);
  assert.equal(tabela.length, 82);
  for (const linha of tabela) {
    assert.equal(linha.aberturas, 0);
    assert.equal(linha.ultima, null);
    assert.equal(linha.foraDaArvore, false);
  }
}
assert.deepEqual(montarTabela([], []), []);

// Mescla na folha certa, marca as 21 que só redirecionam e mantém rota que saiu da árvore.
const linha = (rota: string, aberturas: number, extra: Partial<LinhaResumo> = {}): LinhaResumo => ({
  rota, aberturas, pessoas: Math.min(aberturas, 1), ultima: aberturas ? "2026-11-08T13:00:00Z" : null,
  menu: aberturas, busca: 0, link: 0, direto: 0, redirecionamento: 0, bloqueada: 0, ...extra,
});
const resumo = [
  linha("/_authenticated/$clientId/", 12, { menu: 5, link: 7 }),
  linha("/_authenticated/admin/conferencia", 12),
  linha("/_authenticated/$clientId/pacientes", 3),
  linha("/_authenticated/rota-antiga", 2),
];
const tabela = montarTabela(folhas, resumo);
assert.equal(tabela.length, 83);
const indice = tabela.find((l) => l.rota === "/_authenticated/$clientId/")!;
assert.equal(indice.aberturas, 12);
assert.equal(indice.link, 7);
assert.equal(indice.soRedireciona, false);
assert.equal(indice.foraDaArvore, false);
assert.equal(tabela.filter((l) => l.soRedireciona).length, 21);
for (const l of tabela.filter((x) => x.soRedireciona)) assert.ok(ROTAS_SO_REDIRECIONAM.has(l.rota));
const antiga = tabela.find((l) => l.rota === "/_authenticated/rota-antiga")!;
assert.equal(antiga.foraDaArvore, true);
assert.equal(antiga.soRedireciona, false);
assert.equal(tabela.filter((l) => l.foraDaArvore).length, 1);

// Ordem: aberturas desc; no empate, nome legível em ordem alfabética.
assert.deepEqual(tabela.slice(0, 4).map((l) => [l.rota, l.aberturas]), [
  ["/_authenticated/$clientId/", 12],
  ["/_authenticated/admin/conferencia", 12],
  ["/_authenticated/$clientId/pacientes", 3],
  ["/_authenticated/rota-antiga", 2],
]);
for (let i = 1; i < tabela.length; i++) {
  const [a, b] = [tabela[i - 1], tabela[i]];
  assert.ok(a.aberturas > b.aberturas || (a.aberturas === b.aberturas && rotaLegivel(a.rota) <= rotaLegivel(b.rota)), `ordem em ${i}`);
}

console.log("test-uso-das-telas: ok");
