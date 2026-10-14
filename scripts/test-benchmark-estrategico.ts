// npx tsx scripts/test-benchmark-estrategico.ts
import assert from "node:assert/strict";
import { comparar, faixaTamanho, grupoEspecialidade, medianasDoCliente, montarGrupo, percentil, responder, type PostBench } from "../src/lib/benchmark-estrategico";

assert.equal(grupoEspecialidade("Ginecologista — Menopausa e Saúde Hormonal"), "Ginecologia");
assert.equal(grupoEspecialidade("Oftalmologista — Glaucoma e Catarata"), "Oftalmologia");
assert.equal(grupoEspecialidade("Nútrologa"), "Nutrologia/Endocrinologia");
assert.equal(grupoEspecialidade(null), "Outras");
assert.equal(faixaTamanho(4000), "Até 5 mil");
assert.equal(faixaTamanho(null), "Sem dado");
assert.equal(percentil([1, 2, 3, 4, 5], 0.75), 4);

// Poucos posts: sem mediana (não inventa).
const p = (client_id: string, formato: string, reach: number, saved: number, extra: Partial<PostBench> = {}): PostBench => ({ client_id, formato, objetivo: "percepcao", reach, saved, shares: 1, comments: 1, likes: 10, ...extra });
assert.equal(medianasDoCliente([p("a", "reels", 100, 1), p("a", "reels", 100, 1)], 1000), null);
const m = medianasDoCliente([p("a", "reels", 1000, 20), p("a", "reels", 2000, 40), p("a", "reels", 3000, 60)], 10000)!;
assert.equal(m.alcance, 2000);
assert.equal(m.alcanceSeg, 0.2);
assert.equal(m.taxaSalvamento, 0.02);
// Stories: sem salvamento, taxa de salvamento fica sem dado.
assert.equal(medianasDoCliente([1, 2, 3].map(() => p("a", "stories", 500, 0, { saved: null })), 1000)!.taxaSalvamento, null);

// Grupo: 4 clientes de referência + alvo com carrossel forte e reels fraco.
const clientes = ["alvo", "b", "c", "d", "e"].map((id) => ({ id, nome: id, especialidade: "Dermatologista", seguidores: 10000 }));
const posts: PostBench[] = [];
for (const id of ["b", "c", "d", "e"]) for (let i = 0; i < 4; i++) {
  posts.push(p(id, "reels", 2000, 20, { tema: "x" }));
  posts.push(p(id, "carrossel", 1000, 20));
  posts.push(p(id, "estatico", 800, 40));
}
for (let i = 0; i < 4; i++) {
  posts.push(p("alvo", "carrossel", 1000, 60, { tema: "Menopausa", objetivo: "confianca" }));
  posts.push(p("alvo", "reels", 500, 1, { likes: 2, comments: 0, shares: 0, tema: "Rotina" }));
}
const grupo = montarGrupo(clientes, { especialidade: "Dermatologia" });
assert.equal(grupo.length, 5);
assert.deepEqual(montarGrupo(clientes, { especialidade: "Ginecologia" }), []);

const carr = comparar(posts, clientes, "alvo", grupo, { formato: "carrossel" })!;
assert.equal(carr.clientesNoGrupo, 4);
assert.equal(carr.limitado, false);
assert.equal(carr.linhas.find((l) => l.metrica === "taxaSalvamento")!.posicao, "top");
const reels = comparar(posts, clientes, "alvo", grupo, { formato: "reels" })!;
assert.equal(reels.linhas.find((l) => l.metrica === "engajamento")!.posicao, "abaixo");
assert.equal(comparar(posts, clientes, "alvo", grupo, { formato: "stories" }), null);

const r = responder(posts, clientes, "alvo", grupo);
assert.ok(r.repetir.some((t) => t.startsWith("Carrossel")));
assert.ok(r.perdendo.some((t) => t.startsWith("Reels")));
assert.match(r.oportunidade ?? "", /Estático/); // grupo salva 5% no estático e o alvo não usa
assert.equal(r.temasFortes[0]?.tema, "Menopausa");
assert.equal(r.limitado, false);

// Grupo pequeno: conclusão marcada como limitada.
const pequeno = responder(posts, clientes, "alvo", ["alvo", "b"]);
assert.equal(pequeno.limitado, true);
assert.match(pequeno.padrao.texto, /Grupo pequeno/);
assert.deepEqual(pequeno.repetir, []);

// Cliente sem posts: sem dado.
assert.equal(responder(posts, clientes, "nada", grupo).padrao.veredito, "sem_dado");
console.log("test-benchmark-estrategico: ok");
