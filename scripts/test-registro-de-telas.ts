import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { folhasDaArvore, ROTAS_SO_REDIRECIONAM } from "../src/lib/uso-das-telas";
import {
  REGISTRO_DE_TELAS,
  ROTAS_DE_ACESSO_FORA_DA_ARVORE,
  buscarTelasEquipe,
  ehEquipe,
  indiceDaBusca,
  itemAtualDoMenu,
  itensMenuEquipe,
  linkDaTela,
  ROTULOS_MENU_EQUIPE,
  ORDEM_DAS_AREAS,
  telasPorArea,
  secoesDaClinica,
  secaoDoCaminho,
  type TelaDoRegistro,
} from "../src/lib/registro-de-telas";
import { AREAS, AVANCADO } from "../src/lib/nav";

// Teste do registro único de telas (Phase 3, MENU-01). Confere o registro contra a árvore real do roteador:
// uma linha por folha, contagem 14/61/12 (D-04, mudada pelo João em 11/11/2026), acesso intacto (MENU-07), tiradas com destino (MENU-04), índice da busca
// por papel (D-03, D-09) e a propriedade de que o estrategista só acha telas sem guarda.

// --- Árvore: lida por texto de src/routeTree.gen.ts (não se importa: puxa componentes React) ---
const gerado = await readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8").catch(() => {
  throw new Error("src/routeTree.gen.ts não existe: rode npm run routes:generate antes deste teste");
});
function chavesDa(nome: string): string[] {
  const inicio = gerado.indexOf(`export interface ${nome}`);
  assert.ok(inicio >= 0, `${nome} não encontrado em routeTree.gen.ts (rode npm run routes:generate)`);
  const bloco = gerado.slice(inicio, gerado.indexOf("\n}", inicio));
  return [...bloco.matchAll(/^\s*(?:'([^']+)'|(__root__)):/gm)].map((m) => m[1] ?? m[2]);
}
const ids = chavesDa("FileRoutesById");
const tos = new Set(chavesDa("FileRoutesByTo"));
const idsDaArvore = new Set(ids);

// Folhas: as 81 do log (Phase 2) mais as 4 que o log não registra.
const folhas = [...folhasDaArvore(ids), "/login", "/reset-password", "/conhecer", "/qa/layout"];
for (const extra of ["/login", "/reset-password", "/conhecer", "/qa/layout"]) assert.ok(idsDaArvore.has(extra), `${extra} sumiu da árvore`);
assert.equal(
  folhas.length,
  85,
  `a árvore tem ${folhas.length} folhas, não 85: a contagem do João (D-04) mudou e a classificação volta para ele`,
);

const R = REGISTRO_DE_TELAS;
const chave = (t: TelaDoRegistro) => t.rota + (t.busca ? `?visao=${t.busca.visao}` : "");

// --- Uma linha por folha ---
for (const folha of folhas) {
  const linhas = R.filter((t) => t.rota === folha && !t.busca);
  assert.equal(linhas.length, 1, `a folha ${folha} precisa de exatamente 1 linha sem busca no registro (tem ${linhas.length})`);
}
for (const t of R) assert.ok(folhas.includes(t.rota), `a linha ${chave(t)} aponta para uma rota que não é folha da árvore`);
assert.equal(new Set(R.map(chave)).size, R.length, "rota + busca.visao repetida no registro");

// --- Contagem (D-04) ---
const conta = (s: TelaDoRegistro["situacao"]) => R.filter((t) => t.situacao === s).length;
assert.equal(conta("viva"), 14, "vivas");
assert.equal(conta("escondida"), 61, "escondidas");
assert.equal(conta("tirada"), 12, "tiradas (decisão do João, 11/11/2026: 1 rota de antes + 9 rotas + 2 atalhos)");
assert.equal(R.length, 87, "total do registro");

// --- SAP congelado (MENU-07) ---
const ehSap = (rota: string) => rota.startsWith("/_authenticated/sap/") || rota.startsWith("/_authenticated/$clientId/sap/");
const sap = R.filter((t) => ehSap(t.rota));
assert.equal(sap.length, 30, "linhas do SAP");
for (const t of sap) {
  assert.equal(t.situacao, "escondida", `${t.rota} (SAP) deve ser escondida`);
  assert.equal(t.congelado, true, `${t.rota} (SAP) deve ser congelado`);
  assert.equal(t.somenteAdmin, true, `${t.rota} (SAP) deve ser somenteAdmin`);
}
for (const t of R.filter((x) => x.congelado)) assert.ok(ehSap(t.rota), `${t.rota} congelado fora do SAP`);
for (const t of R.filter((x) => x.rota.startsWith("/_authenticated/admin/"))) assert.equal(t.somenteAdmin, true, `${t.rota} (admin) deve ser somenteAdmin`);

// --- Acesso (MENU-07) ---
const ACESSO = ["/login", "/reset-password", "/conhecer", "/_authenticated/bem-vindo", "/_authenticated/oauth/consent", "/sem-acesso", "/_authenticated/"];
assert.deepEqual(R.filter((t) => t.acesso).map((t) => t.rota).sort(), [...ACESSO].sort(), "rotas de acesso");
for (const t of R.filter((x) => x.acesso)) {
  assert.equal(t.situacao, "viva", `${t.rota} (acesso) deve ser viva`);
  assert.equal(t.destino, undefined, `${t.rota} (acesso) não tem destino`);
}
assert.ok(ROTAS_DE_ACESSO_FORA_DA_ARVORE.includes("/r/:slug"), "/r/:slug fora da árvore");
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
assert.ok(vercel.includes('"/r/:slug"'), "vercel.json perdeu a rewrite /r/:slug");

// --- Só redireciona = ROTAS_SO_REDIRECIONAM da Phase 2 ---
assert.deepEqual(
  R.filter((t) => t.soRedireciona).map((t) => t.rota).sort(),
  [...ROTAS_SO_REDIRECIONAM].sort(),
  "soRedireciona difere de ROTAS_SO_REDIRECIONAM",
);
assert.equal(R.filter((t) => t.soRedireciona && t.situacao === "escondida").length, 10, "escondidas que só redirecionam");

// --- Tiradas com destino (MENU-04: nenhum 404) ---
for (const t of R.filter((x) => x.situacao === "tirada")) {
  assert.ok(t.destino, `${chave(t)} (tirada) sem destino`);
  assert.ok(idsDaArvore.has(t.destino!), `${chave(t)}: destino ${t.destino} não existe na árvore`);
  const alvo = R.find((x) => x.rota === t.destino && !x.busca);
  assert.ok(alvo && alvo.situacao !== "tirada", `${chave(t)}: destino ${t.destino} é tirada`);
}
for (const t of R.filter((x) => x.destino)) assert.equal(t.situacao, "tirada", `${chave(t)} tem destino sem ser tirada`);
const marketing = R.find((t) => t.rota === "/_authenticated/$clientId/marketing")!;
assert.equal(marketing.situacao, "tirada");
assert.equal(marketing.destino, "/_authenticated/$clientId/conteudo", "destino de /marketing (D-05)");
const arquivoMarketing = await readFile(new URL("../src/routes/_authenticated.$clientId.marketing.tsx", import.meta.url), "utf8");
assert.ok(arquivoMarketing.includes('to: "/$clientId/conteudo"'), "o beforeLoad de /marketing não leva mais a /$clientId/conteudo");
const atalhos = R.filter((t) => t.busca);
assert.deepEqual(atalhos.map((t) => [t.rotulo, t.busca!.visao, t.situacao, t.destino]).sort(), [
  ["Planejar a semana", "semana", "tirada", "/_authenticated/$clientId/ideias"],
  ["Revisar roteiros", "roteiros", "tirada", "/_authenticated/$clientId/ideias"],
]);
const ideias = R.find((t) => t.rota === "/_authenticated/$clientId/ideias" && !t.busca)!;
assert.equal(ideias.situacao, "escondida");
assert.equal(ideias.rotulo, "Encontrar ideias");

// --- Sem selo ---
const SEM_SELO = ["", "/pacientes", "/anuncios", "/crm-painel", "/relatorio", "/vendas-kommo"].map((s) => `/_authenticated/$clientId${s || "/"}`);
assert.deepEqual(R.filter((t) => t.semSelo).map((t) => t.rota).sort(), [...SEM_SELO].sort(), "semSelo");

// --- Rótulos fixos ---
const carteira = R.find((t) => t.rota === "/_authenticated/admin/")!;
assert.equal(carteira.rotulo, "Carteira");
assert.equal(carteira.descricao, "Clientes do Nexo");
assert.equal(R.filter((t) => t.soDesenvolvimento).map((t) => t.rota).join(), "/qa/layout");

// --- Linhas com NavTab: somenteAdmin = !!tab.admin (fora de admin/SAP) ---
const tabs = [...AREAS.flatMap((a) => a.tabs).filter((t) => !t.absoluto), ...AVANCADO.filter((t) => !t.absoluto)];
for (const t of R) {
  if (t.rota.startsWith("/_authenticated/admin/") || ehSap(t.rota) || !t.rota.startsWith("/_authenticated/$clientId/")) continue;
  const sufixo = t.rota.slice("/_authenticated/$clientId".length).replace(/^\/$/, "");
  const tab = tabs.find((x) => x.path === sufixo && (t.busca ? x.search?.visao === t.busca.visao : !x.search || x.search.visao === "ideias"));
  if (!tab) continue;
  assert.equal(!!t.somenteAdmin, !!tab.admin, `${chave(t)}: somenteAdmin difere do admin da aba de nav.ts`);
}

// --- Índice da busca (D-09, D-03) ---
const admin = { isAdmin: true };
const estrategista = { isAdmin: false, papel: "strategist" as const };
assert.equal(ehEquipe(admin), true);
assert.equal(ehEquipe(estrategista), true);
assert.equal(ehEquipe({ isAdmin: false, papel: "owner" }), false);
assert.equal(ehEquipe({ isAdmin: false, papel: "viewer" }), false);
assert.equal(ehEquipe({ isAdmin: false, papel: null }), false);

const producao = indiceDaBusca(admin);
const desenvolvimento = indiceDaBusca(admin, { desenvolvimento: true });
const escondidas = (lista: TelaDoRegistro[]) => lista.filter((t) => t.situacao === "escondida").length;
const vivas = (lista: TelaDoRegistro[]) => lista.filter((t) => t.situacao === "viva").length;
assert.equal(vivas(producao), 7, "vivas no índice de produção");
assert.equal(escondidas(producao), 50, "escondidas no índice de produção (D-09, menos as 9 tiradas em 11/11/2026)");
assert.equal(producao.length, 57);
assert.equal(vivas(desenvolvimento), 7, "vivas no índice de desenvolvimento");
assert.equal(escondidas(desenvolvimento), 51, "escondidas no índice de desenvolvimento (D-09)");
assert.equal(desenvolvimento.length, 58);
assert.deepEqual(desenvolvimento.filter((t) => !producao.includes(t)).map((t) => t.rota), ["/qa/layout"]);
for (const t of desenvolvimento) {
  assert.notEqual(t.situacao, "tirada", `${chave(t)} (tirada) no índice`);
  assert.ok(!t.soRedireciona, `${t.rota} (só redireciona) no índice`);
  assert.ok(!t.acesso, `${t.rota} (acesso) no índice`);
}

const doEstrategista = indiceDaBusca(estrategista);
for (const t of doEstrategista) {
  assert.ok(!t.somenteAdmin, `${t.rota} (somenteAdmin) no índice do estrategista`);
  assert.ok(!t.congelado, `${t.rota} (SAP) no índice do estrategista`);
}
const esperadoEstrategista = R.filter(
  (t) => t.situacao !== "tirada" && !t.somenteAdmin && !t.soRedireciona && !t.acesso && !t.soDesenvolvimento,
);
assert.deepEqual(doEstrategista.map(chave), esperadoEstrategista.map(chave), "índice do estrategista");

// --- D-03: tudo o que o estrategista acha ele abre (nem a rota nem um layout acima tem beforeLoad) ---
const pastaRotas = new URL("../src/routes/", import.meta.url);
const arquivos = (await readdir(pastaRotas)).filter((nome) => /\.tsx?$/.test(nome));
const guardas = new Map<string, string>();
for (const nome of arquivos) {
  const texto = await readFile(new URL(nome, pastaRotas), "utf8");
  const id = texto.match(/createFileRoute\(\s*["']([^"']+)["']\s*\)/)?.[1];
  if (id && /\bbeforeLoad\b/.test(texto)) guardas.set(id, nome);
}
for (const id of ["/_authenticated/admin", "/_authenticated/sap"])
  assert.ok(guardas.has(id), `a leitura de src/routes quebrou: ${id} deveria aparecer como guarda (registrarBloqueada)`);
function guardaAcima(rota: string): string | null {
  const partes = rota.split("/").filter(Boolean);
  const candidatos = new Set<string>([rota]);
  for (let i = 1; i <= partes.length; i++) {
    const prefixo = `/${partes.slice(0, i).join("/")}`;
    candidatos.add(prefixo);
    candidatos.add(`${prefixo}/`);
  }
  for (const c of candidatos) {
    if (c === "/_authenticated" || c === "__root__" || !idsDaArvore.has(c)) continue;
    if (!(c === rota || rota.startsWith(c.endsWith("/") ? c : `${c}/`))) continue;
    // Um índice ("/x/") só guarda a si mesmo, não as irmãs.
    if (c.endsWith("/") && c !== rota) continue;
    if (guardas.has(c)) return `${c} (${guardas.get(c)})`;
  }
  return null;
}
assert.ok(guardaAcima("/_authenticated/admin/conferencia"), "sanidade: /admin/conferencia está atrás do guarda do admin");
assert.ok(guardaAcima("/_authenticated/sap/comece"), "sanidade: /sap/comece está atrás do guarda do SAP");
for (const t of doEstrategista) {
  const guarda = guardaAcima(t.rota);
  assert.equal(guarda, null, `${t.rota} está no índice do estrategista mas tem guarda: ${guarda}; marque a linha somenteAdmin`);
}

// --- Busca ---
assert.deepEqual(buscarTelasEquipe(admin, ""), []);
assert.deepEqual(buscarTelasEquipe(admin, "   "), []);
const pacientes = buscarTelasEquipe(admin, "pacientes");
assert.ok(pacientes.length > 0 && pacientes[0].rotulo.startsWith("Pacientes"), `"pacientes" devolveu primeiro ${pacientes[0]?.rotulo}`);
assert.equal(buscarTelasEquipe(admin, "PACIÊNTES")[0]?.rotulo, pacientes[0].rotulo, "normalização de acento e caixa");
const ROTULOS_TIRADOS_1111 = ["Agentes e entregas", "Plano da semana", "Reuniões", "Prioridades da equipe", "Oportunidades de melhoria", "Automações", "Estratégias e campanhas", "Central de Agentes", "Brand Brain", "Revisar roteiros"];
for (const consulta of ["planejar a semana", "encontrar ideias", "visão geral de marketing", ...ROTULOS_TIRADOS_1111]) {
  for (const t of buscarTelasEquipe(admin, consulta, { desenvolvimento: true }))
    assert.notEqual(t.situacao, "tirada", `"${consulta}" devolveu a tirada ${chave(t)}`);
}
assert.equal(buscarTelasEquipe(estrategista, "sap").filter((t) => t.congelado).length, 0, "SAP na busca do estrategista");

// --- Links ---
const CID = "11111111-1111-4111-8111-111111111111";
for (const t of desenvolvimento) {
  const comClinica = linkDaTela(t, CID);
  assert.ok(comClinica, `${t.rota} sem link com clínica`);
  assert.ok(tos.has(comClinica!.to), `${t.rota}: to ${comClinica!.to} não existe em FileRoutesByTo`);
  if (t.rota.includes("$clientId")) {
    assert.deepEqual(comClinica!.params, { clientId: CID }, `${t.rota}: params sem clientId`);
    assert.equal(linkDaTela(t, null), null, `${t.rota}: sem clínica devia devolver null`);
  } else {
    assert.equal(comClinica!.params, undefined);
    assert.ok(linkDaTela(t, null), `${t.rota}: não precisa de clínica`);
  }
}
assert.equal(linkDaTela(R.find((t) => t.rota === "/_authenticated/$clientId/")!, CID)!.to, "/$clientId");
assert.equal(linkDaTela(carteira, null)!.to, "/admin");
assert.equal(linkDaTela(R.find((t) => t.rota === "/_authenticated/sap/")!, null)!.to, "/sap");
assert.deepEqual(linkDaTela(atalhos[0], CID)!.search, atalhos[0].busca);

// --- Menu da equipe (03-02, MENU-02, D-03, D-11) ---
const menuAdmin = itensMenuEquipe(admin);
assert.deepEqual(menuAdmin.map((i) => i.chave), ["carteira", "clinica", "conferencia"], "ordem dos 3 itens do admin");
assert.deepEqual(
  menuAdmin.map((i) => i.rotulo),
  [ROTULOS_MENU_EQUIPE.carteira, ROTULOS_MENU_EQUIPE.clinica, ROTULOS_MENU_EQUIPE.conferencia],
  "rótulos do menu vêm de ROTULOS_MENU_EQUIPE (D-11)",
);
for (const item of menuAdmin) assert.equal(item.rotulo, ROTULOS_MENU_EQUIPE[item.chave], `${item.chave}: rótulo fora da constante`);
assert.deepEqual(menuAdmin.map((i) => i.icone), ["briefcase", "stethoscope", "shield-check"], "ícones do menu");
const [mCarteira, mClinica, mConferencia] = menuAdmin;
assert.equal(mCarteira.rota, "/_authenticated/admin/");
assert.deepEqual(mCarteira.subtelas, [], "Carteira não tem subtelas");
assert.equal(mClinica.rota, "/_authenticated/$clientId/");
assert.deepEqual(
  mClinica.subtelas.map((t) => t.rotulo),
  ["Resultados da clínica", "Relatório do período", "Etapas do CRM", "Configurar este cliente"],
  "subtelas de Clínica (admin)",
);
assert.equal(mConferencia.rota, "/_authenticated/admin/conferencia");
assert.deepEqual(mConferencia.subtelas.map((t) => t.rotulo), ["Conferência de dados", "Integrações"], "subtelas de Conferência");
for (const item of menuAdmin) {
  assert.equal(item.tela.rota, item.rota, `${item.chave}: a linha do item é a da rota`);
  assert.ok(R.includes(item.tela), `${item.chave}: a linha do item precisa ser do registro`);
  for (const sub of item.subtelas) {
    assert.ok(R.includes(sub), `${item.chave}: a subtela ${sub.rota} não é linha do registro`);
    assert.equal(sub.situacao, "viva", `${item.chave}: a subtela ${sub.rota} não é viva`);
  }
}
const rotasDoMenu = new Set(menuAdmin.flatMap((i) => [i.rota, ...i.subtelas.map((t) => t.rota)]));
const vivasSemAcesso = new Set(R.filter((t) => t.situacao === "viva" && !t.acesso).map((t) => t.rota));
assert.equal(vivasSemAcesso.size, 7, "7 vivas que não são acesso");
assert.deepEqual([...rotasDoMenu].sort(), [...vivasSemAcesso].sort(), "o menu cobre exatamente as 7 vivas que não são acesso");

const menuEstrategista = itensMenuEquipe(estrategista);
assert.deepEqual(menuEstrategista.map((i) => i.chave), ["clinica"], "estrategista vê só Clínica (D-03)");
assert.deepEqual(
  menuEstrategista[0].subtelas.map((t) => t.rotulo),
  ["Resultados da clínica", "Relatório do período"],
  "subtelas do estrategista: só as que ele abre",
);
for (const item of menuEstrategista) {
  assert.ok(!item.tela.somenteAdmin, `${item.chave}: item somenteAdmin no menu do estrategista`);
  for (const sub of item.subtelas) assert.ok(!sub.somenteAdmin, `${sub.rota} (somenteAdmin) no menu do estrategista`);
}
assert.deepEqual(itensMenuEquipe({ isAdmin: false, papel: "owner" }), [], "owner não tem menu da equipe");
assert.deepEqual(itensMenuEquipe({ isAdmin: false, papel: "viewer" }), [], "viewer não tem menu da equipe");
assert.deepEqual(itensMenuEquipe({ isAdmin: false, papel: null }), [], "sem papel não tem menu da equipe");

// --- Item atual do menu ---
const atual = (p: string) => itemAtualDoMenu(p);
assert.deepEqual(atual("/admin"), { chave: "carteira", exato: true });
assert.deepEqual(atual("/admin/"), { chave: "carteira", exato: true });
assert.deepEqual(atual("/admin/conferencia"), { chave: "conferencia", exato: true });
assert.deepEqual(atual("/admin/integracoes"), { chave: "conferencia", exato: false });
assert.deepEqual(atual(`/admin/${CID}`), { chave: "clinica", exato: false });
assert.deepEqual(atual(`/${CID}`), { chave: "clinica", exato: true });
assert.deepEqual(atual(`/${CID}/`), { chave: "clinica", exato: true });
assert.deepEqual(atual(`/${CID}/pacientes`), { chave: "clinica", exato: false });
assert.deepEqual(atual(`/${CID}/relatorio`), { chave: "clinica", exato: false });
assert.equal(atual("/admin/brain"), null);
assert.equal(atual("/admin/caixa"), null);
assert.equal(atual(`/sap/${CID}/painel`), null);
assert.equal(atual("/bem-vindo"), null);
assert.equal(atual("/"), null);
assert.equal(atual("/admin/nao-e-uuid-mas-tem-36-caracteres-x"), null, "id de clínica validado por regex");

// --- Ver todas as telas (03-05): grupos por área antiga, na ordem do UI-SPEC ---
assert.deepEqual(
  [...ORDEM_DAS_AREAS],
  ["Resultados", "Marketing", "Comercial", "Plano de ação", "Relatórios", "Administração", "SAP"],
  "ordem das áreas de Ver todas as telas (UI-SPEC)",
);
for (const [nome, perfil] of [["admin", { isAdmin: true }], ["estrategista", { isAdmin: false, papel: "strategist" as const }]] as const) {
  for (const desenvolvimento of [false, true]) {
    const grupos = telasPorArea(perfil, { desenvolvimento });
    const soma = grupos.reduce((n, g) => n + g.telas.length, 0);
    assert.equal(soma, indiceDaBusca(perfil, { desenvolvimento }).length, `${nome} (dev ${desenvolvimento}): soma dos grupos = tamanho do índice`);
    const ordem = grupos.map((g) => ORDEM_DAS_AREAS.indexOf(g.area));
    assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b), `${nome}: áreas na ordem do UI-SPEC`);
    for (const g of grupos) {
      assert.ok(g.telas.length > 0, `${nome}: área ${g.area} sem tela não aparece`);
      for (const t of g.telas) assert.equal(t.area, g.area, `${t.rota} no grupo errado`);
    }
  }
}
assert.equal(telasPorArea({ isAdmin: true }).reduce((n, g) => n + g.telas.length, 0), 57, "Ver todas as telas do admin em produção: 57 (D-09, menos as 9 tiradas em 11/11/2026)");
assert.ok(!telasPorArea({ isAdmin: false, papel: "strategist" }).some((g) => g.area === "SAP"), "estrategista sem grupo SAP");

// Seções da clínica (10/11/2026): mesmas telas da sanfona antiga (telasPorArea só com /$clientId/*), nenhuma a menos.
for (const perfil of [{ isAdmin: true }, { isAdmin: false, papel: "strategist" as const }]) {
  for (const desenvolvimento of [false, true]) {
    const sanfona = telasPorArea(perfil, { desenvolvimento }).flatMap((g) => g.telas).filter((t) => t.rota.startsWith("/_authenticated/$clientId/"));
    const secoes = secoesDaClinica(perfil, { desenvolvimento });
    assert.deepEqual(secoes.flatMap((s) => s.telas), sanfona, "seções da clínica = telas da sanfona antiga");
    for (const s of secoes) {
      assert.equal(s.primeira, s.telas[0], `${s.area}: o link da seção leva à primeira tela`);
      for (const t of s.telas) {
        const sub = t.rota.slice("/_authenticated/$clientId".length).replace(/\/+$/, "");
        const achada = secaoDoCaminho(secoes, `/11111111-1111-4111-8111-111111111111${sub}/`);
        assert.equal(achada?.secao.area, s.area, `${t.rota} cai na seção ${s.area}`);
        assert.equal(achada?.tela, t, `${t.rota} é a aba atual`);
      }
    }
    for (const fora of ["/admin", "/admin/conferencia", "/admin/11111111-1111-4111-8111-111111111111", "/sap/11111111-1111-4111-8111-111111111111"])
      assert.equal(secaoDoCaminho(secoes, fora), null, `${fora} não tem abas`);
  }
}
assert.deepEqual(
  secoesDaClinica({ isAdmin: true }).map((s) => s.area).slice(0, 5),
  ["Resultados", "Marketing", "Comercial", "Relatórios", "Administração"],
  "seções na ordem das áreas (sem Plano de ação desde 11/11/2026)",
);

// --- Tiradas pelo João em 11/11/2026 ("tira isso aí, ninguém usa"): 9 rotas viram só redirecionamento + o atalho Revisar roteiros ---
const tiradas1111 = R.filter((t) => t.tiradaEm);
assert.equal(tiradas1111.length, 10, "linhas com tiradaEm");
assert.equal(tiradas1111.filter((t) => !t.busca).length, 9, "rotas tiradas em 11/11");
assert.deepEqual(tiradas1111.filter((t) => t.busca).map((t) => t.rotulo), ["Revisar roteiros"], "atalho tirado em 11/11");
assert.deepEqual(tiradas1111.map((t) => t.rotulo).sort(), [...ROTULOS_TIRADOS_1111].sort(), "rótulos tirados em 11/11");
const DESTINO_1111: Record<string, string> = {
  "/_authenticated/$clientId/agentes": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/plano": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/reunioes": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/proximas-acoes": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/oportunidades": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/automacoes": "/_authenticated/$clientId/",
  "/_authenticated/$clientId/campanhas": "/_authenticated/$clientId/",
  "/_authenticated/admin/agentes": "/_authenticated/admin/",
  "/_authenticated/admin/brain": "/_authenticated/admin/",
};
for (const t of tiradas1111) {
  assert.equal(t.situacao, "tirada", `${chave(t)}: tiradaEm sem situação tirada`);
  if (t.busca) {
    assert.equal(t.destino, "/_authenticated/$clientId/ideias", "Revisar roteiros abre Encontrar ideias");
    assert.ok(!t.soRedireciona, "o atalho Revisar roteiros não é rota que só redireciona");
    continue;
  }
  assert.equal(t.destino, DESTINO_1111[t.rota], `${t.rota}: destino da tirada de 11/11`);
  assert.equal(t.soRedireciona, true, `${t.rota}: tirada de 11/11 só redireciona`);
  // O arquivo da rota só redireciona: throw redirect com o destino certo e nenhum component.
  const arquivo = t.rota.replace(/^\//, "").replace(/\//g, ".") + ".tsx";
  const texto = await readFile(new URL(arquivo, pastaRotas), "utf8").catch(() => assert.fail(`arquivo da rota ${arquivo} não existe`));
  assert.ok(/throw redirect\(/.test(texto), `${arquivo}: sem throw redirect`);
  assert.ok(!/component:/.test(texto), `${arquivo}: a rota tirada não pode ter component`);
  const to = t.rota.startsWith("/_authenticated/admin/") ? '"/admin"' : '"/$clientId"';
  assert.ok(texto.includes(`to: ${to}`), `${arquivo}: o redirect devia ir para ${to}`);
}
for (const t of tiradas1111) {
  for (const [nome, perfil] of [["admin", admin], ["estrategista", estrategista]] as const) {
    for (const desenvolvimento of [false, true]) {
      const achadas = buscarTelasEquipe(perfil, t.rotulo, { desenvolvimento }).filter((x) => x.tiradaEm);
      assert.equal(achadas.length, 0, `${nome} (dev ${desenvolvimento}) achou a tirada "${t.rotulo}" na busca`);
    }
  }
}

console.log("test-registro-de-telas: ok");
