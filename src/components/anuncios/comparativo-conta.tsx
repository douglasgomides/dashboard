import { useQuery } from "@tanstack/react-query";
import { getAdsResumo } from "@/lib/client-data";

// A conta inteira, este período × o período anterior do mesmo tamanho, independente de quais
// campanhas estavam ativas em cada um. Mesma fonte (ads_resumo) nos dois lados, para comparar igual.

const n = (v: unknown) => (v == null ? null : Number(v));
const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 10 ? 2 : 0 }));
const int = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const pctTxt = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

function variacao(atual: number | null, ant: number | null): number | null {
  if (atual == null || ant == null || ant === 0) return null;
  return atual / ant - 1;
}

export function ComparativoConta({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const dias = Math.round((new Date(end.slice(0, 10) + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime()) / 86400000) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const antFim = iso(new Date(start + "T12:00:00Z").getTime() - 86400000);
  const antIni = iso(new Date(start + "T12:00:00Z").getTime() - dias * 86400000);
  const atual = useQuery({ queryKey: ["ads-resumo", clientId, start, end], queryFn: () => getAdsResumo(clientId, start, end.slice(0, 10)), staleTime: 5 * 60_000 });
  const ant = useQuery({ queryKey: ["ads-resumo", clientId, antIni, antFim], queryFn: () => getAdsResumo(clientId, antIni, antFim), staleTime: 5 * 60_000 });
  const a = atual.data as any;
  const b = ant.data as any;
  if (!a) return null;
  const linhas: { rot: string; at: number | null; an: number | null; fmt: (v: number | null) => string; bomSobe: boolean | null; dica: string }[] = [
    { rot: "Investido", at: n(a.gasto), an: n(b?.gasto), fmt: brl, bomSobe: null, dica: "Tudo o que foi gasto na conta, de qualquer campanha." },
    { rot: "Conversas iniciadas", at: n(a.conversas), an: n(b?.conversas), fmt: int, bomSobe: true, dica: "WhatsApp e Direct, de todas as campanhas." },
    { rot: "Custo por conversa", at: n(a.custo_por_conversa), an: n(b?.custo_por_conversa), fmt: brl, bomSobe: false, dica: "Só campanhas de mensagem." },
    { rot: "Aparições (impressões)", at: n(a.impressoes), an: n(b?.impressoes), fmt: int, bomSobe: true, dica: "Vezes que o anúncio apareceu." },
    { rot: "Cliques no link", at: n(a.cliques_link), an: n(b?.cliques_link), fmt: int, bomSobe: true, dica: "Só clique que leva para fora (WhatsApp, site)." },
    { rot: "CTR (clique no link ÷ aparições)", at: n(a.ctr), an: n(b?.ctr), fmt: (v) => pctTxt(v == null ? null : v / 100), bomSobe: true, dica: "Mede se a arte chama atenção." },
    { rot: "CPC (custo por clique)", at: n(a.cpc), an: n(b?.cpc), fmt: brl, bomSobe: false, dica: "Quanto custa cada clique no link." },
    { rot: "CPM (custo por mil aparições)", at: n(a.cpm), an: n(b?.cpm), fmt: brl, bomSobe: false, dica: "Quanto custa aparecer. Sobe com público disputado ou criativo cansado." },
    { rot: "Campanhas com registros", at: n(a.campanhas), an: n(b?.campanhas), fmt: int, bomSobe: null, dica: "Campanhas presentes nos dados do período, inclusive atribuições sem novo gasto." },
  ];
  // Leitura em uma frase: gasto x resultado.
  const vg = variacao(n(a.gasto), n(b?.gasto));
  const vc = variacao(n(a.conversas), n(b?.conversas));
  const pc = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  let leitura = "";
  if (b && vg != null && vc != null) {
    if (vg > 0.1 && vc < vg - 0.1) leitura = `O investimento subiu ${pc(vg)} e as conversas ${vc >= 0 ? `só ${pc(vc)}` : `caíram ${pc(vc)}`}: o dinheiro a mais rendeu menos. Ver criativos cansados e público.`;
    else if (vg < -0.1 && vc > vg + 0.1) leitura = `O investimento caiu ${pc(vg)} e as conversas ${vc >= 0 ? `subiram ${pc(vc)}` : `caíram só ${pc(vc)}`}: a conta ficou mais eficiente.`;
    else if (Math.abs(vg) <= 0.1 && vc < -0.15) leitura = `Mesmo investimento (${pc(vg)}) e ${pc(vc)} de conversas: algo piorou no anúncio ou no público.`;
    else leitura = `Investimento ${pc(vg)} e conversas ${pc(vc)} em relação ao período anterior.`;
  } else if (!b || !n(b.gasto)) leitura = "Sem gasto no período anterior para comparar.";
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Este período e o anterior">
      <h2 className="text-[15px] font-semibold">A conta inteira: este período × o anterior</h2>
      <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        Anterior = {antIni.slice(8, 10)}/{antIni.slice(5, 7)} a {antFim.slice(8, 10)}/{antFim.slice(5, 7)} ({dias} dias). Soma de todas as campanhas, ativas ou não.
      </p>
      {leitura && <p className="mt-2 text-sm font-medium">{leitura}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
              <th className="py-1 pr-3 font-medium">Indicador</th>
              <th className="py-1 pr-3 text-right font-medium">Este período</th>
              <th className="py-1 pr-3 text-right font-medium">Anterior</th>
              <th className="py-1 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const v = variacao(l.at, l.an);
              const bom = v == null || l.bomSobe == null || Math.abs(v) < 0.05 ? null : (v > 0) === l.bomSobe;
              return (
                <tr key={l.rot} className="border-t" style={{ borderColor: "var(--border)" }} title={l.dica}>
                  <td className="py-1.5 pr-3">{l.rot}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{l.fmt(l.at)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>{l.fmt(l.an)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: bom == null ? "var(--ink-2)" : bom ? "var(--good)" : "var(--crit)" }}>
                    {v == null ? "—" : pc(v)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
