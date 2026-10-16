import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { KpiSap } from "@/lib/sap-auto";

const DESTINO: Record<NonNullable<KpiSap["incompleto"]>["resolver"], { rotulo: string; to: string }> = {
  etapas: { rotulo: "Marcar as etapas do CRM", to: "/sap/$clientId/etapas" },
  rastreamento: { rotulo: "Abrir Rastreamento", to: "/sap/$clientId/rastreamento" },
  crm: { rotulo: "Ver como organizar o CRM", to: "/$clientId/crm-guia" },
};

/** Bloco "Dado incompleto": o que falta e o botão para resolver. Nunca mostra o número errado em destaque. */
export function DadoIncompleto({ inc, clientId, compacto = false }: { inc: NonNullable<KpiSap["incompleto"]>; clientId: string; compacto?: boolean }) {
  const d = DESTINO[inc.resolver];
  return (
    <div className={compacto ? "mt-1" : "mt-1.5"}>
      <div className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--warn)" }}><AlertTriangle size={14} aria-hidden /> Dado incompleto</div>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-dim)" }}>{inc.falta}</p>
      <Link to={d.to as never} params={{ clientId } as never} className="mt-1 inline-block text-xs font-semibold underline" style={{ color: "var(--accent)" }}>{d.rotulo} →</Link>
    </div>
  );
}
