import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";
import { ROTULOS_MENU_EQUIPE, linkDaTela, secoesDaClinica, telasPorArea } from "../../src/lib/registro-de-telas";

// Seções da clínica (10/11/2026, pedido do João): a barra mostra só as seções sob Clínica e as telas da seção viram abas
// no topo da página, entre o cabeçalho da clínica e o conteúdo. Nenhuma tela some: toda tela da clínica que a sanfona de
// 09/11 mostrava tem de ser alcançável por seção + aba.

test.use({ reducedMotion: "reduce" });

const ADMIN = { isAdmin: true };
const ESTRATEGISTA = { isAdmin: false, papel: "strategist" as const };
const aside = (page: Page) => page.locator('aside[aria-label="Menu principal"]');
const secoes = (page: Page) => aside(page).getByRole("navigation", { name: `Seções de ${ROTULOS_MENU_EQUIPE.clinica}` });
const secao = (page: Page, area: string) => secoes(page).getByRole("link", { name: area, exact: true });
const abas = (page: Page, area: string) => page.getByRole("navigation", { name: `Telas de ${area}`, exact: true });
const hrefDe = (tela: Parameters<typeof linkDaTela>[0]) => linkDaTela(tela, CID)!.to.replace("$clientId", CID);

function capturarPosts(page: Page) {
  const posts: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/rest/v1/rota_acessos") posts.push(r.postDataJSON());
  });
  return posts;
}
async function ligarLog(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("nexo:rota-log", "1"));
}

test("a barra mostra só as seções da clínica, com ícone, e marca a seção da tela atual", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  const esperadas = secoesDaClinica(ADMIN);
  await expect(secoes(page).getByRole("link")).toHaveText(esperadas.map((s) => s.area));
  for (const s of ["Resultados", "Marketing", "Comercial", "Plano de ação", "Relatórios"])
    expect(esperadas.map((e) => e.area)).toContain(s);
  await expect(secoes(page).locator("a svg")).toHaveCount(esperadas.length);
  // A sanfona antiga saiu: nenhum título de grupo e nenhuma tela solta sob Clínica.
  await expect(aside(page).locator(".nx-subgrupo, .nx-subgrupo-titulo")).toHaveCount(0);
  await expect(secao(page, "Resultados")).toHaveAttribute("data-on", "");
  await expect(secao(page, "Marketing")).not.toHaveAttribute("data-on", /.*/);
  // Na primeira tela da seção as abas também aparecem, com a aba atual marcada.
  await expect(abas(page, "Resultados").locator('a[aria-current="page"]')).toHaveText("Resultados da clínica");
});

test("clicar Marketing abre a primeira tela da seção com o período e mostra as abas de Marketing", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=7d`);
  await expect(secoes(page)).toBeVisible();
  const marketing = secoesDaClinica(ADMIN).find((s) => s.area === "Marketing")!;
  await secao(page, "Marketing").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(hrefDe(marketing.primeira));
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  await expect(secao(page, "Marketing")).toHaveAttribute("data-on", "");
  await expect(secao(page, "Marketing")).toHaveAttribute("aria-current", "page");
  const nav = abas(page, "Marketing");
  await expect(nav).toHaveAttribute("data-origem", "menu");
  await expect(nav.getByRole("link")).toHaveText(marketing.telas.map((t) => t.rotulo));
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(marketing.primeira.rotulo);
  // As abas ficam entre o cabeçalho da clínica e o título da tela.
  const [ctx, faixa, titulo] = await Promise.all(
    [".workspace-context", ".nx-abas", ".workspace-heading"].map((s) => page.locator(s).first().boundingBox()),
  );
  expect(faixa!.y).toBeGreaterThanOrEqual(ctx!.y + ctx!.height - 1);
  expect(titulo!.y).toBeGreaterThanOrEqual(faixa!.y + faixa!.height - 1);

  // Outra aba: o período vai junto, a aba atual muda, a seção continua marcada (aria-current="true") e o log grava menu.
  const conteudo = marketing.telas.find((t) => t.rota.endsWith("/conteudo"))!;
  const antes = posts.length;
  await nav.getByRole("link", { name: conteudo.rotulo, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(hrefDe(conteudo));
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(conteudo.rotulo);
  await expect(secao(page, "Marketing")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  const ultimo = posts[posts.length - 1];
  expect(ultimo.origem).toBe("menu");
  expect(ultimo.rota).toBe("/_authenticated/$clientId/conteudo");
});

for (const [nome, perfil, conta] of [["admin", ADMIN, "admin"], ["estrategista", ESTRATEGISTA, "strategist"]] as const) {
  test(`${nome}: toda tela da clínica da sanfona antiga é alcançável por seção + aba`, async ({ page, context }) => {
    await mockAccount(context, conta);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}`);
    // A lista da sanfona de 09/11: telasPorArea só com as telas /$clientId/*.
    const antigas = telasPorArea(perfil)
      .flatMap((g) => g.telas)
      .filter((t) => t.rota.startsWith("/_authenticated/$clientId/"))
      .map(hrefDe);
    const achadas = new Set<string>();
    for (const s of secoesDaClinica(perfil)) {
      await secao(page, s.area).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(hrefDe(s.primeira));
      const nav = abas(page, s.area);
      await expect(nav.getByRole("link")).toHaveCount(s.telas.length);
      for (const href of await nav.getByRole("link").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname)))
        achadas.add(href);
    }
    expect([...achadas].sort()).toEqual([...new Set(antigas)].sort());
    expect(achadas.size).toBeGreaterThan(20);
  });
}

test("a 375 as abas rolam na horizontal, a página não, e a aba atual fica visível", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  const marketing = secoesDaClinica(ADMIN).find((s) => s.area === "Marketing")!;
  const ultima = marketing.telas[marketing.telas.length - 1];
  await page.goto(`${hrefDe(ultima)}?preset=30d`);
  const nav = abas(page, "Marketing");
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(ultima.rotulo);
  const trilho = nav.locator("ul");
  const medida = await trilho.evaluate((ul) => ({ sw: ul.scrollWidth, cw: ul.clientWidth, sl: ul.scrollLeft, ox: getComputedStyle(ul).overflowX }));
  expect(medida.sw).toBeGreaterThan(medida.cw);
  expect(medida.ox).toBe("auto");
  expect(medida.sl).toBeGreaterThan(0);
  await expect(nav.locator('a[aria-current="page"]')).toBeInViewport();
  const rolagem = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(rolagem.sw).toBeLessThanOrEqual(rolagem.iw + 1);
  // Alvo de toque de 44 px.
  const caixa = await nav.getByRole("link").first().boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(44);
});

test("abas pelo teclado: Tab passa de aba em aba e Enter abre a tela", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/conteudo`);
  const nav = abas(page, "Marketing");
  const links = nav.getByRole("link");
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(1)).toBeFocused();
  const destino = await links.nth(1).getAttribute("href");
  await page.keyboard.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(destino!, "http://x").pathname);
  await expect(links.nth(1)).toHaveAttribute("aria-current", "page");
});

test("fora de uma tela da clínica não há abas; a barra recolhida mostra as seções só com ícone e title", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const caminho of ["/admin", "/admin/conferencia"]) {
    await page.goto(caminho);
    await expect(page.getByRole("navigation", { name: "Menu da equipe" }).first()).toBeVisible();
    await expect(page.locator(".nx-abas")).toHaveCount(0);
  }
  await page.goto(`/${CID}/conteudo`);
  await expect(secoes(page)).toBeVisible();
  await aside(page).getByRole("button", { name: "Recolher menu lateral" }).click();
  const marketing = secao(page, "Marketing");
  await expect(marketing).toHaveAttribute("title", "Marketing");
  await expect(marketing.locator(".sr-only")).toHaveText("Marketing");
  await expect(marketing.locator(".nx-secao-rotulo")).toHaveCount(0);
  await aside(page).getByRole("button", { name: "Abrir menu lateral" }).click();
});

test("axe: seções da barra e abas da seção sem violações a 1440 e a 375", async ({ page, context }) => {
  await mockAccount(context, "admin");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/conteudo`);
    await expect(abas(page, "Marketing")).toBeVisible();
    const alvo = width === 1440 ? ['aside[aria-label="Menu principal"]', ".nx-abas"] : [".nx-abas"];
    let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
    for (const s of alvo) axe = axe.include(s);
    const audit = await axe.analyze();
    expect(audit.violations).toEqual([]);
  }
});
