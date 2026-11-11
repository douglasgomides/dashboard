import assert from "node:assert/strict";
import {
  REGISTRO_DE_TELAS,
  SECOES_JUNTADAS,
  abasVisiveis,
  buscarTelasEquipe,
  juntadaDoCaminho,
  telaDoCaminho,
} from "../src/lib/registro-de-telas";
import type { Visibilidade } from "../src/lib/nav";

// Teste das telas juntadas do médico (Phase 3.1.1, plano 01, D-01 e D-04): registro, aba pelo caminho da tela antiga e
// visibilidade por fonte. Módulo puro: roda em tsx, sem React.

const CID = "11111111-1111-4111-8111-111111111111";
const C = "/_authenticated/$clientId";
const FONTES = { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true };
const vis = (extra: Partial<Visibilidade> = {}): Visibilidade => ({ isAdmin: false, fontes: FONTES, soCrm: false, papel: "viewer", ...extra });

// --- 1. Rótulos e ordem (D-01, aprovados pelo João em 10/11/2026) ---
assert.deepEqual(
  SECOES_JUNTADAS.map((s) => [s.id, s.rotulo, s.icone]),
  [
    ["travam", "Onde os pacientes travam", "filter"],
    ["origem", "De onde vêm os pacientes", "chart-bar"],
    ["instagram", "Instagram", "brand-instagram"],
  ],
);
assert.ok(SECOES_JUNTADAS.every((s) => s.publico === "medico"));
assert.deepEqual(
  SECOES_JUNTADAS.map((s) => s.abas.map((a) => a.rotulo)),
  [
    ["Funil", "Consultas", "Vendas", "Jornada"],
    ["Por origem", "Instagram", "Anúncios", "Links"],
    ["Desempenho", "Destaques", "Posts", "Público"],
  ],
);
const funil = SECOES_JUNTADAS[0].abas[0];
assert.deepEqual(funil.partes.map((p) => [p.rota, p.rotulo]), [[`${C}/pacientes`, "Do contato à venda"], [`${C}/crm-painel`, "No CRM"]]);
assert.deepEqual(
  SECOES_JUNTADAS.flatMap((s) => s.abas.map((a) => a.contagem)),
  [null, "consultas no período", "vendas no período", null, "origens com venda no período", null, "campanhas no período", "links rastreados", null, "publicações em destaque", "publicações no período", null],
);
assert.equal(SECOES_JUNTADAS.flatMap((s) => s.abas).length, 12);

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
assert.equal(vistas.size, 13, "13 telas antigas viram partes das 12 abas (5 + 4 + 4)");

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

// --- 5. telaDoCaminho ---
assert.equal(telaDoCaminho(`/${CID}/top`)?.rotulo, REGISTRO_DE_TELAS.find((t) => t.rota === `${C}/top`)?.rotulo);
assert.equal(telaDoCaminho(`/${CID}/top/`)?.rota, `${C}/top`);
assert.equal(telaDoCaminho(`/${CID}`)?.rota, `${C}/`);
assert.equal(telaDoCaminho("/admin"), null);
assert.equal(telaDoCaminho(`/${CID}/nao-existe`), null);

// --- 6. D-03: a busca da equipe ainda acha a aba pelo nome antigo ---
const admin = { isAdmin: true, papel: "admin" as const };
assert.equal(buscarTelasEquipe(admin, "Funil comercial")[0]?.rota, `${C}/crm-painel`);

console.log("test-telas-juntadas: ok");
