/**
 * Classificação de conteúdo com IA: tema, etapa do funil (C0 a C3) e estágio da metodologia de cada post.
 *
 * Existe porque o tema só era preenchido por regras de palavra-chave escritas à mão para 4 contas
 * (tema-classifier.ts); nas outras 12 a tela "Posts por pilar/tema" ficava em "0 de N" e a tela de Ideias
 * caía em "Tema livre". Funil e estágio nunca foram preenchidos automaticamente.
 *
 * Regras:
 * - Só roda quando há chave no servidor: OPENAI_API_KEY (GPT, modelo padrão gpt-4o-mini) ou, se não houver,
 *   ANTHROPIC_API_KEY (Claude Haiku). Sem nenhuma das duas, não faz nada e diz isso.
 * - Nunca sobrescreve o que a equipe já classificou: só preenche campo vazio.
 * - Posts mais recentes primeiro, com teto por rodada (custo e tempo da função).
 * - Reaproveita os temas que a conta já tem, para o vocabulário não se espalhar em sinônimos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

// CLASSIFICADOR_MODELO troca o modelo sem mexer no código.
const MODELO_OPENAI = process.env.CLASSIFICADOR_MODELO || "gpt-4o-mini";
const MODELO_CLAUDE = process.env.CLASSIFICADOR_MODELO || "claude-haiku-4-5-20251001";
const FUNIS = new Set(["C0", "C1", "C2", "C3"]);
const ESTAGIOS = new Set(["percepcao", "confianca", "venda", "multiplicacao"]);
const LOTE = 20;

const SISTEMA = `Você classifica legendas de posts de Instagram de um médico, em português do Brasil.
Para cada post devolva:
- tema: 2 a 4 palavras, substantivo, sem emoji (ex.: "Sintomas da menopausa", "Queda de cabelo"). Reuse um dos TEMAS EXISTENTES quando servir; só crie tema novo se nenhum servir.
- funil: C0 (a pessoa não sabe que tem o problema), C1 (reconhece o problema), C2 (compara soluções e tratamentos), C3 (pronta para decidir ou agendar).
- estagio: percepcao (atrair atenção e educar), confianca (autoridade, bastidores, caso, prova), venda (chamada direta para agendar ou comprar), multiplicacao (pede compartilhar, indicar ou marcar alguém).
Se a legenda estiver vazia ou não der para classificar com segurança, use null no campo.
Responda SOMENTE um JSON no formato {"posts":[{"id":"...","tema":"...","funil":"C1","estagio":"percepcao"}]}, com um item por post recebido.`;

type Linha = { id: string; caption: string | null; tema: string | null; funnel_stage: string | null; methodology_stage: string | null };
type Saida = { id: string; tema?: string | null; funil?: string | null; estagio?: string | null };

export interface ResultadoIA {
  count: number;
  errors: string[];
  pulado?: string;
}

function limparTema(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const s = t.replace(/[\p{Extended_Pictographic}]/gu, "").replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 60) return null;
  // O modelo às vezes escreve a palavra "null" em vez de deixar vazio.
  if (/^(null|none|nan|n\/a|nenhum|nenhuma|sem tema|indefinido|desconhecido|-+)$/i.test(s)) return null;
  return s;
}

// A resposta pode vir como {"posts":[...]} (modo JSON da OpenAI) ou como lista solta; aceita os dois.
function lerLista(texto: string): Saida[] {
  const iObj = texto.indexOf("{");
  const iArr = texto.indexOf("[");
  const inicio = iObj >= 0 && (iArr < 0 || iObj < iArr) ? iObj : iArr;
  if (inicio < 0) throw new Error("resposta sem JSON");
  const fim = Math.max(texto.lastIndexOf("}"), texto.lastIndexOf("]"));
  const bruto = JSON.parse(texto.slice(inicio, fim + 1));
  const lista = Array.isArray(bruto) ? bruto : (bruto?.posts ?? Object.values(bruto ?? {}).find((v) => Array.isArray(v)));
  if (!Array.isArray(lista)) throw new Error("resposta sem lista de posts");
  return lista as Saida[];
}

async function chamarOpenAI(chave: string, usuario: string, ms: number): Promise<Saida[]> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
    signal: AbortSignal.timeout(ms),
    body: JSON.stringify({
      model: MODELO_OPENAI,
      response_format: { type: "json_object" },
      max_completion_tokens: 2500,
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: usuario },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return lerLista(j.choices?.[0]?.message?.content ?? "");
}

async function chamarClaude(chave: string, usuario: string, ms: number): Promise<Saida[]> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ model: MODELO_CLAUDE, max_tokens: 2500, system: SISTEMA, messages: [{ role: "user", content: usuario }] }),
  });
  if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { content?: { text?: string }[] };
  return lerLista((j.content ?? []).map((b) => b.text ?? "").join(""));
}

export async function classificarConteudoComIA(
  supabase: SupabaseClient<Database>,
  accountId: string,
  opts: { maxPosts?: number; orcamentoMs?: number } = {},
): Promise<ResultadoIA> {
  const chaveOpenAI = process.env.OPENAI_API_KEY;
  const chaveClaude = process.env.ANTHROPIC_API_KEY;
  if (!chaveOpenAI && !chaveClaude) return { count: 0, errors: [], pulado: "OPENAI_API_KEY (ou ANTHROPIC_API_KEY) não configurada: classificação por IA desligada" };
  const maxPosts = opts.maxPosts ?? 160;
  const limite = Date.now() + (opts.orcamentoMs ?? 40_000);

  const { data: pendentes, error } = await supabase
    .from("instagram_posts")
    .select("id, caption, tema, funnel_stage, methodology_stage")
    .eq("instagram_account_id", accountId)
    .or("tema.is.null,funnel_stage.is.null,methodology_stage.is.null")
    .not("caption", "is", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(maxPosts);
  if (error) return { count: 0, errors: [`conteudo-ia select: ${error.message}`] };
  const linhas = (pendentes ?? []) as Linha[];
  if (linhas.length === 0) return { count: 0, errors: [] };

  // Vocabulário que a conta já usa (tema), mais frequente primeiro.
  const { data: usados } = await supabase.from("instagram_posts").select("tema").eq("instagram_account_id", accountId).not("tema", "is", null).limit(2000);
  const freq = new Map<string, number>();
  for (const u of usados ?? []) if (u.tema) freq.set(u.tema, (freq.get(u.tema) ?? 0) + 1);
  const vocabulario = new Set(Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t]) => t));

  const errors: string[] = [];
  let count = 0;
  // Resposta lenta da IA não é falha da sincronização: o que ficou sem classificar entra na próxima rodada.
  let atrasou = false;
  // Até 3 lotes ao mesmo tempo: o tempo da função é curto e cada resposta leva alguns segundos.
  const CONCORRENCIA = 3;
  const lotes: Linha[][] = [];
  for (let i = 0; i < linhas.length; i += LOTE) lotes.push(linhas.slice(i, i + LOTE));
  for (let g = 0; g < lotes.length; g += CONCORRENCIA) {
    const restante = limite - Date.now();
    if (restante < 8000) break;
    const grupo = lotes.slice(g, g + CONCORRENCIA);
    const respostas = await Promise.all(
      grupo.map(async (lote) => {
        const usuario =
          `TEMAS EXISTENTES: ${vocabulario.size ? Array.from(vocabulario).join("; ") : "(nenhum ainda)"}\n\nPOSTS:\n` +
          lote.map((p) => JSON.stringify({ id: p.id, legenda: (p.caption ?? "").replace(/\s+/g, " ").slice(0, 600) })).join("\n");
        try {
          const ms = Math.min(restante - 1000, 30_000);
          const saida = chaveOpenAI ? await chamarOpenAI(chaveOpenAI, usuario, ms) : await chamarClaude(chaveClaude as string, usuario, ms);
          return { lote, saida };
        } catch (e) {
          if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
            atrasou = true;
            return { lote, saida: [] as Saida[] };
          }
          errors.push(`conteudo-ia: ${e instanceof Error ? e.message : String(e)}`);
          return { lote, saida: [] as Saida[] };
        }
      }),
    );
    for (const { lote, saida } of respostas) {
      const porId = new Map(lote.map((p) => [p.id, p]));
      for (const s of saida) {
        const p = porId.get(s.id);
        if (!p) continue;
        const patch: Partial<Database["public"]["Tables"]["instagram_posts"]["Update"]> = {};
        const tema = limparTema(s.tema);
        if (!p.tema && tema) {
          patch.tema = tema;
          vocabulario.add(tema);
        }
        if (!p.funnel_stage && s.funil && FUNIS.has(s.funil)) patch.funnel_stage = s.funil as never;
        if (!p.methodology_stage && s.estagio && ESTAGIOS.has(s.estagio)) patch.methodology_stage = s.estagio as never;
        if (Object.keys(patch).length === 0) continue;
        const { error: upErr } = await supabase.from("instagram_posts").update(patch).eq("id", p.id);
        if (upErr) errors.push(`conteudo-ia update: ${upErr.message}`);
        else count++;
      }
    }
    if (errors.length > 0 || atrasou) break;
  }
  return { count, errors, pulado: atrasou ? "a IA demorou para responder; o que faltou classificar entra na próxima atualização" : undefined };
}
