import assert from "node:assert/strict";
import { CHAVE_ULTIMA_CLINICA, gravarUltimaClinica, lerUltimaClinica, type ArmazenamentoSimples } from "../src/lib/ultima-clinica";

// Armazenamento falso em memória, com a mesma forma do localStorage (getItem/setItem).
function armazenamentoFalso(inicial: Record<string, string> = {}): ArmazenamentoSimples & { dados: Record<string, string> } {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (chave) => (chave in dados ? dados[chave] : null),
    setItem: (chave, valor) => {
      dados[chave] = String(valor);
    },
  };
}

// Armazenamento que lança em tudo (Safari privado, cota cheia, storage bloqueado).
const quebrado: ArmazenamentoSimples = {
  getItem: () => {
    throw new Error("sem storage");
  },
  setItem: () => {
    throw new Error("sem storage");
  },
};

const ID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "ABCDEF12-3456-4789-8abc-def012345678";

assert.equal(CHAVE_ULTIMA_CLINICA, "nexo:ultima-clinica");

// Grava e lê o mesmo UUID; o valor guardado é só o id.
const a = armazenamentoFalso();
gravarUltimaClinica(ID, a);
assert.equal(a.dados[CHAVE_ULTIMA_CLINICA], ID);
assert.deepEqual(Object.keys(a.dados), [CHAVE_ULTIMA_CLINICA]);
assert.equal(lerUltimaClinica(a), ID);

// A próxima clínica aberta substitui a anterior; UUID em maiúsculas também vale.
gravarUltimaClinica(OUTRO, a);
assert.equal(lerUltimaClinica(a), OUTRO);

// Chave vazia: null.
assert.equal(lerUltimaClinica(armazenamentoFalso()), null);
assert.equal(lerUltimaClinica(armazenamentoFalso({ [CHAVE_ULTIMA_CLINICA]: "" })), null);

// Texto que não é UUID nunca vira link.
for (const estranho of ["não-é-uuid", "../admin", `${ID}/pacientes`, ` ${ID}`, "javascript:alert(1)", '{"id":"x"}']) {
  assert.equal(lerUltimaClinica(armazenamentoFalso({ [CHAVE_ULTIMA_CLINICA]: estranho })), null, estranho);
}

// Gravar algo que não é UUID não grava nada (e não apaga o que já estava lá).
const b = armazenamentoFalso();
gravarUltimaClinica("não-é-uuid", b);
assert.deepEqual(b.dados, {});
gravarUltimaClinica(ID, b);
gravarUltimaClinica("admin", b);
assert.equal(lerUltimaClinica(b), ID);

// Armazenamento que lança não derruba a chamada.
assert.equal(lerUltimaClinica(quebrado), null);
assert.doesNotThrow(() => gravarUltimaClinica(ID, quebrado));

// Sem armazenamento passado e sem window (Node): lê null e grava sem lançar.
assert.equal(lerUltimaClinica(), null);
assert.doesNotThrow(() => gravarUltimaClinica(ID));

console.log("test-ultima-clinica: ok");
