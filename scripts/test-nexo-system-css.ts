import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Teste estático do sistema visual do Nexo (Phase 3, D-01, 03-UI-SPEC.md §Color e §Movimento).
// Lê as folhas como texto e confere: valores dos tokens Cobalto, nenhum hex fora do bloco de tokens (V9), aliases dos nomes
// antigos, escuro só no SAP (V12), animação só com prefers-reduced-motion: no-preference (V14) e contraste do texto branco
// sobre o degradê de marca (V11).

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");
const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

type Regra = { prelude: string; pais: string[]; corpo: string };
/** Quebra a folha em blocos { }: cada um com o seletor (ou a regra @), os blocos que o contêm e o corpo direto. */
function regras(css: string): Regra[] {
  const s = semComentarios(css);
  const saida: Regra[] = [];
  const pilha: { prelude: string; comeco: number; inicio: number; filhos: [number, number][] }[] = [];
  let ultimo = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") {
      pilha.push({ prelude: s.slice(ultimo, i).trim(), comeco: ultimo, inicio: i + 1, filhos: [] });
      ultimo = i + 1;
    } else if (c === "}") {
      const topo = pilha.pop();
      assert.ok(topo, `chave } sobrando na posição ${i}`);
      // Corpo direto: o texto do bloco sem os blocos filhos.
      let corpo = "";
      let cursor = topo.inicio;
      for (const [a, b] of topo.filhos) {
        corpo += s.slice(cursor, a);
        cursor = b;
      }
      corpo += s.slice(cursor, i);
      saida.push({ prelude: topo.prelude, pais: pilha.map((p) => p.prelude), corpo });
      const pai = pilha.at(-1);
      if (pai) pai.filhos.push([topo.comeco, i + 1]);
      ultimo = i + 1;
    } else if (c === ";") {
      ultimo = i + 1;
    }
  }
  assert.equal(pilha.length, 0, "chave { sem fechar");
  return saida;
}
const normal = (t: string) => t.replace(/\s+/g, " ").replace(/\s*:\s*/g, ":").trim();
const declaracoes = (corpo: string) =>
  new Map(
    corpo
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.includes(":"))
      .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]),
  );

const sistema = await ler("src/styles/nexo-system.css");

// --- 1. Bloco de tokens entre os marcadores ---
const INICIO = "/* tokens: inicio */";
const FIM = "/* tokens: fim */";
const iIni = sistema.indexOf(INICIO);
const iFim = sistema.indexOf(FIM);
assert.ok(iIni >= 0 && iFim > iIni, "nexo-system.css precisa dos marcadores tokens: inicio / tokens: fim, nessa ordem");
assert.equal(sistema.indexOf(INICIO, iIni + 1), -1, "só um marcador tokens: inicio");
const bloco = sistema.slice(iIni + INICIO.length, iFim);
const regrasDoBloco = regras(bloco);
const casca = regrasDoBloco.find((r) => normal(r.prelude) === ".app.product-workspace:not(.sap-workspace)");
assert.ok(casca, "o bloco de tokens declara .app.product-workspace:not(.sap-workspace)");
const tokens = declaracoes(casca.corpo);
const ESPERADO: Record<string, string> = {
  "--b1": "#1F4FD8", "--b2": "#4675F0", "--b3": "#7D9EF6", "--b4": "#B6C9FB", "--b5": "#DCE6FD", "--b6": "#EFF4FF",
  "--white": "#FFFFFF", "--frame": "#F0F2F4", "--field": "#F5F6F8", "--line": "#E8EBEF", "--line-2": "#DDE1E7",
  "--text": "#121212", "--text-2": "#2B2B2D", "--muted-ink": "#5F6570", "--muted-soft": "#8C9099", "--muted-2": "#B4B8BF",
  "--control-border": "#7C808A",
  "--up": "#22B07D", "--up-bg": "#E7F7EF", "--up-ink": "#0B6B4A",
  "--dn": "#EF4B5A", "--dn-bg": "#FDEBED", "--dn-ink": "#B4233A",
  "--or": "#F59E0B", "--or-bg": "#FEF3E2", "--or-ink": "#8A5100",
  "--grad-brand": "linear-gradient(135deg,var(--b1) 0%,var(--b2) 140%)",
  "--grad-tile": "linear-gradient(135deg,var(--b2),var(--b3))",
  "--grad-bar": "linear-gradient(90deg,var(--b2),var(--b3))",
  // Valores claros de hoje que só os blocos escuros de :root trocam (o --ai não muda de cor; Phase 9 revisa).
  "--axis": "#CBD5E1", "--s1": "#2563EB", "--s2": "#EA580C", "--s3": "#0D9488", "--s7": "#7C3AED",
  "--serious": "#C2410C", "--brand-gold-ink": "#84612d", "--ai": "#85632f",
};
for (const [nome, valor] of Object.entries(ESPERADO)) {
  assert.equal(tokens.get(nome)?.replace(/\s+/g, ""), valor.replace(/\s+/g, ""), `token ${nome} deve ser ${valor}`);
}
assert.ok(!/#000\b|#000000\b/i.test(bloco), "o bloco de tokens não tem #000 (sem preto)");
const raiz = regrasDoBloco.find((r) => normal(r.prelude) === ":root");
assert.ok(raiz, "o bloco de tokens declara a rampa em :root (para ::backdrop e html)");
for (const n of ["--b1", "--b2", "--b3", "--b4", "--b5", "--b6"]) {
  assert.equal(declaracoes(raiz.corpo).get(n), ESPERADO[n], `:root ${n}`);
}

// --- 2. Hex só dentro dos marcadores (V9); nexo-*.css sem hex ---
const fora = sistema.slice(0, iIni) + sistema.slice(iFim + FIM.length);
assert.deepEqual(fora.match(HEX) ?? [], [], "nexo-system.css: nenhum hex fora do bloco de tokens");
const folhas = (await readdir(new URL("../src/styles/", import.meta.url))).filter((n) => /^nexo-.*\.css$/.test(n) && n !== "nexo-system.css");
for (const nome of folhas) {
  const css = await ler(`src/styles/${nome}`);
  assert.deepEqual(css.match(HEX) ?? [], [], `src/styles/${nome}: nenhum hex (V9)`);
}

// --- 3. Aliases dos nomes antigos, fora dos marcadores ---
const regrasFora = regras(fora);
const aliases = regrasFora.filter((r) => r.pais.length === 0 && normal(r.prelude) === ".app.product-workspace:not(.sap-workspace)");
assert.ok(aliases.length >= 1, "fora dos marcadores existe o bloco de aliases em .app.product-workspace:not(.sap-workspace)");
const decl = new Map(aliases.flatMap((r) => [...declaracoes(r.corpo)]));
const ALIASES = [
  "--page", "--surface", "--surface-2", "--ink", "--ink-2", "--muted", "--border", "--grid",
  "--accent", "--accent-hover", "--accent-pressed", "--accent-tint", "--accent-ink",
  "--action-bg", "--action-hover", "--action-ink", "--focus", "--good", "--good-text", "--warn", "--crit", "--shadow",
  "--side", "--side-hover", "--side-active", "--side-ink", "--side-ink-2", "--side-muted", "--side-border",
];
for (const n of ALIASES) assert.ok(decl.has(n), `alias ${n} declarado`);
assert.equal(decl.get("color-scheme"), "light", "a casca do Nexo declara color-scheme: light");
assert.equal(decl.get("--page"), "var(--white)");
assert.equal(decl.get("--ink"), "var(--text)");
assert.equal(decl.get("--muted"), "var(--muted-ink)");
assert.equal(decl.get("--accent"), "var(--b1)");
assert.equal(decl.get("--action-bg"), "var(--grad-brand)");
assert.equal(decl.get("--side"), "transparent");
assert.equal(decl.get("--side-active"), "var(--grad-brand)");
// --ai: se aparecer em qualquer ponto da folha, só com o valor claro de hoje.
for (const m of sistema.matchAll(/--ai\s*:\s*([^;}]+)/g)) assert.equal(m[1].trim(), "#85632f", "--ai nunca recebe valor novo");

// --- 4. Escuro só no SAP (V12) ---
for (const arquivo of ["src/styles/product-workspace.css", "src/styles/databoard.css"]) {
  const css = await ler(arquivo);
  for (const r of regras(css)) {
    if (r.prelude.startsWith("@")) continue;
    if (r.pais.some((p) => /@media\s+print/.test(p))) continue;
    const escuroPorMidia = r.pais.some((p) => /prefers-color-scheme\s*:\s*dark/.test(p));
    for (const sel of r.prelude.split(",").map((x) => x.trim())) {
      const escuro = escuroPorMidia || /data-theme\s*=\s*"?dark"?/.test(sel);
      if (!escuro) continue;
      if (!/\.product-workspace|\.dbx/.test(sel)) continue;
      assert.ok(sel.includes("sap-workspace"), `${arquivo}: regra escura fora do SAP: ${sel}`);
    }
  }
}
// O sistema novo não tem variante escura nenhuma.
assert.ok(!/data-theme\s*=\s*"?dark|prefers-color-scheme\s*:\s*dark/.test(semComentarios(sistema)), "nexo-system.css não tem regra escura");

// --- 5. Animação só com prefers-reduced-motion: no-preference (V14) ---
let animacoes = 0;
for (const r of regras(sistema)) {
  const temMovimento = [...declaracoes(r.corpo).keys()].some((k) => /^(animation|transition)(-|$)/.test(k));
  const ehKeyframes = /^@keyframes/.test(r.prelude);
  if (!temMovimento && !ehKeyframes) continue;
  animacoes++;
  const dentro = r.pais.some((p) => /prefers-reduced-motion\s*:\s*no-preference/.test(p));
  assert.ok(dentro, `animação ou transição fora de @media (prefers-reduced-motion: no-preference): ${normal(r.prelude)}`);
}
assert.ok(animacoes >= 1, "nexo-system.css declara o movimento do UI-SPEC (subida dos cartões e barras)");

// --- 6. Contraste do texto branco sobre a marca (V11), pela fórmula WCAG 2.x ---
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razao = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const branco = rgb(tokens.get("--white")!);
const b1 = rgb(tokens.get("--b1")!);
const b2 = rgb(tokens.get("--b2")!);
assert.ok(Math.abs(razao(branco, b1) - 6.63) <= 0.01, `branco sobre --b1 = ${razao(branco, b1).toFixed(3)} (esperado 6,63)`);
const grad = tokens.get("--grad-brand")!.replace(/\s+/g, "");
const paradas = /var\(--b1\)(\d+)%,var\(--b2\)(\d+)%/.exec(grad);
assert.ok(paradas, "--grad-brand vai de --b1 a --b2 com paradas em %");
const [p0, p1] = [Number(paradas[1]), Number(paradas[2])];
// Cor visível do degradê no ponto p% (0 a 100) da caixa; mistura em sRGB como o navegador faz.
const corEm = (p: number) => {
  const t = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
  return b1.map((v, i) => Math.round(v + (b2[i] - v) * t));
};
for (const p of [0, 50, 100]) {
  const r = razao(branco, corEm(p));
  assert.ok(r >= 4.5, `branco sobre --grad-brand em ${p}% = ${r.toFixed(2)} (mínimo 4,5)`);
}

console.log("test-nexo-system-css: ok");
