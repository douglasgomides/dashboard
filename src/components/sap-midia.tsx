import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Gauge, Rocket, Wallet, Zap } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import { hojeBrasilia } from "@/lib/status-fonte";
import { getAdsCampanhasPeriodo, getAtendimentosWhatsapp } from "@/lib/client-data";
import { getClinicaSap, getPlanoSap, getTrackerAuto } from "@/lib/sap-data";
import { lerTrackerAuto } from "@/lib/sap-auto";
import { somarDias } from "@/lib/sap-metas";
import { avaliarRastreio, separarCliques } from "@/lib/rastreio-anuncios";
import { regrasDeMidia, type TipoRegra } from "@/lib/sap-midia";

const ESTILO: Record<TipoRegra, { I: typeof Ban; cor: string; rotulo: string }> = {
  pausa: { I: Ban, cor: "var(--crit)", rotulo: "Pausar" },
  fadiga: { I: Zap, cor: "var(--warn)", rotulo: "Fadiga" },
  verba: { I: Wallet, cor: "var(--accent)", rotulo: "Verba" },
  escala: { I: Rocket, cor: "var(--good)", rotulo: "Escalar" },
};

/** Regras de mídia do SAP na aba Anúncios (só para clínica com o Sistema de Aquisição ativo). */
export function RegrasMidiaSap({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const ate = somarDias(hoje, -1);
  const ini14 = somarDias(hoje, -14);
  const j4 = { de: somarDias(hoje, -28), ate };
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const adsQ = useQuery({ queryKey: ["sap-midia-ads", clientId, ini14, ate], queryFn: () => getAdsCampanhasPeriodo(clientId, ini14, ate), enabled: !!clinica });
  const autoQ = useQuery({ queryKey: ["sap-auto", clientId, j4.de, j4.ate], queryFn: () => getTrackerAuto(clientId, j4.de, j4.ate), enabled: !!clinica });
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica?.id], queryFn: () => getPlanoSap(clinica!.id), enabled: !!clinica });
  const whatsQ = useQuery({ queryKey: ["sap-midia-whats", clientId, ini14, ate], queryFn: () => getAtendimentosWhatsapp(clientId, ini14, ate), enabled: !!clinica });

  const leitura = useMemo(() => {
    if (!adsQ.data) return null;
    const t = lerTrackerAuto(autoQ.data);
    // Visita ao perfil não é clique para conversar (rastreio-anuncios.ts).
    const cliques = separarCliques(adsQ.data.linhas, adsQ.data.cadastro);
    const conversas = adsQ.data.linhas.reduce((s, l) => s + (Number(l.conversations) || 0), 0);
    const rastreio = avaliarRastreio({ cliquesLink: cliques.paraFora, cliquesPerfil: cliques.paraPerfil, conversas, atendimentosWhatsapp: whatsQ.data ?? null });
    const meta = planoQ.data?.find((p) => p.kpi === "custo_consulta")?.meta ?? null;
    return regrasDeMidia({
      linhas: adsQ.data.linhas,
      cadastro: adsQ.data.cadastro,
      ate,
      conta4s: t ? { investido: t.investido, compareceram: t.marcos.some((m) => ["compareceu", "faltou", "pensando", "nao_fechou"].includes(m)) ? t.compareceram : 0, conversasPlataforma: t.leads_plataforma } : null,
      metaCustoConsulta: meta,
      rastreioSuspeito: rastreio.suspeito,
    });
  }, [adsQ.data, autoQ.data, planoQ.data, whatsQ.data, ate]);

  if (!clinica || !leitura) return null;
  if (adsQ.data && adsQ.data.linhas.length === 0) return null;

  return (
    <Painel icone={Gauge} titulo="Regras de mídia do Sistema de Aquisição" resumo="Últimos 7 dias contra os 7 anteriores. A régua é a consulta realizada, não o clique nem o lead.">
      {leitura.alertas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhuma campanha pede ação: sem fadiga e sem custo acima de 2x a meta.</p>
      ) : (
        <ul className="space-y-2.5">
          {leitura.alertas.map((a, i) => {
            const e = ESTILO[a.tipo];
            return (
              <li key={`${a.tipo}-${a.campaign_id ?? i}`} className="flex gap-2.5 rounded-lg border p-3 text-sm" style={{ borderColor: `color-mix(in srgb, ${e.cor} 35%, var(--border))` }}>
                <e.I size={17} className="mt-0.5 shrink-0" style={{ color: e.cor }} aria-hidden />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Selo cor={e.cor}>{e.rotulo}</Selo>
                    {a.codigo && <Selo>{a.codigo}</Selo>}
                    <span className="font-semibold">{a.campanha ? `${a.campanha}: ` : ""}{a.titulo}</span>
                  </div>
                  <div className="mt-0.5" style={{ color: "var(--text-dim)" }}>{a.detalhe}</div>
                  <div className="mt-0.5">{a.acao}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {leitura.custoMetaConversa !== null && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Custo-meta por conversa: {leitura.custoMetaConversa.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} (meta de custo por consulta × consultas ÷ conversas da conta).
        </p>
      )}
    </Painel>
  );
}
