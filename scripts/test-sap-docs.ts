import assert from "node:assert/strict";
import { DOC, DOCS, dividirCodigos } from "../src/lib/sap-docs";

assert.equal(DOC.get("02.06")!.nome, "Ficha do Cliente");
assert.ok(DOC.get("05.03")!.url);
assert.equal(DOC.get("A1")!.tipo, "acesso");
assert.equal(DOC.get("V15")!.tipo, "vazamento");
// Pedaços: código solto, código entre parênteses e seção; "D1" solto não vira código.
const p = dividirCodigos("Ver 01.02 §5 e a Ficha do Cliente (02.06). No D1, o item (A6) e o V15.");
const cods = p.filter((x) => "codigo" in x).map((x) => ("codigo" in x ? `${x.codigo}${x.secao ? x.secao : ""}${x.entreParenteses ? "()" : ""}` : ""));
assert.deepEqual(cods, ["01.02§5", "02.06()", "A6()", "V15"]);
assert.ok(DOCS.length > 90);
console.log("ok sap-docs");
