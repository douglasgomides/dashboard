import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { cortesEm, textoVisivel } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, semRolagemLateral } from "./apoio-telas-juntadas";

// Atendimento > Qualidade ("Números do atendimento") no formato 5 segundos (Phase 03.1.1.1, plano 06): o veredito "Chegam N conversas por dia." abre
// a tela e o gráfico de conversas por dia mostra a faixa do normal DESTA clínica, com ▲/▼ escritos nos dias fora dela. Dados fictícios.
// Este spec roda na porta 5199 (o plano 07 roda em paralelo na 5198).

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="atendimento"]';
const dia = (i: number) => new Date(Date.now() - 3 * 3600_000 - i * 86400000).toISOString().slice(0, 10);

/** Conversas fictícias de cada dia (i = quantos dias atrás): perto de 17 por dia, um dia de pico (12 dias atrás) e um dia quase parado (20 dias atrás). */
const PADRAO = [16, 18, 17, 19, 15, 18, 17];
const conversasDoDia = (i: number) => (i === 12 ? 52 : i === 20 ? 3 : PADRAO[i % 7]);

/** WTS do spec: os mesmos dados para qualquer janela pedida (filtra por p_start e p_end), com 70 dias de histórico. */
async function mockWts(context: BrowserContext) {
  const rpc = (nome: string, json: unknown) => context.route(`**/rest/v1/rpc/${nome}`, (r) => r.fulfill({ json }));
  await rpc("wts_resumo", [{ atendimentos: 520, contatos_distintos: 410, espera_mediana_seg: 900, espera_cobertura: 480, atendimento_mediano_seg: 40000, em_andamento: 10, concluidos: 510, sem_roteamento: 20 }]);
  await context.route("**/rest/v1/rpc/wts_volume_diario", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const de = String(b.p_start ?? "0000");
    const ate = String(b.p_end ?? "9999");
    const linhas = Array.from({ length: 70 }, (_, i) => ({ dia: dia(i), atendimentos: conversasDoDia(i), espera_mediana_seg: 600 + (i % 5) * 30 }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b2) => a.dia.localeCompare(b2.dia));
    return r.fulfill({ json: linhas });
  });
  await rpc("wts_por_departamento", [{ departamento: "Comercial", atendimentos: 480, fatia: 92, espera_mediana_seg: 800, atendimento_mediano_seg: 30000 }]);
  await rpc("wts_por_agente", [{ agente: "Atendente fictícia", atendimentos: 300, concluidos: 290, espera_mediana_seg: 700, atendimento_mediano_seg: 30000 }]);
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockWts(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/atendimento?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
}

test("o veredito abre a tela com as conversas por dia e a faixa do normal desta clínica, com ▲ e ▼ escritos nos dias fora dela", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 });

  // O veredito é o primeiro bloco depois do cabeçalho: "Chegam N conversas por dia." e, em apoio, o normal e quantos dias saíram dele.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^Chegam \d+ conversas por dia\.$/);
  await expect(veredito.locator(".nx-veredito__apoio")).toHaveText(/^Normal: de \d+ a \d+ conversas por dia · .* fora disso\.$/);

  // A faixa do normal vem só dos dias desta clínica, escrita no gráfico; o dia de pico leva ▲ e o dia quase parado leva ▼ (texto, não só cor).
  const faixa = page.locator(`${RAIZ} [data-peca="faixa-do-normal"]`);
  await expect(faixa).toBeVisible();
  await expect(faixa).toContainText(/^normal: \d+-\d+$/);
  const marcas = page.locator(`${RAIZ} .nx-dias__barra[data-marca="acima"] .nx-dias__marca`);
  await expect(marcas.first()).toHaveText("▲");
  await expect(page.locator(`${RAIZ} .nx-dias__barra[data-marca="abaixo"] .nx-dias__marca`).first()).toHaveText("▼");
  // A legenda diz o mesmo com palavras.
  const legenda = page.locator(`${RAIZ} .nx-dias__legenda`);
  await expect(legenda).toContainText("faixa do normal");
  await expect(legenda).toContainText("▲ acima do normal");
  await expect(legenda).toContainText("▼ abaixo do normal");
  await expect(legenda).toContainText("dia normal");
  // O gráfico é um slider de teclado e a dica do dia diz data e valor.
  const slider = page.getByRole("slider", { name: "conversas por dia" });
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("Home");
  await expect(page.locator(`${RAIZ} .nx-dias__dica`)).toHaveText(/^dia \d{2}\/\d{2}: \d+$/);
});

test("tudo o que a tela mostrava mora no Ver tudo, fechado, na mesma ordem, com os mesmos ids", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const verTudo = page.locator(`${RAIZ} details:has(> summary b:text-is("Ver tudo"))`).first();
  await expect(verTudo).toHaveCount(1);
  expect(await verTudo.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await verTudo.locator("> summary").click();
  const regiao = page.getByRole("region", { name: "Números do atendimento", exact: true });
  await expect(regiao.locator(".ws-metric-value")).toHaveText(["520", "15min", "4%", /\d+/]);
  await expect(page.locator(`${RAIZ} #volume`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #por-equipe`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #tempo-fechar`)).toBeVisible();
  const ids = await page.locator(`${RAIZ} #volume, ${RAIZ} #por-equipe, ${RAIZ} #tempo-fechar`).evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(["volume", "por-equipe", "tempo-fechar"]);
  await expect(page.getByRole("slider", { name: /^Atendimentos por dia e espera/ })).toBeVisible();
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`${perfil}: ${largura.width}x${largura.height} abre com o Ver tudo fechado, dentro de 1,5 tela e sem nada cortado`, async ({ page, context }) => {
      await abrir(page, context, perfil, largura);
      // Admin: a tela mora na pasta Atendimento (mede a pasta inteira). Médico por link: mede a página.
      const { altura, janela } = await alturaDaAbaAberta(page, perfil === "admin" ? "[data-juntada]" : ".nx-pagina");
      console.log(`altura-atendimento perfil=${perfil} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura, `Atendimento ${perfil} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await cortesEm(page, RAIZ), "nada pode ficar cortado").toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
      const texto = await textoVisivel(page.locator(RAIZ));
      expect(texto).not.toContain("EXEMPLO");
    });
  }
}
