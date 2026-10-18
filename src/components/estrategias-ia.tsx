// Estratégias da IA na aba Campanhas: o agente "growth" (fluxo campanhas_estrategia) cruza o Brand Brain com os dados da
// clínica e propõe estratégias, pacotes e abordagens. Aqui a equipe lê, aprova, acompanha e registra o resultado
// (o resultado volta para o agente na próxima rodada). Nada é enviado, publicado ou anunciado pelo painel.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, ChevronDown, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { iniciarFluxo, rodarAgentes } from "@/lib/agentes-data";
import { BotaoCopiar } from "@/components/botao-copiar";
import { ESTADOS_IDEIA, TIPOS_IDEIA, type EstadoIdeia, type IdeiaCampanha } from "@/lib/campanhas-ia";

const db = supabase as any;
type Ideia = IdeiaCampanha & { id: string; estado: EstadoIdeia; resultado: string | null; criado_em: string };

const FLUXO = { id: "campanhas_estrategia", agente: "growth", nome: "", passos: [],
  objetivo: "Cruzar o Brand Brain com os dados da clínica e propor estratégias de campanha, pacotes e abordagens. Nada é enviado nem publicado: a equipe aprova e executa na aba Campanhas." };
const FIM = ["concluida", "falhou", "cancelada", "pausada", "aguardando_aprovacao"];
const ESFORCO: Record<string, string> = { baixo: "esforço baixo", medio: "esforço médio", alto: "esforço alto" };
const ORDEM: EstadoIdeia[] = ["em_andamento", "aprovada", "proposta", "concluida", "descartada"];

async function lerIdeias(clientId: string): Promise<Ideia[]> {
  const { data, error } = await db.from("campanhas_ideias").select("*").eq("client_id", clientId).order("criado_em", { ascending: false }).limit(80);
  if (error) throw error;
  return (data ?? []) as Ideia[];
}

/** Inicia o fluxo e roda até terminar (cada chamada ao servidor anda alguns passos; duas rodadas de IA levam ~1 min). */
async function gerar(clientId: string, aoAndar: (t: string) => void): Promise<string | null> {
  const id = await iniciarFluxo(clientId, FLUXO);
  for (let i = 0; i < 6; i++) {
    aoAndar(i === 0 ? "Lendo o Brand Brain e os dados da clínica…" : "A IA está montando as estratégias…");
    const r = (await rodarAgentes(id)) as { execucoes?: { id: string; estado: string; erro?: string }[] };
    const e = r.execucoes?.find((x) => x.id === id);
    if (e && FIM.includes(e.estado)) return e.estado === "concluida" ? null : (e.erro ?? `execução ${e.estado}`);
  }
  return "Ainda rodando. Atualize a página em 1 minuto.";
}

function Cartao({ i, podeEditar, onEstado }: { i: Ideia; podeEditar: boolean; onEstado: (estado: EstadoIdeia, resultado?: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const mudar = async (estado: EstadoIdeia) => {
    let resultado: string | undefined;
    if (estado === "concluida") {
      const r = window.prompt("O que aconteceu? (ex.: 14 respostas, 5 agendamentos no CRM)", i.resultado ?? "");
      if (r === null) return;
      resultado = r;
    }
    setSalvando(true);
    try { await onEstado(estado, resultado); } finally { setSalvando(false); }
  };
  return (
    <article className="flex flex-col rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: "3px solid var(--accent)", opacity: i.estado === "descartada" ? 0.55 : 1 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{TIPOS_IDEIA[i.tipo] ?? i.tipo}</span>
        {podeEditar ? (
          <select aria-label="Estado da estratégia" value={i.estado} disabled={salvando} onChange={(e) => mudar(e.target.value as EstadoIdeia)} autoComplete="off" className="min-h-[32px] rounded-md border px-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {(Object.keys(ESTADOS_IDEIA) as EstadoIdeia[]).map((s) => <option key={s} value={s}>{ESTADOS_IDEIA[s]}</option>)}
          </select>
        ) : <span className="text-xs" style={{ color: "var(--muted)" }}>{ESTADOS_IDEIA[i.estado]}</span>}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{i.titulo}</h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{i.porque}</p>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-2)" }}><b>Para quem:</b> {i.publico}</p>
      {i.oferta && <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}><b>{i.tipo === "pacote" ? "O que inclui" : "Proposta"}:</b> {i.oferta}</p>}
      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{i.canal} · {ESFORCO[i.esforco] ?? i.esforco} · {i.prazo_dias} dias · medir por: {i.metrica}</p>
      {i.resultado && <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "var(--surface-2)" }}><b>Resultado:</b> {i.resultado}</p>}
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="mt-2 inline-flex min-h-[36px] items-center gap-1 self-start text-xs font-semibold" style={{ color: "var(--accent)" }}>
        <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} /> {aberto ? "Fechar" : "Evidências, passos e mensagem"}
      </button>
      {aberto && (
        <div className="mt-1 space-y-2 text-sm">
          {i.evidencias.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--ink-2)" }}>{i.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>}
          {i.brain.length > 0 && <p className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}><Brain size={12} aria-hidden /> Brand Brain: {i.brain.map((b) => <code key={b} className="rounded px-1" style={{ background: "var(--surface-2)" }}>{b}</code>)}</p>}
          <ol className="list-decimal space-y-1 pl-5 leading-relaxed" style={{ color: "var(--ink)" }}>{i.passos.map((s) => <li key={s}>{s}</li>)}</ol>
          {i.mensagem && (
            <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Texto pronto (troque o que está entre colchetes e revise antes de usar)</div>
              <p className="mt-1 whitespace-pre-line italic leading-relaxed">{i.mensagem}</p>
              <div className="mt-2"><BotaoCopiar texto={i.mensagem} rotulo="Copiar texto" /></div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function EstrategiasIA({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campanhas-ideias", clientId], queryFn: () => lerIdeias(clientId) });
  const [andamento, setAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  async function pedir() {
    setErro(null);
    try {
      const e = await gerar(clientId, setAndamento);
      if (e) setErro(e);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAndamento(null);
      await qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] });
    }
  }
  async function decidir(id: string, estado: EstadoIdeia, resultado?: string) {
    setErro(null);
    const { error } = await db.rpc("campanha_ideia_decidir", { p_id: id, p_estado: estado, p_resultado: resultado ?? null });
    if (error) setErro(error.message);
    await qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] });
  }

  const todas = [...(q.data ?? [])].sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado));
  const visiveis = verTodas ? todas : todas.filter((i) => i.estado !== "descartada" && i.estado !== "concluida");
  const escondidas = todas.length - visiveis.length;

  return (
    <section aria-labelledby="camp-ia" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="camp-ia" className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 size={16} aria-hidden /> Estratégias da IA, cruzando o Brand Brain com os dados</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>Pacotes e programas de cuidado, captação, anúncios, conteúdo, reativação, retorno, abordagens de atendimento e parcerias. Cada ideia cita o dado e o item do Brain que a sustentam. Sem preço, desconto ou promessa de resultado (CFM); quem executa é a equipe.</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn inline-flex items-center gap-1.5" disabled={!!andamento} onClick={pedir}>
            {andamento ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Wand2 size={14} aria-hidden />} {andamento ? "Gerando…" : todas.length ? "Gerar novas estratégias" : "Gerar estratégias"}
          </button>
        )}
      </div>
      {andamento && <p className="text-xs" style={{ color: "var(--muted)" }} aria-live="polite">{andamento}</p>}
      {erro && <p className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
      {q.isLoading ? null : visiveis.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>{todas.length ? "Nenhuma estratégia aberta." : isAdmin ? "Ainda sem estratégias. Gere as primeiras: o agente lê o Brand Brain aprovado, as conversas, o CRM, o Instagram e os anúncios." : "A equipe Doctor Creator ainda não gerou estratégias para esta clínica."}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visiveis.map((i) => <Cartao key={i.id} i={i} podeEditar={podeEditar} onEstado={(e, r) => decidir(i.id, e, r)} />)}
        </div>
      )}
      {escondidas > 0 && <button type="button" className="text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Esconder concluídas e descartadas" : `Ver ${escondidas} concluída${escondidas === 1 ? "" : "s"} ou descartada${escondidas === 1 ? "" : "s"}`}</button>}
    </section>
  );
}
