import { test, expect, type BrowserContext } from "@playwright/test";
import { mockAccount, CID } from "./fixtures";
import type { CreativeAnalysis } from "../../src/lib/creative-intelligence/contracts";

const ACCOUNT = "44444444-4444-4444-8444-444444444444";
const SOURCE = "55555555-5555-4555-8555-555555555555";
const ANALYSIS = "66666666-6666-4666-8666-666666666666";
const STRUCTURE = "77777777-7777-4777-8777-777777777777";
const original = "Você já fez essa pergunta? A resposta precisa de contexto. Confira a orientação completa.";
const adapted = "O novo tema começa com uma pergunta.\n\nA explicação termina com uma orientação.";

async function fixture(context: BrowserContext, noSpeech = false) {
  await mockAccount(context, "admin");
  const transcript = noSpeech ? [] : [
    { start: 0, end: 3, text: "Você já fez essa pergunta?" },
    { start: 3, end: 8, text: "A resposta precisa de contexto." },
    { start: 8, end: 10, text: "Confira a orientação completa." },
  ];
  const visual = {
    image_type: "Vídeo", people_and_framing: "Pessoa em plano médio", objects_and_setting: "Fundo neutro",
    palette: [], contrast: "Alto", typography: "Sem serifa", hierarchy: [], composition: "Central",
    text_position: "Inferior", whitespace: "Amplo", graphic_elements: [], image_text_relationship: "Complemento",
    continuity: "Plano contínuo", designer_brief: "Preservar enquadramento",
  };
  const dna = {
    hook_pattern: "Pergunta", narrative_sequence: [], argument_progression: [], retention_techniques: [],
    cta_pattern: "Orientação", text_density: [], visual_system: visual, editing_pattern: [],
    reusable_principles: [], theme_specific_elements: [], uncertainties: [],
  };
  const analysis: CreativeAnalysis = {
    id: ANALYSIS, client_id: CID, account_id: ACCOUNT, source_id: SOURCE, job_id: "job", version: "test",
    model: "fixture", cost_usd: 0, created_at: "2026-10-18T12:00:00Z", transcript,
    coverage: {
      status: "parcial", expected_assets: 1, acquired_assets: 1, analysed_assets: 1,
      duration_seconds: 10, audio_processed_seconds: noSpeech ? 0 : 10, visual_processed_seconds: 10,
      visual_method: "sampled_frames", maximum_frame_gap_seconds: 5, missing: [], limitations: [],
    },
    result: {
      format: "reels", original_theme: "Orientação", summary: "Análise visual", slides: [], dna,
      confidence: 0.8, medical_review_flags: [],
      scenes: [{ start: 0, end: 5 }, { start: 5, end: 10 }].map((s) => ({
        ...s, evidence_asset_ids: [], narration: "Resumo visual inventado que nunca foi falado.",
        on_screen_text: "TEXTO VISUAL DIFERENTE DA FALA", narrative_role: "Explicação", shot: "Plano médio",
        camera: "Fixa", editing: "Corte seco", audio_observations: "Fala", transitions: "Não confirmado",
        visual, confidence: 0.8, uncertainties: [],
      })),
    },
  };
  const source = {
    id: SOURCE, client_id: CID, account_id: ACCOUNT, post_id: null, platform: "instagram", origin: "own",
    external_id: "test", canonical_url: "https://www.instagram.com/reel/test/", format: "reels",
    title: "Reel de referência", metadata: {}, created_at: "2026-10-18T12:00:00Z",
  };
  const structure = {
    id: STRUCTURE, client_id: CID, account_id: ACCOUNT, source_id: SOURCE, analysis_id: ANALYSIS,
    title: "Estrutura de referência", theme: "Orientação", format: "reels", state: "candidata", evidence: {}, dna,
  };
  const adaptation = {
    id: "adaptation", client_id: CID, account_id: ACCOUNT, structure_id: STRUCTURE, analysis_id: ANALYSIS,
    pauta_id: null, published_post_id: null, created_at: "2026-10-18T12:00:00Z",
    document: {
      title: "Adaptação da referência", theme: "Novo tema", format: "reels", objective: "salvamento",
      units: ["O novo tema começa com uma pergunta.", "A explicação termina com uma orientação."].map((copy, i) => ({
        position: i + 1, original_position: i + 1, start: i * 5, end: (i + 1) * 5, copy,
        narrative_role: "Explicação", image_brief: "", layout_brief: "", recording_brief: "Falar para a câmera",
        editing_brief: "Corte natural", on_screen_text: "", structural_reference: "Pergunta e resposta", justified_changes: [],
      })),
      caption: "Legenda da publicação", cta: "Confira", preserved_principles: [], justified_changes: [],
      medical_review_flags: [], clinical_claims_requiring_verification: [],
    },
  };
  const tables: Record<string, unknown[]> = {
    instagram_accounts: [{ id: ACCOUNT, client_id: CID, ig_username: "clinicadeteste", active: true }],
    creative_sources: [source], creative_analyses: [analysis], creative_structures: [structure],
    creative_adaptations: [adaptation],
  };
  for (const [table, rows] of Object.entries(tables))
    await context.route(`**/rest/v1/${table}**`, (route) => route.fulfill({ json: rows }));
}

for (const width of [375, 1280])
  test(`fala integral e comparação usam o áudio, sem resumo visual, em ${width}px`, async ({ context, page }) => {
    await fixture(context);
    let copied = "";
    await page.exposeFunction("captureScript", (text: string) => { copied = text; });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: {
        writeText: (text: string) => (window as unknown as { captureScript: (value: string) => Promise<void> }).captureScript(text),
      }, configurable: true });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/inteligencia-criativa`);
    await page.getByRole("button", { name: "Análises e DNA", exact: true }).click();
    await expect(page.getByLabel("Fala completa do Reel original", { exact: true })).toHaveText(original);
    await page.getByRole("button", { name: "Copiar roteiro original completo" }).click();
    await expect.poll(() => copied).toBe(original);
    await page.getByText("Conferir falas com tempos (3 trechos)", { exact: true }).click();
    await expect(page.getByLabel("Transcrição temporal")).toContainText("8.0–10.0s");
    await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
    await expect(page.getByLabel("Fala completa do Reel original", { exact: true })).toHaveText(original);
    await expect(page.getByLabel("Fala completa do roteiro adaptado", { exact: true })).toHaveText(adapted);
    await page.getByRole("button", { name: "Copiar roteiro adaptado completo" }).click();
    await expect.poll(() => copied).toBe(adapted);
    const comparison = page.locator("section").filter({ has: page.getByRole("heading", { name: "Adaptação da referência", exact: true }) }).last();
    await expect(comparison).toContainText("Você já fez essa pergunta? A resposta precisa de contexto.");
    await expect(comparison).not.toContainText("Resumo visual inventado");
    await expect(comparison).not.toContainText("TEXTO VISUAL DIFERENTE DA FALA");
    await comparison.getByRole("button", { name: "Bloco 2", exact: true }).click();
    await expect(comparison).toContainText("A resposta precisa de contexto. Confira a orientação completa.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

test("ausência de transcrição não transforma descrição visual em fala original", async ({ context, page }) => {
  await fixture(context, true);
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
  await expect(page.getByText(/A fala original está indisponível nesta análise/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar roteiro original completo" })).toHaveCount(0);
  const comparison = page.locator("section").filter({ has: page.getByRole("heading", { name: "Adaptação da referência", exact: true }) }).last();
  await expect(comparison).toContainText("Não há fala transcrita neste bloco.");
  await expect(comparison).not.toContainText("Resumo visual inventado");
});
