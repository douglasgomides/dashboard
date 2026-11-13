import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram } from "./instagram-dados";

// Telas de Marketing/Instagram no molde novo (Phase 3.1, plano 05): cada uma abre com o cabeçalho, a leitura do período no
// topo (o que aconteceu com o número ao lado, ou "Falta dado:" com quem resolve), até 4 cartões, um gráfico e o resto em
// Detalhes. Sem Recharts, sem tabela fora de NxTabela e sem rolagem lateral, em 375 e 1440 px.

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// Formato 5 segundos (03.1.1.1, plano 07): Desempenho abre com o veredito e 3 números; a leitura do período mora no "Ver tudo", fechado.
// quick-ver-tudo-abas (João 13/11/2026): as abas sem veredito perderam a caixa da leitura; o que ela dizia e a aba não mostra é
// descoberta no topo da aba (semLeitura), e o período mora uma vez só no começo dos Detalhes.
const TELAS: { rota: string; cartoes: number; pergunta: RegExp; cinco?: boolean; semLeitura?: boolean }[] = [
  { rota: "conteudo", cartoes: 3, pergunta: /^O perfil está crescendo/, cinco: true },
  { rota: "audiencia", cartoes: 4, pergunta: /^Quem acompanha o perfil/, semLeitura: true },
  { rota: "top", cartoes: 3, pergunta: /^Quais publicações mais se destacaram/, semLeitura: true },
  { rota: "posts", cartoes: 4, pergunta: /^O que foi publicado/, semLeitura: true },
  { rota: "conteudo-comercial", cartoes: 4, pergunta: /^O conteúdo está trazendo conversa/ },
];

for (const width of [375, 1440]) {
  for (const t of TELAS) {
    test(`/${t.rota}: leitura no topo, até 4 cartões, sem Recharts nem tabela crua e sem rolagem lateral em ${width}px`, async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockInstagram(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${CID}/${t.rota}?preset=30d`);

      await expect(page.getByRole("heading", { level: 1, name: t.pergunta })).toBeVisible();

      // A leitura do período é a primeira coisa depois do cabeçalho: "O que aconteceu" com o número ao lado,
      // ou "Falta dado:" com o motivo e quem resolve.
      const leitura = page.getByRole("region", { name: "Leitura do período", exact: true });
      const topoDaAba = page.locator('[data-peca="descobertas-da-aba"]');
      if (t.semLeitura) {
        await expect(leitura).toHaveCount(0);
        await expect(topoDaAba).toHaveAttribute("data-modo", "pronta");
        // Cada descoberta tem selo, frase e quem resolve; no máximo 3 à vista.
        const descobertas = topoDaAba.locator('[data-peca="descoberta"]');
        expect(await descobertas.count()).toBeLessThanOrEqual(3);
        for (let i = 0; i < (await descobertas.count()); i++) {
          await expect(descobertas.nth(i).locator(".nx-descoberta__frase")).toBeVisible();
          await expect(descobertas.nth(i).locator(".nx-descoberta__frase")).not.toHaveText("");
        }
        const proximo = topoDaAba.locator("[data-proximo-passo]");
        if (await proximo.count()) await expect(proximo.first().getByText(/Quem resolve:/)).toHaveCount(1);
      } else if (t.cinco) {
        // O veredito abre a tela; a leitura só aparece depois de abrir o "Ver tudo".
        await expect(page.locator('[data-peca="veredito"]:not([data-modo="carregando"])')).toBeVisible();
        await expect(leitura).toBeHidden();
        // O "Ver tudo" abre pelo teclado (Enter no resumo) e mostra a leitura que estava no topo.
        const verTudo = page.locator('details:has(> summary b:text-is("Ver tudo"))').first();
        await verTudo.locator("> summary").focus();
        await page.keyboard.press("Enter");
        await expect(verTudo).toHaveAttribute("open", "");
        // quick-ver-tudo (João 13/11/2026): a leitura saiu do "Ver tudo"; o que só ela dizia virou descoberta e o período fica numa linha só.
        await expect(leitura).toHaveCount(0);
        await expect(page.locator('[data-peca="periodo-do-ver-tudo"]')).toContainText("comparado com");
        const proximo = page.locator('[data-proximo-passo]');
        if (await proximo.count()) await expect(proximo.first().getByText(/Quem resolve:/)).toHaveCount(1);
      } else {
        await expect(leitura).toBeVisible();
        await expect(leitura.getByText("O que aconteceu", { exact: true }).or(leitura.getByText(/^Falta dado:/))).toBeVisible();
        await expect(leitura.locator(".nx-leitura__num").first().or(leitura.getByText(/^Falta dado:/))).toBeVisible();
        await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
      }

      // Cartões: até 4, depois da leitura.
      const cartoes = page.locator(".nx-pagina__cartoes > *");
      expect(await cartoes.count()).toBeGreaterThan(0);
      expect(await cartoes.count()).toBeLessThanOrEqual(4);
      // As 4 telas do Instagram desenham NxCartaoNumero (03.1.1, D-07); Conteúdo × Comercial segue com NxKpi.
      await expect(page.locator(".nx-pagina__cartoes :is(.nx-kpi, .nx-cartao)")).toHaveCount(t.cartoes);
      await expect(page.locator(".nx-pagina__cartoes :is(.nx-kpi .ws-metric-value, .nx-cartao .nx-numero__valor)").first()).toBeVisible();
      if (t.cinco) expect((await page.locator('[data-peca="veredito"]').first().boundingBox())!.y).toBeLessThan((await cartoes.first().boundingBox())!.y);
      else if (t.semLeitura) expect((await topoDaAba.evaluate((el) => el.getBoundingClientRect().y))).toBeLessThan((await cartoes.first().boundingBox())!.y);
      else expect((await leitura.boundingBox())!.y).toBeLessThan((await cartoes.first().boundingBox())!.y);

      // Nenhum gráfico do Recharts e nenhuma tabela fora da peça NxTabela.
      await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
      expect(await page.locator("table").evaluateAll((ts) => ts.filter((x) => !x.closest('[data-peca="tabela"]')).length)).toBe(0);
      expect(await semRolagemLateral(page)).toBe(true);

      await page.screenshot({ path: `test-results/redesenho/instagram-${t.rota}-${width}.png`, fullPage: true });

      // Detalhes abre pelo teclado.
      const detalhes = page.locator(".nx-pagina__detalhe > details").first();
      if (!t.cinco && (await detalhes.count())) {
        await detalhes.locator("summary").first().focus();
        await page.keyboard.press("Enter");
        await expect(detalhes).toHaveAttribute("open", "");
        // O período da leitura, uma vez só, pequeno, no começo dos Detalhes.
        if (t.semLeitura) await expect(detalhes.locator('[data-peca="periodo-do-ver-tudo"]')).toHaveCount(1);
        expect(await semRolagemLateral(page)).toBe(true);
      }
    });
  }

  test(`Analisar desempenho: sem projeção nos cartões nem na leitura em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/conteudo?preset=30d`);
    // A leitura mora no "Ver tudo" (formato 5 segundos): abre antes de conferir o texto dela.
    await expect(page.locator('[data-peca="veredito"]:not([data-modo="carregando"])')).toBeVisible();
    await page.locator('details:has(> summary b:text-is("Ver tudo")) > summary').first().click();
    // A leitura saiu do "Ver tudo" (quick-ver-tudo): o que ela dizia mora nas descobertas, que também nunca projetam.
    await expect(page.getByRole("region", { name: "Leitura do período", exact: true })).toHaveCount(0);
    await expect(page.locator(".nx-pagina__cartoes").getByText("Projeção em 30 dias")).toHaveCount(0);
    await expect(page.locator('[data-peca="veredito"]').getByText(/projeção|ritmo atual|previsão/i)).toHaveCount(0);
    await expect(page.locator('[data-peca="descoberta"], [data-peca="descoberta-extra"]').getByText(/projeção|ritmo atual|previsão/i)).toHaveCount(0);
    await expect(page.locator('[data-peca="cabeca-do-bloco"]').getByText(/projeção|ritmo atual|previsão|estimativa/i)).toHaveCount(0);
  });

  test(`Conteúdo × Comercial: a origem por post é "não medida" e nenhum post "trouxe" contatos em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/conteudo-comercial?preset=30d`);
    // Aviso fixo, com quem resolve: primeira coisa dos Detalhes (03.1.1-04, régua de 1,5 tela); a leitura do topo repete em "Ver mais".
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    const aviso = page.locator('[data-peca="aviso"]').filter({ hasText: "Falta dado: origem por post não medida" });
    await expect(aviso).toBeVisible();
    await expect(aviso.getByText(/Quem resolve: Equipe Doctor Creator/)).toBeVisible();
    // E o último item de "Ver mais" da leitura, também com a equipe da Doctor Creator.
    const leitura = page.getByRole("region", { name: "Leitura do período", exact: true });
    await leitura.locator("summary", { hasText: /^Ver mais/ }).click();
    await expect(leitura.getByText(/origem por post não medida/)).toBeVisible();
    await expect(leitura.getByText(/Quem resolve: Equipe Doctor Creator/).last()).toBeVisible();
    const texto = await page.locator("main").innerText();
    expect(texto).not.toMatch(/trouxe\s+\d+\s*%/i);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Público do Instagram: abas trocam pelas setas do teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/audiencia?preset=30d`);
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    const abas = page.getByRole("tablist", { name: "Partes do público" });
    await abas.getByRole("tab", { name: "Quem segue" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toHaveAttribute("aria-selected", "true");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toBeFocused();
    // quick-ver-tudo-abas: cada bloco abre com o nome pequeno e a resposta; o título do cartão de dentro fica só para leitor de tela.
    const bloco = (nome: string) => page.locator('[data-peca="bloco-do-ver-tudo"]').filter({ has: page.getByRole("heading", { name: nome }) });
    await expect(bloco("Origem das visualizações").locator('[data-peca="cabeca-do-bloco"]')).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(bloco("Seguidores online").locator('[data-peca="cabeca-do-bloco"]')).toBeVisible();
    await expect(page.locator(".nx-colunas").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Consultar publicações: mais análises abrem pelo teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/posts?preset=30d`);
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    const resumo = page.locator("summary", { hasText: /^Mais análises dos posts/ });
    await resumo.focus();
    await page.keyboard.press("Enter");
    await expect(resumo.locator("..")).toHaveAttribute("open", "");
    await expect(page.getByRole("heading", { name: "Alcance por tema e por formato" })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
