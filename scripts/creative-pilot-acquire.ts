// Teste real de aquisição; não substitui os testes multimodais A/B.
import { loadEnvFile } from "node:process";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createAdmin, checked, JobContext } from "../workers/creative/runtime";
import { ownMedia } from "../workers/creative/providers";
import { download, probe } from "../workers/creative/media";
import type {
  CreativeJob,
  CreativeSource,
} from "../src/lib/creative-intelligence/contracts";
loadEnvFile(".env.creative.local");
const admin = createAdmin(),
  clientId = "f8ced257-8df7-4e1a-9e88-a7409fbd4b6b",
  accountId = "ee34dfdc-7177-45b3-a477-ec516f9653a5";
const selected = [
  "a47ffdda-8b1e-4855-a416-be7d4d2a7741",
  "04b5666a-4079-4186-841d-8e041acb291e",
];
const root = new URL("../work/creative-pilot/", import.meta.url);
await mkdir(root, { recursive: true });
const evidence = [];
for (const postId of selected) {
  const post = await checked(
    admin
      .from("instagram_posts")
      .select("*")
      .eq("id", postId)
      .eq("client_id", clientId)
      .eq("instagram_account_id", accountId)
      .single(),
  );
  const source: CreativeSource = {
    id: randomUUID(),
    client_id: clientId,
    account_id: accountId,
    post_id: postId,
    platform: "instagram",
    origin: "own",
    external_id: post.windsor_media_id,
    canonical_url: post.permalink,
    format: post.format,
    title: "Mídia autorizada para homologação",
    metadata: {},
    created_at: new Date().toISOString(),
  };
  const ctx = new JobContext(admin, {
    client_id: clientId,
    account_id: accountId,
  } as CreativeJob);
  const ref = await ownMedia(ctx, source),
    files = [];
  for (const item of ref.items) {
    const path = new URL(`${postId}-${item.position}.media`, root).pathname;
    const integrity = await download(item.url, path, ctx.signal);
    const technical = await probe(path, ctx.signal);
    files.push({
      position: item.position,
      kind: item.kind,
      local_path: path,
      ...integrity,
      ...technical,
    });
  }
  evidence.push({
    post_id: postId,
    source: source.canonical_url,
    format: source.format,
    expected: ref.expected,
    obtained: files.length,
    files,
    limitations: ref.limitations,
    missing: ref.missing,
    multimodal_analysis_executed: false,
  });
}
await writeFile(
  new URL("acquisition.json", root),
  JSON.stringify(
    {
      environment: "homologação",
      created_at: new Date().toISOString(),
      evidence,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    evidence.map((e) => ({
      format: e.format,
      expected: e.expected,
      obtained: e.obtained,
      total_bytes: e.files.reduce((n, f) => n + f.bytes, 0),
      multimodal: false,
    })),
  ),
);
