import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDateRange } from "@/lib/date-range";
import { useAuth } from "@/hooks/use-auth";

// Quanto o WhatsApp (API oficial) está custando: a Meta cobra por mensagem de modelo entregue fora da
// janela de 24h; resposta dentro da janela é grátis. Estimativa a partir das mensagens guardadas.
const layout = getRouteApi("/_authenticated/$clientId");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

export function CustoWhatsapp({ clientId }: { clientId: string }) {
  const { start, end } = resolveDateRange(layout.useSearch());
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: c } = useQuery({
    queryKey: ["custo-whatsapp", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("custo_whatsapp", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) return null;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  if (!c || !Number(c.mensagens_clinica)) return null;
  const pagas = Number(c.pagas_marketing) + Number(c.pagas_utilidade) + Number(c.pagas_atendimento ?? 0);
  const porConversa = Number(c.conversas_com_paciente) > 0 ? Number(c.custo_brl) / Number(c.conversas_com_paciente) : null;
  const p = c.precos;
  async function salvar() {
    const num = (k: string, atual: number) => (form[k] != null && form[k] !== "" ? Number(String(form[k]).replace(",", ".")) : atual);
    await (supabase as any)
      .from("whatsapp_precos")
      .update({
        marketing_usd: num("marketing_usd", p.marketing_usd),
        utilidade_usd: num("utilidade_usd", p.utilidade_usd),
        cambio_brl: num("cambio_brl", p.cambio_brl),
        taxa_provedor_pct: num("taxa_provedor_pct", p.taxa_provedor_pct),
        fonte: form.fonte ?? p.fonte,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", 1);
    setEditando(false);
    qc.invalidateQueries({ queryKey: ["custo-whatsapp"] });
  }
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Custo do WhatsApp">
      <div className="flex items-start gap-3">
        <Receipt size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Quanto o WhatsApp está custando (estimativa)</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><div className="text-xs" style={{ color: "var(--text-dim)" }}>Custo no período</div><div className="text-xl font-semibold tabular-nums">{brl(Number(c.custo_brl))}</div><div className="text-xs" style={{ color: "var(--text-dim)" }}>US$ {Number(c.custo_usd).toLocaleString("pt-BR")}</div></div>
            <div><div className="text-xs" style={{ color: "var(--text-dim)" }}>Mensagens pagas</div><div className="text-xl font-semibold tabular-nums">{int(pagas)}</div><div className="text-xs" style={{ color: "var(--text-dim)" }}>{int(Number(c.pagas_marketing))} automáticas · {int(Number(c.pagas_utilidade))} de pessoa{Number(c.pagas_atendimento) ? ` · ${int(Number(c.pagas_atendimento))} respostas acima da franquia` : ""}</div></div>
            <div><div className="text-xs" style={{ color: "var(--text-dim)" }}>Grátis (resposta em até 24h)</div><div className="text-xl font-semibold tabular-nums">{int(Number(c.gratis_janela_24h))}</div><div className="text-xs" style={{ color: "var(--text-dim)" }}>de {int(Number(c.mensagens_clinica))} mensagens da clínica</div></div>
            <div><div className="text-xs" style={{ color: "var(--text-dim)" }}>Custo por atendimento</div><div className="text-xl font-semibold tabular-nums">{porConversa != null ? brl(porConversa) : "—"}</div><div className="text-xs" style={{ color: "var(--text-dim)" }}>{int(Number(c.conversas_com_paciente))} conversas com paciente</div></div>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Como se calcula: a Meta cobra por mensagem enviada <b>fora</b> das 24h depois da última mensagem do paciente (lembrete, retorno, disparo).
            Responder dentro das 24h era grátis; desde {String(p.servico_cobrado_desde ?? "2026-10-01").split("-").reverse().join("/")} só as primeiras {int(Number(p.servico_gratis_mes ?? 1000))} respostas do mês são grátis (por número) e as seguintes custam US$ {p.servico_usd ?? 0.0068}. Automática fora da janela = preço de marketing (US$ {p.marketing_usd}); de pessoa fora da janela = utilidade (US$ {p.utilidade_usd});
            câmbio R$ {String(p.cambio_brl).replace(".", ",")}{Number(p.taxa_provedor_pct) ? `, mais ${p.taxa_provedor_pct}% do provedor` : ""}. Fonte: {p.fonte}
            {" "}Vale só se o número usa a API oficial; conexão não oficial não é cobrada pela Meta. Conta só as conversas guardadas no painel. Conversa que começou por anúncio de clique para WhatsApp fica grátis por 72h, e isso não dá para identificar aqui: o custo real pode ser um pouco menor.
            {Number(c.pagas_marketing) > 0 ? " Dica: disparo automático fora da janela é o que mais custa; prefira mandar quando o paciente acabou de falar." : ""}
          </p>
          {isAdmin && !editando && (
            <button type="button" onClick={() => setEditando(true)} className="mt-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>Editar preços</button>
          )}
          {isAdmin && editando && (
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
              {[["marketing_usd", "Marketing (US$)"], ["utilidade_usd", "Utilidade (US$)"], ["cambio_brl", "Câmbio (R$)"], ["taxa_provedor_pct", "Taxa do provedor (%)"]].map(([k, r]) => (
                <label key={k} className="flex flex-col">
                  {r}
                  <input defaultValue={String(p[k])} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-28 rounded border px-2 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
                </label>
              ))}
              <label className="flex min-w-[200px] flex-1 flex-col">
                Fonte
                <input defaultValue={p.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value })} className="rounded border px-2 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
              </label>
              <button type="button" onClick={salvar} className="rounded px-3 py-1.5 font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg, #fff)" }}>Salvar</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
