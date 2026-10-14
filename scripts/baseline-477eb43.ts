// Carrega o código ORIGINAL do commit 477eb43 (antes da triagem nova) direto do git, para os testes
// compararem a "detecção original" restaurada com a lógica de antes, linha por linha.
// Uso: const b = await carregarBaseline(); b.comentarios.filtrarPerguntas(...), b.metrics.computeDuvidasFrequentes(...),
// b.conteudo.buildIdeias(...).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASELINE = "477eb43";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const BASE_LIB = ["comentarios", "report-metrics", "hub-conteudo"];

function doGit(caminho: string): string {
  return execFileSync("git", ["show", `${BASELINE}:${caminho}`], { cwd: RAIZ, encoding: "utf8" });
}

export async function carregarBaseline() {
  const dir = mkdtempSync(join(tmpdir(), "baseline-477eb43-"));
  for (const nome of BASE_LIB) {
    // Imports "@/lib/x": os 3 arquivos acima vêm do baseline; o resto (methodology, tipos) do código atual,
    // que não mudou no que esses arquivos usam (fmtFormatKey, median, formatLabel).
    const src = doGit(`src/lib/${nome}.ts`).replace(/from "@\/([^"]+)"/g, (_m, p: string) => {
      const base = p.replace(/^lib\//, "");
      if (p.startsWith("lib/") && BASE_LIB.includes(base)) return `from "./${base}"`;
      return `from "${pathToFileURL(join(RAIZ, "src", p)).href}"`;
    });
    writeFileSync(join(dir, `${nome}.ts`), src);
  }
  const imp = (n: string) => import(pathToFileURL(join(dir, `${n}.ts`)).href);
  const [comentarios, metrics, conteudo] = await Promise.all([imp("comentarios"), imp("report-metrics"), imp("hub-conteudo")]);
  return { dir, comentarios, metrics, conteudo } as {
    dir: string;
    comentarios: {
      categoriaDoComentario: (t: string, a?: string | null, d?: string[]) => string;
      filtrarPerguntas: <T extends { text: string; author_username?: string | null }>(rows: T[], donos?: string[]) => T[];
    };
    metrics: {
      computeDuvidasFrequentes: <T extends { id: string; text: string; like_count: number | null }>(
        q: T[],
        o?: { threshold?: number; minSize?: number },
      ) => { count: number; representative: T; items: T[] }[];
    };
    conteudo: {
      buildIdeias: (posts: any[], perguntas: any[]) => { ideias: any[]; faltas: string[]; totalPosts: number; totalPerguntas: number };
      ideiaParaTexto: (i: any) => string;
    };
  };
}
