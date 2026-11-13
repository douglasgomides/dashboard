// As respostas dos blocos do "Ver tudo" de Onde os pacientes travam › Funil (quick-ver-tudo, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-pacientes.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import type { Descoberta } from "../src/lib/leitura/cinco-segundos";
import { cabecaDeQuemChamar, cabecaDeQuemChamou, cabecaDosNaoMedidos, semRepetirOVeredito } from "../src/lib/leitura/ver-tudo-pacientes";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDeQuemChamar({ total: 8, atrasados: 3, carregando: false, semVendas: null }), "8 pessoas para chamar agora; 3 já passaram do prazo de voltar.");
ok(cabecaDeQuemChamar({ total: 1, atrasados: 0, carregando: false, semVendas: null }), "1 pessoa para chamar agora.");
ok(cabecaDeQuemChamar({ total: 0, atrasados: 0, carregando: false, semVendas: null }), "Ninguém para chamar agora.");
assert.equal(textoDaCabeca(cabecaDeQuemChamar({ total: 0, atrasados: 0, carregando: false, semVendas: "Sem dado no CRM." })), "Falta dado: sem as vendas, não dá para saber quem volta");
assert.equal(cabecaDeQuemChamar({ total: 5, atrasados: 0, carregando: true, semVendas: null }).tipo, "falta", "carregando nunca vira número");

ok(cabecaDeQuemChamou({ novas: 80, antigos: 40 }), "80 de 120 que chamaram eram pessoas novas.");
assert.equal(cabecaDeQuemChamou({ novas: 0, antigos: 0 }).tipo, "falta");
ok(cabecaDosNaoMedidos(2), "2 números do funil ainda não são medidos nesta clínica.");
ok(cabecaDosNaoMedidos(1), "1 número do funil ainda não é medido nesta clínica.");

// A descoberta do "Ver tudo" que repete o veredito (o mesmo número principal) sai; as outras ficam.
const d = (id: string, frase: string): Descoberta => ({ id, tom: "ruim", selo: "Maior perda", frase, acao: { rotulo: "Ver o funil", local: "x" }, porque: { titulo: "t", barras: [] } });
assert.deepEqual(
  semRepetirOVeredito([d("a", "Entre Agendou e Fechou, 30% passam."), d("b", "De cada 100 leads, 43 agendam.")], "Aqui você perde mais: só 30% dos agendados fecham.").map((x) => x.id),
  ["b"],
);
assert.equal(semRepetirOVeredito([d("a", "x 30%")], null).length, 1, "sem veredito, nada sai");

console.log("test-ver-tudo-pacientes: ok");
