import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { statusDoCliente, diasDeAtraso, ddmm } from "@/lib/saude-fontes";
import { motivoDaLinha, COR_DONO } from "@/lib/motivos";
import { SeloDono } from "@/components/selo-dono";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { getAdsPorDia, getAdsDiagnosticoPorObjetivo, getClientFontes } from "@/lib/client-data";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtBRL } from "@/lib/format";
import {
  GRUPOS,
  EXPLICA_CATEGORIA,
  ORDEM_CATEGORIAS,
  conversaMaisBarata,
  planoDeAcao,
  limitacoesDeAnuncios,
  unidade,
  type CampanhaDiag,
  type Categoria,
  type DiagnosticoAds,
} from "@/lib/anuncios-objetivo";
import { BENCHMARKS, avaliar, ROTULO_FAIXA, COR_FAIXA } from "@/lib/benchmarks";
import { ROTULO_CONFIANCA } from "@/lib/insight";
import { InsightCard, ListaLimitacoes, SeloStatus, OQueE } from "@/components/insight-card";
import {
  Wallet,
  MessageCircle,
  Coins,
  Eye,
  MousePointerClick,
  Percent,
  PauseCircle,
  AlertTriangle,
  Info,
  CalendarDays,
  Layers,
  ListChecks,
  Zap,
  Gauge,
  ShieldAlert,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { Painel, Kpi, Selo, Miniatura, BarraFina, Ajuda } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/anuncios")({
  component: AnunciosPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const porCem = (v: number | null) => (v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

// Faixa curta com ícone; o texto longo fica no "i".
function Faixa({
  icone: Icon,
  cor = "var(--accent)",
  alerta = false,
  ajuda,
  children,
}: {
  icone: LucideIcon;
  cor?: string;
  alerta?: boolean;
  ajuda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm"
      style={{
        background: alerta ? `color-mix(in srgb, ${cor} 12%, transparent)` : "var(--accent-soft)",
        borderColor: "var(--border)",
      }}
    >
      <Icon size={16} aria-hidden className="shrink-0" style={{ color: cor }} />
      <div className="min-w-0 flex-1">{children}</div>
      {ajuda && <Ajuda>{ajuda}</Ajuda>}
    </div>
  );
}

// Quando a fonte está parada, diz POR QUÊ e de quem é a ação (pagamento, campanhas desligadas, acesso vencido...).
function MotivoParada({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["client-sync-status", clientId],
    queryFn: () => statusDoCliente(clientId),
    staleTime: 60_000,
    retry: false,
  });
  const l = data?.find((x) => x.fonte === "anuncios");
  const parada = l?.data_ate ? diasDeAtraso(l.data_ate) > 3 : false;
  const m = parada || l?.motivo ? motivoDaLinha(l) : null;
  if (!l || !m) return null;
  return (
    <Faixa icone={AlertTriangle} cor={COR_DONO[m.dono]} alerta>
      <div className="flex flex-wrap items-center gap-2">
        <b>{l.data_ate ? `Sem dado novo desde ${ddmm(l.data_ate)}` : "Sem dado de anúncios"}</b>
        <SeloDono dono={m.dono} />
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        {m.texto}
      </div>
    </Faixa>
  );
}

// ---------- categoria ----------
const TOM_CATEGORIA: Record<Categoria, "bom" | "atencao" | "ruim" | null> = {
  "Escalar agora": "bom",
  Manter: null,
  "Revisar criativo": "atencao",
  "Revisar público": "atencao",
  Cortar: "ruim",
  "Sem dados suficientes": null,
};
const COR_CATEGORIA: Record<Categoria, string> = {
  "Escalar agora": "var(--good)",
  Manter: "var(--text-dim)",
  "Revisar criativo": "var(--warn)",
  "Revisar público": "var(--warn)",
  Cortar: "var(--crit)",
  "Sem dados suficientes": "var(--muted)",
};
function SeloCategoria({ c }: { c: Categoria }) {
  const tom = TOM_CATEGORIA[c];
  return tom ? <SeloStatus tom={tom} texto={c} /> : <Selo cor={COR_CATEGORIA[c]}>{c}</Selo>;
}

function shortCampanha(nome: string) {
  return nome.length > 64 ? nome.slice(0, 63) + "…" : nome;
}

// ---------- bloco: Se eu tivesse que agir hoje ----------
function AgirHoje({ d, clientId }: { d: DiagnosticoAds; clientId: string }) {
  const plano = useMemo(() => planoDeAcao(d), [d]);
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Zap size={18} aria-hidden style={{ color: "var(--accent)" }} /> Se eu tivesse que agir hoje, faria isso:
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        Cada campanha é comparada só com as do mesmo objetivo. Mudanças de verba sempre em passos de 20%: mais que isso faz a Meta
        reiniciar o aprendizado e o custo sobe por alguns dias.
      </p>
      {plano.length === 0 ? (
        <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
          Nenhuma mudança de verba urgente neste período: nenhuma campanha custa o dobro das outras do mesmo objetivo e nenhuma se
          destaca o bastante para receber mais.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {plano.map((i, k) => (
            <li key={i.id} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                {k + 1}
              </span>
              <div className="min-w-0 flex-1">
                <InsightCard insight={i} clientId={clientId} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------- bloco: resumo por objetivo ----------
function PorObjetivo({ d }: { d: DiagnosticoAds }) {
  const cmp = conversaMaisBarata(d);
  return (
    <Painel
      icone={Layers}
      titulo="Para onde foi a verba, por objetivo"
      resumo="Cada objetivo tem um resultado diferente"
      cor="var(--s7)"
      ajuda={
        <>
          O objetivo é escolhido ao criar a campanha e diz à Meta o que buscar: conversa, cadastro, clique ou aparecer para mais gente.
          Por isso cada objetivo tem o seu resultado e o seu custo, e só se compara campanha com campanha do mesmo objetivo. A única
          comparação entre objetivos é quanto custa uma conversa vinda de cada um.
        </>
      }
    >
      {cmp && (
        <div className="mb-4">
          <Faixa icone={AlertTriangle} cor="var(--crit)" alerta>
            Uma conversa vinda de campanha de <b>{GRUPOS[cmp.caro.grupo].curto}</b> custou{" "}
            <b>{cmp.caro.custoPorConversa != null ? fmtBRL(cmp.caro.custoPorConversa) : "—"}</b>
            {cmp.vezes != null ? ` (${cmp.vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x mais)` : ""}; de campanha de{" "}
            <b>{GRUPOS[cmp.barato.grupo].curto}</b>, <b>{fmtBRL(cmp.barato.custoPorConversa)}</b>.
          </Faixa>
        </div>
      )}
      <ul className="space-y-4">
        {d.grupos.map((g) => {
          const G = GRUPOS[g.grupo];
          const fatia = d.gasto > 0 ? g.gasto / d.gasto : 0;
          return (
            <li key={g.grupo}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="font-medium">{G.nome}</span>
                <span className="tabular-nums">
                  <b className="font-semibold">{fmtBRL(g.gasto)}</b>
                  <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                    {Math.round(fatia * 100)}% da verba
                  </span>
                </span>
              </div>
              <div className="mt-1">
                <BarraFina valor={g.gasto} max={d.gasto} cor="var(--s7)" />
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                {G.paraQue}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                <span>
                  {g.campanhas} {g.campanhas === 1 ? "campanha" : "campanhas"}
                </span>
                {G.porMil ? (
                  <span>{int(g.resultados * 1000)} aparições</span>
                ) : g.grupo !== "outro" ? (
                  <span>
                    {int(g.resultados)} {g.resultados === 1 ? G.resultado : G.resultadoPlural}
                  </span>
                ) : null}
                {g.custoPorResultado != null && g.grupo !== "outro" && (
                  <span>
                    custo: <b style={{ color: "var(--text)" }}>{unidade(g.grupo, g.custoPorResultado)}</b>
                  </span>
                )}
                {g.grupo !== "mensagem" && (
                  <span>
                    {int(g.conversas)} conversas{g.custoPorConversa != null ? ` (${fmtBRL(g.custoPorConversa)} cada)` : ""}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}

// ---------- card de campanha ----------
function Numero({ icone: Icon, rotulo, valor, sub }: { icone: LucideIcon; rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
        <Icon size={12} aria-hidden /> {rotulo}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{valor}</div>
      {sub && (
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function CampanhaCard({ c, gastoTotal }: { c: CampanhaDiag; gastoTotal: number }) {
  const G = GRUPOS[c.grupo];
  const faixaCtr = c.grupo === "trafego" ? avaliar(BENCHMARKS.ctrTrafego, c.ctrLink) : null;
  const corRisco = c.risco.nivel === "alto" ? "var(--crit)" : c.risco.nivel === "medio" ? "var(--warn)" : "var(--text-dim)";
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "var(--border)", borderLeft: `4px solid ${COR_CATEGORIA[c.categoria]}` }}>
      <div className="flex items-start gap-3">
        {c.thumbnail_url && <Miniatura url={c.thumbnail_url} className="h-12 w-12 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeloCategoria c={c.categoria} />
            <Selo cor="var(--s7)">{G.curto}</Selo>
          </div>
          <div className="mt-1 break-words text-sm font-medium">
            {c.permalink ? (
              <a href={c.permalink} target="_blank" rel="noreferrer" title={c.campanha} className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                {shortCampanha(c.campanha)}
              </a>
            ) : (
              <span title={c.campanha}>{shortCampanha(c.campanha)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero icone={Wallet} rotulo="Investido" valor={fmtBRL(c.gasto)} sub={`${Math.round((c.gasto / Math.max(gastoTotal, 1)) * 100)}% da verba`} />
        <Numero
          icone={G.porMil ? Eye : MousePointerClick}
          rotulo={`Resultado (${G.porMil ? "aparições" : G.resultadoPlural})`}
          valor={G.porMil ? int(c.impressoes) : int(c.resultados)}
          sub={`${int(c.conversas)} ${Math.round(c.conversas) === 1 ? "conversa" : "conversas"}`}
        />
        <Numero
          icone={Coins}
          rotulo={G.porMil ? "Custo a cada mil aparições" : `Custo por ${G.resultado}`}
          valor={c.custoPorResultado != null && c.grupo !== "outro" ? fmtBRL(c.custoPorResultado) : "—"}
        />
        <Numero icone={MessageCircle} rotulo="Custo por conversa" valor={c.custoPorConversa != null ? fmtBRL(c.custoPorConversa) : "—"} sub={c.grupo !== "mensagem" && c.conversas > 0 ? "não é o objetivo dela" : undefined} />
      </div>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text)" }}>
        {c.comparacao}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
        <b style={{ color: "var(--text)" }}>Por quê: </b>
        {c.motivo}
      </p>
      {c.ctrLink != null && c.impressoes >= 1000 && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          De cada 100 vezes que o anúncio apareceu, {porCem(c.ctrLink)} viraram clique no link
          {faixaCtr ? (
            <>
              {" "}
              · <span style={{ color: COR_FAIXA[faixaCtr], fontWeight: 600 }}>{ROTULO_FAIXA[faixaCtr]}</span> (médicos: 0,83 de cada 100)
            </>
          ) : null}
          .
        </p>
      )}

      <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Ação sugerida
        </div>
        <p className="mt-0.5 font-medium leading-snug">{c.acao}</p>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-xs" style={{ color: "var(--text-dim)" }}>
        <span className="inline-flex items-start gap-1" title={c.motivoConfianca}>
          <Gauge size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <b style={{ color: "var(--text)" }}>{ROTULO_CONFIANCA[c.confianca]}</b> · {c.motivoConfianca}
          </span>
        </span>
        <span className="inline-flex items-start gap-1">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden style={{ color: corRisco }} />
          <span>
            <b style={{ color: "var(--text)" }}>Risco de mexer: </b>
            {c.risco.texto}
          </span>
        </span>
      </div>
    </li>
  );
}

function Campanhas({ d }: { d: DiagnosticoAds }) {
  const [filtro, setFiltro] = useState<Categoria | "todas">("todas");
  const porCat = ORDEM_CATEGORIAS.map((cat) => {
    const cs = d.campanhas.filter((c) => c.categoria === cat);
    return { cat, n: cs.length, gasto: cs.reduce((s, c) => s + c.gasto, 0) };
  }).filter((x) => x.n > 0);
  const ordem = (c: CampanhaDiag) => ORDEM_CATEGORIAS.indexOf(c.categoria);
  const lista = d.campanhas.filter((c) => filtro === "todas" || c.categoria === filtro).sort((a, b) => ordem(a) - ordem(b) || b.gasto - a.gasto);
  return (
    <Painel
      icone={ListChecks}
      titulo="Campanhas: o que fazer com cada uma"
      resumo="Comparada só com as do mesmo objetivo"
      cor="var(--ai)"
      ajuda={
        <>
          {ORDEM_CATEGORIAS.map((c) => (
            <span key={c} className="mb-1 block">
              <b>{c}:</b> {EXPLICA_CATEGORIA[c]}
            </span>
          ))}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar campanhas">
        {[{ cat: "todas" as const, n: d.campanhas.length, gasto: d.gasto }, ...porCat].map((x) => {
          const ativo = filtro === x.cat;
          return (
            <button
              key={x.cat}
              type="button"
              onClick={() => setFiltro(x.cat)}
              aria-pressed={ativo}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium"
              style={{
                background: ativo ? "var(--accent-soft)" : "var(--surface)",
                borderColor: ativo ? "var(--accent)" : "var(--border)",
                color: "var(--text)",
              }}
            >
              {x.cat === "todas" ? "Todas" : x.cat}
              <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
                {x.n} · {fmtBRL(x.gasto)}
              </span>
            </button>
          );
        })}
      </div>
      {filtro !== "todas" && (
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          {EXPLICA_CATEGORIA[filtro]}
        </p>
      )}
      <ul className="space-y-3">
        {lista.map((c) => (
          <CampanhaCard key={c.campaign_id} c={c} gastoTotal={d.gasto} />
        ))}
      </ul>
    </Painel>
  );
}

function AnunciosPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const { data: diag, isLoading: loadingDiag } = useQuery({
    queryKey: ["ads-diag-objetivo", clientId, start, end],
    queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, end),
  });
  const { data: porDia, isLoading: loadingDia } = useQuery({
    queryKey: ["ads-dia", clientId, start, end],
    queryFn: () => getAdsPorDia(clientId, start, end),
  });
  const isLoading = loadingDiag || loadingDia;
  const gasto = diag?.gasto ?? 0;

  const serie = (porDia ?? []).map((r) => ({ dia: r.dia, gasto: n(r.gasto), conversas: n(r.conversas) }));
  const limitacoes = useMemo(() => limitacoesDeAnuncios(diag), [diag]);

  // Sem gasto no período: descobrir se a conta está pausada (já teve gasto antes),
  // se está ligada mas nunca gastou, ou se nem está ligada. O texto muda para cada caso.
  const vazio = !isLoading && gasto === 0;
  const { data: fontes } = useQuery({
    queryKey: ["fontes", clientId],
    queryFn: () => getClientFontes(clientId),
    enabled: vazio,
  });
  const { data: ultimoGasto } = useQuery({
    queryKey: ["ads-ultimo-gasto", clientId],
    queryFn: async () => {
      const dias = await getAdsPorDia(clientId, "2024-01-01", end);
      const comGasto = (dias ?? []).filter((r) => n(r.gasto) > 0);
      return comGasto.length ? comGasto[comGasto.length - 1].dia : null;
    },
    enabled: vazio,
  });

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  }

  if (!diag || gasto === 0) {
    const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const mensagemVazia = ultimoGasto
      ? `Anúncios pausados: o último investimento registrado foi em ${dataBR(ultimoGasto)}. Não houve gasto em ${periodLabel}.`
      : fontes?.tem_anuncios
        ? `A conta de anúncios está ligada, mas ainda não tem nenhum gasto registrado.`
        : `Sem investimento registrado em ${periodLabel}. Se a clínica anuncia, falta ligar a conta de anúncio a este cliente no cadastro.`;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="anuncios" />
        </div>
        <MotivoParada clientId={clientId} />
        <Faixa icone={Info}>Investimento em anúncios do Meta (Facebook e Instagram), por dia e por campanha.</Faixa>
        <Faixa icone={ultimoGasto || fontes?.tem_anuncios ? PauseCircle : AlertTriangle} cor="var(--warn)" alerta>
          {mensagemVazia}
        </Faixa>
      </div>
    );
  }

  const msg = diag.grupos.find((g) => g.grupo === "mensagem");
  const ctrConta = diag.impressoes > 0 ? diag.cliquesLink / diag.impressoes : null;
  const custoMil = diag.impressoes > 0 ? (diag.gasto / diag.impressoes) * 1000 : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="anuncios" />
      </div>

      <MotivoParada clientId={clientId} />
      <Faixa
        icone={CalendarDays}
        ajuda={
          <>
            Investimento em anúncios do Meta em {periodLabel}, direto da conta de anúncio — não é estimativa. Cada campanha é julgada pelo
            resultado do objetivo dela (conversa, cadastro, clique ou aparições) e comparada só com campanhas do mesmo objetivo. O sync roda
            automaticamente todo dia.
          </>
        }
      >
        Meta Ads · {periodLabel} · {diag.campanhas.length} campanhas
      </Faixa>

      <AgirHoje d={diag} clientId={clientId} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi icone={Wallet} rotulo="Investido" valor={fmtBRL(gasto)} dica={`${diag.campanhas.length} campanhas`} cor="var(--s1)" />
        <Kpi icone={MessageCircle} rotulo="Conversas iniciadas" valor={int(diag.conversas)} dica="WhatsApp e Direct, de todas as campanhas" cor="var(--good)" />
        <Kpi
          icone={Coins}
          rotulo="Custo por conversa"
          valor={msg?.custoPorConversa != null ? fmtBRL(msg.custoPorConversa) : "—"}
          dica={msg ? `Só campanhas de mensagem: ${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)} conversas` : "Sem campanha de mensagem no período"}
          cor="var(--accent)"
        />
        <Kpi icone={Eye} rotulo="Aparições do anúncio" valor={int(diag.impressoes)} dica={custoMil != null ? `${fmtBRL(custoMil)} a cada mil aparições` : undefined} cor="var(--s2)" />
        <Kpi icone={MousePointerClick} rotulo="Cliques no link" valor={int(diag.cliquesLink)} dica={diag.cliquesLink > 0 ? `${fmtBRL(diag.gasto / diag.cliquesLink)} por clique` : undefined} cor="var(--s3)" />
        <Kpi icone={Percent} rotulo="Cliques a cada 100 aparições" valor={porCem(ctrConta)} dica="Cliques no link ÷ aparições × 100" cor="var(--s7)" />
      </div>
      <div className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <OQueE>
          <b>Custo por conversa</b> conta só as campanhas de mensagem ({msg ? `${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)}` : "nenhuma no período"}):
          dividir a verba de todos os objetivos pelas conversas deixaria o número inflado. Referência de mercado, sem estudo
          independente e por isso sem cor: {BENCHMARKS.custoPorConversa.referencia}. <b>Aparições</b> são as vezes que o anúncio
          apareceu na tela (a mesma pessoa pode ver mais de uma vez). <b>Cliques a cada 100 aparições</b> conta só clique no link, não
          curtida nem clique na foto.
        </OQueE>
      </div>

      <PorObjetivo d={diag} />

      <Campanhas d={diag} />

      <Painel
        icone={CalendarDays}
        titulo="Investimento e conversas por dia"
        resumo="Barra = gasto do dia · linha = conversas"
        cor="var(--s2)"
        ajuda={<>As barras são o gasto do dia; a linha, as conversas iniciadas. Dias em que a linha não acompanha a barra são os que merecem olhada.</>}
      >
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="esq" tick={{ fontSize: 11 }} width={36} />
              <YAxis yAxisId="dir" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
              <Tooltip
                formatter={(value: number | string, name: string) => (name === "Gasto" ? fmtBRL(n(value)) : int(n(value)))}
                labelFormatter={(d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR")}
              />
              <Legend />
              <Bar yAxisId="esq" dataKey="gasto" name="Gasto" fill="var(--accent)" />
              <Line yAxisId="dir" type="monotone" dataKey="conversas" name="Conversas" stroke="var(--good)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      <ListaLimitacoes itens={limitacoes} />

      <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
        <Megaphone size={12} aria-hidden /> Referências de mercado só pintam de cor quando a fonte tem metodologia publicada.
      </p>
    </div>
  );
}
