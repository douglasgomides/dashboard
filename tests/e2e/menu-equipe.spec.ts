import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// E2e do menu da equipe (Phase 3). Começa com o tracer do 03-01: registro único -> busca nova -> link dentro de
// data-origem="busca" -> log da Phase 2 gravando origem busca. Os planos 03-02, 03-04 e 03-06 acrescentam os testes do menu.

type Post = { corpo: Record<string, unknown> };

// Mesmo padrão de rota-log.spec.ts: a chave de ligar o log só vale no bundle do e2e (Supabase falso).
async function ligarLog(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("nexo:rota-log", "1"));
}

function capturarPosts(page: Page): Post[] {
  const posts: Post[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== "/rest/v1/rota_acessos") return;
    posts.push({ corpo: request.postDataJSON() });
  });
  return posts;
}

test("tracer: equipe abre Pacientes do período pela busca e o log grava busca", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  // Tema escuro salvo: os tokens Cobalto da casca não mudam com ele.
  await context.addInitScript(() => localStorage.setItem("dc:tema", "dark"));
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  // O seletor de produto só aparece para o admin: espera o papel chegar antes do atalho.
  await expect(page.getByRole("navigation", { name: "Produto" }).first()).toBeAttached();

  const b1 = await page
    .locator(".app.product-workspace")
    .first()
    .evaluate((el) => getComputedStyle(el).getPropertyValue("--b1").trim());
  expect(b1.toUpperCase()).toBe("#1F4FD8");

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto.");
  await dialog.getByRole("searchbox").fill("Pacientes");
  const resultados = dialog.getByRole("navigation", { name: "Resultados da busca" });
  await expect(resultados).toHaveAttribute("data-origem", "busca");
  const antes = posts.length;
  await resultados.getByRole("link", { name: /Pacientes do período/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/pacientes`);
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  const ultimo = posts[posts.length - 1];
  expect(ultimo.corpo.origem).toBe("busca");
  expect(ultimo.corpo.rota).toBe("/_authenticated/$clientId/pacientes");
});

test("médico (viewer) com Ctrl+K ainda abre O que você quer fazer?", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "O que você quer fazer?" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Buscar tela" })).toHaveCount(0);
});
