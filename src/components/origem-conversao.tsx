import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

// De onde vem quem agenda: origem pelo texto da 1ª mensagem (link de bio, anúncio, botão com mensagem pré-preenchida,
// cadastrado pela equipe) ou, sem texto cadastrado, a origem que a IA leu na conversa. Ver conversao_por_origem.

export const ROTULO_ORIGEM_CONV: Record<string, string> = {
  anuncio: "Anúncio", link_bio: "Link da bio", instagram: "Instagram (sem link)", google: "Google", site: "Site", indicacao: "Indicação",
  paciente_antigo: "Paciente antigo", outro: "Outro", desconhecida: "Não dá para saber",
};
const OPCOES = ["anuncio", "link_bio", "instagram", "google", "site", "indicacao", "outro"] as const;

type Dados = { total: number; pelo_texto: number; origens: { origem: string; conversas: number; agendaram: number; pct: number }[] };

export function OrigemConversao({ clientId, de, ate }: { clientId: string; de: string; ate: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["conversao-origem", clientId, de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("conversao_por_origem", { p_client: clientId, p_de: de, p_ate: ate });
      if (error) return null;
      return (data ?? null) as Dados | null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const textos = useQuery({
    queryKey: ["textos-entrada", clientId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("textos_entrada_frequentes", { p_client: clientId, p_dias: 60 });
      if (error) return [];
      return (data ?? []) as { inicio: string; conversas: number }[];
    },
    staleTime: 5 * 60_000,
  });
  const d = q.data;
  if (!d || d.total < 5) return null;
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  return (
    <div className="rounded-xl border p-3" style={caixa}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>De onde vem quem agenda</span>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>{d.total} conversas comerciais · {d.pelo_texto} com origem pelo texto de entrada</span>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
            <th className="py-1 font-normal">Origem</th><th className="py-1 text-right font-normal">Conversas</th><th className="py-1 text-right font-normal">Agendaram</th><th className="py-1 text-right font-normal">%</th>
          </tr>
        </thead>
        <tbody>
          {d.origens.map((o) => (
            <tr key={o.origem} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1">{ROTULO_ORIGEM_CONV[o.origem] ?? o.origem}</td>
              <td className="py-1 text-right tabular-nums">{o.conversas}</td>
              <td className="py-1 text-right tabular-nums">{o.agendaram}</td>
              <td className="py-1 text-right tabular-nums">{o.conversas >= 5 ? `${String(o.pct).replace(".", ",")}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        Origem pela mensagem pré-preenchida do link ou anúncio quando cadastrada; senão, o que a IA leu na conversa. Com menos de 5 conversas a % não aparece.
      </p>
      {isAdmin && !!textos.data?.length && (
        <div className="mt-3">
          <p className="text-sm font-medium">Textos de entrada que se repetem e ainda não têm origem</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Quase sempre é a mensagem pronta de um link de bio, botão ou anúncio. Diga de onde vem cada um.</p>
          <ul className="mt-1 space-y-1.5">
            {textos.data.map((t) => <LinhaTexto key={t.inicio} clientId={clientId} inicio={t.inicio} conversas={t.conversas} aoSalvar={() => { qc.invalidateQueries({ queryKey: ["textos-entrada", clientId] }); qc.invalidateQueries({ queryKey: ["conversao-origem", clientId] }); }} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function LinhaTexto({ clientId, inicio, conversas, aoSalvar }: { clientId: string; inicio: string; conversas: number; aoSalvar: () => void }) {
  const [origem, setOrigem] = useState<string>("");
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("origem_texto_salvar", { p_client: clientId, p_padrao: inicio, p_origem: origem });
      if (error) throw new Error(error.message);
    },
    onSuccess: aoSalvar,
  });
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate" title={inicio}>“{inicio}…” <span style={{ color: "var(--text-dim)" }}>({conversas})</span></span>
      <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="min-h-[30px] rounded-lg border px-1 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <option value="">Origem…</option>
        {OPCOES.map((o) => <option key={o} value={o}>{ROTULO_ORIGEM_CONV[o]}</option>)}
      </select>
      <button type="button" disabled={!origem || salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[30px] rounded-lg px-2 text-xs font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>Salvar</button>
      {salvar.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
    </li>
  );
}
