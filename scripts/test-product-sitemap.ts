import assert from "node:assert/strict";
import {
  areasVisiveis, navTabKey,
  type Visibilidade,
} from "../src/lib/nav";
import { AREAS_SAP, ITENS, areasSapVisiveis } from "../src/lib/sap-navigation";

for (const papel of ["admin", "owner", "strategist", "viewer"] as const) {
  for (const temFontes of [true, false]) {
    const vis: Visibilidade = {
      isAdmin: papel === "admin",
      papel,
      soCrm: false,
      fontes: {
        tem_instagram: temFontes,
        tem_crm: temFontes,
        tem_anuncios: temFontes,
        tem_atendimento: temFontes,
      },
    };
    const areas = areasVisiveis(vis);
    assert.deepEqual(areas.map((a) => a.label), temFontes || papel === "admin" ? ["Resultados", "Marketing", "Comercial", "Plano de ação", "Relatórios"] : ["Resultados", "Marketing", "Plano de ação", "Relatórios"]);
    const paths = areas.flatMap((a) => a.visiveis.map(navTabKey));
    assert.equal(new Set(paths).size, paths.length, "Cada ferramenta aparece uma única vez no menu");
  }
}
// Toda ferramenta real do SAP precisa ter um caminho no mapa, inclusive os agentes existentes.
const todos = areasSapVisiveis(true).flatMap((g) => g.itens.map((i) => i.sub));
assert.deepEqual([...todos].sort(), ITENS.map((i) => i.sub).sort());
assert.equal(new Set(todos).size, todos.length);
assert.ok(
  areasSapVisiveis(true)
    .find((g) => g.id === "resultado")
    ?.itens.some((i) => i.sub === "/agentes"),
);
const clinica = areasSapVisiveis(false).flatMap((g) =>
  g.itens.map((i) => i.sub),
);
assert.ok(clinica.includes("/agentes"));
assert.ok(clinica.includes("/cronograma"));
assert.equal(clinica.includes("/onboarding"), false);
assert.equal(clinica.includes("/anuncios"), false);
assert.equal(clinica.includes("/sessao"), false);
for (const sub of todos)
  assert.equal(AREAS_SAP.filter((a) => a.subs.includes(sub)).length, 1);
console.log(
  "Mapas Nexo/SAP: todos os destinos preservados, agrupamento único e ferramentas restritas fora da visão da clínica.",
);

assert.equal(
  areasSapVisiveis(false).some((g) => g.id === "equipe"),
  false,
);

assert.equal(areasSapVisiveis(false)[0].itens[0].sub, "/painel");
assert.ok(areasSapVisiveis(false)[0].itens.some(i => i.sub === "/leitura"));
assert.ok(areasSapVisiveis(false)[0].itens.some(i => i.sub === "/metas"));
