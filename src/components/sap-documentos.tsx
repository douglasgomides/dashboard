import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Printer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getAcoesSap, getClinicaSap, getFidelizacaoSap, getDocumentoTextoSap, getExecucaoSap, getGastoSemanalSap, getMarcosSap, getPlanoSap, getSinaisSap, getTrackerAuto,
  salvarDocumentoTextoSap, type SapCadastro,
} from "@/lib/sap-data";
import { lerTrackerAuto, montarKpisSap, type TrackerAutoBruto } from "@/lib/sap-auto";
import { avaliarGarantia, janelaBaseline, janelaGarantia, kpisDaGarantia, type KpiPlano, type LinhaPlano } from "@/lib/sap-metas";
import { calcularExecucao } from "@/lib/sap-scores";
import { CRONOGRAMA, dataDoDia, somar } from "@/lib/sap-cronograma";
import { fmtKpi, linhasKpis, planoPorQuinzena, RISCOS_PADRAO, ROTULO_STATUS_D90, SECOES_TEXTO, type StatusKpiD90 } from "@/lib/sap-documentos";
import { hojeBrasilia } from "@/lib/status-fonte";
import { resumoFidelizacao } from "@/lib/sap-fidelizacao";
import { LEGENDA } from "@/components/grafico";

const dmy = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");
const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const COR_STATUS: Record<StatusKpiD90, string> = { atingida: "var(--good)", melhorou: "var(--warn)", nao_melhorou: "var(--crit)", sem_dado: "var(--muted)" };
const th = "py-1.5 pr-3 text-left text-xs font-medium";
const td = "py-1.5 pr-3 align-top";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)", breakInside: "avoid" }}>
      <h3 className="mb-2 text-base font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

/** Texto livre de uma seção: a equipe edita; a clínica lê. Vazio mostra a orientação do modelo. */
function TextoLivre({ clinicaId, documento, secao, dica, textos }: { clinicaId: string; documento: "plano" | "d90"; secao: string; dica: string; textos: Record<string, string> }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [ed, setEd] = useState<string | null>(null);
  const salvar = useMutation({ mutationFn: () => salvarDocumentoTextoSap(clinicaId, documento, secao, ed ?? ""), onSuccess: () => { setEd(null); qc.invalidateQueries({ queryKey: ["sap-doc", clinicaId, documento] }); } });
  const atual = textos[secao] ?? "";
  if (ed !== null)
    return (
      <div className="no-print">
        <textarea value={ed} onChange={(e) => setEd(e.target.value)} rows={5} placeholder={dica} className="w-full rounded-md border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        <div className="mt-1 flex gap-2">
          <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
          <button type="button" onClick={() => setEd(null)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          {salvar.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </div>
      </div>
    );
  return (
    <div>
      {atual ? <p className="whitespace-pre-line text-sm">{atual}</p> : <p className="text-sm italic" style={{ color: "var(--muted)" }}>{isAdmin ? `A preencher: ${dica}` : "Em elaboração."}</p>}
      {isAdmin && <button type="button" onClick={() => setEd(atual)} className="no-print mt-1 text-sm font-semibold underline" style={{ color: "var(--accent)" }}>{atual ? "Editar" : "Escrever"}</button>}
    </div>
  );
}

function Cabecalho({ titulo, clinica, d60, d90, extra }: { titulo: string; clinica: SapCadastro; d60: string; d90: string; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end">
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <Printer size={14} aria-hidden /> Imprimir / salvar PDF
        </button>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#C49A5C" }}>Doctor Creator · Sistema de Aquisição de Pacientes</p>
      <h2 className="mt-1 text-xl font-semibold">{titulo} · {clinica.nome}</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
        D0: {dmy(clinica.d0)} · D60 (sistema completo rodando): {dmy(d60)} · D90: {dmy(d90)}{(clinica.pausas ?? []).length ? " · datas com pausa de prazo" : ""}
        {clinica.servicos?.length ? ` · Serviço prioritário: ${clinica.servicos[0]}` : ""}
        {clinica.ticket_medio ? ` · Ticket médio: ${brl(Number(clinica.ticket_medio))}` : ""}
      </p>
      {extra}
    </div>
  );
}

// ======================================================================== 03.07

export function PlanoAcaoSap({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const planoQ = useQuery({ queryKey: ["sap-plano", c?.id], queryFn: () => getPlanoSap(c!.id), enabled: !!c });
  const marcosQ = useQuery({ queryKey: ["sap-marcos", c?.id], queryFn: () => getMarcosSap(c!.id), enabled: !!c });
  const txtQ = useQuery({ queryKey: ["sap-doc", c?.id, "plano"], queryFn: () => getDocumentoTextoSap(c!.id, "plano"), enabled: !!c });
  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!c.d0) return <p className="note">Defina o D0 em Programa → Editar cadastro para gerar o plano.</p>;
  const pausas = c.pausas ?? [];
  const dataItem = (n: number) => marcosQ.data?.find((m) => m.marco === n)?.concluido_em ?? dataDoDia(c.d0!, pausas, CRONOGRAMA.find((i) => i.n === n)!.alvo, hoje);
  const plano = planoQ.data ?? [];
  const linhas = linhasKpis(plano, () => null);
  const receita = plano.find((p) => p.kpi === "receita_mensal")?.baseline ?? null;
  const textos = txtQ.data ?? {};
  const S = SECOES_TEXTO.plano;
  return (
    <div className="space-y-1">
      <Cabecalho titulo="Plano de Ação e Metas dos 90 Dias" clinica={c} d60={dataDoDia(c.d0, pausas, 60, hoje)} d90={dataDoDia(c.d0, pausas, 90, hoje)}
        extra={<p className="text-sm" style={{ color: "var(--text-dim)" }}>Sessão 1: {dmy(dataItem(9))} · Sessão 2 (assinatura): {dmy(dataItem(11))}</p>} />
      <Secao titulo="1. KPIs, baseline e metas">
        {!linhas.length ? <p className="note" style={{ margin: 0 }}>Defina a baseline e as metas em Metas e garantia.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: "var(--text-dim)" }}><th className={th}>KPI</th><th className={th}>Definição</th><th className={th}>Baseline D0</th><th className={th}>Origem</th><th className={th}>Meta D90</th><th className={th}>Garantia?</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.kpi} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={td}>{l.rotulo}</td><td className={td}>{l.definicao}</td><td className={td}>{fmtKpi(l.kpi, l.baseline)}</td>
                    <td className={td}>{l.origem === "estimado" ? "(E) estimado" : l.origem ?? "—"}</td>
                    <td className={td}>{l.kpi === "custo_consulta" && l.meta === null ? "a definir no D45" : fmtKpi(l.kpi, l.meta)}</td><td className={td}>{l.garantia ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-sm">Receita atribuída (acompanhada, não é meta): baseline {receita === null ? "—" : `${brl(receita)} por mês`}.</p>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Meta é de processo e de taxa, nunca de faturamento. Todos os KPIs são medidos no painel do Sistema de Aquisição.</p>
      </Secao>
      <Secao titulo="2. Paciente ideal: atual × desejado">
        <div className="grid gap-3 md:grid-cols-2">
          {S.slice(0, 2).map((s) => <div key={s.id}><h4 className="text-sm font-semibold">{s.titulo}</h4><TextoLivre clinicaId={c.id} documento="plano" secao={s.id} dica={s.dica} textos={textos} /></div>)}
        </div>
        <p className="mt-2 text-sm">Serviço prioritário: <strong>{c.servicos?.[0] ?? "a definir na Sessão 2"}</strong>.</p>
        <h4 className="mt-2 text-sm font-semibold">{S[2].titulo}</h4>
        <TextoLivre clinicaId={c.id} documento="plano" secao={S[2].id} dica={S[2].dica} textos={textos} />
      </Secao>
      <Secao titulo="3. Plano por quinzena">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--text-dim)" }}><th className={th}>Quinzena</th><th className={th}>O que a clínica faz</th><th className={th}>O que a Doctor Creator entrega</th><th className={th}>Marco</th></tr></thead>
            <tbody>
              {planoPorQuinzena(c.d0, pausas, hoje).map((q) => (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className={td}><strong>{q.id}</strong><div className="text-xs" style={{ color: "var(--muted)" }}>{dm(q.de)} a {dm(q.ate)}</div></td>
                  <td className={td}>{q.clinica.length ? q.clinica.join("; ") : "Manter a rotina e os lançamentos"}</td>
                  <td className={td}>{q.dc.length ? q.dc.join("; ") : "Leitura semanal, ajuste de anúncios e auditoria de conversas"}</td>
                  <td className={td}>{q.marco ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
      <Secao titulo="4. Riscos e o que fazemos se acontecerem">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--text-dim)" }}><th className={th}>Risco</th><th className={th}>Sinal</th><th className={th}>O que fazemos</th><th className={th}>Quem decide</th></tr></thead>
            <tbody>{RISCOS_PADRAO.map((r) => <tr key={r.risco} className="border-t" style={{ borderColor: "var(--border)" }}><td className={td}>{r.risco}</td><td className={td}>{r.sinal}</td><td className={td}>{r.acao}</td><td className={td}>{r.quem}</td></tr>)}</tbody>
          </table>
        </div>
        <h4 className="mt-2 text-sm font-semibold">{S[4].titulo}</h4>
        <TextoLivre clinicaId={c.id} documento="plano" secao={S[4].id} dica={S[4].dica} textos={textos} />
      </Secao>
      <Secao titulo="5. Combinados">
        <ul className="list-disc pl-5 text-sm">
          <li>A Doctor Creator opera os anúncios, dirige a gravação, edita e produz o banco de criativos sem rosto. A clínica grava, aprova peças e paga a verba direto às plataformas.</li>
          <li>A clínica mantém o CRM atualizado com origem, etapa, decisão e valor.</li>
          <li>Peça amarela só vai ao ar com "ciente" do médico registrado.</li>
          <li>O Score de Execução é medido a cada quinzena e compartilhado com a clínica.</li>
        </ul>
        <div className="mt-2"><TextoLivre clinicaId={c.id} documento="plano" secao={S[3].id} dica={S[3].dica} textos={textos} /></div>
      </Secao>
      <Secao titulo="6. Garantia condicionada">
        <p className="text-sm">Se a clínica cumprir a execução (Score de Execução de 80% ou mais no D90) e pelo menos 2 dos 3 KPIs operacionais principais ({kpisDaGarantia(c.consulta_paga !== false).map((k) => linhas.find((l) => l.kpi === k)?.rotulo.toLowerCase() ?? k).join(", ")}) não melhorarem em relação à baseline D0, a Doctor Creator entrega mais 30 dias de acompanhamento sem custo. Não é devolução de dinheiro, não cobre verba de mídia e não promete faturamento.</p>
      </Secao>
      <Secao titulo="7. Ajustes acordados"><p className="text-sm">{c.ajustes_acordados ?? "Nenhum ajuste."}</p></Secao>
      <Secao titulo="8. Aceite">
        <p className="text-sm">Declaro que li o Relatório de Diagnóstico, concordo com a baseline D0 e com as metas D90 acima, e com os combinados deste plano.</p>
        <p className="mt-2 text-sm">Decisor da clínica: <strong>{c.aceite_metas_por ?? c.decisor_nome ?? "________________"}</strong> · Data: <strong>{c.aceite_metas_em ? dmy(c.aceite_metas_em) : "____/____/______"}</strong></p>
        <p className="mt-1 text-sm">Doctor Creator: Fundador · Data: ____/____/______</p>
      </Secao>
    </div>
  );
}

// ======================================================================== 08.07

export function RelatorioD90Sap({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const ontem = somar(hoje, -1);
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const pausas = useMemo(() => c?.pausas ?? [], [c?.pausas]);
  const d0 = c?.d0 ?? null;
  const jan = useMemo(() => {
    if (!d0) return null;
    const ate = (n: number) => { const d = dataDoDia(d0, pausas, n, hoje); return d > ontem ? ontem : d; };
    const base = c?.baseline_de && c?.baseline_ate ? { de: c.baseline_de, ate: c.baseline_ate } : janelaBaseline(d0, hoje);
    return { garantia: janelaGarantia(d0, hoje, pausas), anuncio: { de: dataDoDia(d0, pausas, 28, hoje), ate: ate(90) }, base, ult30: { de: somar(ontem, -29), ate: ontem } };
  }, [d0, pausas, hoje, ontem, c?.baseline_de, c?.baseline_ate]);
  const q = (k: string, j?: { de: string; ate: string }) => ({ queryKey: ["sap-auto", clientId, j?.de, j?.ate, k], queryFn: () => getTrackerAuto(clientId, j!.de, j!.ate), enabled: !!j && j.de <= j.ate });
  const garQ = useQuery(q("g", jan?.garantia));
  const anuQ = useQuery(q("a", jan?.anuncio));
  const baseQ = useQuery(q("b", jan?.base));
  const ultQ = useQuery(q("u", jan?.ult30));
  const planoQ = useQuery({ queryKey: ["sap-plano", c?.id], queryFn: () => getPlanoSap(c!.id), enabled: !!c });
  const execQ = useQuery({ queryKey: ["sap-execucao", c?.id], queryFn: () => getExecucaoSap(c!.id), enabled: !!c });
  const acoesQ = useQuery({ queryKey: ["sap-acoes", c?.id], queryFn: () => getAcoesSap(c!.id), enabled: !!c });
  const sinQ = useQuery({ queryKey: ["sap-sinais", clientId, jan?.anuncio.de, jan?.anuncio.ate], queryFn: () => getSinaisSap(clientId, jan!.anuncio.de, jan!.anuncio.ate), enabled: !!jan && jan.anuncio.de <= jan.anuncio.ate });
  const gastoQ = useQuery({ queryKey: ["sap-gasto-sem", clientId, jan?.anuncio.de, jan?.anuncio.ate], queryFn: () => getGastoSemanalSap(clientId, jan!.anuncio.de, jan!.anuncio.ate), enabled: !!jan && jan.anuncio.de <= jan.anuncio.ate });
  const fidQ = useQuery({ queryKey: ["sap-fidelizacao", c?.id], queryFn: () => getFidelizacaoSap(c!.id), enabled: !!c });
  const txtQ = useQuery({ queryKey: ["sap-doc", c?.id, "d90"], queryFn: () => getDocumentoTextoSap(c!.id, "d90"), enabled: !!c });

  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!c.d0 || !jan) return <p className="note">Defina o D0 em Programa → Editar cadastro para gerar o relatório.</p>;
  const dia = Math.round((Date.parse(hoje) - Date.parse(c.d0)) / 86400000);
  const plano = planoQ.data ?? [];
  const gar = lerTrackerAuto(garQ.data);
  const anu = lerTrackerAuto(anuQ.data);
  const base = lerTrackerAuto(baseQ.data);
  const ult = lerTrackerAuto(ultQ.data);
  const kGar = gar ? montarKpisSap(gar) : null;
  const val = (k: KpiPlano) => (k === "pensando_cadencia" ? null : kGar?.kpis.find((x) => x.id === k)?.valor ?? null);
  const linhas = linhasKpis(plano, val);
  const exec = calcularExecucao(execQ.data ?? [], 90);
  const score = c.score_execucao === null || c.score_execucao === undefined ? exec.d90 : Number(c.score_execucao);
  const garantia = gar ? avaliarGarantia({ plano, atual: gar, consultaPaga: c.consulta_paga !== false, verbaEmDia: c.verba_em_dia !== false, score }) : null;
  const textos = txtQ.data ?? {};
  const S = SECOES_TEXTO.d90;
  const acoes = acoesQ.data ?? [];
  const fid = resumoFidelizacao((fidQ.data ?? []).filter((x) => x.semana >= jan.anuncio.de), null, 99);

  return (
    <div className="space-y-1">
      <Cabecalho titulo="Relatório de Encerramento D90" clinica={c} d60={dataDoDia(c.d0, pausas, 60, hoje)} d90={dataDoDia(c.d0, pausas, 90, hoje)}
        extra={dia < 85 ? <p className="no-print mt-2 rounded-lg p-2 text-sm" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>Prévia: hoje é o D{dia}. O relatório é redigido entre o D85 e o D88. Os números abaixo são parciais.</p> : undefined} />

      <Secao titulo={S[0].titulo}><TextoLivre clinicaId={c.id} documento="d90" secao="resumo" dica={S[0].dica} textos={textos} /></Secao>

      <Secao titulo={`2. KPIs: baseline × meta × resultado (${jan.garantia.previa ? "prévia, " : ""}${dm(jan.garantia.de)} a ${dm(jan.garantia.ate)})`}>
        {!linhas.length ? <p className="note" style={{ margin: 0 }}>Sem baseline e metas no plano.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: "var(--text-dim)" }}><th className={th}>KPI</th><th className={th}>Baseline D0</th><th className={th}>Meta D90</th><th className={th}>Resultado</th><th className={th}>Variação</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.kpi} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={td}>{l.rotulo}{l.garantia ? " *" : ""}</td><td className={td}>{fmtKpi(l.kpi, l.baseline)}</td><td className={td}>{fmtKpi(l.kpi, l.meta)}</td>
                    <td className={td}>{l.kpi === "pensando_cadencia" ? "auditoria" : fmtKpi(l.kpi, l.resultado)}</td><td className={td}>{l.variacao}</td>
                    <td className={td} style={{ color: COR_STATUS[l.status], fontWeight: 600 }}>{ROTULO_STATUS_D90[l.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>* conta para a garantia. Resultado = últimas 4 semanas da janela da garantia. Para tempo de resposta e custo, melhor é menor.</p>
          </div>
        )}
        <h4 className="mt-3 text-sm font-semibold">Indicadores acompanhados (não são meta contratual), período com anúncio</h4>
        <ul className="mt-1 text-sm">
          <li>Receita atribuída: <strong>{anu ? `${brl(anu.receita)} (${anu.fechados} tratamento${anu.fechados === 1 ? "" : "s"})` : "—"}</strong></li>
          <li>Verba de mídia investida (paga pela clínica): <strong>{anu ? brl(anu.investido) : "—"}</strong></li>
          <li>Indicações (canal Indicação no CRM): <strong>{anu?.canais.find((x) => x.canal === "Indicação")?.leads ?? 0}</strong></li>
          {fid.semanas > 0 ? (
            <>
              <li>Retornos e recompras: <strong>{fid.retornos + fid.recompras}</strong></li>
              <li>Pacientes reativados (agendaram): <strong>{fid.reativacao.agendaram} de {fid.reativacao.contatados} contatados</strong></li>
              <li>Indicações registradas: <strong>{fid.indicacoes}</strong>{fid.semCodigo !== null ? ` (${Math.round(fid.semCodigo * 100)}% sem código)` : ""}</li>
              <li>Avaliações novas no Google: <strong>{fid.avaliacoes}</strong></li>
            </>
          ) : (
            <li style={{ color: "var(--muted)" }}>Retornos, recompras, reativação e avaliações: nenhuma semana lançada em Leitura da semana.</li>
          )}
        </ul>
      </Secao>

      <Secao titulo={`3. Funil completo (${dm(jan.anuncio.de)} a ${dm(jan.anuncio.ate)}, período com anúncio)`}>
        {!anu ? <p className="note" style={{ margin: 0 }}>{jan.anuncio.de > jan.anuncio.ate ? "Os anúncios ainda não completaram o período." : "Carregando…"}</p> : <Funil t={anu} />}
      </Secao>

      <Secao titulo="4. Gráficos">
        <Graficos base={base} ult={ult} anu={anu} plano={plano} consultaPaga={c.consulta_paga !== false} gasto={gastoQ.data ?? null} motivos={sinQ.data?.motivos ?? []} />
      </Secao>

      <Secao titulo="5. O que funcionou e o que não funcionou">
        <div className="grid gap-3 md:grid-cols-2">
          <div><h4 className="text-sm font-semibold">Funcionou</h4><TextoLivre clinicaId={c.id} documento="d90" secao="funcionou" dica={S[1].dica} textos={textos} /></div>
          <div><h4 className="text-sm font-semibold">Não funcionou</h4><TextoLivre clinicaId={c.id} documento="d90" secao="nao_funcionou" dica={S[2].dica} textos={textos} /></div>
        </div>
        {acoes.length > 0 && (
          <div className="mt-3">
            <h4 className="text-sm font-semibold">Ações combinadas no programa</h4>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{acoes.filter((a) => a.status === "feita").length} feitas · {acoes.filter((a) => a.status === "nao_feita").length} não feitas · {acoes.filter((a) => a.status === "aberta").length} em aberto</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {acoes.filter((a) => a.status !== "aberta").slice(0, 12).map((a) => <li key={a.id}>{a.status === "feita" ? "Feita" : "Não feita"} ({dm(a.semana)}, {a.lado === "clinica" ? "clínica" : "DC"}): {a.texto}{a.resultado ? ` · ${a.resultado}` : ""}</li>)}
            </ul>
          </div>
        )}
      </Secao>

      <Secao titulo={`6. Score de Execução (11.04): ${score === null ? "—" : `${Math.round(score)}%`}`}>
        <table className="w-full text-sm">
          <tbody>{exec.porCategoria.map((x) => <tr key={x.categoria} className="border-t" style={{ borderColor: "var(--border)" }}><td className={td}>{x.categoria}</td><td className={`${td} text-right`}>{pct(x.pct)}</td></tr>)}</tbody>
        </table>
      </Secao>

      <Secao titulo="7. Status da garantia condicionada">
        <p className="text-sm">Regra (01.02): Score de Execução de pelo menos 80% no D90 e pelo menos 2 dos 3 KPIs principais sem melhora em relação à baseline D0 → +30 dias de acompanhamento sem custo. Não é devolução de dinheiro, não cobre verba de mídia e não promete faturamento.</p>
        {garantia && (
          <ul className="mt-2 text-sm">
            <li>Score de Execução ≥ 80%: <strong>{score === null ? "não informado" : score >= 80 ? `Sim (${Math.round(score)}%)` : `Não (${Math.round(score)}%)`}</strong></li>
            {garantia.kpis.map((k) => <li key={k.kpi}>{linhas.find((l) => l.kpi === k.kpi)?.rotulo ?? k.kpi} melhorou? <strong>{k.resultado === "melhorou" ? "Sim" : k.resultado === "nao_melhorou" ? "Não" : "Não avaliável"}</strong> <span style={{ color: "var(--muted)" }}>· {k.motivo}</span></li>)}
            <li className="mt-1"><strong>{garantia.texto}</strong></li>
          </ul>
        )}
        {c.garantia_status === "aplicada" && c.garantia_inicio && <p className="mt-1 text-sm">Garantia aplicada: {dmy(c.garantia_inicio)} a {dmy(somar(c.garantia_inicio, 29))}.</p>}
      </Secao>

      {S.slice(3).map((s) => <Secao key={s.id} titulo={s.titulo}><TextoLivre clinicaId={c.id} documento="d90" secao={s.id} dica={s.dica} textos={textos} /></Secao>)}

      <Secao titulo="Assinaturas">
        <p className="text-sm">Decisor da clínica: {c.decisor_nome ?? "________________"} · Data: ____/____/______</p>
        <p className="mt-1 text-sm">Fundador, Doctor Creator · Data: ____/____/______</p>
      </Secao>
    </div>
  );
}

function Funil({ t }: { t: TrackerAutoBruto }) {
  const linhas: [string, number, string][] = [
    ["Leads", t.leads, ""],
    ["Qualificados", t.qualificados, t.leads ? `${pct(t.qualificados / t.leads)} dos leads` : ""],
    ["Agendamentos", t.agendados, t.qualificados ? `${pct(t.agendados / t.qualificados)} dos qualificados · ref. 30% a 50%` : ""],
    ["Consultas realizadas", t.compareceram, t.agendados ? `${pct(t.compareceram / t.agendados)} dos agendamentos · ref. 75% a 85%` : ""],
    ["Tratamentos fechados", t.fechados, t.compareceram ? `${pct(t.fechados / t.compareceram)} das consultas · ref. 30% a 50%` : ""],
  ];
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {linhas.map(([e, v, tx]) => <tr key={e} className="border-t" style={{ borderColor: "var(--border)" }}><td className={td}>{e}</td><td className={`${td} text-right tabular-nums font-semibold`}>{v.toLocaleString("pt-BR")}</td><td className={td} style={{ color: "var(--text-dim)" }}>{tx}</td></tr>)}
          <tr className="border-t" style={{ borderColor: "var(--border)" }}><td className={td}>Receita atribuída</td><td className={`${td} text-right tabular-nums font-semibold`}>{brl(t.receita)}</td><td className={td} /></tr>
        </tbody>
      </table>
      {t.canais.some((x) => x.compareceram > 0) && (
        <p className="mt-2 text-sm">Origem das consultas realizadas: {t.canais.filter((x) => x.compareceram > 0).sort((a, b) => b.compareceram - a.compareceram).map((x) => `${x.canal} ${x.compareceram}`).join(", ")}.</p>
      )}
    </div>
  );
}

function Graficos({ base, ult, anu, plano, consultaPaga, gasto, motivos }: { base: TrackerAutoBruto | null; ult: TrackerAutoBruto | null; anu: TrackerAutoBruto | null; plano: LinhaPlano[]; consultaPaga: boolean; gasto: Map<string, number> | null; motivos: { categoria: string; total: number }[] }) {
  const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };
  const g1 = base && ult ? [
    { etapa: "Leads", D0: base.leads, D90: ult.leads },
    { etapa: "Agendamentos", D0: base.agendados, D90: ult.agendados },
    { etapa: "Consultas", D0: base.compareceram, D90: ult.compareceram },
    { etapa: "Fechados", D0: base.fechados, D90: ult.fechados },
  ] : null;
  const semanas = anu?.semanas ?? [];
  const meta = (k: KpiPlano) => plano.find((p) => p.kpi === k)?.meta ?? null;
  const kConv = consultaPaga ? "conversao" : "agendamento";
  const g2 = semanas.map((s) => ({ semana: dm(s.semana), Comparecimento: s.agendados ? Math.round((s.compareceram / s.agendados) * 100) : null, [consultaPaga ? "Conversão" : "Agendamento"]: consultaPaga ? (s.compareceram ? Math.round((s.fechados / s.compareceram) * 100) : null) : null }));
  const g3 = semanas.map((s) => { const gs = gasto?.get(s.semana) ?? 0; return { semana: dm(s.semana), Leads: s.leads, "Custo por consulta": s.compareceram && gs ? Math.round(gs / s.compareceram) : null }; });
  const g5 = (anu?.canais ?? []).filter((x) => x.compareceram > 0).map((x) => ({ canal: x.canal, Consultas: x.compareceram }));
  const vazio = (t: string) => <p className="text-sm" style={{ color: "var(--muted)" }}>{t}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div><h4 className="text-sm font-semibold">G1 · Funil D0 × últimos 30 dias</h4>
        {g1 ? <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={g1} layout="vertical" margin={{ left: 20 }}><CartesianGrid stroke="var(--grid)" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="etapa" tick={{ fontSize: 11 }} width={90} /><Tooltip {...tip} /><Legend {...LEGENDA} /><Bar dataKey="D0" fill="var(--muted)" /><Bar dataKey="D90" fill="var(--accent)" /></BarChart></ResponsiveContainer></div> : vazio("Sem dado da baseline ou dos últimos 30 dias.")}
      </div>
      <div><h4 className="text-sm font-semibold">G2 · Evolução semanal dos KPIs da garantia (%)</h4>
        {g2.length >= 2 ? <div style={{ height: 220 }}><ResponsiveContainer><LineChart data={g2}><CartesianGrid stroke="var(--grid)" vertical={false} /><XAxis dataKey="semana" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} domain={[0, 100]} /><Tooltip {...tip} /><Legend {...LEGENDA} />
          <Line dataKey="Comparecimento" stroke="var(--accent)" connectNulls dot />{consultaPaga && <Line dataKey="Conversão" stroke="var(--good)" connectNulls dot />}
          {meta("comparecimento") !== null && <ReferenceLine y={Math.round(meta("comparecimento")! * 100)} stroke="var(--accent)" strokeDasharray="5 4" />}
          {meta(kConv) !== null && consultaPaga && <ReferenceLine y={Math.round(meta(kConv)! * 100)} stroke="var(--good)" strokeDasharray="5 4" />}
        </LineChart></ResponsiveContainer></div> : vazio("Menos de 2 semanas com anúncio.")}
        <p className="text-xs" style={{ color: "var(--muted)" }}>Tracejado: meta D90. Tempo de 1ª resposta aparece na tabela da seção 2 (mediana das 4 semanas).</p>
      </div>
      <div><h4 className="text-sm font-semibold">G3 · Leads e custo por consulta realizada por semana</h4>
        {g3.length >= 2 ? <div style={{ height: 220 }}><ResponsiveContainer><ComposedChart data={g3}><CartesianGrid stroke="var(--grid)" vertical={false} /><XAxis dataKey="semana" tick={{ fontSize: 11 }} /><YAxis yAxisId="l" tick={{ fontSize: 11 }} /><YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11 }} /><Tooltip {...tip} /><Legend {...LEGENDA} /><Bar yAxisId="l" dataKey="Leads" fill="var(--accent)" /><Line yAxisId="c" dataKey="Custo por consulta" stroke="var(--warn)" connectNulls dot /></ComposedChart></ResponsiveContainer></div> : vazio("Menos de 2 semanas com anúncio.")}
      </div>
      <div><h4 className="text-sm font-semibold">G4 · Motivos de não fechamento</h4>
        {motivos.length ? <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={[...motivos].sort((a, b) => b.total - a.total)} layout="vertical" margin={{ left: 40 }}><CartesianGrid stroke="var(--grid)" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="categoria" tick={{ fontSize: 10 }} width={130} /><Tooltip {...tip} /><Bar dataKey="total" name="Perdidos" fill="var(--crit)" /></BarChart></ResponsiveContainer></div> : vazio("Nenhum perdido com motivo no período.")}
      </div>
      <div className="lg:col-span-2"><h4 className="text-sm font-semibold">G5 · Origem das consultas realizadas</h4>
        {g5.length ? <div style={{ height: 200 }}><ResponsiveContainer><BarChart data={g5}><CartesianGrid stroke="var(--grid)" vertical={false} /><XAxis dataKey="canal" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip {...tip} /><Bar dataKey="Consultas" fill="var(--accent)" /></BarChart></ResponsiveContainer></div> : vazio("Nenhuma consulta realizada no período.")}
      </div>
    </div>
  );
}
