import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Gauge, ListTree, Radio, ShieldCheck, Target, TrendingDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DadoIncompleto } from "@/components/sap-kpi";
import { Painel, Selo, BarraFina } from "@/components/visual";
import { fmtBRL, fmtNum } from "@/lib/format";
import { definirMarcoSap, diaAtual, faseDoDia, getClinicaSap, getEtapasSap, getTrackerAuto, proximoMarco, salvarClinicaSap, type EtapaSap } from "@/lib/sap-data";
import { lerTrackerAuto, montarKpisSap, MARCOS_SAP, type Farol, type KpiSap } from "@/lib/sap-auto";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

const COR: Record<Farol, string> = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)", cinza: "var(--muted)" };
const ROTULO: Record<Farol, string> = { verde: "No ritmo", amarelo: "Atenção", vermelho: "Agir agora", cinza: "Acompanhar" };
const ROTULO_STATUS: Record<string, string> = { onboarding: "Onboarding", rodando: "Rodando", pausada: "Pausada", encerrada: "Encerrada" };

const campo = "min-h-[40px] w-full rounded-lg border px-3 text-sm";
const estiloCampo = { borderColor: "var(--border)", background: "var(--surface-2, var(--surface))", color: "var(--text)" } as const;

// ---------------------------------------------------------------------------
// Cadastro: liga o cliente do Hub ao SAP (D0, status, serviços, ticket). Só admin edita.

export function CadastroSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: clinica, isLoading, error } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const [editando, setEditando] = useState(false);

  if (isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Carregando cadastro…</p>;
  if (error) return <p className="text-sm" style={{ color: "var(--crit)" }}>Não consegui ler o cadastro do SAP: {mensagemDeErroAcao(error)}</p>;

  if (!clinica || editando) {
    if (!isAdmin) {
      return (
        <Painel icone={Target} titulo="Sistema de Aquisição de Pacientes" resumo="Esta clínica ainda não está no programa. Os números abaixo já saem do CRM e do WhatsApp." >
          <span />
        </Painel>
      );
    }
    return (
      <Painel
        icone={Target}
        titulo={clinica ? "Editar cadastro no SAP" : "Ativar o Sistema de Aquisição para este cliente"}
        resumo={clinica ? "D0, status, serviços e ticket." : "Os números abaixo já funcionam sem cadastro (servem de Raio-X). O cadastro liga a linha do tempo D0 a D90."}
        destaque={!clinica}
      >
        <FormCadastro
          clientId={clientId}
          inicial={clinica ? { d0: clinica.d0 ?? "", status: clinica.status ?? "onboarding", servicos: (clinica.servicos ?? []).join(", "), ticket: clinica.ticket_medio ? String(clinica.ticket_medio) : "", piloto: !!clinica.piloto } : null}
          onPronto={() => {
            setEditando(false);
            qc.invalidateQueries({ queryKey: ["sap-cadastro", clientId] });
            qc.invalidateQueries({ queryKey: ["sap-portfolio"] });
          }}
          onCancelar={clinica ? () => setEditando(false) : undefined}
        />
      </Painel>
    );
  }

  const dia = diaAtual(clinica.d0, clinica.pausas);
  const marco = proximoMarco(dia);
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <Target size={18} aria-hidden style={{ color: "var(--accent)" }} />
        <strong className="text-sm">Sistema de Aquisição</strong>
        {clinica.piloto && <Selo cor="var(--warn)">piloto</Selo>}
        {clinica.status && <Selo>{ROTULO_STATUS[clinica.status] ?? clinica.status}</Selo>}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <CalendarDays size={15} aria-hidden style={{ color: "var(--muted)" }} />
        {dia === null ? (
          <span style={{ color: "var(--text-dim)" }}>sem D0 definido</span>
        ) : (
          <span>
            <strong className="tabular-nums">{dia < 0 ? `começa em ${-dia} dia(s)` : `D${dia}`}</strong>
            {dia >= 0 && dia <= 90 ? " de 90" : ""} · {faseDoDia(dia)}
          </span>
        )}
      </div>
      {marco && (
        <div className="text-sm" style={{ color: marco.faltam <= 2 ? "var(--crit)" : "var(--text-dim)" }}>
          Próximo marco: <strong style={{ color: "var(--text)" }}>{marco.nome}</strong> (D{marco.dia}, {marco.faltam === 0 ? "hoje" : `em ${marco.faltam} dia(s)`})
        </div>
      )}
      {(clinica.servicos?.length || clinica.ticket_medio) && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {[clinica.servicos?.join(", "), clinica.ticket_medio ? `ticket ${fmtBRL(Number(clinica.ticket_medio))}` : null].filter(Boolean).join(" · ")}
        </div>
      )}
      {isAdmin && (
        <button type="button" onClick={() => setEditando(true)} className="ml-auto text-xs underline" style={{ color: "var(--text-dim)" }}>
          Editar cadastro
        </button>
      )}
    </section>
  );
}

type ValoresCadastro = { d0: string; status: string; servicos: string; ticket: string; piloto: boolean };

function FormCadastro({ clientId, inicial, onPronto, onCancelar }: { clientId: string; inicial: ValoresCadastro | null; onPronto: () => void; onCancelar?: () => void }) {
  const [v, setV] = useState<ValoresCadastro>(inicial ?? { d0: "", status: "onboarding", servicos: "", ticket: "", piloto: false });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () =>
      salvarClinicaSap(clientId, {
        d0: v.d0 || null,
        status: v.status,
        servicos: v.servicos.split(",").map((s) => s.trim()).filter(Boolean),
        ticket: v.ticket ? Number(v.ticket.replace(/\./g, "").replace(",", ".")) || null : null,
        piloto: v.piloto,
      }),
    onSuccess: onPronto,
    onError: (e) => setErro(mensagemDeErroAcao(e)),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    salvar.mutate();
  }
  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs" style={{ color: "var(--text-dim)" }}>
        D0 (dia da assinatura)
        <input type="date" value={v.d0} onChange={(e) => setV({ ...v, d0: e.target.value })} className={campo} style={estiloCampo} />
      </label>
      <label className="text-xs" style={{ color: "var(--text-dim)" }}>
        Status
        <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={campo} style={estiloCampo}>
          {Object.entries(ROTULO_STATUS).map(([id, r]) => (
            <option key={id} value={id}>{r}</option>
          ))}
        </select>
      </label>
      <label className="text-xs" style={{ color: "var(--text-dim)" }}>
        Serviços (separados por vírgula)
        <input value={v.servicos} onChange={(e) => setV({ ...v, servicos: e.target.value })} placeholder="Ex.: Bioestimulador, Harmonização" className={campo} style={estiloCampo} />
      </label>
      <label className="text-xs" style={{ color: "var(--text-dim)" }}>
        Ticket médio do serviço principal (R$)
        <input inputMode="decimal" value={v.ticket} onChange={(e) => setV({ ...v, ticket: e.target.value })} placeholder="Ex.: 4500" className={campo} style={estiloCampo} />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={v.piloto} onChange={(e) => setV({ ...v, piloto: e.target.checked })} />
        Piloto (cliente de outro produto, para validar os números antes do primeiro contrato)
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:justify-end">
        {erro && <span className="text-sm" style={{ color: "var(--crit)" }}>{erro}</span>}
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="min-h-[40px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={salvar.isPending} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
          {salvar.isPending ? "Salvando…" : inicial ? "Salvar" : "Ativar o SAP"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tracker automático: os 6 KPIs oficiais + qualidade do dado + funil, canal e semana.

export function TrackerAutomatico({ clientId, start, end, periodLabel }: { clientId: string; start: string; end: string; periodLabel: string }) {
  const { isAdmin } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["sap-auto", clientId, start, end], queryFn: () => getTrackerAuto(clientId, start, end) });
  const bruto = useMemo(() => lerTrackerAuto(data), [data]);
  const leitura = useMemo(() => (bruto ? montarKpisSap(bruto) : null), [bruto]);

  if (isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Calculando os números do SAP…</p>;
  if (error) return <p className="text-sm" style={{ color: "var(--crit)" }}>Não consegui calcular o tracker: {mensagemDeErroAcao(error)}</p>;
  if (!bruto || !leitura) return null;

  if (!bruto.tem_crm) {
    return (
      <Painel icone={Gauge} titulo="Tracker do SAP" resumo="Sem CRM ligado ao Nexo.">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          O tracker lê os leads do CRM e as conversas do WhatsApp. Ligue o CRM da clínica em Configurações do cliente para os números aparecerem.
        </p>
      </Painel>
    );
  }

  const maxFunil = Math.max(1, ...leitura.funil.map((f) => f.valor));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Os 6 números do SAP</h2>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {periodLabel} · leads pela data de entrada · direto do CRM, WhatsApp e Meta
        </span>
      </div>

      {leitura.pendencias.length > 0 && (
        <section className="rounded-xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, var(--border))", background: "color-mix(in srgb, var(--warn) 8%, var(--surface))" }}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList size={16} aria-hidden style={{ color: "var(--warn)" }} /> Para os números ficarem confiáveis
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--text)" }}>
            {leitura.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          {isAdmin && leitura.pendencias.some((p) => /^Marcar/.test(p)) && (
            <Link to="/sap/$clientId/etapas" params={{ clientId }} className="mt-2 inline-block text-sm font-semibold underline" style={{ color: "var(--accent)" }}>
              Marcar as etapas do CRM agora
            </Link>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leitura.kpis.map((k) => (
          <CardKpi key={k.id} k={k} clientId={clientId} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel icone={ShieldCheck} titulo="Qualidade do dado" resumo="Regras do 03.07: sem isso, meta e garantia não valem">
          <ul className="space-y-3">
            {leitura.checagens.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                {c.ok === null ? (
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--muted)" }} aria-label="Sem dado" />
                ) : c.ok ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} aria-label="OK" />
                ) : (
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: "var(--crit)" }} aria-label="Fora da regra" />
                )}
                <div className="text-sm">
                  <div className="font-medium">
                    {c.titulo} <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>· {c.regra}</span>
                  </div>
                  <div style={{ color: "var(--text-dim)" }}>{c.texto}</div>
                  {c.falta && <div className="mt-0.5 text-xs" style={{ color: "var(--crit)" }}>{c.falta}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel icone={TrendingDown} titulo="Funil do período" resumo="Até onde os leads que entraram no período chegaram">
          <ul className="space-y-2.5">
            {leitura.funil.map((f, i) => {
              const ant = i > 0 ? leitura.funil[i - 1].valor : null;
              return (
                <li key={f.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span>{f.rotulo}</span>
                    <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
                      <strong style={{ color: "var(--text)" }}>{fmtNum(f.valor)}</strong>
                      {ant ? ` · ${Math.round((f.valor / ant) * 100)}% da etapa anterior` : ""}
                    </span>
                  </div>
                  <BarraFina valor={f.valor} max={maxFunil} cor="var(--s1)" />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            O CRM guarda só a etapa atual de cada lead: quem foi perdido depois de agendar só conta como agendado se a etapa ou o motivo disser.
          </p>
        </Painel>
      </div>

      <Painel icone={Radio} titulo="Por canal" resumo="Canal pela origem preenchida no CRM">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-2 pr-3 font-medium">Canal</th>
                <th className="py-2 pr-3 text-right font-medium">Leads</th>
                <th className="py-2 pr-3 text-right font-medium">Agendados</th>
                <th className="py-2 pr-3 text-right font-medium">Consultas</th>
                <th className="py-2 pr-3 text-right font-medium">Fechados</th>
                <th className="py-2 text-right font-medium">Receita</th>
              </tr>
            </thead>
            <tbody>
              {[...bruto.canais].sort((a, b) => b.leads - a.leads).map((c) => (
                <tr key={c.canal} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3">{c.canal === "Sem origem" ? <span style={{ color: "var(--crit)" }}>Sem origem</span> : c.canal}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.leads)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.agendados)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.compareceram)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.fechados)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtBRL(c.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bruto.canais.length === 0 && <p className="py-3 text-sm" style={{ color: "var(--text-dim)" }}>Nenhum lead no período.</p>}
        </div>
      </Painel>

      {bruto.semanas.length > 1 && (
        <Painel icone={CalendarDays} titulo="Por semana" resumo="Pela semana de entrada do lead (segunda a domingo)">
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={bruto.semanas.map((s) => ({ ...s, semana: s.semana.slice(5, 10).split("-").reverse().join("/") }))}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="semana" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="leads" name="Leads" fill="var(--s1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="agendados" name="Agendados" fill="var(--s7)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="fechados" name="Fechados" fill="var(--s3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>
      )}
    </div>
  );
}

function CardKpi({ k, clientId }: { k: KpiSap; clientId: string }) {
  const cor = COR[k.farol];
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: k.farol === "cinza" ? "var(--surface)" : `color-mix(in srgb, ${cor} 9%, var(--surface))`, borderColor: k.farol === "cinza" ? "var(--border)" : `color-mix(in srgb, ${cor} 40%, var(--border))` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{k.titulo}</span>
        {k.valor !== null && k.ehMeta && k.farol !== "cinza" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: cor }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cor }} aria-hidden /> {ROTULO[k.farol]}
          </span>
        )}
      </div>
      {k.incompleto ? <DadoIncompleto inc={k.incompleto} clientId={clientId} /> : (
        <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: k.valor === null ? "var(--muted)" : "var(--text)", fontSize: k.valor === null ? "1rem" : undefined }}>
          {k.texto}
        </div>
      )}
      <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>{k.base}</div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{k.regra}</div>
      {k.amostraPequena && k.valor !== null && (
        <div className="mt-1.5">
          <Selo cor="var(--warn)" titulo="Abaixo da amostra mínima do SAP (30 qualificados, 20 agendados, 15 consultas)">amostra pequena</Selo>
        </div>
      )}
      {k.estimativa && <p className="mt-1.5 text-[11px]" style={{ color: "var(--warn)" }}>Estimativa: {k.estimativa}</p>}
      {k.falta && !k.incompleto && <p className="mt-1.5 text-[11px]" style={{ color: "var(--crit)" }}>{k.falta}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marcos do CRM: o que cada etapa significa no funil do SAP. Só admin.

export function MarcosDoCrm({ clientId, abertoInicial = false }: { clientId: string; abertoInicial?: boolean }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["sap-etapas", clientId], queryFn: () => getEtapasSap(clientId), enabled: isAdmin });
  const [aberto, setAberto] = useState(abertoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const marcar = useMutation({
    mutationFn: async (lista: { e: EtapaSap; marco: string | null }[]) => {
      for (const x of lista) await definirMarcoSap(x.e, x.marco);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sap-etapas", clientId] });
      qc.invalidateQueries({ queryKey: ["sap-auto", clientId] });
    },
    onError: (e) => setErro(mensagemDeErroAcao(e)),
  });

  if (!isAdmin) return null;
  if (isLoading) return null;
  if (error) return <p className="text-sm" style={{ color: "var(--crit)" }}>Não consegui ler as etapas do CRM: {mensagemDeErroAcao(error)}</p>;
  const etapas = data ?? [];
  if (!etapas.length) return null;

  const marcadas = etapas.filter((e) => e.marco).length;
  const sugestoesPendentes = etapas.filter((e) => !e.marco && e.sugestao);
  const funis = [...new Set(etapas.map((e) => e.pipeline_name))];

  return (
    <div id="marcos">
      <Painel
        icone={ListTree}
        titulo="Etapas do CRM no funil do SAP"
        resumo={`${marcadas} de ${etapas.length} etapas marcadas. É isso que faz o comparecimento, a conversão e o custo por consulta aparecerem.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAberto((x) => !x)} className="min-h-[40px] rounded-lg border px-3 text-sm font-medium" style={{ borderColor: "var(--border)" }} aria-expanded={aberto}>
            {aberto ? "Fechar" : "Marcar etapas"}
          </button>
          {sugestoesPendentes.length > 0 && (
            <button
              type="button"
              disabled={marcar.isPending}
              onClick={() => marcar.mutate(sugestoesPendentes.map((e) => ({ e, marco: e.sugestao })))}
              className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {marcar.isPending ? "Salvando…" : `Aceitar ${sugestoesPendentes.length} sugestão(ões) pelo nome`}
            </button>
          )}
          {erro && <span className="text-sm" style={{ color: "var(--crit)" }}>{erro}</span>}
        </div>
        {aberto && (
          <div className="mt-3 space-y-4">
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              {MARCOS_SAP.map((m) => `${m.rotulo}: ${m.explica}`).join(" · ")}
            </p>
            {funis.map((f) => (
              <div key={f}>
                <h4 className="mb-1 text-sm font-semibold">{f}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <tbody>
                      {etapas.filter((e) => e.pipeline_name === f).map((e) => (
                        <tr key={`${e.connection_id}-${e.pipeline_id}-${e.status_id}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1.5 pr-3">{e.status_name}</td>
                          <td className="py-1.5 pr-3 text-right text-xs tabular-nums" style={{ color: "var(--muted)" }}>{fmtNum(e.total)} leads</td>
                          <td className="py-1.5">
                            <select
                              aria-label={`Marco do SAP para a etapa ${e.status_name}`}
                              value={e.marco ?? ""}
                              disabled={marcar.isPending}
                              onChange={(ev) => marcar.mutate([{ e, marco: ev.target.value || null }])}
                              className="min-h-[34px] rounded-md border px-2 text-sm"
                              style={estiloCampo}
                            >
                              <option value="">{e.sugestao ? `Sem marco (sugestão: ${MARCOS_SAP.find((m) => m.id === e.sugestao)?.rotulo})` : "Sem marco"}</option>
                              {MARCOS_SAP.map((m) => (
                                <option key={m.id} value={m.id}>{m.rotulo}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Painel>
    </div>
  );
}
