import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { REGISTRO_DE_TELAS } from "../../src/lib/registro-de-telas";

// Telas e agentes tirados pelo João em 11/11/2026 ("tira isso aí, ninguém usa"): cada endereço antigo redireciona, sem 404.
// O destino vem do registro (o plano 03.1.1-05 troca o das 7 telas da clínica pela Hoje, e este teste acompanha).

test.use({ reducedMotion: "reduce" });

const TIRADAS = REGISTRO_DE_TELAS.filter((t) => t.tiradaEm === "2026-11-11");
const caminho = (rota: string) => rota.replace("/_authenticated", "").replace("$clientId", CID).replace(/\/+$/, "");

test("as 10 telas tiradas em 11/11 estão no registro", () => {
  expect(TIRADAS).toHaveLength(10);
});

for (const tirada of TIRADAS.filter((t) => !t.busca)) {
  test(`o endereço antigo de ${tirada.rotulo} redireciona, sem 404`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width: 1280, height: 900 });
    const daClinica = tirada.rota.includes("$clientId");
    await page.goto(`${caminho(tirada.rota)}${daClinica ? "?preset=7d" : ""}`);
    await expect.poll(() => new URL(page.url()).pathname.replace(/\/+$/, "")).toBe(caminho(tirada.destino!));
    if (daClinica) expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await expect(page.getByText("Página não encontrada.")).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/\S{3}/);
  });
}

test("Revisar roteiros abre Encontrar ideias, sem o botão antigo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}/ideias?visao=roteiros&preset=7d`);
  await expect(page).toHaveURL(new RegExp(`/${CID}/ideias`));
  await expect(page.locator(".workspace-heading h1")).toHaveText("Encontrar ideias");
  await expect(page.locator("main").getByRole("button", { name: /^Revisar roteiros/ })).toHaveCount(0);
});

test("o viewer vê Resultados da clínica ao abrir Agentes e entregas", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${CID}/agentes?preset=7d`);
  await expect.poll(() => new URL(page.url()).pathname.replace(/\/+$/, "")).toBe(`/${CID}`);
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
});

test("o viewer não entra no /admin pelos endereços tirados", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const rota of ["/admin/agentes", "/admin/brain"]) {
    await page.goto(rota, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).not.toMatch(/^\/admin(\/|$)/);
    await expect(page.getByText("Central de Agentes", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Brand Brain", { exact: true })).toHaveCount(0);
  }
});
