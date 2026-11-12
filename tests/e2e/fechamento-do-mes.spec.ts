import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockAnuncios, mockCrm, mockInstagram, mockPessoas } from "./apoio-telas-juntadas";

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
      await expect(historia(page).locator('[data-peca="cartao-da-historia"]')).toHaveAttribute("data-id", "whatsapp");
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
});
