import { useMemo } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { statusDoCliente, diasDeAtraso, ddmm } from "@/lib/saude-fontes";
import { motivoDaLinha, COR_DONO } from "@/lib/motivos";
import { SeloDono } from "@/components/selo-dono";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { getAdsPorDia, getAdsDiagnosticoPorObjetivo, getClientFontes } from "@/lib/client-data";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { ComparativoConta } from "@/components/anuncios/comparativo-conta";
import { QualidadeLeadsCampanha } from "@/components/anuncios/qualidade-leads";
import { fmtBRL } from "@/lib/format";
import { GRUPOS, conversaMaisBarata, planoDeAcao, limitacoesDeAnuncios, unidade, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { BENCHMARKS } from "@/lib/benchmarks";
import { InsightCard, ListaLimitacoes, OQueE } from "@/components/insight-card";
import { MetodologiaAnuncios } from "@/components/anuncios/metodologia";
import { DiagnosticoCampanhas, Faixa } from "@/components/anuncios/diagnostico-campanhas";
import { Wallet, MessageCircle, Coins, Eye, MousePointerClick, Percent, PauseCircle, AlertTriangle, Info, CalendarDays, Layers, Zap, Megaphone } from "lucide-react";
import { Painel, Kpi, BarraFina } from "@/components/visual";
import { fmtFracao } from "@/lib/metricas";

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
                <span className="min-w-0">
                  <span className="font-medium">{G.nome}</span>
                  <span className="ml-1.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }} title="Objetivo como vem da Meta">
                    {g.objetivosBrutos.join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums">
                  <b className="font-semibold">{fmtBRL(g.gasto)}</b>
                  <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                    {fmtFracao(fatia)} da verba
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
      return (data ?? []) as { ad_account_id: string; outros_clientes: number; nomes: string[] | null }[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!data?.length) return null;
  return (
    <>
      {data.map((c) => (
        <Faixa key={c.ad_account_id} icone={AlertTriangle} cor="var(--warn)" alerta>
          A conta de anúncios {c.ad_account_id} também está ligada a {c.outros_clientes} outro{c.outros_clientes > 1 ? "s" : ""} cliente
          {c.outros_clientes > 1 ? "s" : ""}
          {c.nomes?.length ? ` (${c.nomes.join(", ")})` : ""}: o gasto e os resultados aparecem inteiros em cada um. Não some os clientes. Para
          separar, cada cliente precisa da própria conta ou de um filtro por campanha no cadastro.
        </Faixa>
      ))}
    </>
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
    return <Carregando texto="Lendo os anúncios…" />;
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
  // Conta sem pixel nem formulário: leads e visitas à página chegam zerados e só a conversa é medida.
  const soConversa = diag.leads === 0 && diag.visitasPagina === 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="anuncios" />
      </div>

      <MotivoParada clientId={clientId} />
      <ContaCompartilhada clientId={clientId} />
      <Faixa
        icone={CalendarDays}
        ajuda={
          <>
            Investimento em anúncios do Meta em {periodLabel}, direto da conta de anúncio — não é estimativa. Cada campanha é julgada pelo
            resultado do objetivo dela (conversa, cadastro, clique ou aparições) e comparada só com campanhas do mesmo objetivo; com poucas
            campanhas no objetivo, com a conta toda, pela conversa.{" "}
            {soConversa && (
              <>
                <strong>Conversa iniciada</strong> (Direct ou WhatsApp) é o resultado que dá para medir aqui: esta conta não tem pixel nem
                formulário instalado, então "leads" e "visitas à página" chegam zerados e ficam de fora.{" "}
              </>
            )}
            O sync roda automaticamente todo dia.
          </>
        }
      >
        Meta Ads · {periodLabel} · {diag.campanhas.length} campanhas · dados reais da conta
      </Faixa>

      {soConversa && (
        <Faixa icone={Info} cor="var(--warn)" alerta>
          <span className="text-xs">
            <b>Só conversas são medidas nesta conta:</b> "leads" e "visitas à página" chegaram zerados em {periodLabel} (sem pixel nem formulário
            instalado). Conversa iniciada (Direct ou WhatsApp) é o resultado que dá para medir aqui; campanhas de cadastro ou vendas ficam sem o
            resultado próprio.
          </span>
        </Faixa>
      )}

      <AgirHoje d={diag} clientId={clientId} />

      <ComparativoConta clientId={clientId} start={start} end={end} />

      <QualidadeLeadsCampanha clientId={clientId} start={start} end={end} />

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

      <DiagnosticoCampanhas d={diag} />

      <PorObjetivo d={diag} />

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

      <MetodologiaAnuncios d={diag} />

      <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
        <Megaphone size={12} aria-hidden /> Referências de mercado só pintam de cor quando a fonte tem metodologia publicada.
      </p>
    </div>
  );
}
