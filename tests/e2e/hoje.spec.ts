import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, client, mockAccount } from "./fixtures";
import { REGISTRO_DE_TELAS, SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { GUARDA_DE_NUMERO_DA_HOJE, GUARDA_DE_TEXTO_DA_HOJE, JARGAO_DA_HOJE, MAXIMO_POR_AREA, MAX_CARACTERES_DA_MANCHETE } from "../../src/lib/leitura/fatos-hoje";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// O que fazer hoje (Phase 3.1.1, plano 05): a primeira versão da tela Hoje da Phase 9. De 3 a 5 ações da semana por regra fixa
// dos fatos que Resultados da clínica já lê, cada uma com o número, quem resolve e o link para a aba de origem. Os 4 números da
// Phase 9 (Agendaram, Fecharam, Chamaram e Foram) não aparecem. Dados fictícios, só leitura.

test.use({ reducedMotion: "reduce" });

const acoes = (page: Page) => page.locator('[data-tela="hoje"] [data-acao-hoje]');
const ROTAS_DAS_ABAS = new Set(SECOES_JUNTADAS.flatMap((s) => s.abas.flatMap((a) => a.partes.map((p) => p.rota))));

/** Os mesmos dados realistas que alimentam Resultados da clínica: Instagram, pessoas, anúncios e CRM. */
async function dadosRealistas(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
}

/** Instagram simulado como em leitura.spec.ts: `diasDeAtraso` apaga os últimos dias (dado parado). */
async function instagramParado(context: BrowserContext, diasDeAtraso: number, posts: unknown[] = []) {
  const pagina = (url: string, linhas: unknown[]) => {
    const p = new URL(url).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
  };
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => i + diasDeAtraso)
      .map((i) => ({
        date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        client_id: CID,
        reach: 900 + ((i * 137) % 600),
        new_followers: 8 + (i % 7),
        unfollowers: 3,
        total_interactions: 60 + ((i * 13) % 50),
        saves: 20 + (i % 9),
        profile_links_taps: 4,
        followers_count: 5000 - i * 9,
      }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("**/rest/v1/instagram_posts**", (r) => r.fulfill({ json: pagina(r.request().url(), posts) }));
}

const rotaDoLink = (href: string) => {
  const sub = new URL(href, "http://x").pathname.replace(`/${CID}`, "").replace(/^\/+/, "");
  return sub ? `/_authenticated/$clientId/${sub}` : "/_authenticated/$clientId/";
};

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`(a)(b) ${perfil} a ${janela.width}x${janela.height}: de 3 a 5 ações com número, quem resolve e seta para a aba de origem`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);

      await expect(acoes(page).first()).toBeVisible();
      await expect(page.getByText("O que fazer esta semana?", { exact: true }).first()).toBeVisible();
      await expect(page.locator('[data-tela="hoje"]').getByRole("img", { name: "Número sem selo de confiança" })).toHaveCount(1);
      const n = await acoes(page).count();
      expect(n, "a Hoje mostra de 3 a 5 ações").toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      console.log(`  Hoje (${perfil}, ${janela.width}x${janela.height}): ${n} ações`);

      for (let k = 0; k < n; k++) {
        const acao = acoes(page).nth(k);
        await expect(acao.locator("strong").first(), `a ação ${k + 1} tem o número em strong`).toBeVisible();
        await expect(acao.getByText(/Quem resolve:/).first()).toBeVisible();
        const seta = acao.locator("a.nx-acao-pilula__seta");
        await expect(seta).toHaveCount(1);
        const href = (await seta.getAttribute("href"))!;
        const rota = rotaDoLink(href);
        const linha = REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca);
        expect(linha, `a seta da ação ${k + 1} (${href}) tem de abrir uma linha do registro`).toBeTruthy();
        expect(linha!.situacao, `${href} aponta para tela tirada`).not.toBe("tirada");
        expect(linha!.soRedireciona, `${href} só redireciona`).toBeFalsy();
        expect(new URL(href, "http://x").searchParams.get("preset"), "a seta mantém o período").toBe("30d");
      }
      expect(await semRolagemLateral(page)).toBe(true);

      // Clicar na seta da primeira ação abre a aba de origem, com a pasta quando a aba é de tela juntada, mantendo o período.
      const href = (await acoes(page).first().locator("a.nx-acao-pilula__seta").getAttribute("href"))!;
      await acoes(page).first().locator("a.nx-acao-pilula__seta").click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(href, "http://x").pathname);
      expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
      if (ROTAS_DAS_ABAS.has(rotaDoLink(href))) await expect(page.locator("[data-juntada]")).toBeVisible();
      await expect(page.locator('[data-tela="hoje"]')).toHaveCount(0);
    });
  }
}

for (const janela of TELAS_DE_MEDIDA) {
  test(`(b) o texto da Hoje não traz os 4 números da Phase 9 (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosRealistas(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(acoes(page).first()).toBeVisible();

    const texto = await page.locator('[data-tela="hoje"]').innerText();
    expect(texto, "texto com Agendaram, Fecharam, Chamaram ou Foram").not.toMatch(GUARDA_DE_TEXTO_DA_HOJE);
    // Números de destaque: o número (em strong) e a legenda de cada ação. A frase da ação pode falar de consulta ("conferir
    // quantas conversas viraram consulta"); o que a guarda barra é o NÚMERO de agendamentos, vendas, consultas ou contatos.
    const destaques = await page.locator('[data-tela="hoje"] [data-acao-hoje] strong, [data-tela="hoje"] [data-numero-de-destaque]').allInnerTexts();
    expect(destaques.length, "há números de destaque para conferir").toBeGreaterThan(0);
    for (const t of destaques) expect(t, "número de destaque de agendamento, venda, consulta ou contato").not.toMatch(GUARDA_DE_NUMERO_DA_HOJE);
  });
}

test("(c) com o Instagram parado há 10 dias: Sem leitura, para consertar e quem resolve, o mesmo motivo de Resultados", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await instagramParado(context, 10);
  await mockPessoas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);

  const leitura = page.locator('[data-tela="hoje"] [data-peca="leitura"]');
  await expect(leitura.getByText(/Sem leitura:/)).toBeVisible();
  await expect(leitura.getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
  await expect(leitura.getByText(/Para consertar:/)).toBeVisible();
  await expect(leitura.getByText("Quem resolve: Equipe Doctor Creator")).toBeVisible();
  await expect(acoes(page)).toHaveCount(0);
  expect(await semRolagemLateral(page)).toBe(true);
  // O mesmo motivo que Resultados da clínica dá para os mesmos dados.
  await page.goto(`/${CID}?preset=30d`);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true }).getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
});

/** Poucos posts, todos do mesmo formato (menos que a amostra mínima de comparação): só rendem fatos de uma ação ou duas. */
const POUCOS_POSTS = Array.from({ length: 6 }, (_, i) => ({
  id: `q${i}`, client_id: CID, windsor_media_id: `n${i}`, caption: `Post de teste ${i}`, format: "reels",
  posted_at: new Date(Date.now() - (i + 3) * 86400000).toISOString(), reach: 800 + i * 40, engagement: 40 + i, saved: 3 + i, permalink: null, thumbnail_url: null,
}));

for (const janela of TELAS_DE_MEDIDA) {
  test(`(d) com poucos dados: só as ações que existem, o aviso com o motivo e nenhuma ação inventada (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    // Mocks reduzidos: só o Instagram, com 6 posts. Sem anúncios, sem CRM e sem pessoas, a regra só acha 1 ou 2 ações.
    await instagramParado(context, 0, POUCOS_POSTS);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);

    await expect(page.locator('[data-tela="hoje"] [data-peca="leitura"][data-modo="carregando"]')).toHaveCount(0);
    const aviso = page.locator('[data-tela="hoje"]').getByText(/^Poucas ações nesta semana:/);
    await expect(aviso).toBeVisible();
    const n = await acoes(page).count();
    expect(n, "com poucos dados a Hoje mostra de 0 a 2 ações, nunca completa até 3").toBeLessThanOrEqual(2);
    console.log(`  Hoje com poucos dados (${janela.width}x${janela.height}): ${n} ação(ões); aviso: ${await aviso.innerText()}`);
    // O aviso diz o motivo, curto, sem prometer nada.
    expect(await aviso.innerText()).toMatch(/^Poucas ações nesta semana: .{10,}\.$/);
    for (let k = 0; k < n; k++) await expect(acoes(page).nth(k).locator("strong").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/hoje-poucas-${janela.width}.png`, fullPage: true });
  });
}

test("(d) sem nenhuma ação: o aviso diz o motivo e a tela não inventa ação", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await instagramParado(context, 0, []);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(page.locator('[data-tela="hoje"]').getByText(/^Poucas ações nesta semana:/)).toBeVisible();
  await expect(acoes(page)).toHaveCount(0);
});

// ---------- Task 2: o desenho do D-07 e a régua de 1,5 tela ----------

const norm = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim();

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`(e) ${perfil} a ${janela.width}x${janela.height}: a Hoje cabe em ${LIMITE_DE_ALTURA} vez a altura da janela e não rola de lado`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);
      await expect(acoes(page).first()).toBeVisible();

      const { altura, janela: altJanela } = await alturaDaAbaAberta(page, '[data-tela="hoje"]');
      console.log(`  Hoje (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${altJanela} (${(altura / altJanela).toFixed(2)}x), ${await acoes(page).count()} ações`);
      expect(altura, `a Hoje mede ${Math.round(altura)} px; o limite é ${LIMITE_DE_ALTURA} x ${altJanela}`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altJanela);
      expect(await semRolagemLateral(page)).toBe(true);
      if (perfil === "admin") await page.screenshot({ path: `test-results/redesenho/hoje-${janela.width}.png`, fullPage: true });
    });
  }
}

test("(f) o Próximo da Hoje é a mesma frase da Ação da semana de Resultados da clínica", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  const resumo = page.getByRole("region", { name: "Resumo da clínica", exact: true });
  const daSemana = resumo.locator(".nx-leitura__linha", { has: page.getByText("Ação da semana", { exact: true }) }).locator(".nx-acao-pilula__texto");
  await expect(daSemana).toBeVisible();
  // Resultados mostra o resumo assim que chega o Instagram e refaz com pessoas, anúncios e CRM: espera as consultas terminarem.
  await page.waitForLoadState("networkidle");
  await expect(daSemana).toBeVisible();
  const fraseDaSemana = norm(await daSemana.innerText());

  await page.goto(`/${CID}/hoje?preset=30d`);
  const proximo = page.locator('[data-tela="hoje"] [data-peca="proximo"] .nx-acao-pilula__texto');
  await expect(proximo).toBeVisible();
  expect(norm(await proximo.innerText()), "o Próximo é a Ação da semana").toBe(fraseDaSemana);
});

test("(g) nenhum botão da Hoje envia ou grava nada: só navega (CHAM-07)", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const escritas: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" || r.method() === "HEAD" || r.method() === "OPTIONS") return;
    // As telas de destino leem por rpc (POST de leitura) e a de Público lê a Meta por /api/sync/manual: a regra é sobre ESCREVER
    // pelo botão, isto é, POST, PATCH ou DELETE em tabela de /rest/v1, fora o log por rota (rota_acessos).
    const escreveTabela = url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/rest/v1/rpc/") && url.pathname !== "/rest/v1/rota_acessos";
    if (escreveTabela) escritas.push(`${r.method()} ${url.pathname}`);
  });
  const url = `/${CID}/hoje?preset=30d`;
  await page.goto(url);
  await expect(acoes(page).first()).toBeVisible();
  const botoes = page.locator('[data-tela="hoje"] a.nx-acao-pilula__seta, [data-tela="hoje"] a.nx-botao-abrir');
  const total = await botoes.count();
  expect(total, "a Hoje tem botões para clicar").toBeGreaterThanOrEqual(4);
  for (let k = 0; k < total; k++) {
    await page.goto(url);
    await expect(acoes(page).first()).toBeVisible();
    const href = (await botoes.nth(k).getAttribute("href"))!;
    await botoes.nth(k).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(href, "http://x").pathname);
  }
  expect(escritas, "nenhum clique da Hoje pode escrever").toEqual([]);
});

test("(h) o ↗ leva à primeira aba da tela juntada e a seta da pílula leva à aba da ação", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();

  const comAbrir = page.locator('[data-tela="hoje"] [data-acao-hoje]', { has: page.locator("a.nx-botao-abrir") });
  expect(await comAbrir.count(), "ao menos uma ação é de tela juntada").toBeGreaterThan(0);
  const cartao = comAbrir.first();
  const hrefAbrir = new URL((await cartao.locator("a.nx-botao-abrir").getAttribute("href"))!, "http://x");
  const hrefSeta = new URL((await cartao.locator("a.nx-acao-pilula__seta").getAttribute("href"))!, "http://x");
  const primeiras = SECOES_JUNTADAS.map((sec) => sec.abas[0].partes[0].rota);
  expect(primeiras, "o ↗ abre uma primeira aba de tela juntada").toContain(rotaDoLink(hrefAbrir.pathname));
  expect(ROTAS_DAS_ABAS.has(rotaDoLink(hrefSeta.pathname)), "a seta da pílula abre uma aba de tela juntada").toBe(true);
  expect(hrefAbrir.searchParams.get("preset")).toBe("30d");

  await cartao.locator("a.nx-botao-abrir").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(hrefAbrir.pathname);
  await expect(page.locator("[data-juntada]")).toBeVisible();
  await expect(page.locator('[data-juntada] a[aria-current="page"]').first()).toBeVisible();

  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();
  await page.locator('[data-tela="hoje"] [data-acao-hoje]', { has: page.locator("a.nx-botao-abrir") }).first().locator("a.nx-acao-pilula__seta").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(hrefSeta.pathname);
});

/** Troca só o nome do cliente (clients.name) devolvido pela leitura de clients, como a fixture faz. */
async function comNomeDaClinica(context: BrowserContext, name: string) {
  await context.route("http://localhost:9/rest/v1/clients**", (r) => {
    const unico = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const c = { ...client, name };
    return r.fulfill({ json: unico ? c : [c] });
  });
}

const SAUDACAO = /^(Bom dia|Boa tarde|Boa noite)$/;

test("(i) a saudação é só Bom dia, Boa tarde ou Boa noite: nunca usa o nome da clínica", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  const saudacao = page.locator('[data-tela="hoje"] h1.nx-pagina__saudacao');
  await expect(saudacao).toBeVisible();
  await expect(saudacao).toHaveText(SAUDACAO);
  await expect(saudacao.locator(".nx-hoje__nome")).toHaveCount(0);
  const peso = await saudacao.evaluate((el) => Number(getComputedStyle(el).fontWeight));
  expect(peso).toBeGreaterThanOrEqual(500);
});

test("(i2) saudação com nome longo de clínica e sem nome de médico: só a saudação, sem cortar o nome", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await comNomeDaClinica(context, "Clínica de Dermatologia Avançada e Estética Integrada Ltda");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  const saudacao = page.locator('[data-tela="hoje"] h1.nx-pagina__saudacao');
  await expect(saudacao).toBeVisible();
  await expect(saudacao).toHaveText(SAUDACAO);
  await expect(saudacao).not.toContainText("Clínica");
  await expect(saudacao.locator(".nx-hoje__nome")).toHaveCount(0);
});

test("(i3) saudação com nome de médico: o título e o primeiro nome inteiros, em cinza mais claro", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await comNomeDaClinica(context, "Dra. Lana Ribeiro");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  const saudacao = page.locator('[data-tela="hoje"] h1.nx-pagina__saudacao');
  await expect(saudacao).toBeVisible();
  await expect(saudacao).toHaveText(/^(Bom dia|Boa tarde|Boa noite), Dra\. Lana$/);
  await expect(saudacao.locator(".nx-hoje__nome")).toHaveText("Dra. Lana");
  const cor = await saudacao.evaluate((el) => ({ h1: getComputedStyle(el).color, nome: getComputedStyle(el.querySelector(".nx-hoje__nome")!).color }));
  expect(cor.nome, "o nome é mais claro que a saudação").not.toBe(cor.h1);
});

test("(j) todo cartão de ação tem o ícone num círculo e os chips de contexto aparecem", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();
  const cartoes = page.locator('[data-tela="hoje"] .nx-cartao-acao .nx-cartao');
  const n = await cartoes.count();
  expect(n, "há cartões de ação").toBeGreaterThan(0);
  for (let k = 0; k < n; k++) {
    const icone = cartoes.nth(k).locator(".nx-cartao__icone");
    await expect(icone.locator("svg")).toHaveCount(1);
    expect(await icone.evaluate((el) => getComputedStyle(el).borderRadius)).toMatch(/^(50%|\d+(\.\d+)?px)$/);
    const caixa = await icone.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    expect(caixa.w).toBeCloseTo(caixa.h, 0);
    // D-07: o subtítulo traz o número de contexto; "Quem resolve" fica junto da pílula da ação.
    await expect(cartoes.nth(k).locator(".nx-cartao__sub")).toHaveText(/^\d+ dias?( · .+)?$/);
    await expect(cartoes.nth(k).locator(".nx-hoje__quem")).toHaveText(/^Quem resolve: /);
    await expect(cartoes.nth(k).locator("a.nx-acao-pilula__seta")).toHaveCount(1);
  }
  // O Próximo vem antes dos cartões e o total não passa de 5 ações.
  expect(await acoes(page).count()).toBeLessThanOrEqual(5);
  await expect(page.locator('[data-tela="hoje"] [data-peca="proximo"]')).toHaveCount(1);
  await expect(page.locator('[data-tela="hoje"] [data-acao-hoje]').first()).toHaveAttribute("data-peca", "proximo");
  await expect(page.locator('[data-tela="hoje"] .nx-chip-contexto', { hasText: /^dado até \d{2}\/\d{2}$/ })).toHaveCount(1);
});

test("a Hoje mostra o estado das fontes com bolinha: âmbar com mais de 1 dia", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  const agora = Date.now();
  const dia = (n: number) => new Date(agora - n * 86400000).toISOString().slice(0, 10);
  await context.route("**/rest/v1/rpc/client_sync_status", (r) =>
    r.fulfill({
      json: [
        { fonte: "instagram", last_attempt_at: null, last_success_at: new Date(agora - 3600_000).toISOString(), last_error: null, last_rows: 10, data_ate: dia(0) },
        { fonte: "crm", last_attempt_at: null, last_success_at: new Date(agora - 3 * 86400000).toISOString(), last_error: null, last_rows: 10, data_ate: dia(3) },
      ],
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();
  const ig = page.locator('[data-tela="hoje"] .nx-chip-estado', { hasText: "Instagram até" });
  const crm = page.locator('[data-tela="hoje"] .nx-chip-estado', { hasText: "CRM até" });
  await expect(ig).toHaveAttribute("data-tom", "bom");
  await expect(crm).toHaveAttribute("data-tom", /^(atencao|ruim)$/);
  await expect(crm).toHaveAttribute("aria-label", /^CRM até \d{2}\/\d{2}, às \d{2}:\d{2}$/);
  expect(await crm.locator(".nx-chip-estado__bolinha").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(await ig.locator(".nx-chip-estado__bolinha").evaluate((el) => getComputedStyle(el).backgroundColor));
});

// ---------- Para a equipe: a arrumação interna do dado só aparece para admin e estrategista ----------

for (const perfil of ["viewer", "strategist", "admin"] as const) {
  test(`(n) Para a equipe: ${perfil} ${perfil === "viewer" ? "não vê a tarefa interna" : "vê a tarefa interna só na linha pequena"}`, async ({ page, context }) => {
    await mockAccount(context, perfil);
    await dadosRealistas(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(acoes(page).first()).toBeVisible();
    const tela = page.locator('[data-tela="hoje"]');

    // Nos 3 perfis a tarefa interna nunca é uma ação da lista do médico.
    await expect(page.locator('[data-acao-hoje="posts-sem-tema"]')).toHaveCount(0);
    if (perfil === "viewer") {
      await expect(page.locator('[data-peca="para-equipe"]')).toHaveCount(0);
      await expect(page.locator("[data-acao-equipe]")).toHaveCount(0);
      const texto = await tela.innerText();
      expect(texto).not.toContain("Para a equipe");
      expect(texto).not.toContain("sem classificação");
    } else {
      await expect(page.locator('[data-peca="para-equipe"]')).toBeVisible();
      const item = page.locator('[data-acao-equipe="posts-sem-tema"]');
      await expect(item).toHaveCount(1);
      const href = (await item.locator("a").getAttribute("href"))!;
      const url = new URL(href, "http://x");
      expect(url.pathname).toBe(`/${CID}/posts`);
      expect(url.searchParams.get("preset")).toBe("30d");
    }
  });
}

// ---------- manchete leiga, no máximo 2 por área e o Próximo sem repetir o achado ----------

for (const janela of TELAS_DE_MEDIDA) {
  test(`(l) manchete curta e leiga, com os números técnicos fechados (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dadosRealistas(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(acoes(page).first()).toBeVisible();

    const n = await acoes(page).count();
    expect(n).toBeGreaterThan(0);
    for (let k = 0; k < n; k++) {
      const acao = acoes(page).nth(k);
      const manchete = norm(await acao.locator("[data-manchete]").innerText());
      expect(manchete.length, `manchete "${manchete}" com mais de ${MAX_CARACTERES_DA_MANCHETE} caracteres`).toBeLessThanOrEqual(MAX_CARACTERES_DA_MANCHETE);
      const textos = [manchete, norm(await acao.locator(".nx-acao-pilula__texto").innerText())];
      const legenda = acao.locator(".nx-proximo__legenda, .nx-numero__legenda");
      if (await legenda.count()) textos.push(norm(await legenda.first().innerText()));
      const sub = acao.locator(".nx-cartao__sub");
      if (await sub.count()) textos.push(norm(await sub.first().innerText()));
      for (const t of textos) expect(t, `jargão em "${t}"`).not.toMatch(JARGAO_DA_HOJE);
    }
    // O número técnico inteiro fica num "Ver números" fechado.
    const detalhes = page.locator('[data-tela="hoje"] details[data-ver-numeros]');
    const total = await detalhes.count();
    for (let k = 0; k < total; k++) {
      expect(await detalhes.nth(k).evaluate((el) => (el as HTMLDetailsElement).open), "Ver números começa fechado").toBe(false);
      await expect(detalhes.nth(k).locator("summary")).toHaveText("Ver números");
    }
    console.log(`  Hoje (${janela.width}x${janela.height}): ${n} ações, ${total} com Ver números`);
    // Com tudo fechado, o texto da tela inteira também não traz jargão.
    expect(await page.locator('[data-tela="hoje"]').innerText(), "jargão no texto da Hoje").not.toMatch(JARGAO_DA_HOJE);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("(l2) abrir o Ver números mostra o número técnico inteiro", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();
  const detalhes = page.locator('[data-tela="hoje"] details[data-ver-numeros]');
  if ((await detalhes.count()) === 0) return;
  await detalhes.first().locator("summary").click();
  await expect(detalhes.first().locator("p")).toBeVisible();
  expect(norm(await detalhes.first().locator("p").innerText()).length).toBeGreaterThan(0);
});

test("(m) no máximo 2 ações por área e o Próximo não se repete nos cartões", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(acoes(page).first()).toBeVisible();

  const dados = await page.locator('[data-tela="hoje"] [data-acao-hoje]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute("data-acao-hoje"), area: el.getAttribute("data-area-hoje"), familia: el.getAttribute("data-familia-hoje"), proximo: el.getAttribute("data-peca") === "proximo" })),
  );
  console.log(`  Hoje (1440x900): ${dados.length} ações: ${dados.map((d) => `${d.id} [${d.area}/${d.familia}]`).join(" | ")}`);
  const porArea = new Map<string | null, number>();
  for (const d of dados) porArea.set(d.area, (porArea.get(d.area) ?? 0) + 1);
  for (const [area, quantas] of porArea) expect(quantas, `a área ${area} tem ${quantas} ações`).toBeLessThanOrEqual(MAXIMO_POR_AREA);
  expect(new Set(dados.map((d) => d.familia)).size, "todas as famílias são diferentes").toBe(dados.length);
  const proximo = dados.find((d) => d.proximo);
  expect(proximo, "há um Próximo").toBeTruthy();
  expect(dados.filter((d) => !d.proximo && d.familia === proximo!.familia), "nenhum cartão tem a família do Próximo").toEqual([]);
});
