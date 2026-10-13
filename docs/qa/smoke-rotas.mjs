// Teste de fumaça: abre as 25 rotas com Supabase simulado e acusa erro de console e rolagem lateral.
// Uso: suba o app com VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=x npx vite --port 5198,
// instale playwright-core fora do projeto e rode: node docs/qa/smoke-rotas.mjs 375  (ou 1280).
// Abre cada rota com Supabase simulado (sessão de admin, respostas vazias) e registra erros.
import { chromium } from "playwright-core";
const BASE = "http://localhost:5198";
const CID = "11111111-1111-1111-1111-111111111111";
const rotas = ["", "/conteudo", "/posts", "/top", "/audiencia", "/duvidas", "/ideias", "/inspiracao", "/anuncios", "/crm-painel", "/atendimento", "/jornada", "/oportunidades", "/relatorio", "/analisar", "/conversas", "/crm-estrutura", "/vendas-kommo", "/vendas", "/consultas", "/automacoes"].map((r) => `/${CID}${r}`)
  .concat(["/admin", `/admin/${CID}`, "/admin/conferencia", "/admin/referencia"]);
const width = +(process.argv[2] ?? 1280);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width, height: 900 } });
const user = { id: "u1", email: "qa@doctorcreator.com.br", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const sessao = { access_token: "x", refresh_token: "y", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
await ctx.addInitScript((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, sessao);
await ctx.route("http://localhost:9/**", async (route) => {
  const u = route.request().url();
  if (u.includes("/auth/v1/user")) return route.fulfill({ json: user });
  if (u.includes("/auth/v1/")) return route.fulfill({ json: sessao });
  if (u.includes("/rpc/is_app_admin")) return route.fulfill({ json: true });
  if (u.includes("/rest/v1/clients")) return route.fulfill({ json: u.includes("id=eq") ? { id: CID, name: "Cliente Teste", specialty: "Dermatologia", instagram_handle: "teste" } : [{ id: CID, name: "Cliente Teste" }], headers: { "content-range": "0-0/1" } });
  if (u.includes("/rpc/client_fontes")) return route.fulfill({ json: [{ tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true }] });
  if (u.includes("/rpc/")) return route.fulfill({ json: [] });
  const accept = route.request().headers()["accept"] ?? "";
  return route.fulfill({ json: accept.includes("vnd.pgrst.object") ? null : [] });
});
let falhas = 0;
for (const r of rotas) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(BASE + r + "?preset=30d", { waitUntil: "networkidle" }).catch((e) => errs.push("goto " + e));
  await p.waitForTimeout(500);
  const url = p.url().replace(BASE, "");
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const temTexto = await p.evaluate(() => document.body.innerText.trim().length);
  const ok = errs.length === 0 && !hscroll && temTexto > 20;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.replace(CID, ":id").padEnd(26)} -> ${url.replace(CID, ":id").split("?")[0].padEnd(24)} texto=${temTexto} hscroll=${hscroll}${errs.length ? " ERROS: " + errs.join(" | ") : ""}`);
  await p.close();
}
console.log(`\n${rotas.length - falhas}/${rotas.length} rotas sem erro (largura ${width}px)`);
await b.close();
