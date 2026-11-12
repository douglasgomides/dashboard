import assert from "node:assert/strict";
import {
  REGISTRO_DE_TELAS,
  SECOES_JUNTADAS,
  abasVisiveis,
  buscarTelasDoMedico,
  buscarTelasEquipe,
  itemAtualDoMedico,
  itensMenuDoMedico,
  juntadaDoCaminho,
  secaoDaTela,
  telaDoCaminho,
  type PerfilEquipe,
} from "../src/lib/registro-de-telas";
import { assinarContagens, chaveDoPeriodo, contagensDe, limparContagens, publicarContagem } from "../src/lib/contagens-das-abas";
import type { Visibilidade } from "../src/lib/nav";

// Teste das telas juntadas do médico (Phase 3.1.1, plano 01, D-01 e D-04): registro, aba pelo caminho da tela antiga e
// visibilidade por fonte. Módulo puro: roda em tsx, sem React.

const CID = "11111111-1111-4111-8111-111111111111";
const C = "/_authenticated/$clientId";
const FONTES = { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true };
const vis = (extra: Partial<Visibilidade> = {}): Visibilidade => ({ isAdmin: false, fontes: FONTES, soCrm: false, papel: "viewer", ...extra });

// --- 1. Rótulos e ordem (D-01, aprovados pelo João em 10/11/2026; mais os 3 grupos da equipe de D-02 com a emenda de 11/11/2026) ---
assert.deepEqual(
  SECOES_JUNTADAS.map((s) => [s.id, s.rotulo, s.icone, s.publico]),
  [
    ["travam", "Onde os pacientes travam", "filter", "medico"],
    ["origem", "De onde vêm os pacientes", "chart-bar", "medico"],
    ["instagram", "Instagram", "brand-instagram", "medico"],
    ["conteudo", "Conteúdo", "bulb", "equipe"],
    ["atendimento", "Atendimento", "message-circle", "equipe"],
    ["configurar-crm", "Configurar CRM", "settings", "equipe"],
  ],
);
const DO_MEDICO = SECOES_JUNTADAS.filter((s) => s.publico === "medico");
const DA_EQUIPE = SECOES_JUNTADAS.filter((s) => s.publico === "equipe");
assert.deepEqual(
  DO_MEDICO.map((s) => s.abas.map((a) => a.rotulo)),
  [
    ["Funil", "Consultas", "Vendas", "Jornada"],
    ["Por origem", "Instagram", "Anúncios", "Links"],
    ["Desempenho", "Destaques", "Posts", "Público"],
  ],
);
assert.deepEqual(
  DA_EQUIPE.map((s) => s.abas.map((a) => a.rotulo)),
  [
    ["Criativa", "Referências", "Dúvidas", "Ideias"],
    ["Qualidade", "Central", "Contatos"],
    ["Guia", "Papel do funil", "Etapas"],
  ],
  "os 3 grupos da equipe, com os rótulos exatos de D-02",
);
assert.deepEqual(
  DA_EQUIPE.flatMap((s) => s.abas.map((a) => a.partes[0].rota.slice(C.length))),
  ["/inteligencia-criativa", "/inspiracao", "/duvidas", "/ideias", "/atendimento", "/central-atendimento", "/crm-contatos", "/crm-guia", "/analisar", "/crm-estrutura"],
  "cada aba da equipe é o caminho da tela antiga",
);
assert.ok(DA_EQUIPE.every((s) => s.abas.every((a) => a.contagem === null && a.partes.length === 1)), "grupos da equipe: sem contagem até o plano 03.1 dela");
const funil = SECOES_JUNTADAS[0].abas[0];
assert.deepEqual(funil.partes.map((p) => [p.rota, p.rotulo]), [[`${C}/pacientes`, "Do contato à venda"], [`${C}/crm-painel`, "No CRM"]]);
assert.deepEqual(
  DO_MEDICO.flatMap((s) => s.abas.map((a) => a.contagem)),
  [null, "consultas no período", "vendas no período", null, "origens com venda no período", "posts no período", "campanhas no período", "links rastreados", "dias com dado", "publicações em destaque", "publicações no período", null],
);
assert.equal(DO_MEDICO.flatMap((s) => s.abas).length, 12);
assert.equal(DA_EQUIPE.flatMap((s) => s.abas).length, 10, "10 abas da equipe");

// --- 2. Toda parte aponta para uma linha do registro que não é tirada nem só redireciona; nenhuma rota em duas abas ---
const vistas = new Set<string>();
for (const secao of SECOES_JUNTADAS) {
  for (const aba of secao.abas) {
    for (const parte of aba.partes) {
      const linhas = REGISTRO_DE_TELAS.filter((t) => t.rota === parte.rota && !t.busca);
      assert.equal(linhas.length, 1, `${parte.rota} deve ter uma linha no registro`);
      assert.notEqual(linhas[0].situacao, "tirada", `${parte.rota} é tirada`);
      assert.ok(!linhas[0].soRedireciona, `${parte.rota} só redireciona`);
      assert.ok(!vistas.has(parte.rota), `${parte.rota} aparece em duas abas`);
      vistas.add(parte.rota);
    }
  }
}
assert.equal(vistas.size, 23, "13 telas antigas do médico (5 + 4 + 4) e 10 da equipe viram partes das 22 abas");
// Nenhuma parte aponta para uma rota tirada em 11/11/2026.
for (const rota of vistas) assert.ok(!REGISTRO_DE_TELAS.some((t) => t.rota === rota && t.tiradaEm && !t.busca), `${rota} foi tirada em 11/11/2026 e é parte de uma seção`);

// --- 3. juntadaDoCaminho: cada parte, com e sem barra final; fora de tela juntada devolve null ---
for (const secao of SECOES_JUNTADAS) {
  for (const aba of secao.abas) {
    for (const parte of aba.partes) {
      const sub = parte.rota.slice(C.length);
      for (const caminho of [`/${CID}${sub}`, `/${CID}${sub}/`]) {
        const achou = juntadaDoCaminho(caminho);
        assert.ok(achou, `${caminho} deve estar numa tela juntada`);
        assert.equal(achou.secao.id, secao.id);
        assert.equal(achou.aba.id, aba.id);
        assert.equal(achou.parte.rota, parte.rota);
      }
    }
  }
}
for (const fora of ["/admin", "/admin/conferencia", `/${CID}`, `/${CID}/`, `/${CID}/plano`, `/${CID}/relatorio`, "/", "/login", `/${CID}/marketing`]) {
  assert.equal(juntadaDoCaminho(fora), null, `${fora} não é tela juntada`);
}

// --- 4. abasVisiveis: fonte, só CRM, sem audiência ---
const [travam, origem, instagram] = SECOES_JUNTADAS;
const ids = (abas: ReturnType<typeof abasVisiveis>) => abas.map((a) => a.id);
assert.deepEqual(ids(abasVisiveis(travam, vis())), ["funil", "consultas", "vendas", "jornada"]);
assert.deepEqual(ids(abasVisiveis(origem, vis())), ["por-origem", "instagram", "anuncios", "links"]);
assert.deepEqual(ids(abasVisiveis(instagram, vis())), ["desempenho", "destaques", "posts", "publico"]);
// Admin e médico veem as mesmas abas: as marcas equipe/admin de nav.ts não valem para as telas do D-01.
assert.deepEqual(abasVisiveis(instagram, vis({ isAdmin: true, papel: "admin" })).map((a) => a.id), ids(abasVisiveis(instagram, vis())));
// Sem Instagram ligado: a seção Instagram fica sem aba nenhuma (Desempenho sai pela fonte da parte) e De onde vêm perde só a aba Instagram.
const semInstagram = vis({ fontes: { ...FONTES, tem_instagram: false } });
assert.deepEqual(abasVisiveis(instagram, semInstagram), [], "sem Instagram a tela juntada Instagram some inteira");
assert.deepEqual(ids(abasVisiveis(origem, semInstagram)), ["por-origem", "anuncios", "links"]);
assert.deepEqual(ids(abasVisiveis(travam, semInstagram)), ["funil", "consultas", "vendas", "jornada"]);
// Sem Audiência (lista CLIENTES_SEM_AUDIENCIA): sai só o Público.
assert.deepEqual(ids(abasVisiveis(instagram, vis({ semAudiencia: true }))), ["desempenho", "destaques", "posts"]);
// Só CRM: ficam só as partes de ROTAS_DO_CRM (No CRM e Por origem).
const soCrm = vis({ soCrm: true });
assert.deepEqual(ids(abasVisiveis(travam, soCrm)), ["funil"]);
assert.deepEqual(abasVisiveis(travam, soCrm)[0].partes.map((p) => p.rotulo), ["No CRM"]);
assert.deepEqual(ids(abasVisiveis(origem, soCrm)), ["por-origem"]);
assert.deepEqual(abasVisiveis(instagram, soCrm), []);
// Fonte de anúncios desligada: sai Anúncios.
assert.deepEqual(ids(abasVisiveis(origem, vis({ fontes: { ...FONTES, tem_anuncios: false } }))), ["por-origem", "instagram", "links"]);
// Sem fontes carregadas (null): nada é tirado por fonte.
assert.deepEqual(ids(abasVisiveis(instagram, vis({ fontes: null }))), ["desempenho", "destaques", "posts", "publico"]);

// Grupos da equipe (03.1.1-08): só a equipe tem a pasta; a parte somenteAdmin (Criativa, Etapas) só para admin; sem filtro de fonte.
const [conteudo, atendimento, configurarCrm] = SECOES_JUNTADAS.slice(3);
const admin = { isAdmin: true, papel: "admin" as const };
const estrategista = { isAdmin: false, papel: "strategist" as const };
const doAdmin = vis({ isAdmin: true, papel: "admin" });
const doEstrategista = vis({ papel: "strategist" });
assert.deepEqual(ids(abasVisiveis(conteudo, doAdmin, admin)), ["criativa", "referencias", "duvidas", "ideias"]);
assert.deepEqual(ids(abasVisiveis(atendimento, doAdmin, admin)), ["qualidade", "central", "contatos"]);
assert.deepEqual(ids(abasVisiveis(configurarCrm, doAdmin, admin)), ["guia", "papel-do-funil", "etapas"]);
assert.deepEqual(ids(abasVisiveis(conteudo, doEstrategista, estrategista)), ["referencias", "duvidas", "ideias"], "o estrategista não tem Criativa (somenteAdmin)");
assert.deepEqual(ids(abasVisiveis(configurarCrm, doEstrategista, estrategista)), ["guia", "papel-do-funil"], "o estrategista não tem Etapas (somenteAdmin)");
assert.deepEqual(ids(abasVisiveis(atendimento, doEstrategista, estrategista)), ["qualidade", "central", "contatos"]);
// Sem perfil, ele sai de vis: o mesmo resultado.
assert.deepEqual(ids(abasVisiveis(conteudo, doEstrategista)), ["referencias", "duvidas", "ideias"]);
// A equipe abre toda tela em qualquer clínica: sem Instagram, sem CRM e só-CRM não tiram abas dos grupos da equipe.
assert.deepEqual(ids(abasVisiveis(conteudo, vis({ isAdmin: true, papel: "admin", fontes: { ...FONTES, tem_instagram: false } }), admin)), ["criativa", "referencias", "duvidas", "ideias"]);
assert.deepEqual(ids(abasVisiveis(atendimento, vis({ isAdmin: true, papel: "admin", soCrm: true }), admin)), ["qualidade", "central", "contatos"]);
// O médico (owner e viewer) não tem pasta de grupo da equipe: abrir /duvidas por link mostra a tela sem a pasta.
for (const papel of ["viewer", "owner"] as const) {
  for (const secao of [conteudo, atendimento, configurarCrm]) assert.deepEqual(abasVisiveis(secao, vis({ papel }), { isAdmin: false, papel }), [], `${papel} sem ${secao.id}`);
}
assert.ok(juntadaDoCaminho(`/${CID}/duvidas`), "o endereço /duvidas é do grupo Conteúdo (a casca decide se mostra a pasta)");
// Nenhuma seção da equipe vira item do menu do médico, nem item atual dele.
assert.equal(itemAtualDoMedico(`/${CID}/atendimento`), null);
assert.equal(itemAtualDoMedico(`/${CID}/crm-guia`), null);
assert.ok(!menu0().some((i) => ["conteudo", "atendimento", "configurar-crm"].includes(i.id)));
function menu0() {
  return itensMenuDoMedico(vis());
}
// Nenhuma parte aponta para linha tirada (cada parte tem linha viva ou escondida) e as abas da equipe têm linha no registro.
for (const secao of DA_EQUIPE)
  for (const aba of secao.abas)
    for (const parte of aba.partes)
      assert.ok(REGISTRO_DE_TELAS.some((t) => t.rota === parte.rota && !t.busca && t.situacao !== "tirada"), `${parte.rota}: sem linha que abre`);

// --- 5. telaDoCaminho ---
assert.equal(telaDoCaminho(`/${CID}/top`)?.rotulo, REGISTRO_DE_TELAS.find((t) => t.rota === `${C}/top`)?.rotulo);
assert.equal(telaDoCaminho(`/${CID}/top/`)?.rota, `${C}/top`);
assert.equal(telaDoCaminho(`/${CID}`)?.rota, `${C}/`);
assert.equal(telaDoCaminho("/admin"), null);
assert.equal(telaDoCaminho(`/${CID}/nao-existe`), null);

// --- 6. D-03: a busca da equipe ainda acha a aba pelo nome antigo ---
assert.equal(buscarTelasEquipe(admin, "Funil comercial")[0]?.rota, `${C}/crm-painel`);
assert.equal(buscarTelasEquipe(admin, "funil")[0]?.rota, `${C}/crm-painel`, "o nome antigo continua em primeiro, mesmo com a aba Funil casando as 2 partes");
assert.equal(buscarTelasEquipe(admin, "Dúvidas do público")[0]?.rota, `${C}/duvidas`);
// Conteúdo, Atendimento e Configurar CRM: a busca casa também o rótulo da seção e o da aba onde a tela mora hoje (03.1.1-08, D-03).
const rotasDe = (q: string, perfil: PerfilEquipe = admin) => buscarTelasEquipe(perfil, q).map((t) => t.rota);
for (const rota of ["atendimento", "central-atendimento", "crm-contatos"]) assert.ok(rotasDe("atendimento").includes(`${C}/${rota}`), `"atendimento" acha /${rota}`);
assert.ok(rotasDe("travam").includes(`${C}/crm-painel`) && rotasDe("travam").includes(`${C}/jornada`), "travam acha as abas de Onde os pacientes travam");
assert.ok(rotasDe("configurar crm").includes(`${C}/crm-estrutura`) && rotasDe("configurar crm").includes(`${C}/analisar`), "Configurar CRM acha Etapas e Papel do funil");
assert.ok(!rotasDe("configurar crm", estrategista).includes(`${C}/crm-estrutura`), "o estrategista não acha Etapas (índice dele)");
assert.ok(!rotasDe("criativa", estrategista).includes(`${C}/inteligencia-criativa`), "o estrategista não acha a aba Criativa");
assert.ok(rotasDe("criativa").includes(`${C}/inteligencia-criativa`), "o admin acha a aba Criativa");
assert.equal(buscarTelasEquipe(admin, "encontrar ideias")[0]?.rota, `${C}/ideias`);
assert.equal(secaoDaTela(buscarTelasEquipe(admin, "encontrar ideias")[0])?.secao.id, "conteudo", "Encontrar ideias mora em Conteúdo");
// secaoDaTela: seção e aba onde a tela mora hoje; null para quem não é aba de tela juntada.
const lugarDe = (rota: string) => {
  const t = REGISTRO_DE_TELAS.find((x) => x.rota === rota && !x.busca)!;
  const l = secaoDaTela(t);
  return l ? `${l.secao.rotulo} › ${l.aba.rotulo}` : null;
};
assert.equal(lugarDe(`${C}/crm-painel`), "Onde os pacientes travam › Funil");
assert.equal(lugarDe(`${C}/crm-contatos`), "Atendimento › Contatos");
assert.equal(lugarDe(`${C}/ideias`), "Conteúdo › Ideias");
assert.equal(lugarDe(`${C}/crm-estrutura`), "Configurar CRM › Etapas");
assert.equal(lugarDe(`${C}/`), null);
assert.equal(lugarDe(`${C}/hoje`), null);
assert.equal(lugarDe("/_authenticated/admin/integracoes"), null);

// --- 7. Contagem das abas (D-07): guarda em memória, publicada pela própria aba, sem rede ---
limparContagens();
const k1 = chaveDoPeriodo(CID, "2026-10-01", "2026-10-31");
assert.equal(k1, chaveDoPeriodo(CID, "2026-10-01", "2026-10-31"), "mesma chave para os mesmos 3 valores");
assert.notEqual(k1, chaveDoPeriodo(CID, "2026-10-01", "2026-10-30"), "muda o fim");
assert.notEqual(k1, chaveDoPeriodo(CID, "2026-09-30", "2026-10-31"), "muda o início");
assert.notEqual(k1, chaveDoPeriodo("22222222-2222-4222-8222-222222222222", "2026-10-01", "2026-10-31"), "muda a clínica");
const POSTS = `${C}/posts`;
assert.equal(contagensDe(k1).get(POSTS), undefined, "nada publicado ainda");
publicarContagem(k1, POSTS, 24);
assert.equal(contagensDe(k1).get(POSTS), 24);
assert.equal(contagensDe(chaveDoPeriodo(CID, "2026-10-01", "2026-10-30")).get(POSTS), undefined, "outra chave não vê o número");
publicarContagem(k1, `${C}/top`, null);
assert.equal(contagensDe(k1).has(`${C}/top`), true, "null é guardado: a aba abriu e não tem número");
assert.equal(contagensDe(k1).get(`${C}/top`), null);
publicarContagem(k1, `${C}/vendas`, undefined);
assert.equal(contagensDe(k1).has(`${C}/vendas`), false, "undefined (ainda carregando) não grava nada: a aba não vira \"—\"");
// assinarContagens avisa quando o valor muda, não avisa quando é igual, e o retorno desassina.
let avisos = 0;
const parar = assinarContagens(() => {
  avisos++;
});
publicarContagem(k1, POSTS, 25);
assert.equal(avisos, 1, "valor novo avisa");
publicarContagem(k1, POSTS, 25);
assert.equal(avisos, 1, "valor igual não avisa");
publicarContagem(k1, `${C}/vendas`, undefined);
assert.equal(avisos, 1, "undefined não avisa");
publicarContagem(k1, `${C}/consultas`, 0);
assert.equal(avisos, 2, "zero medido é valor e avisa");
parar();
publicarContagem(k1, POSTS, 26);
assert.equal(avisos, 2, "depois de desassinar não avisa mais");
// O mesmo mapa lido duas vezes entre mudanças é o mesmo objeto (useSyncExternalStore pede snapshot estável).
assert.equal(contagensDe(k1), contagensDe(k1), "snapshot estável entre mudanças");
const antes = contagensDe(k1);
publicarContagem(k1, POSTS, 27);
assert.notEqual(contagensDe(k1), antes, "snapshot novo depois de uma mudança");
limparContagens();
assert.equal(contagensDe(k1).size, 0, "limparContagens zera tudo");

// --- 8. Menu do médico (03.1.1-07, D-01 e D-06): 6 itens, destino, só-CRM, sem Instagram, sem audiência, item atual ---
const menu = (v: Visibilidade) => itensMenuDoMedico(v);
assert.deepEqual(
  menu(vis()).map((i) => [i.id, i.rotulo, i.curto]),
  [
    ["hoje", "O que fazer hoje", "Hoje"],
    ["resultados", "Resultados da clínica", "Resultados"],
    ["travam", "Onde os pacientes travam", "Onde travam"],
    ["origem", "De onde vêm os pacientes", "De onde vêm"],
    ["instagram", "Instagram", "Instagram"],
    ["relatorio", "Relatório do período", "Relatório"],
  ],
);
assert.deepEqual(
  menu(vis()).map((i) => [i.icone, i.tela.rota]),
  [
    ["checklist", `${C}/hoje`],
    ["layout-dashboard", `${C}/`],
    ["filter", `${C}/pacientes`],
    ["chart-bar", `${C}/vendas-kommo`],
    ["brand-instagram", `${C}/conteudo`],
    ["file-text", `${C}/relatorio`],
  ],
);
// Médico e admin veem os mesmos 6 itens.
assert.deepEqual(menu(vis({ isAdmin: true, papel: "admin" })).map((i) => i.id), menu(vis()).map((i) => i.id));
// Só CRM: Hoje, Onde os pacientes travam (só No CRM) e De onde vêm os pacientes (só Por origem).
assert.deepEqual(menu(soCrm).map((i) => i.id), ["hoje", "travam", "origem"]);
assert.deepEqual(menu(soCrm).map((i) => i.tela.rota), [`${C}/hoje`, `${C}/crm-painel`, `${C}/vendas-kommo`]);
// Sem Instagram ligado: o item Instagram some (a seção fica sem aba visível); o resto fica.
assert.deepEqual(menu(semInstagram).map((i) => i.id), ["hoje", "resultados", "travam", "origem", "relatorio"]);
// Sem audiência: o item Instagram fica, com destino em /conteudo.
const semAud = menu(vis({ semAudiencia: true }));
assert.ok(semAud.some((i) => i.id === "instagram"));
assert.equal(semAud.find((i) => i.id === "instagram")?.tela.rota, `${C}/conteudo`);
// Item atual: tela juntada pela pasta, tela única pelo caminho exato, o resto null.
assert.equal(itemAtualDoMedico(`/${CID}/top`), "instagram");
assert.equal(itemAtualDoMedico(`/${CID}/crm-painel`), "travam");
assert.equal(itemAtualDoMedico(`/${CID}/vendas-kommo/`), "origem");
assert.equal(itemAtualDoMedico(`/${CID}`), "resultados");
assert.equal(itemAtualDoMedico(`/${CID}/hoje`), "hoje");
assert.equal(itemAtualDoMedico(`/${CID}/relatorio`), "relatorio");
assert.equal(itemAtualDoMedico(`/${CID}/duvidas`), null);
assert.equal(itemAtualDoMedico("/admin"), null);

// --- 9. Busca do médico (MEDV-03, D-03): só as telas dos 6 itens, aba pelo nome antigo ---
const busca = (v: Visibilidade, q: string) => buscarTelasDoMedico(v, q).map((t) => t.rota);
assert.equal(busca(vis(), "funil comercial")[0], `${C}/crm-painel`, "funil comercial leva primeiro à parte No CRM");
assert.equal(busca(vis(), "publicações")[0], `${C}/posts`);
assert.deepEqual(
  [...busca(vis(), "travam")].sort(),
  [`${C}/pacientes`, `${C}/crm-painel`, `${C}/consultas`, `${C}/vendas`, `${C}/jornada`].sort(),
  "travam devolve as partes de Onde os pacientes travam",
);
assert.deepEqual(busca(vis(), "dúvidas do público"), [], "a tela existe, mas não é das 6");
assert.deepEqual(busca(vis(), "planejar a semana"), [], "Planejar a semana não é das 6");
// Consulta vazia: todos os destinos da clínica na ordem do menu (as 3 telas únicas e as 13 partes das telas juntadas).
assert.equal(busca(vis(), "   ").length, 3 + 13);
assert.equal(busca(vis(), "")[0], `${C}/hoje`);
assert.deepEqual(busca(soCrm, ""), [`${C}/hoje`, `${C}/crm-painel`, `${C}/vendas-kommo`]);
assert.ok(busca(vis(), "hoje").includes(`${C}/hoje`), "a Hoje é achada pelo nome");
assert.ok(busca(vis(), "relatorio").includes(`${C}/relatorio`), "sem acento também acha");
assert.ok(!busca(soCrm, "publicações").includes(`${C}/posts`) && !busca(soCrm, "instagram").includes(`${C}/conteudo`), "só-CRM não acha Instagram");
assert.ok(busca(soCrm, "funil").includes(`${C}/crm-painel`), "só-CRM acha o Funil No CRM");
assert.ok(!busca(semInstagram, "publicações").includes(`${C}/posts`), "sem Instagram ligado, Posts não aparece");
// Toda tela achada é alcançável por um item do menu da clínica.
const alcancaveis = new Set(menu(vis()).flatMap((i) => i.rotas));
for (const t of buscarTelasDoMedico(vis(), "a")) assert.ok(alcancaveis.has(t.rota) , `${t.rota} fora dos 6`);

console.log("test-telas-juntadas: ok");
