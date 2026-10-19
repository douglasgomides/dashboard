/**
 * Aplica e desfaz ações nos anúncios pela API de Marketing da Meta (regras e travas em src/lib/anuncios-acoes.ts).
 * Só roda com o token META_ADS_WRITE_TOKEN (usuário do sistema com ads_management) e com uma pessoa da equipe
 * aprovando no painel. Orçamento: se a campanha tem orçamento próprio (CBO), muda o da campanha; senão, muda o de cada
 * conjunto ativo com orçamento diário. Antes de mudar, guarda o estado anterior para desfazer.
 *
 * Travas de segurança:
 * - O token vai no header Authorization, nunca na URL (URL costuma ir parar em log).
 * - A ação reserva a campanha no banco antes de falar com a Meta (índice único parcial): dois cliques simultâneos não
 *   passam juntos pela regra de uma mudança a cada 24 h.
 * - Se a ação mexe em vários conjuntos e um falha no meio, os que já mudaram são revertidos.
 * - O desfazer confere se a Meta ainda está como a ação deixou; se alguém mexeu depois, recusa em vez de sobrescrever.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { INTERVALO_H, RESERVA_EXPIRA_MIN, motivoRecusarDesfazer, novoOrcamento, podeAplicar, type EstadoCampanha, type TipoAcao } from "../../src/lib/anuncios-acoes.js";

type Admin = SupabaseClient<any, any, any>;
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_CONJUNTOS = 100;
const token = () => process.env.META_ADS_WRITE_TOKEN || "";
export const tokenEscritaConfigurado = () => !!token();
const cabecalho = () => ({ Authorization: `Bearer ${token()}` });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function ler(caminho: string): Promise<any> {
  const r = await fetch(`${GRAPH}/${caminho}`, { headers: cabecalho(), signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta: ${j?.error?.message ?? r.status}`);
  return j;
}
async function gravar(id: string, campos: Record<string, string>): Promise<void> {
  const r = await fetch(`${GRAPH}/${id}`, { method: "POST", headers: cabecalho(), body: new URLSearchParams(campos), signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(`Meta: ${j?.error?.message ?? r.status}`);
}

interface Alvo { id: string; campos: Record<string, string>; voltar: Record<string, string> }

/** Aplica em ordem. Se um falhar, tenta devolver os que já mudaram ao valor de `voltar` e diz o que aconteceu. */
async function gravarTodos(alvos: Alvo[]): Promise<void> {
  const feitos: Alvo[] = [];
  for (const a of alvos) {
    try { await gravar(a.id, a.campos); feitos.push(a); }
    catch (e) {
      const base = msg(e);
      if (!feitos.length) throw new Error(base);
      const falhas: string[] = [];
      for (const f of [...feitos].reverse()) { try { await gravar(f.id, f.voltar); } catch { falhas.push(f.id); } }
      throw new Error(falhas.length
        ? `${base}. Reversão parcial falhou em ${falhas.join(", ")}; confira na Meta.`
        : `${base}. As mudanças já feitas foram revertidas.`);
    }
  }
}

async function estadoAtual(campanhaId: string): Promise<EstadoCampanha> {
  const c = await ler(`${campanhaId}?fields=status,daily_budget`);
  if (c.daily_budget) return { status: c.status, orcamentos: [{ id: campanhaId, nivel: "campanha", daily_budget: Number(c.daily_budget) }] };
  const a = await ler(`${campanhaId}/adsets?fields=id,status,daily_budget&limit=${MAX_CONJUNTOS}`);
  if (a.paging?.next) throw new Error(`Campanha com mais de ${MAX_CONJUNTOS} conjuntos; não aplico em parte deles. Ajuste direto na Meta.`);
  const orcamentos = ((a.data ?? []) as { id: string; status: string; daily_budget?: string }[])
    .filter((x) => x.status === "ACTIVE" && x.daily_budget).map((x) => ({ id: x.id, nivel: "conjunto" as const, daily_budget: Number(x.daily_budget) }));
  return { status: c.status, orcamentos };
}

const ehConflito = (e: { code?: string } | null | undefined) => e?.code === "23505";

export async function aplicarAcao(admin: Admin, p: { clientId: string; campanhaId: string; tipo: TipoAcao; pct?: number; sugestaoId?: string | null; userId: string }) {
  if (!tokenEscritaConfigurado()) return { ok: false, erro: "Token de escrita da Meta (META_ADS_WRITE_TOKEN) ainda não configurado na Vercel." };
  // A campanha precisa ser deste cliente (evita mexer em conta de outro).
  const { data: camp } = await admin.from("meta_ads_campaigns").select("campaign_id").eq("client_id", p.clientId).eq("campaign_id", p.campanhaId).maybeSingle();
  if (!camp) return { ok: false, erro: "Campanha não pertence a este cliente." };

  // 1) Reserva a campanha. Reservas presas por queda do servidor (mais de 10 min) são encerradas antes.
  const limiteReserva = new Date(Date.now() - RESERVA_EXPIRA_MIN * 60_000).toISOString();
  await admin.from("anuncios_mudancas").update({ estado: "falhou", erro: "Interrompida: o servidor caiu antes de terminar." }).eq("campanha_id", p.campanhaId).eq("estado", "em_andamento").lt("criado_em", limiteReserva);
  const { data: reserva, error: erroReserva } = await admin.from("anuncios_mudancas")
    .insert({ client_id: p.clientId, sugestao_id: p.sugestaoId ?? null, campanha_id: p.campanhaId, tipo: p.tipo, pct: p.pct ?? null, antes: {}, depois: {}, estado: "em_andamento", aprovado_por: p.userId })
    .select("id").single();
  if (ehConflito(erroReserva)) return { ok: false, erro: "Já existe uma ação em andamento nesta campanha. Aguarde alguns segundos e confira o histórico." };
  if (erroReserva || !reserva) return { ok: false, erro: `Não consegui registrar a ação: ${erroReserva?.message ?? "sem resposta do banco"}` };
  const id = reserva.id as string;

  // 2) Regra de uma mudança por campanha a cada 24 h (só conta o que foi de fato aplicado).
  const desde = new Date(Date.now() - INTERVALO_H * 3_600_000).toISOString();
  const { data: hist } = await admin.from("anuncios_mudancas").select("campanha_id, estado, aplicado_em").eq("campanha_id", p.campanhaId).eq("estado", "aplicada").gte("aplicado_em", desde).neq("id", id);
  const pode = podeAplicar(p.campanhaId, (hist ?? []) as { campanha_id: string; estado: string; aplicado_em: string | null }[]);
  if (!pode.ok) {
    await admin.from("anuncios_mudancas").delete().eq("id", id);
    return { ok: false, erro: pode.motivo };
  }

  // 3) Aplica na Meta.
  let antes: EstadoCampanha = { orcamentos: [] };
  let depois: Record<string, unknown> = {};
  try {
    antes = await estadoAtual(p.campanhaId);
    if (p.tipo === "pausar") {
      await gravarTodos([{ id: p.campanhaId, campos: { status: "PAUSED" }, voltar: { status: antes.status === "ACTIVE" ? "ACTIVE" : "PAUSED" } }]);
      depois = { status: "PAUSED" };
    } else if (p.tipo === "ativar") {
      await gravarTodos([{ id: p.campanhaId, campos: { status: "ACTIVE" }, voltar: { status: antes.status === "ACTIVE" ? "ACTIVE" : "PAUSED" } }]);
      depois = { status: "ACTIVE" };
    } else {
      if (!antes.orcamentos.length) throw new Error("Nenhum orçamento diário ativo encontrado (orçamento vitalício ou conjuntos pausados).");
      const novos = antes.orcamentos.map((o) => ({ ...o, daily_budget: novoOrcamento(o.daily_budget, p.pct ?? 0) }));
      await gravarTodos(novos.map((o, i) => ({ id: o.id, campos: { daily_budget: String(o.daily_budget) }, voltar: { daily_budget: String(antes.orcamentos[i].daily_budget) } })));
      depois = { orcamentos: novos };
    }
  } catch (e) {
    await admin.from("anuncios_mudancas").update({ antes, depois, estado: "falhou", erro: msg(e) }).eq("id", id);
    return { ok: false, erro: msg(e) };
  }

  // 4) Fecha o registro. A Meta já mudou: se o banco falhar, tenta de novo e, em último caso, devolve o estado anterior
  // na resposta para a equipe conseguir desfazer à mão.
  const final = { antes, depois, estado: "aplicada", aplicado_em: new Date().toISOString(), erro: null };
  let { error: erroFecho } = await admin.from("anuncios_mudancas").update(final).eq("id", id);
  if (erroFecho) ({ error: erroFecho } = await admin.from("anuncios_mudancas").update(final).eq("id", id));
  if (p.sugestaoId) await admin.from("sugestoes_agentes").update({ estado: "feita", decidido_por: p.userId, decidido_em: new Date().toISOString() }).eq("id", p.sugestaoId);
  if (erroFecho) return { ok: true, id, aviso: `A mudança foi aplicada na Meta, mas o registro não foi salvo. Estado anterior para desfazer à mão: ${JSON.stringify(antes)}` };
  return { ok: true, id };
}

export async function desfazerAcao(admin: Admin, p: { clientId: string; id: string; userId: string }) {
  if (!tokenEscritaConfigurado()) return { ok: false, erro: "Token de escrita da Meta não configurado." };
  const { data: a } = await admin.from("anuncios_mudancas").select("*").eq("id", p.id).eq("client_id", p.clientId).maybeSingle();
  if (!a || a.estado !== "aplicada") return { ok: false, erro: "Ação não encontrada, já desfeita ou em andamento." };

  // Reserva o desfazer (mesmo índice das ações: nada roda duas vezes nem ao mesmo tempo que outra ação da campanha).
  const limite = new Date(Date.now() - RESERVA_EXPIRA_MIN * 60_000).toISOString();
  await admin.from("anuncios_mudancas").update({ estado: "aplicada", desfeito_em: null }).eq("campanha_id", a.campanha_id).eq("estado", "desfazendo").lt("desfeito_em", limite);
  const { data: reservado, error: erroReserva } = await admin.from("anuncios_mudancas")
    .update({ estado: "desfazendo", desfeito_em: new Date().toISOString(), desfeito_por: p.userId }).eq("id", p.id).eq("estado", "aplicada").select("id");
  if (ehConflito(erroReserva)) return { ok: false, erro: "Já existe uma ação em andamento nesta campanha. Aguarde alguns segundos." };
  if (erroReserva) return { ok: false, erro: `Não consegui reservar o desfazer: ${erroReserva.message}` };
  if (!reservado?.length) return { ok: false, erro: "Ação não encontrada, já desfeita ou em andamento." };
  const soltar = () => admin.from("anuncios_mudancas").update({ estado: "aplicada", desfeito_em: null, desfeito_por: null }).eq("id", p.id);

  const antes = (a.antes ?? { orcamentos: [] }) as EstadoCampanha;
  const depois = (a.depois ?? { orcamentos: [] }) as EstadoCampanha;
  try {
    // Só desfaz se a Meta ainda está como a ação deixou.
    const atual: { status?: string; orcamentos: Record<string, number | undefined> } = { orcamentos: {} };
    if (a.tipo === "pausar" || a.tipo === "ativar") atual.status = (await ler(`${a.campanha_id}?fields=status`)).status;
    else for (const o of depois.orcamentos ?? []) { const v = (await ler(`${o.id}?fields=daily_budget`)).daily_budget; atual.orcamentos[o.id] = v === undefined ? undefined : Number(v); }
    const recusa = motivoRecusarDesfazer(a.tipo, depois, atual);
    if (recusa) { await soltar(); return { ok: false, erro: recusa }; }

    if (a.tipo === "pausar" || a.tipo === "ativar") {
      if (antes.status) await gravarTodos([{ id: a.campanha_id, campos: { status: antes.status === "ACTIVE" ? "ACTIVE" : "PAUSED" }, voltar: { status: depois.status ?? "PAUSED" } }]);
    } else {
      const anteriores = antes.orcamentos ?? [];
      const finais = new Map((depois.orcamentos ?? []).map((o) => [o.id, o.daily_budget]));
      await gravarTodos(anteriores.map((o) => ({ id: o.id, campos: { daily_budget: String(o.daily_budget) }, voltar: { daily_budget: String(finais.get(o.id) ?? o.daily_budget) } })));
    }
  } catch (e) { await soltar(); return { ok: false, erro: msg(e) }; }

  await admin.from("anuncios_mudancas").update({ estado: "desfeita", desfeito_em: new Date().toISOString(), desfeito_por: p.userId }).eq("id", p.id);
  return { ok: true };
}
