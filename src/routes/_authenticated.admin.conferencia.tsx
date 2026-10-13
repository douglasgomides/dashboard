import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/admin/conferencia")({
  component: ConferenciaPage,
});

type Gravidade = "alta" | "media" | "baixa";
interface Achado {
  id: string;
  gravidade: Gravidade;
  tipo: string;
  cliente: string | null;
  titulo: string;
  detalhe: string;
  acao: string;
}
interface Resultado {
  gerado_em: string;
  achados: Achado[];
  contas_vistas_na_meta: number;
  tokens_testados: number;
}

const COR: Record<Gravidade, string> = { alta: "var(--crit)", media: "var(--warn)", baixa: "var(--text-dim)" };
const ROTULO: Record<Gravidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

async function conferir(): Promise<Resultado> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ alvo: "conferencia" }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || !corpo?.ok) throw new Error(corpo?.error ?? corpo?.erro ?? `Falha ${r.status}`);
  return corpo as Resultado;
}

function ConferenciaPage() {
  const [filtro, setFiltro] = useState<Gravidade | "todas">("todas");
  const m = useMutation({ mutationFn: conferir });
  const achados = m.data?.achados ?? [];
  const visiveis = achados.filter((a) => filtro === "todas" || a.gravidade === filtro);
  const contagem = (g: Gravidade) => achados.filter((a) => a.gravidade === g).length;

  return (
    <div>
      <div className="hpagehead">
        <h2>Conferência de dados</h2>
        <p className="note" style={{ margin: 0 }}>
          Procura o que a Meta mostra e o dashboard não: conta de anúncios com gasto e sem cliente, a mesma conta em dois clientes, sync que diz
          "sucesso" com o dado parado e cliente sem alguma fonte ligada. Só leitura.
        </p>
        <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}{" "}
            {m.data ? "Conferir de novo" : "Rodar conferência"}
          </button>
          {m.isPending && <span className="note">Consultando a Meta, leva alguns segundos…</span>}
        </div>
      </div>

      {m.error && (
        <div className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--crit)" }}>
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{m.error instanceof Error ? m.error.message : "Falha ao conferir."}</span>
        </div>
      )}

      {m.data && (
        <div style={{ marginTop: 16 }}>
          <Painel
            icone={ClipboardCheck}
            titulo={achados.length ? `${achados.length} ponto${achados.length === 1 ? "" : "s"} para olhar` : "Nada encontrado"}
            resumo={`Conferido em ${new Date(m.data.gerado_em).toLocaleString("pt-BR")} · ${m.data.contas_vistas_na_meta} contas de anúncios vistas na Meta`}
          >
            <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
              {(["todas", "alta", "media", "baixa"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFiltro(g)}
                  className="btn"
                  style={{ opacity: filtro === g ? 1 : 0.6, fontWeight: filtro === g ? 600 : 400 }}
                >
                  {g === "todas" ? `Todas (${achados.length})` : `${ROTULO[g]} (${contagem(g)})`}
                </button>
              ))}
            </div>
            {visiveis.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>Nenhum ponto nesse filtro.</p>
            ) : (
              <div className="grid gap-3">
                {visiveis.map((a) => (
                  <div key={a.id} style={{ borderLeft: `3px solid ${COR[a.gravidade]}`, paddingLeft: 12 }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo cor={COR[a.gravidade]} titulo={`Gravidade ${ROTULO[a.gravidade].toLowerCase()}`}>{ROTULO[a.gravidade]}</Selo>
                      {a.cliente && <span className="text-xs" style={{ color: "var(--text-dim)" }}>{a.cliente}</span>}
                    </div>
                    <div className="text-sm font-medium" style={{ marginTop: 4 }}>{a.titulo}</div>
                    <div className="text-xs" style={{ color: "var(--text-dim)", marginTop: 2 }}>{a.detalhe}</div>
                    <div className="text-xs" style={{ marginTop: 4 }}><b>O que fazer:</b> {a.acao}</div>
                  </div>
                ))}
              </div>
            )}
          </Painel>
        </div>
      )}
    </div>
  );
}
