import assert from "node:assert/strict";
import { montarRoteiros } from "../src/lib/roteiros-anuncio";

const r = montarRoteiros({
  grupos: [
    { id: "g1", rotulo: "Cortisol alto", termo: "o cortisol alto", intencao: "duvida_clinica", pessoas: 4, exemplos: [{ texto: "Como abaixar o cortisol??" }, { texto: "cortisol alto engorda?" }] },
    { id: "g2", rotulo: "Preço", termo: "a consulta", intencao: "preco", pessoas: 6, exemplos: [{ texto: "Qual valor?" }] },
    { id: "g3", rotulo: "Reposição", termo: "a reposição hormonal", intencao: "medo", pessoas: 2, exemplos: [{ texto: "Tenho medo de reposição, dá câncer?" }] },
    { id: "g4", rotulo: "Dose", termo: "a dose", intencao: "duvida_clinica", pessoas: 9, exemplos: [{ texto: "quantos mg eu tomo?" }], cuidadoMedico: true },
  ],
  identificacao: [{ tema: "Sintomas da menopausa", pessoas: 7, exemplos: ["Me sinto pior que isso", "Eu também, angústia horrível"] }],
  objecoesWhatsapp: { preco: 12, convenio: 3, outro: 5 },
});

const por = (e: string) => r.filter((x) => x.etapa === e);
assert.equal(por("C1").length, 1);
assert.equal(por("C2").length, 1, "dúvida com pedido de dose não vira anúncio");
assert.ok(por("C3").length >= 3);
// C3 é campanha de mensagens e começa pela maior objeção (preço: 6 comentários + 12 conversas).
assert.equal(por("C3")[0].objetivoCampanha, "Mensagens (WhatsApp ou Direct)");
assert.match(por("C3")[0].origem, /preço/);
assert.equal(por("C3")[0].base, 18);
assert.match(por("C3")[0].baseTexto, /6 pessoas nos comentários \+ 12 conversas no WhatsApp/);
// Gancho nunca copia o comentário nem diz quantas vezes apareceu.
for (const x of r) {
  for (const ex of x.exemplos) assert.ok(!x.gancho.includes(ex), `gancho copiou comentário: ${x.gancho}`);
  assert.ok(!/apareceu|vezes nos coment|perguntaram/i.test(x.gancho), `gancho com contagem: ${x.gancho}`);
  // CFM: sem preço, desconto ou promessa.
  assert.ok(!/R\$|desconto|promo|garant/i.test(x.gancho + x.copy + x.roteiro.join(" ")), `CFM: ${x.titulo}`);
}
// Exemplos reais (até 3) para a equipe validar.
assert.ok(r.every((x) => x.exemplos.length <= 3));
assert.ok(por("C1")[0].exemplos.length >= 2);
console.log("test-roteiros-anuncio: ok");
