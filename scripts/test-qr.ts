import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gerarQr, qrSvg } from "../src/lib/qr";

// Referência gerada uma vez com outra implementação (python qrcode 8.2, correção M, modo byte, máscara fixa) e guardada em
// scripts/fixtures/qr-referencia.json. Cada módulo precisa bater: um QR errado não abre na câmera.
const ref = JSON.parse(readFileSync(new URL("./fixtures/qr-referencia.json", import.meta.url), "utf8")) as { texto: string; mascara: number; versao: number; linhas: string[] }[];
for (const c of ref) {
  const q = gerarQr(c.texto, c.mascara);
  assert.equal(q.versao, c.versao, `versão de ${c.texto}`);
  assert.deepEqual(q.modulos.map((l) => l.map((x) => (x ? "1" : "0")).join("")), c.linhas, `módulos de ${c.texto}`);
}
// Sem máscara fixa escolhe uma das 8 e continua válido.
const auto = gerarQr("https://dash.doctorcreator.com.br/r/juliana-bio");
assert.ok(auto.mascara >= 0 && auto.mascara < 8);
const svg = qrSvg("https://dash.doctorcreator.com.br/r/juliana-bio");
assert.ok(svg.startsWith("<svg") && svg.includes('fill="#fff"') && svg.includes("<path"));
assert.throws(() => gerarQr("x".repeat(200)), /longo/);
console.log("qr: ok");
