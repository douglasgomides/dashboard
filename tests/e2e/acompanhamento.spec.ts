import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { fichaVazia, novaAcao } from "../../src/lib/acompanhamento";

for (const width of [375, 1600]) test(`Acompanhamento salva antes da IA e preserva proposta em ${width}px`, async ({ page, context }) => {
  await mockAccount(context, "admin");
  let revisao = { id: "44444444-4444-4444-8444-444444444444", client_id: CID, data: "2026-11-27", titulo: "Revisão semanal", prioridade: "Alta", proxima_checagem: "2026-12-04", versao: 0, clients: { name: "Clínica de teste" }, dados: { ...fichaVazia(), objetivo: "Aumentar agendamentos", acoes: [novaAcao()] } };
  const operacoes: string[] = [];
  await context.route("**/api/sync/manual?_central=acompanhamento", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { revisoes: [revisao], clientes: [{ id: CID, name: "Clínica de teste", active: true }], envios: [], ia: true, clickup: false } });
    const p = route.request().postDataJSON(); operacoes.push(p.acao);
    if (p.acao === "salvar") { revisao = { ...p.revisao, clients: revisao.clients, versao: revisao.versao + 1 }; return route.fulfill({ json: { revisao } }); }
    expect(p.versao).toBe(revisao.versao);
    revisao = { ...revisao, versao: revisao.versao + 1, dados: { ...revisao.dados, conversas: [{ papel: "ia", texto: "Confira os agendamentos registrados [1].", em: new Date().toISOString() }] } };
    return route.fulfill({ json: { revisao, resposta: { sugestoes: ["Conferir a origem dos contatos"] }, fontes: [{ numero: 1, id: revisao.id, data: revisao.data, titulo: revisao.titulo }] } });
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/admin/acompanhamento");
  await expect(page.getByRole("heading", { name: "Da análise à próxima ação" })).toBeVisible();
  await page.getByLabel("Objetivo do cliente").fill("Conferir os agendamentos por origem");
  await expect(page.getByRole("button", { name: "Nova revisão", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "O que mudou e merece atenção?", exact: true }).click();
  await expect(page.getByText("Confira os agendamentos registrados [1].", { exact: true })).toBeVisible();
  expect(operacoes).toEqual(["salvar", "perguntar"]);
  await page.getByRole("button", { name: "Usar como proposta" }).click();
  await expect(page.getByLabel("Ação", { exact: true }).last()).toHaveValue("Conferir a origem dos contatos");
  await expect(page.getByLabel("Status", { exact: true }).last()).toHaveValue("A validar");
  await expect(page.getByRole("button", { name: "Criar tarefa no ClickUp" }).last()).toBeDisabled();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Revisão salva.", { exact: true })).toBeVisible();
  expect(revisao.dados.acoes).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/tmp/acompanhamento-${width}.png`, fullPage: true });
});
