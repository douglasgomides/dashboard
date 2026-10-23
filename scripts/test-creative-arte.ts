import assert from "node:assert/strict";
import { promptArte, slidesPedidos, reservaArte, custoArte } from "../src/lib/creative-intelligence/arte";

const u = { position: 2, copy: "Corpo do slide", image_brief: "Mulher dormindo tranquila", layout_brief: "Título no topo", on_screen_text: "Insônia na menopausa", narrative_role: "Gancho" };
const p = promptArte(u, { tema: "sono no climatério", total: 9 });
assert.ok(p.includes("Slide 2 de 9"));
assert.ok(!p.includes(u.copy) && !p.includes(u.image_brief) && !p.includes(u.on_screen_text), "AI receives no copy or untrusted portrait brief to draw");
assert.match(p, /Não inclua texto, letras, números/);
assert.match(p, /pessoas, rostos, retratos/);
assert.match(p, /1024 por 1536/);
assert.ok(reservaArte(p, "medium") > 0.063);
assert.equal(custoArte({ input_tokens: 1000, output_tokens: 1000 }, 1), 0.045);
assert.equal(custoArte(null, 0.08), 0.08);
assert.equal(custoArte({ input_tokens: -1, output_tokens: 0 }, 0.08), 0.08);

const unidades = [1, 2, 3].map((position) => ({ position }));
assert.deepEqual(slidesPedidos(unidades), [1, 2, 3]);
assert.deepEqual(slidesPedidos(unidades, [3, 3, 9, "2"]), [2, 3]);
assert.deepEqual(slidesPedidos(Array.from({ length: 20 }, (_, i) => ({ position: i + 1 }))).length, 12);
console.log("creative-arte ok");
