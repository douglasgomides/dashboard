import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readdirSync } from "node:fs";
import { CID, mockAccount } from "./fixtures";

const routes = [...new Set(readdirSync(new URL("../../src/routes", import.meta.url))
  .filter((file) => file.endsWith(".tsx") && file !== "__root.tsx")
  .map((file) => "/" + file.replace(/\.tsx$/, "").replace(/^_authenticated(?:\.|$)/, "").split(".").filter((s) => s && s !== "index").join("/").replaceAll("$clientId", CID)))];

for (const width of [375, 1280]) {
  for (const path of routes) {
    test(`route ${path} renders at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockAccount(context, "admin");
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(/\S{3}/);
      await expect(page.locator("body")).not.toHaveText(/^\s*Carregando…?\s*$/);
      const content = await page.locator("body").innerText();
      if (path === "/qa/layout") await expect(page.getByText("Página não encontrada.")).toBeVisible();
      else expect(content).not.toContain("Página não encontrada.");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(errors).toEqual([]);
      expect(overflow).toBe(false);
      expect(content).not.toMatch(/Essa página não carregou|Something went wrong/);
    });
  }
}

test("anonymous users cannot render authenticated routes", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  for (const path of ["/admin", "/admin/brain", `/sap/${CID}`, `/${CID}/conversas`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole("button", { name: "Entrar no Nexo", exact: true })).toBeVisible();
  }
});

test("viewer is redirected out of admin and unassigned SAP", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}`);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Clínica de teste", exact: true })).toBeVisible();
  for (const path of ["/admin", "/admin/equipe", "/admin/agentes", "/admin/brain", `/sap/${CID}/sessao`]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\?|$)"));
    await expect(page.getByText("Central de Agentes", { exact: true })).not.toBeVisible();
  }
});

test("login remains usable when auth request fails", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  await context.route("**/auth/v1/token**", (route) => route.fulfill({ status: 400, json: { msg: "Invalid login credentials" } }));
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("qa@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Entrar no Nexo", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar no Nexo", exact: true })).toBeEnabled();
});

test("source failure shows a recoverable page instead of a blank screen", async ({ page, context }) => {
  await mockAccount(context, "viewer", { failClients: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/${CID}`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toHaveText(/^\s*Carregando…?\s*$/);
  await expect(page.locator("body")).toContainText(/erro|carreg|tentar|indispon|acesso/i);
  expect(errors).toEqual([]);
});

test("login meets basic WCAG A/AA accessibility rules", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  const response = await page.goto("/login");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.target) }))).toEqual([]);
});
