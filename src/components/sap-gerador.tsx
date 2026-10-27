// SAP · Gerador: roda os prompts do programa (05.13 anúncios e criativos, 03.05 diagnóstico, 06.10 conversa, 07.08 venda,
// 08.08 fidelização e 09.04 call) dentro do Hub. A equipe cola os anexos que o prompt pede; a IA devolve um RASCUNHO em
// Markdown para revisar pela lista de conferência do próprio prompt. Nada é salvo nem enviado para a clínica.
// O texto dos prompts fica em api/_lib/sap-prompts.ts (servidor); aqui só o catálogo da tela.
import { useState } from "react";
import { Check, Copy, Download, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DOC } from "@/lib/sap-docs";
import { PROMPTS_TELA, type PromptTela } from "@/lib/sap-prompts-tela";
import { Painel } from "@/components/visual";

type Resposta = { texto: string; modelo: string; custoUsd: number | null; faltaram: string[] };

async function gerar(clientId: string, codigo: string, anexos: Record<string, string>, pedido: string): Promise<Resposta> {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify({ client_id: clientId, alvo: "sap_prompt", codigo, anexos, pedido }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.erro ?? j?.error ?? `Falhou (${r.status})`);
  return j as Resposta;
}

export function GeradorSap({ clientId, clinica }: { clientId: string; clinica: string }) {
  const [codigo, setCodigo] = useState(PROMPTS_TELA[0].codigo);
  const p: PromptTela = PROMPTS_TELA.find((x) => x.codigo === codigo) ?? PROMPTS_TELA[0];
  const [anexos, setAnexos] = useState<Record<string, string>>({});
  const [pedidos, setPedidos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [copiado, setCopiado] = useState(false);

  const pedido = pedidos[codigo] ?? p.pedido.replace("[clínica]", clinica || "[clínica]");
  const faltando = p.entradas.filter((e) => e.obrigatoria && !(anexos[`${codigo}:${e.id}`] ?? "").trim());
  const doc = DOC.get(codigo);

  async function rodar() {
    setCarregando(true); setErro(null); setResp(null);
    try {
      const so: Record<string, string> = {};
      for (const e of p.entradas) { const v = anexos[`${codigo}:${e.id}`]; if (v?.trim()) so[e.id] = v; }
      setResp(await gerar(clientId, codigo, so, pedido));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }
  async function copiar() {
    if (!resp) return;
    try { await navigator.clipboard.writeText(resp.texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão: o texto continua na tela */ }
  }
  function baixar() {
    if (!resp) return;
    const url = URL.createObjectURL(new Blob([resp.texto], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sap-${codigo}-${(clinica || "clinica").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Painel icone={Sparkles} titulo="Gerador dos prompts do programa" resumo="Escolha o prompt, cole os anexos que ele pede e gere o rascunho. Revise pela lista de conferência no fim do texto antes de usar com a clínica.">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Prompts do programa">
          {PROMPTS_TELA.map((x) => (
            <button key={x.codigo} type="button" role="tab" aria-selected={x.codigo === codigo} onClick={() => { setCodigo(x.codigo); setResp(null); setErro(null); }}
              className="min-h-[38px] rounded-lg border px-3 text-sm font-medium"
              style={{ borderColor: x.codigo === codigo ? "var(--accent)" : "var(--border)", color: x.codigo === codigo ? "var(--accent)" : "var(--text)" }}>
              {x.codigo} · {x.nome}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-sm" style={{ color: "var(--text-dim)" }}>
          <p><strong>Sai:</strong> {p.saida}</p>
          <p><strong>Quando:</strong> {p.quando}</p>
          {doc?.url && <p><a href={doc.url} target="_blank" rel="noreferrer" className="underline">Abrir o documento {codigo} no Drive</a></p>}
        </div>
      </Painel>

      <Painel icone={Sparkles} titulo="Anexos" resumo="Cole o texto de cada documento. Telefone, e-mail e CPF são mascarados antes de ir para a IA, mas troque o nome de paciente por [paciente].">
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Pedido</span>
            <input value={pedido} onChange={(e) => setPedidos((o) => ({ ...o, [codigo]: e.target.value }))} maxLength={600}
              className="w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
            <span className="mt-1 block text-xs" style={{ color: "var(--text-dim)" }}>Troque os colchetes pelas datas, o momento e o serviço, como o documento pede.</span>
          </label>
          {p.entradas.map((e) => {
            const k = `${codigo}:${e.id}`;
            return (
              <label key={k} className="block text-sm">
                <span className="mb-1 block font-medium">{e.rotulo}{e.obrigatoria ? " *" : ""}</span>
                <textarea value={anexos[k] ?? ""} onChange={(ev) => setAnexos((o) => ({ ...o, [k]: ev.target.value }))} rows={4} maxLength={60000}
                  className="w-full rounded-lg border px-3 py-2 font-mono text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                <span className="mt-1 block text-xs" style={{ color: "var(--text-dim)" }}>{e.dica}</span>
              </label>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={rodar} disabled={carregando || faltando.length > 0}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}>
              {carregando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {carregando ? "Gerando, pode levar até 3 minutos…" : "Gerar rascunho"}
            </button>
            {faltando.length > 0 && <span className="text-xs" style={{ color: "var(--text-dim)" }}>Falta colar: {faltando.map((f) => f.rotulo).join("; ")}</span>}
          </div>
          {erro && <p role="alert" className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
        </div>
      </Painel>

      {resp && (
        <Painel icone={Check} titulo="Rascunho" resumo={`Gerado por ${resp.modelo}${resp.custoUsd != null ? ` · custo estimado US$ ${resp.custoUsd.toFixed(2)}` : ""}. É rascunho: a revisão humana vem antes de qualquer uso.`}>
          {resp.faltaram.length > 0 && <p className="mb-2 text-xs" style={{ color: "var(--warn)" }}>Não anexados: {resp.faltaram.join("; ")}.</p>}
          <div className="no-print mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={copiar} className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
              {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Copiado" : "Copiar"}
            </button>
            <button type="button" onClick={baixar} className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <Download size={14} /> Baixar .md
            </button>
          </div>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>{resp.texto}</pre>
        </Painel>
      )}
    </div>
  );
}
