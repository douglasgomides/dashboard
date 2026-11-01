import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, PhoneCall, Sparkles, Tags } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  definirCategoriaMotivoSap, definirSinalSap, getAuditoriasSap, getClinicaSap, getEtapasSap, getSinaisEtapasSap, getSinaisSap, getTrackerAuto,
  getAuditoriaIASap, salvarAuditoriaSap,
} from "@/lib/sap-data";
import { lerTrackerAuto } from "@/lib/sap-auto";
import { CATEGORIAS_MOTIVO, indicadoresAtendimento, METAS_ATENDIMENTO, ROTULO_FALHA, preencherComIA, type AuditoriaSemana } from "@/lib/sap-sinais";
import { somar } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const segunda = (iso: string) => somar(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Indicadores de atendimento das metas assinadas nas Sessões 4 e 5, com a auditoria semanal de conversas (06.09). */
export function AtendimentoSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const j = { de: somar(hoje, -28), ate: somar(hoje, -1) };
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const sinQ = useQuery({ queryKey: ["sap-sinais", clientId, j.de, j.ate], queryFn: () => getSinaisSap(clientId, j.de, j.ate) });
  const autoQ = useQuery({ queryKey: ["sap-auto", clientId, j.de, j.ate], queryFn: () => getTrackerAuto(clientId, j.de, j.ate) });
  const audQ = useQuery({ queryKey: ["sap-auditoria", clinica?.id], queryFn: () => getAuditoriasSap(clinica!.id), enabled: !!clinica });
  const auds = useMemo(() => audQ.data ?? [], [audQ.data]);
  const ind = useMemo(() => indicadoresAtendimento(sinQ.data ?? null, lerTrackerAuto(autoQ.data)?.agendados ?? 0, auds[0] ?? null), [sinQ.data, autoQ.data, auds]);
  if (!clinica) return null;
  const M = METAS_ATENDIMENTO;
  const linha = (rotulo: string, valor: string, meta: string, ok: boolean | null, fonte: string) => (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-1.5 pr-3">{rotulo}</td>
      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums" style={{ color: ok === null ? "var(--muted)" : ok ? "var(--good)" : "var(--crit)" }}>{valor}</td>
      <td className="py-1.5 pr-3 text-right text-xs" style={{ color: "var(--muted)" }}>{meta}</td>
      <td className="py-1.5 text-xs" style={{ color: "var(--muted)" }}>{fonte}</td>
    </tr>
  );
  return (
    <div className="space-y-4">
      <Painel icone={PhoneCall} titulo="Confirmação, follow-up e motivos" resumo="As metas de atendimento assinadas nas Sessões 4 e 5 · últimas 4 semanas"
        ajuda={<>Confirmação e remarcação vêm do CRM quando a equipe marca quais etapas significam "confirmou" e "remarcou" (tela Etapas no funil). F1 em 24 h, "pensando" em cadência e a nota vêm da auditoria semanal de 10 conversas. Motivos vêm do motivo de perda do CRM.</>}>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {linha("Confirmação até a véspera", pct(ind.confirmacao.valor), `meta ≥ ${pct(M.confirmacao)}`, ind.confirmacao.valor === null ? null : ind.confirmacao.valor >= M.confirmacao, ind.confirmacao.fonte === "crm" ? "CRM" : ind.confirmacao.fonte === "auditoria" ? "auditoria" : "marque a etapa \"confirmou\" ou lance a auditoria")}
              {linha("Remarcação", pct(ind.remarcacao), `até ${pct(M.remarcacaoMax)}`, ind.remarcacao === null ? null : ind.remarcacao <= M.remarcacaoMax, ind.remarcacao === null ? "marque a etapa \"remarcou\"" : "CRM")}
              {linha("F1 enviado em até 24 h", pct(ind.f1), `meta ≥ ${pct(M.f1)}`, ind.f1 === null ? null : ind.f1 >= M.f1, ind.f1 === null ? "lance a auditoria" : "auditoria")}
              {linha("\"Pensando\" com cadência ativa", pct(ind.pensando), `meta ≥ ${pct(M.pensando)}`, ind.pensando === null ? null : ind.pensando >= M.pensando, ind.pensando === null ? "lance a auditoria" : "auditoria")}
              {linha("Nota da auditoria de conversas", ind.nota === null ? "—" : `${String(ind.nota).replace(".", ",")} de 12`, `meta ≥ ${M.nota}`, ind.nota === null ? null : ind.nota >= M.nota, ind.nota === null ? "lance a auditoria" : "auditoria")}
            </tbody>
          </table>
        </div>
        <h4 className="mt-3 text-sm font-semibold">Por que não fechou ({ind.totalMotivos} com motivo)</h4>
        {!ind.motivos.length ? (
          <p className="note" style={{ margin: 0 }}>Nenhum perdido com motivo no período. Peça para a recepção escolher o motivo ao marcar como perdido.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {ind.motivos.map((m) => (
              <li key={m.categoria} className="flex items-center gap-2">
                <span className="w-56 shrink-0">{m.categoria}</span>
                <span className="h-2 rounded" style={{ width: `${Math.max(2, m.parte * 100)}%`, maxWidth: "50%", background: "var(--accent)" }} />
                <span className="tabular-nums text-xs" style={{ color: "var(--text-dim)" }}>{m.total} · {pct(m.parte)}</span>
              </li>
            ))}
          </ul>
        )}
        {(sinQ.data?.motivos ?? []).some((m) => m.sugeridos > 0) && isAdmin && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Parte dos motivos está em categoria sugerida pelo nome. Confirme em Etapas no funil.</p>
        )}
      </Painel>
      {isAdmin && <AuditoriaForm clientId={clientId} clinicaId={clinica.id} auds={auds} hoje={hoje} />}
      {!isAdmin && auds.length > 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>Última auditoria de conversas: semana de {dm(auds[0].semana)}.</p>}
    </div>
  );
}

function AuditoriaForm({ clientId, clinicaId, auds, hoje }: { clientId: string; clinicaId: string; auds: AuditoriaSemana[]; hoje: string }) {
  const qc = useQueryClient();
  const semana = segunda(hoje);
  const atual = auds.find((a) => a.semana === semana);
  const pctIn = (v: number | null) => (v === null ? "" : String(Math.round(v * 100)));
  const [f, setF] = useState({ conversas: atual?.conversas ?? 10, nota: atual?.nota_media ?? "", conf: pctIn(atual?.confirmacao_vespera ?? null), f1: pctIn(atual?.f1_24h ?? null), pens: pctIn(atual?.pensando_cadencia ?? null), obs: atual?.observacao ?? "" });
  const num = (s: string | number) => (s === "" || s === null ? null : Number(String(s).replace(",", ".")));
  const fr = (s: string) => (num(s) === null ? null : Math.min(1, Math.max(0, num(s)! / 100)));
  const salvar = useMutation({
    mutationFn: () => salvarAuditoriaSap(clinicaId, { semana, conversas: num(f.conversas), nota_media: num(f.nota), confirmacao_vespera: fr(f.conf), f1_24h: fr(f.f1), pensando_cadencia: fr(f.pens), observacao: f.obs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sap-auditoria", clinicaId] }),
  });
  const iaQ = useQuery({ queryKey: ["sap-auditoria-ia", clientId, semana], queryFn: () => getAuditoriaIASap(clientId, semana) });
  const ia = iaQ.data;
  const usarIA = () => {
    if (!ia) return;
    const p = preencherComIA(ia);
    setF({ ...f, conversas: p.conversas, nota: p.nota === null ? f.nota : String(p.nota), f1: p.f1 === null ? f.f1 : String(p.f1), obs: [f.obs, p.obs].filter(Boolean).join(" · ") });
  };
  const input = (k: keyof typeof f, rot: string, sufixo = "") => (
    <label className="text-xs">{rot}
      <span className="mt-0.5 flex items-center gap-1"><input inputMode="decimal" value={String(f[k])} onChange={(x) => setF({ ...f, [k]: x.target.value })} className="block min-h-[34px] w-20 rounded-md border px-2 text-sm" style={campo} />{sufixo}</span>
    </label>
  );
  return (
    <Painel icone={MessagesSquare} titulo="Auditoria semanal de conversas (06.09)" resumo={`Semana de ${dm(semana)}${atual ? " · lançada" : " · ainda não lançada"}`}
      ajuda={<>Amostra de 10 conversas da semana pela rubrica de 12 pontos. Anote também, pelas conversas e pela agenda, a confirmação até a véspera, o F1 em até 24 h das consultas sem fechamento e quantos "pensando" estão com cadência ativa.</>}>
      {ia && ia.conversas_semana > 0 && (
        <div className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="inline-flex items-center gap-1.5"><Sparkles size={15} aria-hidden /> Sugestão da IA para esta semana</strong>
            {ia.amostra > 0 && <button type="button" onClick={usarIA} className="min-h-[32px] rounded-lg px-3 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>Usar sugestão no formulário</button>}
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {ia.conversas_semana} conversa(s) na semana · {ia.analisadas} analisada(s) pela IA{ia.sem_analise ? ` · ${ia.sem_analise} sem análise atualizada` : ""}.
            {ia.amostra > 0 && <> Amostra das {ia.amostra} mais recentes: nota média {ia.nota_media_0a10 ?? "—"} de 10 (≈ {ia.nota_media_0a10 === null ? "—" : Math.round(ia.nota_media_0a10 * 12) / 10} de 12, estimativa).</>}
          </p>
          {ia.falhas.length > 0 && <p className="mt-1 text-xs">Falhas mais comuns: {ia.falhas.map((x) => `${ROTULO_FALHA[x.falha] ?? x.falha} (${x.n})`).join(", ")}.</p>}
          {ia.abertas > 0 && <p className="mt-1 text-xs">Conversas em aberto: {ia.abertas}, {ia.abertas_sem_follow_up} sem follow-up · {ia.recuperaveis} recuperável(is) sem agendamento.</p>}
          {ia.pontos_a_melhorar.length > 0 && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>A melhorar: {ia.pontos_a_melhorar.slice(0, 4).join(" · ")}</p>}
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>A IA lê cada conversa do WhatsApp (sem dados do paciente). Confirmação até a véspera vem da agenda e continua manual. Revise antes de salvar.</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {input("conversas", "Conversas auditadas")}
        {input("nota", "Nota média (0 a 12)")}
        {input("conf", "Confirmação até a véspera", "%")}
        {input("f1", "F1 em até 24 h", "%")}
        {input("pens", "\"Pensando\" em cadência", "%")}
        <label className="min-w-[200px] flex-1 text-xs">O que corrigir no retreino<input value={f.obs} onChange={(x) => setF({ ...f, obs: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
        <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar semana</button>
      </div>
      {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(salvar.error)}</p>}
      {auds.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}><th className="py-1 pr-3 font-medium">Semana</th><th className="py-1 pr-3 text-right font-medium">Nota</th><th className="py-1 pr-3 text-right font-medium">Confirmação</th><th className="py-1 pr-3 text-right font-medium">F1 24 h</th><th className="py-1 text-right font-medium">Pensando</th></tr></thead>
            <tbody>
              {auds.slice(0, 8).map((a) => (
                <tr key={a.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1 pr-3">{dm(a.semana)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{a.nota_media ?? "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{pct(a.confirmacao_vespera === null ? null : Number(a.confirmacao_vespera))}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{pct(a.f1_24h === null ? null : Number(a.f1_24h))}</td>
                  <td className="py-1 text-right tabular-nums">{pct(a.pensando_cadencia === null ? null : Number(a.pensando_cadencia))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}

/** Tela Etapas no funil: quais etapas significam "confirmou" e "remarcou", e a categoria de cada motivo de perda. */
export function SinaisEMotivos({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const j = { de: somar(hoje, -180), ate: somar(hoje, -1) };
  const etQ = useQuery({ queryKey: ["sap-etapas", clientId], queryFn: () => getEtapasSap(clientId) });
  const sinQ = useQuery({ queryKey: ["sap-sinais-etapas"], queryFn: getSinaisEtapasSap });
  const motQ = useQuery({ queryKey: ["sap-sinais", clientId, j.de, j.ate], queryFn: () => getSinaisSap(clientId, j.de, j.ate) });
  const sinal = useMutation({
    mutationFn: (v: { e: { connection_id: string; pipeline_id: string; status_id: string }; s: "confirmado" | "remarcou"; on: boolean }) => definirSinalSap(v.e, v.s, v.on),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sap-sinais-etapas"] }); qc.invalidateQueries({ queryKey: ["sap-sinais"] }); },
  });
  const cat = useMutation({
    mutationFn: (v: { conn: string; id: string; c: string }) => definirCategoriaMotivoSap(v.conn, v.id, v.c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sap-sinais"] }),
  });
  const ativo = (e: { connection_id: string; pipeline_id: string; status_id: string }, s: string) =>
    (sinQ.data ?? []).some((x) => x.ativo && x.sinal === s && x.crm_connection_id === e.connection_id && x.pipeline_id === e.pipeline_id && x.status_id === e.status_id);
  const etapas = etQ.data ?? [];
  const funis = [...new Set(etapas.map((e) => e.pipeline_name))];
  const lista = motQ.data?.lista ?? [];
  return (
    <div className="space-y-4">
      <Painel icone={PhoneCall} titulo="Etapas de confirmação e remarcação" resumo="Marque as etapas do CRM que significam que o paciente confirmou ou remarcou"
        ajuda={<>Não muda o funil: só conta. Um lead conta como confirmado quando está numa etapa marcada aqui ou passou por ela (o histórico de movimentos é gravado desde a migração do CRM). Se a clínica não tem etapa de confirmação, a confirmação vem da auditoria semanal.</>}>
        {funis.map((f) => (
          <div key={f} className="mt-2 overflow-x-auto">
            <h4 className="mb-1 text-sm font-semibold">{f}</h4>
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {etapas.filter((e) => e.pipeline_name === f).map((e) => (
                  <tr key={`${e.connection_id}-${e.pipeline_id}-${e.status_id}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">{e.status_name}</td>
                    {(["confirmado", "remarcou"] as const).map((s) => (
                      <td key={s} className="py-1.5 pr-3 text-xs">
                        <label className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={ativo(e, s)} disabled={sinal.isPending} onChange={(x) => sinal.mutate({ e, s, on: x.target.checked })} />
                          {s === "confirmado" ? "confirmou" : "remarcou"}
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Painel>
      <Painel icone={Tags} titulo="Motivos de perda por categoria (07.07)" resumo={`${lista.length} motivo(s) usados nos últimos 6 meses`}
        ajuda={<>Cada motivo do CRM ganha uma categoria do SAP. É ela que dispara "objeção de preço, medo ou comparação" (V12) e "paciente sai sem próximo passo" (V13) na leitura da semana. Sem escolha, vale a sugestão pelo nome. No Kommo, os nomes chegam na próxima sincronização.</>}>
        {!lista.length ? <p className="note" style={{ margin: 0 }}>Nenhum perdido com motivo nos últimos 6 meses.</p> : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {lista.map((m) => (
                <tr key={`${m.crm_connection_id}-${m.motivo_id}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3">{m.nome}{/^\d+$/.test(m.nome) && <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>(nome chega na próxima sincronização)</span>}</td>
                  <td className="py-1.5 pr-3 text-right text-xs tabular-nums" style={{ color: "var(--muted)" }}>{m.total}</td>
                  <td className="py-1.5">
                    <select aria-label={`Categoria do motivo ${m.nome}`} value={m.categoria ?? ""} disabled={cat.isPending} onChange={(x) => x.target.value && cat.mutate({ conn: m.crm_connection_id, id: m.motivo_id, c: x.target.value })} className="min-h-[32px] rounded-md border px-1.5 text-sm" style={campo}>
                      <option value="">{m.sugestao ? `Sugestão: ${m.sugestao}` : "Sem categoria (conta como Outro)"}</option>
                      {CATEGORIAS_MOTIVO.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {!m.categoria && m.sugestao && <Selo cor="var(--warn)">sugerida</Selo>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Painel>
    </div>
  );
}
