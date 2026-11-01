/**
 * Rotina diária (servidor, fora do CI): roda todos os scripts/test-contrato-*.ts no modo ao vivo e junta o resultado.
 *
 *   CONTRATO_META_TOKEN=... CONTRATO_META_IG_ID=... (demais variáveis em docs/apis/README.md) npm run contrato:ao-vivo
 *
 * Só GET; nunca imprime token, URL com query ou corpo. Sai com código 1 se alguma API mudou de formato ou falhou,
 * para o agendador abrir o alerta "a API X mudou o formato", separado do alerta de dado. API sem variável de
 * ambiente aparece como NÃO CONFERIDO (não falha a rotina, mas não conta como conferida).
 * Opcional: CONTRATO_SAIDA_JSON=<arquivo> grava o resumo (sem valores) para a tabela de confiabilidade.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.CI) {
  console.log("contrato ao vivo: não roda no CI");
  process.exit(0);
}
const raiz = fileURLToPath(new URL("../..", import.meta.url));
const so = (process.env.CONTRATO_SO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const arquivos = readdirSync(`${raiz}scripts`)
  .filter((f) => /^test-contrato-.+\.ts$/.test(f) && f !== "test-contrato-comum.ts")
  .filter((f) => !so.length || so.includes(f.replace(/^test-contrato-|\.ts$/g, "")))
  .sort();

type Resultado = { api: string; ok: boolean; situacao: "ok" | "nao_conferido" | "mudou_ou_falhou"; conferidos: number; diferencas: number; erros: number; pulados: number };
const resultados: Resultado[] = [];
for (const f of arquivos) {
  const r = spawnSync(process.execPath, ["--import", "tsx", `scripts/${f}`], {
    cwd: raiz,
    env: { ...process.env, CONTRATO_AO_VIVO: "1" },
    encoding: "utf8",
    timeout: 180_000,
  });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // A saída de cada script já vem sem valores (ver contrato/comum.ts).
  process.stdout.write(saida.split("\n").filter((l) => !l.startsWith("CONTRATO_RESULTADO ")).join("\n"));
  const linha = saida.split("\n").find((l) => l.startsWith("CONTRATO_RESULTADO "));
  const api = f.replace(/^test-contrato-|\.ts$/g, "");
  if (!linha) resultados.push({ api, ok: false, situacao: "mudou_ou_falhou", conferidos: 0, diferencas: 0, erros: 1, pulados: 0 });
  else resultados.push(JSON.parse(linha.slice("CONTRATO_RESULTADO ".length)) as Resultado);
}

console.log("\nResumo dos contratos ao vivo:");
const rotulo = { ok: "ok           ", nao_conferido: "NÃO CONFERIDO", mudou_ou_falhou: "MUDOU/FALHOU " } as const;
for (const r of resultados) console.log(`  ${rotulo[r.situacao]} ${r.api}: ${r.conferidos} conferido(s), ${r.diferencas} diferença(s), ${r.erros} erro(s), ${r.pulados} pulado(s)`);
if (process.env.CONTRATO_SAIDA_JSON) writeFileSync(process.env.CONTRATO_SAIDA_JSON, JSON.stringify({ em: new Date().toISOString(), resultados }, null, 2));
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
