import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { abrirVerTudo, cortesEm } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03): o veredito abre a tela com os 3 anéis (Conversas, Agendaram,
// Fecharam) contra o período anterior da própria clínica; tudo o que a tela mostrava antes mora no "Ver tudo", fechado. Dados fictícios.

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="resultados"]';
const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);

/**
 * Histórico diário do próprio spec: o período atual (os 29 dias fechados) tem 50% mais conversas, 25% menos agendamentos e metade dos
 * fechados do período anterior (de mesmo tamanho). Registrado depois dos mocks compartilhados, por isso vale no lugar deles.
 */
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

const aneis = (page: Page) => page.locator(`${RAIZ} .nx-aneis__anel`);

test("Resultados abre com o veredito e os 3 anéis, e cada anel abre e fecha a própria área", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosDoSpec(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(aneis(page)).toHaveCount(3);

  // O veredito é o primeiro bloco depois do cabeçalho, com a palavra e UMA frase com o número.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-veredito__texto .nx-selo")).toContainText("Atenção");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText("Chegaram 50% mais conversas, mas fecharam só 29 contra 58.");
  // Os anéis estão dentro do veredito, na ordem do funil, cada um com o selo da própria etapa contra o período anterior.
  await expect(veredito.locator(".nx-aneis__anel")).toHaveCount(3);
  await expect(aneis(page).nth(0)).toContainText("Conversas");
  await expect(aneis(page).nth(0)).toContainText("Em alta");
  await expect(aneis(page).nth(1)).toContainText("Agendaram");
  await expect(aneis(page).nth(1)).toContainText("Em queda");
  await expect(aneis(page).nth(2)).toContainText("Fecharam");
  await expect(aneis(page).nth(2)).toContainText("Em queda");
  // O número do centro é o mesmo do cartão de pessoas (120 pessoas no mock), e a passagem entre os anéis aparece com o texto.
  await expect(aneis(page).nth(0).locator(".nx-aneis__valor")).toHaveText("120");
  await expect(page.locator(`${RAIZ} .nx-aneis__passagem-texto`).first()).toContainText("seguem");

  // Tocar num anel abre UMA área com a linha de 30 dias e as barras "agora" e "antes"; tocar de novo fecha.
  const detalhe = page.locator(`${RAIZ} [data-peca="anel-detalhe"]`);
  await expect(detalhe).toBeHidden();
  await aneis(page).nth(0).click();
  await expect(aneis(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(detalhe).toBeVisible();
  await expect(detalhe.locator('[data-peca="linha-30-dias"]')).toBeVisible();
  await expect(detalhe.locator(".nx-barras__item")).toHaveCount(2);
  await aneis(page).nth(2).click();
  await expect(aneis(page).nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(detalhe).toContainText("Fecharam: 29 agora, 58 antes");
  await aneis(page).nth(2).click();
  await expect(detalhe).toBeHidden();

  // Tudo o que a tela mostrava mora no "Ver tudo": os 4 cartões de pessoas, o gráfico de contatos e a leitura.
  const verTudo = page.locator(`${RAIZ} details:has(> summary b:text-is("Ver tudo"))`);
  await expect(verTudo).toHaveCount(1);
  expect(await verTudo.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await abrirVerTudo(page, RAIZ);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true })).toBeVisible();
  await expect(page.locator(`${RAIZ} .nx-pagina__detalhe .nx-kpi .ws-metric-value`).first()).toHaveText("120");
  await expect(page.locator(`${RAIZ} .nx-pagina__detalhe #todas-analises`)).toHaveCount(1);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`${perfil} a ${janela.width}x${janela.height}: Resultados com Ver tudo fechado cabe em ${LIMITE_DE_ALTURA} vez a janela, sem rolar de lado e sem nada cortado`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosDoSpec(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}?preset=30d`);
      await expect(aneis(page)).toHaveCount(3);

      const { altura, janela: altJanela } = await alturaDaAbaAberta(page, RAIZ);
      console.log(`  Resultados (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${altJanela} (${(altura / altJanela).toFixed(2)}x)`);
      expect(altura, `Resultados mede ${Math.round(altura)} px; o limite é ${LIMITE_DE_ALTURA} x ${altJanela}`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altJanela);
      expect(await semRolagemLateral(page)).toBe(true);
      expect(await cortesEm(page, RAIZ), "nada pode ficar cortado").toEqual([]);
      if (perfil === "admin") await page.screenshot({ path: `test-results/redesenho/resultados-5s-${janela.width}.png`, fullPage: true });
    });
  }
}
