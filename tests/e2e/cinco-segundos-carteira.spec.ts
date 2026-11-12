import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { checarFraseCinco, GUARDA_SEM_COMPARAR_CLINICAS } from "../../src/lib/leitura/cinco-segundos";
import { mockAccount } from "./fixtures";
import { CLINICAS, mockCarteira, mockConferencia, mockIntegracoes } from "./admin-dados";
import { cortesEm, textoVisivel } from "./apoio-cinco-segundos";

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

// ---------- chips de cor, 3 números, painel da clínica e descobertas ----------

const num = (t: string | null) => Number((t ?? "").replace(/\D/g, ""));

/** Uma carteira com uma clínica vermelha (Dra. Ana, todas as fontes paradas) e uma sem nota (a clínica de teste, nenhuma fonte ligada). */
async function mockBandas(context: BrowserContext) {
  const dia = (atras: number) => new Date(Date.now() - atras * 86_400_000).toISOString().slice(0, 10);
  const quando = (atras: number) => new Date(Date.now() - atras * 86_400_000).toISOString();
  const atraso: Record<string, Record<string, number | null>> = {};
  for (const c of CLINICAS) atraso[c.id] = { instagram: 0, anuncios: 0, crm: 0, atendimento: null };
  atraso[CLINICAS[0].id] = { instagram: null, anuncios: null, crm: null, atendimento: null };
  atraso[CLINICAS[1].id] = { instagram: 8, anuncios: 8, crm: 8, atendimento: null };
  await context.route("**/rest/v1/rpc/status_das_fontes**", (route) =>
    route.fulfill({
      json: CLINICAS.flatMap((c) =>
        Object.entries(atraso[c.id]).map(([fonte, a]) => ({
          client_id: c.id,
          fonte,
          cadastro: a != null,
          data_ate: a == null ? null : dia(a + 1),
          last_attempt_at: a == null ? null : quando(0),
          last_success_at: a == null ? null : quando(a),
          last_error: a != null && a >= 5 ? "Token expirado na origem" : null,
          motivo: null,
          motivo_dono: null,
          nao_usa: false,
        })),
      ),
    }),
  );
}

async function abrirBandas(page: Page, context: BrowserContext, width = 1440) {
  await mockAccount(context, "admin");
  await mockCarteira(context);
  await mockBandas(context);
  await mockConferencia(context);
  await mockIntegracoes(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/admin");
  const linhas = page.locator(`${LISTA} .adm-linha`);
  await expect(linhas).toHaveCount(6);
  await expect(page.getByText("Lendo as fontes…")).toHaveCount(0);
  await expect(page.locator('[data-peca="veredito"][data-modo="carregando"]')).toHaveCount(0);
  await expect(linhas.filter({ hasText: "Dra. Carla Mendes" })).toContainText("1 dado com erro");
  await page.waitForLoadState("networkidle");
  return linhas;
}

test("os chips de cor mudam as linhas e cada um mostra a sua contagem", async ({ page, context }) => {
  const linhas = await abrirBandas(page, context);
  const grupo = page.getByRole("group", { name: "Filtrar clínicas pela nota dos dados" });
  const chips = [
    ["Todas", 6],
    ["Só vermelhos", 1],
    ["Só amarelos", null],
    ["Sem nota", 1],
  ] as const;
  for (const [nome, esperado] of chips) {
    const chip = grupo.getByRole("button", { name: new RegExp(`^${nome}`) });
    const contagem = num(await chip.locator("small").textContent());
    if (esperado != null) expect(contagem, `contagem de ${nome}`).toBe(esperado);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(linhas, `linhas com ${nome}`).toHaveCount(contagem);
  }
  // Só vermelhos: a clínica com todas as fontes paradas; Sem nota: a clínica sem fonte ligada.
  await grupo.getByRole("button", { name: /^Só vermelhos/ }).click();
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText("Dra. Ana Souza");
  await grupo.getByRole("button", { name: /^Sem nota/ }).click();
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText("Clínica de teste");
  // A busca combina com o chip.
  await grupo.getByRole("button", { name: /^Todas/ }).click();
  await page.getByRole("searchbox", { name: "Buscar cliente" }).fill("sorriso");
  await expect(linhas).toHaveCount(1);
  await expect(grupo.getByRole("button", { name: /^Todas/ }).locator("small")).toHaveText("1");
});

test("os 3 números: problemas por quem resolve, ação hoje e clínicas com nota, sem histórico inventado", async ({ page, context }) => {
  await abrirBandas(page, context);
  const numeros = page.getByRole("group", { name: "Números da carteira" });
  await expect(numeros.locator(".adm-cont")).toHaveCount(3);
  const problemas = numeros.locator(".adm-cont", { hasText: "Problemas abertos" });
  await expect(problemas.locator(".adm-cont__valor")).toHaveText(/^\d+$/);
  await expect(problemas).toContainText(/Equipe \d+/);
  await expect(problemas).toContainText(/Cliente \d+/);
  await expect(problemas).toContainText(/Meta \d+/);
  await expect(problemas).toContainText("vs semana passada: Falta dado (sem histórico)");
  const acao = numeros.locator(".adm-cont", { hasText: "Ação hoje" });
  await expect(acao.locator(".adm-cont__valor")).toHaveText("1");
  await expect(acao).toContainText("vs semana passada: Falta dado (sem histórico)");
  const comNota = numeros.locator(".adm-cont", { hasText: "Clínicas com nota" });
  await expect(comNota.locator(".adm-cont__valor")).toHaveText("5 de 6");
  // Os grupos por quem resolve não passam do total de problemas.
  const partes = await problemas.locator(".adm-urgencia__quem").innerText();
  const soma = [...partes.matchAll(/(Equipe|Cliente|Meta) (\d+)/g)].reduce((n, m) => n + Number(m[2]), 0);
  const total = Number(await problemas.locator(".adm-cont__valor").innerText());
  expect(soma).toBeLessThanOrEqual(total);
});

for (const width of [375, 1440]) {
  test(`o painel da clínica explica a nota, diz quem resolve e devolve o foco em ${width}px`, async ({ page, context }) => {
    const linhas = await abrir(page, context, width);
    const botao = linhas.nth(0).locator("button.adm-quem--botao");
    await botao.focus();
    await page.keyboard.press("Enter");
    const painel = page.getByRole("dialog", { name: "Dra. Carla Mendes" });
    await expect(painel).toBeVisible();
    // A nota explicada com os fatores reais: Instagram, Anúncios, CRM e os problemas de dado.
    await expect(painel.getByRole("heading", { name: /^Por que \d+\?$/ })).toBeVisible();
    const barras = painel.locator(".nx-barras__item");
    expect(await barras.count()).toBeGreaterThanOrEqual(3);
    await expect(painel.locator(".nx-barras")).toContainText("Problemas de dado");
    await expect(painel.locator(".nx-barras")).toContainText("CRM");
    // Os problemas, cada um com quem resolve, e os links de sempre.
    await expect(painel.getByRole("heading", { name: /^Problemas \(2\) e quem resolve$/ })).toBeVisible();
    await expect(painel.locator(".nx-painel-clinica__alerta")).toHaveCount(2);
    await expect(painel).toContainText(/Quem resolve: (Equipe|Cliente|Meta|Só acompanhar)/);
    await expect(painel.getByRole("link", { name: /Abrir resultados/ })).toBeVisible();
    await expect(painel.getByRole("link", { name: "Gerenciar" })).toBeVisible();
    // Saúde dos dados, não resultado; nenhum botão que grave, avise ou crie tarefa; nenhuma promessa de ponto.
    await expect(painel).toContainText("Saúde dos dados da clínica");
    const texto = await painel.innerText();
    expect(texto).not.toMatch(/Resolvido|Avisar cliente|Criar tarefa|pontos?\b|\+\d+ ?pts/i);
    expect(texto).not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);
    await expect(painel.getByRole("button", { name: /resolvido|avisar|tarefa/i })).toHaveCount(0);
    // Nada cortado e nenhuma rolagem lateral.
    expect(await cortesEm(page, "dialog.nx-painel-clinica")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // Esc fecha e o foco volta ao botão da linha.
    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();
    await expect(botao).toBeFocused();
    // O fundo também fecha.
    await botao.click();
    await expect(painel).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(painel).toBeHidden();
    await expect(botao).toBeFocused();
  });
}

test("as descobertas são só de urgência: de 3 a 5, uma ação e um 'Por quê?' com 2 ou 3 barras", async ({ page, context }) => {
  await abrirBandas(page, context);
  const descobertas = page.locator('[data-peca="descoberta"]');
  const n = await descobertas.count();
  expect(n).toBeGreaterThanOrEqual(3);
  expect(n).toBeLessThanOrEqual(5);
  for (let i = 0; i < n; i++) {
    const d = descobertas.nth(i);
    const frase = (await d.locator(".nx-descoberta__frase").innerText()).replace(/\s+/g, " ").trim();
    expect(checarFraseCinco(frase), `frase "${frase}"`).toEqual([]);
    await expect(d.locator("button.nx-acao-pilula__seta"), "uma ação por descoberta").toHaveCount(1);
    await d.getByRole("button", { name: "Por quê?" }).click();
    const barras = await d.locator(".nx-barras__item").count();
    expect(barras, `barras da descoberta ${i}`).toBeGreaterThanOrEqual(2);
    expect(barras).toBeLessThanOrEqual(3);
    // Nenhuma descoberta nomeia clínica por render melhor ou pior (D-02) nem promete ponto por correção (D-05).
    const texto = await d.innerText();
    expect(texto).not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);
    expect(texto).not.toMatch(/Dra?\. |Clínica /);
    expect(texto).not.toMatch(/pontos?\b|\+\d+ ?pts/i);
  }
  // A ação "Ver só as sem nota" liga o chip Sem nota; "Abrir o diagnóstico das fontes" abre o Ver tudo e o diagnóstico.
  const semNota = descobertas.filter({ hasText: "ainda sem nota" });
  await semNota.locator("button.nx-acao-pilula__seta").click();
  await expect(page.getByRole("button", { name: /^Sem nota/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Todas/ }).click();
  const paradas = descobertas.filter({ hasText: "paradas ou com erro" });
  await paradas.locator("button.nx-acao-pilula__seta").click();
  await expect(page.locator("details.adm-urgencia__ver-tudo")).toHaveJSProperty("open", true);
  await expect(page.locator("details.adm-det", { hasText: "Diagnóstico das fontes" }).first()).toHaveJSProperty("open", true);
});
