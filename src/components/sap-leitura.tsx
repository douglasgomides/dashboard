import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, CircleDashed, ClipboardCheck, Copy, MessageCircle, TriangleAlert } from "lucide-react";
import { AcoesSap } from "@/components/sap-acoes";
import { AtendimentoSap } from "@/components/sap-atendimento";
import { indicadoresAtendimento } from "@/lib/sap-sinais";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { hojeBrasilia } from "@/lib/status-fonte";
import { diaAtual, getAuditoriasSap, getClinicaSap, getPlanoSap, getSinaisSap, getTrackerAuto } from "@/lib/sap-data";
import { lerTrackerAuto } from "@/lib/sap-auto";
import { avaliarGarantia, somarDias } from "@/lib/sap-metas";
import { MAPA_VAZAMENTOS, montarLeitura, type StatusPasso } from "@/lib/sap-leitura";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const ICONE: Record<StatusPasso, { I: typeof CheckCircle2; cor: string }> = {
  ok: { I: CheckCircle2, cor: "var(--good)" },
  alerta: { I: TriangleAlert, cor: "var(--warn)" },
  sem_dado: { I: CircleDashed, cor: "var(--muted)" },
};

/** Leitura da semana (08.05): 8 passos, vazamento principal com a ação de cada lado, escala ao Fundador e mensagem pronta. */
export function LeituraDaSemana({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const atualJ = { de: somarDias(hoje, -28), ate: somarDias(hoje, -1) };
  const antJ = { de: somarDias(hoje, -35), ate: somarDias(hoje, -8) };
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica?.id], queryFn: () => getPlanoSap(clinica!.id), enabled: !!clinica });
  const atualQ = useQuery({ queryKey: ["sap-auto", clientId, atualJ.de, atualJ.ate], queryFn: () => getTrackerAuto(clientId, atualJ.de, atualJ.ate) });
  const antQ = useQuery({ queryKey: ["sap-auto", clientId, antJ.de, antJ.ate], queryFn: () => getTrackerAuto(clientId, antJ.de, antJ.ate) });
  const sinQ = useQuery({ queryKey: ["sap-sinais", clientId, atualJ.de, atualJ.ate], queryFn: () => getSinaisSap(clientId, atualJ.de, atualJ.ate) });
  const audQ = useQuery({ queryKey: ["sap-auditoria", clinica?.id], queryFn: () => getAuditoriasSap(clinica!.id), enabled: !!clinica });
  const [copiado, setCopiado] = useState(false);

  const leitura = useMemo(() => {
    const atual = lerTrackerAuto(atualQ.data);
    if (!atual) return null;
    const plano = planoQ.data ?? [];
    const consultaPaga = clinica?.consulta_paga !== false;
    const score = clinica?.score_execucao === null || clinica?.score_execucao === undefined ? null : Number(clinica.score_execucao);
    const garantia = plano.length ? avaliarGarantia({ plano, atual, consultaPaga, verbaEmDia: clinica?.verba_em_dia !== false, score }) : null;
    return montarLeitura({
      atual,
      anterior: lerTrackerAuto(antQ.data),
      plano,
      dia: diaAtual(clinica?.d0 ?? null, clinica?.pausas),
      ticket: clinica?.ticket_medio ? Number(clinica.ticket_medio) : null,
      consultaPaga,
      score,
      garantiaAplicaNaPrevia: garantia?.aplica ?? null,
      extras: indicadoresAtendimento(sinQ.data ?? null, atual.agendados, audQ.data?.[0] ?? null).gatilhos,
    });
  }, [atualQ.data, antQ.data, planoQ.data, clinica, sinQ.data, audQ.data]);

  if (atualQ.isLoading || cadQ.isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Montando a leitura da semana…</p>;
  if (atualQ.error) return <p className="text-sm" style={{ color: "var(--crit)" }}>Não consegui montar a leitura: {(atualQ.error as Error).message}</p>;
  if (!leitura) return null;

  const p = leitura.principal;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          Leitura da semana{leitura.semanaPrograma && leitura.semanaPrograma <= 13 ? ` S${leitura.semanaPrograma}` : ""}
        </h2>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Últimas 4 semanas fechadas ({dm(atualJ.de)} a {dm(atualJ.ate)}) · regra do 08.05: uma ação por semana para cada lado
        </span>
      </div>

      {isAdmin && leitura.escalar.length > 0 && (
        <section className="rounded-xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--crit) 50%, var(--border))", background: "color-mix(in srgb, var(--crit) 8%, var(--surface))" }}>
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--crit)" }}>
            <AlertOctagon size={16} aria-hidden /> Escalar ao Fundador hoje
          </h3>
          <ul className="mt-1.5 list-disc pl-5 text-sm">
            {leitura.escalar.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Mensagem de 3 linhas: o que aconteceu, por quê, o que propõe.</p>
        </section>
      )}

      {p ? (
        <section className="rounded-xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--warn) 50%, var(--border))", background: "color-mix(in srgb, var(--warn) 7%, var(--surface))" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Selo cor="var(--warn)">{p.v.codigo}</Selo>
            <h3 className="text-base font-semibold">Vazamento da semana: {p.v.titulo}</h3>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>{p.motivo}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {p.v.acaoClinica && (
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Ação da clínica</div>
                <p className="mt-1 text-sm">{p.v.acaoClinica}</p>
              </div>
            )}
            {p.v.acaoDc && (
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Ação da Doctor Creator</div>
                <p className="mt-1 text-sm">{p.v.acaoDc}</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            Dono: {p.v.dono} · Prazo: {p.v.prazo}
          </p>
        </section>
      ) : (
        <Painel icone={CheckCircle2} titulo="Nenhum vazamento acima do limite" resumo="Todas as etapas medidas estão na meta nas últimas 4 semanas. Manter a rotina." cor="var(--good)">
          <span />
        </Painel>
      )}

      <AcoesSap
        clientId={clientId}
        sugestoes={
          p
            ? [
                ...(p.v.acaoClinica ? [{ codigo: p.v.codigo, texto: p.v.acaoClinica, lado: "clinica" as const }] : []),
                ...(p.v.acaoDc ? [{ codigo: p.v.codigo, texto: p.v.acaoDc, lado: "dc" as const, responsavel: p.v.dono }] : []),
              ]
            : []
        }
      />
      <AtendimentoSap clientId={clientId} />

      {isAdmin && leitura.mensagem && (
        <Painel icone={MessageCircle} titulo="Mensagem para a clínica" resumo="Modelo do 08.05, para mandar até 12h de segunda.">
          <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2, var(--surface))" }}>
            {leitura.mensagem}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(leitura.mensagem!);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                } catch {
                  /* sem permissão de área de transferência */
                }
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}
            >
              <Copy size={14} aria-hidden /> {copiado ? "Copiado" : "Copiar"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(leitura.mensagem)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white" style={{ background: "#1f9d55" }}>
              <MessageCircle size={14} aria-hidden /> Enviar pelo WhatsApp
            </a>
          </div>
        </Painel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel icone={ClipboardCheck} titulo="Os 8 passos da leitura" resumo="Sempre nesta ordem: dado ruim e resposta lenta vêm antes de mexer em anúncio">
          <ol className="space-y-2.5">
            {leitura.passos.map((x) => {
              const { I, cor } = ICONE[x.status];
              return (
                <li key={x.n} className="flex gap-2.5 text-sm">
                  <I size={17} className="mt-0.5 shrink-0" style={{ color: cor }} aria-hidden />
                  <div>
                    <div className="font-medium">
                      {x.n}. {x.pergunta}
                    </div>
                    <div style={{ color: "var(--text-dim)" }}>{x.resposta}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Painel>

        <div className="space-y-4">
          <Painel icone={TriangleAlert} titulo="Perda estimada por etapa" resumo="Tratamentos perdidos contra a meta (sem meta, a referência DC) × ticket de referência">
            {leitura.perdas.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhuma etapa medida abaixo da meta.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {leitura.perdas.map((x) => (
                  <li key={x.etapa} className="flex justify-between gap-3">
                    <span>{x.rotulo}</span>
                    <span className="whitespace-nowrap tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {x.tratamentos.toFixed(1).replace(".", ",")} trat.{x.reais !== null ? ` · ${brl(x.reais)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!clinica?.ticket_medio && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Cadastre o ticket médio no Programa para a perda sair sempre em R$.</p>}
          </Painel>

          {leitura.outros.length > 0 && (
            <Painel icone={TriangleAlert} titulo="Também apareceram" resumo="Ficam para as próximas semanas: uma ação por vez">
              <ul className="space-y-2 text-sm">
                {leitura.outros.map((o) => (
                  <li key={o.v.codigo}>
                    <Selo>{o.v.codigo}</Selo> <span className="font-medium">{o.v.titulo}</span>
                    <div className="text-xs" style={{ color: "var(--text-dim)" }}>{o.motivo}</div>
                  </li>
                ))}
              </ul>
            </Painel>
          )}
        </div>
      </div>

      <details className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <summary className="cursor-pointer text-sm font-semibold">Mapa de vazamentos V1 a V20 (08.05)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-2 pr-3 font-medium">Cód.</th>
                <th className="py-2 pr-3 font-medium">Sintoma</th>
                <th className="py-2 pr-3 font-medium">Ação padrão</th>
                <th className="py-2 font-medium">Dono e prazo</th>
              </tr>
            </thead>
            <tbody>
              {[...MAPA_VAZAMENTOS].sort((a, b) => Number(a.codigo.slice(1)) - Number(b.codigo.slice(1))).map((v) => (
                <tr key={v.codigo} className="border-t align-top" style={{ borderColor: "var(--border)", background: v.codigo === p?.v.codigo ? "color-mix(in srgb, var(--warn) 10%, transparent)" : undefined }}>
                  <td className="py-2 pr-3 font-semibold">{v.codigo}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{v.titulo}</div>
                    <div className="text-xs" style={{ color: "var(--text-dim)" }}>{v.sintoma}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {v.acaoClinica && <div><strong>Clínica:</strong> {v.acaoClinica}</div>}
                    {v.acaoDc && <div><strong>DC:</strong> {v.acaoDc}</div>}
                  </td>
                  <td className="py-2 text-xs" style={{ color: "var(--text-dim)" }}>{v.dono} · {v.prazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
