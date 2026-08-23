import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// SPA (client-only) build: no SSR framework, no platform-specific adapter.
// Auth/RLS is enforced by Supabase, not by the server — this app doesn't
// need SSR, so it deploys anywhere that serves a static bundle (Vercel with
// zero config, via vercel.json's SPA rewrite).
export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
  ],
});
