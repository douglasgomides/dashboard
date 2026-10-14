import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CadastroSap, TrackerAutomatico } from "@/components/sap-tracker";
import { LinhaDoTempoSap } from "@/components/sap-plano";
import { TrackerManual } from "@/components/sap-manual";
import { getClinicaSap } from "@/lib/sap-data";
import { hojeBrasilia } from "@/lib/status-fonte";
import { somarDias } from "@/lib/sap-metas";

// Sistema de Aquisição · Programa: cadastro (D0), linha do tempo D0–D90 e os 6 números do SAP.
export const Route = createFileRoute("/_authenticated/sap/$clientId/")({
  component: ProgramaSap,
});

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function ProgramaSap() {
  const { clientId } = Route.useParams();
  const { data: clinica } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const hoje = hojeBrasilia();
  const ontem = somarDias(hoje, -1);
  const temD0 = !!clinica?.d0 && clinica.d0 < hoje;
  const [janela, setJanela] = useState<"d0" | "4s" | "30d">("4s");
  const efetiva = janela === "d0" && !temD0 ? "4s" : janela;
  const start = efetiva === "d0" ? clinica!.d0! : efetiva === "4s" ? somarDias(hoje, -28) : somarDias(hoje, -30);
  const periodLabel = `${dm(start)} a ${dm(ontem)}`;
  return (
    <div className="space-y-6">
      <CadastroSap clientId={clientId} />
      <LinhaDoTempoSap clientId={clientId} />
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Período dos números">
        <span style={{ color: "var(--text-dim)" }}>Período:</span>
        {([["4s", "Últimas 4 semanas"], ["30d", "Últimos 30 dias"], ...(temD0 ? [["d0", "Desde o D0"]] : [])] as [typeof janela, string][]).map(([id, rot]) => (
          <button
            key={id}
            type="button"
            aria-pressed={efetiva === id}
            onClick={() => setJanela(id)}
            className="min-h-[34px] rounded-full border px-3"
            style={{ borderColor: "var(--border)", background: efetiva === id ? "var(--accent-soft)" : "transparent" }}
          >
            {rot}
          </button>
        ))}
      </div>
      <TrackerAutomatico clientId={clientId} start={start} end={ontem} periodLabel={periodLabel} />
      <TrackerManual clientId={clientId} start={start} end={ontem} periodLabel={periodLabel} />
    </div>
  );
}
