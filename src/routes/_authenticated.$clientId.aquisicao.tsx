import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Users,
  Filter,
  CalendarCheck,
  Stethoscope,
  Handshake,
  Wallet,
  Coins,
  Timer,
  TrendingUp,
  Target,
  MessageSquareWarning,
  Repeat,
  Radio,
  ListChecks,
} from "lucide-react";
import { getSapDados, calcularResumo, dadosDeExemplo, REFERENCIA, type Farol, type SapDados, type SapLead } from "@/lib/sap-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Kpi, Painel, Selo, BarraFina, Ajuda } from "@/components/visual";
import { CadastroSap, TrackerAutomatico, MarcosDoCrm } from "@/components/sap-tracker";
import { PlanoSap } from "@/components/sap-plano";

export const Route = createFileRoute("/_authenticated/$clientId/aquisicao")({
  component: AquisicaoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const COR_FAROL: Record<Farol, string> = {
  verde: "var(--good)",
  amarelo: "var(--warn)",
  vermelho: "var(--crit)",
  cinza: "var(--muted)",
};

const ROTULO_FAROL: Record<Farol, string> = { verde: "No ritmo", amarelo: "Atenção", vermelho: "Agir agora", cinza: "Sem dado" };

const pct = (v: number | null) => (v === null ? "sem dado" : `${Math.round(v * 100)}%`);
const brlOuTraco = (v: number | null) => (v === null ? "sem dado" : fmtBRL(v));

function diaDoSistema(d0: string | null): string | null {
  if (!d0) return null;
  const dias = Math.floor((Date.now() - Date.parse(`${d0}T12:00:00-03:00`)) / 86400000);
  if (dias < 0) return `começa em ${-dias} dia(s)`;
  if (dias > 90) return `D${dias} · pós-contrato`;
  return `D${dias} de 90`;
}

function AquisicaoPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  return (
    <div className="space-y-6">
      <CadastroSap clientId={clientId} />
      <PlanoSap clientId={clientId} />
      <TrackerAutomatico clientId={clientId} start={start} end={end} periodLabel={periodLabel} />
      <MarcosDoCrm clientId={clientId} />
      <TrackerManual clientId={clientId} start={start} end={end} periodLabel={periodLabel} />
    </div>
  );
}

// Leads registrados lead a lead em sap_leads (n8n "SAP | Lead → Tracker" ou /api/sap/lead), com
// pontuação A/B/C, toque de fechamento e motivo. Continua valendo para quem preencher por lá.
function TrackerManual({ clientId, start, end, periodLabel }: { clientId: string; start: string; end: string; periodLabel: string }) {
  const [exemplo, setExemplo] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sap", clientId, start, end],
    queryFn: () => getSapDados(clientId, start, end),
  });

  const dados: SapDados | null = exemplo ? dadosDeExemplo(start, end) : (data ?? null);
  const resumo = useMemo(() => (dados ? calcularResumo(dados, start, end) : null), [dados, start, end]);

  if (isLoading && !exemplo) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;

  if (error && !exemplo) {
    return (
      <p style={{ color: "var(--crit)" }}>
        Não consegui ler o Tracker: {(error as Error).message}
      </p>
    );
  }

  if (!dados || !resumo || (!exemplo && dados.leads.length === 0)) {
    return (
      <Painel icone={ListChecks} titulo="Leads registrados um a um (opcional)" resumo="Pontuação A/B/C, toque de fechamento e motivo, quando a clínica registra lead a lead.">
        <div className="space-y-3 text-sm" style={{ color: "var(--text-dim)" }}>
          <p>
            Os números acima já saem do CRM e do WhatsApp. Esta parte só aparece quando os leads também chegam um a um pelo endpoint{" "}
            <code>/api/sap/lead</code> (ou pelo workflow <strong>SAP | Lead → Tracker</strong>), com a pontuação e o toque de fechamento.
          </p>
          <button
            type="button"
            onClick={() => setExemplo(true)}
            className="rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Ver como fica, com dados de exemplo
          </button>
        </div>
      </Painel>
    );
  }

  const r = resumo;
  const dia = diaDoSistema(dados.clinica.d0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}>
          <span>
            <strong style={{ color: "var(--text)" }}>{dados.clinica.nome}</strong> · {periodLabel}
          </span>
          {dia && <Selo cor="var(--accent)">{dia}</Selo>}
          {dados.clinica.status && <Selo>{dados.clinica.status}</Selo>}
          {exemplo && <Selo cor="var(--warn)">dados de exemplo, nada disso está no banco</Selo>}
        </div>
        {exemplo && (
          <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => setExemplo(false)}>
            Sair do exemplo
          </button>
        )}
      </div>

      {/* Semáforo: o que pede ação esta semana */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Semáforo da semana</h2>
          <Ajuda>
            Regras do 08.05 · Leitura Semanal. Vermelho pede ação no mesmo dia; amarelo entra na pauta do check-in. As faixas
            são referências iniciais da Doctor Creator, a validar no piloto, e não dado de mercado.
          </Ajuda>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {r.alertas.map((a) => (
            <div
              key={a.chave}
              className="rounded-xl border p-3.5"
              style={{
                background: `color-mix(in srgb, ${COR_FAROL[a.farol]} 10%, var(--surface))`,
                borderColor: `color-mix(in srgb, ${COR_FAROL[a.farol]} 40%, var(--surface))`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
                  {a.titulo}
                </span>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_FAROL[a.farol] }} title={ROTULO_FAROL[a.farol]} />
              </div>
              <div className="mt-1.5 text-xl font-semibold tabular-nums">{a.valor}</div>
              <div className="mt-1 text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
                {ROTULO_FAROL[a.farol]} · {a.regra}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Funil */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icone={Users} rotulo="Leads" valor={fmtNum(r.leads)} cor="var(--s1)" />
        <Kpi icone={Filter} rotulo="Qualificados (A+B)" valor={fmtNum(r.qualificados)} dica={`${pct(r.leads ? r.qualificados / r.leads : null)} dos leads`} cor="var(--s1)" />
        <Kpi icone={CalendarCheck} rotulo="Agendamentos" valor={fmtNum(r.agendamentos)} dica={`${pct(r.taxaAgendamento)} dos qualificados`} cor="var(--s7)" />
        <Kpi icone={Stethoscope} rotulo="Consultas" valor={fmtNum(r.consultas)} dica={`comparecimento ${pct(r.taxaComparecimento)}`} cor="var(--s7)" />
        <Kpi icone={Handshake} rotulo="Fechamentos" valor={fmtNum(r.fechamentos)} dica={`${pct(r.taxaConversao)} das consultas`} cor="var(--s3)" />
        <Kpi icone={Wallet} rotulo="Receita atribuída" valor={fmtBRL(r.receita)} dica={r.ticketMedio ? `ticket médio ${fmtBRL(r.ticketMedio)}` : undefined} cor="var(--s3)" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icone={Coins} rotulo="Investimento em mídia" valor={fmtBRL(r.investimento)} dica="Meta pelo sync do Hub; outras fontes pelo n8n" cor="var(--s2)" />
        <Kpi icone={Coins} rotulo="Custo por lead" valor={brlOuTraco(r.cpl)} cor="var(--s2)" />
        <Kpi icone={Coins} rotulo="Custo por consulta" valor={brlOuTraco(r.custoConsulta)} cor="var(--s2)" />
        <Kpi icone={TrendingUp} rotulo="Retorno sobre mídia" valor={r.roas === null ? "sem dado" : `${r.roas.toFixed(1).replace(".", ",")}x`} dica="receita atribuída ÷ investimento" cor="var(--s3)" />
        <Kpi icone={Timer} rotulo="1ª resposta (mediana)" valor={r.medianaResposta === null ? "sem dado" : `${Math.round(r.medianaResposta)} min`} dica={`alvo até ${REFERENCIA.respostaMin} min`} cor="var(--s1)" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel icone={Target} titulo="Meta x realizado" resumo="Meta do mês proporcional aos dias do período">
          {r.metas.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Sem metas cadastradas em <code>sap_metas</code>. As metas D90 assinadas na Sessão 2 (03.07) entram aqui por mês.
            </p>
          ) : (
            <ul className="space-y-3">
              {r.metas.map((m) => {
                const ritmo = m.esperado > 0 ? m.realizado / m.esperado : 0;
                const cor = ritmo >= 0.9 ? "var(--good)" : ritmo >= 0.7 ? "var(--warn)" : "var(--crit)";
                const fmt = m.etapa === "receita" ? fmtBRL : (v: number) => fmtNum(Math.round(v));
                return (
                  <li key={m.etapa}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span>{m.rotulo}</span>
                      <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
                        <strong style={{ color: "var(--text)" }}>{fmt(m.realizado)}</strong> de {fmt(m.esperado)} esperado ({Math.round(ritmo * 100)}%)
                      </span>
                    </div>
                    <BarraFina valor={m.realizado} max={Math.max(m.esperado, m.realizado)} cor={cor} />
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>

        <Painel icone={ListChecks} titulo="Por semana" resumo="Leads, consultas e fechamentos pela semana de entrada do lead">
          {r.semanas.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhum lead no período.</p>
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={r.semanas.map((s) => ({ ...s, semana: s.semana.slice(5).split("-").reverse().join("/") }))}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="leads" name="Leads" fill="var(--s1)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="consultas" name="Consultas" fill="var(--s7)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="fechamentos" name="Fechamentos" fill="var(--s3)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Painel>

        <Painel icone={MessageSquareWarning} titulo="Por que não fechou" resumo="Categoria registrada no 07.07 · Registro de Decisão">
          <ListaContagem itens={r.motivos.map((m) => ({ rotulo: m.motivo, total: m.total }))} vazio="Nenhuma decisão negativa registrada no período." cor="var(--s2)" />
        </Painel>

        <Painel icone={Repeat} titulo="Em que toque fechou" resumo="Quanto da receita vem do follow-up (07.06)">
          <ListaContagem itens={r.toques.map((t) => ({ rotulo: t.toque, total: t.total }))} vazio="Nenhum fechamento no período." cor="var(--s3)" />
        </Painel>
      </div>

      <Painel icone={Radio} titulo="Por canal" resumo="Onde nasce o paciente que fecha, e quanto custa">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-2 pr-3 font-medium">Canal</th>
                <th className="py-2 pr-3 text-right font-medium">Leads</th>
                <th className="py-2 pr-3 text-right font-medium">Consultas</th>
                <th className="py-2 pr-3 text-right font-medium">Fechamentos</th>
                <th className="py-2 pr-3 text-right font-medium">Receita</th>
                <th className="py-2 pr-3 text-right font-medium">Investimento</th>
                <th className="py-2 text-right font-medium">Custo por consulta</th>
              </tr>
            </thead>
            <tbody>
              {r.canais.map((c) => (
                <tr key={c.canal} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3">{c.canal}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.leads)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.consultas)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(c.fechamentos)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtBRL(c.receita)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.investimento ? fmtBRL(c.investimento) : "sem mídia"}</td>
                  <td className="py-2 text-right tabular-nums">{c.investimento && c.consultas ? fmtBRL(c.investimento / c.consultas) : "sem dado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <TabelaLeads leads={dados.leads} />
    </div>
  );
}

function ListaContagem({ itens, vazio, cor }: { itens: { rotulo: string; total: number }[]; vazio: string; cor: string }) {
  if (!itens.length) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.total));
  const soma = itens.reduce((s, i) => s + i.total, 0);
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span>{i.rotulo}</span>
            <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
              {fmtNum(i.total)} · {Math.round((i.total / soma) * 100)}%
            </span>
          </div>
          <BarraFina valor={i.total} max={max} cor={cor} />
        </li>
      ))}
    </ul>
  );
}

type FiltroLead = "todos" | "sem_agenda" | "agendados" | "pensando" | "fechados";

const FILTROS: { valor: FiltroLead; rotulo: string; teste: (l: SapLead) => boolean }[] = [
  { valor: "todos", rotulo: "Todos", teste: () => true },
  { valor: "sem_agenda", rotulo: "Qualificados sem agenda", teste: (l) => (l.pontuacao === "A" || l.pontuacao === "B") && !l.agendou },
  { valor: "agendados", rotulo: "Agendados", teste: (l) => !!l.agendou && !l.compareceu },
  { valor: "pensando", rotulo: "Pensando (follow-up)", teste: (l) => l.decisao === "Pensando" },
  { valor: "fechados", rotulo: "Fechados", teste: (l) => l.decisao === "Fechou" },
];

function statusDoLead(l: SapLead): { texto: string; cor: string } {
  if (l.decisao === "Fechou") return { texto: "Fechou", cor: "var(--good)" };
  if (l.decisao === "Não fechou") return { texto: "Não fechou", cor: "var(--crit)" };
  if (l.decisao === "Pensando") return { texto: "Pensando", cor: "var(--warn)" };
  if (l.compareceu === "Não") return { texto: "Faltou", cor: "var(--crit)" };
  if (l.compareceu === "Remarcou") return { texto: "Remarcou", cor: "var(--warn)" };
  if (l.compareceu === "Sim") return { texto: "Consultou", cor: "var(--s7)" };
  if (l.agendou) return { texto: "Agendado", cor: "var(--s7)" };
  return { texto: "Lead", cor: "var(--muted)" };
}

function TabelaLeads({ leads }: { leads: SapLead[] }) {
  const [filtro, setFiltro] = useState<FiltroLead>("todos");
  const teste = FILTROS.find((f) => f.valor === filtro)!.teste;
  const lista = leads.filter(teste).slice(0, 100);
  return (
    <Painel icone={Users} titulo="Leads" resumo="Os 100 mais recentes do filtro. Sem nome nem telefone: o Tracker guarda só o hash.">
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            aria-pressed={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
            className="rounded-full border px-3 py-1 text-xs"
            style={{
              borderColor: "var(--border)",
              background: filtro === f.valor ? "var(--accent-soft)" : "transparent",
              color: filtro === f.valor ? "var(--text)" : "var(--text-dim)",
            }}
          >
            {f.rotulo} · {fmtNum(leads.filter(f.teste).length)}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
              <th className="py-2 pr-3 font-medium">ID</th>
              <th className="py-2 pr-3 font-medium">Entrada</th>
              <th className="py-2 pr-3 font-medium">Canal</th>
              <th className="py-2 pr-3 font-medium">Serviço</th>
              <th className="py-2 pr-3 font-medium">Filtro</th>
              <th className="py-2 pr-3 text-right font-medium">1ª resposta</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => {
              const s = statusDoLead(l);
              return (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 font-mono text-xs">{l.id}</td>
                  <td className="py-2 pr-3 tabular-nums">{new Date(l.data_entrada).toLocaleDateString("pt-BR")}</td>
                  <td className="py-2 pr-3">{l.canal ?? "sem canal"}</td>
                  <td className="py-2 pr-3">{l.servico ?? "não informado"}</td>
                  <td className="py-2 pr-3">{l.pontuacao ?? "sem nota"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {l.tempo_primeira_resposta_min === null ? "sem dado" : `${Math.round(Number(l.tempo_primeira_resposta_min))} min`}
                  </td>
                  <td className="py-2 pr-3">
                    <Selo cor={s.cor}>{s.texto}</Selo>
                    {l.motivo_categoria && (
                      <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>
                        {l.motivo_categoria}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {l.valor_fechado ? fmtBRL(Number(l.valor_fechado)) : l.valor_apresentado ? `${fmtBRL(Number(l.valor_apresentado))} apres.` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && (
          <p className="py-4 text-sm" style={{ color: "var(--text-dim)" }}>
            Nenhum lead neste filtro.
          </p>
        )}
      </div>
    </Painel>
  );
}
