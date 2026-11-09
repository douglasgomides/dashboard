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
