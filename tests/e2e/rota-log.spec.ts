import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Caminho do log por rota: navegador -> POST /rest/v1/rota_acessos. O bundle do e2e é construído com o Supabase
// falso (http://localhost:9), então a chave de ligar só vale aqui.
const ROTA_ACESSOS = "http://localhost:9/rest/v1/rota_acessos";

type Post = { corpo: Record<string, unknown>; texto: string; prefer: string };

async function ligarLog(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("nexo:rota-log", "1"));
}

function capturarPosts(page: Page): Post[] {
  const posts: Post[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== "/rest/v1/rota_acessos") return;
    posts.push({ corpo: request.postDataJSON(), texto: request.postData() ?? "", prefer: request.headers()["prefer"] ?? "" });
  });
  return posts;
}

// Segunda navegação dentro do app (clique no menu lateral), nunca page.goto: recarregar zeraria o estado do módulo.
async function irParaOutraTelaPeloMenu(page: Page) {
  const atual = new URL(page.url()).pathname;
  const links = page.locator('aside[aria-label="Menu principal"] a[href^="/"]');
  await expect(links.first()).toBeVisible();
  const destinos = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  const indice = destinos.findIndex((href) => new URL(href, "http://x").pathname !== atual);
  expect(indice, "o menu lateral precisa ter um link para outra tela").toBeGreaterThanOrEqual(0);
  await links.nth(indice).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(atual);
}

test("viewer abre a tela da clínica e sai um POST com só client_id, origem, rota e sessao", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  expect(posts).toHaveLength(1);
  const [post] = posts;
  expect(Object.keys(post.corpo).sort()).toEqual(["client_id", "origem", "rota", "sessao"]);
  expect(post.corpo.client_id).toBe(CID);
  expect(post.corpo.rota).toBe("/_authenticated/$clientId/");
  expect(post.corpo.origem).toBe("direto");
  expect(String(post.corpo.sessao).length).toBeGreaterThanOrEqual(8);
  expect(String(post.corpo.sessao).length).toBeLessThanOrEqual(64);
  expect(post.prefer).not.toContain("return=representation");
});

test("query string e hash da URL nunca saem no corpo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.goto(`/${CID}?x=1#y`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  for (const post of posts) {
    expect(post.texto).not.toContain("?");
    expect(post.texto).not.toContain("#");
    expect(post.texto).not.toContain("x=1");
    expect(post.texto).not.toContain("http");
    expect(post.corpo.rota).toBe("/_authenticated/$clientId/");
  }
});

test("admin abre /admin/conferencia e a linha vai sem clínica", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.goto("/admin/conferencia");
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  const linha = posts.find((post) => post.corpo.rota === "/_authenticated/admin/conferencia");
  expect(linha, "linha da conferência").toBeTruthy();
  expect(linha!.corpo.client_id).toBeNull();
  expect(Object.keys(linha!.corpo).sort()).toEqual(["client_id", "origem", "rota", "sessao"]);
});

test("sem a chave de ligar em 127.0.0.1 nada é enviado", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  const posts = capturarPosts(page);
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await page.waitForTimeout(3000);
  expect(posts).toHaveLength(0);
});

test("POST respondendo 500 não trava a tela nem gera pageerror", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  await context.route(ROTA_ACESSOS, (route) => route.fulfill({ status: 500, json: { message: "falha simulada" } }));
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  await irParaOutraTelaPeloMenu(page);
  await expect.poll(() => posts.length).toBe(2);
  expect(erros).toEqual([]);
});

test("tabela inexistente (PGRST205) liga o disjuntor: a segunda tela não gera outro POST", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  await context.route(ROTA_ACESSOS, (route) => route.fulfill({ status: 404, json: { code: "PGRST205", message: "Could not find the table 'public.rota_acessos'" } }));
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  await irParaOutraTelaPeloMenu(page);
  await page.waitForTimeout(1500);
  expect(posts).toHaveLength(1);
  expect(erros).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Plano 02-02: origem da abertura (D-10), dedupe (D-07), guardas (D-16) e POST pendurado (LOG-04).

// Clínicas de src/lib/nav.ts: CLIENTES_SEM_AUDIENCIA (633e6ee6...) e CLIENTES_SO_CRM (8770500e...). O mock responde a
// qualquer client_id, então estes ids só escolhem o ramo do redirect do app. Se alguém tirar a clínica do Set, os testes
// de redirect do app quebram e avisam.
const CLINICA_SEM_AUDIENCIA = "633e6ee6-cb55-4796-8ffe-ce9c6e34cc12";
const CLINICA_SO_CRM = "8770500e-ab5d-4ae8-9489-c49c9991303c";

test("clicar num item do menu lateral grava menu", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  await irParaOutraTelaPeloMenu(page);
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].corpo.origem).toBe("menu");
});

test("escolher um resultado do Cmd+K grava busca", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  // A busca do médico só acha as 6 telas e as abas delas (D-01, MEDV-03): "funil" leva às abas de Onde os pacientes travam.
  await dialog.getByRole("searchbox").fill("funil");
  const resultados = dialog.getByRole("link");
  await expect(resultados.first()).toBeVisible();
  const atual = new URL(page.url()).pathname;
  const hrefs = await resultados.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  const indice = hrefs.findIndex((href) => new URL(href, "http://x").pathname !== atual);
  expect(indice, "algum resultado precisa levar a outro pathname").toBeGreaterThanOrEqual(0);
  await resultados.nth(indice).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].corpo.origem).toBe("busca");
});

test("viewer abre /admin/conferencia: grava bloqueada para a tela negada e redirecionamento para o destino", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/conferencia");
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1500);
  const bloqueadas = posts.filter((p) => p.corpo.origem === "bloqueada");
  expect(bloqueadas).toHaveLength(1);
  expect(bloqueadas[0].corpo.rota).toBe("/_authenticated/admin/conferencia");
  expect(bloqueadas[0].corpo.client_id).toBeNull();
  const destino = posts.filter((p) => p.corpo.origem === "redirecionamento");
  expect(destino).toHaveLength(1);
  expect(destino[0].corpo.rota).toBe("/_authenticated/$clientId/hoje"); // a entrada termina na Hoje (03.1.1, D-06)
  expect(destino[0].corpo.client_id).toBe(CID);
  // A rota índice por onde o guarda passa é uma das 12 que só redirecionam pela configuração: nunca ganha linha.
  expect(posts.filter((p) => p.corpo.rota === "/_authenticated/")).toHaveLength(0);
  expect(new URL(page.url()).pathname).not.toBe("/admin/conferencia");
});

test("voltar do navegador grava a tela de volta com origem link", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  // Sai da janela do dedupe (2 s) para a volta contar de novo.
  await page.waitForTimeout(2100);
  await irParaOutraTelaPeloMenu(page);
  await expect.poll(() => posts.length).toBe(2);
  await page.goBack();
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2].corpo.rota).toBe("/_authenticated/$clientId/");
  expect(posts[2].corpo.origem).toBe("link");
});

test("POST que nunca responde não atrasa a próxima navegação", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  // Nunca cumpre, nunca continua, nunca aborta: o POST fica pendurado.
  await context.route(ROTA_ACESSOS, () => new Promise<void>(() => {}));
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  const atual = new URL(page.url()).pathname;
  const links = page.locator('aside[aria-label="Menu principal"] a[href^="/"]');
  const destinos = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  const indice = destinos.findIndex((href) => new URL(href, "http://x").pathname !== atual);
  expect(indice).toBeGreaterThanOrEqual(0);
  const inicio = Date.now();
  await links.nth(indice).click();
  // O primeiro link do menu do médico é a Hoje, que não tem o título da casca (o topo dela é a saudação).
  await expect(page.locator('[data-tela="hoje"], .workspace-heading h1').first()).toBeVisible({ timeout: 5000 });
  expect(new URL(page.url()).pathname).not.toBe(atual);
  expect(Date.now() - inicio).toBeLessThan(5000);
  expect(erros).toEqual([]);
});

test("viewer sem clínica no SAP abre /sap: bloqueada para /sap e redirecionamento para o destino", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/sap");
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1500);
  expect(posts).toHaveLength(2);
  expect(posts[0].corpo.origem).toBe("bloqueada");
  expect(posts[0].corpo.rota).toBe("/_authenticated/sap/");
  expect(posts[1].corpo.origem).toBe("redirecionamento");
  // O guarda de /sap leva direto à Pacientes (rota do SAP, congelada nesta fase); só a rota de entrada termina na Hoje.
  expect(posts[1].corpo.rota).toBe("/_authenticated/$clientId/pacientes");
  expect(posts[1].corpo.client_id).toBe(CID);
  expect(new URL(page.url()).pathname).not.toBe("/sap");
});

test("em 375 px, tocar num item da barra Áreas grava menu", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  const atual = new URL(page.url()).pathname;
  const links = page.locator('nav.bottomnav[aria-label="Áreas"] a[href^="/"]');
  await expect(links.first()).toBeVisible();
  const destinos = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  const indice = destinos.findIndex((href) => new URL(href, "http://x").pathname !== atual);
  expect(indice, "a barra Áreas precisa ter um link para outra tela").toBeGreaterThanOrEqual(0);
  await links.nth(indice).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].corpo.origem).toBe("menu");
});

test("clínica sem audiência abre /audiencia: o app troca a tela e só o destino grava (redirecionamento)", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CLINICA_SEM_AUDIENCIA}/audiencia`);
  await expect.poll(() => new URL(page.url()).pathname.endsWith("/audiencia")).toBe(false);
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  // O dobro de ESPERA_ASSENTAR_MS: dá tempo de uma linha indevida da tela abandonada aparecer.
  await page.waitForTimeout(1000);
  expect(posts).toHaveLength(1);
  expect(posts[0].corpo.origem).toBe("redirecionamento");
  expect(posts[0].corpo.rota).toBe("/_authenticated/$clientId/");
  expect(posts[0].corpo.client_id).toBe(CLINICA_SEM_AUDIENCIA);
  expect(posts.filter((p) => p.corpo.rota === "/_authenticated/$clientId/audiencia")).toHaveLength(0);
});

test("clínica só-CRM abre /pacientes: o app troca a tela e só o destino grava (redirecionamento)", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CLINICA_SO_CRM}/pacientes`);
  await expect.poll(() => new URL(page.url()).pathname.endsWith("/crm-painel")).toBe(true);
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1000);
  expect(posts).toHaveLength(1);
  expect(posts[0].corpo.origem).toBe("redirecionamento");
  expect(posts[0].corpo.rota).toBe("/_authenticated/$clientId/crm-painel");
  expect(posts[0].corpo.client_id).toBe(CLINICA_SO_CRM);
  expect(posts.filter((p) => p.corpo.rota === "/_authenticated/$clientId/pacientes")).toHaveLength(0);
});
