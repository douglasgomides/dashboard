// Cliente exclusivo do Hub (viewer, não admin, sem SAP): as telas do Hub abrem sem erro e nada do SAP aparece.
// Uso igual ao smoke-rotas.mjs (vite na porta 5198 com Supabase simulado): node docs/qa/smoke-hub-only.mjs 375
import { chromium } from "playwright-core";
const BASE = "http://localhost:5198";
const CID = "11111111-1111-1111-1111-111111111111";
const rotasCliente = ["", "/conteudo", "/posts", "/top", "/audiencia", "/duvidas", "/ideias", "/inspiracao", "/anuncios", "/crm-painel", "/crm-guia", "/proximas-acoes", "/campanhas", "/atendimento", "/oportunidades", "/relatorio"].map((r) => `/${CID}${r}`);
const rotasProibidas = ["/sap", `/sap/${CID}`, `/sap/${CID}/cronograma`, "/admin", "/admin/equipe", "/admin/brain", `/${CID}/aquisicao`];
// /jornada some do menu do cliente, mas abre pelo endereço com os dados da própria clínica (o banco permite ao membro).
// Não é vazamento entre clínicas; fica como aviso até a decisão de produto.
const rotasAviso = [`/${CID}/jornada`];
const width = +(process.argv[2] ?? 1280);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width, height: 900 } });
const user = { id: "u-viewer", email: "medico@clinica.com.br", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { first_login_done: true } };
const sessao = { access_token: "x", refresh_token: "y", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
await ctx.addInitScript((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, sessao);
await ctx.route("http://localhost:9/**", async (route) => {
  const u = route.request().url();
  const accept = route.request().headers()["accept"] ?? "";
  if (u.includes("/auth/v1/user")) return route.fulfill({ json: user });
  if (u.includes("/auth/v1/")) return route.fulfill({ json: sessao });
  if (u.includes("/rpc/is_app_admin")) return route.fulfill({ json: false });
  if (u.includes("/rest/v1/client_members")) { const m = { client_id: CID, user_id: "u-viewer", role: "viewer" }; return route.fulfill({ json: accept.includes("vnd.pgrst.object") ? m : [m] }); }
  if (u.includes("/rest/v1/clients")) return route.fulfill({ json: u.includes("id=eq") ? { id: CID, name: "Dra. Hub Exclusivo", specialty: "Dermatologia", instagram_handle: "teste" } : [{ id: CID, name: "Dra. Hub Exclusivo" }], headers: { "content-range": "0-0/1" } });
  if (u.includes("/rest/v1/sap_")) return route.fulfill({ json: accept.includes("vnd.pgrst.object") ? null : [] });
  if (u.includes("/rpc/client_fontes")) return route.fulfill({ json: [{ tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true }] });
  if (u.includes("/rpc/")) return route.fulfill({ json: [] });
  return route.fulfill({ json: accept.includes("vnd.pgrst.object") ? null : [] });
});
const SAP = /Sistema de Aquisi|\bSAP\b|D\d+ de 90|Minhas tarefas|Cronograma/;
let falhas = 0;
async function abrir(r, proibida) {
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.goto(BASE + r + "?preset=30d", { waitUntil: "networkidle" }).catch((e) => errs.push("goto " + e));
  await p.waitForTimeout(600);
  const url = p.url().replace(BASE, "").split("?")[0];
  const texto = await p.evaluate(() => document.body.innerText);
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const vazaSap = SAP.exec(texto)?.[0];
  let ok;
  if (proibida) ok = errs.length === 0 && !url.startsWith(r.split("?")[0]) || (/sem acesso|não tem acesso|sem-acesso/i.test(texto) && !vazaSap);
  else ok = errs.length === 0 && !hscroll && texto.trim().length > 20 && !vazaSap;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FAIL"} ${(proibida ? "[bloq] " : "") + r.replace(CID, ":id")} -> ${url.replace(CID, ":id")}${vazaSap ? " SAP-VISIVEL:" + vazaSap : ""}${hscroll ? " hscroll" : ""}${errs.length ? " ERROS: " + errs.join(" | ") : ""}`);
  await p.close();
}
await abrir("/", false);
for (const r of rotasCliente) await abrir(r, false);
for (const r of rotasProibidas) await abrir(r, true);
for (const r of rotasAviso) { const p = await ctx.newPage(); await p.goto(BASE + r, { waitUntil: "networkidle" }); console.log(`AVISO ${r.replace(CID, ":id")} abre para o cliente pelo endereço -> ${p.url().replace(BASE, "").replace(CID, ":id")}`); await p.close(); }
const total = 1 + rotasCliente.length + rotasProibidas.length;
console.log(`\n${total - falhas}/${total} ok (largura ${width}px)`);
await b.close();
