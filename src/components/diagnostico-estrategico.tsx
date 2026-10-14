import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronRight, ClipboardList, Compass, Database, Info, Megaphone, ShieldAlert, Sparkles, Target } from "lucide-react";
import { getAdsDiagnosticoPorObjetivo } from "@/lib/client-data";
import { usePautas } from "@/components/planejador-conteudo";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { grauDeCautela, montarDiagnostico, type IdDiag, type RespostaDiag } from "@/lib/diagnostico-estrategico";
import { ROTULO_FORMATO } from "@/lib/pauta";
import type { Resultado } from "@/lib/resultado";

// Diagnóstico estratégico do período: oito respostas curtas, só com dado disponível.
// Resposta limitada vem marcada com o motivo; sem base, diz o que falta.

const ICONE: Record<IdDiag, typeof Target> = {
  melhorou: ArrowUpRight,
  piorou: ArrowDownRight,
  oportunidade: Sparkles,
  risco: ShieldAlert,
  proxima: Target,
  pauta: ClipboardList,
  campanha: Megaphone,
  faltante: Database,
};
const COR: Record<IdDiag, string> = {
  melhorou: "var(--good)",
  piorou: "var(--crit)",
  oportunidade: "var(--good)",
  risco: "var(--warn)",
  proxima: "var(--accent)",
  pauta: "var(--accent)",
  campanha: "var(--warn)",
  faltante: "var(--muted)",
};

function Cartao({ r, clientId }: { r: RespostaDiag; clientId: string }) {
  const Icon = ICONE[r.id];
  const rota = !r.rota || !r.rota.startsWith("/") ? null : r.rota.startsWith("/$clientId") ? r.rota : `/$clientId${r.rota}`;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: COR[r.id] }}>
        <Icon size={14} aria-hidden /> {r.pergunta}
      </div>
      {r.resposta ? (
        <p className="mt-1 text-sm font-medium leading-snug" style={{ color: "var(--ink)" }}>{r.resposta}</p>
      ) : (
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--ink-2)" }}>Sem base para responder.</p>
      )}
      {r.evidencia && r.resposta && <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>{r.evidencia}</p>}
      {r.limitada && r.motivoLimite && (
        <p className="mt-1.5 flex items-start gap-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          <Info size={12} aria-hidden className="mt-0.5 shrink-0" /> {r.resposta ? "Conclusão limitada: " : ""}{r.motivoLimite}
        </p>
      )}
      {rota && r.resposta && (
        <Link to={rota as any} params={{ clientId } as any} className="mt-auto inline-flex min-h-[36px] items-center gap-0.5 pt-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
          Abrir <ChevronRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function DiagnosticoEstrategico({
  clientId,
  start,
  fim,
  resultado,
  diario,
  diarioAnterior,
  posts,
}: {
  clientId: string;
  start: string;
  fim: string;
  resultado: Resultado | null;
  diario: any[];
  diarioAnterior?: any[];
  posts: any[];
}) {
  // Mesma chave do useResultado: a leitura de anúncios já está em cache.
  const ads = useQuery({ queryKey: ["ads-diag-objetivo", clientId, start, fim], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, fim), retry: false, staleTime: 5 * 60_000 });
  const pautas = usePautas(clientId);
  const qualidade = useQualidadeDados(clientId);

  const respostas = useMemo(() => {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const p = (pautas.q.data?.pautas ?? [])
      .filter((x) => (x.status === "escolhida" || x.status === "nova") && (!x.dia || x.dia >= hoje))
      .sort((a, b) => (a.dia ?? "9999").localeCompare(b.dia ?? "9999"))[0];
    return montarDiagnostico({
      resultado,
      diario,
      diarioAnterior,
      posts,
      ads: ads.data ?? null,
      pautaPlanejada: p ? { titulo: p.titulo, formato: ROTULO_FORMATO[p.formato], dia: p.dia } : null,
      problemasAltos: (qualidade.data ?? []).filter((q) => q.severidade === "alta").map((q) => ({ titulo: q.titulo, correcao: q.correcao })),
    });
  }, [resultado, diario, diarioAnterior, posts, ads.data, pautas.q.data, qualidade.data]);
  const cautela = grauDeCautela(respostas);

  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }} aria-labelledby="diag-estrategico">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="diag-estrategico" className="flex items-center gap-1.5 text-[18px] font-semibold">
          <Compass size={18} aria-hidden /> Diagnóstico estratégico
        </h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {cautela.semBase + cautela.limitadas === 0 ? "Todas as respostas com base suficiente" : `${cautela.limitadas} com ressalva · ${cautela.semBase} sem base`}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        A leitura do período em oito respostas, só com os dados que o painel tem. Quando a conclusão é limitada, o motivo aparece embaixo.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {respostas.map((r) => (
          <Cartao key={r.id} r={r} clientId={clientId} />
        ))}
      </div>
    </section>
  );
}
