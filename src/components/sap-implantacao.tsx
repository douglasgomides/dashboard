import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Clock, Repeat } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getClientFontes } from "@/lib/client-data";
import { resumoAcessos } from "@/lib/sap-acessos";
import { resumoTestes } from "@/lib/sap-rastreamento";
import { diaAtual, getAcessosSap, getClinicaSap, getTestesRastreioSap, getEtapasSap, getExecucaoSap, getPlanoSap, getSaudeSap, getTrackerAuto } from "@/lib/sap-data";
import { lerTrackerAuto, montarKpisSap } from "@/lib/sap-auto";
import { kpisDaGarantia, somarDias } from "@/lib/sap-metas";
import { calcularExecucao } from "@/lib/sap-scores";
import { passosDaImplantacao, resumoImplantacao, type PassoImplantacao, type StatusPasso } from "@/lib/sap-implantacao";
import { hojeBrasilia } from "@/lib/status-fonte";

const ESTILO: Record<StatusPasso, { I: typeof Circle; cor: string; rotulo: string }> = {
  feito: { I: CheckCircle2, cor: "var(--good)", rotulo: "Feito" },
  fazer: { I: Circle, cor: "var(--accent)", rotulo: "A fazer" },
  atrasado: { I: AlertTriangle, cor: "var(--crit)", rotulo: "Atrasado" },
  rotina: { I: Repeat, cor: "var(--warn)", rotulo: "Rotina" },
  depois: { I: Clock, cor: "var(--muted)", rotulo: "Mais tarde" },
};

/** Passo a passo da implantação: o que fazer, em que ordem e por quê, marcando sozinho o que já foi feito. */
export function PassoAPassoSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const j = { de: somarDias(hoje, -28), ate: somarDias(hoje, -1) };
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const fontesQ = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const autoQ = useQuery({ queryKey: ["sap-auto", clientId, j.de, j.ate], queryFn: () => getTrackerAuto(clientId, j.de, j.ate) });
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica?.id], queryFn: () => getPlanoSap(clinica!.id), enabled: !!clinica });
  const execQ = useQuery({ queryKey: ["sap-execucao", clinica?.id], queryFn: () => getExecucaoSap(clinica!.id), enabled: !!clinica });
  const saudeQ = useQuery({ queryKey: ["sap-saude", clinica?.id], queryFn: () => getSaudeSap(clinica!.id), enabled: !!clinica && isAdmin });
  const acessosQ = useQuery({ queryKey: ["sap-acessos", clinica?.id], queryFn: () => getAcessosSap(clinica!.id), enabled: !!clinica });
  const rastreioQ = useQuery({ queryKey: ["sap-rastreio-testes", clinica?.id], queryFn: () => getTestesRastreioSap(clinica!.id), enabled: !!clinica });
  const etapasQ = useQuery({ queryKey: ["sap-etapas", clientId], queryFn: () => getEtapasSap(clientId), enabled: isAdmin });

  const passos = useMemo(() => {
    const t = lerTrackerAuto(autoQ.data);
    const l = t ? montarKpisSap(t) : null;
    const plano = planoQ.data ?? [];
    const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
    const principais = kpisDaGarantia(clinica?.consulta_paga !== false);
    const exec = calcularExecucao(execQ.data ?? [], dia);
    const semana = dia === null ? null : Math.floor(Math.max(0, dia) / 7) + 1;
    const marcos = etapasQ.data ? [...new Set(etapasQ.data.map((e) => e.marco).filter((m): m is string => !!m))] : (t?.marcos ?? []);
    const f = fontesQ.data as { tem_crm?: boolean; tem_atendimento?: boolean; tem_anuncios?: boolean } | null | undefined;
    return passosDaImplantacao({
      ativo: !!clinica,
      d0: clinica?.d0 ?? null,
      dia,
      ticket: clinica?.ticket_medio ? Number(clinica.ticket_medio) : null,
      temCrm: f?.tem_crm ?? !!t?.tem_crm,
      temWhatsapp: f?.tem_atendimento ?? !!t?.tem_whatsapp,
      temAnuncios: f?.tem_anuncios ?? (t?.investido ?? 0) > 0,
      marcos,
      baselineMedida: !!clinica?.baseline_de || plano.some((p) => p.baseline !== null && p.origem === "medido"),
      metasPrincipais: plano.filter((p) => principais.includes(p.kpi) && p.meta !== null).length,
      metaCustoConsulta: plano.some((p) => p.kpi === "custo_consulta" && p.meta !== null),
      aceiteMetas: !!clinica?.aceite_metas_em,
      acessosCriticos: acessosQ.data ? resumoAcessos(acessosQ.data, null).criticos : undefined,
      rastreamento: rastreioQ.data && clinica ? resumoTestes(rastreioQ.data, clinica.status_categoria_meta, clinica.rastreamento_conferido_por) : undefined,
      linhasCompletas: l?.checagens.find((c) => c.id === "linhas")?.valor ?? null,
      divergencia: l?.checagens.find((c) => c.id === "divergencia")?.valor ?? null,
      saudeSemanaAtual: semana !== null && (saudeQ.data ?? []).some((s) => s.semana === semana),
      execucaoItens: (execQ.data ?? []).filter((r) => r.status !== "Pendente").length,
      execucaoVencidosSemStatus: exec.vencidosSemStatus,
    }).filter((p) => isAdmin || !["etapas", "saude", "midia", "fontes"].includes(p.id));
  }, [acessosQ.data, rastreioQ.data, clinica, fontesQ.data, autoQ.data, planoQ.data, execQ.data, saudeQ.data, etapasQ.data, isAdmin]);

  if (cadQ.isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  const r = resumoImplantacao(passos);
  const grupos = [...new Set(passos.map((p) => p.grupo))];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-lg font-semibold">Passo a passo da implantação</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
          Siga de cima para baixo. O painel marca sozinho o que já foi feito, com base no que está cadastrado e no que chega do CRM e do WhatsApp.
          Cada passo diz por que existe e onde clicar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>
            Começo: <strong>{r.feitosComeco} de {r.totalComeco}</strong> passos feitos
          </span>
          {r.atrasados > 0 && <span style={{ color: "var(--crit)" }}>{r.atrasados} atrasado(s)</span>}
        </div>
        {r.proximo && (
          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: `color-mix(in srgb, ${ESTILO[r.proximo.status].cor} 45%, var(--border))`, background: `color-mix(in srgb, ${ESTILO[r.proximo.status].cor} 7%, var(--surface))` }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: ESTILO[r.proximo.status].cor }}>Próximo passo</div>
            <div className="mt-1 font-semibold">{r.proximo.titulo}</div>
            <p className="mt-1 text-sm">{r.proximo.como}</p>
            <BotaoIr passo={r.proximo} clientId={clientId} />
          </div>
        )}
      </section>

      {grupos.map((g) => (
        <section key={g}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>{g}</h3>
          <ol className="space-y-2">
            {passos
              .filter((p) => p.grupo === g)
              .map((p) => {
                const e = ESTILO[p.status];
                return (
                  <li key={p.id} className="flex gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)", opacity: p.status === "depois" ? 0.75 : 1 }}>
                    <e.I size={20} className="mt-0.5 shrink-0" style={{ color: e.cor }} aria-label={e.rotulo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{p.titulo}</span>
                        <span className="text-xs font-medium" style={{ color: e.cor }}>{e.rotulo}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>· {p.quando}</span>
                      </div>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
                        <strong style={{ color: "var(--text)" }}>Por quê: </strong>
                        {p.porque}
                      </p>
                      <p className="mt-0.5 text-sm" style={{ color: "var(--text-dim)" }}>
                        <strong style={{ color: "var(--text)" }}>Como: </strong>
                        {p.como}
                      </p>
                      {p.detalhe && <p className="mt-1 text-xs" style={{ color: p.status === "feito" ? "var(--muted)" : "var(--crit)" }}>{p.detalhe}</p>}
                      {p.status !== "feito" && p.status !== "depois" && <BotaoIr passo={p} clientId={clientId} discreto />}
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function BotaoIr({ passo, clientId, discreto = false }: { passo: PassoImplantacao; clientId: string; discreto?: boolean }) {
  const destino = passo.id === "fontes" ? { to: "/admin/$clientId", params: { clientId } } : { to: `/sap/$clientId${passo.tela}`, params: { clientId } };
  return (
    <Link
      to={destino.to as never}
      params={destino.params as never}
      className={discreto ? "mt-2 inline-block text-sm font-semibold underline" : "mt-3 inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold text-white"}
      style={discreto ? { color: "var(--accent)" } : { background: "var(--accent)" }}
    >
      {passo.id === "fontes" ? "Abrir a configuração do cliente →" : "Fazer agora →"}
    </Link>
  );
}
