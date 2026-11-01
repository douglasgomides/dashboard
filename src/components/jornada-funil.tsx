import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, Plug, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel } from "@/components/visual";
import { AVISO_JORNADA_PESSOAS, montarFunil, type EtapaFunil, type FunilBanco } from "@/lib/jornada-funil";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { formatRangeLabel } from "@/lib/date-range";
import { useDiagnosticoComercial } from "@/components/comercial-diagnostico";
import { fmtFracao } from "@/lib/metricas";
import { AVISO_MUDANCA_FUNIL, fmtNdeM } from "@/lib/funil-taxa";

// Funil de 7 etapas do período. Etapa sem dado mostra o que falta (integração, dado e onde resolver),
// nunca um zero que parece resultado.

async function lerFunil(clientId: string, de: string, ate: string): Promise<FunilBanco | null> {
  const { data, error } = await (supabase as any).rpc("jornada_funil", { p_client: clientId, p_de: de, p_ate: ate });
  if (error) {
    if (error.code === "PGRST202" || /jornada_funil/.test(error.message ?? "")) return null;
    throw error;
  }
  return (data as FunilBanco | null) ?? null;
}

const COR: Record<EtapaFunil["estado"], string> = { medido: "var(--accent)", zero: "var(--warn)", parcial: "var(--warn)", sem_integracao: "var(--muted)" };
const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (t: number) => fmtFracao(t);
const NOME: Record<string, string> = { alcance: "alcance", engajamento: "engajamento", comentario: "comentário", conversa: "conversa", lead: "lead", agendamento: "agendamento", venda: "venda" };

function LinhaEtapa({ e, largura }: { e: EtapaFunil; largura: number }) {
  const sem = e.valor == null;
  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)", borderStyle: e.estado === "sem_integracao" ? "dashed" : "solid" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--muted)" }}>{e.n}</span>
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{e.nome}</span>
        </div>
        <div className="text-right">
          {sem ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
              <Plug size={13} aria-hidden /> {e.estado === "sem_integracao" ? "Sem integração" : "Não medido"}
            </span>
          ) : (
            <span className="text-lg font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
              {fmt(e.valor!)} <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>{e.unidade}</span>
            </span>
          )}
        </div>
      </div>
      {!sem && (
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }} aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, largura * 100)}%`, background: COR[e.estado] }} />
        </div>
      )}
      {e.explicacao && <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>{e.explicacao}</p>}
      {e.falta && (
        <dl className="mt-2 grid gap-1 rounded-md p-2 text-xs sm:grid-cols-3" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>Integração que falta</dt><dd>{e.falta.integracao}</dd></div>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>Dado necessário</dt><dd>{e.falta.dado}</dd></div>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>Onde resolver</dt><dd>{e.falta.onde}</dd></div>
        </dl>
      )}
    </li>
  );
}

function Passagem({ e }: { e: EtapaFunil }) {
  if (e.semPassagem)
    return (
      <div className="flex items-center gap-1.5 py-1 pl-4 text-xs" style={{ color: "var(--muted)" }}>
        <ArrowDown size={12} aria-hidden /> {e.semPassagem}
      </div>
    );
  if (e.taxa == null && !e.fracao) return <div className="h-3" aria-hidden />;
  return (
    <div className="flex items-center gap-1.5 py-1 pl-4 text-xs" style={{ color: "var(--muted)" }}>
      <ArrowDown size={12} aria-hidden />{" "}
      {e.taxa != null ? `${pct(e.taxa)} passam para ${NOME[e.id] ?? e.id}` : `${fmtNdeM(e.fracao!)} passam para ${NOME[e.id] ?? e.id} (poucos casos para %)`}
    </div>
  );
}

export function JornadaFunil({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const q = useQuery({ queryKey: ["jornada-funil", clientId, start, end], queryFn: () => lerFunil(clientId, start, end), staleTime: 5 * 60_000, retry: false });
  const diagnostico = useDiagnosticoComercial(clientId, start, end);
  // Pessoas novas e agendados com a regra da tela Pacientes do período (mesma consulta em cache). Se ela falhar, as
  // etapas mostram os cards do CRM, com esse nome.
  const pacientes = usePacientesPeriodo(clientId, start, end);
  const pac = pacientes.isError ? null : pacientes.data;
  const funil = q.data !== undefined && pac !== undefined ? montarFunil(q.data, diagnostico.data?.dados.escopo === "periodo" ? diagnostico.data.funil : null, pac) : null;
  const compartilhado = pac?.crm_compartilhado_com ?? [];
  // Barras em escala log: alcance (centenas de milhares) e venda (unidades) no mesmo eixo.
  const maxLog = funil ? Math.max(1, ...funil.etapas.map((e) => (e.valor ? Math.log10(e.valor + 1) : 0))) : 1;
  const semNada = funil && funil.medidas === 0;

  return (
    <Painel icone={Workflow} titulo="Funil do período: do alcance à venda" resumo={`7 etapas · ${formatRangeLabel({ start, end })}`}>
      {(q.isLoading || (pacientes.isLoading && !pacientes.isError)) && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg" style={{ background: "var(--surface-2)" }} />)}
        </div>
      )}
      {q.error && (
        <p className="flex items-start gap-2 text-sm" style={{ color: "var(--crit)" }}>
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" /> Não consegui montar o funil agora. Tente de novo em instantes.
        </p>
      )}
      {funil && (
        <>
          <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
            {semNada
              ? "Nenhuma etapa pode ser medida ainda: cada uma abaixo diz qual integração falta e qual dado seria necessário."
              : `${funil.medidas} de 7 etapas com dado. A porcentagem entre etapas só aparece quando as duas são medidas e a etapa de base tem casos suficientes. O funil não é uma fila única: lead de formulário, por exemplo, não passa pelo WhatsApp.`}
            {funil.maiorQueda && ` Maior queda no comercial: de ${NOME[funil.maiorQueda.de]} para ${NOME[funil.maiorQueda.para]} (${pct(funil.maiorQueda.taxa)} passam).`}
            {funil.receita > 0 && ` Receita registrada: ${funil.receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.`}
          </p>
          {compartilhado.length > 0 && (
            <p className="mb-3 text-sm font-medium" style={{ color: "var(--warn)" }}>
              O CRM desta clínica é o mesmo de {compartilhado.join(", ")}. Os números do CRM abaixo são da conta inteira, não só deste médico.
            </p>
          )}
          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>{AVISO_MUDANCA_FUNIL}</p>
          {pac && <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>{AVISO_JORNADA_PESSOAS}</p>}
          <ol className="space-y-0">
            {funil.etapas.map((e) => (
              <div key={e.id}>
                {e.n > 1 && <Passagem e={e} />}
                <LinhaEtapa e={e} largura={e.valor ? Math.log10(e.valor + 1) / maxLog : 0} />
              </div>
            ))}
          </ol>
        </>
      )}
    </Painel>
  );
}
