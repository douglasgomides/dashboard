import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CadastroSap, TrackerAutomatico } from "@/components/sap-tracker";
import { LinhaDoTempoSap } from "@/components/sap-plano";
import { TrackerManual } from "@/components/sap-manual";
import { getClinicaSap } from "@/lib/sap-data";
import { useAuth } from "@/hooks/use-auth";
import { VisaoClinica } from "@/components/sap-inicio-clinica";
import { LinhaContadores, useTarefas } from "@/components/sap-tarefas";
import { hojeBrasilia } from "@/lib/status-fonte";
import { somarDias } from "@/lib/sap-metas";

// Sistema de Aquisição · Painel da clínica: só números e linha do tempo (as tarefas ficam em Minhas tarefas).
// O progresso do cronograma sai da mesma conta (contarTarefas) usada em Minhas tarefas e no Cronograma.
export const Route = createFileRoute("/_authenticated/sap/$clientId/painel")({
  component: ProgramaSap,
});

const dm = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function ProgramaSap() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const [completo, setCompleto] = useState(false);
  const { data: clinica } = useQuery({
    queryKey: ["sap-cadastro", clientId],
    queryFn: () => getClinicaSap(clientId),
  });
  const hoje = hojeBrasilia();
  const ontem = somarDias(hoje, -1);
  const temD0 = !!clinica?.d0 && clinica.d0 < hoje;
  const [janela, setJanela] = useState<"d0" | "4s" | "30d">("4s");
  const efetiva = janela === "d0" && !temD0 ? "4s" : janela;
  const start =
    efetiva === "d0"
      ? clinica!.d0!
      : efetiva === "4s"
        ? somarDias(hoje, -28)
        : somarDias(hoje, -30);
  const periodLabel = `${dm(start)} a ${dm(ontem)}`;
  // Clínica: uma tela só (onde estamos, 3 números, próxima reunião, o que fazer). Os números completos ficam a um clique.
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <VisaoClinica clientId={clientId} />
        <ProgressoCronograma clientId={clientId} />
        <button
          type="button"
          onClick={() => setCompleto(!completo)}
          aria-expanded={completo}
          className="text-sm font-semibold underline"
          style={{ color: "var(--accent)" }}
        >
          {completo
            ? "Esconder os números completos"
            : "Ver todos os números do funil"}
        </button>
        {completo && (
          <TrackerAutomatico
            clientId={clientId}
            start={start}
            end={ontem}
            periodLabel={periodLabel}
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <VisaoClinica clientId={clientId} />
      <ProgressoCronograma clientId={clientId} />
      <details
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <summary className="cursor-pointer font-semibold">
          Configuração do programa e linha do tempo
        </summary>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Controles da equipe para ajustar o cadastro e acompanhar os marcos da
          implantação.
        </p>
        <div className="mt-4 space-y-6">
          <CadastroSap clientId={clientId} />
          <LinhaDoTempoSap clientId={clientId} />
        </div>
      </details>
      <details
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <summary className="cursor-pointer font-semibold">
          Conferir números do funil e registros manuais
        </summary>
        <div className="mt-4 space-y-6">
          <div
            className="flex flex-wrap items-center gap-2 text-sm"
            role="group"
            aria-label="Período dos números"
          >
            <span style={{ color: "var(--text-dim)" }}>Período:</span>
            {(
              [
                ["4s", "Últimas 4 semanas"],
                ["30d", "Últimos 30 dias"],
                ...(temD0 ? [["d0", "Desde o D0"]] : []),
              ] as [typeof janela, string][]
            ).map(([id, rot]) => (
              <button
                key={id}
                type="button"
                aria-pressed={efetiva === id}
                onClick={() => setJanela(id)}
                className="min-h-[34px] rounded-full border px-3"
                style={{
                  borderColor: "var(--border)",
                  background:
                    efetiva === id ? "var(--accent-soft)" : "transparent",
                }}
              >
                {rot}
              </button>
            ))}
          </div>
          <TrackerAutomatico
            clientId={clientId}
            start={start}
            end={ontem}
            periodLabel={periodLabel}
          />
          <TrackerManual
            clientId={clientId}
            start={start}
            end={ontem}
            periodLabel={periodLabel}
          />
        </div>
      </details>
    </div>
  );
}

/** Progresso do cronograma (mesma conta de Minhas tarefas e do Cronograma), com atalho para as tarefas. */
function ProgressoCronograma({ clientId }: { clientId: string }) {
  const { lista } = useTarefas(clientId);
  const c = lista[0];
  if (!c || !c.tarefas.length) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <LinhaContadores tarefas={c.tarefas} prefixo="Cronograma:" />
      <Link
        to="/sap/$clientId"
        params={{ clientId }}
        className="text-sm font-semibold underline"
        style={{ color: "var(--accent)" }}
      >
        Ver tarefas →
      </Link>
    </div>
  );
}
