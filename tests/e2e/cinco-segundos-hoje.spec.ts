import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockAnuncios, mockCrm, mockInstagram, mockPessoas } from "./apoio-telas-juntadas";

// A Hoje no formato 5 segundos, parte da nota do dia e da prova (Phase 03.1.1.1, plano 02, D-03): o veredito é o anel da nota (0 a 100)
// com a palavra da faixa e UMA frase; tocar no anel abre o que ajudou (▲), o que puxou para baixo (▼), os sinais sem dado e a regra do Nexo;
// tocar de novo fecha. Dados fictícios (os mocks do hoje.spec), só leitura; nenhum número ou nome dos pilotos entra aqui.

test.use({ reducedMotion: "reduce" });

const hoje = (page: Page) => page.locator('[data-tela="hoje"]');
const anel = (page: Page) => hoje(page).locator("button.nx-nota__anel");
const painel = (page: Page) => hoje(page).locator('[data-peca="nota-fatores"]');

/** Os mesmos dados realistas do hoje.spec: Instagram, pessoas, anúncios e CRM. */
async function dadosRealistas(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
}

test("(a) o veredito é o anel da nota: um número de 0 a 100 (ou Falta dado) e a palavra da faixa", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);

  await expect(anel(page)).toBeVisible();
  const numero = hoje(page).locator(".nx-nota__numero");
  const falta = hoje(page).locator(".nx-nota__falta");
  if (await numero.count()) {
    const n = Number((await numero.innerText()).trim());
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(100);
    await expect(hoje(page).locator(".nx-veredito .nx-selo__texto")).toHaveText(/^(Ruim|Atenção|Bom|Ótimo)$/);
  } else {
    await expect(falta).toHaveText("Falta dado");
    await expect(hoje(page).locator(".nx-veredito .nx-selo__texto")).toHaveText("Falta dado");
  }
  // O anel é o primeiro número do veredito; a frase fica ao lado (uma frase só).
  await expect(hoje(page).locator(".nx-veredito__frase")).toHaveCount(1);
});

test("(b) tocar no anel abre a regra do Nexo (não garante resultado) e tocar de novo fecha", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);

  const botao = anel(page);
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(painel(page)).toBeHidden();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(painel(page)).toBeVisible();
  await expect(painel(page)).toContainText("Regra do Nexo");
  await expect(painel(page)).toContainText("não garante resultado");
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(painel(page)).toBeHidden();
});
