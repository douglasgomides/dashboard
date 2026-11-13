// As respostas dos blocos do "Ver tudo" da Carteira (quick-ver-tudo, 13/11/2026). Só dados fictícios; a frase é da carteira, nunca uma
// clínica contra as outras (D-02).
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-carteira.ts
import assert from "node:assert/strict";
import { GUARDA_SEM_COMPARAR_CLINICAS } from "../src/lib/leitura/cinco-segundos";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDoDiagnosticoDasFontes, cabecaDosContadores } from "../src/lib/leitura/ver-tudo-carteira";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.doesNotMatch(textoDaCabeca(c), GUARDA_SEM_COMPARAR_CLINICAS);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDosContadores({ comProblema: 3, total: 6 }), "3 de 6 clínicas têm fonte atrasada, parada ou com erro.");
ok(cabecaDosContadores({ comProblema: 0, total: 6 }), "Nenhuma das 6 clínicas tem fonte atrasada, parada ou com erro.");
assert.equal(cabecaDosContadores({ comProblema: null, total: 6 }).tipo, "falta", "lendo as fontes nunca vira zero");

ok(cabecaDoDiagnosticoDasFontes(["Anúncios", "CRM"]), "As fontes em vermelho são Anúncios e CRM.");
ok(cabecaDoDiagnosticoDasFontes(["CRM"]), "A fonte em vermelho é CRM.");
ok(cabecaDoDiagnosticoDasFontes([]), "Nenhuma fonte em vermelho: tudo ligado tem dado de até 3 dias.");
assert.equal(cabecaDoDiagnosticoDasFontes(null).tipo, "falta");

console.log("test-ver-tudo-carteira: ok");
