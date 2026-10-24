import assert from "node:assert/strict";
import { chaveDe, lerResultado, mascarar, montarEntrada, MAX_MEMORIAS } from "../src/lib/reunioes";

// Máscara de dado pessoal antes da IA.
const m = mascarar("Falar com a Ana pelo (11) 98765-4321 ou ana@clinica.com, CPF 123.456.789-00");
assert.ok(!/98765|ana@|123\.456/.test(m));
assert.match(m, /\[telefone\].*\[e-mail\].*\[cpf\]/);

assert.equal(chaveDe("Foco em Menopausa até Dezembro!"), "foco_em_menopausa_ate_dezembro");

// Fora do formato: nada é gravado.
assert.equal(lerResultado(null), null);
assert.equal(lerResultado({ combinados: ["x"] }), null, "sem resumo não vale");

const r = lerResultado({
  resumo: "A médica quer focar em menopausa e reduzir anúncio de estética.",
  combinados: ["Dois Reels por semana sobre menopausa", ""],
  acoes_clinica: ["Secretária responde em até 15 min"], acoes_equipe: ["Ajustar campanha"],
  entregas: [{ tipo: "conteudo", titulo: "Roteiro de Reels: sintomas da menopausa", detalhe: "Gancho...", porque: "Combinado na reunião" }, { tipo: "inventado", titulo: "Revisar agenda" }, { titulo: "" }],
  memorias: [
    { memoria: "decisao", chave: "Foco do trimestre", valor: "Foco em menopausa até dezembro", confianca: "alta" },
    { memoria: "decisao", chave: "foco_do_trimestre", valor: "repetida", confianca: "alta" },
    { memoria: "comercial", chave: "contato", valor: "Ligar para (11) 98765-4321", confianca: "media" },
    { memoria: "inexistente", chave: "x", valor: "abc" },
    { memoria: "audiencia", valor: "Pacientes chegam com medo de hormônio", confianca: "qualquer" },
  ],
});
assert.ok(r);
assert.deepEqual(r.combinados, ["Dois Reels por semana sobre menopausa"]);
assert.equal(r.entregas.length, 2, "entrega sem título sai");
assert.equal(r.entregas[1].tipo, "outro", "tipo desconhecido vira outro");
assert.deepEqual(r.memorias.map((x) => `${x.memoria}:${x.chave}`), ["decisao:foco_do_trimestre", "audiencia:pacientes_chegam_com_medo_de_hormonio"], "sem repetida, sem telefone, sem memória inválida; chave vem do texto");
assert.equal(r.memorias[1].confianca, "media");
assert.equal(lerResultado({ resumo: "x", memorias: Array.from({ length: 30 }, (_, i) => ({ memoria: "decisao", chave: `item_${i}`, valor: `valor ${i}` })) })!.memorias.length, MAX_MEMORIAS);

// Entrada leva o Brain e o plano, e mascara notas e transcrição.
const e = montarEntrada({ titulo: "Reunião semanal", data: "2026-10-23", participantes: "Dra. X", notas: "ligar 11 98765-4321", transcricao: "e-mail a@b.com" },
  { nome: "Clínica", especialidade: "Ginecologia", brain: [{ memoria: "identidade", chave: "tom", valor: "acolhedor" }], plano: ["Responder 12 conversas"] });
assert.match(e, /\[identidade\] tom: acolhedor/);
assert.match(e, /Responder 12 conversas/);
assert.ok(!/98765|a@b\.com/.test(e));
console.log("reunioes ok");
