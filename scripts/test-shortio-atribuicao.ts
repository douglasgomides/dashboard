// npx tsx scripts/test-shortio-atribuicao.ts — nomes reais dos clientes (14/10/2026).
import assert from "node:assert/strict";
import { atribuir } from "../api/_lib/shortio-sync";

const clientes = [
  { id: "jp", name: "Dra. Juliana Paola", handles: ["drajulianapaola"], bio: "https://short.gy/jupaola" },
  { id: "jc", name: "Juliana Carrion", handles: ["jucarrionbercht"], bio: null },
  { id: "ln", name: "Lana Torres", handles: ["dralanatorres"], bio: null },
  { id: "sm", name: "Dr. Sergio Maia", handles: ["drsergiomaiajr"], bio: null },
  { id: "ac", name: "Dra. Ana Claudia Alves Pereira", handles: ["draanaclaudiaapereira"], bio: null },
  { id: "ae", name: "Dr. Antônio Eduardo Pereira", handles: ["dr.antonioeduardo"], bio: null },
  { id: "mm", name: "Mariela Muniz", handles: ["marielamunizdermato"], bio: null },
];
const L = (o: Partial<{ titulo: string; caminho: string; tags: string[]; original: string; short: string }>) => ({ titulo: "", caminho: "", tags: [], original: "", short: "https://short.gy/x", ...o });

assert.equal(atribuir(L({ short: "https://short.gy/jupaola" }), clientes)?.como, "bio");
assert.equal(atribuir(L({ short: "https://short.gy/jupaola" }), clientes)?.client_id, "jp");
assert.equal(atribuir(L({ titulo: "Bio Dra Lana Torres - WhatsApp" }), clientes)?.client_id, "ln");
assert.equal(atribuir(L({ caminho: "sergio-maia-consulta" }), clientes)?.client_id, "sm");
assert.equal(atribuir(L({ original: "https://instagram.com/marielamunizdermato" }), clientes)?.como, "handle");
assert.equal(atribuir(L({ titulo: "Juliana Carrion stories" }), clientes)?.client_id, "jc");
// "Juliana" sozinho é ambíguo (duas Julianas): não atribui.
assert.equal(atribuir(L({ titulo: "Juliana bio" }), clientes), null);
// "Pereira" sozinho é ambíguo (Ana Claudia e Antônio Eduardo).
assert.equal(atribuir(L({ titulo: "link pereira" }), clientes), null);
assert.equal(atribuir(L({ titulo: "Ana Claudia glaucoma" }), clientes)?.client_id, "ac");
assert.equal(atribuir(L({ titulo: "Promo Black Friday" }), clientes), null);
console.log("shortio-atribuicao: ok");
