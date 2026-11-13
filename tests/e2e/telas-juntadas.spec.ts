import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { LIMITE_DE_ALTURA, LIMITE_DO_DESEMPENHO_COM_TOP5, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockAudiencia, mockCrm, mockInstagram, mockLinks, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";
import { mockInstagram as mockInstagramCompleto } from "./instagram-dados";
import { abrirVerTudo } from "./apoio-cinco-segundos";

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
      // Desempenho: João 13/11/2026: Top 5 na tela mesmo passando do limite (limite próprio em px, medida + 40 px). As outras abas: 1,5 tela.
      const limite = caminho === "conteudo" ? LIMITE_DO_DESEMPENHO_COM_TOP5[width] : LIMITE_DE_ALTURA * janela;
      expect(altura, `${rotulo} a ${width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(limite);
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
  // Desempenho conta "dias com dado": antes de abrir mostra "—" (nunca "0"). Público é a leitura ao vivo da Meta e não tem contagem.
  await expect(aba(nav, "Desempenho").locator(".nx-pasta__contagem")).toContainText("—");
  await expect(aba(nav, "Desempenho").locator(".nx-pasta__contagem .sr-only")).toHaveText("sem número");
  await expect(aba(nav, "Público").locator(".nx-pasta__contagem")).toHaveCount(0);

  // Depois de abrir Destaques e voltar, Destaques mostra o número que a própria aba carregou.
  await aba(nav, "Destaques").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/top`);
  await expect(page.locator('[data-juntada] [data-peca="descobertas-da-aba"]')).toHaveAttribute("data-modo", "pronta");
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem")).toHaveText(/^\d+$/);
  await aba(nav, "Posts").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/posts`);
  await expect(aba(nav, "Destaques").locator(".nx-pasta__contagem")).toHaveText(/^\d+$/);
  await expect(aba(nav, "Posts").locator(".nx-pasta__contagem")).toHaveText(total);
  // Depois de abrir Desempenho, a aba mostra os dias com dado que ela mesma carregou.
  await aba(nav, "Desempenho").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/conteudo`);
  await expect(aba(nav, "Desempenho").locator(".nx-pasta__contagem")).toHaveText(/^\d+$/);
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
  // Funil e Jornada contam as pessoas que viraram lead: antes de abrir mostram "—" com o aviso só para leitor de tela (nunca "0").
  for (const rotulo of ["Funil", "Jornada"]) {
    const contagem = aba(nav, rotulo).locator(".nx-pasta__contagem");
    await expect(contagem).toContainText("—");
    await expect(contagem.locator(".sr-only")).toHaveText("sem número");
    await expect(contagem).not.toHaveText(/^0/);
  }
});

test("contagem em cinza: Funil e Jornada mostram as pessoas novas que a primeira parte já carregou", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockPessoas(context);
  await mockCrm(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/pacientes?preset=30d`);
  const nav = pasta(page, "Onde os pacientes travam");
  await expect(aba(nav, "Funil")).toHaveAttribute("aria-current", "page");
  // O mock de pessoas tem 80 pessoas novas (leads_novos): é o número de Virou lead.
  await expect(aba(nav, "Funil").locator(".nx-pasta__contagem")).toHaveText("80");
  // A Jornada ainda não abriu neste período: "—". Depois de abrir, mostra as pessoas novas que ela carregou.
  await expect(aba(nav, "Jornada").locator(".nx-pasta__contagem")).toContainText("—");
  await expect(aba(nav, "Jornada").locator(".nx-pasta__contagem .sr-only")).toHaveText("sem número");
  await aba(nav, "Jornada").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/jornada`);
  await expect(aba(nav, "Jornada").locator(".nx-pasta__contagem")).toHaveText("80");
  await expect(aba(nav, "Funil").locator(".nx-pasta__contagem")).toHaveText("80");
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

// quick-ver-tudo-abas (João 13/11/2026): abas sem a caixa da leitura; o próximo passo dela é a pílula de uma descoberta no topo da aba.
const ABAS_SEM_LEITURA: ReadonlySet<string> = new Set(["vendas-kommo", "links", "top", "posts", "audiencia"]);

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
    // Formato 5 segundos (03.1.1.1, plano 07): Desempenho abre com o veredito e a leitura (com a pílula) mora no "Ver tudo", que começa fechado.
    const detalhes = page.locator(`[data-juntada] details#detalhes-${sub}`);
    if (sub === "conteudo") {
      await expect(page.locator('[data-juntada] [data-peca="veredito"]:not([data-modo="carregando"])')).toBeVisible();
      await expect(detalhes).toHaveCount(1);
      await expect(detalhes).not.toHaveAttribute("open", /.*/);
      await detalhes.locator(":scope > summary").click();
    }
    // quick-ver-tudo (João 13/11/2026): em Desempenho a leitura saiu do "Ver tudo"; o próximo passo dela é a pílula de uma descoberta lá dentro,
    // e a seta continua só abrindo os Detalhes da própria página.
    // quick-ver-tudo-abas: nas abas sem a caixa da leitura, o próximo passo dela é a pílula de uma descoberta no topo da aba.
    const leitura =
      sub === "conteudo"
        ? page.locator('[data-juntada] [data-peca="descoberta-extra"][data-descoberta-extra^="leitura-"]').first()
        : ABAS_SEM_LEITURA.has(sub)
          ? page.locator('[data-juntada] [data-peca="descobertas-da-aba"] [data-peca="descoberta"][data-proximo-passo]').first()
          : page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    if (sub !== "conteudo" && !ABAS_SEM_LEITURA.has(sub)) await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    const pilula = leitura.locator(".nx-acao-pilula").first();
    await expect(pilula).toBeVisible();
    await page.screenshot({ path: `test-results/redesenho/pilula-${sub}.png` });
    await expect(detalhes).toHaveCount(1);
    if (sub !== "conteudo") await expect(detalhes).not.toHaveAttribute("open", /.*/);
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
type ParteMedida = { pasta: string; aba: string; parte?: string; sub: string; slug: string; semCartoes?: boolean; cinco?: boolean; semLeitura?: boolean };
const TRAVAM = "Onde os pacientes travam";
const PARTES_DO_CRM: ParteMedida[] = [
  // Formato 5 segundos (03.1.1.1, plano 05): abre com o veredito (a leitura mora no "Ver tudo").
  { pasta: TRAVAM, aba: "Funil", parte: "Do contato à venda", sub: "pacientes", slug: "do-contato-a-venda", cinco: true },
  { pasta: TRAVAM, aba: "Funil", parte: "No CRM", sub: "crm-painel", slug: "no-crm" },
  // Consultas e Vendas são telas em construção: leitura "Falta dado:", sem cartões.
  { pasta: TRAVAM, aba: "Consultas", sub: "consultas", slug: "consultas", semCartoes: true },
  { pasta: TRAVAM, aba: "Vendas", sub: "vendas", slug: "vendas", semCartoes: true },
  { pasta: TRAVAM, aba: "Jornada", sub: "jornada", slug: "jornada" },
  // De onde vêm os pacientes > Por origem (Resultados por origem do CRM).
  // quick-ver-tudo-abas (João 13/11/2026): a leitura do período saiu; o que ela dizia e a aba não mostra é descoberta no topo da aba.
  { pasta: "De onde vêm os pacientes", aba: "Por origem", sub: "vendas-kommo", slug: "por-origem", semLeitura: true },
];

async function abrirParte(page: Page, context: BrowserContext, perfil: "viewer" | "admin", sub: string, largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockPessoas(context);
  await mockCrm(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/${sub}?preset=30d`);
}

for (const { pasta: nomeDaPasta, aba: nomeDaAba, parte, sub, slug, semCartoes, cinco, semLeitura } of PARTES_DO_CRM) {
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
      if (cinco) {
        // O veredito (palavra e frase) abre a tela, antes dos cartões; sem a leitura à vista.
        const veredito = page.locator('[data-juntada] [data-peca="veredito"]').first();
        await expect(veredito).toBeVisible();
        await expect(veredito).not.toHaveAttribute("data-modo", "carregando");
        await expect(veredito.getByText(/Aqui você perde mais|Uma etapa tem mais gente|Falta dado:/).first()).toBeVisible();
        await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toBeHidden();
      } else if (semLeitura) {
        // Sem a caixa da leitura: as descobertas dela no topo da aba, com a pílula de ação (o próximo passo) e o "Por quê?".
        await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
        const topo = page.locator('[data-juntada] [data-peca="descobertas-da-aba"]');
        await expect(topo).toHaveAttribute("data-modo", "pronta");
        const descoberta = topo.locator('[data-peca="descoberta"]').first();
        await expect(descoberta).toBeVisible();
        await expect(descoberta.locator(".nx-acao-pilula").first()).toBeVisible();
        await expect(descoberta.getByRole("button", { name: "Por quê?" })).toBeVisible();
        expect(await topo.locator('[data-peca="descoberta"]').count()).toBeLessThanOrEqual(3);
      } else {
        const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
        await expect(leitura).toBeVisible();
        await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
        await expect(leitura.getByText(/O que aconteceu|Falta dado:/).first()).toBeVisible();
        await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
        await expect(leitura.locator(".nx-acao-pilula").first()).toBeVisible();
      }
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

test("Onde os pacientes travam: Consultas e Vendas abrem com \"Falta dado:\" e a contagem das abas continua \"—\"", async ({ page, context }) => {
  for (const [rotulo, sub] of [["Consultas", "consultas"], ["Vendas", "vendas"]] as const) {
    await abrirParte(page, context, "viewer", sub, { width: 1440, height: 900 });
    const nav = pasta(page, TRAVAM);
    await expect(aba(nav, rotulo)).toHaveAttribute("aria-current", "page");
    const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
    await expect(leitura.getByText(/^Falta dado: a tela ainda não tem a fonte ligada/)).toBeVisible();
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
  await expect(leitura.getByText(/não está ligada a uma pessoa/)).toBeVisible();
  await expect(leitura.locator(".nx-leitura__num", { hasText: "50 de 80" })).toBeVisible();
  const detalhes = page.locator("[data-juntada] details#detalhes-jornada");
  await detalhes.locator(":scope > summary").click();
  await expect(detalhes.locator(".cm-aviso--critico").getByText(/% dos leads criados no período não estão ligados/)).toBeVisible();
});

test("De onde vêm os pacientes: a aba Por origem mostra em cinza o número de origens com venda que a própria aba carregou", async ({ page, context }) => {
  await abrirParte(page, context, "viewer", "vendas-kommo", { width: 1440, height: 900 });
  const nav = pasta(page, "De onde vêm os pacientes");
  await expect(aba(nav, "Por origem")).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-juntada] [data-peca="descobertas-da-aba"]')).toHaveAttribute("data-modo", "pronta");
  // mockCrm: Instagram e Indicação têm ganho; "Não informado" não é uma origem e não entra na conta.
  await expect(aba(nav, "Por origem").locator(".nx-pasta__contagem")).toHaveText("2");
  // A leitura afirma a origem líder só com a base de leadsRanking (Instagram tem 300 contatos). quick-ver-tudo-abas: a caixa da leitura
  // saiu; a origem líder está no gráfico do topo e o passo de conferir o "ganho" dela é UMA descoberta, uma vez só na aba.
  await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
  await expect(page.locator("[data-juntada]").getByText(/Conferir se o status ganho de "Instagram" é venda de verdade/)).toHaveCount(1);
  await expect(page.locator('[data-juntada] [data-peca="descobertas-da-aba"] [data-peca="descoberta"]').getByText(/status ganho de "Instagram"/)).toBeVisible();
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
  test(`${perfil}: Anúncios com rastreio bom abre na pasta, com o veredito do custo por conversa e os 3 cartões com ícone redondo`, async ({ page, context }) => {
    await abrirAnuncios(page, context, perfil, "bom");
    const nav = pasta(page, ORIGEM);
    await expect(rotulosDasAbas(nav)).toHaveText(["Por origem", "Instagram", "Anúncios", "Links"]);
    await expect(aba(nav, "Anúncios")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".workspace-heading h1")).toHaveText(ORIGEM);
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);
    // Formato 5 segundos (03.1.1.1, plano 09): o veredito abre a tela. O custo por conversa caiu de R$ 40 para R$ 33 (as conversas subiram 20% com o mesmo gasto).
    const veredito = page.locator('[data-juntada] [data-peca="veredito"]').first();
    await expect(veredito).toBeVisible();
    await expect(veredito).toHaveAttribute("data-modo", "veredito");
    await expect(veredito.locator(".nx-selo")).toContainText("Melhorou");
    await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^R\$\s33 por conversa: 17% mais barato que no período anterior$/);
    await confereIconesDosCartoes(page, "anuncios");
    // Os 3 números (Investido, Conversas pelo anúncio e Custo por conversa) seguem à vista com a linha de 30 dias; o resto está no "Ver tudo", fechado.
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao")).toHaveCount(3);
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-linha30")).toHaveCount(3);
    await expect(page.locator("[data-juntada] details#detalhes-anuncios")).not.toHaveAttribute("open", /.*/);
    // quick-ver-tudo: a leitura saiu do "Ver tudo". O que ela dizia ("as conversas subiram 20%") está uma vez só, no cartão do topo; o que só ela
    // dizia virou descoberta lá dentro (MEDV-02: nada único some).
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao", { hasText: "Conversas pelo anúncio" })).toContainText("▲ 20%");
    await abrirVerTudo(page, "[data-juntada]");
    await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
    expect(await page.locator('[data-juntada] [data-descoberta-extra^="leitura-"]').count()).toBeGreaterThan(0);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`${perfil}: Anúncios com rastreio suspeito diz "Falta dado:", manda para o Gestor de tráfego e nunca culpa a campanha`, async ({ page, context }) => {
    await abrirAnuncios(page, context, perfil, "suspeito");
    const veredito = page.locator('[data-juntada] [data-peca="veredito"]').first();
    await expect(veredito).toBeVisible();
    await expect(veredito).toHaveAttribute("data-modo", "sem-leitura");
    await expect(veredito.getByText(/^Falta dado: o rastreio das conversas dos anúncios está suspeito/)).toBeVisible();
    // O caso real: os dois números do rastreio aparecem no motivo.
    await expect(veredito).toContainText("7.391 cliques no link");
    await expect(veredito).toContainText("29 conversas");
    await expect(veredito.getByText("Próximo passo para resolver:")).toBeVisible();
    await expect(veredito.getByText("Quem resolve: Gestor de tráfego")).toBeVisible();
    await expect(veredito.locator(".nx-acao-pilula").first()).toBeVisible();
    expect(await veredito.innerText()).not.toMatch(/não convert|não rende|campanhas? ruins?|não funciona|mais barato|mais caro/i);
    // O custo por conversa não aparece como verdade.
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao", { hasText: "Custo por conversa" }).locator(".nx-numero__valor")).toHaveText("Não confiável");
    // O aviso longo do rastreio fica à vista (honestidade primeiro), sem abrir o "Ver tudo".
    await expect(page.locator("[data-juntada] details#detalhes-anuncios")).not.toHaveAttribute("open", /.*/);
    await expect(page.getByRole("alert").filter({ hasText: "As conversas dos anúncios não estão sendo contadas direito" })).toContainText("Quem resolve: Gestor de tráfego");
    // quick-ver-tudo: o "Falta dado" fica uma vez só, no veredito (acima); o "Ver tudo" não traz a leitura nem descoberta tirada dela (portão negado).
    await abrirVerTudo(page, "[data-juntada]");
    await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
    await expect(page.locator('[data-juntada] [data-descoberta-extra^="leitura-"]')).toHaveCount(0);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("a seta da pílula de Anúncios abre os Detalhes da própria página e não grava nada", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockAnuncios(context, "bom");
  await page.setViewportSize({ width: 1440, height: 900 });
  const escritas: string[] = [];
  let aposOClique = false;
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (aposOClique && ["POST", "PATCH", "DELETE"].includes(r.method()) && pathname.startsWith("/rest/v1/") && pathname !== "/rest/v1/rota_acessos") escritas.push(`${r.method()} ${pathname}`);
  });
  await page.goto(`/${CID}/anuncios?preset=30d`);
  // quick-ver-tudo: a leitura saiu do "Ver tudo"; o passo dela é a pílula de uma descoberta lá dentro, e a seta só abre um lugar da própria
  // página (o diagnóstico campanha a campanha). Nada é gravado nem enviado (CHAM-07).
  const detalhes = page.locator("[data-juntada] details#detalhes-anuncios");
  await expect(page.locator('[data-juntada] [data-peca="veredito"]:not([data-modo="carregando"])')).toBeVisible();
  await expect(detalhes).not.toHaveAttribute("open", /.*/);
  await detalhes.locator(":scope > summary").click();
  const daLeitura = page.locator('[data-juntada] [data-descoberta-extra^="leitura-"]').first();
  await expect(daLeitura.locator(".nx-acao-pilula").first()).toBeVisible();
  await page.screenshot({ path: "test-results/redesenho/pilula-anuncios.png" });
  await page.waitForLoadState("networkidle");
  aposOClique = true;
  await daLeitura.locator(".nx-acao-pilula__seta").first().click();
  await expect(detalhes).toHaveAttribute("open", /.*/);
  await expect(page.locator("[data-juntada] #campanhas-anuncios")).toBeInViewport();
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
  // Anúncios abre com o veredito (a leitura saiu em quick-ver-tudo). Antes esta linha achava a leitura de Por origem ainda na tela; com
  // Por origem também sem a caixa (quick-ver-tudo-abas), confere o veredito de Anúncios já carregado.
  await expect(page.locator('[data-juntada] [data-tela="anuncios"] [data-peca="veredito"]').first()).toBeVisible();
  await expect(page.locator('[data-juntada] [data-peca="veredito"]').first()).not.toHaveAttribute("data-modo", "carregando");
  // O mock tem 3 campanhas com atividade; o cartão "Investido" diz o mesmo número.
  // Formato 5 segundos: o cartão "Investido" à vista diz o número de campanhas (ou os dias de verba baixa); o de antes mora no "Ver tudo".
  await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao", { hasText: "Investido" }).locator(".nx-cartao__sub")).toContainText("3 campanhas");
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
  test(`${perfil}: Links abre na pasta com a descoberta do link que mais teve conversa, pílula de ação e cartões com ícone redondo`, async ({ page, context }) => {
    await abrirLinks(page, context, perfil);
    const nav = pasta(page, ORIGEM);
    await expect(aba(nav, "Links")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-juntada] .nx-pagina")).toHaveCount(1);
    // quick-ver-tudo-abas (João 13/11/2026): a caixa da leitura saiu; o fato dela que a aba não mostra é UMA descoberta no topo.
    await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
    const topo = page.locator('[data-juntada] [data-peca="descobertas-da-aba"]');
    await expect(topo).toHaveAttribute("data-modo", "pronta");
    // mockLinks: 61 conversas nos 4 links, 40 delas no link "Bio principal" (acima da base mínima de 5 conversas). Uma vez só na aba.
    const descoberta = topo.locator('[data-peca="descoberta"]', { hasText: /O link com mais conversas é “Bio principal”/ });
    await expect(descoberta).toBeVisible();
    await expect(page.locator("[data-juntada]").getByText(/O link com mais conversas é “Bio principal”/)).toHaveCount(1);
    await expect(descoberta.locator("[data-numero-de-destaque]", { hasText: "40 de 61 conversas" })).toBeVisible();
    await expect(descoberta.getByText("Social media")).toBeVisible();
    await expect(descoberta.locator(".nx-acao-pilula").first()).toBeVisible();
    await confereIconesDosCartoes(page, "links");
    await expect(page.locator("[data-juntada] .nx-pagina__cartoes .nx-cartao")).toHaveCount(4);
    // A tabela crua virou NxTabela, dentro dos Detalhes.
    expect(await page.locator("[data-juntada] table").evaluateAll((ts) => ts.filter((x) => !x.closest('[data-peca="tabela"]')).length)).toBe(0);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("Links sem nenhum link criado: \"Falta dado:\" para a equipe Doctor Creator, e só a equipe vê o Gerador à vista", async ({ page, context }) => {
  await abrirLinks(page, context, "viewer", "vazio");
  // quick-ver-tudo-abas: sem a caixa da leitura, o "Falta dado" é UMA descoberta no topo, com quem resolve e o passo.
  const leitura = page.locator('[data-juntada] [data-peca="descobertas-da-aba"] [data-peca="descoberta"]').first();
  await expect(leitura.getByText(/^Falta dado: ainda não há link rastreado para esta clínica/)).toBeVisible();
  await expect(leitura.getByText("Equipe Doctor Creator")).toBeVisible();
  await expect(leitura.locator(".nx-acao-pilula")).toBeVisible();
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
  await expect(page.locator('[data-juntada] [data-peca="descobertas-da-aba"]')).toHaveAttribute("data-modo", "pronta");
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
    if (sub === "pacientes" || sub === "conteudo" || sub === "anuncios") {
      // Formato 5 segundos (03.1.1.1, planos 05, 07 e 09): o veredito abre a tela, a leitura (e a pílula dela) mora no "Ver tudo" e os números são no máximo 3.
      const veredito = page.locator('[data-juntada] [data-peca="veredito"]').first();
      await expect(veredito).toBeVisible();
      await expect(veredito).not.toHaveAttribute("data-modo", "carregando");
    } else if (ABAS_SEM_LEITURA.has(sub)) {
      await expect(page.locator('[data-juntada] [data-peca="leitura"]')).toHaveCount(0);
      const topo = page.locator('[data-juntada] [data-peca="descobertas-da-aba"]');
      await expect(topo).toHaveAttribute("data-modo", "pronta");
      await expect(topo.locator('[data-peca="descoberta"] .nx-acao-pilula').first(), `/${sub}: sem pílula de ação nas descobertas`).toBeVisible();
    } else {
      const leitura = page.locator('[data-juntada] [data-peca="leitura"]').first();
      await expect(leitura).toBeVisible();
      await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
      await expect(leitura.locator(".nx-acao-pilula").first(), `/${sub}: sem pílula de ação na leitura`).toBeVisible();
    }
    const cartoes = page.locator("[data-juntada] .nx-pagina__cartoes > *");
    const total = await cartoes.count();
    expect(total).toBeLessThanOrEqual(sub === "pacientes" || sub === "conteudo" || sub === "anuncios" ? 3 : 4);
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

// --- 03.1.1-08: Conteúdo e Configurar CRM (grupos da equipe, D-02 com a emenda de 11/11/2026) ---
for (const id of ["conteudo", "configurar-crm"] as const) {
  const grupo = secaoDaEquipe(id);
  test(`admin: ${grupo.rotulo} abre em pasta com as ${grupo.abas.length} abas e cada parte abre a aba certa`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await ligarLog(context);
    const posts = capturarPosts(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const aba_ of grupo.abas) {
      await page.goto(`/${CID}${rotaDaLinha(aba_.partes[0].rota)}?preset=30d`);
      const nav = pasta(page, grupo.rotulo);
      await expect(nav).toBeVisible();
      await expect(rotulosDasAbas(nav)).toHaveText(grupo.abas.map((a) => a.rotulo));
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(aba(nav, aba_.rotulo)).toHaveAttribute("aria-current", "page");
      await expect(page.locator("[data-juntada]")).toHaveCount(1);
      await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", id);
      await expect(page.locator("[data-juntada] .nx-pasta__corpo")).toHaveAttribute("data-juntada-aba", aba_.id);
      await expect(page.getByText("Essa página não carregou")).toHaveCount(0);
      // O log grava o routeId da aba aberta (a pasta não muda o que o log guarda).
      await expect.poll(() => posts.find((p) => p.rota === aba_.partes[0].rota)?.origem, { message: aba_.rotulo }).toBeTruthy();
    }
    // Clicar numa aba: o período vai junto e o log grava menu com o routeId dela.
    await page.goto(`/${CID}${rotaDaLinha(grupo.abas[0].partes[0].rota)}?preset=7d`);
    const nav = pasta(page, grupo.rotulo);
    await expect(nav).toBeVisible();
    const segunda = grupo.abas[1];
    const antes = posts.length;
    await aba(nav, segunda.rotulo).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}${rotaDaLinha(segunda.partes[0].rota)}`);
    expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await expect.poll(() => posts.slice(antes).find((p) => p.rota === segunda.partes[0].rota)?.origem).toBe("menu");
  });
}

test("admin: /ideias?visao=semana (Planejar a semana) continua abrindo, na aba Ideias de Conteúdo", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/ideias?visao=semana&preset=30d`);
  await expect(aba(pasta(page, "Conteúdo"), "Ideias")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
  await page.goto(`/${CID}/ideias?visao=ideias&preset=30d`);
  await expect(aba(pasta(page, "Conteúdo"), "Ideias")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workspace-heading h1")).toHaveText("Encontrar ideias");
});

test("estrategista: Conteúdo sem a aba Criativa (só do admin) e Configurar CRM sem Etapas", async ({ page, context }) => {
  await mockAccount(context, "strategist");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/inspiracao?preset=30d`);
  await expect(rotulosDasAbas(pasta(page, "Conteúdo"))).toHaveText(["Referências", "Dúvidas", "Ideias"]);
  await expect(page.getByRole("link", { name: /^Criativa/ })).toHaveCount(0);
  await page.goto(`/${CID}/crm-guia?preset=30d`);
  await expect(rotulosDasAbas(pasta(page, "Configurar CRM"))).toHaveText(["Guia", "Papel do funil"]);
  await page.goto(`/${CID}/atendimento?preset=30d`);
  await expect(rotulosDasAbas(pasta(page, "Atendimento"))).toHaveText(["Qualidade", "Central", "Contatos"]);
});

test("viewer: /duvidas por link abre a tela sem a pasta da equipe e sem item de seção da equipe no menu", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/duvidas?preset=30d`);
  await expect(page.locator("main#workspace-content")).toBeVisible();
  await expect(page.locator(".workspace-heading h1")).toBeVisible();
  await expect(pasta(page, "Conteúdo")).toHaveCount(0);
  await expect(page.locator("[data-juntada]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^(Conteúdo|Atendimento|Configurar CRM)$/ })).toHaveCount(0);
});

// MEDV-04 / D-04 (emendado): as 10 abas da equipe ficam MEDIDAS e REGISTRADAS, sem limite. A asserção de 1,5 tela entra quando o
// plano 03.1 de cada tela a puser no molde (tabela "Quem põe cada aba da equipe no molde" em docs/redesenho/molde-da-pagina.md):
// quem fizer isso troca a anotação da aba por asserção aqui, com o mesmo `alturaDaAbaAberta`. As telas antigas ainda não são
// molde (não têm a leitura do molde), então a medida é a do elemento [data-juntada] (pasta e corpo) com a tela assentada e o
// Supabase falso (dados vazios onde o spec não tem mock): vale como ponto de partida, não como régua.
type LinhaDeAltura = {
  aba: string;
  rota: string;
  largura: number;
  altura: number;
  janela: number;
  razao: number;
  leitura: boolean;
  detalhes_abertos: number;
};
const ALTURAS_DA_EQUIPE: LinhaDeAltura[] = [];
const NOMES_DAS_ABAS = DA_EQUIPE.flatMap((s) => s.abas.map((a) => `${s.rotulo} › ${a.rotulo}`));

test.afterAll(() => {
  if (!ALTURAS_DA_EQUIPE.length) return;
  mkdirSync("test-results", { recursive: true });
  const ordem = (l: LinhaDeAltura) => NOMES_DAS_ABAS.indexOf(l.aba) * 10_000 + l.largura;
  const linhas = [...ALTURAS_DA_EQUIPE].sort((a, b) => ordem(a) - ordem(b));
  writeFileSync("test-results/alturas-equipe-03.1.1.json", `${JSON.stringify(linhas, null, 2)}\n`);
});

test("as 10 abas da equipe vêm do registro e a medida cobre todas", () => {
  expect(NOMES_DAS_ABAS).toEqual([
    "Conteúdo › Criativa", "Conteúdo › Referências", "Conteúdo › Dúvidas", "Conteúdo › Ideias",
    "Atendimento › Qualidade", "Atendimento › Central", "Atendimento › Contatos",
    "Configurar CRM › Guia", "Configurar CRM › Papel do funil", "Configurar CRM › Etapas",
  ]);
});

for (const { width, height } of TELAS_DE_MEDIDA) {
  for (const grupo of DA_EQUIPE) {
    for (const aba_ of grupo.abas) {
      test(`MEDV-04: medida registrada de ${grupo.rotulo} › ${aba_.rotulo} em ${width}x${height} (sem limite, vira teste no plano 03.1 dela)`, async ({ page, context }) => {
        await mockAccount(context, "admin");
        await mockInstagram(context);
        await mockCrm(context);
        await mockPessoas(context);
        await page.setViewportSize({ width, height });
        const rota = aba_.partes[0].rota;
        await page.goto(`/${CID}${rotaDaLinha(rota)}?preset=30d`);
        const alvo = page.locator("[data-juntada]").first();
        await expect(alvo).toBeVisible();
        await expect(page.getByText("Essa página não carregou")).toHaveCount(0);
        // Espera a tela assentar: sem peça de carregando e sem rede pendente (o Supabase falso responde vazio ou recusa na hora).
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await expect(alvo.locator('[data-peca="carregando"], [data-peca="leitura"][data-modo="carregando"]')).toHaveCount(0);
        await page.waitForTimeout(500);
        const medida = await alvo.evaluate((el) => ({ altura: el.getBoundingClientRect().height, janela: innerHeight }));
        const detalhesAbertos = await alvo.locator("details[open]").count();
        const leitura = (await alvo.locator('[data-peca="leitura"]').count()) > 0;
        ALTURAS_DA_EQUIPE.push({
          aba: `${grupo.rotulo} › ${aba_.rotulo}`,
          rota,
          largura: width,
          altura: Math.round(medida.altura),
          janela: medida.janela,
          razao: Math.round((medida.altura / medida.janela) * 100) / 100,
          leitura,
          detalhes_abertos: detalhesAbertos,
        });
        console.log(`altura-equipe aba=${grupo.rotulo}/${aba_.rotulo} largura=${width} altura=${Math.round(medida.altura)} janela=${medida.janela} razao=${(medida.altura / medida.janela).toFixed(2)} leitura=${leitura}`);
        expect(medida.altura).toBeGreaterThan(0);
        expect(await semRolagemLateral(page)).toBe(true);
      });
    }
  }
}
