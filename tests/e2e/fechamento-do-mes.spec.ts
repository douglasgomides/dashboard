import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { GUARDA_SEM_COMPARAR_CLINICAS, checarFraseCinco } from "../../src/lib/leitura/cinco-segundos";
import { cortesEm } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, alturaDaAbaAberta, mockAnuncios, mockCrm, mockInstagram, mockPessoas } from "./apoio-telas-juntadas";

// Fechamento do mês (Phase 03.1.1.1, plano 08, D-06, D-04): uma história em tela cheia que abre a partir de Resultados da clínica, um número
// por cartão, só a própria clínica contra o período anterior dela, sem compartilhar, exportar ou enviar. Dados fictícios (os mocks dos specs
// de Resultados): nenhum número, nome ou legenda dos pilotos entra aqui.

const RAIZ = '[data-tela="resultados"]';
const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);

/** Histórico diário do spec: o período atual tem 50% mais conversas que o anterior, de mesmo tamanho. */
async function historicoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      dia: dia(i), mandaram_mensagem: i < 30 ? 30 : 20, leads_novos: 12, antigos: 8, agendaram: i < 30 ? 3 : 4, negociacao: 2, compareceram: null, fecharam: i < 30 ? 1 : 2,
    }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

async function dadosDoSpec(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
  await historicoDoSpec(context);
}

const historia = (page: Page) => page.locator('dialog[data-peca="historia-do-mes"]');
const botaoDeEntrada = (page: Page) => page.getByRole("button", { name: "Fechamento do mês" });
const posicao = (page: Page) => historia(page).locator('[role="status"]');

async function abrir(page: Page, perfil: "admin" | "viewer", context: BrowserContext, caminho = `/${CID}?preset=30d`) {
  await mockAccount(context, perfil);
  await dadosDoSpec(context);
  await page.goto(caminho);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]`)).toHaveAttribute("data-modo", "veredito");
  await botaoDeEntrada(page).click();
  await expect(historia(page)).toBeVisible();
}

test.describe("com menos movimento (reduce)", () => {
  test.use({ reducedMotion: "reduce" });

  for (const perfil of ["viewer", "admin"] as const) {
    test(`${perfil}: o botão de Resultados abre a história; setas e Esc funcionam e o foco volta ao botão`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await abrir(page, perfil, context);
      expect(new URL(page.url()).pathname, "nenhuma rota nova: a história abre sobre Resultados").toBe(`/${CID}`);

      await expect(posicao(page)).toHaveText(/^Cartão 1 de \d+$/);
      const total = Number((await posicao(page).innerText()).match(/de (\d+)/)![1]);
      expect(total).toBeGreaterThanOrEqual(3);

      await page.keyboard.press("ArrowRight");
      await expect(posicao(page)).toHaveText(`Cartão 2 de ${total}`);
      await expect(historia(page).locator('[data-peca="cartao-da-historia"]')).toHaveAttribute("data-id", "alcance");
      await page.keyboard.press("ArrowLeft");
      await expect(posicao(page)).toHaveText(`Cartão 1 de ${total}`);

      await page.keyboard.press("Escape");
      await expect(historia(page)).toBeHidden();
      await expect(botaoDeEntrada(page)).toBeFocused();
    });
  }

  test("sem movimento nada passa sozinho: depois de 8 segundos o cartão é o mesmo", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page, "viewer", context);
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
    await page.waitForTimeout(8000);
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
    // Sem avanço sozinho não há o que pausar.
    await expect(historia(page).getByRole("button", { name: "Pausar" })).toHaveCount(0);
  });

  const JANELAS = [
    { width: 375, height: 812 },
    { width: 1440, height: 900 },
  ] as const;
  const SEM_NUMERO = ["abertura", "apostas", "final"];
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();

  // Cada cartão: um número grande só (ou nenhum nos de texto), texto que passa nas guardas, cabe na janela sem rolar e nada cortado.
  for (const perfil of ["viewer", "admin"] as const) {
    for (const janela of JANELAS) {
      test(`${perfil} a ${janela.width}x${janela.height}: cada cartão tem um número só, cabe na janela e nada fica cortado`, async ({ page, context }) => {
        await page.setViewportSize(janela);
        await abrir(page, perfil, context);
        const total = Number((await posicao(page).innerText()).match(/de (\d+)/)![1]);
        expect(total, "a história tem pelo menos 5 cartões com os dados do spec").toBeGreaterThanOrEqual(5);
        const vistos: string[] = [];
        for (let k = 0; k < total; k++) {
          await expect(posicao(page)).toHaveText(`Cartão ${k + 1} de ${total}`);
          const cartao = historia(page).locator('[data-peca="cartao-da-historia"]');
          const id = (await cartao.getAttribute("data-id"))!;
          vistos.push(id);
          const numeros = cartao.locator('[data-peca="numero-do-cartao"]');
          await expect(numeros, `o cartão ${id} tem ${SEM_NUMERO.includes(id) ? "nenhum número grande" : "um número grande só"}`).toHaveCount(SEM_NUMERO.includes(id) ? 0 : 1);
          if (!SEM_NUMERO.includes(id)) {
            const n = norm(await numeros.innerText());
            expect(n, `o cartão ${id} nunca mostra 0 no lugar de dado que falta`).not.toMatch(/^(R\$\s?)?0([,.]0+)?$/);
          }
          const legenda = norm(await cartao.locator(".nx-historia__legenda").innerText());
          expect(checarFraseCinco(legenda), `legenda do cartão ${id}: "${legenda}"`).toEqual([]);
          const chip = cartao.locator(".nx-historia__chip");
          if ((await chip.count()) > 0) expect(checarFraseCinco(norm(await chip.innerText())), `comparação do cartão ${id}`).toEqual([]);
          // D-02: só a própria clínica contra o período anterior dela.
          expect(norm(await cartao.innerText()), `o cartão ${id} compara com outras clínicas`).not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);
          // Cabe na janela: o palco do cartão não rola e a moldura não corta nada.
          const medida = await historia(page).locator(".nx-historia__palco").evaluate((el) => ({ h: [el.scrollHeight, el.clientHeight], w: [el.scrollWidth, el.clientWidth] }));
          expect(medida.h[0], `o cartão ${id} rola por dentro (${medida.h[0]} > ${medida.h[1]})`).toBeLessThanOrEqual(medida.h[1] + 1);
          expect(medida.w[0], `o cartão ${id} corta de lado`).toBeLessThanOrEqual(medida.w[1] + 1);
          expect(await cortesEm(page, 'dialog[data-peca="historia-do-mes"]'), `nada pode ficar cortado no cartão ${id}`).toEqual([]);
          // Toda fonte tem pelo menos 14 px.
          const menor = await cartao.evaluate((el) => Math.min(...Array.from(el.querySelectorAll("p, b, span, dt, dd, blockquote, li")).filter((x) => (x.textContent ?? "").trim() && x.getClientRects().length).map((x) => parseFloat(getComputedStyle(x).fontSize))));
          expect(menor, `texto menor que 14 px no cartão ${id}`).toBeGreaterThanOrEqual(14);
          if (k < total - 1) await page.keyboard.press("ArrowRight");
        }
        expect(vistos[0]).toBe("abertura");
        expect(vistos[vistos.length - 1]).toBe("final");
        for (const esperado of ["alcance", "whatsapp", "apostas"]) expect(vistos, `o cartão ${esperado} aparece com os dados do spec`).toContain(esperado);
      });
    }
  }

  test("o cartão final só tem Ver de novo e Sair: nada de compartilhar, PDF ou enviar", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page, "admin", context);
    const total = Number((await posicao(page).innerText()).match(/de (\d+)/)![1]);
    for (let k = 1; k < total; k++) await page.keyboard.press("ArrowRight");
    await expect(posicao(page)).toHaveText(`Cartão ${total} de ${total}`);
    const botoes = (await historia(page).getByRole("button").allInnerTexts()).map((t) => norm(t.replace(/[‹›]/g, "")));
    expect(botoes.sort(), "no cartão final só Anterior (navegação), Ver de novo e Sair").toEqual(["Anterior", "Sair", "Ver de novo"]);
    await expect(historia(page).locator('a, [role="link"], input, select, textarea')).toHaveCount(0);
    expect(norm(await historia(page).innerText())).not.toMatch(/compartilh|baixar|pdf|enviar|exportar/i);
    // Ver de novo volta ao primeiro cartão e Sair fecha, com o foco no botão de entrada.
    await historia(page).getByRole("button", { name: "Ver de novo" }).click();
    await expect(posicao(page)).toHaveText(`Cartão 1 de ${total}`);
    for (let k = 1; k < total; k++) await page.keyboard.press("ArrowRight");
    await historia(page).getByRole("button", { name: "Sair" }).click();
    await expect(historia(page)).toBeHidden();
    await expect(botaoDeEntrada(page)).toBeFocused();
  });

  test("a Hoje e o Fechamento dizem a mesma primeira frase: a primeira aposta é a primeira descoberta da Hoje", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAccount(context, "viewer");
    await dadosDoSpec(context);
    await page.goto(`/${CID}/hoje?preset=30d`);
    const primeira = page.locator('[data-tela="hoje"] [data-peca="descoberta"] .nx-descoberta__frase').first();
    await expect(primeira).toBeVisible();
    const fraseDaHoje = norm(await primeira.innerText());
    expect(fraseDaHoje.length).toBeGreaterThan(0);
    await page.goto(`/${CID}?preset=30d`);
    await expect(page.locator(`${RAIZ} [data-peca="veredito"]`)).toHaveAttribute("data-modo", "veredito");
    await botaoDeEntrada(page).click();
    const total = Number((await posicao(page).innerText()).match(/de (\d+)/)![1]);
    for (let k = 1; k < total; k++) {
      await page.keyboard.press("ArrowRight");
      if ((await historia(page).locator('[data-peca="cartao-da-historia"]').getAttribute("data-id")) === "apostas") break;
    }
    const aposta = historia(page).locator(".nx-historia__apostas li").first();
    await expect(aposta).toBeVisible();
    expect(norm(await aposta.locator("span:not(.nx-historia__aposta-n)").innerText())).toBe(fraseDaHoje);
    await expect(historia(page).locator(".nx-historia__apostas li")).toHaveCount(3);
  });

  test("com o período de 7 dias o botão leva ao preset de 30 dias e abre a história depois que o dado carrega", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAccount(context, "viewer");
    await dadosDoSpec(context);
    await page.goto(`/${CID}?preset=7d`);
    await expect(page.locator(`${RAIZ} [data-peca="veredito"]`)).toHaveAttribute("data-modo", "veredito");
    await expect(botaoDeEntrada(page)).toHaveAttribute("title", "O fechamento usa os últimos 30 dias");
    await botaoDeEntrada(page).click();
    await expect(historia(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("preset"), "o fechamento usa o preset de 30 dias do próprio seletor de período").toBe("30d");
    await expect(posicao(page)).toHaveText(/^Cartão 1 de \d+$/);
    await expect(historia(page).locator('[data-peca="cartao-da-historia"] .nx-historia__legenda').first()).toContainText("seus últimos 29 dias chegaram");
    await page.keyboard.press("Escape");
    await expect(historia(page)).toBeHidden();
    await expect(botaoDeEntrada(page)).toBeFocused();
  });

  for (const janela of JANELAS) {
    test(`Resultados com a história fechada continua dentro de 1,5 vez a janela a ${janela.width}x${janela.height}`, async ({ page, context }) => {
      await page.setViewportSize(janela);
      await mockAccount(context, "admin");
      await dadosDoSpec(context);
      await page.goto(`/${CID}?preset=30d`);
      await expect(botaoDeEntrada(page)).toBeVisible();
      const { altura, janela: altura_da_janela } = await alturaDaAbaAberta(page, RAIZ);
      expect(altura, `Resultados mede ${Math.round(altura)} px; o limite é ${LIMITE_DE_ALTURA} x ${altura_da_janela}`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altura_da_janela);
      expect(await cortesEm(page, RAIZ), "nada pode ficar cortado").toEqual([]);
    });
  }
});

test.describe("com movimento permitido", () => {
  test.use({ reducedMotion: "no-preference" });

  const quadro = (page: Page) => historia(page).locator(".nx-historia__tela");
  const numeroDoCartao = async (page: Page) => Number((await posicao(page).innerText()).match(/Cartão (\d+)/)![1]);

  test("arrastar para a esquerda avança, tocar na esquerda volta e tocar no resto avança", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.clock.install();
    await abrir(page, "viewer", context);
    const caixa = (await quadro(page).boundingBox())!;
    const y = caixa.y + caixa.height * 0.5;
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
    // Arrastar mais de 40 px para a esquerda: próximo.
    await page.mouse.move(caixa.x + caixa.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width * 0.7 - 120, y, { steps: 6 });
    await page.mouse.up();
    await expect(posicao(page)).toHaveText(/^Cartão 2 de/);
    // Tocar na faixa da esquerda (30%): anterior.
    await page.mouse.click(caixa.x + caixa.width * 0.1, y);
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
    // Tocar na direita: próximo.
    await page.mouse.click(caixa.x + caixa.width * 0.85, y);
    await expect(posicao(page)).toHaveText(/^Cartão 2 de/);
    // Arrastar para a direita: anterior.
    await page.mouse.move(caixa.x + caixa.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width * 0.3 + 120, y, { steps: 6 });
    await page.mouse.up();
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
  });

  test("com movimento o cartão passa sozinho; Pausar para, Continuar segue e a barra de espaço alterna", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await abrir(page, "viewer", context);
    await expect(posicao(page)).toHaveText(/^Cartão 1 de/);
    // Passa sozinho depois de 7 segundos.
    await page.clock.fastForward(8000);
    await expect.poll(() => numeroDoCartao(page)).toBe(2);

    // Pausar: o cartão fica.
    const pausar = historia(page).getByRole("button", { name: "Pausar" });
    await pausar.click();
    await expect(historia(page).getByRole("button", { name: "Continuar" })).toHaveAttribute("aria-pressed", "true");
    await page.clock.fastForward(9000);
    await page.clock.fastForward(9000);
    expect(await numeroDoCartao(page), "pausado: o cartão não muda").toBe(2);

    // Continuar: volta a passar.
    await historia(page).getByRole("button", { name: "Continuar" }).click();
    await page.clock.fastForward(8000);
    await expect.poll(() => numeroDoCartao(page)).toBe(3);

    // Barra de espaço pausa e continua (o foco está na tela, não em um botão).
    await page.keyboard.press("Space");
    await expect(historia(page).getByRole("button", { name: "Continuar" })).toBeVisible();
    await page.clock.fastForward(9000);
    expect(await numeroDoCartao(page), "pausado pela barra de espaço: o cartão não muda").toBe(3);
    await page.keyboard.press("Space");
    await expect(historia(page).getByRole("button", { name: "Pausar" })).toBeVisible();
    await page.clock.fastForward(8000);
    await expect.poll(() => numeroDoCartao(page)).toBe(4);
  });

  test("segurar o dedo na tela pausa; soltar sem arrastar depois de um tempo não muda de cartão", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.clock.install();
    await abrir(page, "viewer", context);
    const caixa = (await quadro(page).boundingBox())!;
    const y = caixa.y + caixa.height * 0.5;
    await page.mouse.move(caixa.x + caixa.width * 0.7, y);
    await page.mouse.down();
    await page.clock.fastForward(1000);
    await page.mouse.up();
    // Segurar mais de 450 ms só pausa: continua no cartão 1.
    expect(await numeroDoCartao(page)).toBe(1);
  });
});
