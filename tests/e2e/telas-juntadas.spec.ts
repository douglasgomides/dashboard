import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockAudiencia, mockCrm, mockInstagram, mockLinks, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";
import { mockInstagram as mockInstagramCompleto } from "./instagram-dados";

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

test("a equipe vê a pasta na tela juntada e nenhuma faixa antiga de telas por cima dela", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await mockInstagram(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/top?preset=30d`);
  await expect(rotulosDasAbas(pasta(page, "Instagram"))).toHaveText(["Desempenho", "Destaques", "Posts", "Público"]);
  // 03.1.1-08: a faixa antiga de abas da seção saiu; as seções com várias telas são pastas (a barra lateral leva a cada seção).
  await expect(page.locator(".nx-abas")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /^Telas de / })).toHaveCount(0);
});

// --- 03.1.1-08: grupos da equipe (D-02 com a emenda de 11/11/2026). Cada aba é a tela antiga como está hoje, só para a equipe. ---
const rotaDaLinha = (rota: string) => rota.slice("/_authenticated/$clientId".length);
const DA_EQUIPE = SECOES_JUNTADAS.filter((s) => s.publico === "equipe");
const secaoDaEquipe = (id: string) => DA_EQUIPE.find((s) => s.id === id)!;

for (const [conta, perfil] of [["admin", "admin"], ["strategist", "estrategista"]] as const) {
  test(`${perfil}: Atendimento abre em pasta com as 3 abas, cada parte abre a aba certa e o log grava a rota da aba`, async ({ page, context }) => {
    await mockAccount(context, conta);
    await ligarLog(context);
    const posts = capturarPosts(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const atendimento = secaoDaEquipe("atendimento");
    for (const aba_ of atendimento.abas) {
      await page.goto(`/${CID}${rotaDaLinha(aba_.partes[0].rota)}?preset=30d`);
      const nav = pasta(page, "Atendimento");
      await expect(nav).toBeVisible();
      await expect(nav).toHaveAttribute("data-origem", "menu");
      await expect(rotulosDasAbas(nav)).toHaveText(["Qualidade", "Central", "Contatos"]);
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(aba(nav, aba_.rotulo)).toHaveAttribute("aria-current", "page");
      // A pasta guarda a tela antiga: uma pasta só, com o corpo da aba aberta; o título da casca continua o da tela.
      await expect(page.locator("[data-juntada]")).toHaveCount(1);
      await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", "atendimento");
      await expect(page.locator("[data-juntada] .nx-pasta__corpo")).toHaveAttribute("data-juntada-aba", aba_.id);
      await expect(page.getByRole("region", { name: `Atendimento: ${aba_.rotulo}`, exact: true })).toBeVisible();
      await expect(page.getByText("Essa página não carregou")).toHaveCount(0);
    }
    // Clicar numa aba vai ao caminho da tela antiga, com o período, e o log grava menu com o routeId dela.
    await page.goto(`/${CID}/atendimento?preset=7d`);
    const nav = pasta(page, "Atendimento");
    await expect(nav).toBeVisible();
    const antes = posts.length;
    await aba(nav, "Contatos").click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/crm-contatos`);
    expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await expect(aba(nav, "Contatos")).toHaveAttribute("aria-current", "page");
    await expect.poll(() => posts.slice(antes).find((p) => p.rota === "/_authenticated/$clientId/crm-contatos")?.origem).toBe("menu");
  });
}

test("viewer: /atendimento por link abre a tela sem a pasta do grupo da equipe", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/atendimento?preset=30d`);
  await expect(page.locator("main#workspace-content")).toBeVisible();
  await expect(page.locator(".workspace-heading h1")).toBeVisible();
  await expect(pasta(page, "Atendimento")).toHaveCount(0);
  await expect(page.locator("[data-juntada]")).toHaveCount(0);
});

// MEDV-04 / D-04 (plano 02): com o detalhe fechado, cada aba do Instagram mede no máximo 1,5 vez a altura da janela, em 375x812 e
// 1440x900, já com o desenho do D-07 aplicado. A lista de abas vem do registro (SECOES_JUNTADAS), não de uma cópia.
const ABAS_MEDIDAS = SECOES_JUNTADAS.find((s) => s.id === "instagram")!.abas.map((a) => ({ rotulo: a.rotulo, caminho: a.partes[0].rota.split("/").pop()! }));

test("as 4 abas do Instagram vêm do registro e a medida cobre todas", () => {
  expect(ABAS_MEDIDAS.map((a) => a.rotulo)).toEqual(["Desempenho", "Destaques", "Posts", "Público"]);
  expect(ABAS_MEDIDAS.map((a) => a.caminho)).toEqual(["conteudo", "top", "posts", "audiencia"]);
});

for (const { width, height } of TELAS_DE_MEDIDA) {
  for (const { rotulo, caminho } of ABAS_MEDIDAS) {
    test(`MEDV-04: Instagram, aba ${rotulo}, no máximo 1,5 tela em ${width}x${height} com o detalhe fechado`, async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockInstagram(context);
      await mockAudiencia(context);
      await page.setViewportSize({ width, height });
      await page.goto(`/${CID}/${caminho}?preset=30d`);
      const { altura, janela } = await alturaDaAbaAberta(page);
      console.log(`altura-instagram aba=${rotulo} largura=${width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura, `${rotulo} a ${width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
      await page.screenshot({ path: `test-results/redesenho/juntada-instagram-${caminho}-${width}.png`, fullPage: true });
    });
  }
}

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
  const total = (await page.locator(".nx-cartao", { hasText: "Posts no período" }).locator(".nx-numero__valor").first().innerText()).trim();
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

// D-07 (plano 02): todo cartão tem o ícone num círculo e a variação é pílula azul-clara, sem a cor de "bom" ou de "ruim".
for (const [rotulo, sub] of ABAS_DO_INSTAGRAM) {
  test(`D-07: ${rotulo} tem ícone redondo em todo cartão e variação sem cor de bom ou ruim`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await mockInstagram(context);
    await mockAudiencia(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}/${sub}?preset=30d`);
    const cartoes = page.locator("[data-juntada] .nx-pagina__cartoes > *");
    await expect(cartoes.first()).toBeVisible();
    const total = await cartoes.count();
    expect(total, `${rotulo}: de 1 a 4 cartões`).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(4);
    for (let i = 0; i < total; i++) {
      const icone = cartoes.nth(i).locator(".nx-tile, .nx-cartao__icone");
      await expect(icone, `${rotulo}: cartão ${i + 1} sem ícone`).toHaveCount(1);
      expect(await icone.evaluate((el) => getComputedStyle(el).borderRadius), `${rotulo}: ícone do cartão ${i + 1} não é redondo`).toBe("50%");
    }
    // As cores de bom e de ruim, lidas dos tokens na própria página.
    const referencia = await page.evaluate(() => {
      const ler = (token: string) => {
        const el = document.createElement("span");
        el.style.color = `var(${token})`;
        el.style.backgroundColor = `var(${token})`;
        document.querySelector(".nx-pagina")!.appendChild(el);
        const cs = getComputedStyle(el);
        const par = { cor: cs.color, fundo: cs.backgroundColor };
        el.remove();
        return par;
      };
      return { bom: ler("--good"), ruim: ler("--danger"), bomFundo: ler("--up-bg"), ruimFundo: ler("--dn-bg") };
    });
    const proibidas = new Set([referencia.bom.cor, referencia.ruim.cor, referencia.bomFundo.fundo, referencia.ruimFundo.fundo]);
    const pilulas = page.locator("[data-juntada] .nx-pagina__cartoes :is(.nx-kpi__meta .nx-tag, .nx-pilula-variacao)");
    const quantas = await pilulas.count();
    for (let i = 0; i < quantas; i++) {
      const cores = await pilulas.nth(i).evaluate((el) => ({ cor: getComputedStyle(el).color, fundo: getComputedStyle(el).backgroundColor }));
      expect(proibidas.has(cores.cor), `${rotulo}: variação ${i + 1} com a cor de bom ou ruim (texto)`).toBe(false);
      expect(proibidas.has(cores.fundo), `${rotulo}: variação ${i + 1} com a cor de bom ou ruim (fundo)`).toBe(false);
    }
  });
}

// ===================================================================================================================
// Plano 03: Onde os pacientes travam (4 abas, Funil com 2 partes) e De onde vêm os pacientes > Por origem, no molde, no desenho
// do D-07 e dentro de 1,5 tela. Dados fictícios (mockPessoas e mockCrm).
// ===================================================================================================================
type ParteMedida = { pasta: string; aba: string; parte?: string; sub: string; slug: string; semCartoes?: boolean };
const TRAVAM = "Onde os pacientes travam";
const PARTES_DO_CRM: ParteMedida[] = [
  { pasta: TRAVAM, aba: "Funil", parte: "Do contato à venda", sub: "pacientes", slug: "do-contato-a-venda" },
  { pasta: TRAVAM, aba: "Funil", parte: "No CRM", sub: "crm-painel", slug: "no-crm" },
  // Consultas e Vendas são telas em construção: leitura "Sem leitura:", sem cartões.
  { pasta: TRAVAM, aba: "Consultas", sub: "consultas", slug: "consultas", semCartoes: true },
  { pasta: TRAVAM, aba: "Vendas", sub: "vendas", slug: "vendas", semCartoes: true },
  { pasta: TRAVAM, aba: "Jornada", sub: "jornada", slug: "jornada" },
  // De onde vêm os pacientes > Por origem (Resultados por origem do CRM).
  { pasta: "De onde vêm os pacientes", aba: "Por origem", sub: "vendas-kommo", slug: "por-origem" },
];

async function abrirParte(page: Page, context: BrowserContext, perfil: "viewer" | "admin", sub: string, largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockPessoas(context);
  await mockCrm(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/${sub}?preset=30d`);
}

for (const { pasta: nomeDaPasta, aba: nomeDaAba, parte, sub, slug, semCartoes } of PARTES_DO_CRM) {
  for (const perfil of ["viewer", "admin"] as const) {
    test(`${perfil}: ${nomeDaAba}${parte ? ` > ${parte}` : ""} abre no molde com leitura, pílula de ação e cartões com ícone redondo`, async ({ page, context }) => {
      await abrirParte(page, context, perfil, sub, { width: 1440, height: 900 });
      const nav = pasta(page, nomeDaPasta);
      await expect(nav).toBeVisible();
      await expect(aba(nav, nomeDaAba)).toHaveAttribute("aria-current", parte && sub !== "pacientes" ? "true" : "page");
      if (parte) {
        const partes = page.getByRole("navigation", { name: `Partes de ${nomeDaAba}`, exact: true });
        await expect(partes.getByRole("link", { name: parte })).toHaveAttribute("aria-current", "page");
      }
      const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
      await expect(leitura).toBeVisible();
      await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
      await expect(leitura.getByText(/O que aconteceu|Sem leitura:/).first()).toBeVisible();
      await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
      await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
      const cartoes = page.locator("[data-juntada] .nx-pagina__cartoes > *");
      if (semCartoes) {
        await expect(cartoes).toHaveCount(0);
        return;
      }
      await expect(cartoes.first()).toBeVisible();
      const total = await cartoes.count();
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(4);
      for (let i = 0; i < total; i++) {
        const icone = cartoes.nth(i).locator(".nx-tile, .nx-cartao__icone");
        await expect(icone, `${slug}: cartão ${i + 1} sem ícone`).toHaveCount(1);
        expect(await icone.evaluate((el) => getComputedStyle(el).borderRadius), `${slug}: ícone do cartão ${i + 1} não é redondo`).toBe("50%");
      }
    });
  }

  for (const largura of TELAS_DE_MEDIDA) {
    test(`MEDV-04: ${nomeDaAba}${parte ? ` > ${parte}` : ""} no máximo 1,5 tela em ${largura.width}x${largura.height} com o detalhe fechado`, async ({ page, context }) => {
      await abrirParte(page, context, "admin", sub, largura);
      const { altura, janela } = await alturaDaAbaAberta(page);
      console.log(`altura-travam parte=${slug} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      await page.screenshot({ path: `test-results/redesenho/juntada-travam-${slug}-${largura.width}.png`, fullPage: true });
      expect(altura, `${slug} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}

test("Onde os pacientes travam: Consultas e Vendas abrem com \"Sem leitura:\" e a contagem das abas continua \"—\"", async ({ page, context }) => {
  for (const [rotulo, sub] of [["Consultas", "consultas"], ["Vendas", "vendas"]] as const) {
    await abrirParte(page, context, "viewer", sub, { width: 1440, height: 900 });
    const nav = pasta(page, TRAVAM);
    await expect(aba(nav, rotulo)).toHaveAttribute("aria-current", "page");
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura.getByText(/^Sem leitura: a tela ainda não tem a fonte ligada/)).toBeVisible();
    await expect(leitura.getByText(/Quem resolve:/)).toBeVisible();
    await expect(leitura.locator(".nx-acao-pilula")).toBeVisible();
    for (const r of ["Consultas", "Vendas"]) {
      const contagem = aba(nav, r).locator(".nx-pasta__contagem");
      await expect(contagem).toContainText("—");
      await expect(contagem).not.toHaveText(/^0/);
    }
  }
});

test("Onde os pacientes travam: clicar em No CRM leva ao funil comercial com o período e o log grava origem menu", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockPessoas(context);
  await mockCrm(context);
  await ligarLog(context);
  const posts = capturarPosts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/pacientes?preset=30d`);
  const partes = page.getByRole("navigation", { name: "Partes de Funil", exact: true });
  await expect(partes.getByRole("link", { name: "Do contato à venda" })).toHaveAttribute("aria-current", "page");
  await partes.getByRole("link", { name: "No CRM" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/crm-painel`);
  expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
  await expect(partes.getByRole("link", { name: "No CRM" })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => posts.find((p) => p.rota === "/_authenticated/$clientId/crm-painel")?.origem).toBe("menu");
});

test("Jornada: a leitura diz que a maioria dos contatos está sem pessoa ligada e o aviso completo fica nos Detalhes", async ({ page, context }) => {
  await abrirParte(page, context, "viewer", "jornada", { width: 1440, height: 900 });
  const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
  await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
  await expect(leitura.getByText(/não está ligada a nenhuma pessoa/)).toBeVisible();
  await expect(leitura.locator(".nx-leitura__num", { hasText: "50 de 80" })).toBeVisible();
  const detalhes = page.locator("[data-juntada] details#detalhes-jornada");
  await detalhes.locator(":scope > summary").click();
  await expect(detalhes.locator(".cm-aviso--critico").getByText(/% dos leads criados no período não estão ligados/)).toBeVisible();
});

test("De onde vêm os pacientes: a aba Por origem mostra em cinza o número de origens com venda que a própria aba carregou", async ({ page, context }) => {
  await abrirParte(page, context, "viewer", "vendas-kommo", { width: 1440, height: 900 });
  const nav = pasta(page, "De onde vêm os pacientes");
  await expect(aba(nav, "Por origem")).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-juntada] [data-peca="leitura"]').first()).not.toHaveAttribute("data-modo", "carregando");
  // mockCrm: Instagram e Indicação têm ganho; "Não informado" não é uma origem e não entra na conta.
  await expect(aba(nav, "Por origem").locator(".nx-pasta__contagem")).toHaveText("2");
  // A leitura afirma a origem líder só com a base de leadsRanking (Instagram tem 300 contatos).
  await expect(page.locator('[data-juntada] [data-peca="leitura"]').first().getByText(/A origem com mais ganhos registrados é "Instagram"/)).toBeVisible();
});

// ===================================================================================================================
// Plano 04: De onde vêm os pacientes > Anúncios no molde, com a leitura por regra e o portão do rastreio suspeito (caso Doctor
// Creator: 7.391 cliques no link e 29 conversas). Dados fictícios (mockAnuncios).
// ===================================================================================================================
const ORIGEM = "De onde vêm os pacientes";

async function abrirAnuncios(page: Page, context: BrowserContext, perfil: "viewer" | "admin", variante: "bom" | "suspeito", largura = { width: 1440, height: 900 }) {
  await mockAccount(context, perfil);
  await mockAnuncios(context, variante);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/anuncios?preset=30d`);
}

async function confereIconesDosCartoes(page: Page, slug: string) {
  const cartoes = page.locator("[data-juntada] .nx-pagina__cartoes > *");
  await expect(cartoes.first()).toBeVisible();
  const total = await cartoes.count();
  expect(total, `${slug}: de 1 a 4 cartões`).toBeGreaterThanOrEqual(1);
  expect(total).toBeLessThanOrEqual(4);
  for (let i = 0; i < total; i++) {
    const icone = cartoes.nth(i).locator(".nx-tile, .nx-cartao__icone");
    await expect(icone, `${slug}: cartão ${i + 1} sem ícone`).toHaveCount(1);
    expect(await icone.evaluate((el) => getComputedStyle(el).borderRadius), `${slug}: ícone do cartão ${i + 1} não é redondo`).toBe("50%");
  }
}

for (const perfil of ["viewer", "admin"] as const) {
  test(`${perfil}: Anúncios com rastreio bom abre na pasta, com "O que aconteceu", pílula de ação e cartões com ícone redondo`, async ({ page, context }) => {
    await abrirAnuncios(page, context, perfil, "bom");
    const nav = pasta(page, ORIGEM);
    await expect(rotulosDasAbas(nav)).toHaveText(["Por origem", "Instagram", "Anúncios", "Links"]);
    await expect(aba(nav, "Anúncios")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".workspace-heading h1")).toHaveText(ORIGEM);
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    await expect(leitura.getByText("O que aconteceu")).toBeVisible();
    await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
    await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
    // As conversas abrem a leitura, com o número e a variação (20% acima do período anterior) ao lado.
    await expect(leitura.getByText(/As conversas iniciadas pelos anúncios subiram/)).toBeVisible();
    await expect(leitura.locator(".nx-leitura__num", { hasText: "+20%" })).toBeVisible();
    await confereIconesDosCartoes(page, "anuncios");
    // Os 4 números e o gráfico do dia seguem à vista; o resto está nos Detalhes, fechado.
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao")).toHaveCount(4);
    await expect(page.getByRole("slider", { name: /^Investimento e conversas por dia/ })).toBeVisible();
    await expect(page.locator("[data-juntada] details#detalhes-anuncios")).not.toHaveAttribute("open", /.*/);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`${perfil}: Anúncios com rastreio suspeito diz "Sem leitura:", manda para o Gestor de tráfego e nunca culpa a campanha`, async ({ page, context }) => {
    await abrirAnuncios(page, context, perfil, "suspeito");
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    await expect(leitura.getByText(/^Sem leitura: o rastreio das conversas dos anúncios está suspeito/)).toBeVisible();
    // O caso real: os dois números do rastreio aparecem no motivo.
    await expect(leitura).toContainText("7.391 cliques no link");
    await expect(leitura).toContainText("29 conversas");
    await expect(leitura.getByText("Para consertar:")).toBeVisible();
    await expect(leitura.getByText("Quem resolve: Gestor de tráfego")).toBeVisible();
    await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
    await expect(leitura).not.toContainText("O que aconteceu");
    expect(await leitura.innerText()).not.toMatch(/não convert|não rende|campanhas? ruins?|não funciona/i);
    // O custo por conversa não aparece como verdade.
    await expect(page.locator("[data-juntada] .nx-cartao", { hasText: "Custo por conversa" }).locator(".nx-numero__valor")).toHaveText("Não confiável");
    // O aviso longo do rastreio está nos Detalhes, sem perder nada.
    const detalhes = page.locator("[data-juntada] details#detalhes-anuncios");
    await detalhes.locator(":scope > summary").click();
    await expect(detalhes.getByRole("alert").filter({ hasText: "As conversas dos anúncios não estão sendo contadas direito" })).toContainText("Quem resolve: Gestor de tráfego");
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("a seta da pílula de Anúncios abre os Detalhes da própria página e não grava nada", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockAnuncios(context, "suspeito");
  await page.setViewportSize({ width: 1440, height: 900 });
  const escritas: string[] = [];
  let aposOClique = false;
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (aposOClique && ["POST", "PATCH", "DELETE"].includes(r.method()) && pathname.startsWith("/rest/v1/") && pathname !== "/rest/v1/rota_acessos") escritas.push(`${r.method()} ${pathname}`);
  });
  await page.goto(`/${CID}/anuncios?preset=30d`);
  const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
  await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
  await page.screenshot({ path: "test-results/redesenho/pilula-anuncios.png" });
  const detalhes = page.locator("[data-juntada] details#detalhes-anuncios");
  await expect(detalhes).not.toHaveAttribute("open", /.*/);
  await page.waitForLoadState("networkidle");
  aposOClique = true;
  await leitura.locator(".nx-acao-pilula__seta").first().click();
  await expect(detalhes).toHaveAttribute("open", /.*/);
  await expect(detalhes.locator(":scope > summary")).toBeFocused();
  await page.waitForTimeout(300);
  expect(escritas, "a seta da pílula não grava nada").toEqual([]);
});

test("contagem em cinza: a aba Anúncios mostra o número de campanhas que a própria aba carregou e \"—\" antes de abrir", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockAnuncios(context, "bom");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/vendas-kommo?preset=30d`);
  const nav = pasta(page, ORIGEM);
  await expect(aba(nav, "Por origem")).toHaveAttribute("aria-current", "page");
  await expect(aba(nav, "Anúncios").locator(".nx-pasta__contagem")).toContainText("—");
  await expect(aba(nav, "Anúncios").locator(".nx-pasta__contagem")).not.toHaveText(/^0/);
  await aba(nav, "Anúncios").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/anuncios`);
  await expect(page.locator('[data-juntada] [data-peca="leitura"]').first()).not.toHaveAttribute("data-modo", "carregando");
  // O mock tem 3 campanhas com atividade; o cartão "Investido" diz o mesmo número.
  await expect(page.locator("[data-juntada] .nx-cartao", { hasText: "Investido" }).locator(".nx-cartao__sub")).toContainText("3 campanhas");
  await expect(aba(nav, "Anúncios").locator(".nx-pasta__contagem")).toHaveText("3");
});

for (const variante of ["bom", "suspeito"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`MEDV-04: Anúncios (rastreio ${variante}) no máximo 1,5 tela em ${largura.width}x${largura.height} com o detalhe fechado`, async ({ page, context }) => {
      await abrirAnuncios(page, context, "admin", variante, largura);
      const { altura, janela } = await alturaDaAbaAberta(page);
      console.log(`altura-origem aba=anuncios-${variante} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      await page.screenshot({ path: `test-results/redesenho/juntada-origem-anuncios${variante === "bom" ? "" : "-rastreio-suspeito"}-${largura.width}.png`, fullPage: true });
      expect(altura, `anuncios ${variante} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}

// ===================================================================================================================
// Plano 04, tarefa 2: Links e Instagram (Conteúdo × Comercial) dentro de 1,5 tela; as 13 abas e partes das 3 telas juntadas
// do médico, com medida de altura (26 medidas), pílula de ação, ícone redondo e o endereço antigo abrindo a aba certa.
// ===================================================================================================================
async function abrirLinks(page: Page, context: BrowserContext, perfil: "viewer" | "admin", variante: "com-links" | "vazio" = "com-links", largura = { width: 1440, height: 900 }) {
  await mockAccount(context, perfil);
  await mockLinks(context, variante);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/links?preset=30d`);
}

for (const perfil of ["viewer", "admin"] as const) {
  test(`${perfil}: Links abre na pasta com a leitura do link que mais teve conversa, pílula de ação e cartões com ícone redondo`, async ({ page, context }) => {
    await abrirLinks(page, context, perfil);
    const nav = pasta(page, ORIGEM);
    await expect(aba(nav, "Links")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    await expect(leitura.getByText("O que aconteceu")).toBeVisible();
    // mockLinks: 61 conversas nos 4 links, 40 delas no link "Bio principal" (acima da base mínima de 5 conversas).
    await expect(leitura.getByText(/O link com mais conversas é “Bio principal”/)).toBeVisible();
    await expect(leitura.locator(".nx-leitura__num", { hasText: "40 de 61 conversas" })).toBeVisible();
    await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
    await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
    await confereIconesDosCartoes(page, "links");
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao")).toHaveCount(4);
    // A tabela crua virou NxTabela, dentro dos Detalhes.
    expect(await page.locator("[data-juntada] table").evaluateAll((ts) => ts.filter((x) => !x.closest('[data-peca="tabela"]')).length)).toBe(0);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("Links sem nenhum link criado: \"Sem leitura:\" para a equipe Doctor Creator, e só a equipe vê o Gerador à vista", async ({ page, context }) => {
  await abrirLinks(page, context, "viewer", "vazio");
  const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
  await expect(leitura.getByText(/^Sem leitura: ainda não há link rastreado para esta clínica/)).toBeVisible();
  await expect(leitura.getByText("Quem resolve: Equipe Doctor Creator")).toBeVisible();
  await expect(page.getByText("A equipe Doctor Creator ainda não criou links rastreados para esta clínica.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Criar link curto" })).toHaveCount(0);
  await expect(aba(pasta(page, ORIGEM), "Links").locator(".nx-pasta__contagem")).toContainText("—");

  await abrirLinks(page, context, "admin", "vazio");
  await expect(page.getByRole("heading", { name: "Criar link curto" })).toBeVisible();
});

test("Links: o médico não vê o botão de criar link nem as edições, e o admin vê o Gerador nos Detalhes", async ({ page, context }) => {
  await abrirLinks(page, context, "viewer");
  const detalhes = page.locator("[data-juntada] details#detalhes-links");
  await detalhes.locator(":scope > summary").click();
  await expect(detalhes.getByRole("heading", { name: "Todos os links" })).toBeVisible();
  await expect(detalhes.getByText("Bio principal").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Criar link curto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Editar nome do link|Editar mensagem|Desativar link/ })).toHaveCount(0);
});

test("Links: o admin abre os Detalhes e vê o Gerador e as edições", async ({ page, context }) => {
  await abrirLinks(page, context, "admin");
  const detalhes = page.locator("[data-juntada] details#detalhes-links");
  await detalhes.locator(":scope > summary").click();
  await expect(detalhes.getByRole("heading", { name: "Criar link curto" })).toBeVisible();
  await expect(detalhes.getByRole("button", { name: "Criar link" })).toBeVisible();
  await expect(detalhes.getByRole("button", { name: "Editar nome do link" }).first()).toBeVisible();
});

test("contagem em cinza: a aba Links mostra \"—\" antes de abrir e o número de links que a própria aba lista depois", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockLinks(context);
  await mockCrm(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/vendas-kommo?preset=30d`);
  const nav = pasta(page, ORIGEM);
  await expect(aba(nav, "Por origem")).toHaveAttribute("aria-current", "page");
  await expect(aba(nav, "Links").locator(".nx-pasta__contagem")).toContainText("—");
  await expect(aba(nav, "Links").locator(".nx-pasta__contagem")).not.toHaveText(/^0/);
  await aba(nav, "Links").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/links`);
  await expect(page.locator('[data-juntada] [data-peca="leitura"]').first()).not.toHaveAttribute("data-modo", "carregando");
  await expect(aba(nav, "Links").locator(".nx-pasta__contagem")).toHaveText("4");
});

// As abas e partes medidas: a lista vem do registro e a conta fecha com as medidas que cada plano escreveu.
const PARTES_DAS_3_TELAS = SECOES_JUNTADAS.filter((s) => s.publico === "medico").flatMap((s) => s.abas.flatMap((a) => a.partes.map((p) => p.rota.split("/").pop()!)));
const SUBS_COM_MEDIDA = [...ABAS_MEDIDAS.map((a) => a.caminho), ...PARTES_DO_CRM.map((p) => p.sub), "anuncios", "conteudo-comercial", "links"];

test("as 13 abas e partes das 3 telas juntadas do médico têm medida de altura, 26 medidas com asserção", () => {
  expect(PARTES_DAS_3_TELAS).toHaveLength(13);
  expect([...new Set(SUBS_COM_MEDIDA)].sort()).toEqual([...PARTES_DAS_3_TELAS].sort());
  expect(SUBS_COM_MEDIDA.length * TELAS_DE_MEDIDA.length).toBe(26);
});

// Links e Instagram (Conteúdo × Comercial) dentro de 1,5 tela, com o detalhe fechado, nas 2 janelas.
const MEDIDAS_DO_PLANO_04 = [
  { rotulo: "Links", sub: "links", slug: "links" },
  { rotulo: "Instagram (Conteúdo × Comercial)", sub: "conteudo-comercial", slug: "instagram" },
] as const;

for (const { rotulo, sub, slug } of MEDIDAS_DO_PLANO_04) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`MEDV-04: ${rotulo} no máximo 1,5 tela em ${largura.width}x${largura.height} com o detalhe fechado`, async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockLinks(context);
      await mockInstagramCompleto(context);
      await mockCrm(context);
      await page.setViewportSize(largura);
      await page.goto(`/${CID}/${sub}?preset=30d`);
      const { altura, janela } = await alturaDaAbaAberta(page);
      console.log(`altura-origem aba=${slug} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      await page.screenshot({ path: `test-results/redesenho/juntada-origem-${slug}-${largura.width}.png`, fullPage: true });
      expect(altura, `${slug} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}

// Todas as 13 abas e partes: leitura com a pílula de ação e todo cartão com o ícone no círculo (D-07), num laço só.
for (const sub of PARTES_DAS_3_TELAS) {
  test(`D-07: /${sub} (aba ou parte das telas juntadas) tem a pílula de ação na leitura e ícone redondo em todo cartão`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await mockInstagramCompleto(context);
    await mockAudiencia(context);
    await mockPessoas(context);
    await mockCrm(context);
    await mockAnuncios(context, "bom");
    await mockLinks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}/${sub}?preset=30d`);
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    await expect(leitura.locator(".nx-acao-pilula").first(), `/${sub}: sem pílula de ação na leitura`).toBeVisible();
    const cartoes = page.locator("[data-juntada] .nx-pagina__cartoes > *");
    const total = await cartoes.count();
    expect(total).toBeLessThanOrEqual(4);
    // Consultas e Vendas são telas em construção (sem cartões); todas as outras têm de 1 a 4.
    if (sub !== "consultas" && sub !== "vendas") expect(total, `/${sub}: sem cartões`).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < total; i++) {
      const icone = cartoes.nth(i).locator(".nx-tile, .nx-cartao__icone");
      await expect(icone, `/${sub}: cartão ${i + 1} sem ícone`).toHaveCount(1);
      expect(await icone.evaluate((el) => getComputedStyle(el).borderRadius), `/${sub}: ícone do cartão ${i + 1} não é redondo`).toBe("50%");
    }
  });
}

// D-03: o endereço antigo de cada aba de De onde vêm os pacientes abre a pasta com a aba certa e o log grava a rota da aba.
const ABAS_DE_ORIGEM = [
  ["Por origem", "vendas-kommo"],
  ["Instagram", "conteudo-comercial"],
  ["Anúncios", "anuncios"],
  ["Links", "links"],
] as const;

for (const [rotulo, sub] of ABAS_DE_ORIGEM) {
  test(`D-03: o endereço antigo /${sub} abre De onde vêm os pacientes com a aba ${rotulo} marcada, sem redirecionar, e o log grava a rota da aba`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await mockInstagramCompleto(context);
    await mockCrm(context);
    await mockAnuncios(context, "bom");
    await mockLinks(context);
    await ligarLog(context);
    const posts = capturarPosts(page);
    const caminhos: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) caminhos.push(new URL(f.url()).pathname);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}/${sub}?preset=30d`);
    await expect(aba(pasta(page, ORIGEM), rotulo)).toHaveAttribute("aria-current", "page");
    await expect(pasta(page, ORIGEM).locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", "origem");
    await expect.poll(() => posts.find((p) => p.rota === `/_authenticated/$clientId/${sub}`)?.origem).toBe("direto");
    // Sem redirecionar: o endereço continua o mesmo e nenhum outro caminho foi aberto.
    expect(new URL(page.url()).pathname).toBe(`/${CID}/${sub}`);
    expect([...new Set(caminhos)].every((c) => c === `/${CID}/${sub}`)).toBe(true);
    for (const corpo of posts) {
      expect(String(corpo.rota)).not.toMatch(/[?#]/);
      expect(ROTAS_DAS_ABAS.has(String(corpo.rota))).toBe(true);
    }
  });
}
