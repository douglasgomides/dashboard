import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { CadastroSap, TrackerAutomatico } from "@/components/sap-tracker";
import { LinhaDoTempoSap } from "@/components/sap-plano";
import { TrackerManual } from "@/components/sap-manual";

// Sistema de Aquisição · Programa: cadastro (D0), linha do tempo D0–D90 e os 6 números do SAP no período.
export const Route = createFileRoute("/_authenticated/$clientId/sap/")({
  component: ProgramaSap,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function ProgramaSap() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const periodLabel = formatRangeLabel({ start, end });
  return (
    <div className="space-y-6">
      <CadastroSap clientId={clientId} />
      <LinhaDoTempoSap clientId={clientId} />
      <TrackerAutomatico clientId={clientId} start={start} end={end} periodLabel={periodLabel} />
      <TrackerManual clientId={clientId} start={start} end={end} periodLabel={periodLabel} />
    </div>
  );
}
