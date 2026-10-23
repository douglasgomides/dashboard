import assert from "node:assert/strict";
import {
  navTabKey, parseContentViewSearch, tabAtiva, navSearch,
  AREAS,
  AVANCADO,
  areasVisiveis,
  navegacaoClinica,
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
  "/plano",
  "/reunioes",
  "/campanhas",
  "/oportunidades",
  "/conteudo",
  "/posts",
  "/top",
  "/audiencia",
  "/conteudo-comercial",
  "/ideias",
  "/marketing",
  "/vendas-kommo",
  "/inteligencia-criativa",
  "/inspiracao",
  "/anuncios",
  "/crm-contatos",
  "/crm-painel",
  "/crm-guia",
  "/atendimento",
  "/links",
  "/duvidas",
  "/jornada",
  "/relatorio",
];
assert.deepEqual(
  [...new Set(AREAS.flatMap((a) => a.tabs.map((t) => t.path)))].sort(),
  esperados.sort(),
);
assert.equal(new Set(esperados).size, esperados.length);
assert.deepEqual(
  areasVisiveis(base).map((a) => a.id),
  ["resumo", "marketing", "comercial", "acoes", "relatorio"],
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
const clinica = navegacaoClinica(areasVisiveis(base), false);
assert.deepEqual(clinica.principais.map(a => a.id), ["resumo", "acoes", "relatorio"]);
assert.equal(clinica.principais[1].visiveis[0].path, "/agentes");
assert.deepEqual(clinica.detalhes.map(a => a.id), ["marketing", "comercial"]);
const apenasCrm = navegacaoClinica(areasVisiveis({ ...base, soCrm: true }), false);
assert.deepEqual(apenasCrm.principais.map(a => a.id), ["comercial"]);
assert.equal(apenasCrm.detalhes.length, 0);
assert.deepEqual(navegacaoClinica(areasVisiveis(base), true).principais, areasVisiveis(base));
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

// Marketing reúne conteúdo e aquisição; Comercial reúne CRM e atendimento.
for (const path of ["/ideias", "/inteligencia-criativa", "/inspiracao", "/conteudo", "/posts", "/top", "/campanhas", "/anuncios", "/links", "/audiencia", "/duvidas"]) assert.equal(areaDoCaminho(path), "marketing", path);
for (const path of ["/crm-painel", "/crm-guia", "/atendimento", "/jornada"]) assert.equal(areaDoCaminho(path), "comercial", path);
for (const papel of ["owner", "viewer", "strategist", "admin"] as const) assert.deepEqual(areasVisiveis({ ...base, papel, isAdmin: papel === "admin" }).map((a) => a.id), ["resumo", "marketing", "comercial", "acoes", "relatorio"]);

const allTabs = AREAS.flatMap((a) => a.tabs);
assert.equal(new Set(allTabs.map(navTabKey)).size, allTabs.length);
assert.equal(AREAS.find((a) => a.id === "marketing")?.tabs[0]?.path, "/marketing");
assert.equal(areaDoCaminho("/vendas-kommo"), "comercial");
assert.equal(AVANCADO.some((t) => t.path === "/vendas-kommo"), false);
for (const papel of ["owner", "viewer", "strategist"] as const) assert.equal(paths({ ...base, papel }).includes("/vendas-kommo"), false);
assert.equal(paths(admin).includes("/vendas-kommo"), true);
for (const papel of ["owner", "viewer"] as const) assert.equal(paths({ ...admin, papel }).includes("/vendas-kommo"), false);
assert.deepEqual(parseContentViewSearch({ visao: "invalida" }), { visao: "roteiros" });
assert.equal(buscarTelas(base, "calendário")[0]?.tab.search?.visao, "semana");
assert.equal(buscarTelas(base, "encontrar ideias")[0]?.tab.search?.visao, "ideias");
for (const visao of ["roteiros", "semana", "ideias"] as const) {
 const tabs = allTabs.filter((t) => t.path === "/ideias");
 assert.equal(tabs.filter((t) => tabAtiva(t, "/ideias", { visao })).length, 1);
 assert.deepEqual(navSearch(tabs.find((t) => t.search?.visao === visao)!, { preset: "7d" }), { preset: "7d", visao });
}
assert.equal(allTabs.filter((t) => tabAtiva(t, "/ideias", {})).length, 1);

assert.equal(paths(base).includes("/crm-contatos"),false);
assert.equal(paths({...base,crmOperacional:true}).includes("/crm-contatos"),true);
assert.equal(buscarTelas({...base,crmOperacional:true},"kanban")[0]?.tab.path,"/crm-contatos");

assert.equal(areasVisiveis({...base,crmOperacional:true}).flatMap(a=>a.visiveis).find(t=>t.path==="/crm-painel")?.label,"Funil comercial · resultados");
assert.equal(areasVisiveis(base).flatMap(a=>a.visiveis).find(t=>t.path==="/crm-painel")?.label,"Funil comercial");

const pilotoSemCrmExterno={...semFontes,crmOperacional:true};
assert.equal(paths(pilotoSemCrmExterno).includes("/crm-contatos"),true,"O Kanban nativo não depende de um CRM externo");
assert.equal(paths(pilotoSemCrmExterno).includes("/crm-painel"),false,"Relatórios importados continuam condicionados à fonte");
assert.equal(paths({...pilotoSemCrmExterno,crmOperacional:false}).includes("/crm-contatos"),false);
assert.equal(buscarTelas(pilotoSemCrmExterno,"kanban")[0]?.tab.path,"/crm-contatos");
