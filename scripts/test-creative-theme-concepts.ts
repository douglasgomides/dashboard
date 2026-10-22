import assert from "node:assert/strict";
import { missingThemeConcepts } from "../src/lib/creative-intelligence/theme";
const concepts = [{ concept: "agências", terms: ["agência", "agências"] }, { concept: "Instagram", terms: ["Instagram"] }];
const oldCopy = [{ copy: "Se eu fosse médico e começasse meu perfil no Instagram do zero, não postaria todos os dias." }];
assert.deepEqual(missingThemeConcepts(oldCopy, concepts), ["agências"], "the actual failed proposal cannot pass based on the title or on a permissive model review");
assert.deepEqual(missingThemeConcepts([{ copy: "Escolha uma AGÊNCIA que entenda Instagram médico." }], concepts), []);
assert.deepEqual(missingThemeConcepts([{ copy: "Agências especializadas fazem a estratégia no Instagram." }], concepts), []);
assert.deepEqual(missingThemeConcepts([{ copy: "Um efeito sonoro" }], [{ concept: "sono", terms: ["sono"] }]), ["sono"], "substring coincidences do not prove a theme");
console.log("ok creative-theme-concepts (regressão real: agências ausentes dos slides, normalização de acentos/plural e limites de palavras)");
