import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Exercise plain Node's emitted ESM resolution: tsx and Vite accept extensionless
// imports that Vercel's Node runtime rejects before an API handler can start.
const root = process.cwd();
const out = mkdtempSync(join(tmpdir(), "nexo-api-node-"));
const seen = new Set<string>();
function emit(path: string) {
  path = resolve(path);
  if (seen.has(path)) return;
  seen.add(path);
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const dependencies: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
      if (!typeOnly) dependencies.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const specifier of dependencies) {
    if (!specifier.startsWith(".")) continue;
    let target = resolve(dirname(path), specifier);
    if (extname(target) === ".js") target = target.slice(0, -3) + ".ts";
    else if (!extname(target)) target += ".ts";
    if (existsSync(target) && target.endsWith(".ts")) emit(target);
  }
  const output = join(out, relative(root, path).replace(/\.ts$/, ".js"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
try {
  writeFileSync(join(out, "package.json"), '{"type":"module"}');
  symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "dir");
  emit(join(root, "api/sync/manual.ts"));
  const entry = pathToFileURL(join(out, "api/sync/manual.js")).href;
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(entry)}); if(typeof m.default !== "function") throw new Error("Missing API handler"); console.log("API_NODE_OK");`], { encoding: "utf8", timeout: 30_000, env: { ...process.env, NODE_OPTIONS: "" } });
  assert.match(result, /API_NODE_OK/);
  console.log(`Plain Node loaded the API and ${seen.size} source dependencies.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
