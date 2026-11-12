import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { GUARDA_SEM_COMPARAR_CLINICAS } from "../../src/lib/leitura/cinco-segundos";
import { mockAccount } from "./fixtures";
import { mockCarteira, mockConferencia, mockIntegracoes } from "./admin-dados";
import { textoVisivel } from "./apoio-cinco-segundos";

// A Carteira da equipe no formato 5 segundos (Phase 03.1.1.1, D-07): o veredito diz quantas clínicas precisam de você hoje e por qual
// começar, a lista segue a urgência (problemas abertos), e nenhuma clínica recebe posição, ranking ou comparação (D-02).
// Só as clínicas de mentira de tests/e2e/admin-dados.ts: nenhum dado real.

const RAIZ = ".adm-carteira";
const LISTA = 'section[aria-label="Clínicas da carteira"]';

async function abrir(page: Page, context: BrowserContext, width = 1440) {
  await mockAccount(context, "admin");
  await mockCarteira(context);
  await mockConferencia(context);
  await mockIntegracoes(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/admin");
  const linhas = page.locator(`${LISTA} .adm-linha`);
  await expect(linhas).toHaveCount(6);
  await expect(page.getByText("Lendo as fontes…")).toHaveCount(0);
  // Espera a leitura de dado com erro (Dra. Carla) e o último acesso (Dra. Ana) chegarem às linhas.
  await expect(linhas.filter({ hasText: "Dra. Carla Mendes" })).toContainText("1 dado com erro");
  await expect(linhas.filter({ hasText: "Dra. Ana Souza" })).toContainText("Não entra há 37 dias");
  await expect(page.locator('[data-peca="veredito"][data-modo="carregando"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  return linhas;
}

for (const width of [375, 1440]) {
  test(`Carteira abre com o veredito e a lista por urgência em ${width}px`, async ({ page, context }) => {
    const linhas = await abrir(page, context, width);

    // O veredito vem primeiro e diz quantas clínicas precisam de você e por qual começar.
    const veredito = page.locator('[data-peca="veredito"]').first();
    await expect(veredito).toBeVisible();
    await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^\d+ clínicas? precisa(m)? de você hoje$/);
    await expect(veredito.locator(".nx-veredito__apoio")).toHaveText(/^Comece pela Dra\. Carla Mendes: 2 problemas abertos, nota das fontes \d+\.$/);

    // A lista segue os problemas abertos: Carla (2 alertas, nota mais baixa), Ana (2), depois quem tem 1 e, por último, quem não tem nenhum.
    await expect(linhas.nth(0)).toContainText("Dra. Carla Mendes");
    await expect(linhas.nth(1)).toContainText("Dra. Ana Souza");
    await expect(linhas.nth(5)).toContainText("Clínica Sorriso");

    // Nenhuma posição, ranking ou comparação com outras clínicas (D-02).
    const textoDaLista = await textoVisivel(page.locator(RAIZ));
    expect(textoDaLista).not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);
    expect(textoDaLista).not.toMatch(/(^|\s)(\d+º|#\s?\d+)(\s|$)/);
    expect(textoDaLista).not.toMatch(/ranking|posição/i);

    // As opções de ordem falam de urgência e de saúde dos dados, nunca de desempenho (I-1).
    const opcoes = await page.locator(".adm-ordem select option").allInnerTexts();
    expect(opcoes).toEqual(["Mais problemas abertos", "Saúde das fontes: pior primeiro", "Nota da saúde dos dados (menor primeiro)", "Nome"]);
    // A nota da linha diz que é saúde dos dados.
    await expect(linhas.nth(0)).toContainText(/Dados \d+ · /);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
