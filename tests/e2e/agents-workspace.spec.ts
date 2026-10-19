import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { CID, mockAccount } from "./fixtures";
import type { PecaConteudo } from "../../src/lib/agentes-sugestoes";

const ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date().toISOString();
const peca = { formato: "reels", titulo: "Como se preparar para uma consulta", objetivo: "salvamento", gancho: "O que levar na primeira consulta?", cenas: [{ fala: "Leve sua lista de dúvidas para conversar com o médico.", visual: "Médico em consultório", tela: "Prepare suas dúvidas" }], slides: [], legenda: "Prepare as perguntas antes da consulta.", cta: "Salve para consultar depois.", hashtags: [], evidencias: ["Dúvida recorrente nos comentários da clínica de teste."], brain: [], por_que: "Responder a uma dúvida do público." } satisfies PecaConteudo;

async function center(context: BrowserContext, profile: "admin" | "viewer", options: { failedCount?: boolean; failedPlanner?: boolean; running?: boolean; empty?: boolean } = {}) {
  await mockAccount(context, profile);
  let estado = "proposta";
  let preparada = false;
  const escritas: { path: string; body: Record<string, any> }[] = [];
  const pautas: Record<string, unknown>[] = [];
  const leituras: string[] = [];
  await context.route("**/rest/v1/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    leituras.push(`${req.method()} ${path}?${url.searchParams}`);
    const responder = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/rest/v1/cliente_modulos") return responder([{ modulo: "hub", status: "ativo" }, { modulo: "brand_brain", status: "ativo" }]);
    if (path === "/rest/v1/agente_execucoes") return responder({ id: ID, estado: options.running ? "rodando" : "concluida", criado_em: NOW, atualizado_em: NOW, resultado: preparada ? { pecas: 1 } : { pecas: 0, motivo: "Pouco dado ainda (Brain, Instagram ou conversas)." } });
    if (["/rest/v1/sugestoes_agentes", "/rest/v1/campanhas_ideias", "/rest/v1/brain_itens"].includes(path) && req.method() === "HEAD") {
      if (options.failedCount && url.searchParams.get("agente") === "eq.anuncios") return responder({ message: "source unavailable" }, 503);
      const count = path.endsWith("sugestoes_agentes") && url.searchParams.get("agente") === "eq.conteudo" && estado === "proposta" && !options.empty ? 1 : 0;
      return route.fulfill({ headers: { "content-range": `*/${count}`, "access-control-expose-headers": "content-range" } });
    }
    if (path === "/rest/v1/sugestoes_agentes") {
      if (url.searchParams.get("select") === "criado_em") return responder(options.empty ? null : { criado_em: NOW });
      return responder(url.searchParams.get("agente") === "eq.conteudo" && !options.empty ? [{ id: ID, client_id: CID, agente: "conteudo", tipo: "reels", titulo: peca.titulo, conteudo: peca, estado, criado_em: NOW, evidencias: [], brain: [] }] : []);
    }
    if (path === "/rest/v1/pautas_conteudo") {
      if (req.method() === "POST") {
        const body = req.postDataJSON(); escritas.push({ path, body });
        if (options.failedPlanner) return responder({ message: "write unavailable" }, 503);
        pautas.push({ ...body, id: ID, criado_em: NOW }); return responder(null, 201);
      }
      return responder(pautas);
    }
    if (path === "/rest/v1/rpc/sugestao_decidir") { const body = req.postDataJSON(); escritas.push({ path, body }); estado = body.p_estado; return responder(null); }
    if (path === "/rest/v1/rpc/agentes_iniciar") { escritas.push({ path, body: req.postDataJSON() }); return responder(ID); }
    return route.fallback();
  });
  await context.route("**/api/sync/manual", async (route) => {
    escritas.push({ path: "/api/sync/manual", body: route.request().postDataJSON() }); preparada = true;
    return route.fulfill({ json: { execucoes: [{ id: ID, estado: "concluida" }] } });
  });
  return { escritas, pautas, leituras };
}

for (const width of [375, 1440]) test(`agent workspace explains the cycle and gives a real script to a viewer at ${width}px`, async ({ page, context }) => {
  const api = await center(context, "viewer");
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/${CID}/agentes?preset=7d`);
  await expect(page.getByRole("heading", { name: "Qual problema precisa avançar agora?" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Como o trabalho dos agentes funciona" })).toBeVisible();
  const choices = page.getByRole("group", { name: "Escolher o problema da clínica" });
  await expect(choices.getByRole("button")).toHaveCount(4);
  await expect(choices.getByRole("button", { name: /Saber o que produzir/ })).toContainText("1 para revisar");
  await expect(page.getByRole("button", { name: "Preparar roteiros agora", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Levar ao planejador", exact: true })).toHaveCount(0);
  const delivery = page.getByRole("region", { name: "Área de revisão das entregas" });
  await delivery.getByRole("button", { name: "Ver roteiro e legenda", exact: true }).click();
  await expect(delivery.getByText(peca.cenas[0].fala, { exact: true })).toBeVisible();
  await choices.getByRole("button", { name: /Retomar contatos/ }).click();
  await expect(page).toHaveURL(/agente=recuperacao/);
  await page.reload();
  await expect(choices.getByRole("button", { name: /Retomar contatos/ })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(choices.getByRole("button", { name: /Saber o que produzir/ })).toHaveAttribute("aria-pressed", "true");
  expect(api.escritas).toEqual([]);
  expect(api.leituras.some((r) => /\/(agente_execucoes|brain_itens)\?/.test(r))).toBe(false);
  expect(api.leituras.some((r) => r.includes("operacao=is.null"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const audit = await new AxeBuilder({ page }).include(".agent-workspace").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(audit.violations).toEqual([]);
  const out = new URL("../../../../outputs/", import.meta.url).pathname;
  await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}agentes-trabalho-${width}.png`, fullPage: true });
});

test("admin can use an existing script in the planner exactly once, and the review queue updates", async ({ page, context }) => {
  const api = await center(context, "admin");
  await page.goto(`/${CID}/agentes?agente=conteudo`);
  await expect(page.getByText("Rodada concluída sem novas entregas", { exact: true })).toBeVisible();
  await expect(page.getByText("Pouco dado ainda (Brain, Instagram ou conversas).", { exact: true })).toBeVisible();
  const transfer = page.getByRole("button", { name: "Levar ao planejador", exact: true });
  await transfer.dblclick();
  await expect.poll(() => api.pautas.length).toBe(1);
  await expect(page.getByRole("status").filter({ hasText: "Roteiro salvo no planejador." })).toBeVisible();
  await expect(page.getByRole("group", { name: "Escolher o problema da clínica" }).getByRole("button", { name: /Saber o que produzir/ })).toContainText("0 para revisar");
  expect(api.pautas[0]).toMatchObject({ client_id: CID, ideia_id: `agente:${ID}`, titulo: peca.titulo, status: "escolhida" });
  expect(api.escritas.filter((r) => r.path.endsWith("sugestao_decidir"))).toHaveLength(1);
  await page.getByRole("link", { name: "Abrir o planejador da semana" }).click();
  await expect(page).toHaveURL(/visao=semana/);
  await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toContainText(peca.titulo);
});

test("planner failure preserves the proposal and does not mark it as done", async ({ page, context }) => {
  const api = await center(context, "admin", { failedPlanner: true });
  await page.goto(`/${CID}/agentes`);
  await page.getByRole("button", { name: "Levar ao planejador", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível salvar o roteiro no planejador");
  expect(api.pautas).toHaveLength(0);
  expect(api.escritas.some((r) => r.path.endsWith("sugestao_decidir"))).toBe(false);
  await expect(page.getByRole("heading", { name: peca.titulo, exact: true })).toBeVisible();
});

test("one failed source stays unknown while another agent still works and retries explicitly", async ({ page, context }) => {
  const options = { failedCount: true };
  await center(context, "admin", options);
  await page.goto(`/${CID}/agentes?agente=anuncios`);
  await expect(page.getByRole("group", { name: "Escolher o problema da clínica" }).getByRole("button", { name: /Decidir o que revisar/ })).toContainText("Não conferido");
  await expect(page.getByRole("alert")).toContainText("Estado indisponível");
  await expect(page.getByRole("button", { name: "Analisar anúncios agora", exact: true })).toBeDisabled();
  options.failedCount = false;
  await page.locator(".agent-live-status").getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analisar anúncios agora", exact: true })).toBeEnabled();
  await page.getByRole("group", { name: "Escolher o problema da clínica" }).getByRole("button", { name: /Saber o que produzir/ }).click();
  await expect(page.getByRole("heading", { name: peca.titulo, exact: true })).toBeVisible();
});

test("a paused module keeps its previous deliveries visible and blocks a new preparation", async ({ page, context }) => {
  const api = await center(context, "admin");
  await context.route("**/rest/v1/cliente_modulos*", (r) => r.fulfill({ json: [{ modulo: "hub", status: "pausado" }] }));
  await page.goto(`/${CID}/agentes`);
  await expect(page.getByText("Módulo pausado ou encerrado", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preparar roteiros agora", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: peca.titulo, exact: true })).toBeVisible();
  expect(api.escritas).toEqual([]);
});

test("the review queue opens the selected delivery rather than leaving the user in the catalogue", async ({ page, context }) => {
  await center(context, "viewer");
  await page.goto(`/${CID}/agentes?agente=anuncios`);
  await page.getByRole("region", { name: "Entregas para revisar", exact: true }).getByRole("button", { name: /Roteirista/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("agente")).toBe("conteudo");
  expect(new URL(page.url()).hash).toBe("#agent-review-workspace");
  await expect(page.getByRole("region", { name: "Área de revisão das entregas" })).toContainText(peca.titulo);
});

test("preparation is explicit, scoped to the clinic, and an existing run prevents another request", async ({ page, context }) => {
  const api = await center(context, "admin", { empty: true });
  await page.goto(`/${CID}/agentes?agente=conteudo`);
  const prepare = page.getByRole("button", { name: "Preparar roteiros agora", exact: true });
  await expect(prepare).toBeEnabled(); expect(api.escritas).toEqual([]);
  await prepare.click();
  await expect.poll(() => api.escritas.filter((r) => r.path === "/api/sync/manual").length).toBe(1);
  expect(api.escritas.find((r) => r.path.endsWith("agentes_iniciar"))?.body).toMatchObject({ p_client_id: CID, p_fluxo: "conteudo_semana" });
  await expect(page.getByText("1 entrega registrada nesta rodada. Revise o material antes de executar.", { exact: true })).toBeVisible();
  await context.route("**/rest/v1/agente_execucoes*", (r) => r.fulfill({ json: { id: ID, estado: "rodando", criado_em: NOW, atualizado_em: NOW, resultado: null } }));
  await page.reload();
  await expect(prepare).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Preparando a entrega", exact: true })).toBeVisible();
});

test("SAP never shows recovery work or the Nexo shadow pilot even with a forged selection", async ({ page, context }) => {
  const api = await center(context, "admin");
  await page.goto(`/sap/${CID}/agentes?agente=recuperacao`);
  const choices = page.getByRole("group", { name: "Escolher o problema da clínica" });
  await expect(choices.getByRole("button")).toHaveCount(3);
  await expect(choices.getByRole("button", { name: /Saber o que produzir/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Teste de atendimento: avaliar respostas sem enviar ao paciente", { exact: true })).toHaveCount(0);
  expect(api.leituras.some((r) => r.includes("agente=eq.recuperacao"))).toBe(false);
});
