import { test, expect, type BrowserContext } from "@playwright/test";
import { mockAccount, CID } from "./fixtures";
import { newDocument } from "../../src/lib/creative-intelligence/production";
const ACCOUNT = "44444444-4444-4444-8444-444444444444";
const OTHER_ACCOUNT = "99999999-9999-4999-8999-999999999999";
const ADAPTATION = "55555555-5555-4555-8555-555555555555";
const PROJECT = "66666666-6666-4666-8666-666666666666";
const PAUTA = "77777777-7777-4777-8777-777777777777";
const document = {
  title: "Sono e rotina: conteúdo adaptado", theme: "Sono", format: "carrossel", objective: "salvamento", hook: "Uma pergunta sobre sua rotina",
  units: ["Primeiro slide integral.", "Última frase preservada no segundo slide."].map((copy, i) => ({
    position: i + 1, original_position: i + 1, start: null, end: null, copy,
    narrative_role: "Explicação", image_brief: "Fundo neutro", layout_brief: "Texto com contraste", recording_brief: "", editing_brief: "", on_screen_text: "", structural_reference: "Sequência da referência", justified_changes: [],
  })), caption: "Legenda completa que precisa chegar ao planejador.", cta: "Converse com seu médico", preserved_principles: [], justified_changes: [], medical_review_flags: ["Revisar orientação"], brain_keys: [], clinical_claims_requiring_verification: [],
};
async function fixture(context: BrowserContext, options: { viewer?: boolean; missing?: boolean; failed?: boolean } = {}) {
  await mockAccount(context, options.viewer ? "viewer" : "admin");
  const adaptation = { id: ADAPTATION, client_id: CID, account_id: ACCOUNT, analysis_id: PROJECT, structure_id: PROJECT, job_id: PROJECT, model: "fixture", created_at: "2026-01-01T12:00:00Z", document, pauta_id: null as string | null, published_post_id: null };
  const pautas: unknown[] = [];
  let writes = 0;
  await context.route("**/rest/v1/creative_adaptations**", r => {
    const p = new URL(r.request().url()).searchParams;
    expect(p.get("client_id")).toBe(`eq.${CID}`);
    if (options.failed) return r.fulfill({ status: 503, json: { message: "Source unavailable" } });
    if (p.get("id")) return r.fulfill({ json: options.missing ? null : adaptation });
    return r.fulfill({ json: options.missing ? [] : [adaptation] });
  });
  await context.route("**/rest/v1/instagram_accounts**", r => r.fulfill({ json: [
    { id: OTHER_ACCOUNT, client_id: CID, ig_username: "outraconta", active: true },
    { id: ACCOUNT, client_id: CID, ig_username: "clinicadeteste", active: true },
  ] }));
  await context.route("**/rest/v1/pautas_conteudo**", r => r.fulfill({ json: pautas }));
  await context.route("**/rest/v1/rpc/creative_to_pauta", r => {
    expect(r.request().postDataJSON()).toEqual({ p_client_id: CID, p_adaptation_id: ADAPTATION });
    writes++;
    adaptation.pauta_id = PAUTA;
    pautas.splice(0, pautas.length, { id: PAUTA, client_id: CID, ideia_id: `creative:${ADAPTATION}`, titulo: document.title, formato: "carrossel", objetivo: "salvamento", status: "escolhida", origem_tipo: "dado", origem_texto: "Inteligência Criativa", roteiro: document.units.map(u => u.copy), dia: null, post_id: null, cta: document.cta });
    return r.fulfill({ json: PAUTA });
  });
  const production = newDocument("carrossel"); production.title = "Projeto vinculado à adaptação";
  await context.route("**/rest/v1/creative_productions**", r => {
    const p = new URL(r.request().url()).searchParams;
    expect(p.get("client_id")).toBe(`eq.${CID}`);
    expect(p.get("account_id")).toBe(`eq.${ACCOUNT}`);
    return r.fulfill({ json: [
      { id: OTHER_ACCOUNT, client_id: CID, account_id: ACCOUNT, adaptation_id: null, title: "Outro projeto", format: "carrossel", current_revision: 1 },
      { id: PROJECT, client_id: CID, account_id: ACCOUNT, adaptation_id: ADAPTATION, title: production.title, format: "carrossel", current_revision: 1 },
    ] });
  });
  await context.route("**/rest/v1/creative_production_revisions**", r => {
    expect(new URL(r.request().url()).searchParams.get("project_id")).toBe(`eq.${PROJECT}`);
    return r.fulfill({ json: [{ id: PAUTA, project_id: PROJECT, revision: 1, document: production, created_at: new Date().toISOString() }] });
  });
  return { get writes() { return writes; } };
}

for (const width of [375, 1280]) test(`Ideias → documento completo → planejador → produção em ${width}px`, async ({ context, page }) => {
  const f = await fixture(context);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/${CID}/ideias?preset=30d`);
  const contents = page.getByRole("region", { name: "Conteúdos da Inteligência Criativa", exact: true });
  await expect(contents.getByRole("heading", { name: document.title, exact: true })).toBeVisible();
  await contents.getByRole("button", { name: "Ler conteúdo completo", exact: true }).click();
  await expect(contents).toContainText(document.units[1].copy);
  await expect(contents).toContainText(document.caption);
  await contents.getByRole("button", { name: "Levar ao planejador", exact: true }).click();
  await expect(contents).toContainText("No planejador");
  await expect(contents.getByRole("button", { name: "Levar ao planejador", exact: true })).toHaveCount(0);
  expect(f.writes).toBe(1);
  const planner = page.getByRole("region", { name: "Planejador da semana", exact: true });
  await planner.getByRole("button", { name: "Motivo e roteiro", exact: true }).click();
  await expect(planner).toContainText(document.caption);
  await expect(planner).not.toContainText("Card 3");
  await planner.getByRole("link", { name: "Abrir produção vinculada", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Conta analisada", exact: true })).toHaveValue(ACCOUNT);
  await expect(page.getByRole("combobox", { name: "Começar com uma adaptação", exact: true })).toHaveValue(ADAPTATION);
  await expect(page.getByLabel("Título do projeto", { exact: true })).toHaveValue("Projeto vinculado à adaptação");
  await expect(page.getByRole("button", { name: "CARROSSEL Outro projeto Revisão 1", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("leitor consulta entregas sem poder enviar ao planejador ou gerar peças", async ({ context, page }) => {
  const f = await fixture(context, { viewer: true });
  await page.goto(`/${CID}/ideias`);
  const contents = page.getByRole("region", { name: "Conteúdos da Inteligência Criativa", exact: true });
  await expect(contents.getByRole("heading", { name: document.title, exact: true })).toBeVisible();
  await expect(contents.getByRole("button", { name: "Levar ao planejador", exact: true })).toHaveCount(0);
  await contents.getByRole("link", { name: "Ver produção", exact: true }).click();
  await expect(page.getByLabel("Título do projeto", { exact: true })).toBeDisabled();
  expect(f.writes).toBe(0);
});

test("link de adaptação ausente não abre outra conta ou outro projeto", async ({ context, page }) => {
  await fixture(context, { missing: true });
  await page.goto(`/${CID}/inteligencia-criativa?aba=producao&adaptacao=${ADAPTATION}`);
  await expect(page.getByRole("heading", { name: "Conteúdo indisponível", exact: true })).toBeVisible();
  await expect(page.getByLabel("Título do projeto", { exact: true })).toHaveCount(0);
});

test("link com adaptação de outra conta não abre uma produção por engano", async ({ context, page }) => {
  await fixture(context);
  await page.goto(`/${CID}/inteligencia-criativa?aba=producao&conta=${OTHER_ACCOUNT}&adaptacao=${ADAPTATION}`);
  await expect(page.getByRole("heading", { name: "Conteúdo indisponível", exact: true })).toBeVisible();
  await expect(page.getByLabel("Título do projeto", { exact: true })).toHaveCount(0);
});

test("falha na leitura de entregas não aparece como biblioteca vazia", async ({ context, page }) => {
  await fixture(context, { failed: true });
  await page.goto(`/${CID}/ideias`);
  const contents = page.getByRole("region", { name: "Conteúdos da Inteligência Criativa", exact: true });
  await expect(contents.getByRole("alert")).toBeVisible();
  await expect(contents).not.toContainText("Nenhuma adaptação salva");
});
