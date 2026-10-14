import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Qualidade do lead por campanha: o anúncio trouxe gente que avança no funil ou só volume?
// Duas leituras separadas: DIRETA (o lead traz a campanha) e ESTIMADA POR HORÁRIO (conversas do dia repartidas
// entre as campanhas que a Meta informou naquele dia). Regras em qualidade_leads_campanha (banco).

const brl = (v: number | null) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString("pt-BR") : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const curto = (s: string) => (s.length > 60 ? s.slice(0, 58) + "…" : s);

type Linha = { campaign_id: string; campanha: string; gasto: number; leads?: number; conversas_atribuidas?: number; com_lead?: number; avancaram: number; agendaram: number; ganhos: number };

function Tabela({ linhas, base, rotuloBase }: { linhas: Linha[]; base: (l: Linha) => number; rotuloBase: string }) {
  const comBase = linhas.filter((l) => base(l) > 0);
  if (!comBase.length) return null;
  const melhores = comBase.filter((l) => l.avancaram > 0 && l.gasto > 0).map((l) => l.gasto / l.avancaram);
  const melhor = melhores.length ? Math.min(...melhores) : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
            <th className="py-1 pr-3 font-medium">Campanha</th>
            <th className="py-1 pr-3 text-right font-medium">Gasto</th>
            <th className="py-1 pr-3 text-right font-medium">{rotuloBase}</th>
            <th className="py-1 pr-3 text-right font-medium">Avançaram</th>
            <th className="py-1 pr-3 text-right font-medium">Agendaram</th>
            <th className="py-1 pr-3 text-right font-medium">Fecharam</th>
            <th className="py-1 text-right font-medium">Custo por lead que avançou</th>
          </tr>
        </thead>
        <tbody>
          {comBase.map((l) => {
            const b = base(l);
            const custoAv = l.avancaram > 0 ? l.gasto / l.avancaram : null;
            const zero = l.avancaram === 0 && b >= 5;
            return (
              <tr key={l.campaign_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-3" title={l.campanha}>{curto(l.campanha)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{brl(l.gasto)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{num(b)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{num(l.avancaram)} <span className="text-xs" style={{ color: "var(--text-dim)" }}>({Math.round((l.avancaram / b) * 100)}%)</span></td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{num(l.agendaram)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{num(l.ganhos)}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: zero ? "var(--crit)" : custoAv != null && melhor != null && custoAv === melhor ? "var(--good)" : undefined }}>
                  {zero ? "nenhum avançou" : brl(custoAv)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QualidadeLeadsCampanha({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const { data } = useQuery({
    queryKey: ["qualidade-leads-campanha", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("qualidade_leads_campanha", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) return null;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as { direto: Linha[]; estimado: Linha[]; cobertura: Record<string, number> } | null;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!data) return null;
  const c = data.cobertura ?? {};
  const temDireto = data.direto.length > 0;
  const temEstimado = data.estimado.some((l) => (l.conversas_atribuidas ?? 0) > 0);
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Qualidade do lead por campanha">
      <h2 className="text-[15px] font-semibold">O anúncio trouxe lead bom ou só volume?</h2>
      <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        Segue cada lead do anúncio até a etapa do CRM. “Avançou” = chegou a qualificação, negociação, proposta, agendamento, consulta ou venda (follow-up e “mensagem enviada” não contam).
      </p>
      {temDireto && (
        <div className="mt-3">
          <h3 className="mb-1 text-sm font-semibold">Ligação direta (o lead traz a campanha)</h3>
          <Tabela linhas={data.direto} base={(l) => l.leads ?? 0} rotuloBase="Leads" />
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {num(c.leads_com_campanha ?? 0)} de {num(c.leads_periodo ?? 0)} leads do período trazem a campanha. Os outros não entram aqui: configure a UTM/campanha no anúncio (guia “Organizar o CRM”).
          </p>
        </div>
      )}
      {temEstimado && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">Estimado pelo horário (conversas de WhatsApp)</h3>
          <Tabela linhas={data.estimado} base={(l) => l.conversas_atribuidas ?? 0} rotuloBase="Conversas" />
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            A Meta informa quantas conversas cada campanha iniciou por dia, não quem clicou. Cada conversa nova do dia ({num(c.conversas_novas ?? 0)} no período, {num(c.conversas_com_lead ?? 0)} ligadas a um lead do CRM) é repartida entre as campanhas na proporção do que cada uma informou ({num(c.conversas_meta ?? 0)} conversas pela Meta). É estimativa: use para comparar campanhas entre si, não para contar paciente.
          </p>
        </div>
      )}
      {!temDireto && !temEstimado && (
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          Ainda não dá para ligar anúncio a lead neste cliente: os leads do CRM não trazem a campanha
          {c.conversas_meta ? ` e as ${num(c.conversas_meta)} conversas da Meta não têm conversa de WhatsApp guardada no painel` : ""}. Para resolver: gravar a campanha no lead (UTM no anúncio ou integração do formulário) — passo a passo em “Organizar o CRM”.
        </p>
      )}
    </section>
  );
}
