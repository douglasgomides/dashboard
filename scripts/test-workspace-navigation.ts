import assert from "node:assert/strict";
import {
  AREAS,
  AVANCADO,
  areasVisiveis,
  avancadoVisivel,
  buscarTelas,
  subcaminho,
  areaDoCaminho,
  type Visibilidade,
} from "../src/lib/nav";

const base: Visibilidade = {
  isAdmin: false,
  soCrm: false,
  papel: "viewer",
  fontes: {
    tem_instagram: true,
    tem_crm: true,
    tem_anuncios: true,
    tem_atendimento: true,
  },
};
const paths = (v: Visibilidade) =>
  areasVisiveis(v).flatMap((a) => a.visiveis.map((t) => t.path));
// Cada tela anterior continua acessível, uma única vez no catálogo.
const esperados = [
  "",
  "/agentes",
  "/proximas-acoes",
  "/campanhas",
  "/oportunidades",
  "/conteudo",
  "/posts",
  "/top",
  "/audiencia",
  "/ideias",
  "/inteligencia-criativa",
  "/inspiracao",
  "/anuncios",
  "/crm-painel",
  "/crm-guia",
  "/atendimento",
  "/links",
  "/duvidas",
  "/jornada",
  "/relatorio",
];
assert.deepEqual(
  AREAS.flatMap((a) => a.tabs.map((t) => t.path)).sort(),
  esperados.sort(),
);
assert.equal(new Set(esperados).size, esperados.length);
assert.deepEqual(
  areasVisiveis(base).map((a) => a.id),
  ["resumo", "acoes", "vendas", "conteudo", "anuncios", "relatorio"],
);
for (const papel of ["owner", "viewer", "strategist"] as const) {
  const v = { ...base, papel };
  assert.equal(paths(v).includes("/jornada"), false);
  assert.equal(avancadoVisivel(v).length, 0);
  assert.equal(buscarTelas(v, "configurar").length, 0);
  assert.equal(buscarTelas(v, "SAP").length, 0);
}
assert.equal(buscarTelas(base, "criar roteiro")[0]?.tab.path, "/ideias");
assert.equal(buscarTelas(base, "calendário")[0]?.tab.path, "/ideias");
assert.equal(buscarTelas(base, "funil")[0]?.tab.path, "/crm-painel");
assert.equal(buscarTelas(base, "agentes")[0]?.tab.path, "/agentes");
assert.equal(buscarTelas(base, "vídeo").length, 0);
assert.equal(buscarTelas({ ...base, isAdmin: true }, "vídeo")[0]?.tab.path, "/inteligencia-criativa");
const semFontes = {
  ...base,
  fontes: {
    tem_instagram: false,
    tem_crm: false,
    tem_anuncios: false,
    tem_atendimento: false,
  },
};
assert.equal(paths(semFontes).includes("/inteligencia-criativa"), false);
assert.equal(buscarTelas(semFontes, "funil").length, 0);
assert.equal(buscarTelas(semFontes, "whatsapp").length, 0);
assert.equal(
  paths({ ...base, semAudiencia: true }).includes("/audiencia"),
  false,
);
assert.deepEqual(paths({ ...base, soCrm: true }), ["/crm-painel", "/crm-guia"]);
const admin = { ...base, isAdmin: true, papel: "admin" as const };
assert.equal(paths(admin).includes("/jornada"), true);
assert.equal(avancadoVisivel(admin).length, AVANCADO.length);
assert.equal(buscarTelas(admin, "configurar")[0]?.tab.path, "/admin/$clientId");
assert.equal(subcaminho("/abc/posts", "abc"), "/posts");
assert.equal(subcaminho("/abcd/posts", "abc"), "/abcd/posts");
for (const a of AREAS)
  for (const tab of a.tabs) assert.equal(areaDoCaminho(tab.path), a.id);
console.log(
  "Navegação: destinos preservados, busca por tarefa, fontes, papéis e limites de clínica verificados.",
);
