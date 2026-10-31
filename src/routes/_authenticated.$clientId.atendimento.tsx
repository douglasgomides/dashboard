import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Carregando, ResumoExecutivo } from "@/components/sem-fonte";
import { useQuery } from "@tanstack/react-query";
import { LEGENDA } from "@/components/grafico";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import {
  getWtsResumo,
  getWtsPorDepartamento,
  getWtsPorAgente,
  getWtsVolumeDiario,
  getWtsFilaDoCliente,
} from "@/lib/client-data";
import { avisoContaCompartilhada, avisoFilaEsquecida, avisoLote } from "@/lib/fila-whatsapp";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import { CustoWhatsapp } from "@/components/custo-whatsapp";
import { ConversasWhatsapp } from "@/components/conversas-whatsapp";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { RecuperarHoje } from "@/components/agentes-ia";

// Atendimento no WhatsApp: uma tela só com duas abas. "Números" (volume, espera, equipe) e, para a equipe,
// "Conversas e auditoria" (cada conversa com a leitura e a auditoria comercial), que antes era /conversas.
export const Route = createFileRoute("/_authenticated/$clientId/atendimento")({
  validateSearch: (s: Record<string, unknown>): { aba?: "numeros" | "conversas"; conversa?: string } => ({
    aba: s.aba === "conversas" ? "conversas" : undefined,
    conversa: typeof s.conversa === "string" ? s.conversa : undefined,
  }),
  component: AtendimentoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

// Tempo de espera vai de segundos a horas na mesma tabela. Segundo cru é
// ilegível e minuto arredondado esconde a diferença entre 40s e 4min.
function dur(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.trunc(seg));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function AtendimentoPage() {
  const { clientId } = Route.useParams();
  const { aba, conversa } = Route.useSearch();
  const { isAdmin } = useAuth();
  const { podeEditar } = useClientRole(clientId);
  const navigate = Route.useNavigate();
  const atual = aba === "conversas" && isAdmin ? "conversas" : "numeros";
  const ir = (a: "numeros" | "conversas") => navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, aba: a === "conversas" ? "conversas" : undefined, conversa: undefined }) as never });
  return (
    <div className="space-y-4">
      <RecuperarHoje clientId={clientId} podeEditar={podeEditar} />
      {isAdmin && (
        <div className="flex gap-1 rounded-lg border p-1 text-sm" role="tablist" aria-label="Atendimento no WhatsApp" style={{ borderColor: "var(--border)", width: "fit-content", background: "var(--surface)" }}>
          {([["numeros", "Números do atendimento"], ["conversas", "Conversas e auditoria"]] as const).map(([id, rot]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={atual === id}
              onClick={() => ir(id)}
              className="min-h-[36px] rounded-md px-3 font-medium"
              style={{ background: atual === id ? "var(--accent-soft)" : "transparent", color: atual === id ? "var(--text)" : "var(--text-dim)" }}
            >
              {rot}
            </button>
          ))}
        </div>
      )}
      {atual === "conversas" ? <ConversasWhatsapp clientId={clientId} conversaInicial={conversa} /> : <NumerosWhatsapp clientId={clientId} />}
    </div>
  );
}

function NumerosWhatsapp({ clientId }: { clientId: string }) {
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const resumoQ = useQuery({
    queryKey: ["wts-resumo", clientId, start, end],
    queryFn: () => getWtsResumo(clientId, start, end),
  });
  const { data: porDepartamento, isLoading: loadingDep } = useQuery({
    queryKey: ["wts-departamento", clientId, start, end],
    queryFn: () => getWtsPorDepartamento(clientId, start, end),
  });
  const { data: porAgente, isLoading: loadingAgente } = useQuery({
    queryKey: ["wts-agente", clientId, start, end],
    queryFn: () => getWtsPorAgente(clientId, start, end),
  });
  const { data: volumeDiario, isLoading: loadingDia } = useQuery({
    queryKey: ["wts-dia", clientId, start, end],
    queryFn: () => getWtsVolumeDiario(clientId, start, end),
  });
  // Abertas agora, lote de encerramento e conta compartilhada, com o dado deste cliente. Sem a RPC: null.
  const { data: fila } = useQuery({
    queryKey: ["wts-fila", clientId, start, end],
    queryFn: () => getWtsFilaDoCliente(clientId, start, end),
    retry: false,
  });

  const { data: resumo, isLoading: loadingResumo } = resumoQ;
  const isLoading = loadingResumo || loadingDep || loadingAgente || loadingDia;
  const atendimentos = n(resumo?.atendimentos);

  if (isLoading) {
    return <Carregando texto="Lendo o atendimento…" />;
  }

  if (resumoQ.isError) return <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">Não foi possível carregar os números do atendimento</h2><p className="text-sm">A fonte está indisponível. Isso não significa que não houve atendimentos.</p><button type="button" className="ws-action ws-action--secondary" disabled={resumoQ.isFetching} onClick={() => void resumoQ.refetch()}>Tentar novamente</button></div>;

  if (!resumo || atendimentos === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="atendimento" />
        </div>
        <p style={{ color: "var(--text-dim)" }}>
          Nenhum atendimento no período ({periodLabel}). Se a conta da WTS acabou de ser ligada, use o botão acima.
        </p>
      </div>
    );
  }

  const semRoteamento = n(resumo?.sem_roteamento);
  const fatiaSemRoteamento = atendimentos > 0 ? (semRoteamento / atendimentos) * 100 : 0;
  const coberturaEspera = n(resumo?.espera_cobertura);

  const serie = (volumeDiario ?? []).map((r) => ({
    dia: String(r.dia).slice(5),
    atendimentos: n(r.atendimentos),
    espera: nOrNull(r.espera_mediana_seg) === null ? null : Math.round(n(r.espera_mediana_seg) / 60),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Atendimento no WhatsApp · {periodLabel}
        </p>
        <SyncButton clientId={clientId} alvo="atendimento" />
      </div>

      <ResumoExecutivo
        tom={(nOrNull(resumo?.espera_mediana_seg) ?? 0) > 3600 || fatiaSemRoteamento > 40 ? "atencao" : "bom"}
        frases={[
          `${fmtNum(atendimentos)} atendimentos de ${fmtNum(n(resumo?.contatos_distintos))} pessoas no período.`,
          nOrNull(resumo?.espera_mediana_seg) == null
            ? "Sem dado de espera até a 1ª resposta neste período."
            : `Na metade dos atendimentos, a 1ª resposta veio em até ${dur(nOrNull(resumo?.espera_mediana_seg))}${(nOrNull(resumo?.espera_mediana_seg) ?? 0) > 3600 ? ": acima de 1 hora. Resposta demorada pode fazer o paciente procurar outra clínica." : "."}`,
          fatiaSemRoteamento > 40 ? `${fatiaSemRoteamento.toFixed(0)}% das conversas não foram para nenhuma equipe: organizar o roteamento é o primeiro ajuste.` : "",
        ]}
      />

      <CustoWhatsapp clientId={clientId} />

      {/* Conta do WTS ligada a mais de um cliente: o aviso sai do cadastro, não de texto fixo. */}
      {fila && avisoContaCompartilhada(fila) && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          {avisoContaCompartilhada(fila)}
        </div>
      )}
      {fila && avisoFilaEsquecida(fila) && (
        <div role="note" className="rounded-xl border p-4 text-sm" style={{ background: "var(--surface-2)", borderColor: "var(--warn)" }}>
          <strong>Fila esquecida:</strong> {avisoFilaEsquecida(fila)}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Atendimentos" value={fmtNum(atendimentos)} hint={`${fmtNum(n(resumo?.contatos_distintos))} pessoas diferentes`} />
        <KpiCard
          label="Espera até a 1ª resposta"
          value={dur(nOrNull(resumo?.espera_mediana_seg))}
          hint={`mediana de ${fmtNum(coberturaEspera)} atendimentos com o dado`}
        />
        <KpiCard
          label="Tempo até fechar"
          value={dur(nOrNull(resumo?.atendimento_mediano_seg))}
          hint="quando a conversa é encerrada, não é tempo de atendimento"
        />
        {fila ? (
          <KpiCard
            label="Abertas nos últimos 7 dias"
            value={fmtNum(fila.abertas7d)}
            hint={fila.abertasAntigas > 0 ? `mais ${fmtNum(fila.abertasAntigas)} abertas há mais de 7 dias (fila esquecida)` : "nenhuma conversa esquecida aberta"}
          />
        ) : (
          <KpiCard
            label="Ainda abertas"
            value={fmtNum(n(resumo?.em_andamento))}
            hint={`das iniciadas no período, inclusive as esquecidas; ${fmtNum(n(resumo?.concluidos))} concluídas`}
          />
        )}
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold">Sem roteamento</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold" style={{ color: fatiaSemRoteamento > 40 ? "var(--warn)" : "var(--text)" }}>
            {fatiaSemRoteamento.toFixed(0)}%
          </span>
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>
            {fmtNum(semRoteamento)} de {fmtNum(atendimentos)} atendimentos caíram em “Geral”
          </span>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
          Conversa que não foi para nenhuma equipe. É o número que precisa cair — e enquanto ele for alto, nenhum
          recorte por médica ou por especialidade vai ser confiável.
        </p>
      </div>

      {/* O timeService da WTS é relógio de parede entre abrir e encerrar. Quando muitos encerramentos saem em lote
          (calculado por cliente em wts_fila_do_cliente), o número descreve a arrumação da fila, não o atendimento. */}
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        <strong style={{ color: "var(--text)" }}>Sobre o “tempo até fechar”:</strong> ele mede o intervalo entre
        abrir e encerrar a conversa, não o tempo de conversa.{" "}
        {fila && avisoLote(fila) ? `${avisoLote(fila)} Por isso o número descreve o hábito de arrumar a fila, não o atendimento. ` : ""}
        A métrica que vale olhar aqui é a{" "}
        <strong style={{ color: "var(--text)" }}>espera até a 1ª resposta</strong>.
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Volume por dia e espera até a 1ª resposta</div>
        <div className="grafico-caixa" style={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--text-dim)" }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--text-dim)" }} width={40} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text-dim)" }} unit="min" width={52} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v, name) =>
                  name === "espera"
                    ? [v === null || v === undefined ? "—" : `${Number(v)} min`, "Espera (mediana)"]
                    : [fmtNum(Number(v)), "Atendimentos"]
                }
              />
              <Legend {...LEGENDA} />
              <Bar yAxisId="left" dataKey="atendimentos" name="Atendimentos" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="espera" name="espera" stroke="var(--warn)" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Por equipe</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm empilha">
            <thead>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="py-2 text-left font-medium">Equipe</th>
                <th className="py-2 text-right font-medium">Atendimentos</th>
                <th className="py-2 text-right font-medium">Fatia</th>
                <th className="py-2 text-right font-medium">Espera</th>
                <th className="py-2 text-right font-medium">Até fechar</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {(porDepartamento ?? []).map((r) => (
                <tr key={r.departamento} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td data-label="Equipe" className="py-2">{r.departamento}</td>
                  <td data-label="Atendimentos" className="py-2 text-right">{fmtNum(n(r.atendimentos))}</td>
                  <td data-label="Fatia" className="py-2 text-right">{nOrNull(r.fatia) === null ? "—" : `${n(r.fatia).toFixed(1)}%`}</td>
                  <td data-label="Espera" className="py-2 text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td data-label="Até fechar" className="py-2 text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Por atendente</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm empilha">
            <thead>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="py-2 text-left font-medium">Atendente</th>
                <th className="py-2 text-right font-medium">Atendimentos</th>
                <th className="py-2 text-right font-medium">Concluídos</th>
                <th className="py-2 text-right font-medium">Espera</th>
                <th className="py-2 text-right font-medium">Até fechar</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {(porAgente ?? []).map((r) => (
                <tr key={r.agente} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td data-label="Atendente" className="py-2">{r.agente}</td>
                  <td data-label="Atendimentos" className="py-2 text-right">{fmtNum(n(r.atendimentos))}</td>
                  <td data-label="Concluídos" className="py-2 text-right">{fmtNum(n(r.concluidos))}</td>
                  <td data-label="Espera" className="py-2 text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td data-label="Até fechar" className="py-2 text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
