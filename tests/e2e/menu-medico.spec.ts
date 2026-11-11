import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Menu do médico (Phase 3.1.1, plano 07, MEDV-01 e MEDV-03, D-01 e D-06): as 6 telas aprovadas pelo João em 10/11/2026
// ("Aprovo a lista" e "6 agora, decido na fase 9"), a entrada na Hoje, a busca que acha as abas pelo nome antigo e as telas
// que saíram do menu mas continuam abrindo pelo endereço.

test.use({ reducedMotion: "reduce" });

const ROTULOS = [
  "O que fazer hoje",
  "Resultados da clínica",
  "Onde os pacientes travam",
  "De onde vêm os pacientes",
  "Instagram",
  "Relatório do período",
];

type Post = Record<string, unknown>;

async function ligarLog(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("nexo:rota-log", "1"));
}
function capturarPosts(page: Page): Post[] {
  const posts: Post[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/rest/v1/rota_acessos") posts.push(r.postDataJSON());
  });
  return posts;
}

const barra = (page: Page) => page.getByRole("navigation", { name: "Áreas do Nexo", exact: true });

// --- Computador (Task 1) ---

test("médico a 1440: a barra tem só os 6 itens aprovados, na ordem, com o período", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(barra(page)).toBeVisible();
  await expect(barra(page).getByRole("link")).toHaveText(ROTULOS);
  const hrefs = await barra(page).getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual([
    `/${CID}/hoje?preset=30d`,
    `/${CID}?preset=30d`,
    `/${CID}/pacientes?preset=30d`,
    `/${CID}/vendas-kommo?preset=30d`,
    `/${CID}/conteudo?preset=30d`,
    `/${CID}/relatorio?preset=30d`,
  ]);
  // O menu antigo (grupo de análises detalhadas, telas da área) saiu da barra e não existe seletor de telas da área.
  await expect(page.getByText("Explorar análises e ferramentas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Telas de / })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toHaveCount(0);
});

test("médico clica Onde os pacientes travam: abre Pacientes com o período e a pasta, e o item fica marcado nas outras abas", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(barra(page)).toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  const antes = posts.length;
  const item = barra(page).getByRole("link", { name: "Onde os pacientes travam", exact: true });
  await expect(item).not.toHaveAttribute("data-on", /.*/);
  await item.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/pacientes`);
  expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
  await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", "travam");
  await expect(item).toHaveAttribute("aria-current", "page");
  // O log por rota grava a tela aberta pelo menu com origem menu.
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  expect(posts[posts.length - 1].origem).toBe("menu");
  expect(posts[posts.length - 1].rota).toBe("/_authenticated/$clientId/pacientes");

  // Em outra aba da mesma tela o item continua marcado (data-on), sem ser a página (aria-current true).
  await page.goto(`/${CID}/crm-painel?preset=30d`);
  const aqui = barra(page).getByRole("link", { name: "Onde os pacientes travam", exact: true });
  await expect(aqui).toHaveAttribute("data-on", "");
  await expect(aqui).toHaveAttribute("aria-current", "true");
  await expect(barra(page).locator("[data-on]")).toHaveCount(1);
});

test("a entrada do médico termina na Hoje e grava origem redirecionamento, sem linha da rota de entrada", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/hoje`);
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  const hoje = posts.filter((p) => p.rota === "/_authenticated/$clientId/hoje");
  expect(hoje).toHaveLength(1);
  expect(hoje[0].origem).toBe("redirecionamento");
  expect(hoje[0].client_id).toBe(CID);
  // A rota de entrada continua só redirecionando: nunca ganha linha (T-03.1.1-16).
  expect(posts.filter((p) => p.rota === "/_authenticated/")).toHaveLength(0);
  // Uma tela de entrada só: o item atual da barra é a Hoje e nenhum outro item leva a outra entrada.
  await expect(barra(page).getByRole("link", { name: "O que fazer hoje", exact: true })).toHaveAttribute("aria-current", "page");
});

test("telas que saíram do menu do médico continuam abrindo pelo endereço, sem bloqueio", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const caminho of [`/${CID}/duvidas`, `/${CID}/ideias?visao=semana`]) {
    await page.goto(caminho);
    await expect(barra(page)).toBeVisible();
    await expect(page.locator("main#workspace-content")).toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe(caminho.split("?")[0]);
    // Fora dos 6: nenhum item do menu fica marcado.
    await expect(barra(page).locator("[data-on]")).toHaveCount(0);
  }
});
