import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Cobertura do CRM e canais sem origem (03.1.1.1.1.1-04, D-06 e D-02): só a equipe vê; as funções do banco (plano 07)
// são simuladas aqui com dados inventados. Sem a função, o bloco avisa a falta de dado e a lista some.

test.use({ reducedMotion: "reduce" });

const CONEXAO = "00000000-0000-4000-8000-0000000000aa";
const hoje = new Date().toISOString().slice(0, 10);

const COBERTURA = {
  origem: { leads: 100, com_origem: 40, por_como: { campo: 30, canal: 10 }, sem_traducao: 30, checkout: 5 },
  valor: { ganhos: 10, com_valor: 2 },
  etapas: { com_card: 8, com_papel: 6 },
  compareceu: { estado: "sem_uso", etapas: 1, entradas_30d: 0 },
  tem_crm: true,
};
const CANAIS = [
  { crm_connection_id: CONEXAO, tipo: "funil", canal_id: "funil:700", nome: "Captação Instagram", leads_90d: 40, sem_origem_90d: 22, origem_atual: null, conclusivo: null, sugestao: "Instagram" },
  { crm_connection_id: CONEXAO, tipo: "canal", canal_id: "900001", nome: null, leads_90d: 25, sem_origem_90d: 12, origem_atual: null, conclusivo: null, sugestao: null },
];
const GUIA = {
  provider: "kommo",
  leads: 100, com_origem: 40, perdidos: 20, perdidos_com_motivo: 5, com_valor_no_ganho: 2, ganhos: 10, sem_dono: 3, abertos: 60, parados_90: 4,
  etapas: [
    { pipeline_name: "Comercial", status_name: "Novo lead", total: 50 },
    { pipeline_name: "Comercial", status_name: "Consulta agendada", total: 20 },
    { pipeline_name: "Comercial", status_name: "Venda ganha", total: 10 },
  ],
};
const SYNC = ["crm", "atendimento", "instagram", "anuncios"].map((fonte) => ({
  fonte, last_attempt_at: `${hoje}T09:00:00Z`, last_success_at: `${hoje}T09:00:00Z`, last_error: null, last_rows: 1, data_ate: hoje,
}));

type Chamadas = { cobertura: number; definir: Record<string, unknown>[] };
async function mockRpcs(page: Page, opcoes: { semFuncao?: boolean } = {}): Promise<Chamadas> {
  const chamadas: Chamadas = { cobertura: 0, definir: [] };
  const json = (v: unknown, status = 200) => ({ status, json: v });
  await page.route("http://localhost:9/rest/v1/rpc/crm_guia_dados", (r) => r.fulfill(json([GUIA])));
  await page.route("http://localhost:9/rest/v1/rpc/client_sync_status", (r) => r.fulfill(json(SYNC)));
  await page.route("http://localhost:9/rest/v1/rpc/crm_cobertura", (r) => {
    chamadas.cobertura++;
    if (opcoes.semFuncao) {
      return r.fulfill(json({ code: "PGRST202", message: "Could not find the function public.crm_cobertura(p_client) in the schema cache", details: null, hint: null }, 404));
    }
    return r.fulfill(json(COBERTURA));
  });
  await page.route("http://localhost:9/rest/v1/rpc/crm_canais_para_confirmar", (r) =>
    r.fulfill(opcoes.semFuncao ? json({ code: "PGRST202", message: "Could not find the function" }, 404) : json(CANAIS)),
  );
  await page.route("http://localhost:9/rest/v1/rpc/crm_definir_canal_origem", (r) => {
    chamadas.definir.push(r.request().postDataJSON());
    return r.fulfill(json(7));
  });
  return chamadas;
}

const SHOTS = process.env.COBERTURA_SHOTS;

test("equipe: Cobertura com N de M e quem resolve, lista sem pré-escolha e Confirmar só depois de escolher", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const chamadas = await mockRpcs(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/crm-guia?preset=30d`);

  const bloco = page.locator("#cobertura");
  await expect(bloco).toBeVisible();
  const origem = bloco.locator('[data-cobertura="origem"]');
  await expect(origem).toContainText("40 de 100");
  await expect(origem.getByText("Equipe", { exact: true })).toBeVisible();
  await expect(origem.getByText("Cliente", { exact: true })).toBeVisible();
  await expect(bloco.locator('[data-cobertura="valor"]')).toContainText("2 de 10");
  await expect(bloco.locator('[data-cobertura="compareceu"]')).toContainText("mover o card para a etapa");
  await expect(bloco.locator('[data-cobertura="fontes"]')).toContainText("4 de 4");
  await expect(bloco).not.toContainText(/m[ée]dia|outras cl[ií]nicas/i);

  const lista = page.locator("#canais-sem-origem");
  await expect(lista).toBeVisible();
  const funil = lista.locator('[data-canal$=":funil:700"]');
  await expect(funil).toContainText("Funil Captação Instagram");
  await expect(funil.getByText("Sugestão pelo nome: Instagram")).toBeVisible();
  // A sugestão nunca vem escolhida: o seletor começa vazio e Confirmar fica travado.
  const select = funil.getByLabel("Origem confirmada");
  await expect(select).toHaveValue("");
  const confirmar = funil.getByRole("button", { name: "Confirmar" });
  await expect(confirmar).toBeDisabled();
  // Canal sem nome na API: mostra o número, onde ler e o campo para digitar o nome.
  const semNome = lista.locator('[data-canal$=":900001"]');
  await expect(semNome).toContainText("sem nome na API");
  await expect(semNome.getByLabel("Nome lido no CRM")).toBeVisible();

  if (SHOTS) {
    await page.locator("#cobertura").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/cobertura-1440.png`, fullPage: true });
  }

  await select.selectOption("Instagram");
  await expect(confirmar).toBeEnabled();
  const antes = chamadas.cobertura;
  await confirmar.click();
  await expect(funil.getByText("7 leads refeitos")).toBeVisible();
  expect(chamadas.definir).toEqual([{ p_connection: CONEXAO, p_canal: "funil:700", p_nome: "Captação Instagram", p_origem: "Instagram", p_conclusivo: true }]);
  // Depois de gravar, a cobertura é lida de novo.
  await expect.poll(() => chamadas.cobertura).toBeGreaterThan(antes);

  if (SHOTS) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${CID}/crm-guia?preset=30d`);
    await expect(page.locator("#canais-sem-origem")).toBeVisible();
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(375);
    await page.screenshot({ path: `${SHOTS}/cobertura-375.png`, fullPage: true });
  }
});

test("equipe: sem a função no banco, o bloco avisa a falta de dado e a lista some", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await mockRpcs(page, { semFuncao: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/crm-guia?preset=30d`);

  const bloco = page.locator("#cobertura");
  await expect(bloco).toContainText("a regra nova ainda não foi aplicada no banco");
  await expect(bloco.locator("[data-cobertura]")).toHaveCount(0);
  await expect(bloco).not.toContainText(/\d+ de \d+/);
  await expect(page.locator("#canais-sem-origem")).toHaveCount(0);
  // O resto do guia continua de pé.
  await expect(page.locator("#passos")).toBeVisible();
});

test("médico: Configurar CRM não aparece no menu e o link direto não abre a Cobertura", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  const chamadas = await mockRpcs(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/crm-guia?preset=30d`);
  await expect(page.locator("main#workspace-content")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Configurar CRM$/ })).toHaveCount(0);
  await expect(page.locator("#cobertura")).toHaveCount(0);
  await expect(page.locator("#canais-sem-origem")).toHaveCount(0);
  expect(chamadas.cobertura).toBe(0);
});
