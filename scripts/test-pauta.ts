// npx tsx scripts/test-pauta.ts
import assert from "node:assert/strict";
import { contarStatus, formatoDe, ideiaParaPauta, montarSemana, proximoDiaLivre, roteiroCompleto, semanaEmTexto, seteDias, type Pauta } from "../src/lib/pauta";

assert.equal(formatoDe("Reels"), "reels");
assert.equal(formatoDe("Carrossel (5 cards)"), "carrossel");
assert.equal(formatoDe("Post estático"), "estatico");
assert.equal(formatoDe("Stories com caixa de pergunta"), "stories");
assert.equal(formatoDe(null), "reels");

const ideia = { id: "pergunta:preco", regra: "pergunta", titulo: "Quanto custa o implante?", tema: "preço", formato: "Carrossel", objetivo: "venda", confianca: "media", motivoConfianca: "", evidencia: "6 pessoas perguntaram", porQueTestar: "Dúvida repetida", gancho: "Você sabe o que muda o preço?", roteiro: ["Passo A", "Passo B"], cta: "Chame no WhatsApp", avisoSeguranca: "Não citar valores fechados.", funil: "", estagio: "", acao: "", porque: "" } as any;
const np = ideiaParaPauta(ideia, "c1");
assert.equal(np.objetivo, "conversa"); // venda vira conversa
assert.equal(np.origem_tipo, "duvida");
assert.equal(np.formato, "carrossel");
assert.equal(np.status, "escolhida");
assert.equal(np.origem_texto, "6 pessoas perguntaram");
assert.equal(ideiaParaPauta({ ...ideia, regra: "tema", objetivo: "salvamento" }, "c1").origem_tipo, "tema");

const r = roteiroCompleto(np);
assert.match(r, /Card 1 \(capa\): Você sabe o que muda o preço\?/);
assert.match(r, /Card 3: Passo B/);
assert.match(r, /Último card: Chame no WhatsApp/);
assert.match(r, /segurança médica/);
assert.match(roteiroCompleto({ ...np, formato: "reels" }), /0 a 3 s/);
assert.match(roteiroCompleto({ ...np, formato: "stories", roteiro: [] }), /Story 2: Explique/);

// 2026-10-14 é quarta-feira.
const dias = seteDias("2026-10-14");
assert.equal(dias.length, 7);
assert.equal(dias[0].rotulo, "Qua 14/10");
assert.equal(dias[6].data, "2026-10-20");
assert.equal(proximoDiaLivre([], "2026-10-14"), "2026-10-14");
assert.equal(proximoDiaLivre([{ dia: "2026-10-14" }, { dia: "2026-10-15" }, { dia: "2026-10-16" }], "2026-10-14"), "2026-10-19"); // pula sábado e domingo
assert.equal(proximoDiaLivre([{ dia: "2026-10-17" }], "2026-10-17"), "2026-10-19"); // começando no sábado

const p = (id: string, dia: string | null, formato: Pauta["formato"], status: Pauta["status"]): Pauta => ({ ...np, id, dia, formato, status, roteiro: [] }) as Pauta;
const pautas = [p("1", "2026-10-14", "reels", "escolhida"), p("2", "2026-10-14", "carrossel", "produzida"), p("3", null, "reels", "nova"), p("4", "2026-11-01", "estatico", "publicada")];
const s = montarSemana(pautas, "2026-10-14");
assert.equal(s.dias[0].pautas.length, 2);
assert.equal(s.semDia.length, 1);
assert.equal(s.foraDaSemana.length, 1);
assert.deepEqual(s.formatos.map((f) => f.n), [1, 1, 0, 0]);
assert.deepEqual(contarStatus(pautas), { nova: 1, escolhida: 1, produzida: 1, publicada: 1, medida: 0 });
const txt = semanaEmTexto(pautas, "2026-10-14");
assert.match(txt, /Qua 14\/10: Reels · Quanto custa o implante\? \(escolhida\) \| Carrossel/);
assert.match(txt, /Qui 15\/10: livre/);
console.log("test-pauta: ok");
