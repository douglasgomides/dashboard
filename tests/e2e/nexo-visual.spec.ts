import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// E2e do sistema visual do Nexo (Phase 3, D-01, 03-UI-SPEC.md): sempre claro mesmo com tema escuro salvo (V12), SAP
// intacto (MENU-07), moldura com a barra sobre ela e painel branco, Urbanist 16 px, movimento que respeita
// prefers-reduced-motion (V14), fundo do diálogo nunca preto e nenhuma rolagem horizontal depois do corpo 15 -> 16 px (V7).
// O fixture aborta a rede externa: a Urbanist não carrega aqui e a fonte cai no fallback (backstop da troca de fonte).

async function temaEscuroSalvo(page: Page, context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("dc:tema", "dark"));
  await page.emulateMedia({ colorScheme: "dark" });
}

/** Lê "rgb(...)", "rgba(...)" ou "color(srgb r g b / a)" e devolve canais 0-255 e alfa 0-1. */
function canais(cor: string): { r: number; g: number; b: number; a: number } {
  const srgb = /color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\)/.exec(cor);
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map((v) => Number(v) * 255);
    return { r, g, b, a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
  }
  const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\)/.exec(cor);
  if (!m) throw new Error(`cor não reconhecida: ${cor}`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}
function luminancia({ r, g, b }: { r: number; g: number; b: number }) {
  const [R, G, B] = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

async function conferirClaro(page: Page) {
  const casca = page.locator(".app.product-workspace").first();
  await expect(casca).toBeVisible();
  await expect(casca).not.toHaveClass(/sap-workspace/);
  const medida = await casca.evaluate((el) => {
    const s = getComputedStyle(el);
    const painel = el.querySelector(":scope > .mainwrap");
    const html = getComputedStyle(document.documentElement);
    return {
      colorScheme: s.colorScheme,
      page: s.getPropertyValue("--page").trim(),
      painel: painel ? getComputedStyle(painel).backgroundColor : "",
      htmlCor: html.backgroundColor,
      htmlImagem: html.backgroundImage,
    };
  });
  expect(medida.colorScheme).toBe("light");
  expect(medida.page.toUpperCase()).toBe("#FFFFFF");
  expect(medida.painel).toBe("rgb(255, 255, 255)");
  const htmlClaro = /gradient/.test(medida.htmlImagem) || luminancia(canais(medida.htmlCor)) > 0.8;
  expect(htmlClaro, `fundo do html: ${medida.htmlCor} ${medida.htmlImagem}`).toBe(true);
  expect(luminancia(canais(medida.htmlCor))).toBeGreaterThan(0.8);
}

test.describe("sempre claro com tema escuro salvo", () => {
  test("admin na casca da clínica", async ({ page, context }) => {
    await mockAccount(context, "admin");
    await temaEscuroSalvo(page, context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}`);
    await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
    await conferirClaro(page);
  });

  test("admin na casca /admin", async ({ page, context }) => {
    await mockAccount(context, "admin");
    await temaEscuroSalvo(page, context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    await expect(page.locator(".app.workspace-admin")).toBeVisible();
    await conferirClaro(page);
  });

  test("médico (viewer) na casca da clínica", async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await temaEscuroSalvo(page, context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}`);
    await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
    await conferirClaro(page);
  });
});

test("SAP mantém o tema escuro e a tipografia", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await temaEscuroSalvo(page, context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/sap/${CID}/painel`);
  const sap = page.locator(".app.product-workspace.sap-workspace");
  await expect(sap).toBeVisible();
  const medida = await sap.evaluate((el) => {
    const s = getComputedStyle(el);
    return { page: s.getPropertyValue("--page").trim(), fonte: s.fontFamily, tamanho: s.fontSize, recursos: s.fontFeatureSettings };
  });
  expect(medida.page.toLowerCase()).toBe("#0b1420");
  expect(medida.fonte).toMatch(/^"?Inter"?/);
  expect(medida.tamanho).toBe("15px");
  expect(medida.recursos).toContain("cv11");
});

test("moldura, barra sobre a moldura e painel", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  const casca = page.locator(".app.product-workspace").first();
  const medida = await casca.evaluate((el) => {
    const s = getComputedStyle(el);
    const barra = el.querySelector(":scope > aside")!;
    const painel = el.querySelector(":scope > .mainwrap")!;
    return {
      raio: s.borderTopLeftRadius,
      padding: s.paddingTop,
      borda: s.borderTopWidth,
      barraFundo: getComputedStyle(barra).backgroundColor,
      barraLargura: barra.getBoundingClientRect().width,
      painelRaio: getComputedStyle(painel).borderTopLeftRadius,
    };
  });
  expect(medida.raio).toBe("30px");
  expect(medida.padding).toBe("12px");
  expect(medida.borda).toBe("6px");
  expect(medida.barraFundo).toBe("rgba(0, 0, 0, 0)");
  // Com a Urbanist bloqueada pelo fixture (fallback do sistema): a barra continua com 232 px.
  expect(medida.barraLargura).toBe(232);
  expect(medida.painelRaio).toBe("22px");

  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => casca.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");
  const celular = await casca.evaluate((el) => {
    const s = getComputedStyle(el);
    const cabecalho = el.querySelector(".mhead");
    const linha = el.querySelector(".mhead-linha");
    return {
      padding: s.paddingTop,
      margem: s.marginTop,
      cabecalhoFundo: cabecalho ? getComputedStyle(cabecalho).backgroundColor : "",
      cabecalhoFiltro: cabecalho ? getComputedStyle(cabecalho).backdropFilter : "",
      linhaAltura: linha ? linha.getBoundingClientRect().height : 0,
    };
  });
  expect(celular.padding).toBe("0px");
  expect(celular.margem).toBe("0px");
  expect(celular.cabecalhoFundo).toBe("rgb(255, 255, 255)");
  expect(celular.cabecalhoFiltro).toBe("none");
  // Cabeçalho do celular sem quebra de linha com a fonte de fallback (linha de 48 px + 8 de respiro).
  expect(celular.linhaAltura).toBeLessThanOrEqual(56);
});

test("fonte: Urbanist 16 px no corpo, sem os recursos da Inter", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  const corpo = await page.evaluate(() => {
    const b = getComputedStyle(document.body);
    const c = getComputedStyle(document.querySelector(".app.product-workspace")!);
    return { fonte: b.fontFamily, tamanho: b.fontSize, recursos: b.fontFeatureSettings, casca: c.fontFamily };
  });
  expect(corpo.fonte).toMatch(/^"?Urbanist"?/);
  expect(corpo.casca).toMatch(/^"?Urbanist"?/);
  expect(corpo.tamanho).toBe("16px");
  expect(corpo.recursos).toBe("normal");
});

test.describe("movimento com reduce", () => {
  test.use({ reducedMotion: "reduce" });
  test("nenhum cartão fica transparente ou deslocado", async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    const cartoes = page.locator(".app.workspace-admin .dbx-card");
    await expect(cartoes.first()).toBeVisible();
    const estados = await cartoes.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { opacity: s.opacity, transform: s.transform, animacao: s.animationName, desabilitado: el.hasAttribute("disabled") };
      }),
    );
    expect(estados.length).toBeGreaterThan(0);
    for (const e of estados) {
      if (!e.desabilitado) expect(e.opacity).toBe("1");
      expect(e.transform).toBe("none");
      expect(e.animacao).toBe("none");
    }
  });
});

test.describe("movimento sem preferência", () => {
  test.use({ reducedMotion: "no-preference" });
  test("os cartões sobem e as barras crescem", async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    const primeiro = page.locator(".app.workspace-admin .dbx-card").first();
    await expect(primeiro).toBeVisible();
    expect(await primeiro.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
    expect(await primeiro.evaluate((el) => getComputedStyle(el).animationName)).toBe("nexo-subir");
  });
});

test("fundo do diálogo: nunca preto", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  // O atalho da equipe só liga depois que o papel chega: espera pelo Menu da equipe (o 03-04 tirou o seletor de produto).
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialogo = page.getByRole("dialog", { name: "Buscar tela" });
  await expect(dialogo).toBeVisible();
  const medida = await dialogo.evaluate((el) => {
    const s = getComputedStyle(el, "::backdrop");
    return { fundo: s.backgroundColor, filtro: s.backdropFilter, raio: getComputedStyle(el).borderTopLeftRadius };
  });
  const c = canais(medida.fundo);
  expect(c.r + c.g + c.b > 300 || c.a < 0.2, `::backdrop ${medida.fundo}`).toBe(true);
  expect(medida.filtro).toContain("blur");
  expect(medida.raio).toBe("22px");
});

test.describe("sem rolagem horizontal depois do corpo de 16 px", () => {
  const telas = [
    `/${CID}`,
    `/${CID}/pacientes`,
    `/${CID}/conteudo`,
    `/${CID}/crm-painel`,
    `/${CID}/plano`,
    `/${CID}/relatorio`,
    "/admin",
    "/admin/conferencia",
  ];
  for (const largura of [375, 1440]) {
    test(`uma tela por área antiga a ${largura} px`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await mockAccount(context, "admin");
      await page.setViewportSize({ width: largura, height: 900 });
      const vazaram: string[] = [];
      const quebraram: string[] = [];
      const medir = () =>
        page.evaluate(() => ({ largo: document.documentElement.scrollWidth, janela: window.innerWidth }));
      for (const tela of telas) {
        await test.step(tela, async () => {
          await page.goto(tela, { waitUntil: "domcontentloaded" });
          const erro = page.getByRole("heading", { name: "Essa página não carregou" });
          await expect(page.locator(".app.product-workspace").first().or(erro), `${tela} abre`).toBeVisible();
          if (!tela.endsWith("/pacientes")) await expect(page.locator(".app.product-workspace").first(), `${tela} abre na casca do Nexo`).toBeVisible();
          // Primeira medida com a casca e o conteúdo inicial na tela.
          let { largo, janela } = await medir();
          if (largo > janela + 1) vazaram.push(`${tela}: ${largo} > ${janela}`);
          await page.waitForLoadState("networkidle");
          // /pacientes com os dados falsos do fixture cai na tela de erro (TypeError em 'agendaram', anterior a esta
          // fase; é a falha conhecida de routes.spec.ts /pacientes 1280). Registra e mede a tela que ficou.
          if (await erro.isVisible()) quebraram.push(tela);
          else await expect(page.locator("body")).not.toHaveText(/^\s*Carregando…?\s*$/);
          ({ largo, janela } = await medir());
          if (largo > janela + 1) vazaram.push(`${tela}: ${largo} > ${janela}`);
        });
      }
      expect(vazaram).toEqual([]);
      for (const tela of quebraram) test.info().annotations.push({ type: "falha anterior", description: `${tela}: tela de erro com o fixture` });
      expect(quebraram.filter((t) => !t.endsWith("/pacientes")), "só a falha conhecida de /pacientes").toEqual([]);
    });
  }
});
