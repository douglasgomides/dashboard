import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";
import { mockAnuncios, mockAudiencia, mockCrm, mockInstagram, mockLinks, mockPessoas } from "./apoio-telas-juntadas";
import { ROTULOS_MENU_EQUIPE, SECOES_JUNTADAS, indiceDaBusca, linkDaTela, secoesDaClinica } from "../../src/lib/registro-de-telas";

// Seções da clínica da equipe (10/11/2026, pedido do João; 03.1.1-08, D-02 com a emenda de 11/11/2026): a barra mostra as 9 seções
// sob Clínica e as telas de cada seção com mais de uma aba são abas em pasta dentro da página. Nenhuma tela some: toda tela da
// clínica que o índice da busca do perfil tem tem de ser alcançável por seção + aba.

test.use({ reducedMotion: "reduce" });

const ADMIN = { isAdmin: true };
const ESTRATEGISTA = { isAdmin: false, papel: "strategist" as const };
const NOVE_SECOES = [
  "O que fazer hoje", "Resultados da clínica", "Onde os pacientes travam", "De onde vêm os pacientes", "Instagram",
  "Relatório do período", "Conteúdo", "Atendimento", "Configurar CRM",
];
const aside = (page: Page) => page.locator('aside[aria-label="Menu principal"]');
const secoes = (page: Page) => aside(page).getByRole("navigation", { name: `Seções de ${ROTULOS_MENU_EQUIPE.clinica}` });
const secao = (page: Page, rotulo: string) => secoes(page).getByRole("link", { name: rotulo, exact: true });
const pasta = (page: Page, rotulo: string) => page.getByRole("navigation", { name: `Abas de ${rotulo}`, exact: true });
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

test("a barra mostra as 9 seções da clínica, com ícone, e marca a seção da tela atual", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  const esperadas = secoesDaClinica(ADMIN);
  expect(esperadas.map((s) => s.rotulo)).toEqual(NOVE_SECOES);
  await expect(secoes(page).getByRole("link")).toHaveText(NOVE_SECOES);
  await expect(secoes(page).locator("a svg")).toHaveCount(esperadas.length);
  // A sanfona antiga saiu: nenhum título de grupo e nenhuma tela solta sob Clínica; a faixa antiga de abas da seção também.
  await expect(aside(page).locator(".nx-subgrupo, .nx-subgrupo-titulo")).toHaveCount(0);
  await expect(page.locator(".nx-abas")).toHaveCount(0);
  await expect(secao(page, "Resultados da clínica")).toHaveAttribute("data-on", "");
  await expect(secao(page, "Resultados da clínica")).toHaveAttribute("aria-current", "page");
  await expect(secao(page, "Atendimento")).not.toHaveAttribute("data-on", /.*/);
});

test("clicar Atendimento abre a primeira tela com o período e a pasta marca Qualidade; o log grava menu", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=7d`);
  await expect(secoes(page)).toBeVisible();
  const atendimento = secoesDaClinica(ADMIN).find((s) => s.id === "atendimento")!;
  await secao(page, "Atendimento").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/atendimento`);
  expect(hrefDe(atendimento.primeira)).toBe(`/${CID}/atendimento`);
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  await expect(secao(page, "Atendimento")).toHaveAttribute("data-on", "");
  await expect(secao(page, "Atendimento")).toHaveAttribute("aria-current", "page");
  const nav = pasta(page, "Atendimento");
  await expect(nav).toHaveAttribute("data-origem", "menu");
  await expect(nav.locator(".nx-pasta__rotulo")).toHaveText(["Qualidade", "Central", "Contatos"]);
  await expect(nav.locator('a[aria-current="page"]')).toContainText("Qualidade");
  await expect.poll(() => posts.find((p) => p.rota === atendimento.primeira.rota)?.origem).toBe("menu");

  // As abas ficam entre o cabeçalho da clínica e o conteúdo da tela.
  const [ctx, faixa] = await Promise.all([".workspace-context", ".nx-pasta__abas"].map((s) => page.locator(s).first().boundingBox()));
  expect(faixa!.y).toBeGreaterThanOrEqual(ctx!.y + ctx!.height - 1);

  // Outra aba: o período vai junto, a seção continua marcada (aria-current="true") e o log grava menu com a rota da aba.
  await nav.getByRole("link", { name: /^Contatos/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/crm-contatos`);
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  await expect(secao(page, "Atendimento")).toHaveAttribute("aria-current", "true");
  await expect(nav.locator('a[aria-current="page"]')).toContainText("Contatos");
  await expect.poll(() => posts.find((p) => p.rota === "/_authenticated/$clientId/crm-contatos")?.origem).toBe("menu");
});

for (const [nome, perfil, conta] of [["admin", ADMIN, "admin"], ["estrategista", ESTRATEGISTA, "strategist"]] as const) {
  test(`${nome}: toda tela da clínica do índice da busca é alcançável por seção + aba`, async ({ page, context }) => {
    await mockAccount(context, conta);
    // /pacientes e as telas do CRM caem na página de erro com o Supabase falso sem dado: os mesmos mocks das telas juntadas.
    await mockPessoas(context);
    await mockCrm(context);
    await mockInstagram(context);
    await mockAudiencia(context);
    await mockAnuncios(context, "bom");
    await mockLinks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}`);
    const doPerfil = secoesDaClinica(perfil);
    await expect(secoes(page).getByRole("link")).toHaveText(doPerfil.map((s) => s.rotulo));
    expect(doPerfil.map((s) => s.rotulo)).toEqual(NOVE_SECOES);
    // O índice da busca do perfil, só as telas /$clientId/*: nenhuma pode faltar (a equipe vê tudo o que ficou no Nexo, D-02).
    const doIndice = indiceDaBusca(perfil)
      .filter((t) => t.rota.startsWith("/_authenticated/$clientId/"))
      .map(hrefDe);
    const achadas = new Set<string>();
    const hrefsDe = (nav: ReturnType<typeof pasta>) =>
      nav.getByRole("link").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    for (const s of doPerfil) {
      await secao(page, s.rotulo).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(hrefDe(s.primeira));
      achadas.add(hrefDe(s.primeira));
      const juntada = SECOES_JUNTADAS.find((j) => j.id === s.id);
      if (!juntada) {
        // Tela única: sem pasta.
        await expect(page.locator("[data-juntada]")).toHaveCount(0);
        continue;
      }
      const nav = pasta(page, juntada.rotulo);
      await expect(nav).toBeVisible();
      // A pasta tem as abas do perfil na ordem do registro, e cada aba leva à primeira parte dela.
      await expect(nav.locator(".nx-pasta__rotulo")).toHaveText(s.abas.map((a) => a.rotulo));
      for (const href of await hrefsDe(nav)) achadas.add(href);
      // A aba Funil tem duas partes: a segunda (Funil comercial) é alcançada pelo filtro segmentado da primeira.
      const partes = page.getByRole("navigation", { name: /^Partes de / });
      if (s.abas.some((a) => a.partes.length > 1 && a.partes.some((p) => p.rota === s.primeira.rota))) await expect(partes).toBeVisible();
      for (const href of await hrefsDe(partes)) achadas.add(href);
    }
    expect([...achadas].sort()).toEqual([...new Set(doPerfil.flatMap((s) => s.telas.map(hrefDe)))].sort());
    for (const href of doIndice) expect(achadas, `${href} sem seção + aba`).toContain(href);
    expect(achadas.size).toBeGreaterThan(20);
  });
}

test("a 375 a pasta da equipe rola na horizontal, a página não, e a aba atual fica visível", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/${CID}/crm-estrutura?preset=30d`);
  const nav = pasta(page, "Configurar CRM");
  await expect(nav).toBeVisible();
  await expect(nav.locator('a[aria-current="page"]')).toContainText("Etapas");
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
  await page.goto(`/${CID}/inspiracao`);
  const links = pasta(page, "Conteúdo").getByRole("link");
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  const i = hrefs.indexOf(`/${CID}/inspiracao`);
  expect(i).toBeGreaterThanOrEqual(0);
  await links.nth(i).focus();
  await expect(links.nth(i)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(i + 1)).toBeFocused();
  const destino = await links.nth(i + 1).getAttribute("href");
  await page.keyboard.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(destino!, "http://x").pathname);
  await expect(links.nth(i + 1)).toHaveAttribute("aria-current", "page");
});

test("fora de uma tela da clínica não há pasta; a barra recolhida mostra as seções só com ícone e title", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const caminho of ["/admin", "/admin/conferencia"]) {
    await page.goto(caminho);
    await expect(page.getByRole("navigation", { name: "Menu da equipe" }).first()).toBeVisible();
    await expect(page.locator(".nx-pasta, .nx-abas")).toHaveCount(0);
  }
  await page.goto(`/${CID}/conteudo`);
  await expect(secoes(page)).toBeVisible();
  await aside(page).getByRole("button", { name: "Recolher menu lateral" }).click();
  const instagram = secao(page, "Instagram");
  await expect(instagram).toHaveAttribute("title", "Instagram");
  await expect(instagram.locator(".sr-only")).toHaveText("Instagram");
  await expect(instagram.locator(".nx-secao-rotulo")).toHaveCount(0);
  await aside(page).getByRole("button", { name: "Abrir menu lateral" }).click();
});

test("axe: seções da barra e pasta de abas sem violações a 1440 e a 375", async ({ page, context }) => {
  await mockAccount(context, "admin");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/atendimento`);
    await expect(pasta(page, "Atendimento")).toBeVisible();
    const alvo = width === 1440 ? ['aside[aria-label="Menu principal"]', ".nx-pasta__abas"] : [".nx-pasta__abas"];
    let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
    for (const s of alvo) axe = axe.include(s);
    const audit = await axe.analyze();
    expect(audit.violations).toEqual([]);
  }
});
