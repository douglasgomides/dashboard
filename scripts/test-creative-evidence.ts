import assert from "node:assert/strict";
import {
  assessCoverage,
  bindAdaptationUnits,
  speechWordLimit,
  spokenWordCount,
} from "../src/lib/creative-intelligence/contracts";
import {
  performanceEvidence,
  objectiveValue,
  type PerformancePost,
} from "../src/lib/creative-intelligence/performance";
import { allowedMediaUrl, publicAddress } from "../workers/creative/media";
const base = {
  expected_assets: 5,
  acquired_assets: 5,
  analysed_assets: 5,
  duration_seconds: null,
  audio_processed_seconds: 0,
  visual_processed_seconds: 0,
  visual_method: "all_slides" as const,
  maximum_frame_gap_seconds: null,
  missing: [],
  limitations: [],
};
const temporalOriginal = {
  format: "reels" as const,
  slides: [],
  scenes: [
    { start: 0, end: 8 },
    { start: 8, end: 16 },
    { start: 16, end: 18.5 },
  ],
} as any;
assert.equal(
  speechWordLimit(2.632),
  7,
  "short ending cannot receive a paragraph of narration",
);
assert.ok(
  spokenWordCount("Siga o perfil para mais orientações.") <=
    speechWordLimit(2.632),
);
assert.throws(
  () =>
    bindAdaptationUnits(
      [{ original_position: 1 }, { original_position: 2 }],
      temporalOriginal,
    ),
  /todas as unidades/,
  "a plausible shortened script cannot silently discard the ending",
);
assert.throws(
  () =>
    bindAdaptationUnits(
      [
        { original_position: 2 },
        { original_position: 1 },
        { original_position: 3 },
      ],
      temporalOriginal,
    ),
  /mesma ordem/,
);
assert.equal(
  bindAdaptationUnits(
    [
      { original_position: 1 },
      { original_position: 2 },
      { original_position: 3 },
    ],
    temporalOriginal,
  ).at(-1)?.end,
  18.5,
  "timestamps and total duration come from the actual analysed source",
);
assert.equal(assessCoverage(base, "carrossel").status, "completa");
assert.equal(
  assessCoverage({ ...base, acquired_assets: 4 }, "carrossel").status,
  "parcial",
);
assert.equal(
  assessCoverage({ ...base, expected_assets: null }, "carrossel").status,
  "parcial",
);
assert.equal(
  assessCoverage(
    { ...base, acquired_assets: 0, analysed_assets: 0 },
    "carrossel",
  ).status,
  "indisponivel",
);
assert.equal(
  assessCoverage(
    {
      ...base,
      expected_assets: 1,
      acquired_assets: 1,
      analysed_assets: 1,
      duration_seconds: 60,
      audio_processed_seconds: 60,
      visual_processed_seconds: 60,
      visual_method: "sampled_frames",
    },
    "reels",
  ).status,
  "parcial",
  "sampled frames never claim integral visual analysis",
);
assert.equal(
  assessCoverage(
    {
      ...base,
      expected_assets: 1,
      acquired_assets: 1,
      analysed_assets: 1,
      duration_seconds: 60,
      audio_processed_seconds: 60,
      visual_processed_seconds: 60,
      visual_method: "native_video",
    },
    "reels",
  ).status,
  "completa",
);
const post: PerformancePost = {
  id: "p",
  instagram_account_id: "a",
  format: "carrossel",
  posted_at: "2026-10-01",
  reach: 1000,
  saved: 100,
  shares: null,
  views: 2000,
};
const peers = Array.from({ length: 8 }, (_, i) => ({
  ...post,
  id: `p${i}`,
  saved: 10,
}));
const evidence = performanceEvidence(
  post,
  peers,
  "salvamento",
  Date.parse("2026-10-18"),
);
assert.equal(evidence.relative_multiple, 10);
assert.equal(evidence.promising, true);
assert.equal(evidence.confidence, "media");
assert.equal(
  performanceEvidence(
    post,
    peers.map((p) => ({ ...p, instagram_account_id: "b" })),
    "salvamento",
  ).baseline_count,
  0,
);
assert.equal(
  performanceEvidence(post, peers.slice(0, 3), "salvamento").promising,
  false,
);
assert.equal(objectiveValue({ ...post, saved: null }, "salvamento"), null);
assert.equal(
  objectiveValue(post, "conversa"),
  null,
  "views are not attributed conversions",
);
for (const ip of [
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "172.31.1.1",
  "192.168.0.1",
  "100.64.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "fd00::1",
  "fe80::1",
])
  assert.equal(publicAddress(ip), false, ip);
for (const url of [
  "http://cdninstagram.com/file",
  "https://cdninstagram.com.evil.test/file",
  "https://127.0.0.1/file",
  "https://user:pass@cdninstagram.com/file",
  "https://cdninstagram.com:444/file",
])
  assert.throws(() => allowedMediaUrl(url));
assert.equal(
  allowedMediaUrl("https://scontent.cdninstagram.com/file").hostname,
  "scontent.cdninstagram.com",
);
console.log(
  "test-creative-evidence: ok (honest coverage, missing metrics, account cohorts, no inferred conversions, SSRF guards)",
);
