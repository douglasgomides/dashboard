import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_FONTE_AO_VIVO, resumirAoVivo, type FonteAoVivo, type LinhaAoVivo } from "@/lib/conferencia-ao-vivo";

// Resumo da conferência ao vivo (Nexo x CRM de origem): % de métricas dentro da tolerância por cliente e fonte, na
// última rodada. A rodada é disparada pelo servidor (api/sync/manual?conferencia_ao_vivo=1, com o segredo do agendamento).

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

async function lerAoVivo() {
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [{ data, error }, { data: cs }] = await Promise.all([
    (supabase as any).from("conferencia_ao_vivo").select("client_id, fonte, metrica, ok, rodado_em").gte("rodado_em", desde).order("rodado_em", { ascending: false }).limit(3000),
    supabase.from("clients").select("id, name"),
  ]);
  // Sem a tabela (migração ainda não aplicada) a tela segue sem o bloco.
  if (error) return null;
  return { resumo: resumirAoVivo((data ?? []) as LinhaAoVivo[]), nomes: new Map<string, string>((cs ?? []).map((c) => [c.id, c.name])) };
}

function cor(p: number | null) {
  if (p == null) return "var(--muted)";
  if (p >= 90) return "var(--good)";
  if (p >= 70) return "var(--warn)";
  return "var(--crit)";
}

export function ConferenciaAoVivoResumo() {
  const q = useQuery({ queryKey: ["conferencia-ao-vivo"], queryFn: lerAoVivo, staleTime: 60_000 });
  if (q.isLoading) return <div className="h-16 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} aria-busy="true" />;
  if (!q.data) return null;
  const { resumo, nomes } = q.data;
  const ultima = resumo.reduce<string | null>((m, r) => (!m || r.rodadoEm > m ? r.rodadoEm : m), null);
  const conferidas = resumo.reduce((s, r) => s + r.conferidas, 0);
  const ok = resumo.reduce((s, r) => s + r.ok, 0);
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }} aria-label="Conferência ao vivo com os CRMs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold"><Radar size={16} aria-hidden /> Conferência ao vivo com os CRMs</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {ultima ? `Última rodada: ${quando(ultima)} · ${conferidas ? Math.round((ok / conferidas) * 100) : 0}% das métricas dentro da tolerância` : "Nenhuma rodada nos últimos 14 dias"}
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
        O Nexo contra a API do Kommo, FlwChat/WTS, Digisac e RD Station, lida na hora (só leitura): abertos agora, criados, ganhos e perdidos nos 30 dias fechados, atendimentos e uma amostra de 20 registros.
      </p>
      {resumo.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm empilha">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Fonte</th>
                <th className="px-3 py-2">Dentro da tolerância</th>
                <th className="px-3 py-2">Rodada</th>
              </tr>
            </thead>
            <tbody>
              {resumo
                .slice()
                .sort((a, b) => (a.pctOk ?? -1) - (b.pctOk ?? -1) || (nomes.get(a.clientId) ?? "").localeCompare(nomes.get(b.clientId) ?? ""))
                .map((r) => (
                  <tr key={`${r.clientId}|${r.fonte}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2" data-label="Cliente">{nomes.get(r.clientId) ?? "Cliente"}</td>
                    <td className="px-3 py-2" data-label="Fonte">{ROTULO_FONTE_AO_VIVO[r.fonte as FonteAoVivo] ?? r.fonte}</td>
                    <td className="px-3 py-2 tabular-nums" data-label="Dentro da tolerância">
                      <b style={{ color: cor(r.pctOk) }}>{r.pctOk == null ? "não lida" : `${r.pctOk}%`}</b>
                      <span className="text-xs" style={{ color: "var(--muted)" }}> · {r.ok} de {r.conferidas}{r.naoLidas ? ` · ${r.naoLidas} não lida${r.naoLidas === 1 ? "" : "s"}` : ""}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums" data-label="Rodada" style={{ color: "var(--ink-2)" }}>{quando(r.rodadoEm)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
