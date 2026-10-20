/**
 * Compara a impressão digital do esquema remontado do repositório (remontar.ts) com a de um banco real
 * (catalogo.sql via psql, saída JSON). Imprime um resumo em Markdown e sai com código 1 se houver diferença.
 * Uso: npx tsx scripts/banco/comparar.ts repo.json banco.json
 */
import { readFileSync } from "node:fs";

type Linha = { tipo: string; nome: string; assinatura: string };
const ler = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Linha[];
const [repoArq, bancoArq] = process.argv.slice(2);
const repo = new Map(ler(repoArq).map((l) => [`${l.tipo}:${l.nome}`, l.assinatura]));
const banco = new Map(ler(bancoArq).map((l) => [`${l.tipo}:${l.nome}`, l.assinatura]));

// Staging do FlwChat existe só onde a carga antiga rodou (20261001130000 protege sem recriar a estrutura) e
// _migracoes_repo é o registro criado por aplicar.sh. Continuam conferidos quanto a RLS, mas não contam como falta.
const SO_NO_BANCO_ESPERADO = /^[a-z]+:(_flw_|_migracoes_repo)/;
const soBanco = [...banco.keys()].filter((k) => !repo.has(k) && !SO_NO_BANCO_ESPERADO.test(k)).sort();
const soRepo = [...repo.keys()].filter((k) => !banco.has(k)).sort();
const diferentes = [...repo.keys()].filter((k) => banco.has(k) && banco.get(k) !== repo.get(k)).sort();
const semRls = [...banco.entries()].filter(([k, a]) => k.startsWith("tabela:") && a.endsWith("SEM_RLS")).map(([k]) => k);

const linhas = ["## Conferência do esquema (repositório × banco)", ""];
if (!soBanco.length && !soRepo.length && !diferentes.length && !semRls.length) {
  linhas.push("Nenhuma diferença: o banco é exatamente o que as migrações do repositório produzem.");
} else {
  if (semRls.length) linhas.push(`### Tabelas SEM proteção por linha (RLS) no banco: ${semRls.length}`, ...semRls.map((k) => `- ${k}`), "");
  if (soBanco.length) linhas.push(`### Só existem no banco (faltam no repositório): ${soBanco.length}`, ...soBanco.map((k) => `- ${k}`), "");
  if (soRepo.length) linhas.push(`### Só existem no repositório (não aplicados no banco): ${soRepo.length}`, ...soRepo.map((k) => `- ${k}`), "");
  if (diferentes.length) linhas.push(`### Diferentes: ${diferentes.length}`, ...diferentes.map((k) => `- ${k}: repositório \`${repo.get(k)}\` × banco \`${banco.get(k)}\``), "");
}
process.stdout.write(linhas.join("\n") + "\n");
process.exitCode = soBanco.length || soRepo.length || diferentes.length || semRls.length ? 1 : 0;
