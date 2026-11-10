import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import {
  REGISTRO_DE_TELAS,
  buscarTelasEquipe,
  indiceDaBusca,
} from "../../src/lib/registro-de-telas";

// E2e da busca da equipe (Phase 3, 03-05). O webServer do Playwright roda npm run build antes: tudo aqui é o build de
// produção (D-09: 59 escondidas no índice do admin, sem /qa/layout). Números e rótulos vêm do registro, nunca à mão.

// Animações fora (UI-SPEC §Movimento): posição e cor medidas no estado final.
test.use({ reducedMotion: "reduce" });

type Post = { corpo: Record<string, unknown> };

const ADMIN = { isAdmin: true };

// Mesmo padrão de rota-log.spec.ts: a chave de ligar o log só vale no bundle do e2e (Supabase falso).
async function ligarLog(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("nexo:rota-log", "1"));
}

function capturarPosts(page: Page): Post[] {
  const posts: Post[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== "/rest/v1/rota_acessos") return;
    posts.push({ corpo: request.postDataJSON() });
  });
  return posts;
}

// Abre a casca da clínica a 1440 e o diálogo Buscar tela pelo atalho. O Menu da equipe só aparece quando o papel chega:
// é a espera antes do atalho (o Ctrl+K mora na BuscaDeTelas, montada só para a equipe).
async function abrirBusca(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu da equipe" })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Buscar tela" });
  // A casca ainda pode montar de novo logo depois do papel chegar: repete o atalho só enquanto o diálogo não abriu.
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible()) return true;
        await page.keyboard.press("Control+k");
        await page.waitForTimeout(250);
        return dialog.isVisible();
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  return dialog;
}

const resultadosDe = (dialog: Locator) => dialog.getByRole("navigation", { name: "Resultados da busca" });
const comeca = (rotulo: string) => new RegExp(`^${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

test.describe("admin: busca da equipe", () => {
  test.beforeEach(async ({ context }) => {
    await mockAccount(context, "admin");
    await ligarLog(context);
  });

  // MENU-03 / V2: uma tela escondida de cada área antiga abre pela busca e a abertura grava origem busca.
  const ESCONDIDAS: { termo: string; rotulo: string; caminho: string; rota: string }[] = [
    { termo: "Consultar publicações", rotulo: "Consultar publicações", caminho: `/${CID}/posts`, rota: "/_authenticated/$clientId/posts" },
    { termo: "Funil comercial", rotulo: "Funil comercial", caminho: `/${CID}/crm-painel`, rota: "/_authenticated/$clientId/crm-painel" },
    { termo: "Plano da semana", rotulo: "Plano da semana", caminho: `/${CID}/plano`, rota: "/_authenticated/$clientId/plano" },
    { termo: "Brand Brain", rotulo: "Brand Brain", caminho: "/admin/brain", rota: "/_authenticated/admin/brain" },
    { termo: "Todas as clínicas", rotulo: "Todas as clínicas", caminho: "/sap", rota: "/_authenticated/sap/" },
  ];
  for (const alvo of ESCONDIDAS) {
    test(`abre ${alvo.rotulo} pela busca e o log grava origem busca`, async ({ page }) => {
      const linha = REGISTRO_DE_TELAS.find((t) => t.rota === alvo.rota && !t.busca);
      expect(linha?.situacao, `${alvo.rota} é escondida no registro`).toBe("escondida");
      const posts = capturarPosts(page);
      const dialog = await abrirBusca(page);
      await dialog.getByRole("searchbox").fill(alvo.termo);
      const antes = posts.length;
      // O primeiro com o rótulo: em "Plano da semana" a tela da clínica vem antes da do SAP (ordem do registro).
      await resultadosDe(dialog).getByRole("link", { name: comeca(alvo.rotulo) }).first().click();
      await expect.poll(() => new URL(page.url()).pathname.replace(/\/$/, "")).toBe(alvo.caminho);
      await expect(page.getByText("Essa página não carregou")).toHaveCount(0);
      await expect
        .poll(() => posts.slice(antes).find((p) => p.corpo.rota === alvo.rota)?.corpo.origem, { message: `POST de ${alvo.rota}` })
        .toBe("busca");
    });
  }

  // V4 / UI-SPEC §Chips.
  test("chips: sem selo em Pacientes com a nota do rodapé, nada em Caixa de entrada, congelado no SAP", async ({ page }) => {
    const dialog = await abrirBusca(page);
    const campo = dialog.getByRole("searchbox");
    const nota = dialog.getByText("Telas “sem selo” mostram números que ainda não têm selo de confiança.");

    await campo.fill("pacientes");
    const pacientes = resultadosDe(dialog).getByRole("link", { name: /^Pacientes do período/ });
    await expect(pacientes.locator(".nx-chip--sem-selo")).toHaveCount(1);
    await expect(pacientes.locator(".nx-chip--sem-selo")).toHaveAttribute("aria-label", "Número sem selo de confiança");
    await expect(pacientes.locator(".nx-chip--sem-selo")).toContainText("sem selo");
    await expect(nota).toBeVisible();

    await campo.fill("Caixa de entrada");
    const caixa = resultadosDe(dialog).getByRole("link", { name: /^Caixa de entrada/ });
    await expect(caixa).toBeVisible();
    await expect(caixa.locator(".nx-chip")).toHaveCount(0);
    await expect(nota).toHaveCount(0);

    await campo.fill("Todas as clínicas");
    const sap = resultadosDe(dialog).getByRole("link", { name: /^Todas as clínicas/ });
    await expect(sap.locator(".nx-chip--congelado")).toHaveText("congelado");
    await expect(sap.locator(".nx-chip--sem-selo")).toHaveCount(0);

    // O chip sem selo só nas telas do registro com semSelo.
    const semSelo = REGISTRO_DE_TELAS.filter((t) => t.semSelo).length;
    expect(semSelo).toBe(6);
  });

  // UI-SPEC §Busca: ↓ no campo vai ao primeiro resultado; ↑/↓ percorrem; Enter no campo abre o primeiro.
  test("teclado: seta para baixo foca o primeiro resultado e Enter no campo abre o primeiro", async ({ page }) => {
    const posts = capturarPosts(page);
    const dialog = await abrirBusca(page);
    const campo = dialog.getByRole("searchbox");
    await campo.fill("funil");
    const links = resultadosDe(dialog).getByRole("link");
    await expect(links.first()).toBeVisible();
    await campo.press("ArrowDown");
    await expect(links.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(links.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(campo).toBeFocused();

    const primeiro = buscarTelasEquipe(ADMIN, "funil")[0];
    expect(primeiro.rota).toBe("/_authenticated/$clientId/crm-painel");
    const antes = posts.length;
    await campo.press("Enter");
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/crm-painel`);
    await expect
      .poll(() => posts.slice(antes).find((p) => p.corpo.rota === primeiro.rota)?.corpo.origem)
      .toBe("busca");
  });

  // UI-SPEC UI Considerations (empty) e D-09: contagem do build de produção lida do registro.
  test("sem resultado: estado vazio e Ver todas as telas com a contagem do build de produção", async ({ page }) => {
    const indice = indiceDaBusca(ADMIN);
    const N = indice.length;
    expect(N).toBe(66);
    expect(N - indice.filter((t) => t.situacao === "viva").length, "escondidas no índice de produção (D-09)").toBe(59);

    const dialog = await abrirBusca(page);
    // Sem texto: a frase de ajuda e o details fechado.
    await expect(dialog.getByRole("status")).toHaveText("Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto.");
    const todas = dialog.locator("details.nx-busca-todas");
    await expect(todas).not.toHaveAttribute("open", /.*/);
    await expect(todas.locator("summary")).toHaveText(`Ver todas as telas (${N})`);

    await dialog.getByRole("searchbox").fill("zzzz");
    await expect(dialog.getByRole("heading", { name: "Nenhuma tela encontrada" })).toBeVisible();
    await expect(
      dialog.getByText("Tente outra palavra, como “funil”, “relatório” ou “integrações”. Também dá para abrir “Ver todas as telas”."),
    ).toBeVisible();
    await expect(dialog.getByText(/^\d+ telas? encontradas?$/)).toHaveCount(0);
    await expect(todas.locator("summary")).toHaveText(`Ver todas as telas (${N})`);

    await todas.locator("summary").click();
    await expect(todas).toHaveAttribute("open", "");
    await expect(todas).toHaveAttribute("data-origem", "busca");
    const links = todas.getByRole("link");
    await expect(links).toHaveCount(N);
    const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    expect(hrefs.filter((h) => h.includes("/qa/layout"))).toEqual([]);
    // Grupos na ordem do UI-SPEC.
    const areas = await todas.locator("h3").allTextContents();
    expect(areas).toEqual(["Resultados", "Marketing", "Comercial", "Plano de ação", "Relatórios", "Administração", "SAP"].filter((a) => areas.includes(a)));
    // A lista longa rola dentro do diálogo, sem rolagem de lado.
    const caixa = await dialog.evaluate((el) => ({ alto: el.scrollHeight > el.clientHeight, lado: el.scrollWidth > el.clientWidth + 1, max: el.getBoundingClientRect().height <= innerHeight * 0.85 + 1 }));
    expect(caixa).toEqual({ alto: true, lado: false, max: true });
  });

  // Prohibition MENU-03: o texto digitado não sai do navegador.
  test("digitar na busca não faz nenhuma requisição de rede", async ({ page }) => {
    const dialog = await abrirBusca(page);
    await page.waitForTimeout(1500);
    const requisicoes: string[] = [];
    const ouvir = (r: { url: () => string }) => requisicoes.push(r.url());
    page.on("request", ouvir);
    await dialog.getByRole("searchbox").pressSequentially("relatório", { delay: 40 });
    await expect(resultadosDe(dialog).getByRole("link").first()).toBeVisible();
    await page.waitForTimeout(500);
    page.off("request", ouvir);
    expect(requisicoes).toEqual([]);
  });

  // MENU-04 / D-05: nenhuma tirada aparece como título de resultado.
  test("as tiradas não aparecem na busca", async ({ page }) => {
    const tiradas = REGISTRO_DE_TELAS.filter((t) => t.situacao === "tirada").map((t) => t.rotulo);
    expect(tiradas.sort()).toEqual(["Encontrar ideias", "Planejar a semana", "Visão geral de Marketing"]);
    const dialog = await abrirBusca(page);
    for (const rotulo of tiradas) {
      await dialog.getByRole("searchbox").fill(rotulo);
      await expect(dialog.getByRole("status")).toBeVisible();
      await expect(resultadosDe(dialog).locator(".nx-resultado-titulo").filter({ hasText: new RegExp(`^${rotulo}$`) })).toHaveCount(0);
    }
  });

  // UI-SPEC UI Considerations (partial): fonte ausente não esconde a tela.
  test("clínica sem Instagram: Consultar publicações avisa e continua abrindo", async ({ page }) => {
    await page.route("http://localhost:9/rest/v1/rpc/client_fontes", (route) =>
      route.fulfill({ json: [{ tem_instagram: false, tem_anuncios: true, tem_crm: true, tem_atendimento: true }] }),
    );
    const dialog = await abrirBusca(page);
    await dialog.getByRole("searchbox").fill("publicações");
    const link = resultadosDe(dialog).getByRole("link", { name: /^Consultar publicações/ });
    await expect(link).toContainText("Sem Instagram nesta clínica");
    await link.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/posts`);
  });

  // UI-SPEC UI Considerations (zero-one-many).
  test("contagem no singular e no plural", async ({ page }) => {
    const dialog = await abrirBusca(page);
    const campo = dialog.getByRole("searchbox");
    expect(buscarTelasEquipe(ADMIN, "Brand Brain")).toHaveLength(1);
    await campo.fill("Brand Brain");
    await expect(dialog.getByRole("status")).toHaveText("1 tela encontrada");
    const n = buscarTelasEquipe(ADMIN, "funil").length;
    expect(n).toBeGreaterThan(1);
    await campo.fill("funil");
    await expect(dialog.getByRole("status")).toHaveText(`${n} telas encontradas`);
  });

  // UI-SPEC UI Considerations (long-text): título em 1 linha e apoio em até 2 linhas, a 375 px.
  test("título longo em 1 linha e apoio em até 2 linhas a 375 px, sem rolagem de lado", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${CID}`);
    await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
    // O atalho mora na BuscaDeTelas, que só monta quando o papel de equipe chega: tenta até o diálogo abrir.
    const aberto = page.locator("dialog.workspace-dialog[open]");
    for (let i = 0; i < 20 && !(await aberto.count()); i++) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
    }
    const dialog = page.getByRole("dialog", { name: "Buscar tela" });
    await expect(dialog).toBeVisible();
    const longo = [...indiceDaBusca(ADMIN)].sort((a, b) => b.rotulo.length - a.rotulo.length)[0];
    await dialog.getByRole("searchbox").fill(longo.rotulo);
    const titulo = resultadosDe(dialog).locator(".nx-resultado-titulo").first();
    await expect(titulo).toBeVisible();
    const medidas = await resultadosDe(dialog)
      .locator(".nx-resultado")
      .first()
      .evaluate((a) => {
        const t = a.querySelector(".nx-resultado-titulo") as HTMLElement;
        const s = a.querySelector(".nx-resultado-apoio") as HTMLElement;
        const lh = (el: HTMLElement) => parseFloat(getComputedStyle(el).lineHeight);
        return { tituloLinhas: Math.round(t.clientHeight / lh(t)), apoioLinhas: Math.round(s.clientHeight / lh(s)) };
      });
    expect(medidas.tituloLinhas).toBe(1);
    expect(medidas.apoioLinhas).toBeLessThanOrEqual(2);
    const lado = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(lado).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
