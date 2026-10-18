// Roda todos os testes (scripts/test-*.ts) e falha se algum falhar. Usado pelo CI e por `npm test`.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const testes = readdirSync("scripts").filter((f) => /^test-.*\.ts$/.test(f)).sort();
const falhas = [];
for (const t of testes) {
  const r = spawnSync("npx", ["tsx", `scripts/${t}`], { encoding: "utf8" });
  if (r.status !== 0) { falhas.push(t); console.error(`FALHOU ${t}\n${(r.stderr || r.stdout).slice(-2000)}`); }
}
console.log(`${testes.length - falhas.length} de ${testes.length} testes passaram.`);
process.exit(falhas.length ? 1 : 0);
