import assert from "node:assert/strict";
import {
  alertasDaClinica,
  casaFiltroDeCor,
  corDaClinica,
  descobertasDaCarteira,
  numerosDaCarteira,
  ordenarPorUrgencia,
  problemasDeTextoDoVeredito,
  vereditoDaCarteira,
  type LinhaDaCarteira,
  type SaudeParaAlerta,
} from "../src/lib/carteira-urgencia";
import { checarDescoberta, checarFraseCinco, GUARDA_SEM_COMPARAR_CLINICAS } from "../src/lib/leitura/cinco-segundos";
import type { FonteId } from "../src/lib/status-fonte";

// Clínicas e nomes fictícios: nenhum dado real.
const saude = (cores: Partial<Record<FonteId, "verde" | "amarelo" | "vermelho" | "cinza">>): Record<FonteId, SaudeParaAlerta> => {
  const rotulo = { verde: "Em dia", amarelo: "Atrasada", vermelho: "Parada", cinza: "Não ligado" } as const;
  const f = (c: keyof typeof rotulo): SaudeParaAlerta => ({
    status: { cor: c, rotulo: rotulo[c], data: c === "cinza" ? null : "09/10", detalhe: "até 09/10 · 5 dias sem dado novo" },
    causa: c === "vermelho" ? "Token expirado" : null,
  });
  return { instagram: f(cores.instagram ?? "verde"), anuncios: f(cores.anuncios ?? "verde"), crm: f(cores.crm ?? "verde"), atendimento: f(cores.atendimento ?? "cinza") };
};
const entra = { fato: "entra", dias: 3 };
const base = { problemas: [], qualidade: undefined, fatoAcesso: entra, ultimoAcesso: null };

// alertasDaClinica: quem resolve vem do problema da mesma fonte.
let al = alertasDaClinica({ ...base, saude: saude({ instagram: "vermelho" }), problemas: [{ id: "c1:instagram:erro", clientId: "c1", fonte: "instagram", quem: "equipe" }] });
assert.equal(al.length, 1);
assert.equal(al[0].quem, "Equipe");
assert.equal(al[0].texto, "Instagram: parada");
assert.equal(al[0].tom, "critico");
assert.match(al[0].titulo, /até 09\/10/);
assert.match(al[0].titulo, /Token expirado/);
for (const [q, esperado] of [["meta", "Meta"], ["cliente", "Cliente"], ["ninguem", "Só acompanhar"]] as const) {
  al = alertasDaClinica({ ...base, saude: saude({ anuncios: "vermelho" }), problemas: [{ id: "c1:anuncios:x", clientId: "c1", fonte: "anuncios", quem: q }] });
  assert.equal(al[0].quem, esperado, `quem ${q}`);
}
// O problema do sync vale mais que o de qualidade da mesma fonte.
al = alertasDaClinica({
  ...base,
  saude: saude({ crm: "vermelho" }),
  problemas: [
    { id: "c1:q:crm-funil-fora", clientId: "c1", fonte: "crm", quem: "cliente" },
    { id: "c1:crm:erro", clientId: "c1", fonte: "crm", quem: "equipe" },
  ],
});
assert.equal(al[0].quem, "Equipe");
// Sem problema achado: vermelha é da equipe, amarela é só acompanhar.
al = alertasDaClinica({ ...base, saude: saude({ crm: "vermelho", instagram: "amarelo" }) });
assert.deepEqual(al.map((a) => [a.chave, a.quem]), [["crm", "Equipe"], ["instagram", "Só acompanhar"]]);
// Dado com erro e não entra, na lista de sempre e com quem resolve.
al = alertasDaClinica({
  ...base,
  saude: saude({}),
  qualidade: [{ severidade: "alta", titulo: "Vendas sem valor" }, { severidade: "media", titulo: "Funil fora" }],
  fatoAcesso: { fato: "nao_entra", dias: 37 },
  ultimoAcesso: "05/10",
});
assert.deepEqual(al.map((a) => [a.chave, a.quem, a.tom]), [["dado", "Equipe", "critico"], ["acesso", "Cliente", "atencao"]]);
assert.equal(al[0].texto, "2 dados com erro · 1 afeta a leitura");
assert.equal(al[1].texto, "Não entra há 37 dias");
assert.equal(al[1].acesso, true);
assert.match(al[1].titulo, /05\/10/);
al = alertasDaClinica({ ...base, saude: saude({}), fatoAcesso: { fato: "sem_acesso", dias: null } });
assert.deepEqual(al.map((a) => [a.chave, a.quem, a.tom]), [["acesso", "Equipe", "neutro"]]);
// Sem leitura da saúde ainda: só o que não depende dela.
assert.deepEqual(alertasDaClinica({ ...base, saude: null }), []);
// Tom pior primeiro (estável): atenção vem depois de crítico.
al = alertasDaClinica({ ...base, saude: saude({ instagram: "amarelo", anuncios: "vermelho" }) });
assert.deepEqual(al.map((a) => a.chave), ["anuncios", "instagram"]);

// ordenarPorUrgencia: problemas desc, nota menor primeiro, sem nota por último, nome.
const L = (nome: string, n: number, nota: number | null) => ({ nome, alertas: Array.from({ length: n }, () => ({})), nota });
assert.deepEqual(ordenarPorUrgencia([L("A", 1, 80), L("B", 4, 15), L("C", 4, 30), L("D", 0, null)]).map((l) => l.nome), ["B", "C", "A", "D"]);
assert.deepEqual(ordenarPorUrgencia([L("Zeca", 2, 50), L("Ana", 2, 50), L("Sem", 2, null)]).map((l) => l.nome), ["Ana", "Zeca", "Sem"]);
const entrada = [L("A", 1, 80), L("B", 4, 15)];
ordenarPorUrgencia(entrada);
assert.equal(entrada[0].nome, "A", "não muda a lista de entrada");

// Faixas.
assert.equal(corDaClinica("ruim"), "vermelho");
assert.equal(corDaClinica("atencao"), "amarelo");
assert.equal(corDaClinica("boa"), "verde");
assert.equal(corDaClinica(null), "sem-nota");
assert.ok(casaFiltroDeCor("todas", "sem-nota"));
assert.ok(casaFiltroDeCor("vermelho", "vermelho"));
assert.ok(!casaFiltroDeCor("vermelho", "amarelo"));
assert.ok(casaFiltroDeCor("sem-nota", "sem-nota"));

// Veredito.
const alerta = { chave: "x", tom: "critico", texto: "x", titulo: "x", quem: "Equipe" } as const;
const linha = (id: string, nome: string, n: number, nota: number | null, entraNaConta = true): LinhaDaCarteira => ({
  id,
  nome,
  entra: entraNaConta,
  nota,
  faixa: nota == null ? null : nota >= 85 ? "boa" : nota >= 60 ? "atencao" : "ruim",
  alertas: Array.from({ length: n }, () => alerta),
});
let v = vereditoDaCarteira([linha("1", "Clínica Alfa", 1, 80), linha("2", "Clínica Beta", 4, 15), linha("3", "Clínica Gama", 2, 40), linha("4", "Clínica Delta", 0, 95)]);
assert.equal(v.tipo, "veredito");
if (v.tipo === "veredito") {
  assert.equal(v.palavra, "Atenção");
  assert.equal(v.frase.map((p) => p.texto).join(""), "3 clínicas precisam de você hoje");
  assert.equal(v.frase[0].texto, "3 clínicas");
  assert.equal(v.frase[0].enfase, "numero");
  assert.equal(v.apoio, "Comece pela Clínica Beta: 4 problemas abertos, nota das fontes 15.");
}
assert.deepEqual(problemasDeTextoDoVeredito(v), []);
assert.equal(GUARDA_SEM_COMPARAR_CLINICAS.test("3 clínicas precisam de você hoje"), false);
// Uma só clínica, sem nota.
v = vereditoDaCarteira([linha("1", "Clínica Alfa", 1, null), linha("2", "Clínica Beta", 0, 90)]);
assert.ok(v.tipo === "veredito" && v.frase.map((p) => p.texto).join("") === "1 clínica precisa de você hoje");
assert.ok(v.tipo === "veredito" && v.apoio === "Comece pela Clínica Alfa: 1 problema aberto.");
// Só conta quem a Carteira cobra: o negócio próprio com alerta não entra.
v = vereditoDaCarteira([linha("1", "Clínica Alfa", 2, 50, false), linha("2", "Clínica Beta", 0, 90)]);
assert.ok(v.tipo === "veredito" && v.palavra === "Bom");
assert.ok(v.tipo === "veredito" && v.frase.map((p) => p.texto).join("") === "Nenhuma clínica com problema aberto hoje");
assert.deepEqual(problemasDeTextoDoVeredito(v), []);
// Nome longo: a frase de apoio continua em até 90 caracteres.
v = vereditoDaCarteira([linha("1", "Clínica de Medicina Integrada e Especialidades Associadas do Litoral Norte Paulista", 3, 20)]);
assert.ok(v.tipo === "veredito" && v.apoio && v.apoio.length <= 90 && v.apoio.includes("…"), "nome longo encurta");
assert.deepEqual(problemasDeTextoDoVeredito(v), []);
assert.deepEqual(checarFraseCinco("Comece pela Clínica Beta: 4 problemas abertos, nota das fontes 15."), []);
// Carteira vazia: o mesmo "Falta dado" das outras telas.
v = vereditoDaCarteira([]);
assert.equal(v.tipo, "sem_leitura");

// ---------- os 3 números ----------
const alertaDe = (chave: string, tom: "critico" | "atencao" | "neutro", quem: "Equipe" | "Cliente" | "Meta" | "Só acompanhar") => ({ chave, tom, texto: chave, titulo: chave, quem });
const comAlertas = (id: string, nome: string, nota: number | null, alertas: ReturnType<typeof alertaDe>[], entraNaConta = true): LinhaDaCarteira => ({
  id,
  nome,
  entra: entraNaConta,
  nota,
  faixa: nota == null ? null : nota >= 85 ? "boa" : nota >= 60 ? "atencao" : "ruim",
  alertas,
});
const carteira: LinhaDaCarteira[] = [
  comAlertas("1", "Clínica Alfa", 30, [alertaDe("crm", "critico", "Equipe"), alertaDe("anuncios", "critico", "Cliente"), alertaDe("acesso", "atencao", "Cliente")]),
  comAlertas("2", "Clínica Beta", 75, [alertaDe("instagram", "atencao", "Só acompanhar"), alertaDe("dado", "critico", "Equipe")]),
  comAlertas("3", "Clínica Gama", null, []),
  comAlertas("4", "Clínica Delta", 20, [alertaDe("crm", "critico", "Meta")], false),
  comAlertas("5", "Clínica Épsilon", 95, []),
];
const nums = numerosDaCarteira(carteira);
assert.equal(nums.total, 4, "o negócio próprio fica de fora");
assert.equal(nums.problemasAbertos, 5);
assert.deepEqual(nums.porQuem, { Equipe: 2, Cliente: 2, Meta: 0, "Só acompanhar": 1 });
assert.equal(nums.acaoHoje, 1, "só a faixa ruim das clínicas que a carteira cobra");
assert.equal(nums.comNota, 3);
assert.equal(nums.semNota, 1);
assert.equal(nums.vsSemanaPassada, null, "sem histórico: nunca um 0%");

// ---------- descobertas ----------
const achados = descobertasDaCarteira(carteira);
assert.deepEqual(achados.map((d) => d.id), ["carteira-fontes-paradas", "carteira-com-a-equipe", "carteira-medico-nao-entra", "carteira-sem-nota"]);
const porId = Object.fromEntries(achados.map((d) => [d.id, d]));
assert.equal(porId["carteira-fontes-paradas"].frase, "2 fontes paradas ou com erro na carteira");
assert.equal(porId["carteira-fontes-paradas"].impacto, "em 1 clínica");
assert.equal(porId["carteira-com-a-equipe"].frase, "A equipe resolve 2 dos 5 problemas");
assert.deepEqual(porId["carteira-com-a-equipe"].porque.barras.map((b) => [b.rotulo, b.exibicao]), [["Equipe", "2"], ["Cliente", "2"], ["Meta e só acompanhar", "1"]]);
assert.equal(porId["carteira-medico-nao-entra"].frase, "1 clínica: o médico não entra há mais de 14 dias");
assert.equal(porId["carteira-sem-nota"].frase, "1 clínica ainda sem nota");
assert.equal(porId["carteira-sem-nota"].acao.local, "filtrar-sem-nota");
assert.equal(porId["carteira-fontes-paradas"].acao.local, "abrir-diagnostico");
for (const d of achados) {
  assert.deepEqual(checarDescoberta(d), [], `descoberta ${d.id}`);
  assert.ok(d.acao.local && !d.acao.rota, "só abre um lugar da própria tela");
  for (const b of d.porque.barras) assert.ok(b.fracao >= 0 && b.fracao <= 1, `fração de ${b.rotulo}`);
  // Nenhuma descoberta nomeia uma clínica (D-02): só problema aberto e quem resolve.
  const texto = [d.frase, d.selo, d.impacto ?? "", d.porque.titulo, d.porque.obs ?? "", ...d.porque.barras.map((b) => `${b.rotulo} ${b.exibicao}`)].join(" ");
  assert.doesNotMatch(texto, /Clínica (Alfa|Beta|Gama|Delta|Épsilon)/);
  assert.doesNotMatch(texto, GUARDA_SEM_COMPARAR_CLINICAS);
  assert.doesNotMatch(texto, /pontos?\b|\+\d+/i, "nenhuma promessa de ponto");
}
// Carteira sem problema: nenhuma descoberta inventada.
assert.deepEqual(descobertasDaCarteira([comAlertas("1", "Clínica Alfa", 95, []), comAlertas("2", "Clínica Beta", 99, [])]), []);
// Singular e plural.
const uma = descobertasDaCarteira([comAlertas("1", "Clínica Alfa", 50, [alertaDe("crm", "critico", "Equipe")])]);
assert.equal(uma[0].frase, "1 fonte parada ou com erro na carteira");
assert.equal(uma[1].frase, "A equipe resolve 1 dos 1 problema");

console.log("test-carteira-urgencia: ok");
