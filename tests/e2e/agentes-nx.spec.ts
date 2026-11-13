import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Planejador da semana no desenho nx (Phase 3.1, plano 06, TELA-03). Em 11/11/2026 o João tirou os agentes do Nexo
// ("tira isso aí, ninguém usa"): saíram os painéis de Agentes e entregas, Gestor de anúncios, Recuperar hoje, Roteiros
// prontos e Estratégias e campanhas, e com eles os testes deles. Aqui só se confere o desenho do que ficou (vazio com
// "Quem resolve:" e nenhuma rolagem lateral).

/** Consultas vazias (o padrão do mockAccount) com o módulo do Hub ativo. */
async function mockPaineis(context: BrowserContext, profile: "admin" | "viewer") {
  await mockAccount(context, profile);
  await context.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rest/v1/cliente_modulos") return route.fulfill({ json: [{ modulo: "hub", status: "ativo" }, { modulo: "brand_brain", status: "ativo" }] });
    return route.fallback();
  });
}

/** Nenhum cartão Tailwind nem ws-panel dentro das peças do planejador, e nenhuma rolagem lateral. */
async function conferirDesenho(page: Page) {
  await expect(page.locator('[data-peca="agentes"]').first()).toBeVisible();
  await expect(page.locator('[data-peca="agentes"] .rounded-xl.border, [data-peca="agentes"] .ws-panel')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

const TELAS: { nome: string; caminho: string; planejador?: boolean }[] = [
  { nome: "Ideias (semana)", caminho: `/${CID}/ideias?visao=semana`, planejador: true },
];

for (const width of [375, 1440]) {
  test(`o planejador da semana mostra os painéis nx, com vazio que diz quem resolve, em ${width}px`, async ({ page, context }) => {
    await mockPaineis(context, "admin");
    await page.setViewportSize({ width, height: 900 });
    for (const tela of TELAS) {
      await page.goto(tela.caminho);
      if (tela.planejador) await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
      await conferirDesenho(page);
      // As consultas voltam vazias: o painel diz o que falta e quem resolve, e não mostra número inventado.
      await expect(page.getByText("Quem resolve:").first(), tela.nome).toBeVisible();
    }
  });
}
