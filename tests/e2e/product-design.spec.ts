import {
  test,
  expect,
  type BrowserContext,
  type Locator,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { CID, SID, mockAccount } from "./fixtures";

const outputs = new URL("../../../../outputs/", import.meta.url).pathname;
async function examples(context: BrowserContext, product: "nexo" | "sap") {
  await mockAccount(context, product === "sap" ? "admin" : "viewer");
  if (product === "sap") {
    await context.route("**/rest/v1/rpc/sap_papeis_pessoas", (r) =>
      r.fulfill({
        json: [
          {
            clinica_id: SID,
            papel: "coordenador",
            user_id: "33333333-3333-4333-8333-333333333333",
            pessoa_id: "55555555-5555-4555-8555-555555555555",
            nome: "Coordenação de teste",
          },
        ],
      }),
    );
    return;
  }

}

function contrast(a: number[], b: number[]) {
  const lum = (rgb: number[]) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function readableControl(control: Locator) {
  const colors = await control.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      color: style.color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number),
      background: style.backgroundColor
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number),
    };
  });
  expect(contrast(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5);
  const box = await control.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

for (const width of [375, 1440])
  for (const theme of ["light", "dark"] as const)
    for (const product of ["nexo", "sap"] as const) {
      test(`${product} design: ${theme} at ${width}px has contrast, usable actions and no overflow`, async ({
        page,
        context,
      }) => {
        await examples(context, product);
        await context.addInitScript(
          (choice) => localStorage.setItem("dc:tema", choice),
          theme,
        );
        await page.setViewportSize({
          width,
          height: width === 375 ? 900 : 1040,
        });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(product === "nexo" ? `/${CID}/ideias` : `/sap/${CID}`, {
          waitUntil: "networkidle",
        });
        const main = page.getByRole("main");
        const primary =
          product === "nexo"
            ? main.getByRole("button", {
                name: /^Revisar roteiros/,
              })
            : main.getByRole("link", {
                name: /Abrir orientações da tarefa|Consultar minhas tarefas/,
              });
        await expect(primary).toBeVisible();
        await readableControl(primary);
        if (product === "nexo") {
          const selected = main.getByRole("button", {
            name: /^Revisar roteiros/,
          });
          await readableControl(selected);
          await expect(selected).toHaveAttribute("aria-pressed", "true");
        }
        const audit = await new AxeBuilder({ page })
          .include(".mainwrap")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(audit.violations).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
        if (product === "sap")
          await page
            .getByRole("button", { name: "Fechar o tour", exact: true })
            .click();
        await mkdir(outputs, { recursive: true });
        await page.screenshot({
          path: `${outputs}${product}-design-${theme}-${width}.png`,
        });
        if (product === "nexo") {
          await main
            .getByRole("button", { name: /^Planejar a semana/ })
            .click();
          await expect(
            main.getByRole("region", {
              name: "Planejador da semana",
              exact: true,
            }),
          ).toBeVisible();
        } else {
          await primary.click();
          await expect(page.locator("#sap-tarefas")).toBeInViewport();
        }
      });
    }

for (const width of [375, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`Nexo home: decision, metrics and readable help at ${width}px in ${theme}`, async ({
      page,
      context,
    }) => {
      await mockAccount(context, "viewer");
      await context.addInitScript(
        (choice) => localStorage.setItem("dc:tema", choice),
        theme,
      );
      await page.setViewportSize({ width, height: width === 375 ? 900 : 1040 });
      await context.route(
        "**/rest/v1/instagram_account_daily_metrics**",
        (r) => {
          const p = new URL(r.request().url()).searchParams;
          const dates = p.getAll("date");
          const start =
            dates.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
          const end =
            dates.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
          const rows = Array.from({ length: 60 }, (_, i) => ({
            date: new Date(Date.now() - i * 86400000)
              .toISOString()
              .slice(0, 10),
            client_id: CID,
            reach: 1200,
            new_followers: 12,
            unfollowers: 3,
            total_interactions: 84,
            saves: 25,
            profile_links_taps: 4,
            followers_count: 5000 - i * 9,
          }))
            .filter((d) => d.date >= start && d.date <= end)
            .sort((a, b) => a.date.localeCompare(b.date));
          const offset = Number(
            p.get("offset") ?? r.request().headers().range?.split("-")[0] ?? 0,
          );
          const limit = Number(p.get("limit") ?? 1000);
          return r.fulfill({ json: rows.slice(offset, offset + limit) });
        },
      );
      await page.goto(`/${CID}`, { waitUntil: "networkidle" });
      const start = page.getByRole("region", {
        name: "Por onde começar",
        exact: true,
      });
      await expect(start).toBeVisible();
      expect(
        await start.evaluate(
          (el) =>
            !!(
              el.compareDocumentPosition(
                document.querySelector('[aria-labelledby="roi-titulo"]')!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
      ).toBe(true);
      await expect(
        page.getByRole("region", {
          name: "Retorno do investimento",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const audit = await new AxeBuilder({ page })
        .include(".mainwrap")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({
        path: `${outputs}nexo-design-inicio-${theme}-${width}.png`,
      });
      await page
        .getByRole("button", { name: /^Todas as análises do período/ })
        .click();
      await expect(
        page.getByRole("heading", { name: "Resumo do período", exact: true }),
      ).toBeVisible();
      await page.emulateMedia({ media: "print" });
      expect(
        await page
          .locator(".product-workspace")
          .evaluate((el) => getComputedStyle(el).color),
      ).toBe("rgb(17, 17, 17)");
    });

test("SAP: overview links to the same tasks and programme, including the restored agent destination", async ({
  page,
  context,
}) => {
  await examples(context, "sap");
  await page.goto(`/sap/${CID}/painel`);
  const action = page.getByRole("link", {
    name: "Ver minhas tarefas",
    exact: true,
  });
  await readableControl(action);
  await action.click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/?$`));
  await expect(
    page.getByRole("heading", { name: "Minha semana", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Áreas do SAP" })
    .getByRole("link", { name: /Acompanhamento/ })
    .click();
  const tabs = page.getByRole("navigation", {
    name: "Telas de Acompanhamento",
  });
  await tabs.getByRole("link", { name: "Agentes de IA", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/agentes`));
});

test("theme preference stays synchronized between the desktop controls and mobile menu", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/ideias`);
  await page
    .getByRole("group", { name: "Aparência" })
    .getByRole("button", { name: "Escuro", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 375, height: 900 });
  await page
    .getByRole("navigation", { name: "Áreas", exact: true })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Navegar no Nexo" });
  await expect(
    menu.getByRole("button", { name: "Escuro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await menu.getByRole("button", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page
      .getByRole("group", { name: "Aparência" })
      .getByRole("button", { name: "Claro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("admin mobile: grouped navigation retains all tools and closes after choosing a destination", async ({
  page,
  context,
}) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/admin");
  const menu = page.locator(".ws-admin-menu");
  await menu.locator("summary").click();
  const nav = menu.getByRole("navigation", {
    name: "Menu do admin",
    exact: true,
  });
  await expect(nav.getByRole("link")).toHaveCount(9);
  await nav
    .getByRole("link", { name: "Central de Agentes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/agentes$/);
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(
    page
      .getByRole("heading", { name: "Central de Agentes", exact: true })
      .first(),
  ).toBeVisible();
});
