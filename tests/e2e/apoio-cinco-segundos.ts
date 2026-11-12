import { expect, type Locator, type Page } from "@playwright/test";
import { GUARDA_SEM_COMPARAR_CLINICAS } from "../../src/lib/leitura/cinco-segundos";
import { MAX_CARACTERES_DA_LEGENDA as MAX_CARACTERES_DA_FRASE_CINCO } from "../../src/lib/leitura/fatos-hoje";

// Apoio dos e2e das telas no formato 5 segundos (Phase 03.1.1.1): a mesma conferência para toda tela convertida. Cada plano da fase
// importa este arquivo e NÃO o edita. Só lê o texto VISÍVEL (innerText): o que mora dentro de um "Ver tudo" fechado não conta, nem
// para a regra de nunca comparar uma clínica com outras (D-02), nem para o limite de 90 caracteres.

const norm = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim();

/** Texto visível de um trecho da página (innerText: conteúdo de details fechado e elementos escondidos ficam de fora). */
export async function textoVisivel(locator: Locator): Promise<string> {
  return locator.innerText();
}

/**
 * Nada cortado (molde k, copiado de carteira-sem-corte.spec.ts): devolve em texto o que está cortado dentro da raiz (lista vazia = passou).
 * A fileira de cartões do celular rola de lado POR DESENHO (a página não rola): conta como rolagem declarada.
 */
export function cortesEm(page: Page, seletorDaRaiz: string): Promise<string[]> {
  return page.evaluate((seletor) => {
    const raiz = document.querySelector(seletor) as HTMLElement | null;
    if (!raiz) return [`raiz não encontrada: ${seletor}`];
    const problemas: string[] = [];
    const nome = (el: Element) => {
      const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.trim().split(/\s+/).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} '${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}'`;
    };
    const declarada = (el: Element) => el.matches(".nxb-tabela, [data-rola], .nx-pagina__cartoes") || (innerWidth <= 820 && el.matches(".nx-pagina .ig-vitrine"));
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
      // 3. cortado sem o texto inteiro (title ou aria-label na própria peça ou em quem a contém)
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

/** O "Ver tudo" da tela (o bloco recolhido do fim da página). */
const verTudoDe = (page: Page, raiz: string) => page.locator(`${raiz} details:has(> summary b:text-is("Ver tudo"))`).first();

/** Abre o "Ver tudo" da tela quando ele existe e está fechado (não faz nada quando a tela ainda não tem, ou quando já está aberto). */
export async function abrirVerTudo(page: Page, raiz: string): Promise<void> {
  const bloco = verTudoDe(page, raiz);
  if ((await bloco.count()) === 0) return;
  if (!(await bloco.evaluate((el) => (el as HTMLDetailsElement).open))) await bloco.locator("> summary").click();
}

export interface OpcoesDaConferencia {
  /** Quantas descobertas à vista, no mínimo (padrão 3). Com o veredito "sem leitura" zero é aceito. */
  minDescobertas?: number;
  /** Quantas descobertas à vista, no máximo (padrão 5). */
  maxDescobertas?: number;
}

/**
 * A conferência única do formato 5 segundos (D-01, D-02, D-08), para a raiz de uma tela já carregada:
 *  1. o veredito é o primeiro bloco depois do cabeçalho e a frase dele tem até 90 caracteres;
 *  2. no máximo 3 cartões de número;
 *  3. de `minDescobertas` a `maxDescobertas` descobertas à vista (0 vale com o veredito sem leitura), cada uma com UMA ação e um
 *     "Por quê?" que abre de 2 a 3 fatores em barra e fecha de novo;
 *  4. o "Ver tudo" existe e está fechado;
 *  5. o texto visível nunca compara a clínica com outras (D-02);
 *  6. nada cortado.
 */
export async function conferirCincoSegundos(page: Page, raiz: string, opcoes: OpcoesDaConferencia = {}): Promise<void> {
  const { minDescobertas = 3, maxDescobertas = 5 } = opcoes;
  const tela = page.locator(raiz);
  await expect(tela).toBeVisible();
  const veredito = tela.locator('[data-peca="veredito"]').first();
  await expect(veredito).toBeVisible();
  await expect(tela.locator('[data-peca="veredito"][data-modo="carregando"]')).toHaveCount(0);

  // 1. o veredito vem logo depois do cabeçalho.
  const ordem = await tela.evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0]?.tag, "o cabeçalho abre a tela").toBe("header");
  expect(ordem[1]?.peca, "o veredito é o primeiro bloco depois do cabeçalho").toBe("veredito");
  const modo = await veredito.getAttribute("data-modo");
  if (modo === "veredito") {
    const frase = norm(await veredito.locator(".nx-veredito__frase").innerText());
    expect(frase.length, "o veredito tem uma frase").toBeGreaterThan(0);
    expect(frase.length, `frase do veredito com ${frase.length} caracteres: "${frase}"`).toBeLessThanOrEqual(MAX_CARACTERES_DA_FRASE_CINCO);
  }

  // 2. no máximo 3 números-chave.
  expect(await tela.locator('.nx-pagina__cartoes [data-peca="cartao-numero"]').count(), "no máximo 3 cartões de número").toBeLessThanOrEqual(3);

  // 3. as descobertas à vista.
  const descobertas = tela.locator('[data-peca="descoberta"]');
  const aVista = await descobertas.evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
  const piso = modo === "sem-leitura" ? 0 : minDescobertas;
  expect(aVista, `${aVista} descobertas à vista (de ${piso} a ${maxDescobertas})`).toBeGreaterThanOrEqual(piso);
  expect(aVista).toBeLessThanOrEqual(maxDescobertas);
  for (let k = 0; k < aVista; k++) {
    const d = descobertas.nth(k);
    const frase = norm(await d.locator(".nx-descoberta__frase").innerText());
    expect(frase.length, `descoberta ${k + 1} com ${frase.length} caracteres: "${frase}"`).toBeLessThanOrEqual(MAX_CARACTERES_DA_FRASE_CINCO);
    // Uma ação só (link ou botão da pílula); o "Por quê?" é o outro botão e só abre o painel.
    await expect(d.locator("a.nx-acao-pilula__seta, button.nx-acao-pilula__seta"), `a descoberta ${k + 1} tem uma ação só`).toHaveCount(1);
    const porque = d.locator("button.nx-descoberta__porque-botao");
    await expect(porque).toHaveCount(1);
    await expect(porque).toHaveAttribute("aria-expanded", "false");
    await porque.click();
    await expect(porque).toHaveAttribute("aria-expanded", "true");
    const fatores = d.locator(".nx-barras__item");
    await expect(fatores.first()).toBeVisible();
    const n = await fatores.count();
    expect(n, `o Por quê? da descoberta ${k + 1} mostra ${n} fatores (de 2 a 3)`).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
    await porque.click();
    await expect(porque).toHaveAttribute("aria-expanded", "false");
    await expect(fatores.first()).toBeHidden();
  }

  // 4. "Ver tudo" existe e está fechado.
  const verTudo = verTudoDe(page, raiz);
  await expect(verTudo, 'a tela tem o bloco "Ver tudo"').toHaveCount(1);
  expect(await verTudo.evaluate((el) => (el as HTMLDetailsElement).open), 'o "Ver tudo" começa fechado').toBe(false);

  // 5. D-02: o texto visível nunca compara a clínica com outras.
  const texto = await textoVisivel(tela);
  expect(texto, "o texto visível compara a clínica com outras (D-02)").not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);

  // 6. nada cortado.
  expect(await cortesEm(page, raiz), "nada pode ficar cortado").toEqual([]);
}
