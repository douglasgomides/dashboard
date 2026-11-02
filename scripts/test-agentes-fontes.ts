import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { lerAnuncios, lerBrain, lerConteudo, lerRecuperacao } from "../api/_lib/agentes-leitura";

const cid = "11111111-1111-4111-8111-111111111111";
const conversa = "22222222-2222-4222-8222-222222222222";
const origin = "https://agent-sources.offline.invalid";
const originalFetch = globalThis.fetch;
let fonteComErro = "", leituras = 0;
const db = createClient(origin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
try {
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.origin, origin, "nenhum provedor externo é chamado");
    const nome = u.pathname.split("/").at(-1)!;
    // Leitura por cliente (regra por médico): rpc/<tabela>_do_cliente com p_client; conta como a própria tabela.
    const porCliente = u.pathname.includes("/rpc/") && nome.endsWith("_do_cliente");
    const path = porCliente ? nome.slice(0, -"_do_cliente".length) : nome;
    assert.ok((init?.method ?? "GET") === "GET" || path === "operacao_fontes" || porCliente, "nenhuma proposta ou contato é gravado");
    if (path === "operacao_fontes") return Response.json({ apto: true });
    if (porCliente) assert.equal(JSON.parse(String(init?.body)).p_client, cid, "lê só o cliente pedido");
    else if (path === "conversas") assert.equal(u.searchParams.get("id"), `in.(${conversa})`);
    else if (path === "sugestoes_agentes" && u.searchParams.has("conversa_id")) assert.equal(u.searchParams.get("conversa_id"), `in.(${conversa})`);
    else assert.equal(u.searchParams.get(path === "clients" ? "id" : "client_id"), `eq.${cid}`);
    leituras++;
    if (path === fonteComErro) return Response.json({ code: "XX000", message: "source unavailable" }, { status: 500 });
    if (path === "clients") return Response.json({ name: "Clínica fictícia", specialty: "Dermatologia" });
    if (path === "sap_clinicas") return Response.json(null);
    if (path === "conversas_resumos") return Response.json([{ conversa_id: conversa, ate_msg_em: "2026-10-15T12:00:00Z", resumo: { comercial: true, recuperavel: true, etapa: "interesse", situacao: "aguardando_clinica", interesse: "consulta" } }]);
    if (path === "conversas") return Response.json([{ id: conversa, ultima_msg_em: "2026-10-15T12:00:00Z" }]);
    return Response.json([]);
  };
  const grupos: [string, () => Promise<unknown>, string[]][] = [
    ["brain", () => lerBrain(db, cid), ["brain_itens"]],
    ["anuncios", () => lerAnuncios(db, cid), ["meta_ads_daily", "meta_ads_campaigns", "brain_itens", "clients", "sap_clinicas", "sugestoes_agentes", "agentes_aprendizados"]],
    ["conteudo", () => lerConteudo(db, cid), ["brain_itens", "clients", "sap_clinicas", "instagram_posts", "instagram_comments", "sugestoes_agentes", "pautas_conteudo", "agentes_aprendizados", "conversas_resumos"]],
    ["recuperacao", () => lerRecuperacao(db, cid), ["conversas_resumos", "conversas", "sugestoes_agentes", "brain_itens", "clients", "sap_clinicas", "operacao_recuperacao", "agentes_aprendizados"]],
  ];
  let cenarios = 0;
  for (const [agente, ler, fontes] of grupos) {
    fonteComErro = ""; await ler();
    for (const fonte of fontes) {
      fonteComErro = fonte;
      await assert.rejects(ler, /Não foi possível|source unavailable/, `${agente}: erro em ${fonte} não pode virar lista vazia`);
      cenarios++;
    }
  }
  assert.ok(leituras > cenarios);
  console.log(`ok agentes-fontes (${cenarios} falhas de origem bloqueiam a análise; leituras válidas continuam funcionando)`);
} finally { globalThis.fetch = originalFetch; }
