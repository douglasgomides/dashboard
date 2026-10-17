import { test, expect, type BrowserContext } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

const SECOND_CID = "44444444-4444-4444-8444-444444444444";
const recentReading = () => ({ estado: "concluida", erro: null, resultado: { propostas: 0 }, atualizado_em: new Date().toISOString() });

async function mockBrainClinics(context: BrowserContext) {
  await mockAccount(context, "admin");
  await context.route("**/rest/v1/cliente_modulos**", (route) => route.fulfill({
    json: [
      { client_id: CID, status: "ativo", clients: { name: "Clínica Alfa" } },
      { client_id: SECOND_CID, status: "beta", clients: { name: "Clínica Beta" } },
    ],
  }));
  await context.route("**/rest/v1/agente_execucoes**", (route) => route.fulfill({ json: recentReading() }));
}

test("Brand Brain distinguishes a failed last read from loaded history and allows retry", async ({ page, context }) => {
  await mockBrainClinics(context);
  let failReading = true;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let first = true;
  await context.route("**/rest/v1/agente_execucoes**", async (route) => {
    if (first) { first = false; await firstResponse; }
    return route.fulfill(failReading ? { status: 503, json: { message: "simulated read failure" } } : { json: recentReading() });
  });
  await page.goto("/admin/brain", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Verificando a última leitura…", { exact: true })).toBeVisible();
  await expect(page.getByText("Ainda não houve leitura desta clínica.", { exact: true })).not.toBeVisible();
  releaseFirst();
  await expect(page.getByRole("alert")).toContainText("Não foi possível consultar a última leitura.");
  await expect(page.getByText("Ainda não houve leitura desta clínica.", { exact: true })).not.toBeVisible();
  failReading = false;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByText(/Última leitura: .*0 sugestão/)).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByText(/Antes de aprovar, revise o texto e retire nomes, contatos/)).toBeVisible();
  await expect(page.getByText("Não entra nome, telefone nem caso de paciente: só padrões.", { exact: false })).not.toBeVisible();
});

test("Brand Brain does not carry an unsaved manual item into another clinic", async ({ page, context }) => {
  await mockBrainClinics(context);
  await page.goto(`/admin/brain?c=${CID}`);
  // Warm both clinics so changing the selection reuses cached data instead of
  // unmounting the form incidentally behind the initial loading state.
  await page.getByRole("combobox", { name: "Clínica", exact: true }).selectOption(SECOND_CID);
  await expect(page.getByRole("button", { name: "Escrever item", exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Clínica", exact: true }).selectOption(CID);
  await expect(page.getByRole("button", { name: "Escrever item", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Escrever item", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Assunto", exact: true }).fill("Tom da clínica Alfa");
  await page.getByRole("textbox", { name: "Texto", exact: true }).fill("Rascunho exclusivo da clínica Alfa.");
  await page.getByRole("combobox", { name: "Clínica", exact: true }).selectOption(SECOND_CID);
  await expect(page.getByRole("combobox", { name: "Clínica", exact: true })).toHaveValue(SECOND_CID);
  await expect(page.getByRole("textbox", { name: "Assunto", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Escrever item", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Assunto", exact: true })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Texto", exact: true })).toHaveValue("");
});

test("Brand Brain ignores an invalid clinic parameter and queries an active clinic", async ({ page, context }) => {
  await mockBrainClinics(context);
  const requestedClients: string[] = [];
  for (const table of ["brain_itens", "agente_execucoes"]) {
    await context.route(`**/rest/v1/${table}**`, (route) => {
      requestedClients.push(new URL(route.request().url()).searchParams.get("client_id") ?? "");
      return route.fulfill({ json: table === "agente_execucoes" ? recentReading() : [] });
    });
  }
  await page.goto("/admin/brain?c=not-an-active-clinic");
  await expect(page.getByRole("combobox", { name: "Clínica", exact: true })).toHaveValue(CID);
  await expect(page.getByText(/Última leitura: .*0 sugestão/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para revisar", exact: true })).toBeVisible();
  expect(requestedClients.length).toBeGreaterThanOrEqual(2);
  expect(requestedClients.every((id) => id === `eq.${CID}`)).toBe(true);
});

test("Brand Brain starts one automatic read per clinic and keeps late results scoped to it", async ({ page, context }) => {
  await mockBrainClinics(context);
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let first = true;
  await context.route("**/rest/v1/agente_execucoes**", (route) => {
    const id = new URL(route.request().url()).searchParams.get("client_id");
    return route.fulfill({ json: id === `eq.${CID}`
      ? { ...recentReading(), atualizado_em: new Date(Date.now() - 13 * 3_600_000).toISOString() }
      : recentReading() });
  });
  await context.route("**/rest/v1/rpc/agentes_iniciar", (route) => {
    started.push(route.request().postDataJSON().p_client_id);
    return route.fulfill({ json: "55555555-5555-4555-8555-555555555555" });
  });
  await context.route("**/api/sync/manual", async (route) => {
    if (first) { first = false; await firstResponse; }
    return route.fulfill({ json: { execucoes: [{ estado: "concluida" }] } });
  });

  // Start from the fresh clinic so Back changes only the selected clinic while
  // the older clinic's automatic request is still in flight.
  await page.goto(`/admin/brain?c=${SECOND_CID}`);
  await expect(page.getByText(/Última leitura:/)).toBeVisible();
  expect(started).toEqual([]);
  await page.getByRole("combobox", { name: "Clínica", exact: true }).selectOption(CID);
  await expect(page.getByRole("button", { name: "Lendo as fontes…", exact: true })).toBeDisabled();
  await expect.poll(() => started).toEqual([CID]);
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Clínica", exact: true })).toHaveValue(SECOND_CID);
  await expect(page.getByRole("combobox", { name: "Clínica", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Atualizar sugestões", exact: true })).toBeEnabled();
  const finished = page.waitForResponse((response) => response.url().endsWith("/api/sync/manual"));
  releaseFirst();
  await finished;
  await expect(page.getByText('Pronto. O que for novo está em "Para revisar".', { exact: true })).not.toBeVisible();

  await page.getByRole("combobox", { name: "Clínica", exact: true }).selectOption(CID);
  await expect(page.getByRole("button", { name: "Atualizar sugestões", exact: true })).toBeEnabled();
  expect(started).toEqual([CID]);
  await page.getByRole("button", { name: "Atualizar sugestões", exact: true }).click();
  await expect.poll(() => started).toEqual([CID, CID]);
  await expect(page.getByRole("button", { name: "Atualizar sugestões", exact: true })).toBeEnabled();
  expect(started).toEqual([CID, CID]);
});
