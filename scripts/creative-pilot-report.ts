// Evidência de homologação real; não é fixture e não roda no teste offline.
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAdmin, checked } from "../workers/creative/runtime";
import {
  spokenWordCount,
  speechWordLimit,
} from "../src/lib/creative-intelligence/contracts";
loadEnvFile(".env.creative.local");
if (
  new URL(process.env.SUPABASE_URL!).hostname !==
  "tezpmowkupeoabzzbxpf.supabase.co"
)
  throw new Error("Ambiente não autorizado");
const admin = createAdmin(),
  client = "f8ced257-8df7-4e1a-9e88-a7409fbd4b6b",
  account = "ee34dfdc-7177-45b3-a477-ec516f9653a5";
const read = async (table: string) =>
  (await checked(
    admin
      .from(table)
      .select("*")
      .eq("client_id", client)
      .eq("account_id", account),
  )) ?? [];
const [sources, analyses, assets, adaptations, jobs] = await Promise.all([
  read("creative_sources"),
  read("creative_analyses"),
  read("creative_assets"),
  read("creative_adaptations"),
  read("creative_jobs"),
]);
const carousel = analyses.find((a) => a.result.format === "carrossel"),
  reel = analyses.find((a) => a.result.format === "reels");
assert.ok(
  carousel && reel,
  "Ambos os arquivos reais precisam ter sido processados",
);
assert.equal(carousel.coverage.status, "completa");
assert.equal(carousel.result.slides.length, 10);
assert.equal(
  new Set(carousel.result.slides.map((s: any) => s.asset_id)).size,
  10,
);
for (const slide of carousel.result.slides) {
  assert.ok(slide.copy.full_text.trim());
  assert.ok(slide.visual.designer_brief.trim());
  assert.ok(
    assets.some(
      (a) =>
        a.id === slide.asset_id &&
        a.kind === "image" &&
        a.position === slide.position &&
        a.sha256.length === 64,
    ),
  );
}
assert.equal(
  reel.coverage.status,
  "parcial",
  "Frames não podem comprovar compreensão visual integral",
);
assert.ok(reel.coverage.duration_seconds > 140);
assert.ok(reel.transcript.length > 20);
assert.ok(reel.transcript.at(-1).end >= reel.coverage.duration_seconds - 1);
assert.ok(
  reel.result.scenes.every((s: any) =>
    s.evidence_asset_ids.every((id: string) =>
      assets.some((a) => a.id === id && a.kind === "frame"),
    ),
  ),
);
const latest = (format: string) =>
  adaptations
    .filter((a) => a.document.format === format)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
const carouselAdapt = latest("carrossel"),
  reelAdapt = latest("reels");
assert.equal(carouselAdapt.document.units.length, 10);
assert.deepEqual(
  carouselAdapt.document.units.map((u: any) => u.original_position),
  carousel.result.slides.map((s: any) => s.position),
);
assert.ok(
  carouselAdapt.pauta_id && carouselAdapt.published_post_id === null,
  "Pauta não deve ser confundida com publicação",
);
assert.equal(reelAdapt.document.units.length, reel.result.scenes.length);
assert.equal(
  reelAdapt.document.units.at(-1).end,
  reel.coverage.duration_seconds,
);
reelAdapt.document.units.forEach((u: any, i: number) => {
  assert.equal(u.original_position, i + 1);
  assert.equal(u.start, reel.result.scenes[i].start);
  assert.equal(u.end, reel.result.scenes[i].end);
  assert.ok(u.recording_brief && u.editing_brief);
  assert.ok(
    spokenWordCount(u.copy) <= speechWordLimit(u.end - u.start),
    "A fala precisa caber na estimativa editorial do bloco",
  );
});
assert.ok(
  jobs.some(
    (j) =>
      j.kind === "search" &&
      j.status === "completed" &&
      j.output.matches.length === 2,
  ),
  "Busca semântica deve retornar as estruturas reais da própria conta",
);
assert.ok(jobs.every((j) => j.cost_usd <= j.budget_usd));
const report = {
  verified_at: new Date().toISOString(),
  environment: "homologação",
  production_changed: false,
  client_id: client,
  account_id: account,
  base_commit: "72f39da752e3d85cd0aeb0e45cb9f5d5932f8627",
  branch: "codex/inteligencia-criativa",
  integrated_base_commit: "157aa785010338fc7030e5d4799e576d893d242f",
  validation: {scripts_after_integration:86,browser_before_integration:166,browser_after_integration:11,interface_checks_before_integration:19},
  result: "Primeira fatia funcional; missão completa ainda pendente",
  tests: {
    carousel: {
      analysis: carousel.id,
      source: sources.find((s) => s.id === carousel.source_id).canonical_url,
      slides_expected: 10,
      slides_read: 10,
      visual_briefs: 10,
      coverage: carousel.coverage,
      adaptation: carouselAdapt.id,
      adapted_units: 10,
      planner_id: carouselAdapt.pauta_id,
      published_post_id: carouselAdapt.published_post_id,
    },
    reel: {
      analysis: reel.id,
      source: sources.find((s) => s.id === reel.source_id).canonical_url,
      coverage: reel.coverage,
      transcript_segments: reel.transcript.length,
      blocks: reel.result.scenes.length,
      adaptation: reelAdapt.id,
      adapted_blocks: reelAdapt.document.units.length,
      adapted_duration_seconds: reelAdapt.document.units.at(-1).end,
      integral_visual_test_passed: false,
    },
    semantic_search: { passed: true, private_structures: 2 },
  },
  costs: {
    currency: "USD",
    total_recorded: jobs.reduce((n, j) => n + Number(j.cost_usd), 0),
    includes_intermediate_adaptation_attempts: true,
    transcription_is_duration_based_estimate: true,
    excludes: ["Storage e tráfego", "CPU e memória do worker"],
    jobs: jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      cost_usd: j.cost_usd,
      reserved_usd: j.reserved_usd,
      budget_usd: j.budget_usd,
    })),
  },
  limitations: [
    "Reel: análise visual por frames e mudanças de cena permanece parcial; vídeo nativo ainda não integrado/homologado.",
    "Apify sem credencial: coleta externa, comparação conta/mercado e aceleração não homologadas.",
    "Worker executado localmente; execução permanente em serviço externo ainda não provisionada.",
    "D1/D3/D7/D28 preparados, sem adaptação realmente publicada para validar o aprendizado.",
    "Nenhuma estrutura promovida a validação por testes repetidos.",
    "Texto extraído descreve alegações do conteúdo de referência; não é validação científica.",
  ],
  evidence: {
    carousel_slides: carousel.result.slides.map((s: any) => ({
      position: s.position,
      asset_id: s.asset_id,
      sha256: assets.find((a) => a.id === s.asset_id).sha256,
      text: s.copy.full_text,
      visual_brief: s.visual.designer_brief,
    })),
    reel_transcript: reel.transcript,
    carousel_proposal: carouselAdapt.document,
    reel_proposal: reelAdapt.document,
  },
};
await writeFile(
  resolve("../../outputs/nexo-homologacao-criativa.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    real_carousel_passed: true,
    reel_acquisition_audio_and_adaptation_passed: true,
    reel_integral_visual_passed: false,
    cost_usd: report.costs.total_recorded,
    report: "outputs/nexo-homologacao-criativa.json",
  }),
);
