/**
 * Copiloto dos documentos do SAP (regras em src/lib/copiloto-doc.ts). Lê tudo o que o sistema sabe da clínica, escreve
 * o rascunho da seção e faz as perguntas que faltam; o que a equipe responde vira fato proposto no Brand Brain
 * (fonte "equipe"), que todos os agentes passam a usar depois de aprovado. Nada é salvo no documento sem a pessoa clicar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIAJson } from "./ia.js";
import { lerFontesBrain } from "./agentes.js";
import { FONTES } from "../../src/lib/brand-brain.js";
import { conversaParaTexto, sistemaCopiloto, validarCopiloto, type RespostaCopiloto, type Turno } from "../../src/lib/copiloto-doc.js";

type Admin = SupabaseClient<any, any, any>;
const corta = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function contextoCliente(admin: Admin, clientId: string): Promise<{ texto: string; chaves: Set<string> }> {
  const desde = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const leads = () => admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("client_id", clientId).is("removido_na_origem", null);
  const [f, licoes, l90, g90, ganhos] = await Promise.all([
    lerFontesBrain(admin, clientId, { exigirModulo: false }),
    admin.from("agentes_aprendizados").select("texto, sinal").eq("client_id", clientId).eq("estado", "ativo").limit(20),
    leads().gte("occurred_at", desde(90)),
    leads().eq("outcome", "won").gte("occurred_at", desde(90)),
    admin.from("crm_leads").select("source, price").eq("client_id", clientId).eq("outcome", "won").is("removido_na_origem", null).gte("occurred_at", desde(180)).limit(3000),
  ]);
  const blocos: string[] = [];
  for (const [k, v] of Object.entries(f.fontes)) if (v) blocos.push(`### ${FONTES[k as keyof typeof FONTES] ?? k}\n${v}`);
  if (f.aprovados.length) blocos.push(`### Brand Brain aprovado\n${f.aprovados.map((a) => `- ${a}`).join("\n")}`);
  const gs = (ganhos.data ?? []) as { source: string | null; price: number | null }[];
  const comPreco = gs.map((g) => Number(g.price ?? 0)).filter((x) => x > 0).sort((a, b) => a - b);
  const fontesVenda = new Map<string, number>();
  for (const g of gs) { const k = corta(g.source, 40) || "sem fonte"; fontesVenda.set(k, (fontesVenda.get(k) ?? 0) + 1); }
  if ((l90.count ?? 0) || gs.length) blocos.push(`### CRM\nLeads em 90 dias: ${l90.count ?? 0}; vendas ganhas em 90 dias: ${g90.count ?? 0}; vendas em 180 dias: ${gs.length}${comPreco.length ? `; valor mediano por venda: R$ ${Math.round(comPreco[Math.floor(comPreco.length / 2)])}` : ""}.\nFonte das vendas: ${[...fontesVenda.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join("; ") || "sem registro"}.`);
  const ls = (licoes.data ?? []) as { texto: string; sinal: string }[];
  if (ls.length) blocos.push(`### O que os dados já ensinaram (lições automáticas)\n${ls.map((l) => `- ${l.sinal === "faz" ? "FAZ" : "EVITA"}: ${l.texto}`).join("\n")}`);
  return { texto: blocos.join("\n\n").slice(0, 22_000), chaves: new Set(f.aprovados.map((a) => a.split(":")[0])) };
}

export async function redigirSecao(admin: Admin, p: { clientId: string; titulo: string; dica: string; textoAtual: string; turnos: Turno[] }): Promise<RespostaCopiloto & { brain_propostos: number }> {
  const ctx = await contextoCliente(admin, p.clientId);
  const entrada = [
    `### Contexto da clínica\n${ctx.texto || "(pouco dado ainda)"}`,
    p.textoAtual && `### Texto atual da seção (melhore em vez de começar do zero)\n${corta(p.textoAtual, 3000)}`,
    p.turnos.length && `### Conversa com a equipe até agora (a última resposta da equipe vale mais que os dados)\n${conversaParaTexto(p.turnos)}`,
  ].filter(Boolean).join("\n\n");
  const r = await chamarIAJson(admin, { sistema: sistemaCopiloto(p.titulo, p.dica), entrada: entrada.slice(0, 20_000), finalidade: "copiloto_documento", clientId: p.clientId, maxTokens: 2500, qualidade: "forte" });
  const v = validarCopiloto(r.json, ctx.chaves);
  if (!v) throw new Error("A IA não devolveu um rascunho válido. Tente de novo.");
  let brain_propostos = 0;
  if (v.aprendidos.length && p.turnos.some((t) => t.papel === "equipe")) {
    const { data, error } = await admin.rpc("brain_propor", { p_client_id: p.clientId, p_itens: v.aprendidos.map((a) => ({ ...a, fonte: "equipe", fonte_detalhe: `copiloto do documento: ${corta(p.titulo, 80)}`, confianca: "alta" })) });
    if (!error) brain_propostos = Number(data ?? 0);
  }
  return { ...v, brain_propostos };
}
