import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { LINKS_DO_MEDICO } from "./links-do-medico";
import { ROTULOS_MENU_EQUIPE } from "../../src/lib/registro-de-telas";

// Animações fora (UI-SPEC §Movimento): posição e cor medidas no estado final.
test.use({ reducedMotion: "reduce" });

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
  // O Menu da equipe só aparece depois que o papel chega: espera por ele antes do atalho (03-02: a barra da equipe não tem
  // mais o seletor de produto, que era a espera do 03-01).
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();

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

// --- 03-02: Menu da equipe no computador (MENU-02, MENU-03, D-01, D-03, D-08, D-10) ---
// Rótulos sempre lidos de ROTULOS_MENU_EQUIPE (D-11, Pitfall 8): o card sorting pode trocá-los sem mexer aqui.

const ROTULOS = [ROTULOS_MENU_EQUIPE.carteira, ROTULOS_MENU_EQUIPE.clinica, ROTULOS_MENU_EQUIPE.conferencia];
const aside = (page: Page) => page.locator('aside[aria-label="Menu principal"]');
// Escopo na aside: a folha Menu do celular (03-04) também tem um nav "Menu da equipe", dentro do dialog fechado.
const itensDoMenu = (page: Page) => aside(page).locator('nav[aria-label="Menu da equipe"] > ul > li > a');
const itemDoMenu = (page: Page, rotulo: string) => itensDoMenu(page).filter({ hasText: rotulo });

test("admin a 1440 vê os 3 itens do Menu da equipe, Clínica atual com as 4 subtelas e nada de Aparência ou Produto", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await expect(itensDoMenu(page)).toHaveText(ROTULOS);
  const clinica = itemDoMenu(page, ROTULOS_MENU_EQUIPE.clinica);
  await expect(clinica).toHaveAttribute("aria-current", "page");
  await expect(clinica).toHaveAttribute("data-on", "");
  for (const rotulo of [ROTULOS_MENU_EQUIPE.carteira, ROTULOS_MENU_EQUIPE.conferencia])
    await expect(itemDoMenu(page, rotulo)).not.toHaveAttribute("aria-current", /.*/);
  await expect(page.getByRole("navigation", { name: `Telas de ${ROTULOS_MENU_EQUIPE.clinica}` }).getByRole("link")).toHaveCount(4);
  // A pílula do item atual é o degradê de marca (D-01), com texto branco.
  const fundo = await clinica.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(fundo).toContain("linear-gradient");
  // UI-SPEC D8: a barra da equipe não tem Aparência nem seletor de produto; a marca é o N com a palavra Nexo.
  await expect(aside(page).getByRole("group", { name: "Aparência" })).toHaveCount(0);
  await expect(aside(page).getByRole("navigation", { name: "Produto" })).toHaveCount(0);
  await expect(aside(page).locator(".nx-marca-n")).toBeVisible();
  await expect(aside(page).locator(".nx-marca")).toContainText("Nexo");
  await expect(aside(page).getByRole("button", { name: "Recolher menu lateral" })).toBeVisible();
  // Rótulo longo cabe em 1 linha na barra aberta (backstop do UI-SPEC: long-text).
  const conferencia = itemDoMenu(page, ROTULOS_MENU_EQUIPE.conferencia).locator(".nx-menu-rotulo");
  const linha = await conferencia.evaluate((el) => ({ h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth }));
  expect(linha.h).toBeLessThanOrEqual(30);
  expect(linha.sw).toBeLessThanOrEqual(linha.cw);
});

test("admin numa tela escondida da clínica: Clínica fica em pílula sem aria-current", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  // /conteudo é escondida (fora do menu). /pacientes cai no erro de dados do mock (linha de base do 03-01, routes 1280).
  await page.goto(`/${CID}/conteudo`);
  const clinica = itemDoMenu(page, ROTULOS_MENU_EQUIPE.clinica);
  await expect(clinica).toHaveAttribute("data-on", "");
  await expect(clinica).not.toHaveAttribute("aria-current", /.*/);
  const subtelas = page.getByRole("navigation", { name: `Telas de ${ROTULOS_MENU_EQUIPE.clinica}` });
  await expect(subtelas.getByRole("link")).toHaveCount(4);
  await expect(subtelas.locator('[aria-current="page"]')).toHaveCount(0);
});

test("admin clica no item de conferência do Menu da equipe e o log grava origem menu", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await expect(aside(page)).toHaveAttribute("data-origem", "menu");
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  const antes = posts.length;
  await itemDoMenu(page, ROTULOS_MENU_EQUIPE.conferencia).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/conferencia");
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  const ultimo = posts[posts.length - 1];
  expect(ultimo.corpo.origem).toBe("menu");
  expect(ultimo.corpo.rota).toBe("/_authenticated/admin/conferencia");
});

test("o campo Buscar tela da barra da equipe abre o diálogo Buscar tela", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await aside(page).getByRole("button", { name: "Buscar tela" }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toBeFocused();
});

test("estrategista não admin vê só Clínica com as 2 subtelas que abre e nenhum link para /admin", async ({ page, context }) => {
  await mockAccount(context, "strategist");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await expect(itensDoMenu(page)).toHaveText([ROTULOS_MENU_EQUIPE.clinica]);
  await expect(page.getByRole("navigation", { name: `Telas de ${ROTULOS_MENU_EQUIPE.clinica}` }).getByRole("link")).toHaveCount(2);
  await expect(aside(page).locator('a[href^="/admin"]')).toHaveCount(0);
});

test("médico (viewer) não tem Menu da equipe e continua com Áreas do Nexo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Áreas do Nexo" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toHaveCount(0);
});

// Trava do D-10: os links do médico lidos na base (antes do 03-04). O 03-04 troca só a marca e tira Aparência; este teste
// tem que continuar passando sem editar links-do-medico.ts. Para regenerar (só com decisão do João):
// IMPRIMIR_LINKS_DO_MEDICO=1 npx playwright test tests/e2e/menu-equipe.spec.ts -g "trava"
async function paresDosLinks(page: Page, seletor: string): Promise<[string, string][]> {
  return page.locator(seletor).evaluateAll((links) =>
    links.map((a) => [
      (a.getAttribute("aria-label") ?? a.textContent ?? "").replace(/\s+/g, " ").trim(),
      a.getAttribute("href") ?? "",
    ] as [string, string]),
  );
}

test("trava do médico: os links da barra, da barra inferior e da folha Navegar no Nexo não mudam", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Áreas do Nexo" })).toBeVisible();
  const barra = await paresDosLinks(page, 'aside[aria-label="Menu principal"] a');
  await page.setViewportSize({ width: 375, height: 812 });
  const areas = page.getByRole("navigation", { name: "Áreas", exact: true });
  await expect(areas).toBeVisible();
  const barraInferior = await paresDosLinks(page, 'nav.bottomnav[aria-label="Áreas"] a');
  await areas.getByRole("button", { name: "Menu", exact: true }).click();
  const folha = page.getByRole("dialog", { name: "Navegar no Nexo", exact: true });
  await expect(folha).toBeVisible();
  const daFolha = await paresDosLinks(page, 'dialog[aria-label="Navegar no Nexo"] a');
  const coletados = { barra, barraInferior, folha: daFolha };
  if (process.env.IMPRIMIR_LINKS_DO_MEDICO) console.log(JSON.stringify(coletados, null, 2).replaceAll(CID, "${CID}"));
  expect(coletados).toEqual(LINKS_DO_MEDICO);
});
