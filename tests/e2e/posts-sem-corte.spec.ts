import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram, postsFicticios } from "./instagram-dados";

// Instagram › Posts sem corte (quick 261112-jmh, Tarefa 2): Top 5, Ranking de posts e Explorador de posts em 375x812,
// 1280x800 e 1440x900, com legenda longa, tema sem acento e números grandes. Nada cortado sem reticências, nada fora do cartão.

test.use({ reducedMotion: "reduce" });

const JANELAS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

const LEGENDA_LONGA = "A técnica é essencial. Mas o que muda o resultado é a conversa antes do procedimento, com calma e sem pressa";
const TEMAS_SEM_ACENTO = ["Consultorio e relacao com paciente", "Prompts e IA para conteudo", "Metabolismo e composicao corporal", "Menopausa"];
const TEMAS_COM_ACENTO = ["Consultório e relação com paciente", "Prompts e IA para conteúdo", "Metabolismo e composição corporal", "Menopausa"];
const POSITIVO = /^\d{2}\/\d{2}$/;

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/**
 * Lista de problemas de corte dentro da raiz, em texto legível (vazia = passou). Regras: corte sem reticências, corte sem o
 * texto inteiro, controle fora do contêiner, rolagem lateral não declarada.
 */
async function cortesEm(raiz: Locator): Promise<string[]> {
  return raiz.evaluate((root) => {
    const problemas: string[] = [];
    const celular = matchMedia("(max-width: 560px)").matches;
    const declarada = (el: Element) => el.matches(".nxb-tabela, .ig-abas, [data-rola]") || (celular && el.matches(".nx-pagina .ig-vitrine"));
    const nome = (el: Element) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : ""} '${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}'`;
    const todos = [root, ...Array.from(root.querySelectorAll("*"))];
    const temTitulo = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if ((n.getAttribute("title") ?? "").trim() || (n.getAttribute("aria-label") ?? "").trim()) return true;
        if (n === root) break;
      }
      return false;
    };
    const visivel = (el: Element) => {
      if (el.getClientRects().length === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.clipPath !== "none" || (cs.clip !== "auto" && cs.clip !== "")) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      if (el.closest("svg, img, picture")) return false;
      return true;
    };
    const FORMULARIO = /^(select|input|option|textarea)$/i;
    for (const el of todos) {
      if (!visivel(el)) continue;
      const cs = getComputedStyle(el);
      const h = el as HTMLElement;
      const larguraCortada = h.scrollWidth > h.clientWidth + 1;
      const alturaCortada = h.scrollHeight > h.clientHeight + 1;
      const reticencia = cs.textOverflow === "ellipsis";
      const clamp = cs.webkitLineClamp !== "none" && cs.webkitLineClamp !== "" && cs.webkitLineClamp !== "0";
      const escondeX = cs.overflowX === "hidden" || cs.overflowX === "clip";
      if (!FORMULARIO.test(el.tagName)) {
        if (larguraCortada && escondeX && !reticencia && !clamp) problemas.push(`corte sem reticências: ${nome(el)}`);
        if ((reticencia || clamp) && (larguraCortada || alturaCortada) && !temTitulo(el)) problemas.push(`cortado sem o texto inteiro: ${nome(el)}`);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && larguraCortada && !declarada(el)) problemas.push(`rolagem não declarada: ${nome(el)}`);
      }
      if (el.matches("a, button, summary, select, input")) {
        const r = el.getBoundingClientRect();
        for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          const corta = o === "hidden" || o === "clip";
          const rola = o === "auto" || o === "scroll";
          if (corta || (rola && !declarada(n))) {
            const c = n.getBoundingClientRect();
            if (r.left < c.left - 1 || r.right > c.right + 1) problemas.push(`controle fora do contêiner: ${nome(el)} em ${nome(n)}`);
          }
          if (n === root) break;
        }
      }
    }
    return problemas;
  });
}

/** Posts fictícios com legenda longa, tema sem acento, números grandes num post e a ordem por salvamentos do banco. */
function postsDoTeste() {
  const posts = postsFicticios().map((p, i) => ({
    ...p,
    caption: `${LEGENDA_LONGA} (${i})\nlinha 2`,
    tema: i % 5 === 4 ? null : TEMAS_SEM_ACENTO[i % 4],
    ...(i === 0 ? { reach: 1_034_000, engagement: 52_913, saved: 3_214 } : {}),
  }));
  return posts.sort((a, b) => b.saved - a.saved);
}

async function mockPosts(context: BrowserContext) {
  await mockInstagram(context);
  const posts = postsDoTeste();
  // No Playwright a última rota registrada responde primeiro.
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return r.fulfill({ json: posts.slice(off, off + Number(p.get("limit") ?? 1000)) });
  });
}

const detalhe = (page: Page, titulo: string) => page.locator("summary", { has: page.locator(`b:text-is("${titulo}")`) }).locator("xpath=..");

async function abrirDetalhes(page: Page) {
  const resumo = page.locator(".nx-pagina__detalhe > details > summary");
  await resumo.click();
  await expect(resumo.locator("..")).toHaveAttribute("open", "");
}
async function abrir(page: Page, titulo: string) {
  const d = detalhe(page, titulo);
  await d.locator(":scope > summary").click();
  await expect(d).toHaveAttribute("open", "");
  return d;
}

const linhasDe = (el: Locator) => el.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));

for (const janela of JANELAS) {
  test.describe(`${janela.width}x${janela.height}`, () => {
    test.beforeEach(async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockPosts(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/posts?preset=30d`);
    });

    test("Top 5: legenda em até 2 linhas com reticências e title, chips dentro do cartão", async ({ page }) => {
      const cartao = page.locator("section.nx-card", { has: page.locator(".ig-vitrine") });
      await expect(cartao).toBeVisible();
      expect(await cortesEm(cartao)).toEqual([]);

      const titulo = cartao.locator(".ig-vitrine__titulo").first();
      expect(await linhasDe(titulo)).toBeLessThanOrEqual(2);
      await expect(titulo).toHaveAttribute("title", new RegExp(`^${LEGENDA_LONGA}`));

      const item = cartao.locator(".ig-vitrine__item").first();
      const chipTema = item.locator(".ig-vitrine__extra .nx-tag", { hasText: TEMAS_COM_ACENTO[0] });
      await expect(chipTema).toBeVisible();
      await expect(chipTema).toHaveAttribute("title", TEMAS_COM_ACENTO[0]);
      const [c, i] = await Promise.all([chipTema.boundingBox(), item.boundingBox()]);
      expect(c!.x + c!.width).toBeLessThanOrEqual(i!.x + i!.width + 1);
      expect(await semRolagemLateral(page)).toBe(true);
    });

    test("Ranking de posts: data dd/mm numa linha, números à direita, cabe ou rola com sombra, cartões no celular", async ({ page }) => {
      await abrirDetalhes(page);
      const ranking = await abrir(page, "Ranking de posts");
      const celular = janela.width <= 560;

      if (celular) {
        await expect(ranking.locator("ol.ig-ranking-cartoes")).toBeVisible();
        await expect(ranking.locator("table")).toHaveCount(0);
        const cartao = ranking.locator("ol.ig-ranking-cartoes > li").first();
        const data = cartao.locator(".ig-post-celula__data").first();
        await expect(data).toHaveText(POSITIVO);
        await expect(cartao.getByRole("button", { name: /^Classificar/ })).toBeVisible();
        const alvo = await cartao.getByRole("button", { name: /^Classificar/ }).boundingBox();
        expect(alvo!.height).toBeGreaterThanOrEqual(43);
      } else {
        const tabela = ranking.locator(".nxb-tabela");
        await expect(tabela).toBeVisible();
        const data = ranking.locator(".ig-post-celula__data").first();
        await expect(data).toHaveText(POSITIVO);
        expect(await linhasDe(data)).toBe(1);
        const tema = ranking.locator("tbody tr").first().locator(".nx-tag", { hasText: TEMAS_COM_ACENTO[0] });
        await expect(tema).toBeVisible();
        await expect(tema).toHaveAttribute("title", TEMAS_COM_ACENTO[0]);
        const legenda = ranking.locator(".ig-post-celula__legenda").first();
        expect(await linhasDe(legenda)).toBeLessThanOrEqual(2);
        await expect(legenda).toHaveAttribute("title", new RegExp(`^${LEGENDA_LONGA}`));

        const numero = ranking.locator("tbody tr").first().locator("td.nxb-num").nth(1);
        const estilo = await numero.evaluate((e) => ({ alinhamento: getComputedStyle(e).textAlign, numeros: getComputedStyle(e).fontVariantNumeric }));
        expect(estilo.alinhamento).toBe("right");
        expect(estilo.numeros).toContain("tabular-nums");

        const medida = await tabela.evaluate((e) => ({ largura: e.scrollWidth, visivel: e.clientWidth, fundo: getComputedStyle(e).backgroundAttachment }));
        if (janela.width >= 1440) expect(medida.largura, "em 1440 a tabela cabe sem rolar").toBeLessThanOrEqual(medida.visivel + 1);
        else if (medida.largura > medida.visivel + 1) expect(medida.fundo, "rola com sombra de rolagem").toContain("local");
        await expect(ranking.getByRole("button", { name: /^Classificar/ }).first()).toBeVisible();
      }
      expect(await cortesEm(ranking)).toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
    });

    test("Explorador de posts: números curtos sobre a miniatura, data numa linha, tema em chip de uma linha", async ({ page }) => {
      await abrirDetalhes(page);
      const explorador = await abrir(page, "Explorador de posts");

      const item = explorador.locator(".ig-galeria__item").first();
      await expect(item).toBeVisible();
      const nums = item.locator(".ig-galeria__nums");
      await expect(nums).toContainText("1,0 mi");
      await expect(nums).toContainText("52,9 mil");
      await expect(nums).toContainText("3,2 mil");
      await expect(nums.locator('[aria-label="Alcance: 1.034.000"]')).toHaveCount(1);
      await expect(nums.locator('[title="Engajamento: 52.913"]')).toHaveCount(1);

      const rodape = item.locator(".ig-galeria__rodape");
      await expect(rodape.locator(".ig-galeria__data")).toHaveText(POSITIVO);
      const tema = rodape.locator(".nx-tag", { hasText: TEMAS_COM_ACENTO[0] });
      await expect(tema).toBeVisible();
      await expect(tema).toHaveAttribute("title", TEMAS_COM_ACENTO[0]);
      expect(await linhasDe(tema)).toBe(1);
      expect(await cortesEm(explorador)).toEqual([]);

      // O filtro mostra o tema com acento e guarda o valor do banco.
      const filtro = explorador.getByRole("combobox", { name: "Tema" });
      await expect(filtro.locator(`option[value="${TEMAS_SEM_ACENTO[0]}"]`)).toHaveText(TEMAS_COM_ACENTO[0]);

      // Tabela: data numa linha, tema com reticências e title.
      await explorador.getByRole("combobox", { name: "Modo de exibição" }).selectOption("tabela");
      const tabela = explorador.locator(".nxb-tabela");
      await expect(tabela).toBeVisible();
      const celulaData = tabela.locator("tbody tr").first().locator(".ig-data-linha");
      expect(await linhasDe(celulaData)).toBe(1);
      expect(await cortesEm(explorador)).toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  });
}
