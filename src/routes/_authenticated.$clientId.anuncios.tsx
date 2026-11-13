import { useMemo, useRef, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { statusDoCliente, diasDeAtraso } from "@/lib/saude-fontes";
import { motivoDaLinha, tituloDaFaixa } from "@/lib/motivos";
import { SeloDono } from "@/components/selo-dono";
import { getAdsPorDia, getAdsDiagnosticoPorObjetivo, getClientFontes, getAdsPlanilha, getAdsResumo } from "@/lib/client-data";
import { AdsPlanilhaPainel } from "@/components/ads-planilha";
import { PostsImpulsionados } from "@/components/seguidores-impulsionados";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel, type DateRangeState } from "@/lib/date-range";
import { ComparativoConta } from "@/components/anuncios/comparativo-conta";
import { QualidadeLeadsCampanha } from "@/components/anuncios/qualidade-leads";
import { fmtBRL } from "@/lib/format";
import { GRUPOS, conversaMaisBarata, insightsDeAnuncios, planoDeAcao, limitacoesDeAnuncios, unidade, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { BENCHMARKS } from "@/lib/benchmarks";
import { avisoContaAnuncioCompartilhada, type ContaAnuncioCompartilhada } from "@/lib/conta-anuncio-compartilhada";
import { InsightCard, ListaLimitacoes } from "@/components/insight-card";
import { MetodologiaAnuncios } from "@/components/anuncios/metodologia";
import { DiagnosticoCampanhas } from "@/components/anuncios/diagnostico-campanhas";
import { Wallet, MessageCircle, Coins, Eye, MousePointerClick, Layers, Zap, Megaphone, CalendarDays, Lightbulb, ChevronRight, Filter } from "lucide-react";
import { Painel, BarraFina, InfoDica } from "@/components/visual";
import { fmtFracao } from "@/lib/metricas";
import { nomeObjetivo, objetivoNaoContaConversa } from "@/lib/rastreio-anuncios";
import { NxCard, NxTag, NxHBar } from "@/components/nx";
import { NxBarrasLinha, NxFunil, NxAlertaCurto, NxNota, NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxDescobertas, NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxAcaoPilula, NxBarras } from "@/components/nx/cartoes";
import { NxReguaDosDias } from "@/components/nx/regua-dos-dias";
import { NxDiasComFaixa } from "@/components/nx/dias-com-faixa";
import { linhaDaRota } from "@/components/nx/hoje";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { useResultadosDiarios } from "@/hooks/use-resultados-diarios";
import { faixaDoNormal, foraDaFaixa } from "@/lib/faixa-do-normal";
import { ehEquipe } from "@/lib/registro-de-telas";
import { variacaoPropria, visiveisEResto, type Descoberta } from "@/lib/leitura/cinco-segundos";
import { serieContinua } from "@/lib/linha-30-dias";
import { NxCarregando, NxErro, NxTabela } from "@/components/nx/blocos";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { fatosDosAnuncios, type ResumoDeAnuncios } from "@/lib/leitura/fatos-anuncios";
import { hojeBrasilia } from "@/lib/status-fonte";
import { ACOES_DE_ANUNCIOS, compararCusto, custoDoTotal, custoPorDia, dataCurta, descobertasDosAnuncios, diasDeVerbaBaixa, mediaMovel7, reais, vereditoDosAnuncios } from "@/lib/leitura/cinco-anuncios";

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
// Ícones no tamanho do ladrilho da prancha (17 px, traço 1,7).
const ic = (Icon: typeof Eye) => <Icon size={17} strokeWidth={1.7} aria-hidden />;
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Dias com conversa que a régua precisa para valer (com menos, "Falta dado"). */
const MIN_DIAS_DA_REGUA = 5;
const brlCurto = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v).toLocaleString("pt-BR")}`);

/** Variação contra o período anterior, já pronta para o cartão. Abaixo de 5% é "estável", sem cor (igual ao comparativo). */
function variacaoDe(atual: unknown, anterior: unknown) {
  const a = atual == null ? null : Number(atual);
  const b = anterior == null ? null : Number(anterior);
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const v = a / b - 1;
  return { v, pct: `${Math.abs(Math.round(v * 100))}%` };
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
  // Erro gravado (conta não lida, leitura parcial) também aparece, mesmo com outra conta em dia.
  const m = parada || l?.motivo || l?.last_error ? motivoDaLinha(l) : null;
  if (!l || !m) return null;
  // Fonte alimentada à mão (planilha de distribuição de conteúdo): não é parada nem erro, e o painel da planilha já explica a origem.
  if (m.dono === "manual") return null;
  return (
    <NxAlertaCurto tom={parada ? "critico" : "atencao"} titulo={tituloDaFaixa(l.data_ate, parada)} acao={<SeloDono dono={m.dono} />}>
      {m.texto}
    </NxAlertaCurto>
  );
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
        Usa os vereditos de cada campanha (Escalar, Cortar, Sem tração…), dados comparando só com as do mesmo objetivo. Mudanças de verba
        sempre em passos de 20%: mais que isso faz a Meta reiniciar o aprendizado e o custo sobe por alguns dias.
      </p>
      {plano.length === 0 ? (
        <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
          Nenhuma mudança de verba urgente neste período: nenhuma campanha com verba relevante está marcada "Cortar" ou "Sem tração" e
          nenhuma marcada "Escalar" está pronta para receber mais.
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
          <NxAlertaCurto tom="atencao" titulo={`A conversa saiu mais cara nas campanhas de ${GRUPOS[cmp.caro.grupo].curto}`}>
            Uma conversa vinda de campanha de <b>{GRUPOS[cmp.caro.grupo].curto}</b> custou{" "}
            <b>{cmp.caro.custoPorConversa != null ? fmtBRL(cmp.caro.custoPorConversa) : "—"}</b>
            {cmp.vezes != null ? ` (${cmp.vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x mais)` : ""}; de campanha de{" "}
            <b>{GRUPOS[cmp.barato.grupo].curto}</b>, <b>{fmtBRL(cmp.barato.custoPorConversa)}</b>.
          </NxAlertaCurto>
        </div>
      )}
      <ul className="space-y-4">
        {d.grupos.map((g) => {
          const G = GRUPOS[g.grupo];
          const fatia = d.gasto > 0 ? g.gasto / d.gasto : 0;
          return (
            <li key={g.grupo}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{G.nome}</span>
                  <span className="ml-1.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }} title="Objetivo como vem da Meta">
                    {g.objetivosBrutos.join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums">
                  <b className="font-bold">{fmtBRL(g.gasto)}</b>
                  <span className="ml-1.5 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
                    {fmtFracao(fatia)} da verba
                  </span>
                </span>
              </div>
              <div className="mt-1">
                <BarraFina valor={g.gasto} max={d.gasto} cor="var(--b2)" />
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                {G.paraQue}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
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
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
                {g.medianaCusto != null
                  ? `Régua do veredito: campanha típica de ${G.curto}, ${unidade(g.grupo, g.medianaCusto)} (${g.campanhasComVolume} campanhas com volume).`
                  : g.grupo === "outro"
                    ? "Sem régua própria: campanhas comparadas com a conta toda, pela conversa."
                    : `Menos de 3 campanhas com volume: comparadas com a conta toda, pela conversa${d.reguaConta.custoPorConversa != null ? ` (típica: ${fmtBRL(d.reguaConta.custoPorConversa)} por conversa)` : ""}.`}
              </p>
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}

// A mesma conta de anúncios ligada a mais de um cliente: cada cliente mostra o gasto inteiro da conta.
function ContaCompartilhada({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["contas-anuncio-compartilhadas", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("contas_anuncio_compartilhadas", { p_client_id: clientId });
      if (error) return [];
      return (data ?? []) as ContaAnuncioCompartilhada[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!data?.length) return null;
  return (
    <>
      {data.map((c) => (
        <NxAlertaCurto key={c.ad_account_id} tom="atencao" titulo="Conta de anúncio compartilhada com outro cliente">
          {avisoContaAnuncioCompartilhada(c)}
        </NxAlertaCurto>
      ))}
    </>
  );
}

// Rastreio suspeito: no lugar do diagnóstico, o objetivo de cada campanha (tráfego com link de WhatsApp não conta conversa).
function ObjetivosDasCampanhas({ d }: { d: DiagnosticoAds }) {
  const cs = [...d.campanhas].sort((a, b) => b.gasto - a.gasto);
  return (
    <Painel icone={Layers} titulo="Objetivo de cada campanha" resumo={`${cs.length} campanhas · o diagnóstico volta quando o rastreio estiver confiável`}>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
        Campanha de <b>tráfego</b> (ou de conversão no site) com link de WhatsApp não registra “conversa iniciada”: a conversa acontece, mas a Meta
        não conta. Por isso nenhuma campanha é classificada como “não converte” enquanto o rastreio estiver suspeito.
      </p>
      <NxTabela
        rotulo="Objetivo de cada campanha"
        colunas={[
          { chave: "campanha", titulo: "Campanha" },
          { chave: "objetivo", titulo: "Objetivo" },
          { chave: "gasto", titulo: "Investido", numerica: true },
          { chave: "cliques", titulo: "Cliques no link", numerica: true },
          { chave: "conversas", titulo: "Conversas atribuídas", numerica: true },
        ]}
        linhas={
          cs.map((c) => ({
            campanha: <span title={c.campanha}>{c.campanha}</span>,
            objetivo: (
              <>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{nomeObjetivo(c.objetivo)}</span>
                {objetivoNaoContaConversa(c.objetivo) && <div className="text-xs" style={{ color: "var(--warn)" }}>não conta conversa do WhatsApp</div>}
              </>
            ),
            gasto: fmtBRL(c.gasto),
            cliques: int(c.cliquesLink),
            conversas: int(c.conversas),
          })) as Record<string, ReactNode>[]
        }
        chaveDaLinha={(_, k) => cs[k].campaign_id}
      />
    </Painel>
  );
}

// ---------- abertura: onde a verba foi gasta, campanha a campanha ----------
const MAX_CAMPANHAS_TOPO = 6;
function OndeFoiAVerba({ d }: { d: DiagnosticoAds }) {
  const cs = useMemo(() => [...d.campanhas].sort((a, b) => b.gasto - a.gasto), [d]);
  const max = cs[0]?.gasto ?? 0;
  const resto = cs.length - MAX_CAMPANHAS_TOPO;
  return (
    <NxCard
      icone={ic(Wallet)}
      titulo="Onde a verba foi gasta"
      subtitulo="Campanhas que mais gastaram e as conversas que cada uma trouxe"
      rotulo="Onde a verba foi gasta"
    >
      <ul className="nx-hbars" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {cs.slice(0, MAX_CAMPANHAS_TOPO).map((c, i) => (
          <li key={c.campaign_id} title={c.campanha}>
            <NxHBar
              i={i}
              rotulo={c.campanha}
              valor={
                <>
                  {fmtBRL(c.gasto)} <small>· {int(c.conversas)} {c.conversas === 1 ? "conversa" : "conversas"}</small>
                </>
              }
              pct={max > 0 ? (c.gasto / max) * 100 : 0}
            />
          </li>
        ))}
      </ul>
      {resto > 0 && <NxNota>Mais {resto} {resto === 1 ? "campanha" : "campanhas"} no diagnóstico, logo abaixo.</NxNota>}
    </NxCard>
  );
}

// ---------- abertura: a leitura do que fazer, em frases ----------
function OQueFazer({ d, aoVerPlano }: { d: DiagnosticoAds; aoVerPlano: () => void }) {
  const plano = useMemo(() => planoDeAcao(d), [d]);
  const suspeito = !!d.rastreio?.suspeito;
  const itens = suspeito ? [] : plano.slice(0, 3);
  return (
    <NxCard icone={ic(Lightbulb)} titulo="O que fazer agora" subtitulo="A leitura do período em linguagem simples" rotulo="O que fazer agora">
      {suspeito ? (
        <ol className="nx-leitura">
          <li>
            <span className="nx-leitura__n" aria-hidden>1</span>
            <span className="nx-leitura__corpo">
              <b>Corrigir o rastreio das conversas antes de mexer na verba</b>
              <span>Enquanto o rastreio estiver suspeito, nenhuma campanha é julgada pelo custo por conversa. Veja o aviso no topo.</span>
            </span>
          </li>
        </ol>
      ) : itens.length === 0 ? (
        <p className="nx-vazio text-sm font-medium" style={{ margin: 0 }}>
          Nenhuma mudança de verba urgente neste período: nenhuma campanha com verba relevante está marcada "Cortar" ou "Sem tração" e nenhuma
          marcada "Escalar" está pronta para receber mais.
        </p>
      ) : (
        <ol className="nx-leitura">
          {itens.map((it, k) => (
            <li key={it.id}>
              <span className="nx-leitura__n" aria-hidden>{k + 1}</span>
              <span className="nx-leitura__corpo">
                <b>{it.titulo}</b>
                <span>{it.impactoTexto ?? it.acao?.texto ?? it.diagnostico}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="nx-botao" onClick={aoVerPlano} style={{ justifySelf: "start" }}>
        Ver o plano completo e as recomendações <ChevronRight size={16} aria-hidden />
      </button>
    </NxCard>
  );
}

/** As descobertas que passam das 3 à vista (4 e 5) moram no "Ver tudo", já com os fatores do "Por quê?" abertos (nada some). */
function MaisDescobertasDosAnuncios({
  itens,
  clientId,
  dateRange,
  aoAgir,
  extraDoPorque,
}: {
  itens: readonly Descoberta[];
  clientId: string;
  dateRange: DateRangeState;
  aoAgir: (local: string) => void;
  extraDoPorque: (d: Descoberta) => ReactNode;
}) {
  return (
    <section className="nx-cinco-resto" aria-label="Mais descobertas do período" data-peca="mais-descobertas">
      <h3 className="nx-cinco-resto__titulo">Mais descobertas do período</h3>
      <div className="nx-cinco-resto__grade">
        {itens.map((d) => {
          const linha = d.acao.rota ? linhaDaRota(d.acao.rota) : undefined;
          const local = d.acao.local;
          return (
            <article key={d.id} className="nx-cinco-resto__item" data-descoberta-extra={d.id}>
              <NxSelo tom={d.tom} texto={d.selo} />
              <p className="nx-cinco-resto__frase">{d.frase}</p>
              <NxBarras barras={d.porque.barras} rotulo={d.porque.titulo} />
              {extraDoPorque(d)}
              {d.porque.obs && <p className="nx-cinco-falta">{d.porque.obs}</p>}
              {linha ? (
                <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir a aba de origem" para={{ tela: linha, clientId, dateRange }} />
              ) : local ? (
                <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir" aoAbrir={() => aoAgir(local)} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Total do período que a tela lê de ads_resumo, em números; null quando a leitura não veio. */
function resumoEmNumeros(r: unknown): ResumoDeAnuncios | null {
  if (!r) return null;
  const x = r as Record<string, unknown>;
  return { gasto: n(x.gasto), conversas: n(x.conversas), cliquesLink: n(x.cliques_link) };
}

function AnunciosPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const recomendacoes = useRef<HTMLDetailsElement>(null);
  const hoje = hojeBrasilia();

  const diagnosticoQ = useQuery({
    queryKey: ["ads-diag-objetivo", clientId, start, end],
    queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, end),
    retry: false,
  });
  const diasQ = useQuery({
    queryKey: ["ads-dia", clientId, start, end],
    queryFn: () => getAdsPorDia(clientId, start, end),
    retry: false,
  });
  // Período anterior do mesmo tamanho: a mesma leitura (e a mesma chave de cache) do comparativo da conta, mais abaixo.
  const dias = Math.round((new Date(end.slice(0, 10) + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime()) / 86400000) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const antFim = iso(new Date(start + "T12:00:00Z").getTime() - 86400000);
  const antIni = iso(new Date(start + "T12:00:00Z").getTime() - dias * 86400000);
  const resumoAtual = useQuery({ queryKey: ["ads-resumo", clientId, start, end], queryFn: () => getAdsResumo(clientId, start, end.slice(0, 10)), staleTime: 5 * 60_000 });
  const resumoAnt = useQuery({ queryKey: ["ads-resumo", clientId, antIni, antFim], queryFn: () => getAdsResumo(clientId, antIni, antFim), staleTime: 5 * 60_000 });

  // Formato 5 segundos: a única leitura nova, para a descoberta do que vem depois do anúncio. Os resultados diários do período (no máximo 31
  // linhas) são a mesma leitura, com a mesma chave de cache, de Resultados e da Hoje: costuma já estar na memória. Se falhar, só essa
  // descoberta some; a tela nunca cai por isso. Quem é da equipe vê o atalho para o Atendimento (o médico vai ao funil).
  const { isAdmin } = useAuth();
  const papel = useClientRole(clientId);
  const equipe = !papel.carregando && ehEquipe({ isAdmin, papel: papel.papel });
  const diario = useResultadosDiarios(clientId, start, end);

  const { data: diag, isLoading: loadingDiag } = diagnosticoQ;
  const { data: porDia, isLoading: loadingDia } = diasQ;
  const isLoading = loadingDiag || loadingDia;
  const gasto = diag?.gasto ?? 0;

  const serie = useMemo(() => (porDia ?? []).map((r) => ({ dia: r.dia, barra: n(r.gasto), linha: n(r.conversas) })), [porDia]);
  // Linhas de 30 dias dos cartões (sketch 002): as mesmas linhas diárias de cima, sem consulta nova. Dia sem linha é buraco, nunca 0.
  const serieGasto = useMemo(() => ({ rotulo: "investido", formatar: fmtBRL, ...serieContinua((porDia ?? []).map((r) => ({ dia: String(r.dia), valor: n(r.gasto) }))) }), [porDia]);
  const serieConversas = useMemo(() => ({ rotulo: "conversas iniciadas", ...serieContinua((porDia ?? []).map((r) => ({ dia: String(r.dia), valor: n(r.conversas) }))) }), [porDia]);
  const limitacoes = useMemo(() => limitacoesDeAnuncios(diag), [diag]);
  const plano = useMemo(() => (diag ? planoDeAcao(diag) : []), [diag]);
  // Formato 5 segundos (03.1.1.1, plano 09): os dias em números, para a régua, o custo por dia e o veredito. Só o que a tela já carregou.
  // Só dias fechados: o dia de hoje ainda está se formando e viraria "verba baixa" ou "abaixo do normal" por estar pela metade.
  const diasDeAnuncio = useMemo(() => (porDia ?? []).map((r) => ({ dia: String(r.dia).slice(0, 10), gasto: n(r.gasto), conversas: n(r.conversas) })).filter((r) => r.dia < hoje), [porDia, hoje]);

  // Leitura por regra (sem consulta nova, sem IA): o diagnóstico, o plano e os dois totais que a tela já carregou.
  const comparacaoCarregando = resumoAtual.isLoading || resumoAnt.isLoading;
  const fatos = useMemo(
    () =>
      isLoading || diagnosticoQ.isError || comparacaoCarregando
        ? null
        : fatosDosAnuncios({
            de: start,
            ate: end.slice(0, 10),
            hoje,
            diag: diag ?? null,
            plano,
            insights: insightsDeAnuncios(diag),
            atual: resumoEmNumeros(resumoAtual.data),
            anterior: resumoEmNumeros(resumoAnt.data),
          }),
    [isLoading, diagnosticoQ.isError, comparacaoCarregando, start, end, hoje, diag, plano, resumoAtual.data, resumoAnt.data],
  );

  // O veredito do custo por conversa contra o período anterior da própria clínica (portão do rastreio incluído). null enquanto a leitura carrega.
  const veredito = useMemo(
    () => (fatos ? vereditoDosAnuncios({ fatos, atual: resumoEmNumeros(resumoAtual.data), anterior: resumoEmNumeros(resumoAnt.data) }) : null),
    [fatos, resumoAtual.data, resumoAnt.data],
  );

  // Contagem em cinza da aba Anúncios na pasta (D-07): as campanhas do período que o diagnóstico já devolve; null quando a tela diz que
  // não há dado ("—" na pasta, nunca 0).
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/anuncios",
    valor: isLoading ? undefined : diagnosticoQ.isError ? null : diag?.campanhas.length || null,
  });

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

  // Cliente cuja conta de anúncios não é lida pela Meta/Windsor: impulsionamentos vêm da planilha de distribuição de conteúdo (semanal).
  const { data: planilha } = useQuery({
    queryKey: ["ads-planilha", clientId],
    queryFn: () => getAdsPlanilha(clientId),
    staleTime: 60_000,
  });
  const temPlanilha = (planilha?.length ?? 0) > 0;

  const cabecalho = {
    tela: "anuncios" as const,
    titulo: "Resultados dos anúncios",
    pergunta: "O dinheiro dos anúncios virou conversa?",
    decisao: "D3" as const,
    // O período já está na leitura (com o período anterior) e no seletor do topo: aqui só a fonte.
    meta: <NxTag tom="b">Meta Ads</NxTag>,
    acao: <SyncButton clientId={clientId} alvo="anuncios" />,
  };

  // Formato 5 segundos (03.1.1.1, plano 09): o veredito abre a tela; a leitura de antes mora no "Ver tudo" fechado.
  if (isLoading) {
    return <PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={null} carregando tela="anuncios" />} leitura={null} corpo={<NxCarregando texto="Lendo os anúncios…" linhas={3} />} />;
  }

  if (diagnosticoQ.isError || diasQ.isError)
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={null} carregando={false} erro="A consulta falhou." tela="anuncios" />}
        leitura={null}
        corpo={
          <NxErro
            texto="Não foi possível carregar os números dos anúncios. A fonte está indisponível. Isso não significa que o investimento ou os resultados foram zero."
            onTentar={() => {
              void diagnosticoQ.refetch();
              void diasQ.refetch();
            }}
          />
        }
      />
    );

  if (!diag || gasto === 0) {
    const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const mensagemVazia = ultimoGasto
      ? `Anúncios pausados: o último investimento registrado foi em ${dataBR(ultimoGasto)}. Não houve gasto em ${periodLabel}.`
      : fontes?.tem_anuncios
        ? `A conta de anúncios está ligada, mas ainda não tem nenhum gasto registrado.`
        : `Sem investimento registrado em ${periodLabel}. Se a clínica anuncia, falta ligar a conta de anúncio a este cliente no cadastro.`;
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={veredito} carregando={fatos == null} tela="anuncios" />}
        leitura={<LeituraDaTela fatos={fatos} carregando={comparacaoCarregando} semSelo />}
        resumoDoVerTudo="a leitura do período"
        corpo={
          <div className="nexo-mkt nexo-anuncios">
            <MotivoParada clientId={clientId} />
            {temPlanilha ? (
              <AdsPlanilhaPainel linhas={planilha ?? []} start={start} end={end} />
            ) : (
              <NxAlertaCurto
                tom="atencao"
                titulo={ultimoGasto ? "Anúncios pausados" : fontes?.tem_anuncios ? "Conta ligada, sem gasto ainda" : "Sem investimento no período"}
              >
                {mensagemVazia}
              </NxAlertaCurto>
            )}
          </div>
        }
      />
    );
  }

  const msg = diag.grupos.find((g) => g.grupo === "mensagem");
  const ctrConta = diag.impressoes > 0 ? diag.cliquesLink / diag.impressoes : null;
  const custoMil = diag.impressoes > 0 ? (diag.gasto / diag.impressoes) * 1000 : null;
  // Conta sem pixel nem formulário: leads e visitas à página chegam zerados e só a conversa é medida.
  const soConversa = diag.leads === 0 && diag.visitasPagina === 0;
  // Rastreio de conversas suspeito (rastreio-anuncios.ts): sem custo por conversa e sem diagnóstico de campanha.
  const suspeito = !!diag.rastreio?.suspeito;
  const rastreio = suspeito ? plano.find((p) => p.id === "anuncios-rastreio-suspeito") : undefined;
  // A mensagem do rastreio termina com o que verificar; o próximo passo já diz isso (e um pouco mais), então sai do texto.
  const textoRastreio = (diag.rastreio?.mensagem ?? "").replace(/\s*Verifique se .*$/, "") || diag.rastreio?.mensagem;

  // Variação contra o período anterior (ads_resumo dos dois lados, a mesma fonte do comparativo da conta).
  const ra = resumoAtual.data as any;
  const rb = resumoAnt.data as any;
  const varGasto = variacaoDe(ra?.gasto, rb?.gasto);
  const varConv = variacaoDe(ra?.conversas, rb?.conversas);
  const varClique = variacaoDe(ra?.cliques_link, rb?.cliques_link);
  // Pílula azul-clara do D-07, sem cor de bom ou de ruim: abaixo de 5% é "estável", sem seta.
  const pilula = (x: ReturnType<typeof variacaoDe>) =>
    x
      ? Math.abs(x.v) < 0.05
        ? { texto: "Estável vs período anterior" }
        : { texto: `${x.v > 0 ? "+" : "−"}${x.pct} vs período anterior`, sobe: x.v > 0 }
      : null;
  const info = (rotulo: string, texto: string) => <InfoDica texto={texto} rotulo={`Sobre ${rotulo}`} />;

  const abrirPlano = () => {
    const el = recomendacoes.current;
    if (!el) return;
    // O plano mora no "Ver tudo": abre o bloco de fora antes do de dentro.
    const verTudo = document.getElementById("detalhes-anuncios");
    if (verTudo instanceof HTMLDetailsElement) verTudo.open = true;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.querySelector("summary")?.focus();
  };

  const cartoesDoVerTudo: [ReactNode, ReactNode, ReactNode, ReactNode] = [
    <NxCartaoNumero
      key="investido"
      icone={ic(Wallet)}
      titulo="Investido"
      subtitulo={`${diag.campanhas.length} ${diag.campanhas.length === 1 ? "campanha" : "campanhas"}`}
      valor={fmtBRL(gasto)}
      legenda="no período"
      variacao={pilula(varGasto)}
      serie={serieGasto}
      info={info("Investido", `Tudo o que foi gasto em anúncios do Meta em ${periodLabel}, direto da conta de anúncio (não é estimativa), de ${diag.campanhas.length} campanhas com atividade.`)}
    />,
    <NxCartaoNumero
      key="conversas"
      icone={ic(MessageCircle)}
      titulo="Conversas iniciadas"
      subtitulo="WhatsApp e Direct"
      valor={int(diag.conversas)}
      legenda="de todas as campanhas"
      variacao={pilula(varConv)}
      serie={serieConversas}
      info={info("Conversas iniciadas", `WhatsApp e Direct, de todas as campanhas.${suspeito ? " Rastreio suspeito: o número real pode ser maior." : ""}`)}
    />,
    <NxCartaoNumero
      key="custo"
      icone={ic(Coins)}
      titulo="Custo por conversa"
      subtitulo={suspeito ? "rastreio suspeito" : msg ? "só campanhas de mensagem" : "sem campanha de mensagem"}
      valor={suspeito ? "Não confiável" : msg?.custoPorConversa != null ? fmtBRL(msg.custoPorConversa) : "—"}
      semMedida={!suspeito && msg?.custoPorConversa == null}
      legenda={suspeito ? "veja a leitura acima" : msg ? `${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)} conversas` : undefined}
      info={info(
        "Custo por conversa",
        `Conta só as campanhas de mensagem${msg ? ` (${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)})` : ""}: dividir a verba de todos os objetivos pelas conversas deixaria o número inflado. Referência de mercado, sem estudo independente e por isso sem cor: ${BENCHMARKS.custoPorConversa.referencia}.`,
      )}
    />,
    <NxCartaoNumero
      key="cliques"
      icone={ic(MousePointerClick)}
      titulo="Cliques no link"
      subtitulo={`${porCem(ctrConta)} a cada 100 aparições`}
      valor={int(diag.cliquesLink)}
      legenda="no link do anúncio"
      variacao={pilula(varClique)}
      info={info(
        "Cliques no link",
        diag.cliquesPerfil > 0
          ? `${int(diag.cliquesPerfil)} foram visitas ao perfil do Instagram e ${int(diag.cliquesLink - diag.cliquesPerfil)} foram para WhatsApp ou site. Clique no link pode levar ao perfil, ao WhatsApp ou ao site, conforme o destino da campanha: visita ao perfil faz o médico ser conhecido, mas não é pedido de atendimento.`
          : `Só clique no link, não curtida nem clique na foto${diag.cliquesLink > 0 ? `: ${fmtBRL(diag.gasto / diag.cliquesLink)} por clique` : ""}. Pode levar ao perfil do Instagram, ao WhatsApp ou ao site, conforme o destino da campanha.`,
      )}
    />,
  ];

  // ---- Formato 5 segundos (03.1.1.1, plano 09): só dados da própria clínica, contra o período anterior dela e contra os dias dela. ----
  const totalDeAgora = resumoEmNumeros(resumoAtual.data) ?? { gasto: diag.gasto, conversas: diag.conversas };
  const totalDeAntes = resumoEmNumeros(resumoAnt.data);
  const comparacaoDeCusto = compararCusto(totalDeAgora, totalDeAntes);
  const diasComCusto = custoPorDia(diasDeAnuncio);
  const verbaBaixa = diasDeVerbaBaixa(diasDeAnuncio);
  const media7 = mediaMovel7(diasDeAnuncio);
  // A faixa do normal das conversas por dia (só dias fechados): marca os dias fora dela e serve ao "Por quê?" dos dias de verba baixa.
  const conversasPorDia = serieContinua(diasDeAnuncio.map((r) => ({ dia: r.dia, valor: r.conversas })));
  const faixaDeConversas = faixaDoNormal(conversasPorDia.valores);
  const marcasDeConversas = foraDaFaixa(conversasPorDia.valores, faixaDeConversas);
  const temDiaForaDoNormal = marcasDeConversas.some((m) => m === "acima" || m === "abaixo");
  const diasBaixos = new Set(verbaBaixa?.dias ?? []);
  const indicesBaixos = conversasPorDia.datas.map((data, i) => (diasBaixos.has(data) ? i : -1)).filter((i) => i >= 0);

  const textoDaMudanca = (v: { texto: string } | null, antes: string, palavra?: string) => (v ? `${v.texto}${palavra ? ` ${palavra}` : ""} · vs ${antes} antes` : null);
  const varGastoCinco = totalDeAntes ? variacaoPropria(totalDeAgora.gasto, totalDeAntes.gasto) : null;
  const varConversasCinco = totalDeAntes ? variacaoPropria(totalDeAgora.conversas, totalDeAntes.conversas) : null;
  const semAnterior = <p className="nx-cinco-falta" data-falta-dado>Falta dado: sem o período anterior para comparar.</p>;
  const custoAgora = custoDoTotal(totalDeAgora);

  const cartoes = [
    <NxCartaoNumero
      key="investido"
      icone={ic(Wallet)}
      titulo="Investido"
      subtitulo={verbaBaixa ? `${verbaBaixa.dias.length} dias com verba baixa` : `${diag.campanhas.length} ${diag.campanhas.length === 1 ? "campanha" : "campanhas"}`}
      valor={fmtBRL(gasto)}
      legenda="no período"
      variacao={varGastoCinco && totalDeAntes ? { texto: textoDaMudanca(varGastoCinco, fmtBRL(totalDeAntes.gasto)) ?? "" } : null}
      extra={varGastoCinco ? undefined : semAnterior}
      serie={serieGasto}
      info={info("Investido", `Tudo o que foi gasto em anúncios do Meta em ${periodLabel}, direto da conta de anúncio (não é estimativa), de ${diag.campanhas.length} campanhas com atividade. Dia com verba baixa é o que ficou abaixo da metade do seu dia comum.`)}
    />,
    <NxCartaoNumero
      key="conversas"
      icone={ic(MessageCircle)}
      titulo="Conversas pelo anúncio"
      subtitulo="WhatsApp e Direct"
      valor={int(diag.conversas)}
      legenda="de todas as campanhas"
      variacao={varConversasCinco && totalDeAntes ? { texto: textoDaMudanca(varConversasCinco, int(totalDeAntes.conversas)) ?? "" } : null}
      extra={
        temDiaForaDoNormal || !varConversasCinco ? (
          <div className="nx-anuncios-sinais">
            {temDiaForaDoNormal && <NxSelo tom="atencao" texto="Fora do normal" />}
            {!varConversasCinco && semAnterior}
          </div>
        ) : undefined
      }
      serie={serieConversas}
      info={info("Conversas pelo anúncio", `WhatsApp e Direct, de todas as campanhas.${suspeito ? " Rastreio suspeito: o número real pode ser maior." : ""}${faixaDeConversas ? ` O seu dia normal tem de ${faixaDeConversas.lo} a ${faixaDeConversas.hi} conversas.` : ""}`)}
    />,
    <NxCartaoNumero
      key="custo"
      icone={ic(Coins)}
      titulo="Custo por conversa"
      subtitulo={suspeito ? "rastreio suspeito" : media7.melhor ? `Melhor semana: ${fmtBRL(media7.melhor.valor)} (7 dias até ${ddmm(media7.melhor.ate)})` : "média de 7 dias ainda sem dado"}
      valor={suspeito ? "Não confiável" : custoAgora != null ? fmtBRL(custoAgora) : "—"}
      semMedida={!suspeito && custoAgora == null}
      legenda={suspeito ? "veja o aviso do rastreio" : custoAgora != null ? `${fmtBRL(totalDeAgora.gasto)} ÷ ${int(totalDeAgora.conversas)} conversas` : undefined}
      variacao={!suspeito && comparacaoDeCusto ? { texto: textoDaMudanca(comparacaoDeCusto.v, fmtBRL(comparacaoDeCusto.antes), comparacaoDeCusto.v.sinal === "=" ? undefined : comparacaoDeCusto.v.pct < 0 ? "mais barato" : "mais caro") ?? "" } : null}
      extra={!suspeito && custoAgora != null && !comparacaoDeCusto ? <p className="nx-cinco-falta" data-falta-dado>Falta dado: poucas conversas para comparar com o período anterior.</p> : undefined}
      serie={suspeito || media7.melhor == null ? undefined : { rotulo: "custo por conversa, média de 7 dias", formatar: fmtBRL, datas: media7.datas, valores: media7.valores }}
      info={info(
        "Custo por conversa",
        `Investido ÷ conversas de todas as campanhas, no período e no anterior (a mesma conta dos dois lados). A linha é a média móvel de 7 dias. O custo só das campanhas de mensagem${msg ? ` (${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)})` : ""} está no Ver tudo. Referência de mercado, sem estudo independente e por isso sem cor: ${BENCHMARKS.custoPorConversa.referencia}.`,
      )}
    />,
  ] as const;

  // Descobertas (de 0 a 5, só com a própria clínica): as 3 primeiras à vista, as outras no começo do "Ver tudo". Sem veredito, nenhuma.
  const descobertas = descobertasDosAnuncios({ porDia: diasDeAnuncio, atual: totalDeAgora, anterior: totalDeAntes, fatos, diario: diario.data ?? null, equipe });
  const { visiveis, resto } = visiveisEResto(descobertas.itens);

  // A régua dos próprios dias: o custo por conversa de cada dia contra o custo de antes da própria clínica. Com o rastreio suspeito o custo não é
  // confiável (D-05), então a régua não aparece. Poucos dias com conversa: "Falta dado", nunca uma régua de 2 pontos.
  const principal = suspeito ? undefined : diasComCusto.length >= MIN_DIAS_DA_REGUA ? (
    <NxReguaDosDias dias={diasComCusto} custoAntes={comparacaoDeCusto?.antes ?? null} custoAgora={custoAgora} formatar={reais} />
  ) : (
    <NxCard icone={ic(CalendarDays)} titulo="Seus dias, um a um" rotulo="Seus dias, um a um">
      <p className="nx-cinco-falta" data-falta-dado>Falta dado: poucos dias com conversa para comparar um dia com o outro.</p>
    </NxCard>
  );

  // O "Por quê?" dos dias de verba baixa leva, depois das barras, as conversas por dia sobre a faixa do normal da própria clínica.
  const extraDoPorque = (d: Descoberta) =>
    d.id === "anuncios-verba-baixa" && conversasPorDia.datas.length > 0 ? (
      <NxDiasComFaixa
        compacto
        rotulo="conversas"
        datas={conversasPorDia.datas}
        valores={conversasPorDia.valores}
        faixa={faixaDeConversas}
        marcas={marcasDeConversas}
        destaque={indicesBaixos}
        legendaDoDestaque="dia de verba baixa"
      />
    ) : null;

  // A ação local de uma descoberta só abre um lugar desta tela (nada é enviado nem gravado).
  function agirNaDescoberta(local: string) {
    if (local === ACOES_DE_ANUNCIOS.plano) abrirPlano();
    else if (local === ACOES_DE_ANUNCIOS.campanhas) {
      const verTudo = document.getElementById("detalhes-anuncios");
      if (verTudo instanceof HTMLDetailsElement) verTudo.open = true;
      requestAnimationFrame(() => document.getElementById("campanhas-anuncios")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  // A lista de descobertas só aparece com os resultados diários já lidos (ou falhados): sem isso a descoberta do gargalo entraria depois e
  // empurraria as outras de lugar. O veredito espera junto, para a tela inteira abrir de uma vez só.
  const aguardando = fatos == null || diario.isPending;

  return (
    <PaginaNexo
      {...cabecalho}
      // A sincronização: no computador fica no cabeçalho; no celular desce para o "Ver tudo" (o cabeçalho fica só com a pergunta).
      acao={
        <div className="nx-anuncios-sync nx-anuncios-sync--topo">
          <SyncButton clientId={clientId} alvo="anuncios" />
        </div>
      }
      veredito={
        <>
          <NxVeredito veredito={aguardando ? null : veredito} carregando={aguardando} tela="anuncios" />
          {/* Avisos que mudam a leitura dos números ficam à vista, curtos, logo abaixo do veredito (honestidade antes de tudo). */}
          <MotivoParada clientId={clientId} />
          <ContaCompartilhada clientId={clientId} />
        </>
      }
      leitura={<LeituraDaTela fatos={fatos} carregando={comparacaoCarregando} semSelo />}
      cartoes={cartoes as unknown as [ReactNode, ReactNode?, ReactNode?]}
      principal={principal}
      descobertas={
        !aguardando && veredito?.tipo === "veredito" ? (
          <NxDescobertas
            titulo="O que descobrimos"
            apoio={<p className={descobertas.aviso ? "nx-cinco-falta" : "nx-cinco-falta nx-anuncios-ordem"}>{descobertas.aviso ?? "Em ordem de impacto"}</p>}
            itens={visiveis}
            clientId={clientId}
            dateRange={dateRangeState}
            aoAgir={agirNaDescoberta}
            extraDoPorque={extraDoPorque}
          />
        ) : undefined
      }
      corpo={
        suspeito ? (
          <NxAlertaCurto
            titulo="As conversas dos anúncios não estão sendo contadas direito"
            passo={rastreio?.acao?.texto ?? "Conferir o objetivo de cada campanha e o código de rastreio do link do WhatsApp."}
            quem="Gestor de tráfego"
          >
            {textoRastreio}
          </NxAlertaCurto>
        ) : undefined
      }
      resumoDoVerTudo="números, gráfico por dia, campanhas, plano e comparativo"
      detalhe={
        <div className="nexo-mkt nexo-anuncios">
          <div className="nx-anuncios-sync nx-anuncios-sync--ver-tudo">
            <SyncButton clientId={clientId} alvo="anuncios" />
          </div>
          {resto.length > 0 && <MaisDescobertasDosAnuncios itens={resto} clientId={clientId} dateRange={dateRangeState} aoAgir={agirNaDescoberta} extraDoPorque={extraDoPorque} />}
          {/* Formato 5 segundos (MEDV-02): os 4 números de antes (com o "Cliques no link") moram aqui, no "Ver tudo", como sempre foram. */}
          <div className="nx-grade nx-grade--4">{cartoesDoVerTudo}</div>
          {/* Os cartões de Investido e Conversas já mostram a linha de 30 dias: o gráfico diário completo (barras e linha) vem para cá (nada some, D-03). */}
          <NxCard
            icone={ic(CalendarDays)}
            titulo="Investimento e conversas por dia"
            rotulo="Investimento e conversas por dia"
          >
            <NxBarrasLinha
              altura={130}
              dados={serie}
              rotulo="Investimento e conversas por dia"
              nomeBarra="Investido"
              nomeLinha="Conversas"
              formatarBarra={brlCurto}
              formatarLinha={int}
              formatarData={ddmm}
            />
          </NxCard>
          <NxNota>Gráfico por dia: barras = investido no dia, linha = conversas iniciadas. Dias em que a linha não acompanha a barra são os que merecem olhada.</NxNota>

          {soConversa && (
            <NxNota>
              <b>Só conversas são medidas nesta conta:</b> "leads" e "visitas à página" chegaram zerados em {periodLabel} (sem pixel nem formulário
              instalado). Campanhas de cadastro ou vendas ficam sem o resultado próprio.
            </NxNota>
          )}

          <NxCard icone={ic(Filter)} titulo="Do anúncio à conversa" subtitulo="Quantas pessoas passaram de cada etapa" rotulo="Do anúncio à conversa">
            <NxFunil
              rotulo="Do anúncio à conversa"
              etapas={[
                { rotulo: "Aparições", valor: diag.impressoes, texto: int(diag.impressoes), icone: <Eye size={16} strokeWidth={1.7} aria-hidden /> },
                {
                  rotulo: "Cliques no link",
                  valor: diag.cliquesLink,
                  texto: int(diag.cliquesLink),
                  passagem: ctrConta != null ? `${porCem(ctrConta)} cliques a cada 100 aparições` : null,
                  icone: <MousePointerClick size={16} strokeWidth={1.7} aria-hidden />,
                },
                {
                  rotulo: "Conversas iniciadas",
                  valor: diag.conversas,
                  texto: int(diag.conversas),
                  passagem: diag.cliquesLink > 0 ? `${porCem(diag.conversas / diag.cliquesLink)} conversas a cada 100 cliques${suspeito ? " (rastreio suspeito)" : ""}` : null,
                  icone: <MessageCircle size={16} strokeWidth={1.7} aria-hidden />,
                },
              ]}
            />
            {custoMil != null && <NxNota>{fmtBRL(custoMil)} a cada mil aparições. A mesma pessoa pode ver o anúncio mais de uma vez.</NxNota>}
          </NxCard>

          <div className="nx-grade nx-grade--2">
            <OndeFoiAVerba d={diag} />
            <OQueFazer d={diag} aoVerPlano={abrirPlano} />
          </div>

          <NxComoCalcula titulo="Como estes números são calculados">
            <p>
              Investimento em anúncios do Meta em {periodLabel}, direto da conta de anúncio: não é estimativa. Cada campanha é julgada pelo resultado
              do objetivo dela (conversa, cadastro, clique ou aparições) e comparada só com campanhas do mesmo objetivo; com poucas campanhas no
              objetivo, com a conta toda, pela conversa. O sync roda automaticamente todo dia.
            </p>
            {soConversa && (
              <p>
                <strong>Conversa iniciada</strong> (Direct ou WhatsApp) é o resultado que dá para medir aqui: esta conta não tem pixel nem formulário
                instalado, então "leads" e "visitas à página" chegam zerados e ficam de fora.
              </p>
            )}
            <p>
              <b>Custo por conversa</b> conta só as campanhas de mensagem ({msg ? `${fmtBRL(msg.gasto)} ÷ ${int(msg.conversas)}` : "nenhuma no período"}):
              dividir a verba de todos os objetivos pelas conversas deixaria o número inflado. Referência de mercado, sem estudo independente e por isso
              sem cor: {BENCHMARKS.custoPorConversa.referencia}. <b>Aparições</b> são as vezes que o anúncio apareceu na tela (a mesma pessoa pode ver
              mais de uma vez). <b>Cliques a cada 100 aparições</b> conta só clique no link, não curtida nem clique na foto. <b>Clique no link</b> pode
              levar ao perfil do Instagram, ao WhatsApp ou ao site, conforme o destino da campanha: visita ao perfil faz o médico ser conhecido, mas não
              é pedido de atendimento.
            </p>
            <p>
              A variação dos cartões compara com {ddmm(antIni)} a {ddmm(antFim)} ({dias} dias), somando todas as campanhas, ativas ou não. Abaixo de 5% o
              número aparece como estável.
            </p>
          </NxComoCalcula>

          <details ref={recomendacoes} id="recomendacoes-anuncios" className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <summary className="min-h-[44px] cursor-pointer py-3 font-semibold">Ver recomendações e ações para os anúncios</summary>
            <div className="mt-3 space-y-4"><AgirHoje d={diag} clientId={clientId} /></div>
          </details>

          <ComparativoConta clientId={clientId} start={start} end={end} />

          <QualidadeLeadsCampanha clientId={clientId} start={start} end={end} />
          <PostsImpulsionados clientId={clientId} start={start} end={end} />

          <div id="campanhas-anuncios">{suspeito ? <ObjetivosDasCampanhas d={diag} /> : <DiagnosticoCampanhas d={diag} />}</div>

          <PorObjetivo d={diag} />

          <ListaLimitacoes itens={limitacoes} />

          <MetodologiaAnuncios d={diag} />

          <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--muted)" }}>
            <Megaphone size={12} aria-hidden /> Referências de mercado só pintam de cor quando a fonte tem metodologia publicada.
          </p>
        </div>
      }
    />
  );
}
