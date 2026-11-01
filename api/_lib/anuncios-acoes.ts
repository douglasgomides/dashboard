/**
 * Aplica e desfaz ações nos anúncios pela API de Marketing da Meta (regras e travas em src/lib/anuncios-acoes.ts).
 * Só roda com o token META_ADS_WRITE_TOKEN (usuário do sistema com ads_management) e com uma pessoa da equipe
 * aprovando no painel. Orçamento: se a campanha tem orçamento próprio (CBO), muda o da campanha; senão, muda o de cada
 * conjunto ativo com orçamento diário. Antes de mudar, guarda o estado anterior para desfazer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { novoOrcamento, podeAplicar, podeTrocarOrcamento, type MudancaOrcamento, type TipoAcao } from "../../src/lib/anuncios-acoes.js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { fetchMeta } from "./meta-limite.js";

type Admin = SupabaseClient<any, any, any>;
const GRAPH = META_GRAPH_URL;
const token = () => process.env.META_ADS_WRITE_TOKEN || "";
export const tokenEscritaConfigurado = () => !!token();

async function ler(caminho: string): Promise<any> {
  const r = await fetchMeta(`${GRAPH}/${caminho}${caminho.includes("?") ? "&" : "?"}access_token=${token()}`, { signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta: ${j?.error?.message ?? r.status}`);
  return j;
}
async function gravar(id: string, campos: Record<string, string>): Promise<void> {
  const corpo = new URLSearchParams({ ...campos, access_token: token() });
  const r = await fetchMeta(`${GRAPH}/${id}`, { method: "POST", body: corpo, signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(`Meta: ${j?.error?.message ?? r.status}`);
}

/** Trocas de orçamento desta campanha registradas na última hora (aplicadas ou desfeitas). */
async function trocasRecentes(admin: Admin, campanhaId: string): Promise<MudancaOrcamento[]> {
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { data, error } = await admin.from("anuncios_mudancas").select("tipo, estado, antes, depois, aplicado_em, desfeito_em")
    .eq("campanha_id", campanhaId).eq("tipo", "orcamento").or(`aplicado_em.gte.${desde},desfeito_em.gte.${desde}`);
  if (error) throw new Error("Não foi possível conferir as trocas de orçamento da última hora.");
  return (data ?? []) as MudancaOrcamento[];
}

interface Estado { status?: string; orcamentos: { id: string; nivel: "campanha" | "conjunto"; daily_budget: number }[] }

async function estadoAtual(campanhaId: string): Promise<Estado> {
  const c = await ler(`${campanhaId}?fields=status,daily_budget`);
  if (c.daily_budget) return { status: c.status, orcamentos: [{ id: campanhaId, nivel: "campanha", daily_budget: Number(c.daily_budget) }] };
  const a = await ler(`${campanhaId}/adsets?fields=id,status,daily_budget&limit=50`);
  const orcamentos = ((a.data ?? []) as { id: string; status: string; daily_budget?: string }[])
    .filter((x) => x.status === "ACTIVE" && x.daily_budget).map((x) => ({ id: x.id, nivel: "conjunto" as const, daily_budget: Number(x.daily_budget) }));
  return { status: c.status, orcamentos };
}

export async function aplicarAcao(admin: Admin, p: { clientId: string; campanhaId: string; tipo: TipoAcao; pct?: number; sugestaoId?: string | null; userId: string }) {
  if (!tokenEscritaConfigurado()) return { ok: false, erro: "Token de escrita da Meta (META_ADS_WRITE_TOKEN) ainda não configurado na Vercel." };
  // A campanha precisa ser deste cliente (evita mexer em conta de outro).
  const { data: camp } = await admin.from("meta_ads_campaigns").select("campaign_id").eq("client_id", p.clientId).eq("campaign_id", p.campanhaId).maybeSingle();
  if (!camp) return { ok: false, erro: "Campanha não pertence a este cliente." };
  const { data: hist } = await admin.from("anuncios_mudancas").select("campanha_id, estado, aplicado_em").eq("campanha_id", p.campanhaId).order("aplicado_em", { ascending: false }).limit(5);
  const pode = podeAplicar(p.campanhaId, (hist ?? []) as { campanha_id: string; estado: string; aplicado_em: string | null }[]);
  if (!pode.ok) return { ok: false, erro: pode.motivo };
  let antes: Estado = { orcamentos: [] };
  let depois: Record<string, unknown> = {};
  try {
    antes = await estadoAtual(p.campanhaId);
    if (p.tipo === "pausar") { await gravar(p.campanhaId, { status: "PAUSED" }); depois = { status: "PAUSED" }; }
    else if (p.tipo === "ativar") { await gravar(p.campanhaId, { status: "ACTIVE" }); depois = { status: "ACTIVE" }; }
    else {
      if (!antes.orcamentos.length) throw new Error("Nenhum orçamento diário ativo encontrado (orçamento vitalício ou conjuntos pausados).");
      // Limite da Meta: 4 trocas de orçamento por hora em cada conjunto. Recusa sem registrar como falha.
      const limite = podeTrocarOrcamento(antes.orcamentos.map((o) => o.id), await trocasRecentes(admin, p.campanhaId));
      if (!limite.ok) return { ok: false, erro: limite.motivo };
      const novos = antes.orcamentos.map((o) => ({ ...o, daily_budget: novoOrcamento(o.daily_budget, p.pct ?? 0) }));
      for (const o of novos) await gravar(o.id, { daily_budget: String(o.daily_budget) });
      depois = { orcamentos: novos };
    }
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from("anuncios_mudancas").insert({ client_id: p.clientId, sugestao_id: p.sugestaoId ?? null, campanha_id: p.campanhaId, tipo: p.tipo, pct: p.pct ?? null, antes, depois, estado: "falhou", erro, aprovado_por: p.userId });
    return { ok: false, erro };
  }
  const { data } = await admin.from("anuncios_mudancas").insert({ client_id: p.clientId, sugestao_id: p.sugestaoId ?? null, campanha_id: p.campanhaId, tipo: p.tipo, pct: p.pct ?? null, antes, depois, estado: "aplicada", aprovado_por: p.userId, aplicado_em: new Date().toISOString() }).select("id").single();
  if (p.sugestaoId) await admin.from("sugestoes_agentes").update({ estado: "feita", decidido_por: p.userId, decidido_em: new Date().toISOString() }).eq("id", p.sugestaoId);
  return { ok: true, id: data?.id };
}

export async function desfazerAcao(admin: Admin, p: { clientId: string; id: string; userId: string }) {
  if (!tokenEscritaConfigurado()) return { ok: false, erro: "Token de escrita da Meta não configurado." };
  const { data: a } = await admin.from("anuncios_mudancas").select("*").eq("id", p.id).eq("client_id", p.clientId).maybeSingle();
  if (!a || a.estado !== "aplicada") return { ok: false, erro: "Ação não encontrada ou já desfeita." };
  const antes = a.antes as Estado;
  if (a.tipo === "orcamento") {
    try {
      const limite = podeTrocarOrcamento((antes.orcamentos ?? []).map((o) => o.id), await trocasRecentes(admin, a.campanha_id));
      if (!limite.ok) return { ok: false, erro: limite.motivo };
    } catch (e) { return { ok: false, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) }; }
  }
  try {
    if (a.tipo === "pausar" || a.tipo === "ativar") { if (antes.status) await gravar(a.campanha_id, { status: antes.status === "ACTIVE" ? "ACTIVE" : "PAUSED" }); }
    else for (const o of antes.orcamentos ?? []) await gravar(o.id, { daily_budget: String(o.daily_budget) });
  } catch (e) { return { ok: false, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) }; }
  await admin.from("anuncios_mudancas").update({ estado: "desfeita", desfeito_em: new Date().toISOString(), desfeito_por: p.userId }).eq("id", p.id);
  return { ok: true };
}
