import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Copy, MessageCircle, Send, Users } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import { getAtendentesSap, getLeadsAtencaoSap, getPlanoSap, getTrackerAuto, type LeadAtencao, type SapCadastro } from "@/lib/sap-data";
import { ROTULO_FALHA } from "@/lib/sap-sinais";
import { lerTrackerAuto } from "@/lib/sap-auto";
import { KPIS_PLANO, baselineDoTracker, kpisDaGarantia, type KpiPlano } from "@/lib/sap-metas";
import { fmtKpi } from "@/lib/sap-documentos";
import { montarResumoMedico } from "@/lib/sap-resumo-medico";
import { somar } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";

const MOTIVO: Record<LeadAtencao["motivo"], { rotulo: string; cor: string; dica: string }> = {
  sem_resposta: { rotulo: "Sem resposta da clínica", cor: "var(--crit)", dica: "O paciente está esperando a clínica responder." },
  sem_follow_up: { rotulo: "Sem follow-up", cor: "var(--warn)", dica: "Conversa em aberto, parada há 2 dias ou mais, sem novo contato." },
  recuperavel: { rotulo: "Dá para recuperar", cor: "var(--accent)", dica: "Mostrou interesse real e não agendou." },
};
const tempo = (h: number) => (h < 24 ? `${h} h` : `${Math.round(h / 24)} dia(s)`);

/** Leads que precisam de atenção agora, pela leitura de IA de cada conversa. Só a equipe; não envia nada. */
export function LeadsAtencao({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ["sap-leads-atencao", clientId], queryFn: () => getLeadsAtencaoSap(clientId), refetchInterval: 5 * 60_000 });
  const leads = q.data ?? [];
  const n = (m: LeadAtencao["motivo"]) => leads.filter((l) => l.motivo === m).length;
  return (
    <Painel icone={BellRing} titulo="Leads que precisam de atenção" destaque={n("sem_resposta") > 0}
      resumo={q.isLoading ? "Carregando…" : leads.length ? `${n("sem_resposta")} sem resposta · ${n("sem_follow_up")} sem follow-up · ${n("recuperavel")} recuperáveis` : "Nenhum lead parado nos últimos 30 dias"}
      ajuda={<>A IA lê cada conversa do WhatsApp e marca quem está esperando a clínica, quem ficou sem follow-up e quem mostrou interesse e não agendou. Sem nome nem telefone aqui: abra a conversa no Hub para agir. Nenhuma mensagem é enviada automaticamente.</>}>
      {leads.length > 0 && (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
          {leads.slice(0, 15).map((l) => (
            <li key={l.conversa_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Selo cor={MOTIVO[l.motivo].cor} titulo={MOTIVO[l.motivo].dica}>{MOTIVO[l.motivo].rotulo}</Selo>
                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>parado há {tempo(l.horas_parado)}{l.interesse ? ` · ${l.interesse}` : ""}{l.atendente ? ` · ${l.atendente}` : ""}</span>
                </div>
                {l.proximo_passo && <div className="mt-0.5 text-sm">{l.proximo_passo}</div>}
              </div>
              <Link to="/$clientId/atendimento" params={{ clientId }} search={{ aba: "conversas", conversa: l.conversa_id } as never}
                className="inline-flex min-h-[32px] items-center rounded-lg border px-3 text-xs font-semibold" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                Abrir conversa →
              </Link>
            </li>
          ))}
        </ul>
      )}
      {leads.length > 15 && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>E mais {leads.length - 15} na aba Conversas do Hub.</p>}
    </Painel>
  );
}

/** Qualidade do atendimento por atendente (últimas 4 semanas), pela nota da IA em cada conversa. Só a equipe. */
export function AtendimentoPorAtendente({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const de = somar(hoje, -28);
  const ate = somar(hoje, -1);
  const q = useQuery({ queryKey: ["sap-atendentes", clientId, de, ate], queryFn: () => getAtendentesSap(clientId, de, ate) });
  const lista = q.data ?? [];
  const cor = (n: number | null) => (n === null ? "var(--muted)" : n >= 8 ? "var(--good)" : n >= 6 ? "var(--warn)" : "var(--crit)");
  return (
    <Painel icone={Users} titulo="Atendimento por atendente" resumo={lista.length ? `${lista.length} atendente(s) · últimas 4 semanas` : "Sem conversas analisadas no período"}
      ajuda={<>Nota de 0 a 10 que a IA dá a cada conversa, agrupada pela assinatura de quem atendeu. Serve para o treino da recepção (06.07): mostra onde cada pessoa mais erra. Uso interno da equipe e do gestor da clínica, nunca para expor alguém.</>}>
      {lista.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}><th className="py-1 pr-3 font-medium">Atendente</th><th className="py-1 pr-3 text-right font-medium">Conversas</th><th className="py-1 pr-3 text-right font-medium">Nota</th><th className="py-1 pr-3 text-right font-medium">Agendou</th><th className="py-1 pr-3 text-right font-medium">Recuperáveis</th><th className="py-1 font-medium">O que mais treinar</th></tr></thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.atendente} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 font-medium">{a.atendente}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{a.conversas}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold" style={{ color: cor(a.nota_media) }}>{a.nota_media ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{a.agendou}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{a.recuperaveis}</td>
                  <td className="py-1.5 text-xs" style={{ color: "var(--text-dim)" }}>{a.falhas.length ? a.falhas.map((f) => `${ROTULO_FALHA[f.falha] ?? f.falha} (${f.n})`).join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>"Sem assinatura" = robô ou atendente que não assina as mensagens. Peça para a recepção assinar para a leitura ficar por pessoa.</p>
        </div>
      )}
    </Painel>
  );
}

const MENOR_MELHOR = new Set<KpiPlano>(["resposta", "custo_consulta"]);

/** Resumo semanal para o médico: 3 números contra o ponto de partida, o ponto principal e a ação de cada lado. Revisar e enviar. */
export function ResumoParaMedico({ clientId, clinica, dia, principal }: {
  clientId: string; clinica: SapCadastro; dia: number | null;
  principal: { titulo: string; acaoClinica?: string | null; acaoDc?: string | null; prazo?: string | null } | null;
}) {
  const hoje = hojeBrasilia();
  const de = somar(hoje, -28);
  const ate = somar(hoje, -1);
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica.id], queryFn: () => getPlanoSap(clinica.id) });
  const autoQ = useQuery({ queryKey: ["sap-auto", clientId, de, ate], queryFn: () => getTrackerAuto(clientId, de, ate) });
  const [copiado, setCopiado] = useState(false);
  const texto = useMemo(() => {
    const t = lerTrackerAuto(autoQ.data);
    const agora = t ? baselineDoTracker(t, 28) : [];
    const kpis = kpisDaGarantia(clinica.consulta_paga !== false).map((k) => {
      const b = (planoQ.data ?? []).find((p) => p.kpi === k)?.baseline ?? null;
      const a = agora.find((p) => p.kpi === k)?.baseline ?? null;
      return {
        rotulo: KPIS_PLANO.find((x) => x.id === k)?.rotulo ?? k,
        agora: fmtKpi(k, a), partida: fmtKpi(k, b),
        melhorou: a === null || b === null || a === b ? null : MENOR_MELHOR.has(k) ? a < b : a > b,
      };
    });
    return montarResumoMedico({ nomeContato: clinica.decisor_nome, dia, kpis, principal });
  }, [autoQ.data, planoQ.data, clinica, dia, principal]);
  return (
    <Painel icone={Send} titulo="Resumo semanal para o médico" resumo="Com os 3 números contra o ponto de partida. Revisar e enviar na segunda."
      ajuda={<>Versão com números da mensagem da semana, para o decisor ver o progresso em 10 segundos. Nada é enviado automaticamente: copie ou abra no WhatsApp, revise e envie.</>}>
      <p className="mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2, var(--surface))" }}>{texto}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão */ } }}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
          <Copy size={14} aria-hidden /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white" style={{ background: "#1f9d55" }}>
          <MessageCircle size={14} aria-hidden /> Abrir no WhatsApp
        </a>
      </div>
    </Painel>
  );
}
