import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, client, mockAccount } from "./fixtures";
import { REGISTRO_DE_TELAS, SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { GUARDA_DE_NUMERO_DA_HOJE, GUARDA_DE_TEXTO_DA_TELA_HOJE, JARGAO_DA_HOJE, MAXIMO_POR_AREA } from "../../src/lib/leitura/fatos-hoje";
import { checarFraseCinco } from "../../src/lib/leitura/cinco-segundos";
import { abrirVerTudo, conferirCincoSegundos } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// O que fazer hoje (Phase 3.1.1, plano 05, e 03.1.1.1, plano 01): a tela Hoje no formato 5 segundos. O veredito abre a tela, depois vêm
// até 3 números-chave, as descobertas (de 3 a 5 ações da semana por regra fixa dos fatos que Resultados da clínica já lê, cada uma com
// quem resolve, uma ação que só navega e um "Por quê?") e o "Ver tudo" fechado. Chamaram e Compareceram (e "foram à consulta") não
// aparecem no texto da página; Agendaram e Fecharam podem (emenda A-01 do João, 12/11/2026). Dados fictícios, só leitura.

test.use({ reducedMotion: "reduce" });

const acoes = (page: Page) => page.locator('[data-tela="hoje"] [data-acao-hoje]');
/** As descobertas à vista (as ações que ficaram no "Ver tudo" são cartões e não entram aqui). */
const descobertas = (page: Page) => page.locator('[data-tela="hoje"] [data-peca="descoberta"]');
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
    test(`(a) ${perfil} a ${janela.width}x${janela.height}: de 3 a 5 ações, as 3 primeiras como descobertas com quem resolve e seta para a aba de origem`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);

      await expect(descobertas(page).first()).toBeVisible();
      // Topo de título único: a saudação. O total da semana ("N ações esta semana") é o título da seção de descobertas e aparece uma vez só.
      const total = page.locator('[data-tela="hoje"] [data-peca="total-da-semana"]');
      await expect(total).toHaveCount(1);
      await expect(total).toBeVisible();
      await expect(total).toHaveText(/^\d+ ações? esta semana$/);
      await expect(page.locator('[data-tela="hoje"] .nx-pagina__titulos [data-peca="total-da-semana"]'), "o total saiu do topo").toHaveCount(0);
      await expect(page.locator('[data-tela="hoje"] .nx-pagina__rotulo'), "sem o rótulo pequeno da tela").toHaveCount(0);
      await expect(page.locator('[data-tela="hoje"] .nx-pagina__meta .nx-tag'), "sem a etiqueta da decisão").toHaveCount(0);
      await expect(page.locator('[data-tela="hoje"] .nx-chip-contexto', { hasText: /^(?!dado até)/ }), "sem o chip com o nome da clínica").toHaveCount(0);
      await expect(page.locator('[data-tela="hoje"]').getByRole("img", { name: "Número sem selo de confiança" })).toHaveCount(1);
      const n = await acoes(page).count();
      expect(Number((await total.innerText()).match(/^\d+/)![0]), "o total do título é o número de ações da tela (à vista e no Ver tudo)").toBe(n);
      expect(n, "a Hoje mostra de 3 a 5 ações").toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      const aVista = await descobertas(page).count();
      expect(aVista, "no máximo 3 descobertas à vista").toBeLessThanOrEqual(3);
      console.log(`  Hoje (${perfil}, ${janela.width}x${janela.height}): ${n} ações, ${aVista} à vista`);

      for (let k = 0; k < aVista; k++) {
        const d = descobertas(page).nth(k);
        // Tom da descoberta: sinal e palavra (nunca só a cor).
        const selo = d.locator(".nx-selo");
        await expect(selo, `a descoberta ${k + 1} tem o selo`).toHaveCount(1);
        expect(["bom", "atencao", "ruim", "neutro"]).toContain(await selo.getAttribute("data-tom"));
        expect((await d.locator(".nx-selo__sinal").innerText()).trim().length, "o sinal (glifo) não é vazio").toBeGreaterThan(0);
        expect((await d.locator(".nx-selo__texto").innerText()).trim().length, "o selo diz a palavra").toBeGreaterThan(0);
        // "Quem resolve" em chip: o olho vê só o nome, o leitor de tela ouve "Quem resolve: nome".
        const quem = d.locator(".nx-descoberta__quem");
        await expect(quem).toBeVisible();
        const visivel = await quem.evaluate((el) => {
          const copia = el.cloneNode(true) as HTMLElement;
          copia.querySelectorAll(".sr-only").forEach((x) => x.remove());
          return (copia.textContent ?? "").trim();
        });
        expect(visivel.length, "o chip mostra o nome").toBeGreaterThan(0);
        expect(visivel, "o texto visível do chip não repete o rótulo").not.toMatch(/Quem resolve/);
        expect((await quem.textContent()) ?? "").toMatch(/^Quem resolve: \S/);
        // Uma ação só, que navega para uma linha viva do registro mantendo o período.
        const seta = d.locator("a.nx-acao-pilula__seta");
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

      // Clicar na seta da primeira descoberta abre a aba de origem, com a pasta quando a aba é de tela juntada, mantendo o período.
      const href = (await descobertas(page).first().locator("a.nx-acao-pilula__seta").getAttribute("href"))!;
      await descobertas(page).first().locator("a.nx-acao-pilula__seta").click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(href, "http://x").pathname);
      expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
      if (ROTAS_DAS_ABAS.has(rotaDoLink(href))) await expect(page.locator("[data-juntada]")).toBeVisible();
      await expect(page.locator('[data-tela="hoje"]')).toHaveCount(0);
    });
  }
}

for (const janela of TELAS_DE_MEDIDA) {
  test(`(b) o texto visível da Hoje não traz Chamaram, Compareceram nem "foram à consulta" (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosRealistas(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(descobertas(page).first()).toBeVisible();

    // A-01 (João, 12/11/2026): Agendaram e Fecharam podem aparecer na Hoje (etapa do funil e fator da nota); Chamaram e Compareceram não.
    // Só o texto visível conta: o que está dentro do "Ver tudo" fechado não aparece em innerText.
    const texto = await page.locator('[data-tela="hoje"]').innerText();
    expect(texto, "texto com Chamaram, Compareceram ou foram à consulta").not.toMatch(GUARDA_DE_TEXTO_DA_TELA_HOJE);
    // Números de destaque das ações (o número em destaque de cada descoberta): nada de agendamento, venda, consulta ou contato.
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

  // Formato 5 segundos (03.1.1.1): o veredito diz o "Falta dado" no lugar da leitura, e nenhuma conclusão.
  const leitura = page.locator('[data-tela="hoje"] [data-peca="veredito"]');
  await expect(leitura).toHaveAttribute("data-modo", "sem-leitura");
  await expect(leitura.getByText(/Falta dado:/)).toBeVisible();
  await expect(leitura.getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
  await expect(leitura.getByText(/Próximo passo para resolver:/)).toBeVisible();
  await expect(leitura.getByText("Quem resolve: Equipe Doctor Creator")).toBeVisible();
  await expect(acoes(page)).toHaveCount(0);
  expect(await semRolagemLateral(page)).toBe(true);
  // O mesmo motivo que Resultados da clínica dá para os mesmos dados.
  await page.goto(`/${CID}?preset=30d`);
  await abrirResumoDeResultados(page);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true }).getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
});

/** Resultados (03.1.1.1-03): o resumo fica no "Ver tudo"; espera o veredito sair de "carregando" antes de abrir. */
async function abrirResumoDeResultados(page: import("@playwright/test").Page) {
  const v = page.locator('[data-tela="resultados"] [data-peca="veredito"]');
  await expect(v).toBeVisible();
  await expect(v).not.toHaveAttribute("data-modo", "carregando");
  await abrirVerTudo(page, '[data-tela="resultados"]');
}

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

    await expect(page.locator('[data-tela="hoje"] [data-peca="veredito"][data-modo="carregando"]')).toHaveCount(0);
    const aviso = page.locator('[data-tela="hoje"] .nx-hoje__aviso');
    await expect(aviso).toBeVisible();
    const n = await acoes(page).count();
    expect(n, "com poucos dados a Hoje mostra de 0 a 2 ações, nunca completa até 3").toBeLessThanOrEqual(2);
    console.log(`  Hoje com poucos dados (${janela.width}x${janela.height}): ${n} ação(ões); aviso: ${await aviso.innerText()}`);
    // O aviso é só o motivo, curto, sem prometer nada, sem a palavra "leituras" e sem repetir o total do topo.
    expect(await aviso.innerText()).toMatch(/^\p{Lu}.{10,}\.$/u);
    expect(await aviso.innerText()).not.toMatch(/Poucas ações|leituras/);
    for (let k = 0; k < (await descobertas(page).count()); k++) await expect(descobertas(page).nth(k).locator(".nx-descoberta__frase")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/hoje-poucas-${janela.width}.png`, fullPage: true });
  });
}

test("(d) sem nenhuma ação: o aviso diz o motivo e a tela não inventa ação", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await instagramParado(context, 0, []);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(page.locator('[data-tela="hoje"] .nx-hoje__aviso')).toHaveText("Os números deste período não pediram nenhuma ação.");
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
      await expect(descobertas(page).first()).toBeVisible();

      const { altura, janela: altJanela } = await alturaDaAbaAberta(page, '[data-tela="hoje"]');
      console.log(`  Hoje (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${altJanela} (${(altura / altJanela).toFixed(2)}x), ${await acoes(page).count()} ações`);
      expect(altura, `a Hoje mede ${Math.round(altura)} px; o limite é ${LIMITE_DE_ALTURA} x ${altJanela}`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altJanela);
      expect(await semRolagemLateral(page)).toBe(true);
      if (perfil === "admin") await page.screenshot({ path: `test-results/redesenho/hoje-${janela.width}.png`, fullPage: true });
    });
  }
}

// O formato 5 segundos (03.1.1.1, D-01, D-02, D-08): a mesma conferência de toda tela convertida, para o médico e para a equipe, no celular e no computador.
for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`(p) ${perfil} a ${janela.width}x${janela.height}: veredito, até 3 números, de 3 a 5 descobertas, Ver tudo fechado, sem comparar clínicas e nada cortado`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);
      await expect(descobertas(page).first()).toBeVisible();

      await conferirCincoSegundos(page, '[data-tela="hoje"]');
      expect(await semRolagemLateral(page)).toBe(true);
      // As alturas da régua de 1,5 tela (D-08): 1218 px no celular e 1350 px no computador, com o Ver tudo fechado.
      const { altura, janela: altJanela } = await alturaDaAbaAberta(page, '[data-tela="hoje"]');
      expect(altura, `a Hoje mede ${Math.round(altura)} px`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altJanela);
    });
  }
}

test("(f) a primeira descoberta da Hoje é a mesma frase do Próximo passo de Resultados da clínica", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  // O Próximo passo de Resultados fica dentro do "Ver tudo" (03.1.1.1-03).
  await abrirResumoDeResultados(page);
  const resumo = page.getByRole("region", { name: "Resumo da clínica", exact: true });
  const daSemana = resumo.locator(".nx-leitura__linha", { has: page.getByText("Próximo passo", { exact: true }) }).locator(".nx-acao-pilula__texto");
  await expect(daSemana).toBeVisible();
  // Resultados mostra o resumo assim que chega o Instagram e refaz com pessoas, anúncios e CRM: espera as consultas terminarem.
  await page.waitForLoadState("networkidle");
  await abrirVerTudo(page, '[data-tela="resultados"]');
  await expect(daSemana).toBeVisible();
  const fraseDaSemana = norm(await daSemana.innerText());

  await page.goto(`/${CID}/hoje?preset=30d`);
  const primeira = page.locator('[data-tela="hoje"] [data-peca="descoberta"][data-proximo] .nx-acao-pilula__texto');
  await expect(primeira).toBeVisible();
  // A descoberta mostra a ação sem o ponto final do botão.
  expect(`${norm(await primeira.innerText())}.`, "a primeira descoberta é a Ação da semana").toBe(fraseDaSemana);
});

test("(g) nenhum botão da Hoje envia ou grava nada: só navega ou abre o Por quê? (CHAM-07)", async ({ page, context }) => {
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
  await expect(descobertas(page).first()).toBeVisible();
  // O "Por quê?" só abre o painel (nenhuma escrita) e mostra de 2 a 3 fatores.
  const porques = page.locator('[data-tela="hoje"] [data-peca="descoberta"] button.nx-descoberta__porque-botao');
  const quantos = await porques.count();
  expect(quantos, "cada descoberta tem o Por quê?").toBe(await descobertas(page).count());
  for (let k = 0; k < quantos; k++) {
    await porques.nth(k).click();
    await expect(porques.nth(k)).toHaveAttribute("aria-expanded", "true");
    const fatores = descobertas(page).nth(k).locator(".nx-barras__item");
    expect(await fatores.count(), "o Por quê? mostra de 2 a 3 fatores").toBeGreaterThanOrEqual(2);
    expect(await fatores.count()).toBeLessThanOrEqual(3);
  }
  const botoes = page.locator('[data-tela="hoje"] a.nx-acao-pilula__seta, [data-tela="hoje"] a.nx-botao-abrir');
  const total = await botoes.count();
  expect(total, "a Hoje tem botões para clicar").toBeGreaterThanOrEqual(3);
  for (let k = 0; k < total; k++) {
    await page.goto(url);
    await expect(descobertas(page).first()).toBeVisible();
    const href = (await botoes.nth(k).getAttribute("href"))!;
    await botoes.nth(k).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(href, "http://x").pathname);
  }
  expect(escritas, "nenhum clique da Hoje pode escrever").toEqual([]);
});

test("(h) a seta da descoberta leva à aba da ação, com a pasta quando a aba é de tela juntada", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(descobertas(page).first()).toBeVisible();

  const setas = page.locator('[data-tela="hoje"] [data-peca="descoberta"] a.nx-acao-pilula__seta');
  let juntada = -1;
  for (let k = 0; k < (await setas.count()); k++) {
    if (ROTAS_DAS_ABAS.has(rotaDoLink((await setas.nth(k).getAttribute("href"))!))) {
      juntada = k;
      break;
    }
  }
  expect(juntada, "ao menos uma descoberta é de tela juntada").toBeGreaterThanOrEqual(0);
  const href = new URL((await setas.nth(juntada).getAttribute("href"))!, "http://x");
  expect(href.searchParams.get("preset")).toBe("30d");
  await setas.nth(juntada).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href.pathname);
  await expect(page.locator("[data-juntada]")).toBeVisible();
  await expect(page.locator('[data-juntada] a[aria-current="page"]').first()).toBeVisible();
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

test("(j) toda descoberta tem selo com sinal, quem resolve, uma seta e o Por quê?; o chip dado até aparece", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(descobertas(page).first()).toBeVisible();
  const n = await descobertas(page).count();
  expect(n, "há descobertas").toBeGreaterThan(0);
  for (let k = 0; k < n; k++) {
    const d = descobertas(page).nth(k);
    await expect(d.locator(".nx-selo__sinal")).toHaveCount(1);
    await expect(d.locator(".nx-descoberta__quem")).toHaveText(/^Quem resolve: /);
    await expect(d.locator("a.nx-acao-pilula__seta")).toHaveCount(1);
    await expect(d.locator("button.nx-descoberta__porque-botao")).toHaveText("Por quê?");
    // A seta é o botão escuro redondo, com a seta de 18 px dentro.
    await expect(d.locator("a.nx-acao-pilula__seta svg")).toHaveCount(1);
  }
  // A primeira descoberta é o Próximo e o total não passa de 5 ações.
  expect(await acoes(page).count()).toBeLessThanOrEqual(5);
  await expect(page.locator('[data-tela="hoje"] [data-proximo]')).toHaveCount(1);
  await expect(page.locator('[data-tela="hoje"] [data-acao-hoje]').first()).toHaveAttribute("data-proximo", "");
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
  await expect(descobertas(page).first()).toBeVisible();
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
    await expect(descobertas(page).first()).toBeVisible();
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
      // A linha pequena da equipe mora no "Ver tudo", fechado: abre para ver.
      await expect(page.locator('[data-peca="para-equipe"]')).toBeHidden();
      await abrirVerTudo(page, '[data-tela="hoje"]');
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
  test(`(l) frase curta e leiga em cada descoberta, sem jargão, com o texto da tela sem ÷ (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dadosRealistas(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(descobertas(page).first()).toBeVisible();

    const n = await descobertas(page).count();
    expect(n).toBeGreaterThan(0);
    for (let k = 0; k < n; k++) {
      const d = descobertas(page).nth(k);
      const frase = norm(await d.locator(".nx-descoberta__frase").innerText());
      // Frase de uma frase só, até 90 caracteres, sem jargão e sem comparar com outras clínicas.
      expect(checarFraseCinco(frase), `frase "${frase}"`).toEqual([]);
      expect(frase.split(/(?<=[.!?])\s+/).length, `frase "${frase}" com mais de uma frase`).toBe(1);
      const textos = [frase, norm(await d.locator(".nx-acao-pilula__texto").innerText())];
      const chip = d.locator(".nx-descoberta__impacto");
      if (await chip.count()) {
        const t = norm(await chip.innerText());
        expect(t.length, `impacto "${t}" com mais de 40 caracteres`).toBeLessThanOrEqual(40);
        textos.push(t);
      }
      for (const t of textos) expect(t, `jargão em "${t}"`).not.toMatch(JARGAO_DA_HOJE);
      // Barras do Por quê?: cada linha tem nome acessível "rótulo: valor" e nunca "atingido".
      const linhasDeBarra = d.locator('[data-barras] [role="img"]');
      for (let b = 0; b < (await linhasDeBarra.count()); b++) {
        const nome = (await linhasDeBarra.nth(b).getAttribute("aria-label")) ?? "";
        expect(nome, "nome acessível da barra").toContain(":");
        expect(nome, "a barra não diz % atingido").not.toMatch(/atingido/i);
      }
    }
    console.log(`  Hoje (${janela.width}x${janela.height}): ${n} descobertas à vista`);
    // Com tudo fechado, o texto da tela inteira também não traz jargão.
    expect(await page.locator('[data-tela="hoje"]').innerText(), "jargão no texto da Hoje").not.toMatch(JARGAO_DA_HOJE);
    expect(await page.locator('[data-tela="hoje"]').innerText(), "o ÷ fica fora do texto à vista").not.toContain("÷");
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("(l2) o Por quê? começa fechado, abre os fatores e fecha de novo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(descobertas(page).first()).toBeVisible();
  const d = descobertas(page).first();
  const botao = d.locator("button.nx-descoberta__porque-botao");
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(d.locator(".nx-barras__item").first(), "fechado, os fatores não aparecem").toBeHidden();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  const fatores = d.locator(".nx-barras__item");
  await expect(fatores.first()).toBeVisible();
  expect(await fatores.count()).toBeGreaterThanOrEqual(2);
  expect(await fatores.count()).toBeLessThanOrEqual(3);
  // O fator que falta é barra listrada com "Falta dado" (nunca cheia, nunca zero).
  const faltou = d.locator('.nx-barras__item[data-faltou]');
  for (let k = 0; k < (await faltou.count()); k++) await expect(faltou.nth(k)).toContainText("Falta dado");
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(d.locator(".nx-barras__item").first()).toBeHidden();
});

test("(m) no máximo 2 ações por área e a primeira descoberta não se repete nas outras", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(descobertas(page).first()).toBeVisible();

  const dados = await page.locator('[data-tela="hoje"] [data-acao-hoje]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute("data-acao-hoje"), area: el.getAttribute("data-area-hoje"), familia: el.getAttribute("data-familia-hoje"), proximo: el.hasAttribute("data-proximo") })),
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

// ---------- bolinhas na fileira de cartões do celular (quick 261112-e8e) ----------

test("(o) no celular a fileira de cartões mostra uma bolinha por cartão, com a do cartão à vista marcada", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(descobertas(page).first()).toBeVisible();

  const fileira = page.locator('[data-tela="hoje"] .nx-pagina__cartoes');
  const pontos = page.locator('[data-tela="hoje"] .nx-pagina__pontos .nx-pagina__ponto');
  const n = await fileira.locator("> *").count();
  expect(n, "a Hoje tem pelo menos 2 cartões nos mocks realistas").toBeGreaterThanOrEqual(2);
  await expect(pontos).toHaveCount(n);
  await expect(page.locator('[data-tela="hoje"] .nx-pagina__pontos')).toBeVisible();
  await expect(page.locator('[data-tela="hoje"] .nx-pagina__pontos')).toHaveAttribute("aria-hidden", "true");
  await expect(pontos.first()).toHaveAttribute("data-atual", "");
  await expect(page.locator('[data-tela="hoje"] .nx-pagina__ponto[data-atual]')).toHaveCount(1);

  // Rolar a fileira até o fim marca a última bolinha.
  await fileira.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(pontos.nth(n - 1)).toHaveAttribute("data-atual", "");
  await expect(page.locator('[data-tela="hoje"] .nx-pagina__ponto[data-atual]')).toHaveCount(1);

  // Fora do celular a fileira não rola e as bolinhas não aparecem.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[data-tela="hoje"] .nx-pagina__pontos')).toBeHidden();
});
