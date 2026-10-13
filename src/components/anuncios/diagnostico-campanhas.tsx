// Painel "Diagnóstico das campanhas" da tela Anúncios: cartões por veredito
// (gasto, fatia da verba, campanhas e conversas), filtros por veredito e por
// selo, alerta de verba sem resultado e a lista de campanhas com as barras de
// fatia do investimento, fatia das conversas e custo contra a régua.
import { useState } from "react";
import { Wallet, MessageCircle, Coins, Eye, MousePointerClick, AlertTriangle, Gauge, ShieldAlert, Stethoscope, type LucideIcon } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import {
  GRUPOS,
  ORDEM_VEREDITO,
  ORDEM_SELOS,
  EXPLICA_VEREDITO,
  EXPLICA_SELO,
  MIN_IMPRESSOES_TAXA,
  ESCALAR,
  CORTAR,
  unidade,
  type CampanhaDiag,
  type DiagnosticoAds,
  type SeloCampanha,
  type Veredito,
} from "@/lib/anuncios-objetivo";
import { BENCHMARKS, avaliar, ROTULO_FAIXA, COR_FAIXA } from "@/lib/benchmarks";
import { ROTULO_CONFIANCA } from "@/lib/insight";
import { Painel, Selo, Miniatura, BarraFina, Ajuda } from "@/components/visual";
import { SeloVeredito, SeloExtra, COR_VEREDITO } from "@/components/anuncios/veredito";

const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const porCem = (v: number | null) => (v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

// Faixa curta com ícone; o texto longo fica no "i".
export function Faixa({
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

function shortCampanha(nome: string) {
  return nome.length > 64 ? nome.slice(0, 63) + "…" : nome;
}

// ---------- card de campanha ----------
function Celula({
  icone: Icon,
  rotulo,
  valor,
  sub,
  barra,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  sub?: string;
  barra?: { valor: number; max: number; cor: string } | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
        <Icon size={12} aria-hidden /> {rotulo}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{valor}</div>
      {barra !== undefined && <div className="mt-1">{barra ? <BarraFina valor={barra.valor} max={barra.max} cor={barra.cor} /> : <BarraFina valor={0} max={1} />}</div>}
      {sub && (
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Cor do custo contra a régua usada no veredito: verde ≤ 0,6x, vermelho ≥ 2x, azul no meio. */
function barraCusto(custo: number | null, regua: number | null) {
  if (custo == null || regua == null || regua <= 0) return null;
  const cor = custo <= regua * ESCALAR ? "var(--good)" : custo >= regua * CORTAR ? "var(--crit)" : "var(--accent)";
  return { valor: custo, max: Math.max(regua * 2, custo), cor };
}

function CampanhaCard({ c, d, naConversa }: { c: CampanhaDiag; d: DiagnosticoAds; naConversa: boolean }) {
  const G = GRUPOS[c.grupo];
  const faixaCtr = c.grupo === "trafego" ? avaliar(BENCHMARKS.ctrTrafego, c.ctrLink) : null;
  const corRisco = c.risco.nivel === "alto" ? "var(--crit)" : c.risco.nivel === "medio" ? "var(--warn)" : "var(--text-dim)";
  const custoObjetivo = c.custoPorResultado != null && c.grupo !== "outro" ? c.custoPorResultado : null;
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "var(--border)", borderLeft: `4px solid ${COR_VEREDITO[c.vereditoOficial]}` }}>
      <div className="flex items-start gap-3">
        {c.thumbnail_url && <Miniatura url={c.thumbnail_url} className="h-12 w-12 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeloVeredito v={c.vereditoOficial} />
            {c.selos.map((s) => (
              <SeloExtra key={s} s={s} />
            ))}
            <Selo cor="var(--s7)">{G.curto}</Selo>
            <span className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }} title="Objetivo como vem da Meta">
              {c.objetivo ?? "(sem objetivo)"}
            </span>
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

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Celula
          icone={Wallet}
          rotulo="Investido"
          valor={fmtBRL(c.gasto)}
          sub={`${Math.round((c.gasto / Math.max(d.gasto, 1)) * 100)}% da verba`}
          barra={{ valor: c.gasto, max: d.gasto, cor: "var(--s1)" }}
        />
        <Celula
          icone={G.porMil ? Eye : MousePointerClick}
          rotulo={`Resultado (${G.porMil ? "aparições" : G.resultadoPlural})`}
          valor={G.porMil ? int(c.impressoes) : c.grupo === "outro" ? "—" : int(c.resultados)}
        />
        <Celula
          icone={MessageCircle}
          rotulo="Conversas"
          valor={int(c.conversas)}
          sub={d.conversas > 0 ? `${Math.round((c.conversas / d.conversas) * 100)}% das conversas` : undefined}
          barra={{ valor: c.conversas, max: d.conversas, cor: "var(--good)" }}
        />
        <Celula
          icone={Coins}
          rotulo={G.porMil ? "Custo a cada mil aparições" : c.grupo === "outro" ? "Custo por resultado" : `Custo por ${G.resultado}`}
          valor={custoObjetivo != null ? fmtBRL(custoObjetivo) : "—"}
          sub={!naConversa ? (c.regua != null ? `típica do objetivo: ${fmtBRL(c.regua)}` : undefined) : "não é a régua desta campanha"}
          barra={!naConversa ? barraCusto(custoObjetivo, c.regua) : undefined}
        />
        <Celula
          icone={MessageCircle}
          rotulo="Custo por conversa"
          valor={c.custoPorConversa != null ? fmtBRL(c.custoPorConversa) : "—"}
          sub={
            naConversa
              ? c.regua != null
                ? `típica da conta: ${fmtBRL(c.regua)}`
                : undefined
              : c.grupo !== "mensagem" && c.conversas > 0
                ? "não é o objetivo dela"
                : undefined
          }
          barra={naConversa ? barraCusto(c.custoPorConversa, c.regua) : undefined}
        />
      </div>

      {/* Indicadores do criativo: só leitura, não mudam o veredito acima. */}
      <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--surface-2, var(--surface))" }}>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
          Indicadores do criativo
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <Celula icone={Eye} rotulo="Aparições (impressões)" valor={int(c.impressoes)} sub={c.alcanceDiarioSomado > 0 ? `alcance somado dos dias: ${int(c.alcanceDiarioSomado)}` : undefined} />
          <Celula icone={MousePointerClick} rotulo="CTR no link" valor={c.ctrLink != null ? `${(c.ctrLink * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—"} sub={c.ctrTodos != null ? `todos os cliques: ${(c.ctrTodos * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : undefined} />
          <Celula icone={Coins} rotulo="CPC (clique no link)" valor={c.cpcLink != null ? fmtBRL(c.cpcLink) : "—"} sub={`${int(c.cliquesLink)} cliques no link`} />
          <Celula icone={Coins} rotulo="CPM (mil aparições)" valor={c.cpm != null ? fmtBRL(c.cpm) : "—"} />
          <Celula
            icone={Eye}
            rotulo="Frequência por dia"
            valor={c.frequenciaDia != null ? c.frequenciaDia.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}
            sub={
              c.frequencia7d != null
                ? `últimos 7 dias: ${c.frequencia7d.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${c.frequencia7d >= 2 ? " · alta: a mesma pessoa vê demais" : ""}`
                : undefined
            }
          />
          <Celula
            icone={MessageCircle}
            rotulo="Clique que vira conversa"
            valor={c.conversaPorClique != null ? `${Math.round(c.conversaPorClique * 100)} de 100` : "—"}
            sub={c.conversaPorClique == null ? "menos de 20 cliques" : undefined}
          />
          <Celula icone={Coins} rotulo="Custo por visita à página" valor={c.custoPorVisita != null ? fmtBRL(c.custoPorVisita) : "—"} sub={c.visitasPagina ? `${int(c.visitasPagina)} visitas` : undefined} />
          <Celula icone={Wallet} rotulo="Gasto por dia ativo" valor={c.gastoDiario != null ? fmtBRL(c.gastoDiario) : "—"} sub={`${c.diasAtivos} dias com gasto`} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Como ler: CTR baixo = a arte não chama atenção; CTR bom e pouca conversa por clique = o problema é a oferta ou o público, não a arte; frequência por dia acima de 2 = a mesma pessoa está vendo demais (tende a cansar). Frequência aqui é por dia (a Meta não libera pessoas únicas somadas entre dias nesta base).
        </p>
      </div>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text)" }}>
        {c.comparacao}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
        <b style={{ color: "var(--text)" }}>Por quê: </b>
        {c.motivo}
      </p>
      {c.notas.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {c.notas.map((t) => (
            <li key={t}>• {t}</li>
          ))}
        </ul>
      )}
      {c.ctrLink != null && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          De cada 100 vezes que o anúncio apareceu, {porCem(c.ctrLink)} viraram clique no link
          {c.ctrReferencia != null ? ` (típico usado no veredito: ${porCem(c.ctrReferencia)})` : ""}
          {c.impressoes < MIN_IMPRESSOES_TAXA ? (
            <span style={{ color: "var(--text-faint)" }}> · amostra pequena: {int(c.impressoes)} aparições</span>
          ) : faixaCtr ? (
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

// ---------- painel: diagnóstico das campanhas (vereditos, alerta, lista) ----------
const LIMITE_LISTA = 10;
export function DiagnosticoCampanhas({ d }: { d: DiagnosticoAds }) {
  const [filtro, setFiltro] = useState<Veredito | "todas">("todas");
  const [selo, setSelo] = useState<SeloCampanha | null>(null);
  const [todas, setTodas] = useState(false);
  const porVeredito = ORDEM_VEREDITO.map((v) => {
    const cs = d.campanhas.filter((c) => c.vereditoOficial === v);
    return { v, n: cs.length, gasto: cs.reduce((s, c) => s + c.gasto, 0), conversas: cs.reduce((s, c) => s + c.conversas, 0) };
  }).filter((x) => x.n > 0);
  const porSelo = ORDEM_SELOS.map((s) => ({ s, n: d.campanhas.filter((c) => c.selos.includes(s)).length })).filter((x) => x.n > 0);
  const ordem = (c: CampanhaDiag) => ORDEM_VEREDITO.indexOf(c.vereditoOficial);
  const filtradas = d.campanhas
    .filter((c) => (filtro === "todas" || c.vereditoOficial === filtro) && (selo == null || c.selos.includes(selo)))
    .sort((a, b) => ordem(a) - ordem(b) || b.gasto - a.gasto);
  const lista = todas ? filtradas : filtradas.slice(0, LIMITE_LISTA);
  // Régua de cada campanha: a do objetivo, quando existe; senão a da conta (conversa).
  const naConversa = (c: CampanhaDiag) => {
    if (c.julgadaPor) return c.julgadaPor === "conta";
    const g = d.grupos.find((x) => x.grupo === c.grupo);
    return c.grupo === "outro" || c.selos.includes("Resultado não medido") || g?.medianaCusto == null;
  };

  // Alerta do diagnóstico original, com os vereditos por objetivo.
  const sem = d.campanhas.filter((c) => c.vereditoOficial === "Atrai mas não converte" || c.vereditoOficial === "Sem tração");
  const semConta = sem.filter((c) => c.julgadaPor === "conta" && !c.selos.includes("Resultado não medido")).reduce((s, c) => s + c.gasto, 0);
  const semNaoMedido = sem.filter((c) => c.selos.includes("Resultado não medido")).reduce((s, c) => s + c.gasto, 0);
  const pct = (v: number) => `${Math.round((v / Math.max(d.gasto, 1)) * 100)}%`;
  const reguasTxt =
    [
      ...d.grupos.filter((g) => g.medianaCusto != null).map((g) => `típica de ${GRUPOS[g.grupo].curto}: ${unidade(g.grupo, g.medianaCusto!)}`),
      ...(d.reguaConta.custoPorConversa != null ? [`conta toda: ${fmtBRL(d.reguaConta.custoPorConversa)} por conversa`] : []),
    ].join("; ") || "sem régua no período";

  const botao = (ativo: boolean) => ({
    background: ativo ? "var(--accent-soft)" : "var(--surface)",
    borderColor: ativo ? "var(--accent)" : "var(--border)",
    color: "var(--text)",
  });

  return (
    <Painel
      icone={Stethoscope}
      titulo="Diagnóstico das campanhas"
      resumo={`Régua: campanha típica do mesmo objetivo${d.reguaConta.custoPorConversa != null ? `; com poucas campanhas no objetivo, a da conta (${fmtBRL(d.reguaConta.custoPorConversa)} por conversa)` : ""}`}
      cor="var(--ai)"
      ajuda={
        <>
          A régua é a campanha típica (mediana) desta conta no período, e não referência de mercado. Cada campanha é comparada com as do mesmo
          objetivo, no resultado desse objetivo; se o objetivo tem menos de 3 campanhas com volume, com a conta toda, pela conversa (a régua
          original). "Escalar" é quem entrega a 60% ou menos da típica; "Cortar", quem passa do dobro. Campanha que rodou pouco fica como "Volume
          insuficiente", em vez de receber um veredito de mentira.
          {ORDEM_VEREDITO.map((v) => (
            <span key={v} className="mt-1 block">
              <b>{v}:</b> {EXPLICA_VEREDITO[v]}
            </span>
          ))}
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3" role="group" aria-label="Filtrar campanhas por veredito">
        {porVeredito.map((x) => {
          const ativo = filtro === x.v;
          return (
            <button
              key={x.v}
              type="button"
              onClick={() => setFiltro(ativo ? "todas" : x.v)}
              aria-pressed={ativo}
              className="min-h-[44px] rounded-xl border p-3 text-left"
              style={botao(ativo)}
            >
              <SeloVeredito v={x.v} />
              <div className="mt-2 text-lg font-semibold tabular-nums">{fmtBRL(x.gasto)}</div>
              <div className="mt-1.5">
                <BarraFina valor={x.gasto} max={d.gasto} cor={COR_VEREDITO[x.v]} />
              </div>
              <div className="mt-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                {x.n} {x.n === 1 ? "campanha" : "campanhas"} · {int(x.conversas)} {Math.round(x.conversas) === 1 ? "conversa" : "conversas"} · {pct(x.gasto)} da verba
              </div>
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar campanhas por selo">
        <button
          type="button"
          onClick={() => {
            setFiltro("todas");
            setSelo(null);
          }}
          aria-pressed={filtro === "todas" && selo == null}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium"
          style={botao(filtro === "todas" && selo == null)}
        >
          Todas{" "}
          <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
            {d.campanhas.length} · {fmtBRL(d.gasto)}
          </span>
        </button>
        {porSelo.map((x) => {
          const ativo = selo === x.s;
          return (
            <button
              key={x.s}
              type="button"
              onClick={() => setSelo(ativo ? null : x.s)}
              aria-pressed={ativo}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 text-xs"
              style={botao(ativo)}
            >
              <SeloExtra s={x.s} />
              <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
                {x.n}
              </span>
            </button>
          );
        })}
      </div>
      {(filtro !== "todas" || selo) && (
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          {filtro !== "todas" && (
            <>
              <b>{filtro}:</b> {EXPLICA_VEREDITO[filtro]}{" "}
            </>
          )}
          {selo && (
            <>
              <b>{selo}:</b> {EXPLICA_SELO[selo]}
            </>
          )}
        </p>
      )}

      {d.desperdicioSemResultado > 0 && (
        <div className="mb-3">
          <Faixa icone={AlertTriangle} cor="var(--crit)" alerta>
            <strong>{fmtBRL(d.desperdicioSemResultado)}</strong> ({pct(d.desperdicioSemResultado)} da verba) foram para campanhas que não geraram um único
            resultado do objetivo delas no período (marcadas "Atrai mas não converte" ou "Sem tração").
            {(semConta > 0 || semNaoMedido > 0) && (
              <span className="mt-0.5 block text-xs" style={{ color: "var(--text-dim)" }}>
                {semConta > 0 && `${fmtBRL(semConta)} delas foram comparadas com a conta toda e não trouxeram nenhuma conversa. `}
                {semNaoMedido > 0 && `${fmtBRL(semNaoMedido)} são de campanhas cujo resultado (cadastro/venda no site) não é medido aqui.`}
              </span>
            )}
          </Faixa>
        </div>
      )}
      {d.desperdicio > 0 && (
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Somando as marcadas "Cortar" (custo 2x ou mais a típica), a "Verba que não entregou" do Resumo é <b>{fmtBRL(d.desperdicio)}</b> ({pct(d.desperdicio)}
          ). Ela não conta campanha com resultado não medido nem campanha que entregou o resultado do próprio objetivo.
        </p>
      )}

      <ul className="space-y-3">
        {lista.map((c) => (
          <CampanhaCard key={c.campaign_id} c={c} d={d} naConversa={naConversa(c)} />
        ))}
      </ul>
      {filtradas.length > LIMITE_LISTA && (
        <button
          type="button"
          onClick={() => setTodas((x) => !x)}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border text-sm font-medium"
          style={botao(false)}
        >
          {todas ? "Mostrar só as 10 primeiras" : `Mostrar todas as ${filtradas.length} campanhas`}
        </button>
      )}
      <p className="mt-3 text-[11px]" style={{ color: "var(--muted)" }}>
        Barras de investido e conversas: fatia do total da conta. Barra de custo: comparada à régua usada no veredito ({reguasTxt}); verde = 60% ou
        menos, vermelho = o dobro ou mais.
      </p>
    </Painel>
  );
}
