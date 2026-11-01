/**
 * Gerador do SAP: roda um prompt do programa (api/_lib/sap-prompts.ts) com os anexos que a equipe cola na tela.
 * Chamado por api/sync/manual.ts (alvo "sap_prompt"), só admin: os anexos têm transcrição e dados da clínica.
 *
 * - Telefone, e-mail e CPF são mascarados antes de ir para a IA.
 * - Texto que a clínica vai usar: modelo forte. Mesma chave do servidor das outras IAs (OPENAI_API_KEY, ou
 *   ANTHROPIC_API_KEY de reserva); custo e erro ficam em ia_execucoes (finalidade "sap_prompt:<código>").
 * - A saída é rascunho em Markdown. Nada é salvo nem enviado: a equipe revisa pela lista de conferência do próprio prompt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_POR_CODIGO } from "./sap-prompts.js";
import { chamarTextoComReserva, custoEstimadoIA, ErroProvedorIA } from "./ia.js";

const MODELO_OPENAI = process.env.SAP_PROMPT_MODELO || process.env.AGENTES_MODELO_FORTE || "gpt-4.1";
const MODELO_CLAUDE = process.env.SAP_PROMPT_MODELO_CLAUDE || process.env.AGENTES_MODELO_CLAUDE_FORTE || "claude-sonnet-5-5";
const MAX_TOKENS_SAIDA = 16_000;
const MAX_POR_ANEXO = 60_000;
const MAX_TOTAL = 180_000;

export interface PedidoGerar {
  clientId: string;
  codigo: string;
  anexos: Record<string, string>;
  /** Linha que o documento manda enviar (clínica, datas, momento). */
  pedido: string;
}

export interface ResultadoGerar {
  texto: string;
  /** Anexos que vieram salvos na clínica (rótulos), para a tela mostrar de onde saiu cada coisa. */
  usadosSalvos: string[];
  modelo: string;
  custoUsd: number | null;
  faltaram: string[];
}

function mascarar(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
}

export function montarEntrada(codigo: string, anexos: Record<string, string>, pedido: string): { entrada: string; faltaram: string[]; erro?: string } {
  const p = PROMPT_POR_CODIGO.get(codigo);
  if (!p) return { entrada: "", faltaram: [], erro: "Prompt desconhecido" };
  const faltaram = p.entradas.filter((x) => x.obrigatoria && !(anexos[x.id] ?? "").trim()).map((x) => x.rotulo);
  if (faltaram.length) return { entrada: "", faltaram, erro: `Faltam anexos obrigatórios: ${faltaram.join("; ")}` };
  let total = 0;
  const blocos: string[] = [];
  for (const x of p.entradas) {
    const bruto = (anexos[x.id] ?? "").trim();
    if (!bruto) continue;
    const texto = mascarar(bruto).slice(0, MAX_POR_ANEXO);
    total += texto.length;
    if (total > MAX_TOTAL) return { entrada: "", faltaram: [], erro: "Os anexos passam do limite de tamanho. Cole só o que o prompt pede." };
    blocos.push(`=== ANEXO · ${x.rotulo} ===\n${texto}`);
  }
  const ausentes = p.entradas.filter((x) => !(anexos[x.id] ?? "").trim()).map((x) => x.rotulo);
  const nota = ausentes.length ? `\n\nNão anexados: ${ausentes.join("; ")}. Trate como entrada inexistente, como o prompt manda.` : "";
  return { entrada: `${pedido}\n\n${blocos.join("\n\n")}${nota}`, faltaram: ausentes };
}

export async function gerarComPrompt(admin: SupabaseClient<any, any, any>, p: PedidoGerar): Promise<ResultadoGerar> {
  const def = PROMPT_POR_CODIGO.get(p.codigo);
  if (!def) throw new Error("Prompt desconhecido");
  // Anexo não colado na tela vem do que está salvo na clínica (sap_anexos, por slot).
  const anexos = { ...p.anexos };
  const usadosSalvos: string[] = [];
  const faltam = def.entradas.filter((e) => !(anexos[e.id] ?? "").trim());
  if (faltam.length) {
    const { data: cli } = await admin.from("sap_clinicas").select("id").eq("client_id", p.clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cli?.id) {
      const { data: salvos, error } = await admin.from("sap_anexos").select("slot, texto").eq("clinica_id", cli.id).in("slot", faltam.map((e) => e.slot));
      if (error) throw new Error("Não foi possível ler os anexos salvos da clínica");
      const porSlot = new Map((salvos ?? []).map((r: { slot: string; texto: string }) => [r.slot, r.texto]));
      for (const e of faltam) { const t = porSlot.get(e.slot); if (t) { anexos[e.id] = t; usadosSalvos.push(e.rotulo); } }
    }
  }
  const m = montarEntrada(p.codigo, anexos, p.pedido.slice(0, 600));
  if (m.erro) throw new Error(m.erro);
  const t0 = Date.now();
  const finalidade = `sap_prompt:${p.codigo}`;
  let modelo = "";
  let tIn: number | null = null;
  let tOut: number | null = null;
  // Preço pela tabela única de ia.ts; modelo fora da tabela registra custo nulo.
  const custo = () => custoEstimadoIA(modelo, tIn, tOut);
  try {
    // OpenAI primeiro; Anthropic de reserva quando a OpenAI recusa a chave, fica sem crédito, limita, cai ou a rede
    // falha (mesma regra de ia.ts). Tempo esgotado não troca: a função da Vercel não tem tempo para a segunda.
    let texto = "";
    try {
      const r = await chamarTextoComReserva({
        sistema: def.sistema,
        entrada: m.entrada,
        maxTokens: MAX_TOKENS_SAIDA,
        modeloOpenAI: MODELO_OPENAI,
        modeloClaude: MODELO_CLAUDE,
        timeoutMs: 270_000,
        jsonObject: false,
        reservaNoTempoEsgotado: false,
      });
      ({ texto, modelo, tIn, tOut } = r);
    } catch (e) {
      modelo = (e as { modelo?: string })?.modelo ?? modelo;
      if (e instanceof ErroProvedorIA && e.provedor === "openai" && (e.status === 401 || e.status === 403) && !process.env.ANTHROPIC_API_KEY) {
        throw new Error("A chave de IA do servidor (OPENAI_API_KEY na Vercel do Hub) foi recusada. Troque por uma chave válida e refaça o deploy. " + e.message.slice(0, 80));
      }
      throw e;
    }
    if (!texto.trim()) throw new Error("A IA devolveu resposta vazia");
    const c = custo();
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: null, finalidade, modelo, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: c, ok: true, ms: Date.now() - t0 });
    return { texto, modelo, custoUsd: c, faltaram: m.faltaram, usadosSalvos };
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: null, finalidade, modelo: modelo || null, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: custo(), ok: false, erro, ms: Date.now() - t0 });
    throw e;
  }
}
