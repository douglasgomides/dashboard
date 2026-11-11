import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAudiencia, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// Telas juntadas do médico (Phase 3.1.1, plano 01): a pasta com abas em pasta, cada aba é o caminho da tela antiga (D-04,
// emenda de 10/11), o log grava o routeId da aba (D-06) e a pasta não busca dado. Aqui: Instagram de ponta a ponta, as outras
// duas telas juntadas já com pasta, a clínica sem Instagram e a contagem em cinza (D-07).

test.use({ reducedMotion: "reduce" });

const ROTA_POSTS = "/_authenticated/$clientId/posts";
const ROTA_TOP = "/_authenticated/$clientId/top";
const ROTAS_DAS_ABAS = new Set(SECOES_JUNTADAS.flatMap((s) => s.abas.flatMap((a) => a.partes.map((p) => p.rota))));

const pasta = (page: Page, rotulo: string) => page.getByRole("navigation", { name: `Abas de ${rotulo}`, exact: true });
const rotulosDasAbas = (nav: ReturnType<typeof pasta>) => nav.locator(".nx-pasta__rotulo");
const aba = (nav: ReturnType<typeof pasta>, rotulo: string) => nav.getByRole("link", { name: new RegExp(`^${rotulo}`) });

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

for (const perfil of ["viewer", "admin"] as const) {
  test(`${perfil}: o Instagram abre em pasta com 4 abas, a aba é o caminho antigo e o período vai junto`, async ({ page, context }) => {
    await mockAccount(context, perfil);
    await mockInstagram(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    const caminhos: string[] = [];
    await page.goto(`/${CID}/posts?preset=30d`);

    const nav = pasta(page, "Instagram");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveAttribute("data-origem", "menu");
    await expect(rotulosDasAbas(nav)).toHaveText(["Desempenho", "Destaques", "Posts", "Público"]);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(aba(nav, "Posts")).toHaveAttribute("aria-current", "page");
    // O título da casca é o da tela juntada e a pasta guarda a aba aberta.
    await expect(page.locator(".workspace-heading h1")).toHaveText("Instagram");
    await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", "instagram");
    await expect(page.locator("[data-juntada] .nx-pasta__corpo")).toHaveAttribute("data-juntada-aba", "posts");
    // Uma tela por vez: nada empilhado dentro da pasta.
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);

    // Trocar de aba leva ao caminho da tela antiga, com o período, sem passar por outro caminho.
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) caminhos.push(new URL(f.url()).pathname);
    });
    await aba(nav, "Destaques").click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/top`);
    expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
    await expect(aba(nav, "Destaques")).toHaveAttribute("aria-current", "page");
    await expect(aba(nav, "Posts")).not.toHaveAttribute("aria-current", /.*/);
    expect([...new Set(caminhos)].every((c) => c === `/${CID}/top`)).toBe(true);
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);
  });
}

test("o log grava o routeId da aba: clique vira menu, endereço digitado vira direto, sem query nem hash", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockInstagram(context);
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/posts?preset=30d`);
  await expect(aba(pasta(page, "Instagram"), "Posts")).toHaveAttribute("aria-current", "page");
  await expect.poll(() => posts.find((p) => p.rota === ROTA_POSTS)?.origem).toBe("direto");

  await aba(pasta(page, "Instagram"), "Destaques").click();
  await expect.poll(() => posts.find((p) => p.rota === ROTA_TOP)?.origem).toBe("menu");

  expect(posts.length).toBeGreaterThanOrEqual(2);
  for (const corpo of posts) {
    expect(String(corpo.rota)).not.toMatch(/[?#]/);
    expect(ROTAS_DAS_ABAS.has(String(corpo.rota))).toBe(true);
  }
});

test("Onde os pacientes travam já abre em pasta, e o Funil tem o filtro segmentado com as duas partes", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockPessoas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/pacientes?preset=30d`);
  const nav = pasta(page, "Onde os pacientes travam");
  await expect(nav).toBeVisible();
  await expect(rotulosDasAbas(nav)).toHaveText(["Funil", "Consultas", "Vendas", "Jornada"]);
  await expect(aba(nav, "Funil")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workspace-heading h1")).toHaveText("Onde os pacientes travam");

  const partes = page.getByRole("navigation", { name: "Partes de Funil", exact: true });
  await expect(partes).toBeVisible();
  await expect(partes.locator(".nx-segmentado__rotulo")).toHaveText(["Do contato à venda", "No CRM"]);
  await expect(partes.getByRole("link", { name: "Do contato à venda" })).toHaveAttribute("aria-current", "page");

  // A outra parte é o caminho antigo do funil comercial: a aba Funil continua marcada ("true", não "page").
  await partes.getByRole("link", { name: "No CRM" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/crm-painel`);
  expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
  await expect(aba(nav, "Funil")).toHaveAttribute("aria-current", "true");
  await expect(partes.getByRole("link", { name: "No CRM" })).toHaveAttribute("aria-current", "page");

  // Nas outras abas não há filtro segmentado.
  await aba(nav, "Consultas").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/consultas`);
  await expect(page.getByRole("navigation", { name: /^Partes de/ })).toHaveCount(0);
});

test("De onde vêm os pacientes já abre em pasta com as 4 abas", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/links?preset=30d`);
  const nav = pasta(page, "De onde vêm os pacientes");
  await expect(rotulosDasAbas(nav)).toHaveText(["Por origem", "Instagram", "Anúncios", "Links"]);
  await expect(aba(nav, "Links")).toHaveAttribute("aria-current", "page");
});

test("/marketing continua levando a /conteudo, que agora é Instagram > Desempenho; barra no fim casa a mesma aba", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockInstagram(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/marketing?preset=30d`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/conteudo`);
  const nav = pasta(page, "Instagram");
  await expect(aba(nav, "Desempenho")).toHaveAttribute("aria-current", "page");
  await page.goto(`/${CID}/audiencia/?preset=30d`);
  await expect(aba(pasta(page, "Instagram"), "Público")).toHaveAttribute("aria-current", "page");
});

test("clínica sem Instagram ligado não mostra a pasta do Instagram nem a aba Instagram de De onde vêm", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/client_fontes", (r) =>
    r.fulfill({ json: [{ tem_instagram: false, tem_anuncios: true, tem_crm: true, tem_atendimento: true }] }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/conteudo?preset=30d`);
  await expect(page.locator("main#workspace-content")).toBeVisible();
  await expect(page.locator(".workspace-heading h1")).toBeVisible();
  await expect(page.locator("[data-juntada]")).toHaveCount(0);
  await expect(pasta(page, "Instagram")).toHaveCount(0);

  await page.goto(`/${CID}/links?preset=30d`);
  const nav = pasta(page, "De onde vêm os pacientes");
  await expect(nav).toBeVisible();
  await expect(rotulosDasAbas(nav)).toHaveText(["Por origem", "Anúncios", "Links"]);
});

test("a equipe vê a pasta na tela juntada e a faixa antiga só com as telas que a pasta não repete", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await mockInstagram(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/top?preset=30d`);
  await expect(rotulosDasAbas(pasta(page, "Instagram"))).toHaveText(["Desempenho", "Destaques", "Posts", "Público"]);
  const faixa = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
  await expect(faixa).toBeVisible();
  const hrefs = await faixa.getByRole("link").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  for (const sub of ["conteudo", "top", "posts", "audiencia"]) expect(hrefs).not.toContain(`/${CID}/${sub}`);
  expect(hrefs).toContain(`/${CID}/ideias`);
  expect(hrefs).toContain(`/${CID}/anuncios`);
});

test("as alturas das 4 abas do Instagram são medidas e anotadas (a asserção de 1,5 tela entra no plano 02)", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await mockInstagram(context);
  for (const { width, height } of TELAS_DE_MEDIDA) {
    await page.setViewportSize({ width, height });
    for (const [rotulo, sub] of [["Desempenho", "conteudo"], ["Destaques", "top"], ["Posts", "posts"], ["Público", "audiencia"]]) {
      await page.goto(`/${CID}/${sub}?preset=30d`);
      const { altura, janela } = await alturaDaAbaAberta(page);
      console.log(`altura-instagram aba=${rotulo} largura=${width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura).toBeGreaterThan(0);
      expect(await semRolagemLateral(page)).toBe(true);
    }
  }
});

test("abas pelo teclado: Tab passa de aba em aba e Enter abre a tela", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockInstagram(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/conteudo?preset=30d`);
  const links = pasta(page, "Instagram").getByRole("link");
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(1)).toBeFocused();
  const destino = await links.nth(1).getAttribute("href");
  await page.keyboard.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(destino!, "http://x").pathname);
  await expect(links.nth(1)).toHaveAttribute("aria-current", "page");
});

test("contagem em cinza: a aba mostra o número que ela mesma carregou e \"—\" antes de abrir, nunca \"0\"", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockInstagram(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/posts?preset=30d`);
  const nav = pasta(page, "Instagram");
  await expect(aba(nav, "Posts")).toHaveAttribute("aria-current", "page");
  // O total que a tela mostra no cartão "Posts no período".
  const total = (await page.locator(".nx-kpi", { hasText: "Posts no período" }).locator(".ws-metric-value").first().innerText()).trim();
  expect(total).toMatch(/^\d/);
  await expect(aba(nav, "Posts").locator(".nx-pasta__contagem")).toHaveText(total);
  // Destaques ainda não abriu neste período: "—" (com aviso só para leitor de tela).
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem")).toContainText("—");
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem .sr-only")).toHaveText("sem número");
  // Desempenho e Público não têm coisa contável: nenhuma contagem desenhada.
  await expect(aba(nav, "Desempenho").locator(".nx-pasta__contagem")).toHaveCount(0);
  await expect(aba(nav, "Público").locator(".nx-pasta__contagem")).toHaveCount(0);

  // Depois de abrir Destaques e voltar, Destaques mostra o número que a própria aba carregou.
  await aba(nav, "Destaques").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/top`);
  await expect(page.locator('[data-juntada] [data-peca="leitura"]').first()).toBeVisible();
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem")).toHaveText(/^\d+$/);
  await aba(nav, "Posts").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/posts`);
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem")).toHaveText(/^\d+$/);
  await expect(aba(nav, "Posts").locator(".nx-pasta__contagem")).toHaveText(total);
});

test("contagem em cinza: Consultas e Vendas sem número publicado mostram \"—\" e nunca \"0\"", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/consultas?preset=30d`);
  const nav = pasta(page, "Onde os pacientes travam");
  await expect(aba(nav, "Consultas")).toHaveAttribute("aria-current", "page");
  for (const rotulo of ["Consultas", "Vendas"]) {
    const contagem = aba(nav, rotulo).locator(".nx-pasta__contagem");
    await expect(contagem).toContainText("—");
    await expect(contagem).not.toHaveText(/^0/);
  }
  // Funil e Jornada não têm coisa contável.
  await expect(aba(nav, "Funil").locator(".nx-pasta__contagem")).toHaveCount(0);
  await expect(aba(nav, "Jornada").locator(".nx-pasta__contagem")).toHaveCount(0);
});

test("a 375 a pasta não cria rolagem lateral na página (a faixa das abas rola sozinha) nas 3 telas juntadas", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockInstagram(context);
  await mockPessoas(context);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const sub of ["posts", "pacientes", "conteudo-comercial", "links", "consultas"]) {
    await page.goto(`/${CID}/${sub}?preset=30d`);
    await expect(page.locator("[data-juntada] .nx-pasta__abas").first()).toBeVisible();
    await expect(page.locator("[data-juntada] .nx-pasta__corpo > *").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await semRolagemLateral(page), `/${sub} rola na lateral`).toBe(true);
    // O texto só para leitor de tela da contagem não pode escapar da faixa.
    expect(await page.locator("[data-juntada] .nx-pasta__abas ul").evaluate((ul) => getComputedStyle(ul).position)).toBe("relative");
  }
});

// D-07 (plano 02): o próximo passo da leitura é a pílula de ação com a seta escura; a seta só abre os Detalhes da própria página.
const ABAS_DO_INSTAGRAM = [
  ["Desempenho", "conteudo"],
  ["Destaques", "top"],
  ["Posts", "posts"],
  ["Público", "audiencia"],
] as const;

for (const [rotulo, sub] of ABAS_DO_INSTAGRAM) {
  test(`D-07: ${rotulo} tem a pílula de ação na leitura e a seta abre os Detalhes sem gravar nada`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await mockInstagram(context);
    await mockAudiencia(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    // Só conta o que acontece depois do clique: as leituras da página (rpc por POST) já aconteceram ao abrir.
    const escritas: string[] = [];
    let aposOClique = false;
    page.on("request", (r) => {
      const { pathname } = new URL(r.url());
      if (aposOClique && ["POST", "PATCH", "DELETE"].includes(r.method()) && pathname.startsWith("/rest/v1/") && pathname !== "/rest/v1/rota_acessos") escritas.push(`${r.method()} ${pathname}`);
    });
    await page.goto(`/${CID}/${sub}?preset=30d`);
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    const pilula = leitura.locator(".nx-acao-pilula").first();
    await expect(pilula).toBeVisible();
    await page.screenshot({ path: `test-results/redesenho/pilula-${sub}.png` });
    const detalhes = page.locator(`[data-juntada] details#detalhes-${sub}`);
    await expect(detalhes).toHaveCount(1);
    await expect(detalhes).not.toHaveAttribute("open", /.*/);
    const seta = pilula.locator(".nx-acao-pilula__seta");
    await expect(seta).toBeVisible();
    await page.waitForLoadState("networkidle");
    aposOClique = true;
    await seta.click();
    await expect(detalhes).toHaveAttribute("open", /.*/);
    await expect(detalhes.locator(":scope > summary")).toBeFocused();
    await page.waitForTimeout(300);
    expect(escritas, `${rotulo}: a seta da pílula não grava nada`).toEqual([]);
  });
}
