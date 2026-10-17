import { Link } from "@tanstack/react-router";

// Os dois produtos da Doctor Creator, lado a lado, só para a equipe:
// - Sistema de Aquisição de Pacientes: onde toda clínica NOVA entra (programa de 90 dias).
// - Doctor Creator Hub: acompanhamento contínuo (clientes que já estavam com a DC e quem terminou o D90).
// Mesmo login e mesmos dados: a clínica passa do SAP para o Hub sem copiar nada.
export function TrocaProduto({ atual, clientId }: { atual: "hub" | "sap"; clientId?: string | null }) {
  const item = (p: "hub" | "sap", rot: string) => {
    const on = atual === p;
    const estilo = {
      background: on ? "var(--side-active)" : "transparent",
      color: on ? "#fff" : "var(--side-ink-2, var(--text-dim))",
    };
    const cls = "flex-1 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-tight";
    if (p === "sap") return clientId ? <Link to="/sap/$clientId" params={{ clientId }} className={cls} style={estilo} aria-current={on ? "page" : undefined}>{rot}</Link> : <Link to="/sap" className={cls} style={estilo} aria-current={on ? "page" : undefined}>{rot}</Link>;
    return clientId ? <Link to="/$clientId" params={{ clientId }} className={cls} style={estilo} aria-current={on ? "page" : undefined}>{rot}</Link> : <Link to="/admin" className={cls} style={estilo} aria-current={on ? "page" : undefined}>{rot}</Link>;
  };
  return (
    <div className="so-aberta mb-3 flex gap-1 rounded-lg border p-1" role="navigation" aria-label="Produto" style={{ borderColor: "var(--side-border, var(--border))" }}>
      {item("sap", "Sistema de Aquisição")}
      {item("hub", "Nexo · inteligência")}
    </div>
  );
}
