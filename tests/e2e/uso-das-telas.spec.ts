import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mockAccount } from "./fixtures";

// Aba "Uso das telas" de /admin/conferencia, com o RPC rota_acessos_resumo simulado (nenhum banco por trás).
const RPC = "http://localhost:9/rest/v1/rpc/rota_acessos_resumo";
const TABELA = "http://localhost:9/rest/v1/rota_acessos";

const linha = (rota: string, aberturas: number, origens: Record<string, number>) => ({
  rota, aberturas, pessoas: 3, ultima: "2026-11-08T13:00:00Z",
  menu: 0, busca: 0, link: 0, direto: 0, redirecionamento: 0, bloqueada: 0, ...origens,
});
const RESUMO = [
  linha("/_authenticated/$clientId/", 12, { menu: 5, link: 4, direto: 3 }),
  linha("/_authenticated/admin/conferencia", 4, { menu: 4 }),
];

type Corpo = { p_dias: number; p_equipe: boolean; p_incluir_teste: boolean };

async function simular(context: BrowserContext, resposta: { status: number; json: unknown } = { status: 200, json: RESUMO }) {
  const corpos: Corpo[] = [];
  await context.route(RPC, (route) => {
    corpos.push(route.request().postDataJSON() as Corpo);
    return route.fulfill(resposta);
  });
  await context.route(`${TABELA}**`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [{ criado_em: "2026-11-08T13:00:00Z" }] });
    return route.fulfill({ status: 201, json: [] });
  });
  return corpos;
}

async function abrirAba(page: Page) {
  await page.goto("/admin/conferencia");
  await expect(page.getByRole("tab", { name: "Conferência dos dados" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Uso das telas" }).click();
  await expect(page.getByRole("tab", { name: "Uso das telas" })).toHaveAttribute("aria-selected", "true");
}

test("a aba lista as 81 telas, inclusive as com zero, e o início do registro", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const corpos = await simular(context);
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirAba(page);
  const painel = page.getByRole("tabpanel");
  await expect(painel.locator("tbody tr")).toHaveCount(81);
  const indice = painel.getByRole("row").filter({ has: page.getByRole("cell", { name: "/[clínica]/", exact: true }) });
  await expect(indice.getByRole("cell").nth(1)).toHaveText("12");
  await expect(painel.getByText("só redireciona", { exact: true })).toHaveCount(12);
  await expect(painel.getByText("Registro ligado desde 08/11/2026")).toBeVisible();
  await expect(painel.locator("caption")).toHaveText("Últimos 7 dias · uso das clínicas");
  expect(corpos[0]).toEqual({ p_dias: 7, p_equipe: false, p_incluir_teste: false });
});

test("período, Clínicas × Equipe e clínicas de teste vão para o RPC", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const corpos = await simular(context);
  await abrirAba(page);
  await page.getByRole("button", { name: "30 dias" }).click();
  await page.getByRole("button", { name: "Equipe", exact: true }).click();
  await page.getByLabel("Incluir clínicas de teste").check();
  await expect.poll(() => corpos.at(-1)).toEqual({ p_dias: 30, p_equipe: true, p_incluir_teste: true });
  await expect(page.getByRole("tabpanel").locator("caption")).toHaveText("Últimos 30 dias · uso da equipe");
});

test("tabela ainda não criada e erro de leitura viram mensagem, sem quebrar a tela", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await simular(context, { status: 404, json: { code: "PGRST202", message: "Could not find the function public.rota_acessos_resumo" } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await abrirAba(page);
  await expect(page.getByText("A tabela do registro ainda não foi criada")).toBeVisible();
  expect(erros).toEqual([]);

  const outra = await context.newPage();
  outra.on("pageerror", (e) => erros.push(e.message));
  await context.route(RPC, (route) => route.fulfill({ status: 500, json: { code: "XX000", message: "boom" } }));
  await abrirAba(outra);
  await expect(outra.getByText("Não foi possível ler o registro agora")).toBeVisible();
  expect(erros).toEqual([]);
});

test("o texto da aba só descreve contagem e não traz gráfico", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await simular(context);
  await abrirAba(page);
  const painel = page.getByRole("tabpanel");
  await expect(painel.locator("tbody tr")).toHaveCount(81);
  const texto = (await painel.innerText()).toLowerCase();
  for (const palavra of ["inútil", "cortar", "remover", "apagar"]) expect(texto).not.toContain(palavra);
  await expect(painel.locator("canvas, .recharts-wrapper")).toHaveCount(0);
});

test("em 375 px a aba não cria rolagem horizontal na página", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await simular(context);
  await page.setViewportSize({ width: 375, height: 800 });
  await abrirAba(page);
  await expect(page.getByRole("tabpanel").locator("tbody tr")).toHaveCount(81);
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(largura.doc).toBeLessThanOrEqual(largura.janela + 1);
});

test("viewer nunca vê a aba: o guarda do layout admin o leva para fora", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await simular(context);
  await page.goto("/admin/conferencia");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/admin/conferencia");
  await expect(page.getByRole("tab", { name: "Uso das telas" })).toHaveCount(0);
});
