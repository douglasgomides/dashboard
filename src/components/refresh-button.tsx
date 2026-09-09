import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Botão "Atualizar dados" + quando os dados foram atualizados pela última vez.
//
// O segundo é tão importante quanto o primeiro: a reclamação que originou
// isso ("fica preso só até o dia 14 de agosto") só virou reclamação porque
// não havia nada na tela dizendo de quando era o dado. Um dashboard que não
// mostra a própria data de corte faz todo mundo desconfiar dele.

async function getLastSyncedAt(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("instagram_posts")
    .select("metrics_updated_at")
    .eq("client_id", clientId)
    .not("metrics_updated_at", "is", null)
    .order("metrics_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.metrics_updated_at ?? null;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

export function RefreshButton({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: lastSyncedAt } = useQuery({
    queryKey: ["last-synced-at", clientId],
    queryFn: () => getLastSyncedAt(clientId),
  });

  async function handleRefresh() {
    setRunning(true);
    setError(null);
    try {
      // O endpoint autoriza pelo usuário logado, não por segredo de máquina —
      // por isso mandamos o access token da sessão do Supabase.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada — entre de novo");

      const res = await fetch("/api/sync/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_id: clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(body?.error ?? `Falhou (${res.status})`);
      }
      // 207 = sincronizou, mas alguma conta deu erro. Mostrar em vez de
      // fingir sucesso — senão o usuário aperta de novo achando que travou.
      if (res.status === 207 && Array.isArray(body?.errors) && body.errors.length > 0) {
        setError(`Atualizado com ressalvas: ${body.errors[0]}`);
      }
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={running}
        className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {running ? "Atualizando…" : "Atualizar dados"}
      </button>
      <span className="text-[11px]" style={{ color: error ? "var(--danger)" : "var(--text-faint)" }}>
        {error
          ? error
          : lastSyncedAt
            ? `Dados de ${formatRelative(lastSyncedAt)}`
            : "Sem sync registrado"}
      </span>
    </div>
  );
}
