import { build } from "esbuild";

await build({
  entryPoints: ["server/vps.ts"], outfile: "build/vps.mjs", bundle: true,
  platform: "node", target: "node22", format: "esm", packages: "external",
  sourcemap: false, logLevel: "info",
});
