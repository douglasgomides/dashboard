import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mockAccount } from "./fixtures";
import { mockCarteira, mockConferencia, mockIntegracoes } from "./admin-dados";

// Nada cortado na Carteira (12/11/2026): botão sempre inteiro, @ numa linha só, linha compacta e os alertas num chip
// "N alertas" que abre a lista. A função cortesEm devolve em texto o que está cortado (lista vazia = passou).

const RAIZ = 'section[aria-label="Clínicas da carteira"]';
const JANELAS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

function cortesEm(page: Page, seletorDaRaiz: string): Promise<string[]> {
  return page.evaluate((seletor) => {
    const raiz = document.querySelector(seletor) as HTMLElement | null;
    if (!raiz) return [`raiz não encontrada: ${seletor}`];
    const problemas: string[] = [];
    const nome = (el: Element) => {
      const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.trim().split(/\s+/).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} '${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}'`;
    };
    const declarada = (el: Element) => el.matches(".nxb-tabela, [data-rola]") || (innerWidth <= 820 && el.matches(".nx-pagina .ig-vitrine"));
    const escondido = (el: Element) => {
      if (el.closest("svg, img, picture")) return true;
      let c: Element | null = el;
      while (c && c !== raiz) {
        const p: Element | null = c.parentElement;
        if (p && p.tagName === "DETAILS" && !(p as HTMLDetailsElement).open && c.tagName !== "SUMMARY") return true;
        c = p;
      }
      if (el.getClientRects().length === 0) return true;
      const cs = getComputedStyle(el);
      if (cs.clipPath !== "none" || cs.clip !== "auto") return true;
      const r = el.getBoundingClientRect();
      return r.width <= 1 || r.height <= 1;
    };
    const todos = [raiz, ...Array.from(raiz.querySelectorAll("*"))].filter((el) => !escondido(el));
    for (const el of todos) {
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      const clamp = cs.getPropertyValue("-webkit-line-clamp");
      const temClamp = !!clamp && clamp !== "none";
      const temReticencia = cs.textOverflow === "ellipsis";
      const cortaLargura = el.scrollWidth > el.clientWidth + 1;
      const cortaAltura = el.scrollHeight > el.clientHeight + 1;
      // 2. corte sem reticências
      if ((ox === "hidden" || ox === "clip") && cortaLargura && !temReticencia && !temClamp) problemas.push(`corte sem reticências: ${nome(el)}`);
      // 3. cortado sem o texto inteiro
      if ((temReticencia || temClamp) && (cortaLargura || cortaAltura)) {
        let c: Element | null = el;
        let tem = false;
        while (c && c !== raiz) {
          if ((c.getAttribute("title") ?? "").trim() || (c.getAttribute("aria-label") ?? "").trim()) tem = true;
          c = c.parentElement;
        }
        if (!tem) problemas.push(`cortado sem o texto inteiro: ${nome(el)}`);
      }
      // 5. rolagem não declarada
      if ((ox === "auto" || ox === "scroll") && cortaLargura && !declarada(el)) problemas.push(`rolagem não declarada: ${nome(el)}`);
    }
    // 4. controle fora do contêiner
    for (const el of todos.filter((e) => e.matches("a, button, summary, select, input"))) {
      const r = el.getBoundingClientRect();
      let a: Element | null = el.parentElement;
      while (a) {
        const cs = getComputedStyle(a);
        const ox = cs.overflowX;
        const corta = ox === "hidden" || ox === "clip" || ((ox === "auto" || ox === "scroll") && !declarada(a));
        if (corta) {
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 1 || r.right > ar.right + 1) problemas.push(`controle fora do contêiner (${nome(a)}): ${nome(el)}`);
        }
        if (a === raiz) break;
        a = a.parentElement;
      }
    }
    return problemas;
  }, seletorDaRaiz);
}

async function abrir(page: Page, context: BrowserContext, janela: { width: number; height: number }) {
  await mockAccount(context, "admin");
  await mockCarteira(context);
  await mockConferencia(context);
  await mockIntegracoes(context);
  await page.setViewportSize(janela);
  await page.goto("/admin");
  const linhas = page.locator(`${RAIZ} .adm-linha`);
  await expect(linhas).toHaveCount(6);
  await expect(page.getByText("Lendo as fontes…")).toHaveCount(0);
  // Espera a leitura de dado com erro (Dra. Carla) e o último acesso (Dra. Ana) chegarem às linhas.
  await expect(linhas.filter({ hasText: "Dra. Carla Mendes" })).toContainText("1 dado com erro");
  await expect(linhas.filter({ hasText: "Dra. Ana Souza" })).toContainText("Não entra há 37 dias");
  await page.waitForLoadState("networkidle");
  return linhas;
}

for (const janela of JANELAS) {
  test.describe(`Carteira sem corte em ${janela.width}x${janela.height}`, () => {
    test("nenhum corte, nenhuma rolagem lateral e botões inteiros em toda linha", async ({ page, context }) => {
      const linhas = await abrir(page, context, janela);
      expect(await cortesEm(page, RAIZ)).toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);

      const cartao = (await page.locator(RAIZ).boundingBox())!;
      for (let i = 0; i < 6; i++) {
        const linha = linhas.nth(i);
        const caixa = (await linha.boundingBox())!;
        for (const nomeBotao of ["Abrir resultados", "Gerenciar"]) {
          const botao = linha.getByRole("link", { name: nomeBotao });
          await expect(botao).toBeVisible();
          const b = (await botao.boundingBox())!;
          for (const dentro of [caixa, cartao]) {
            expect(b.x, `${nomeBotao} da linha ${i} sai pela esquerda`).toBeGreaterThanOrEqual(dentro.x - 1);
            expect(b.x + b.width, `${nomeBotao} da linha ${i} sai pela direita`).toBeLessThanOrEqual(dentro.x + dentro.width + 1);
          }
        }
      }
    });

    test("o @ longo fica numa linha só, com o texto inteiro no title", async ({ page, context }) => {
      const linhas = await abrir(page, context, janela);
      const sub = linhas.filter({ hasText: "Dra. Carla Mendes" }).locator(".adm-quem__sub");
      await expect(sub).toHaveAttribute("title", /@dracarlamendesdermatologia/);
      const caixa = (await sub.boundingBox())!;
      expect(caixa.height, "@ em mais de uma linha").toBeLessThanOrEqual(20);
    });

    if (janela.width >= 1280) {
      test("linha de no máximo 120 px, chips de uma linha e no máximo 3 itens na coluna de saúde", async ({ page, context }) => {
        const linhas = await abrir(page, context, janela);
        for (let i = 0; i < 6; i++) {
          const linha = linhas.nth(i);
          const caixa = (await linha.boundingBox())!;
          expect(caixa.height, `linha ${i} alta demais`).toBeLessThanOrEqual(120);
          const itens = await linha.locator(".adm-chips > *").count();
          expect(itens, `linha ${i} com itens demais na saúde`).toBeLessThanOrEqual(3);
          const chips = linha.locator(".adm-chips .nx-tag:visible");
          const n = await chips.count();
          for (let k = 0; k < n; k++) {
            const h = (await chips.nth(k).boundingBox())!.height;
            expect(h, `chip ${k} da linha ${i} em mais de uma linha`).toBeLessThanOrEqual(26);
          }
        }
      });
    }

    test("veredito, 3 números e a linha de chips de cor não cortam nada nem criam rolagem lateral", async ({ page, context }) => {
      await abrir(page, context, janela);
      for (const raiz of ['[data-peca="veredito"]', 'div[aria-label="Números da carteira"]', ".adm-filtros", '[data-peca="descobertas"]']) {
        expect(await cortesEm(page, raiz), raiz).toEqual([]);
      }
      expect(await semRolagemLateral(page)).toBe(true);
      // Os chips de cor ficam inteiros dentro da linha de filtros.
      const filtros = (await page.locator(".adm-filtros").boundingBox())!;
      const pilulas = page.getByRole("group", { name: "Filtrar clínicas pela nota dos dados" }).getByRole("button");
      expect(await pilulas.count()).toBe(4);
      for (let k = 0; k < 4; k++) {
        const b = (await pilulas.nth(k).boundingBox())!;
        expect(b.x, `chip ${k} sai pela esquerda`).toBeGreaterThanOrEqual(filtros.x - 1);
        expect(b.x + b.width, `chip ${k} sai pela direita`).toBeLessThanOrEqual(filtros.x + filtros.width + 1);
      }
    });

    test("o painel da clínica aberto cabe na janela, sem corte e sem rolagem lateral", async ({ page, context }) => {
      const linhas = await abrir(page, context, janela);
      await linhas.filter({ hasText: "Dra. Carla Mendes" }).locator("button.adm-quem--botao").click();
      const painel = page.getByRole("dialog", { name: "Dra. Carla Mendes" });
      await expect(painel).toBeVisible();
      // Espera a entrada do painel terminar para medir a caixa no lugar final.
      await painel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect(await cortesEm(page, "dialog.nx-painel-clinica")).toEqual([]);
      const caixa = (await painel.boundingBox())!;
      expect(caixa.x, "painel sai pela esquerda").toBeGreaterThanOrEqual(-1);
      expect(caixa.x + caixa.width, "painel sai pela direita").toBeLessThanOrEqual(janela.width + 1);
      for (const nomeLink of ["Abrir resultados", "Gerenciar"]) {
        const b = (await painel.getByRole("link", { name: new RegExp(nomeLink) }).boundingBox())!;
        expect(b.x + b.width, `${nomeLink} sai pela direita do painel`).toBeLessThanOrEqual(caixa.x + caixa.width + 1);
      }
      expect(await semRolagemLateral(page)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(painel).toBeHidden();
    });

    test("o chip 'N alertas' abre pelo teclado e mostra os mesmos chips e links de antes", async ({ page, context }) => {
      const linhas = await abrir(page, context, janela);
      const ana = linhas.filter({ hasText: "Dra. Ana Souza" });
      const resumo = ana.locator("details.adm-alertas > summary");
      await expect(resumo).toHaveText(/[2-9] alertas/);
      await expect(resumo).toHaveAttribute("title", /Anúncios/);
      await expect(resumo).toHaveAttribute("title", /Não entra há 37 dias/);
      await expect(ana.locator(".adm-alertas__lista")).toBeHidden();
      await resumo.focus();
      await page.keyboard.press("Enter");
      await expect(ana.locator("details.adm-alertas")).toHaveAttribute("open", "");
      const lista = ana.locator(".adm-alertas__lista");
      await expect(lista).toBeVisible();
      await expect(lista).toContainText(/Anúncios: /);
      const acesso = lista.getByRole("link", { name: /Não entra há 37 dias/ });
      await expect(acesso).toBeVisible();
      await expect(acesso).toHaveAttribute("href", /\/admin\/.+#acesso/);
      expect(await cortesEm(page, RAIZ)).toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  });
}
