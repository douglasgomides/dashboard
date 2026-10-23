import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

const RID = "77777777-7777-4777-8777-777777777777";
const resultado = {
  resumo: "A médica quer focar em menopausa até dezembro e melhorar o tempo de resposta da secretária.",
  combinados: ["Dois Reels por semana sobre menopausa"], acoes_clinica: ["Secretária responde em até 15 minutos"], acoes_equipe: ["Revisar campanha de estética"],
  entregas: [{ tipo: "conteudo", titulo: "Roteiro de Reels: sintomas da menopausa", detalhe: "Gancho fictício e três pontos.", porque: "Foco combinado na reunião" }],
  memorias: [{ memoria: "decisao", chave: "foco_trimestre", valor: "Foco em menopausa até dezembro", confianca: "alta" }],
  pendencias: [],
};

for (const width of [375, 1440]) {
  test(`team notes a meeting, processes it and sees summary, weekly deliveries and Brain proposals at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    const reuniao: Record<string, unknown> = { id: RID, data: "2026-10-23", titulo: "Reunião semanal", participantes: null, notas: "", transcricao: null, resultado: null, memorias_propostas: 0, processada_em: null, atualizado_em: "2026-10-23T12:00:00Z" };
    let salvo: Record<string, unknown> | null = null;
    let pedido: Record<string, unknown> | null = null;
    await context.route("http://localhost:9/rest/v1/reunioes**", (r) => {
      const m = r.request().method();
      if (m === "PATCH") { salvo = r.request().postDataJSON(); Object.assign(reuniao, salvo); return r.fulfill({ status: 204, body: "" }); }
      return r.fulfill({ json: [reuniao] });
    });
    await context.route("**/api/sync/manual", (r) => {
      pedido = r.request().postDataJSON();
      Object.assign(reuniao, { resultado, memorias_propostas: 1, processada_em: "2026-10-23T13:00:00Z" });
      return r.fulfill({ json: { alvo: "reuniao", ok: true, memorias_propostas: 1, brain_erro: null } });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/reunioes`);
    await page.getByRole("button", { name: /Reunião semanal/ }).click();
    const processar = page.getByRole("button", { name: "Processar reunião" });
    await expect(processar).toBeDisabled();
    await page.getByLabel("Notas").fill("- Quer focar em menopausa\n- Secretária demora para responder");
    await processar.click();
    await expect(page.getByRole("status")).toHaveText("1 memória(s) proposta(s) no Brain para aprovar.");
    expect(salvo?.notas).toContain("focar em menopausa");
    expect(pedido).toMatchObject({ client_id: CID, alvo: "reuniao", id: RID });
    await expect(page.getByText(resultado.resumo, { exact: true })).toBeVisible();
    await expect(page.getByText("Roteiro de Reels: sintomas da menopausa")).toBeVisible();
    await expect(page.getByText("Foco em menopausa até dezembro", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Aprovar no Brain/ })).toHaveAttribute("href", new RegExp(`/admin/brain\\?c=${CID}`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/reunioes-${width}.png`, fullPage: true });
  });
}

test("meeting notes stay with the Doctor Creator team", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let lido = false;
  await context.route("http://localhost:9/rest/v1/reunioes**", (r) => { lido = true; return r.fulfill({ json: [] }); });
  await page.goto(`/${CID}/reunioes`);
  await expect(page.getByText("As reuniões ficam visíveis só para a equipe da Doctor Creator.")).toBeVisible();
  expect(lido).toBe(false);
});
