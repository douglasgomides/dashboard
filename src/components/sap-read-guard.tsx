import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { notifyManager, useQueryClient, type Query } from "@tanstack/react-query";

const belongsToSap = (query: Query) => query.isActive() && typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("sap-") && query.queryKey[0] !== "sap-pref";

/** Telas operacionais legadas não podem transformar falha de leitura em
 * checklist vazio ou formulário novo. Mantém os rascunhos montados para retry. */
export function SapReadGuard({ children }: { children: ReactNode }) {
  const client = useQueryClient(), cache = client.getQueryCache();
  // A mesma notificação em lote usada pelo React Query: um observer pode entrar
  // no cache antes de terminar a própria inscrição e iniciar a leitura.
  const subscribe = useCallback((listener: () => void) => cache.subscribe(notifyManager.batchCalls(listener)), [cache]);
  const snapshot = useCallback(() => cache.findAll({ predicate: belongsToSap }).filter((q) => q.state.status !== "success")
    .map((q) => `${q.queryHash}:${q.state.status}:${q.state.fetchStatus}`).sort().join("|"), [cache]);
  const state = useSyncExternalStore(subscribe, snapshot, () => "");
  const failed = cache.findAll({ predicate: (q) => belongsToSap(q) && q.state.status === "error" });
  const pending = !!state && !failed.length;
  return <>
    {failed.length > 0 && <section role="alert" className="card"><h2>Não foi possível conferir os dados desta tela</h2><p>O histórico e os registros existentes precisam ser carregados antes de continuar. Nenhum item foi considerado vazio ou pendente por causa desta falha.</p><button type="button" className="btn" disabled={failed.some((q) => q.state.fetchStatus === "fetching")} onClick={() => void client.refetchQueries({ type: "active", predicate: (q) => belongsToSap(q) && q.state.status === "error" })}>Tentar carregar os dados novamente</button></section>}
    {pending && <p role="status" aria-busy="true">Conferindo os registros desta tela…</p>}
    <div hidden={!!state} inert={!!state}>{children}</div>
  </>;
}
