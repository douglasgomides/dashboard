import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import deployment from "./vercel.json";

// SPA (client-only) build: no SSR framework, no platform-specific adapter.
// Auth/RLS is enforced by Supabase, not by the server — this app doesn't
// need SSR, so it deploys anywhere that serves a static bundle (Vercel with
// zero config, via vercel.json's SPA rewrite).
export default defineConfig({
  server: { headers: Object.fromEntries(deployment.headers[0].headers.map(({ key, value }) => [key, value])) },
  preview: { headers: Object.fromEntries(deployment.headers[0].headers.map(({ key, value }) => [key, value])) },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
  ],
});
