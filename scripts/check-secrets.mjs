import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Source ZIPs have no Git metadata. Keep the same check usable after export.
const excluded = new Set([".git", "node_modules", "dist", ".tanstack", "playwright-report", "test-results"]);
async function walk(directory = "") {
  const files = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
let paths;
try {
  paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
} catch { paths = await walk(); }
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bsk-(?:proj-|ant-api\d+-)[A-Za-z0-9_-]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
const failures = [];
for (const path of paths) {
  const buffer = await readFile(join(root, path));
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const [i, line] of text.split("\n").entries()) {
    let found = patterns.some((pattern) => pattern.test(line));
    for (const token of line.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      try { if (JSON.parse(Buffer.from(token[1], "base64url").toString()).role === "service_role") found = true; } catch { /* not a JWT */ }
    }
    if (found) failures.push(`${path}:${i + 1}`);
  }
}
if (failures.length) { console.error(`Possible secrets (values omitted):\n${failures.join("\n")}`); process.exitCode = 1; }
else console.log(`Secret check passed (${paths.length} files; heuristic, current tree only)`);
