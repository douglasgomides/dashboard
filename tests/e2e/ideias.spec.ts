import { test, expect, type BrowserContext } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

async function ideias(context: BrowserContext, options: { commentsError?: boolean; scriptsError?: boolean; failedRun?: boolean; viewer?: boolean } = {}) {
  await mockAccount(context, options.viewer ? "viewer" : "admin");
  let commentsError = !!options.commentsError, commentReads = 0, executionReads = 0;
  const post = { id: "44444444-4444-4444-8444-444444444444", client_id: CID, caption: "Orientação sobre sono", tema: "Sono", format: "reels", posted_at: "2026-10-10T12:00:00Z", reach: 1000, saved: 80, shares: 12, engagement: 100, permalink: "https://www.instagram.com/reel/test/", thumbnail_url: null };
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    expect(params.get("client_id")).toBe(`eq.${CID}`);
    const offset = Number(params.get("offset") ?? r.request().headers().range?.split("-")[0] ?? 0);
    return r.fulfill({ json: offset > 0 ? [] : [post] });
  });
  await context.route("**/rest/v1/instagram_accounts**", (r) => r.fulfill({ json: [{ id: "account", client_id: CID, ig_username: "clinicadeteste" }] }));
  await context.route("**/rest/v1/instagram_comments**", (r) => {
    commentReads++;
    const params = new URL(r.request().url()).searchParams;
    expect(params.get("client_id")).toBe(`eq.${CID}`);
    const select = params.get("select") || "";
    if (commentsError || !select.includes("instagram_posts!instagram_comments_instagram_post_id_fkey("))
      return r.fulfill({ status: 400, json: { code: "PGRST201", message: "Multiple foreign keys match the comments/posts relationship" } });
    return r.fulfill({ json: [1, 2].map((n) => ({ id: `comment-${n}`, client_id: CID, text: "Como melhorar o sono?", like_count: 0, instagram_post_id: post.id, commented_at: "2026-10-11T12:00:00Z", author_username: `pessoa${n}`, is_question: true, instagram_posts: { tema: post.tema, caption: post.caption, permalink: post.permalink, thumbnail_url: null, posted_at: post.posted_at } })) });
  });
  await context.route("**/rest/v1/sugestoes_agentes**", (r) => {
    expect(new URL(r.request().url()).searchParams.get("client_id")).toBe(`eq.${CID}`);
    return options.scriptsError
      ? r.fulfill({ status: 503, json: { message: "Scripts unavailable" } })
      : r.fulfill({ json: [] });
  });
  await context.route("**/rest/v1/agente_execucoes**", (r) => {
    executionReads++;
    const params = new URL(r.request().url()).searchParams;
    expect(params.get("client_id")).toBe(`eq.${CID}`);
    expect(params.get("fluxo")).toBe("eq.conteudo_semana");
    expect(params.get("select")).toBe("estado,atualizado_em");
    return r.fulfill({ json: options.failedRun ? [{ estado: "falhou", atualizado_em: new Date().toISOString() }] : [] });
  });
  return {
    recoverComments: () => { commentsError = false; },
    get commentReads() { return commentReads; },
    get executionReads() { return executionReads; },
  };
}

for (const width of [375, 1280])
  test(`Ideias resolve a relação de comentários e carrega as fontes em ${width}px`, async ({ context, page }) => {
    const fixture = await ideias(context);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/ideias`);
    await expect(page.getByText("1 posts no período", { exact: true })).toBeVisible();
    await expect(page.getByText("2 perguntas reais de pacientes (de 2 comentários lidos)", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.commentReads).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole("heading", { name: "Não foi possível carregar", exact: true })).toHaveCount(0);
    await expect(page.getByText("Ainda não há execução do Roteirista registrada para esta clínica.", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("O agente entrega a próxima semana na segunda-feira");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

test("falha nos comentários identifica a fonte e permite tentar novamente", async ({ context, page }) => {
  const fixture = await ideias(context, { commentsError: true });
  await page.goto(`/${CID}/ideias`);
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar os comentários do período. Os posts foram carregados.");
  fixture.recoverComments();
  await page.getByRole("button", { name: "Tentar carregar dados novamente", exact: true }).click();
  await expect(page.getByText("1 posts no período", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Não foi possível carregar", exact: true })).toHaveCount(0);
});

test("falha na leitura de roteiros não é apresentada como ausência de entregas", async ({ context, page }) => {
  await ideias(context, { scriptsError: true });
  await page.goto(`/${CID}/ideias`);
  const panel = page.getByRole("region", { name: "Roteirista de conteúdo", exact: true });
  await expect(panel.getByRole("alert")).toContainText("Não foi possível carregar os roteiros.");
  await expect(panel).not.toContainText("Nenhum roteiro disponível");
  await expect(panel.getByRole("button", { name: "Tentar carregar roteiros novamente", exact: true })).toBeVisible();
  await expect(page.getByText("1 posts no período", { exact: true })).toBeVisible();
});

test("admin vê a última execução com falha sem promessa de entrega", async ({ context, page }) => {
  await ideias(context, { failedRun: true });
  await page.goto(`/${CID}/ideias`);
  await expect(page.getByText(/Última execução: Falhou/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Roteirista de conteúdo", exact: true })).toContainText("Frequência prevista: semanal");
});

test("cliente de leitura não consulta histórico administrativo nem inicia o agente", async ({ context, page }) => {
  const fixture = await ideias(context, { viewer: true });
  await page.goto(`/${CID}/ideias`);
  await expect(page.getByText("1 posts no período", { exact: true })).toBeVisible();
  const panel = page.getByRole("region", { name: "Roteirista de conteúdo", exact: true });
  await expect(panel).toContainText("A equipe Doctor Creator pode verificar o agente");
  await expect(panel.getByRole("button", { name: "Rodar agora", exact: true })).toHaveCount(0);
  expect(fixture.executionReads).toBe(0);
});
