import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SeloStatus } from "@/components/source-health";
import { statusDoGeral, type StatusGeral } from "@/lib/status-fonte";

// Short.io na Saúde das fontes (admin): é da conta inteira, sem cliente, então não entra na tabela por cliente.
// Antes a falha só aparecia na resposta do sync; agora fica em sync_status_geral e aparece aqui com as mesmas cores.

function quando(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "nunca";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function SaudeShortio() {
  const q = useQuery({
    queryKey: ["sync-status-geral", "shortio"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sync_status_geral")
        .select("last_attempt_at, last_success_at, last_error, last_rows")
        .eq("fonte", "shortio")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StatusGeral | null;
    },
    staleTime: 60_000,
    retry: false,
  });
  if (q.isLoading) return null;
  if (q.isError) {
    return (
      <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
        Links do short.gy: não deu para ler o status agora. Tente de novo em instantes.
      </p>
    );
  }
  const linha = q.data;
  const st = statusDoGeral(linha);
  return (
    <div className="mb-3 rounded-xl border p-3 text-sm" style={{ borderColor: st.cor === "vermelho" ? "var(--crit)" : "var(--border)", background: "var(--surface)" }} aria-label="Status do Short.io">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SeloStatus st={st} texto={`Links do short.gy (Short.io): ${st.rotulo.toLowerCase()}`} />
        <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {linha
            ? `Última tentativa ${quando(linha.last_attempt_at)} · último sucesso ${quando(linha.last_success_at)}${linha.last_rows != null ? ` · ${linha.last_rows} links` : ""}`
            : "Ainda sem nenhuma atualização registrada (a chave do Short.io pode não estar configurada)."}
        </span>
      </div>
      {linha?.last_error && (
        <div className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
          A última atualização falhou; os cliques dos links ficam parados até a próxima dar certo. É com a equipe Doctor Creator.{" "}
          <code className="break-all" title={linha.last_error}>{linha.last_error.replace(/\s+/g, " ").slice(0, 120)}</code>
        </div>
      )}
    </div>
  );
}
