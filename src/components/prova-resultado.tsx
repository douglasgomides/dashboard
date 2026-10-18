// "O que mudou": prova de resultado por clínica (src/lib/prova-resultado.ts, função prova_resultado). Últimas 4 semanas
// completas contra as 4 anteriores e a série semanal. Tudo do dado que entra sozinho (conversas, leitura da IA, anúncios).
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compararPeriodos, direcao, duracaoCurta, type Bloco, type Direcao, type SemanaProva } from "@/lib/prova-resultado";

const db = supabase as any;
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const brl = (x: number | null) => (x == null ? "—" : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const COR: Record<Direcao, string> = { melhor: "var(--ok, var(--accent))", pior: "var(--crit)", igual: "var(--muted)", sem_dado: "var(--muted)" };
const SETA: Record<Direcao, string> = { melhor: "melhorou", pior: "piorou", igual: "estável", sem_dado: "" };

function Indicador({ rotulo, atual, anterior, fmt, menorMelhor, ajuda }: { rotulo: string; atual: number | null; anterior: number | null; fmt: (x: number | null) => string; menorMelhor?: boolean; ajuda: string }) {
  const d = direcao(atual, anterior, menorMelhor);
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }} title={ajuda}>
      <div className="text-[11px]" style={{ color: "var(--muted)" }}>{rotulo}</div>
      <div className="text-lg font-semibold tabular-nums">{fmt(atual)}</div>
      <div className="text-[11px] tabular-nums" style={{ color: COR[d] }}>{anterior != null ? `antes: ${fmt(anterior)}${SETA[d] ? ` · ${SETA[d]}` : ""}` : "sem período anterior ainda"}</div>
    </div>
  );
}

export function ProvaResultado({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["prova-resultado", clientId],
    queryFn: async () => {
      const { data, error } = await db.rpc("prova_resultado", { p_client_id: clientId, p_semanas: 12 });
      if (error) throw error;
      return ((data ?? []) as SemanaProva[]).map((s) => ({ ...s, conversas: Number(s.conversas), comerciais: Number(s.comerciais), agendou: Number(s.agendou), respondidas: Number(s.respondidas), resp_5min: Number(s.resp_5min), investimento: Number(s.investimento), resposta_mediana_s: s.resposta_mediana_s == null ? null : Number(s.resposta_mediana_s) }));
    },
  });
  const linhas = q.data ?? [];
  if (q.isLoading || !linhas.length) return null;
  const { atual, anterior } = compararPeriodos(linhas, new Date().toISOString());
  const temAnterior = anterior.semanas > 0;
  const a: Bloco = atual, b: Bloco | null = temAnterior ? anterior : null;
  return (
    <section aria-labelledby="prova" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div>
        <h3 id="prova" className="flex items-center gap-1.5 text-sm font-semibold"><TrendingUp size={16} aria-hidden style={{ color: "var(--accent)" }} /> O que mudou: últimas {a.semanas} semanas{b ? ` contra as ${b.semanas} anteriores` : ""}</h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>Medido sozinho, das conversas do WhatsApp, da leitura da IA e dos anúncios. É o número que mostra se o trabalho da equipe e dos agentes está funcionando.{!b ? ` O histórico de conversas começa em ${new Date(linhas[0].semana + "T12:00:00").toLocaleDateString("pt-BR")}: este é o ponto de partida.` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador rotulo="Tempo até a 1ª resposta" atual={a.resposta_s} anterior={b?.resposta_s ?? null} fmt={duracaoCurta} menorMelhor ajuda="Mediana do tempo entre a primeira mensagem do paciente e a primeira resposta da clínica." />
        <Indicador rotulo="Respondidas em até 5 min" atual={a.em5} anterior={b?.em5 ?? null} fmt={pct} ajuda="Das conversas respondidas, quantas tiveram resposta em até 5 minutos." />
        <Indicador rotulo="Agendaram (das conversas de venda)" atual={a.taxa} anterior={b?.taxa ?? null} fmt={pct} ajuda="Das conversas que a IA classificou como comerciais, quantas terminaram em agendamento." />
        <Indicador rotulo="Investimento por agendamento" atual={a.custo_agendamento} anterior={b?.custo_agendamento ?? null} fmt={brl} menorMelhor ajuda="Investimento em anúncios no período dividido pelos agendamentos lidos nas conversas." />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs tabular-nums">
          <thead style={{ color: "var(--muted)" }}><tr className="text-left"><th className="py-1 pr-2">Semana</th><th className="pr-2">Conversas</th><th className="pr-2">De venda</th><th className="pr-2">Agendaram</th><th className="pr-2">1ª resposta</th><th className="pr-2">Até 5 min</th><th className="pr-2">Investimento</th></tr></thead>
          <tbody>{linhas.slice(-8).map((s) => (
            <tr key={s.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1 pr-2">{new Date(s.semana + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</td>
              <td className="pr-2">{s.conversas}</td><td className="pr-2">{s.comerciais}</td><td className="pr-2">{s.agendou}</td>
              <td className="pr-2">{duracaoCurta(s.resposta_mediana_s)}</td><td className="pr-2">{s.respondidas ? `${Math.round((100 * s.resp_5min) / s.respondidas)}%` : "—"}</td>
              <td className="pr-2">{s.investimento ? brl(s.investimento) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
