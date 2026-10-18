import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = (await readdir(new URL(".", import.meta.url))).filter((name) => /^test-.*\.ts$/.test(name)).sort();
let failures = 0;
for (const file of files) {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "./scripts/test-network-guard.mjs", "--import", "tsx", `scripts/${file}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const capture = (chunk) => { output = (output + chunk).slice(-24_000); };
    child.stdout.on("data", capture); child.stderr.on("data", capture);
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 120_000);
    child.on("error", (error) => { clearTimeout(timeout); resolve({ code: 1, output: error.message }); });
    child.on("exit", (code) => { clearTimeout(timeout); resolve({ code, output: timedOut ? `Timeout after 120s\n${output}` : output }); });
  });
  if (result.code !== 0) { failures++; console.error(`FAIL ${file}\n${result.output}`); }
  else console.log(`PASS ${file}`);
}
console.log(`${files.length - failures}/${files.length} test scripts passed`);
process.exitCode = failures ? 1 : 0;
