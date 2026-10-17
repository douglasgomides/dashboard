import { test, expect, type BrowserContext, type Route } from "@playwright/test";
import { CID, client, mockAccount } from "./fixtures";

function paginated(route: Route, rows: unknown[]) {
  const url = new URL(route.request().url());
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  return route.fulfill({ json: rows.slice(offset, offset + limit) });
}

async function mockAuditoria(context: BrowserContext) {
  await mockAccount(context, "admin");
  await context.route("**/rest/v1/rpc/auditoria_comercial", (route) => route.fulfill({ json: {
    conversas_periodo: 2, lidas: 1,
    funil: { engajou: 1, preco_pedido: 1, preco_apresentado: 1, agendamento_em_curso: 0, agendou: 0 },
    objecoes: {}, falhas: {}, origem: {}, nota_media: null, por_atendente: [], resgate: [], exemplos: [],
  } }));
}

const potencial = { recuperaveis: 2, ticket: 1234.56, fonte_ticket: "equipe", vendas_crm: 0, valor: 2469.12 };

test("integrations display linked ad accounts and configured WhatsApp without a prior sync", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  await context.route("**/rest/v1/clients?**", (route) => {
    const c = { ...client, meta_ad_account_id: null, wts_company_id: "company-test" };
    return (route.request().headers().accept ?? "").includes("vnd.pgrst.object")
      ? route.fulfill({ json: c }) : paginated(route, [c]);
  });
  await context.route("**/rest/v1/client_ad_accounts?**", (route) => paginated(route, [{ client_id: CID, ad_account_id: "123", active: true }]));
  await page.goto("/admin/integracoes");
  const ads = page.getByRole("button", { name: "Ver clientes de Anúncios Meta", exact: true });
  await ads.click();
  await expect(ads).toHaveAttribute("aria-expanded", "true");
  await expect(ads.locator("..")).toContainText("Clínica de teste · conta 123");
  await expect(ads.locator("..")).toContainText("Ligado, sem registro de sincronização");
  const wts = page.getByRole("button", { name: "Ver clientes de WTS (WhatsApp)", exact: true });
  await wts.click();
  await expect(wts.locator("..")).toContainText("Clínica de teste");
  await expect(wts.locator("..")).toContainText("Ligado, sem registro de sincronização");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("integrations distinguish a failed source from an empty map and retry explicitly", async ({ page, context }) => {
  await mockAccount(context, "admin");
  let failing = true;
  await context.route("**/rest/v1/client_ad_accounts?**", (route) => failing
    ? route.fulfill({ status: 503, json: { message: "simulated private database error" } })
    : paginated(route, []));
  await page.goto("/admin/integracoes");
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar as integrações.");
  await expect(page.getByText("simulated private database error", { exact: false })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Conteúdo", exact: true })).not.toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conteúdo", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("ticket editing preserves cents, rejects nonfinite input and serializes pending actions", async ({ page, context }) => {
  await mockAuditoria(context);
  await context.route("**/rest/v1/rpc/receita_em_jogo", (route) => route.fulfill({ json: potencial }));
  const writes: unknown[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await context.route("**/rest/v1/rpc/definir_ticket_cliente", async (route) => {
    writes.push(route.request().postDataJSON());
    await pending;
    return route.fulfill({ json: null });
  });
  await page.goto(`/${CID}/atendimento?aba=conversas`);
  await page.getByRole("button", { name: "Ajustar ticket", exact: true }).click();
  const input = page.getByRole("textbox", { name: /Ticket médio \(R\$\)/ });
  await expect(input).toHaveValue("1234,56");
  await input.fill("1e309");
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await input.fill("1234,56");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  try {
    await expect.poll(() => writes).toEqual([{ p_client: CID, p_valor: 1234.56 }]);
    await expect(input).toBeDisabled();
    await expect(page.getByRole("button", { name: "Salvando…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Voltar ao automático", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(input).not.toBeVisible();
  await page.getByRole("button", { name: "Ajustar ticket", exact: true }).click();
  await expect(input).toHaveValue("1234,56");
  expect(writes).toHaveLength(1);
});

test("audit and potential calculation failures remain visible and allow independent retry", async ({ page, context }) => {
  await mockAuditoria(context);
  let failingAudit = true;
  let failingEstimate = true;
  await context.route("**/rest/v1/rpc/auditoria_comercial", async (route) => failingAudit
    ? route.fulfill({ status: 503, json: { message: "simulated unavailable audit" } })
    : route.fallback());
  await context.route("**/rest/v1/rpc/receita_em_jogo", (route) => failingEstimate
    ? route.fulfill({ status: 503, json: { message: "simulated unavailable estimate" } })
    : route.fulfill({ json: potencial }));
  await page.goto(`/${CID}/atendimento?aba=conversas`);
  const auditAlert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar a auditoria comercial." });
  await expect(auditAlert).toBeVisible();
  failingAudit = false;
  await auditAlert.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  const estimateAlert = page.getByRole("alert").filter({ hasText: "Não foi possível calcular o potencial do período." });
  await expect(estimateAlert).toBeVisible();
  await expect(auditAlert).not.toBeVisible();
  failingEstimate = false;
  await estimateAlert.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByText("Em jogo no período", { exact: true })).toBeVisible();
  await expect(estimateAlert).not.toBeVisible();
});

test("viewer cannot open the integration administration or edit the ticket", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let privilegedReads = 0;
  await context.route("**/rest/v1/client_ad_accounts?**", (route) => {
    privilegedReads++;
    return paginated(route, []);
  });
  await page.goto("/admin/integracoes");
  await expect(page).not.toHaveURL(/\/admin(?:\/|$)/);
  expect(privilegedReads).toBe(0);
  await page.goto(`/${CID}/atendimento?aba=conversas`);
  await expect(page.getByText("Nenhum atendimento no período", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajustar ticket", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Definir ticket médio", exact: true })).not.toBeVisible();
});
