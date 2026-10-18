// Copiloto de uma seção de documento (src/lib/copiloto-doc.ts): a IA escreve com os dados da clínica e pergunta o que
// falta, como num chat. "Usar este texto" leva o rascunho para o editor; nada é salvo sem a pessoa clicar em Salvar.
import { useState } from "react";
import { Brain, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Pergunta, RespostaCopiloto, Turno } from "@/lib/copiloto-doc";

type Resp = RespostaCopiloto & { brain_propostos: number };

async function pedir(clientId: string, corpo: Record<string, unknown>): Promise<Resp> {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "sap_redigir", ...corpo }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.erro ?? j?.error ?? `Falhou (${r.status})`);
  return j as Resp;
}

export function CopilotoSecao({ clientId, titulo, dica, textoAtual, usar }: { clientId: string; titulo: string; dica: string; textoAtual: string; usar: (t: string) => void }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [resp, setResp] = useState<Resp | null>(null);
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [livre, setLivre] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aprendidos, setAprendidos] = useState(0);

  async function rodar(novos: Turno[]) {
    setCarregando(true); setErro(null);
    try {
      const r = await pedir(clientId, { titulo, dica, texto_atual: textoAtual, turnos: novos });
      setTurnos([...novos, { papel: "ia", texto: `${r.rascunho}${r.perguntas.length ? `\n\nPerguntas:\n${r.perguntas.map((p, i) => `${i + 1}. ${p.pergunta}`).join("\n")}` : ""}` }]);
      setResp(r); setRespostas({}); setLivre("");
      setAprendidos((n) => n + r.brain_propostos);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }
  function responder() {
    const partes = (resp?.perguntas ?? []).map((p, i) => (respostas[i]?.trim() ? `${p.pergunta} → ${respostas[i].trim()}` : null)).filter(Boolean);
    if (livre.trim()) partes.push(livre.trim());
    if (!partes.length) return;
    rodar([...turnos, { papel: "equipe", texto: partes.join("\n") }]);
  }

  if (!resp && !carregando)
    return (
      <div className="no-print">
        <button type="button" onClick={() => rodar([])} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          <Sparkles size={14} aria-hidden /> Escrever com IA
        </button>
        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>A IA lê os dados da clínica, escreve e pergunta só o que falta.</span>
        {erro && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
      </div>
    );
  return (
    <div className="no-print mt-2 space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}>
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}><Sparkles size={14} aria-hidden /> Copiloto · {titulo}</div>
      {carregando && <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }} aria-live="polite"><Loader2 size={14} className="animate-spin" aria-hidden /> Lendo os dados da clínica e escrevendo…</p>}
      {resp && !carregando && (
        <>
          <p className="whitespace-pre-line rounded-md p-2 text-sm" style={{ background: "var(--surface)" }}>{resp.rascunho}</p>
          {resp.fontes.length > 0 && <p className="text-[11px]" style={{ color: "var(--muted)" }}>Baseado em: {resp.fontes.join(" · ")}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => usar(resp.rascunho)} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>Usar este texto</button>
            <span className="self-center text-xs" style={{ color: "var(--muted)" }}>(vai para o editor; revise e salve)</span>
          </div>
          {resp.perguntas.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Para deixar mais preciso, me responda:</p>
              {resp.perguntas.map((p: Pergunta, i: number) => (
                <div key={p.pergunta} className="rounded-md p-2" style={{ background: "var(--surface)" }}>
                  <p className="text-sm font-medium">{p.pergunta}</p>
                  {p.por_que && <p className="text-[11px]" style={{ color: "var(--muted)" }}>{p.por_que}</p>}
                  {p.opcoes.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.opcoes.map((o) => (
                        <button key={o} type="button" onClick={() => setRespostas({ ...respostas, [i]: o })} className="min-h-[30px] rounded-full border px-2 text-xs" style={{ borderColor: respostas[i] === o ? "var(--accent)" : "var(--border)", color: respostas[i] === o ? "var(--accent)" : "var(--ink-2)" }}>{o}</button>
                      ))}
                    </div>
                  )}
                  <input value={respostas[i] ?? ""} onChange={(e) => setRespostas({ ...respostas, [i]: e.target.value })} placeholder="Ou escreva a resposta" className="mt-1 min-h-[32px] w-full rounded-md border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} autoComplete="off" />
                </div>
              ))}
            </div>
          ) : <p className="text-xs" style={{ color: "var(--muted)" }}>Sem dúvidas pendentes. Se quiser, peça um ajuste abaixo.</p>}
          <div className="flex gap-2">
            <input value={livre} onChange={(e) => setLivre(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") responder(); }} placeholder='Pedir ajuste (ex.: "mais curto", "foque em botox")' className="min-h-[34px] flex-1 rounded-md border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} autoComplete="off" />
            <button type="button" onClick={responder} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}><Send size={14} aria-hidden /> Enviar</button>
          </div>
          {aprendidos > 0 && <p className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}><Brain size={12} aria-hidden /> {aprendidos} fato{aprendidos === 1 ? "" : "s"} novo{aprendidos === 1 ? "" : "s"} das suas respostas foi para o Brand Brain (aprovar em Brand Brain). Os outros documentos e agentes passam a usar.</p>}
        </>
      )}
      {erro && <p className="text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
    </div>
  );
}
