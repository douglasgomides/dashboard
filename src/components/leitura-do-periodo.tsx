import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getAdsDiagnosticoPorObjetivo, getWtsResumo } from "@/lib/client-data";
import { lerPeriodo, type Achado, type RotaAcao, type Tom } from "@/lib/leitura-periodo";
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, Compass, ChevronDown } from "lucide-react";

/**
 * Primeira coisa da Visão geral: a conclusão do período, antes dos números.
 * Responde "foi bom ou ruim?", "por quê?" e "o que eu faço agora?" — os
 * cartões e gráficos abaixo continuam lá para quem quiser conferir.
 *
 * As consultas de anúncio e WhatsApp usam as mesmas chaves do ResumoDoMes, então
 * o React Query reaproveita a resposta em vez de buscar duas vezes.
 */

const COR: Record<Tom | "misto" | "neutro", { fundo: string; borda: string; texto: string }> = {
  bom: { fundo: "color-mix(in srgb, var(--good) 12%, var(--surface))", borda: "var(--good)", texto: "var(--good-text)" },
  ruim: { fundo: "color-mix(in srgb, var(--crit) 10%, var(--surface))", borda: "var(--crit)", texto: "var(--crit)" },
  atencao: { fundo: "var(--warn-bg)", borda: "var(--warn-border)", texto: "var(--text)" },
  misto: { fundo: "var(--warn-bg)", borda: "var(--warn-border)", texto: "var(--text)" },
  neutro: { fundo: "var(--surface)", borda: "var(--border)", texto: "var(--text-dim)" },
};

const ICONE: Record<Tom, typeof CheckCircle2> = { bom: CheckCircle2, ruim: XCircle, atencao: AlertTriangle };
const ROTULO_VEREDITO = { bom: "Período bom", ruim: "Período fraco", misto: "Período misto", neutro: "Sem conclusão ainda" };

const ROTAS: Record<RotaAcao, "/$clientId/posts" | "/$clientId/anuncios" | "/$clientId/atendimento" | "/$clientId/ideias" | "/$clientId/conteudo"> = {
  posts: "/$clientId/posts",
  anuncios: "/$clientId/anuncios",
  atendimento: "/$clientId/atendimento",
  ideias: "/$clientId/ideias",
  conteudo: "/$clientId/conteudo",
};

function LinhaAchado({ a }: { a: Achado }) {
  const [aberto, setAberto] = useState(false);
  const Icon = ICONE[a.tom];
  const c = COR[a.tom];
  return (
    <li className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start gap-2.5">
        <Icon size={17} aria-hidden className="mt-0.5 shrink-0" style={{ color: a.tom === "atencao" ? "var(--warn)" : c.texto }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug" style={{ color: "var(--text)" }}>
            {a.titulo}
          </p>
          <p className="mt-1 leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {a.porque}
          </p>
          <button
            type="button"
            onClick={() => setAberto(!aberto)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--text-faint)" }}
            aria-expanded={aberto}
          >
            <ChevronDown size={12} style={{ transform: aberto ? "rotate(180deg)" : undefined }} /> números usados
          </button>
          {aberto && (
            <p className="mt-1 text-xs tabular-nums leading-relaxed" style={{ color: "var(--text-faint)" }}>
              {a.base}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function LeituraDoPeriodo({
  clientId,
  start,
  end,
  periodLabel,
  diario,
  diarioAnterior,
  posts,
}: {
  clientId: string;
  start: string;
  end: string;
  periodLabel: string;
  diario: { date: string; reach?: number | null; new_followers?: number | null }[];
  diarioAnterior?: { date: string; reach?: number | null; new_followers?: number | null }[];
  posts: any[] | undefined;
}) {
  const { data: adsDiag } = useQuery({ queryKey: ["ads-diag-objetivo", clientId, start, end], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, end) });
  const { data: wts } = useQuery({ queryKey: ["wts-resumo", clientId, start, end], queryFn: () => getWtsResumo(clientId, start, end) });
  const [verFaltas, setVerFaltas] = useState(false);

  const leitura = useMemo(
    () => lerPeriodo({ diario, diarioAnterior, posts: posts ?? [], adsDiag, wts }),
    [diario, diarioAnterior, posts, adsDiag, wts],
  );

  const cv = COR[leitura.veredito.tom];
  const fortes = leitura.achados.filter((a) => a.tom === "bom");
  const fracos = leitura.achados.filter((a) => a.tom !== "bom");

  return (
    <section className="space-y-4 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      {/* 1. Veredito */}
      <div className="rounded-lg border-l-4 p-4" style={{ background: cv.fundo, borderColor: cv.borda }}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: cv.texto }}>
          <Compass size={14} aria-hidden /> {ROTULO_VEREDITO[leitura.veredito.tom]} · <span className="font-normal normal-case">{periodLabel}</span>
        </div>
        <p className="mt-1.5 text-base font-semibold leading-snug" style={{ color: "var(--text)" }}>
          {leitura.veredito.frase}
        </p>
      </div>

      {/* 2. O que fazer agora */}
      {leitura.acoes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">O que fazer agora</h2>
          <ol className="mt-2 space-y-2">
            {leitura.acoes.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--accent-soft)" }}>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: "var(--accent)", color: "var(--surface)" }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed" style={{ color: "var(--text)" }}>
                  {a.texto}
                </span>
                {a.rota && (
                  <Link
                    to={ROTAS[a.rota]}
                    params={{ clientId }}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
                    style={{ color: "var(--accent)" }}
                  >
                    abrir <ArrowRight size={12} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 3. Por quê */}
      {leitura.achados.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {fracos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold">O que está travando</h2>
              <ul className="mt-2 space-y-2">
                {fracos.map((a) => (
                  <LinhaAchado key={a.id} a={a} />
                ))}
              </ul>
            </div>
          )}
          {fortes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold">O que está funcionando</h2>
              <ul className="mt-2 space-y-2">
                {fortes.map((a) => (
                  <LinhaAchado key={a.id} a={a} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 4. Honestidade: o que não deu para ler */}
      {leitura.semLeitura.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerFaltas(!verFaltas)}
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--text-faint)" }}
            aria-expanded={verFaltas}
          >
            <ChevronDown size={12} style={{ transform: verFaltas ? "rotate(180deg)" : undefined }} />
            {leitura.semLeitura.length} leitura{leitura.semLeitura.length > 1 ? "s" : ""} sem dado suficiente neste período
          </button>
          {verFaltas && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-faint)" }}>
              {leitura.semLeitura.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
