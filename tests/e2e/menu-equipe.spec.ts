import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";
import { LINKS_DO_MEDICO } from "./links-do-medico";
import { ROTULOS_MENU_EQUIPE, secoesDaClinica } from "../../src/lib/registro-de-telas";

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
  // O atalho pode sair antes de a casca ligar o ouvinte: repete até o diálogo abrir (mesmo padrão do 03-05).
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "O que você quer fazer?" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(page.getByRole("dialog", { name: "Buscar tela" })).toHaveCount(0);
});

// --- 03-02: Menu da equipe no computador (MENU-02, MENU-03, D-01, D-03, D-08, D-10) ---
// Rótulos sempre lidos de ROTULOS_MENU_EQUIPE (D-11, Pitfall 8): o card sorting pode trocá-los sem mexer aqui.

const ROTULOS = [ROTULOS_MENU_EQUIPE.carteira, ROTULOS_MENU_EQUIPE.clinica, ROTULOS_MENU_EQUIPE.conferencia];
const aside = (page: Page) => page.locator('aside[aria-label="Menu principal"]');
// Escopo na aside: a folha Menu do celular (03-04) também tem um nav "Menu da equipe", dentro do dialog fechado.
const itensDoMenu = (page: Page) => aside(page).locator('nav[aria-label="Menu da equipe"] > ul > li > a');
const itemDoMenu = (page: Page, rotulo: string) => itensDoMenu(page).filter({ hasText: rotulo });

test("admin a 1440 vê os 3 itens do Menu da equipe, Clínica atual com as seções e nada de Aparência ou Produto", async ({ page, context }) => {
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
  // 10/11/2026: sob Clínica ficam só as seções; as telas da seção são abas na página (secoes-da-clinica.spec.ts).
  await expect(aside(page).getByRole("navigation", { name: `Seções de ${ROTULOS_MENU_EQUIPE.clinica}` }).getByRole("link", { name: "Marketing", exact: true })).toBeVisible();
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
  // A seção Marketing fica marcada na barra e as telas dela (todas as da sanfona antiga) viram abas com 1 atual.
  const secoes = aside(page).getByRole("navigation", { name: `Seções de ${ROTULOS_MENU_EQUIPE.clinica}` });
  await expect(secoes.getByRole("link")).toHaveCount(secoesDaClinica({ isAdmin: true }).length);
  await expect(secoes.getByRole("link", { name: "Marketing", exact: true })).toHaveAttribute("data-on", "");
  const abas = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
  await expect(abas.getByRole("link")).toHaveCount(secoesDaClinica({ isAdmin: true }).find((s) => s.area === "Marketing")!.telas.length);
  await expect(abas.locator('[aria-current="page"]')).toHaveCount(1);
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

test("estrategista não admin vê só Clínica com as seções que abre e nenhum link para /admin", async ({ page, context }) => {
  await mockAccount(context, "strategist");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await expect(itensDoMenu(page)).toHaveText([ROTULOS_MENU_EQUIPE.clinica]);
  await expect(aside(page).getByRole("navigation", { name: `Seções de ${ROTULOS_MENU_EQUIPE.clinica}` }).getByRole("link")).toHaveText(
    secoesDaClinica({ isAdmin: false, papel: "strategist" }).map((s) => s.area),
  );
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

// --- 03-04: celular da equipe, avatar do rodapé e o médico sempre claro (MENU-02, MENU-03, D-01, D-08, D-10) ---

const cabecalho = (page: Page) => page.locator("header.mhead");
const itensDaFolha = (folha: ReturnType<Page["getByRole"]>) => folha.locator('nav[aria-label="Menu da equipe"] > ul > li > a');

test("admin a 375: Buscar tela com texto no cabeçalho, sem barra inferior, e a folha Menu com os 3 itens", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/${CID}`);
  const buscar = cabecalho(page).getByRole("button", { name: "Buscar tela", exact: true });
  await expect(buscar).toBeVisible();
  await expect(buscar).toHaveText("Buscar tela");
  const caixa = await buscar.boundingBox();
  expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("navigation", { name: "Áreas", exact: true })).toHaveCount(0);

  await buscar.click();
  const busca = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(busca).toBeVisible();
  await expect(busca.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(busca).not.toBeVisible();

  const abrir = cabecalho(page).getByRole("button", { name: "Abrir menu", exact: true });
  await expect(abrir).toHaveAttribute("aria-haspopup", "dialog");
  await abrir.click();
  const folha = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(folha).toBeVisible();
  await expect(folha).toHaveAttribute("data-origem", "menu");
  await expect(itensDaFolha(folha)).toHaveText(ROTULOS);
  await expect(folha.getByRole("button", { name: "Trocar de clínica", exact: true })).toBeVisible();
  await expect(folha.getByRole("button", { name: "Sair da conta", exact: true })).toBeVisible();
  await expect(folha.getByRole("group", { name: "Aparência" })).toHaveCount(0);
  await expect(folha.getByRole("navigation", { name: "Produto" })).toHaveCount(0);
});

test("admin toca um item da folha Menu e o log grava origem menu", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/${CID}`);
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  await cabecalho(page).getByRole("button", { name: "Abrir menu", exact: true }).click();
  const folha = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(folha).toBeVisible();
  const antes = posts.length;
  await itensDaFolha(folha).filter({ hasText: ROTULOS_MENU_EQUIPE.conferencia }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/conferencia");
  await expect(folha).not.toBeVisible();
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  const ultimo = posts[posts.length - 1];
  expect(ultimo.corpo.origem).toBe("menu");
  expect(ultimo.corpo.rota).toBe("/_authenticated/admin/conferencia");
});

test("admin a 320: Buscar tela mantém o texto, sem rolagem lateral, e o rótulo longo cabe em 1 linha na folha", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/${CID}`);
  const buscar = cabecalho(page).getByRole("button", { name: "Buscar tela", exact: true });
  await expect(buscar).toHaveText("Buscar tela");
  const caixa = await buscar.boundingBox();
  expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
  const rolagem = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(rolagem.sw).toBeLessThanOrEqual(rolagem.iw + 1);
  // O nome da clínica trunca antes dos botões perderem o texto.
  const nome = cabecalho(page).locator(".nx-mhead-nome");
  expect(await nome.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");

  await cabecalho(page).getByRole("button", { name: "Abrir menu", exact: true }).click();
  const folha = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(folha).toBeVisible();
  const rotulo = itensDaFolha(folha).filter({ hasText: ROTULOS_MENU_EQUIPE.conferencia }).locator(".nx-menu-rotulo");
  const linha = await rotulo.evaluate((el) => ({ h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth }));
  expect(linha.h).toBeLessThanOrEqual(30);
  expect(linha.sw).toBeLessThanOrEqual(linha.cw);
});

test("admin a 1440: o rodapé mostra o avatar gerado do e-mail, igual em duas telas, e nenhuma foto", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  const usuario = aside(page).locator(".nx-usuario");
  const svgDoAvatar = async () => {
    await expect(usuario).toContainText("qa@example.test");
    const svg = usuario.locator('svg[aria-hidden="true"]');
    await expect(svg).toHaveCount(1);
    await expect(usuario.locator("img")).toHaveCount(0);
    return svg.evaluate((el) => el.outerHTML);
  };
  await page.goto(`/${CID}`);
  const naClinica = await svgDoAvatar();
  await page.goto(`/${CID}/relatorio`);
  const noRelatorio = await svgDoAvatar();
  expect(noRelatorio).toBe(naClinica);
  await expect(aside(page).getByRole("button", { name: "Sair da conta", exact: true })).toBeVisible();
});

test("médico (viewer, D-10): marca N, sem Aparência na barra nem na folha Navegar no Nexo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(aside(page).getByRole("navigation", { name: "Áreas do Nexo" })).toBeVisible();
  await expect(aside(page).locator(".nx-marca-n")).toBeVisible();
  await expect(aside(page).locator(".nx-marca")).toContainText("Nexo");
  await expect(aside(page).getByRole("group", { name: "Aparência" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  const areas = page.getByRole("navigation", { name: "Áreas", exact: true });
  await expect(areas).toBeVisible();
  await areas.getByRole("button", { name: "Menu", exact: true }).click();
  const folha = page.getByRole("dialog", { name: "Navegar no Nexo", exact: true });
  await expect(folha).toBeVisible();
  await expect(folha.getByRole("group", { name: "Aparência" })).toHaveCount(0);
  await expect(folha.getByRole("navigation", { name: "Produto" })).toHaveCount(0);
});

// --- 03-06: a casca /admin com o mesmo menu, a mesma busca e a última clínica lembrada (MENU-02, MENU-03, D-02, D-08) ---

const asideAdmin = (page: Page) => page.locator('aside[aria-label="Menu do admin"]');
const itensDoAdmin = (page: Page) => asideAdmin(page).locator('nav[aria-label="Menu da equipe"] > ul > li > a');
const itemDoAdmin = (page: Page, rotulo: string) => itensDoAdmin(page).filter({ hasText: rotulo });
const DICA_CARTEIRA = "Escolha uma clínica para abrir os resultados dela.";

async function lembrarClinica(context: BrowserContext, id: string) {
  await context.addInitScript((valor) => localStorage.setItem("nexo:ultima-clinica", valor), id);
}

async function abrirAdmin(page: Page, caminho = "/admin") {
  await page.goto(caminho);
  await expect(page.getByRole("navigation", { name: "Menu da equipe" }).first()).toBeVisible();
}

async function buscarNoAdmin(page: Page, termo: string) {
  await asideAdmin(page).getByRole("button", { name: "Buscar tela" }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill(termo);
  return dialog;
}

test("admin a 1440 em /admin: o mesmo Menu da equipe, Ctrl+K abre Buscar tela e o rodapé mostra o e-mail", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page);
  await expect(asideAdmin(page)).toHaveAttribute("data-origem", "menu");
  await expect(itensDoAdmin(page)).toHaveText(ROTULOS);
  await expect(itemDoAdmin(page, ROTULOS_MENU_EQUIPE.carteira)).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Ferramentas administrativas" })).toHaveCount(0);
  await expect(page.locator("details.ws-admin-menu")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Produto" })).toHaveCount(0);
  await expect(asideAdmin(page).locator(".nx-usuario")).toContainText("qa@example.test");
  await expect(asideAdmin(page).locator(".nx-usuario svg")).toHaveCount(1);
  await expect(asideAdmin(page).locator("img")).toHaveCount(0);

  const dialog = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await asideAdmin(page).getByRole("button", { name: "Buscar tela" }).click();
  await expect(dialog).toBeVisible();
});

test("Clínica na casca /admin: sem clínica lembrada fica na Carteira com a dica; depois de abrir uma, volta para ela", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page);
  await expect(page.getByText(DICA_CARTEIRA)).toHaveCount(0);
  await itemDoAdmin(page, ROTULOS_MENU_EQUIPE.clinica).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin");
  await expect(page.getByRole("status").filter({ hasText: DICA_CARTEIRA })).toBeVisible();

  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nexo:ultima-clinica"))).toBe(CID);
  await abrirAdmin(page);
  await expect(page.getByText(DICA_CARTEIRA)).toHaveCount(0);
  await itemDoAdmin(page, ROTULOS_MENU_EQUIPE.clinica).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}`);
});

test("a busca na casca /admin usa a clínica lembrada nos links que precisam de clínica", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await lembrarClinica(context, CID);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page);
  const dialog = await buscarNoAdmin(page, "Pacientes");
  const resultado = dialog.getByRole("navigation", { name: "Resultados da busca" }).getByRole("link", { name: /Pacientes do período/ });
  await expect(resultado).toHaveAttribute("href", new RegExp(`^/${CID}/pacientes(\\?|$)`));
  await expect(resultado).not.toContainText("Escolha uma clínica primeiro");
});

test("sem clínica lembrada a busca na casca /admin diz Escolha uma clínica primeiro e leva à Carteira com a dica", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page, "/admin/agentes");
  const dialog = await buscarNoAdmin(page, "Pacientes");
  const resultado = dialog.getByRole("navigation", { name: "Resultados da busca" }).getByRole("link", { name: /Pacientes do período/ });
  await expect(resultado).toContainText("Escolha uma clínica primeiro");
  await resultado.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: DICA_CARTEIRA })).toBeVisible();
});

test("/admin/conferencia: Conferência e fontes atual com as 2 subtelas, e Integrações grava origem menu", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page, "/admin/conferencia");
  await expect(itemDoAdmin(page, ROTULOS_MENU_EQUIPE.conferencia)).toHaveAttribute("aria-current", "page");
  const subtelas = asideAdmin(page).getByRole("navigation", { name: `Telas de ${ROTULOS_MENU_EQUIPE.conferencia}` });
  await expect(subtelas.getByRole("link")).toHaveCount(2);
  await expect.poll(() => posts.length).toBeGreaterThanOrEqual(1);
  const antes = posts.length;
  await subtelas.getByRole("link", { name: /Integrações/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/integracoes");
  await expect.poll(() => posts.length).toBeGreaterThan(antes);
  const ultimo = posts[posts.length - 1];
  expect(ultimo.corpo.origem).toBe("menu");
  expect(ultimo.corpo.rota).toBe("/_authenticated/admin/integracoes");
});

test("/admin/<clínica>: Clínica fica em pílula e a clínica fica lembrada", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirAdmin(page, `/admin/${CID}`);
  const clinica = itemDoAdmin(page, ROTULOS_MENU_EQUIPE.clinica);
  await expect(clinica).toHaveAttribute("data-on", "");
  await expect(clinica).not.toHaveAttribute("aria-current", /.*/);
  await expect(clinica).toHaveAttribute("href", `/${CID}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nexo:ultima-clinica"))).toBe(CID);
});

test("admin a 375 em /admin: Buscar tela com texto no cabeçalho e a folha Menu com os 3 itens", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin");
  const buscar = cabecalho(page).getByRole("button", { name: "Buscar tela", exact: true });
  await expect(buscar).toBeVisible();
  await expect(buscar).toHaveText("Buscar tela");
  const caixa = await buscar.boundingBox();
  expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.locator("details.ws-admin-menu")).toHaveCount(0);
  await buscar.click();
  const busca = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(busca).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(busca).not.toBeVisible();

  await cabecalho(page).getByRole("button", { name: "Abrir menu", exact: true }).click();
  const folha = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(folha).toBeVisible();
  await expect(folha).toHaveAttribute("data-origem", "menu");
  await expect(itensDaFolha(folha)).toHaveText(ROTULOS);
  await expect(folha.getByRole("button", { name: "Sair da conta", exact: true })).toBeVisible();
});

// --- 03-06, V7: o menu, o cabeçalho, a folha e a busca passam no axe (wcag2a e wcag2aa), com reducedMotion reduce ---

async function semViolacoes(page: Page, seletor: string) {
  const audit = await new AxeBuilder({ page }).include(seletor).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(audit.violations).toEqual([]);
}

test("axe a 1440: o menu da barra na casca da clínica e na casca /admin", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(aside(page).getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await semViolacoes(page, 'aside[aria-label="Menu principal"]');
  await abrirAdmin(page);
  await expect(asideAdmin(page).getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await semViolacoes(page, 'aside[aria-label="Menu do admin"]');
});

for (const caminho of [`/${CID}`, "/admin"]) {
  test(`axe a 375 em ${caminho === "/admin" ? "/admin" : "/<clínica>"}: cabeçalho do celular, folha Menu e Buscar tela com funil`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(caminho);
    const abrir = cabecalho(page).getByRole("button", { name: "Abrir menu", exact: true });
    await expect(abrir).toBeVisible();
    await semViolacoes(page, "header.mhead");

    await abrir.click();
    const folha = page.getByRole("dialog", { name: "Menu", exact: true });
    await expect(folha).toBeVisible();
    await expect(itensDaFolha(folha)).toHaveText(ROTULOS);
    await semViolacoes(page, "dialog[open]");
    await page.keyboard.press("Escape");
    await expect(folha).not.toBeVisible();

    await cabecalho(page).getByRole("button", { name: "Buscar tela", exact: true }).click();
    const busca = page.getByRole("dialog", { name: "Buscar tela" });
    await expect(busca).toBeVisible();
    await busca.getByRole("searchbox").fill("funil");
    await expect(busca.getByRole("navigation", { name: "Resultados da busca" }).getByRole("link").first()).toBeVisible();
    await semViolacoes(page, "dialog[open]");
  });
}
