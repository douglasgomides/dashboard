import { test, expect, type BrowserContext } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import type { PecaConteudo } from "../../src/lib/agentes-sugestoes";

// Os testes do Hub (/agentes) saíram em 11/11/2026, quando o João tirou os agentes do Nexo (decisão do João: "tira isso aí,
// ninguém usa"). Fica só a prova de que o SAP não mostra a recuperação nem o piloto sombra.
test.use({ reducedMotion: "reduce" });

const ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date().toISOString();
const peca = { formato: "reels", titulo: "Como se preparar para uma consulta", objetivo: "salvamento", gancho: "O que levar na primeira consulta?", cenas: [{ fala: "Leve sua lista de dúvidas para conversar com o médico.", visual: "Médico em consultório", tela: "Prepare suas dúvidas" }], slides: [], legenda: "Prepare as perguntas antes da consulta.", cta: "Salve para consultar depois.", hashtags: [], evidencias: ["Dúvida recorrente nos comentários da clínica de teste."], brain: [], por_que: "Responder a uma dúvida do público." } satisfies PecaConteudo;

async function center(context: BrowserContext, profile: "admin" | "viewer", options: { failedCount?: boolean; failedPlanner?: boolean; running?: boolean; empty?: boolean; pendingCount?: number } = {}) {
  await mockAccount(context, profile);
  let estado = "proposta";
  let preparada = false;
  const escritas: { path: string; body: Record<string, any> }[] = [];
  const pautas: Record<string, unknown>[] = [];
  const leituras: string[] = [];
  await context.route("**/rest/v1/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    leituras.push(`${req.method()} ${path}?${url.searchParams}`);
    const responder = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/rest/v1/cliente_modulos") return responder([{ modulo: "hub", status: "ativo" }, { modulo: "brand_brain", status: "ativo" }]);
    if (path === "/rest/v1/agente_execucoes") return responder({ id: ID, estado: options.running ? "rodando" : "concluida", criado_em: NOW, atualizado_em: NOW, resultado: preparada ? { pecas: 1 } : { pecas: 0, motivo: "Pouco dado ainda (Brain, Instagram ou conversas)." } });
    if (["/rest/v1/sugestoes_agentes", "/rest/v1/campanhas_ideias", "/rest/v1/brain_itens"].includes(path) && req.method() === "HEAD") {
      if (options.failedCount && url.searchParams.get("agente") === "eq.anuncios") return responder({ message: "source unavailable" }, 503);
      const count = path.endsWith("sugestoes_agentes") && url.searchParams.get("agente") === "eq.conteudo" && estado === "proposta" && !options.empty ? options.pendingCount ?? 1 : 0;
      return route.fulfill({ headers: { "content-range": `*/${count}`, "access-control-expose-headers": "content-range" } });
    }
    if (path === "/rest/v1/sugestoes_agentes") {
      if (url.searchParams.get("select") === "criado_em") return responder(options.empty ? null : { criado_em: NOW });
      return responder(url.searchParams.get("agente") === "eq.conteudo" && !options.empty ? [{ id: ID, client_id: CID, agente: "conteudo", tipo: "reels", titulo: peca.titulo, conteudo: peca, estado, criado_em: NOW, evidencias: [], brain: [] }] : []);
    }
    if (path === "/rest/v1/pautas_conteudo") {
      if (req.method() === "POST") {
        const body = req.postDataJSON(); escritas.push({ path, body });
        if (options.failedPlanner) return responder({ message: "write unavailable" }, 503);
        pautas.push({ ...body, id: ID, criado_em: NOW }); return responder(null, 201);
      }
      return responder(pautas);
    }
    if (path === "/rest/v1/rpc/sugestao_decidir") { const body = req.postDataJSON(); escritas.push({ path, body }); estado = body.p_estado; return responder(null); }
    if (path === "/rest/v1/rpc/agentes_iniciar") { escritas.push({ path, body: req.postDataJSON() }); return responder(ID); }
    return route.fallback();
  });
  await context.route("**/api/sync/manual", async (route) => {
    escritas.push({ path: "/api/sync/manual", body: route.request().postDataJSON() }); preparada = true;
    return route.fulfill({ json: { execucoes: [{ id: ID, estado: "concluida" }] } });
  });
  return { escritas, pautas, leituras };
}

test("SAP never shows recovery work or the Nexo shadow pilot even with a forged selection", async ({ page, context }) => {
  const api = await center(context, "admin");
  await page.goto(`/sap/${CID}/agentes?agente=recuperacao`);
  const choices = page.getByRole("group", { name: "Escolher o problema da clínica" });
  await expect(choices.getByRole("button")).toHaveCount(3);
  await expect(choices.getByRole("button", { name: /Saber o que produzir/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Teste de atendimento: avaliar respostas sem enviar ao paciente", { exact: true })).toHaveCount(0);
  expect(api.leituras.some((r) => r.includes("agente=eq.recuperacao"))).toBe(false);
});
