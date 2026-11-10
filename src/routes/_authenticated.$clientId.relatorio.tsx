import { useEffect, useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, ChevronDown, Copy, FileDown, RotateCcw, ShieldCheck } from "lucide-react";
import {
  getAdsCampanhasPeriodo, getAtendimentosWhatsapp,
  getClient,
  getClientFontes,
  getCrmLeadsPorDiaPeriodo,
  getCrmResumoPeriodo,
  getCrmVendasPeriodo,
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsResumo,
  getWtsVolumeDiario,
} from "@/lib/client-data";
import { getResumoPeriodo } from "@/lib/audiencia";
import { completeInstagramPeriod } from "@/lib/report-period";
import { aplicarRastreio, diagnosticarAds } from "@/lib/anuncios-objetivo";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { buildRelatorioEnvio, LIMITE_WHATSAPP, SECOES, type AlteracaoLinguagem, type ChecagemItem, type RelatorioEnvio } from "@/lib/relatorio-envio";
import { checarLinguagemCFM, ROTULO_REGRA_CFM } from "@/lib/linguagem-cfm";
import { InsightCard } from "@/components/insight-card";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { usePautas } from "@/components/planejador-conteudo";
import { statusDoCliente } from "@/lib/saude-fontes";
import { motivoDaLinha } from "@/lib/motivos";
import { pendenciasDoCliente, textosComTom, ROTULO_TOM, type Tom } from "@/lib/relatorio-tom";
import { ROTULO_FORMATO, seteDias } from "@/lib/pauta";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { useResultado } from "@/hooks/use-resultado";
import { fmtNum } from "@/lib/format";
import { InfoDica } from "@/components/visual";
import { IconeTabler } from "@/components/icons/tabler";
import type { NomeIcone } from "@/lib/registro-de-telas";
import type { ItemEnvio, SecaoId } from "@/lib/relatorio-envio";
import { NxCard, NxKpi, NxLinhaTempo, NxSectionHeader, NxTag, type NxSerie, type NxTom } from "@/components/nx";
import { PlanoAviso, PlanoCabecalho, PlanoComo, PlanoVazio, TileTabler } from "@/components/nx/plano-pecas";

export const Route = createFileRoute("/_authenticated/$clientId/relatorio")({
  component: RelatorioPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

// A leitura do alcance único vai à Meta ao vivo; não deixa o relatório esperando para sempre.
function comPrazo<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

type Versao = "whatsapp" | "executiva" | "pdf";

function RelatorioPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const f = fontes.data;
  const temIg = f?.tem_instagram === true;
  const temAds = f?.tem_anuncios === true;
  const temWts = f?.tem_atendimento === true;
  const temCrm = f?.tem_crm === true;

  const metrics = useQuery({ queryKey: ["rel-metrics", clientId, start, end], queryFn: () => getMonthlyMetrics(clientId, start, end), enabled: temIg });
  const posts = useQuery({ queryKey: ["rel-posts", clientId, start, end], queryFn: () => getPostsForAnalytics(clientId, start, end), enabled: temIg });
  const perguntas = useQuery({ queryKey: ["rel-perguntas", clientId, start, end], queryFn: () => getPatientQuestionsPeriodo(clientId, start, end), enabled: temIg });
  const periodoIg = useQuery({
    queryKey: ["periodo-ig", clientId, start, end],
    queryFn: () => comPrazo(getResumoPeriodo(clientId, start, end), 12_000, { erro: "A Meta demorou a responder." }),
    enabled: temIg,
    staleTime: 20 * 60_000,
    retry: false,
  });
  const ads = useQuery({
    queryKey: ["rel-ads-objetivo", clientId, start, end],
    queryFn: async () => {
      const [{ linhas, cadastro, janela }, whatsapp] = await Promise.all([getAdsCampanhasPeriodo(clientId, start, end), getAtendimentosWhatsapp(clientId, start, end)]);
      return { diag: aplicarRastreio(diagnosticarAds(linhas, cadastro, start, end, janela), whatsapp), diasComDado: Array.from(new Set(linhas.filter((l) => Number(l.spend) > 0 || Number(l.impressions) > 0).map((l) => String(l.date).slice(0, 10)))) };
    },
    enabled: temAds,
  });
  const wts = useQuery({
    queryKey: ["rel-wts", clientId, start, end],
    queryFn: async () => {
      const [resumo, dias] = await Promise.all([getWtsResumo(clientId, start, end), getWtsVolumeDiario(clientId, start, end)]);
      return { resumo, diasComDado: (dias ?? []).filter((d: any) => Number(d.atendimentos) > 0).map((d: any) => String(d.dia).slice(0, 10)) };
    },
    enabled: temWts,
  });
  const crm = useQuery({
    queryKey: ["rel-crm", clientId, start, end],
    queryFn: async () => {
      const [resumo, dias, vendas] = await Promise.all([getCrmResumoPeriodo(clientId, start, end), getCrmLeadsPorDiaPeriodo(clientId, start, end), getCrmVendasPeriodo(clientId, start, end)]);
      return { resumo, diasComDado: dias.filter((d) => Number(d.total) > 0).map((d) => String(d.dia).slice(0, 10)), vendas };
    },
    enabled: temCrm,
  });

  const queries = [client, fontes, ...(temIg ? [metrics, posts, perguntas, periodoIg] : []), ...(temAds ? [ads] : []), ...(temWts ? [wts] : []), ...(temCrm ? [crm] : [])];
  const loading = queries.some((q) => q.isLoading);
  const erro = [client, fontes, metrics, posts, perguntas, ads, wts, crm].some((q) => q.error);

  // O que a equipe tirou do envio (seção inteira ou bloco) e as frases sinalizadas pelo CFM que ela
  // decidiu manter como foram geradas. As duas escolhas refazem as 3 versões (WhatsApp, executiva, PDF).
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [manterCfm, setManterCfm] = useState<string[]>([]);

  const envio: RelatorioEnvio | null = useMemo(() => {
    if (loading || erro || !client.data || !f) return null;
    return buildRelatorioEnvio({
      clientName: client.data.name,
      periodLabel,
      start,
      end,
      fontes: { tem_instagram: temIg, tem_anuncios: temAds, tem_crm: temCrm, tem_atendimento: temWts },
      metrics: metrics.data ?? [],
      posts: posts.data ?? [],
      perguntas: perguntas.data ?? [],
      alcanceUnico: completeInstagramPeriod(periodoIg.data?.dados, start, end)?.alcance_unico ?? null,
      ads: ads.data ?? null,
      wts: wts.data ?? null,
      crm: crm.data ?? null,
      excluir: excluidos,
      manterOriginal: manterCfm,
    });
  }, [loading, erro, client.data, f, periodLabel, start, end, temIg, temAds, temCrm, temWts, metrics.data, posts.data, perguntas.data, periodoIg.data, ads.data, wts.data, crm.data, excluidos, manterCfm]);

  // Tom e blocos extras (pendências do cliente, próxima semana). "padrao" mantém o texto de sempre.
  const [tom, setTom] = useState<Tom | "padrao">("padrao");
  const [explicar, setExplicar] = useState(false);
  const [comPendencias, setComPendencias] = useState(true);
  const [comSemana, setComSemana] = useState(true);
  const qualidade = useQualidadeDados(clientId);
  const saude = useQuery({ queryKey: ["saude-cliente-motivos", clientId], queryFn: () => statusDoCliente(clientId), staleTime: 5 * 60_000, retry: false });
  const pautasApi = usePautas(clientId);
  const pendencias = useMemo(
    () => pendenciasDoCliente(qualidade.data ?? [], (saude.data ?? []).map((l) => motivoDaLinha(l)).filter((m): m is NonNullable<typeof m> => !!m)),
    [qualidade.data, saude.data],
  );
  const proximaSemana = useMemo(() => {
    const dias = seteDias(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));
    const rot = new Map(dias.map((d) => [d.data, d.rotulo]));
    return (pautasApi.q.data?.pautas ?? [])
      .filter((p) => p.dia && rot.has(p.dia) && p.status !== "medida")
      .sort((a, b) => (a.dia! < b.dia! ? -1 : 1))
      .map((p) => `${rot.get(p.dia!)}: ${ROTULO_FORMATO[p.formato]} sobre ${p.titulo}`);
  }, [pautasApi.q.data]);
  const gerados = useMemo(() => {
    if (!envio) return null;
    const extras = { pendencias: comPendencias ? pendencias : [], proximaSemana: comSemana ? proximaSemana : [] };
    if (tom === "padrao" && !explicar && extras.pendencias.length === 0 && extras.proximaSemana.length === 0) return { whatsapp: envio.whatsapp, executiva: envio.executiva };
    return textosComTom({ clientName: client.data?.name ?? "", periodLabel }, envio.conteudo, tom === "padrao" ? "consultivo" : tom, extras, { explicarTermos: explicar });
  }, [envio, tom, explicar, comPendencias, comSemana, pendencias, proximaSemana, client.data, periodLabel]);

  // Texto editável: volta ao gerado quando muda o período/dados ou em "Voltar ao texto gerado".
  const [versao, setVersao] = useState<Versao>("whatsapp");
  const [textoWhats, setTextoWhats] = useState("");
  const [textoExec, setTextoExec] = useState("");
  const [copiado, setCopiado] = useState<Versao | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  useEffect(() => {
    if (gerados) {
      setTextoWhats(gerados.whatsapp);
      setTextoExec(gerados.executiva);
    }
  }, [gerados]);

  const head = (
    <PlanoCabecalho
      titulo="Como foi o período"
      pergunta="Os números, o que aconteceu, o que fazer e o texto pronto para enviar ao cliente."
      periodo={periodLabel}
    />
  );

  if (loading) return <div className="nexo-plano">{head}<Carregando texto="Conferindo os dados e montando o relatório…" /></div>;
  if (erro || !envio) return <div className="nexo-plano">{head}<ErroCarga texto="Falha ao ler os dados do período. Os números não foram substituídos por zeros." /><div><button type="button" className="pl-botao" onClick={() => { queries.filter(q => q.isError).forEach(q => void q.refetch()); }}>Tentar novamente</button></div></div>;
  if (!temIg && !temAds && !temWts && !temCrm) {
    return (
      <div className="nexo-plano">
        {head}
        <SemFonte {...SEM_INSTAGRAM} texto="Este cliente não tem nenhuma fonte ligada (Instagram, anúncios, WhatsApp ou CRM), então não há o que relatar. O relatório não é gerado vazio." />
      </div>
    );
  }

  async function copiar(texto: string, qual: Versao) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      window.prompt("Copie o texto:", texto);
    }
  }

  async function baixarPdf() {
    setGerandoPdf(true);
    setErroPdf(null);
    try {
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start, end, periodLabel, textoCliente: textoWhats, envio: envio! });
    } catch (e) {
      setErroPdf(mensagemDeErroAcao(e));
    } finally {
      setGerandoPdf(false);
    }
  }

  const semDado = SECOES.every((s) => envio.conteudoCompleto[s.id].length === 0 || s.id === "limitacoes");
  const tudoDesmarcado = !semDado && SECOES.every((s) => envio.conteudo[s.id].length === 0);
  const btn = "pl-botao";
  const alternarManter = (original: string) => setManterCfm((cur) => (cur.includes(original) ? cur.filter((x) => x !== original) : [...cur, original]));

  return (
    <div className="nexo-plano">
      {head}

      {/* 1. Os números do período, com variação, e o gráfico principal. */}
      <NumerosDoPeriodo clientId={clientId} start={start} end={end} temIg={temIg} diario={(metrics.data as any[]) ?? []} posts={(posts.data as any[]) ?? []} />

      {/* 2. A leitura: o que aconteceu e o que fazer (o mesmo conteúdo conferido que vai no texto). */}
      <LeituraDoPeriodo envio={envio} />

      {/* Dado incompleto: curto e sempre visível. */}
      {envio.omitidos.length > 0 && <NaoIncluido omitidos={envio.omitidos} />}

      {/* 3. O texto para enviar. */}
      {semDado ? (
        <SemFonte titulo="Sem dado para montar o texto" texto="Nenhuma seção tem dado neste período, então o relatório ficaria vazio. Troque o período no cabeçalho." />
      ) : tudoDesmarcado ? (
        <SemFonte titulo="Nada marcado para enviar" texto="Todas as seções foram desmarcadas em “O que entra no texto”. Marque ao menos uma para montar as versões." />
      ) : (
        <NxCard
          id="rel-versoes"
          nivel={2}
          icone={<IconeTabler nome="message-circle" tamanho={17} traco={1.7} />}
          titulo="Versões para enviar"
          subtitulo="O mesmo conteúdo conferido em três formatos. Edite, confira e copie."
        >
          <Checagem envio={envio} alternarManter={alternarManter} />
          <div role="tablist" aria-label="Versão do relatório" className="pl-trilho">
            {(
              [
                ["whatsapp", "WhatsApp"],
                ["executiva", "Reunião"],
                ["pdf", "PDF"],
              ] as [Versao, string][]
            ).map(([id, rot]) => (
              <button key={id} type="button" role="tab" aria-selected={versao === id} onClick={() => setVersao(id)}>
                {rot}
              </button>
            ))}
          </div>

          {versao === "whatsapp" && (
            <EditorVersao
              id="rel-whats"
              rotulo="Versão curta para WhatsApp (edite à vontade antes de copiar)"
              texto={textoWhats}
              setTexto={setTextoWhats}
              gerado={gerados?.whatsapp ?? envio.whatsapp}
              limite={LIMITE_WHATSAPP}
              linhas={16}
              previa="whatsapp"
            >
              <button type="button" className={`${btn} pl-botao--pri`} onClick={() => copiar(textoWhats, "whatsapp")} disabled={!textoWhats.trim()}>
                <Copy size={15} aria-hidden /> {copiado === "whatsapp" ? "Copiado" : "Copiar para WhatsApp"}
              </button>
            </EditorVersao>
          )}

          {versao === "executiva" && (
            <EditorVersao id="rel-exec" rotulo="Versão executiva para reunião: pontos principais e 3 decisões" texto={textoExec} setTexto={setTextoExec} gerado={gerados?.executiva ?? envio.executiva} linhas={18} previa="doc">
              <button type="button" className={`${btn} pl-botao--pri`} onClick={() => copiar(textoExec, "executiva")} disabled={!textoExec.trim()}>
                <Copy size={15} aria-hidden /> {copiado === "executiva" ? "Copiado" : "Copiar versão executiva"}
              </button>
            </EditorVersao>
          )}

          {versao === "pdf" && (
            <div className="grid gap-3">
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                Primeira página: o achado do período, os números principais e as 6 seções com a evidência de cada ponto. Depois, o detalhe de Instagram, anúncios, WhatsApp e CRM, e a mensagem de WhatsApp como estiver editada.
              </p>
              <ul className="pl-checagem" aria-label="Seções do PDF">
                {SECOES.map((s) => {
                  const n = envio.conteudo[s.id].length;
                  const fora = envio.conteudoCompleto[s.id].length - n;
                  return (
                    <li key={s.id}>
                      <NxTag tom={n ? "b" : "g"}>
                        {s.titulo}: {n} {n === 1 ? "item" : "itens"}
                        {fora > 0 ? ` (${fora} desmarcado${fora === 1 ? "" : "s"})` : ""}
                      </NxTag>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${btn} pl-botao--pri`} onClick={baixarPdf} disabled={gerandoPdf}>
                  <FileDown size={15} aria-hidden /> {gerandoPdf ? "Gerando o PDF…" : "Baixar PDF detalhado"}
                </button>
              </div>
              <PlanoComo titulo="O que o PDF registra">
                <p>O que foi desmarcado em “O que entra no texto” fica fora do PDF e é registrado na página de metodologia.</p>
              </PlanoComo>
              {erroPdf && (
                <p className="text-sm" style={{ color: "var(--crit)" }}>
                  {erroPdf}
                </p>
              )}
            </div>
          )}
          <p className="text-xs" style={{ color: "var(--muted-ink)" }}>O envio direto pelo WhatsApp é fase 2. Hoje: copie e cole na conversa do cliente.</p>
        </NxCard>
      )}

      {/* 4. Ajustes do texto, recolhidos: o que entra e o tom. */}
      <details className="pl-recolhe">
        <summary>
          <TileTabler nome="settings" />
          <span className="min-w-0 flex-1">
            <span className="pl-recolhe__titulo">Ajustar o texto</span>
            <span className="pl-recolhe__sub">
              O que entra ({SECOES.filter((s) => envio.conteudoCompleto[s.id].length > 0 && !excluidos.includes(`secao:${s.id}`)).length} seções
              {excluidos.length ? `, ${excluidos.length} desmarcado(s)` : ""}) · tom {tom === "padrao" ? "padrão" : ROTULO_TOM[tom].nome.toLowerCase()}
            </span>
          </span>
          <span className="nx-sq" aria-hidden>
            <IconeTabler nome="chevron-down" tamanho={20} />
          </span>
        </summary>
        <div className="pl-recolhe__corpo">
          {envio.blocos.length > 0 && <OQueEntra envio={envio} excluidos={excluidos} setExcluidos={setExcluidos} />}

          <section aria-labelledby="rel-tom" className="grid gap-2">
            <h3 id="rel-tom" className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>Tom e blocos do texto</h3>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>Mesmo conteúdo conferido, dito de outro jeito. Trocar refaz o texto (a edição manual é perdida).</p>
            <div role="radiogroup" aria-label="Tom do texto" className="grid gap-2 sm:grid-cols-4">
              {([["padrao", { nome: "Padrão", descricao: "O texto de sempre, sem ajuste de tom." }], ...(Object.entries(ROTULO_TOM) as [Tom, { nome: string; descricao: string }][])] as [Tom | "padrao", { nome: string; descricao: string }][]).map(([id, r]) => (
                <button key={id} type="button" role="radio" aria-checked={tom === id} onClick={() => setTom(id)} className="rounded-xl border p-3 text-left" style={{ borderColor: tom === id ? "var(--b1)" : "var(--line-2)", background: tom === id ? "var(--b6)" : "var(--white)" }}>
                  <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{r.nome}</span>
                  <span className="block text-xs font-medium" style={{ color: "var(--text-2)" }}>{r.descricao}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="inline-flex min-h-[32px] items-center gap-2">
                <input type="checkbox" checked={explicar} onChange={(e) => setExplicar(e.target.checked)} />
                Explicar termos técnicos (CTR, CPM, lead…) na primeira vez que aparecem
              </label>
              <label className="inline-flex min-h-[32px] items-center gap-2">
                <input type="checkbox" checked={comPendencias} onChange={(e) => setComPendencias(e.target.checked)} disabled={pendencias.length === 0} />
                Pendências do cliente {pendencias.length ? `(${pendencias.length})` : "(nenhuma encontrada)"}
              </label>
              <label className="inline-flex min-h-[32px] items-center gap-2">
                <input type="checkbox" checked={comSemana} onChange={(e) => setComSemana(e.target.checked)} disabled={proximaSemana.length === 0} />
                Plano da próxima semana {proximaSemana.length ? `(${proximaSemana.length} pauta${proximaSemana.length === 1 ? "" : "s"} do planejador)` : "(nenhuma pauta com dia no planejador de Ideias)"}
              </label>
            </div>
            {comPendencias && pendencias.length > 0 && (
              <details className="pl-detalhe">
                <summary>
                  <IconeTabler nome="chevron-down" tamanho={16} />
                  Ver as pendências que entram
                </summary>
                <ul className="pl-detalhe__corpo list-disc pl-8">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
              </details>
            )}
          </section>
        </div>
      </details>

      {envio.insights.length > 0 && (
        <section aria-labelledby="rel-recs" className="grid gap-3">
          <NxSectionHeader id="rel-recs" titulo="Recomendações que passaram na checagem" subtitulo="Cada uma tem evidência e amostra mínima no período." />
          <div className="grid gap-3 md:grid-cols-2">
            {envio.insights.map((i) => (
              <InsightCard key={i.id} insight={i} clientId={clientId} compacto />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


function EditorVersao({
  id,
  rotulo,
  texto,
  setTexto,
  gerado,
  limite,
  linhas,
  previa,
  children,
}: {
  previa?: "whatsapp" | "doc";
  id: string;
  rotulo: string;
  texto: string;
  setTexto: (s: string) => void;
  gerado: string;
  limite?: number;
  linhas: number;
  children: React.ReactNode;
}) {
  // A checagem de linguagem roda também no texto editado à mão.
  const cfm = useMemo(() => checarLinguagemCFM(texto), [texto]);
  const passou = limite != null && texto.length > limite;
  return (
    <div className="mt-3">
      <label htmlFor={id} className="sub" style={{ display: "block", marginBottom: 6 }}>
        {rotulo}
      </label>
      <div className={previa ? "grid gap-3 lg:grid-cols-2" : ""}>
        <textarea
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={linhas}
          className="block w-full"
          style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--surface-2)", color: "var(--ink)", font: "inherit", fontSize: 14, lineHeight: 1.5, resize: "vertical" }}
        />
        {previa && <Previa texto={texto} tipo={previa} />}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs" style={{ color: passou ? "var(--crit)" : "var(--text-faint)" }}>
        <span>
          {texto.length} caracteres{limite != null ? ` de até ${limite} recomendados` : ""}
          {passou ? ": longo para WhatsApp, encurte" : ""}
        </span>
        {texto !== gerado && <span style={{ color: "var(--text-faint)" }}>Editado à mão</span>}
      </div>
      {!cfm.ok && (
        <div className="mt-2 rounded-lg border p-3 text-sm" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)" }} role="alert">
          <p className="font-semibold">A edição tem trecho que fere a regra do CFM. Nada foi mudado no seu texto: use a sugestão ou mantenha como está.</p>
          <ul className="mt-2 space-y-2">
            {cfm.achados.slice(0, 6).map((a, i) => (
              <li key={i} className="rounded-md p-2" style={{ background: "var(--surface)" }}>
                <span className="block">
                  <Marcado frase={a.frase} trechos={[a.trecho]} />
                </span>
                <span className="mt-1 block text-xs" style={{ color: "var(--text-dim)" }}>
                  {ROTULO_REGRA_CFM[a.regra]}: {a.motivo}. Sugestão segura: “{a.sugestao}”
                </span>
                {a.sugestao && a.sugestao !== a.frase && texto.includes(a.frase) && (
                  <button type="button" className="btn ghost mt-1 inline-flex min-h-[36px] items-center px-3 text-xs" onClick={() => setTexto(texto.replace(a.frase, a.sugestao))}>
                    Aplicar sugestão
                  </button>
                )}
              </li>
            ))}
          </ul>
          {cfm.achados.length > 6 && <p className="mt-1 text-xs">e mais {cfm.achados.length - 6} trecho(s).</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {children}
        <button type="button" className="btn ghost inline-flex min-h-[44px] items-center gap-1.5 px-4 text-sm" onClick={() => setTexto(gerado)} disabled={texto === gerado}>
          <RotateCcw size={15} aria-hidden /> Voltar ao texto gerado
        </button>
      </div>
    </div>
  );
}

// Prévia de como o texto chega: balão de WhatsApp (com *negrito*) ou folha de documento.
function Negrito({ linha }: { linha: string }) {
  return (
    <>
      {linha.split(/(\*[^*\n]+\*)/g).map((p, i) => (/^\*[^*]+\*$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b> : <span key={i}>{p}</span>))}
    </>
  );
}
function Previa({ texto, tipo }: { texto: string; tipo: "whatsapp" | "doc" }) {
  const linhas = texto.split("\n");
  if (tipo === "whatsapp") {
    return (
      <div aria-label="Prévia no WhatsApp" className="rounded-xl p-3" style={{ background: "color-mix(in srgb, #25d366 10%, var(--surface-2))" }}>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Prévia no WhatsApp</div>
        <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-tr-sm p-3 text-[13.5px] leading-relaxed shadow-sm" style={{ background: "color-mix(in srgb, #25d366 22%, var(--surface))", color: "var(--ink)" }}>
          {linhas.map((l, i) => (
            <div key={i} style={{ minHeight: l ? undefined : "0.75em" }}><Negrito linha={l} /></div>
          ))}
          <div className="mt-1 text-right text-[10px]" style={{ color: "var(--muted)" }}>agora ✓✓</div>
        </div>
      </div>
    );
  }
  return (
    <div aria-label="Prévia do documento" className="rounded-xl border p-5 text-[13.5px] leading-relaxed shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Prévia para a reunião</div>
      {linhas.map((l, i) =>
        i === 0 ? <h3 key={i} className="text-base font-semibold">{l}</h3>
        : /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^•:]*$/.test(l) && l.length < 60 && !/^Período/.test(l) ? <h4 key={i} className="mt-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>{l}</h4>
        : <p key={i} style={{ minHeight: l ? undefined : "0.5em", color: /^Período/.test(l) ? "var(--muted)" : undefined }}>{l}</p>,
      )}
    </div>
  );
}

// Frase com as palavras sinalizadas pelo CFM marcadas.
function Marcado({ frase, trechos }: { frase: string; trechos: string[] }) {
  const alvo = trechos.filter(Boolean);
  if (alvo.length === 0) return <>{frase}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${alvo.map(esc).join("|")})`, "g");
  return (
    <>
      {frase.split(re).map((p, i) =>
        alvo.includes(p) ? (
          <mark key={i} style={{ background: "var(--warn-bg)", color: "var(--ink)", outline: "1px solid var(--warn)", borderRadius: 3, padding: "0 2px" }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}


/* ---------------- Números do período ---------------- */

const ICONE_METRICA: Record<string, NomeIcone> = {
  alcance: "users",
  interacao: "message-circle",
  seguidores: "users",
  frequencia: "calendar",
  verba: "speakerphone",
  "custo-conversa": "speakerphone",
  leads: "target",
  resposta: "inbox",
};

/** "▲ 12% vs. período anterior" (texto pronto de resultado.ts) vira o chip de variação; outro texto fica como nota. */
function variacaoDe(comparacao?: string): { sobe: boolean; percentual: string; contexto: string } | null {
  const m = comparacao?.match(/^([▲▼])\s*(\S+)\s+(.*)$/);
  return m ? { sobe: m[1] === "▲", percentual: m[2], contexto: m[3] } : null;
}

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Os mesmos números da tela Resultados (useResultado, React Query reaproveita a leitura), com a variação contra o
// período anterior quando ela é comparável. O gráfico é o alcance e as interações de cada dia já lidos pelo relatório.
function NumerosDoPeriodo({ clientId, start, end, temIg, diario, posts }: { clientId: string; start: string; end: string; temIg: boolean; diario: any[]; posts: any[] }) {
  const { r, carregando, fontesComFalha } = useResultado(clientId, start, end);
  const metricas = (r?.metricas ?? []).filter((m) => m.id !== "conectar-fontes");
  const dias = useMemo(() => diario.filter((d) => d.date >= start && d.date <= end && d.reach != null).sort((a, b) => (a.date < b.date ? -1 : 1)), [diario, start, end]);
  const series: NxSerie[] = useMemo(
    () => [
      { rotulo: "Alcance", valores: dias.map((d) => Number(d.reach ?? 0)), cor: "var(--b1)", area: true },
      { rotulo: "Interações", valores: dias.map((d) => Number(d.total_interactions ?? 0)), cor: "var(--b4)", eixo: "dir" },
    ],
    [dias],
  );
  const [dia, setDia] = useState<string | null>(null);
  const linhaDia = dia ? dias.find((d) => d.date === dia) : null;
  const postsDoDia = dia ? posts.filter((p) => String(p.posted_at ?? "").slice(0, 10) === dia) : [];

  return (
    <>
      <NxCard
        id="rel-numeros"
        nivel={2}
        icone={<IconeTabler nome="chart-bar" tamanho={17} traco={1.7} />}
        titulo="Números do período"
        subtitulo="Comparados com o período anterior do mesmo tamanho, quando há dado nos dois."
      >
        {carregando && !r ? (
          <div className="nx-grade nx-grade--4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-[14px]" style={{ background: "var(--field)" }} />
            ))}
          </div>
        ) : metricas.length === 0 ? (
          <PlanoVazio titulo="Sem número para mostrar">
            {fontesComFalha ? "Uma fonte de resultados não respondeu. Os números não foram trocados por zero." : "As fontes ligadas não têm dado neste período."}
          </PlanoVazio>
        ) : (
          <div className="nx-grade nx-grade--4">
            {metricas.map((m, i) => {
              const v = variacaoDe(m.comparacao);
              return (
                <NxKpi
                  key={`${m.id}-${i}`}
                  i={i}
                  icone={<IconeTabler nome={ICONE_METRICA[m.id] ?? "chart-bar"} tamanho={17} traco={1.7} />}
                  rotulo={m.rotulo}
                  valor={m.valor}
                  variacao={v}
                  nota={m.statusTexto ?? (v ? undefined : m.comparacao) ?? m.fonte}
                  info={<InfoDica rotulo={`Sobre ${m.rotulo}`} texto={[m.explicacao, m.fonte ? `Fonte: ${m.fonte}.` : ""].filter(Boolean).join(" ")} />}
                />
              );
            })}
          </div>
        )}
        {fontesComFalha && metricas.length > 0 && (
          <PlanoAviso titulo="Uma fonte de resultados não respondeu">Os números dela não aparecem acima; nada foi trocado por zero.</PlanoAviso>
        )}
      </NxCard>

      {temIg && dias.length >= 2 && (
        <NxCard
          nivel={2}
          icone={<IconeTabler nome="brand-instagram" tamanho={17} traco={1.7} />}
          titulo="Alcance e interações por dia"
          subtitulo="Toque num dia (ou use as setas e Enter) para ver os números e o que foi publicado."
        >
          <NxLinhaTempo
            datas={dias.map((d) => d.date)}
            series={series}
            selecionado={dia}
            onSelecionar={(d) => setDia(d === dia ? null : d)}
            formatarData={diaCurto}
            formatarValor={fmtNum}
            rotulo="Alcance e interações por dia"
            altura={200}
          />
          {linhaDia && (
            <div className="nx-abre" aria-live="polite">
              <p className="pl-dia">
                <b>{diaCurto(linhaDia.date)}</b>: alcance <b>{fmtNum(Number(linhaDia.reach ?? 0))}</b> · interações <b>{fmtNum(Number(linhaDia.total_interactions ?? 0))}</b> ·{" "}
                {postsDoDia.length ? `${postsDoDia.length} ${postsDoDia.length === 1 ? "publicação" : "publicações"}` : "nenhuma publicação neste dia"}
              </p>
              {postsDoDia.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm" style={{ color: "var(--text-2)" }}>
                  {postsDoDia.slice(0, 5).map((p) => (
                    <li key={p.id}>{String(p.caption ?? "Sem legenda").split("\n")[0].slice(0, 90)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </NxCard>
      )}
    </>
  );
}

/* ---------------- Leitura do período ---------------- */

const MARCA_SECAO: Record<SecaoId, { tom: NxTom; texto: string; seta?: "cima" | "baixo" }> = {
  resumo: { tom: "b", texto: "Resumo" },
  vitorias: { tom: "up", texto: "Vitória", seta: "cima" },
  atencao: { tom: "dn", texto: "Atenção", seta: "baixo" },
  acoes: { tom: "b", texto: "Ação" },
  testes: { tom: "g", texto: "Teste" },
  limitacoes: { tom: "or", texto: "Limitação" },
};

function ItemLeitura({ item, secao }: { item: ItemEnvio; secao: SecaoId }) {
  const m = MARCA_SECAO[secao];
  const temMais = !!item.texto && item.texto !== item.curto;
  const titulo = item.curto.charAt(0).toUpperCase() + item.curto.slice(1);
  const marca = (
    <span className="pl-item__marca">
      <NxTag tom={m.tom} seta={m.seta}>{m.texto}</NxTag>
    </span>
  );
  if (!temMais && !item.evidencia)
    return (
      <li className="pl-item">
        {marca}
        <p className="pl-item__titulo">{titulo}</p>
      </li>
    );
  // A linha inteira abre a frase completa e a evidência (Enter ou clique).
  return (
    <li>
      <details className="pl-item pl-item--abre">
        <summary>
          {marca}
          <span className="pl-item__titulo">{titulo}</span>
          <IconeTabler nome="chevron-down" tamanho={16} className="pl-item__seta" />
        </summary>
        <div className="pl-item__mais">
          {temMais && <p>{item.texto}</p>}
          {item.evidencia && <p style={{ color: "var(--muted-ink)" }}>{item.evidencia}</p>}
        </div>
      </details>
    </li>
  );
}

function Grupo({ envio, ids }: { envio: RelatorioEnvio; ids: SecaoId[] }) {
  const comItem = ids.filter((id) => envio.conteudoCompleto[id].length > 0);
  if (comItem.length === 0) return <PlanoVazio titulo="Nada com evidência suficiente">Sem dado bastante neste período para afirmar algo aqui.</PlanoVazio>;
  return (
    <div>
      {comItem.map((id) => (
        <div key={id}>
          <h4 className="pl-grupo">{SECOES.find((s) => s.id === id)!.titulo}</h4>
          <ul className="pl-itens">
            {envio.conteudoCompleto[id].map((it) => (
              <ItemLeitura key={it.id} item={it} secao={id} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// O mesmo conteúdo conferido que vai nas 3 versões (antes das escolhas de "O que entra"), lido em dois blocos.
function LeituraDoPeriodo({ envio }: { envio: RelatorioEnvio }) {
  const lim = envio.conteudoCompleto.limitacoes;
  return (
    <section aria-label="Leitura do período" className="grid gap-3">
      <div className="pl-leitura">
        <NxCard nivel={2} icone={<IconeTabler nome="file-text" tamanho={17} traco={1.7} />} titulo="O que aconteceu" subtitulo="Resumo, o que deu certo e o que pede atenção.">
          <Grupo envio={envio} ids={["resumo", "vitorias", "atencao"]} />
        </NxCard>
        <NxCard nivel={2} icone={<IconeTabler nome="checklist" tamanho={17} traco={1.7} />} titulo="O que fazer" subtitulo="Ações recomendadas e os próximos testes.">
          <Grupo envio={envio} ids={["acoes", "testes"]} />
        </NxCard>
      </div>
      {lim.length > 0 && (
        <PlanoAviso
          titulo={`Dados incompletos: ${lim.length} ${lim.length === 1 ? "ponto" : "pontos"} para ler com cuidado`}
          detalhe={
            <ul>
              {lim.map((l) => (
                <li key={l.id}>{l.texto}</li>
              ))}
            </ul>
          }
        >
          {lim.map((l) => l.curto).join(" · ")}
        </PlanoAviso>
      )}
    </section>
  );
}

// Baseline (hub-relatorio.ts `omitidos`): o que ficou fora por falta de dado. Curto, com a lista recolhida.
function NaoIncluido({ omitidos }: { omitidos: string[] }) {
  return (
    <section aria-labelledby="rel-omitidos">
      <PlanoAviso
        titulo={<span id="rel-omitidos">Não incluído por falta de dado ({omitidos.length})</span>}
        detalhe={
          <ul>
            {omitidos.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        }
      >
        Ficaram fora das 3 versões porque não há dado suficiente no período. Não é erro do texto.
      </PlanoAviso>
    </section>
  );
}

// Baseline: caixas "O que entra no texto" (relatorio.tsx L142–159). Agora por seção e, ao abrir,
// bloco a bloco. Vale para WhatsApp, executiva e PDF.
function OQueEntra({ envio, excluidos, setExcluidos }: { envio: RelatorioEnvio; excluidos: string[]; setExcluidos: (f: (cur: string[]) => string[]) => void }) {
  const [detalhe, setDetalhe] = useState(false);
  const alternar = (chave: string, incluir: boolean) => setExcluidos((cur) => (incluir ? cur.filter((x) => x !== chave) : cur.includes(chave) ? cur : [...cur, chave]));
  const secoes = SECOES.filter((s) => envio.conteudoCompleto[s.id].length > 0);
  return (
    <section aria-labelledby="rel-entra" className="grid gap-2">
      <h3 id="rel-entra" className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>O que entra no texto</h3>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>Desmarque o que não faz sentido enviar a este cliente. Vale para as 3 versões (WhatsApp, reunião e PDF). Trocar a seleção refaz o texto (a edição manual é perdida).</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {secoes.map((s) => (
          <label key={s.id} className="inline-flex min-h-[36px] items-center gap-2 text-sm">
            <input type="checkbox" checked={!excluidos.includes(`secao:${s.id}`)} onChange={(ev) => alternar(`secao:${s.id}`, ev.target.checked)} />
            {s.titulo} <span style={{ color: "var(--muted-ink)" }}>({envio.conteudoCompleto[s.id].length})</span>
          </label>
        ))}
      </div>
      <div>
        <button type="button" className="pl-botao pl-botao--leve" onClick={() => setDetalhe(!detalhe)} aria-expanded={detalhe}>
          <ChevronDown size={14} aria-hidden style={{ transform: detalhe ? "rotate(180deg)" : undefined }} />
          {detalhe ? "Esconder os blocos" : "Escolher bloco a bloco"}
        </button>
      </div>
      {detalhe && (
        <div className="space-y-3">
          {secoes.map((s) => {
            const secaoFora = excluidos.includes(`secao:${s.id}`);
            return (
              <fieldset key={s.id} disabled={secaoFora} style={{ opacity: secaoFora ? 0.55 : 1 }}>
                <legend className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                  {s.titulo}
                  {secaoFora ? " (seção desmarcada)" : ""}
                </legend>
                <div className="mt-1 flex flex-col gap-1">
                  {envio.blocos
                    .filter((b) => b.secao === s.id)
                    .map((b) => (
                      <label key={b.chave} className="inline-flex min-h-[32px] items-center gap-2 text-sm">
                        <input type="checkbox" checked={!excluidos.includes(b.chave)} onChange={(ev) => alternar(b.chave, ev.target.checked)} />
                        {b.rotulo}
                      </label>
                    ))}
                </div>
              </fieldset>
            );
          })}
          {excluidos.length > 0 && (
            <button type="button" className="pl-botao pl-botao--leve" onClick={() => setExcluidos(() => [])}>
              <RotateCcw size={14} aria-hidden /> Incluir tudo de novo
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// Checagem antes de enviar: chips com o resultado de cada item; a lista abre sozinha quando algo pede atenção.
function Checagem({ envio, alternarManter }: { envio: RelatorioEnvio; alternarManter: (original: string) => void }) {
  const ok = envio.checagem.filter((c) => c.status === "ok").length;
  const atencao = ok < envio.checagem.length;
  return (
    <section aria-labelledby="rel-checagem" className="grid gap-2">
      <h3 id="rel-checagem" className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        <ShieldCheck size={17} aria-hidden /> Checagem antes de enviar: {ok} de {envio.checagem.length} sem ressalva
      </h3>
      <ul className="pl-checagem">
        {envio.checagem.map((c) => (
          <li key={c.id}>
            <NxTag tom={c.status === "ok" ? "up" : "or"} icone={c.status === "ok" ? <CheckCircle2 size={13} aria-hidden className="nx-tag__ic" /> : <AlertTriangle size={13} aria-hidden className="nx-tag__ic" />}>
              {c.titulo}: {c.status === "ok" ? "passou" : "atenção"}
            </NxTag>
          </li>
        ))}
      </ul>
      <details className="pl-detalhe" open={atencao}>
        <summary>
          <IconeTabler nome="chevron-down" tamanho={16} />
          {atencao ? "O que pede atenção" : "Ver o detalhe da checagem"}
        </summary>
        <div className="grid gap-2">
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            O que está em atenção já foi tratado no texto (reescrito com sugestão segura ou escrito como limitação; nada é apagado). Confira antes de mandar.
          </p>
          <ul className="space-y-2">
            {envio.checagem.map((c) => (
              <ItemChecagem key={c.id} c={c}>
                {c.id === "linguagem" && envio.alteracoes.length > 0 ? <AlteracoesCFM alteracoes={envio.alteracoes} alternarManter={alternarManter} /> : null}
              </ItemChecagem>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

// Cada frase sinalizada: original com as palavras marcadas, a reescrita segura e um clique para
// manter o original (ou voltar à sugestão). A escolha refaz as 3 versões.
function AlteracoesCFM({ alteracoes, alternarManter }: { alteracoes: AlteracaoLinguagem[]; alternarManter: (original: string) => void }) {
  return (
    <ul className="space-y-2 px-3 pb-3 pl-9 text-xs leading-relaxed" style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>
      {alteracoes.map((a) => (
        <li key={a.original} className="rounded-md p-2" style={{ background: "var(--surface)" }}>
          <span className="block font-semibold" style={{ color: "var(--text)" }}>
            {a.secao}: {a.mantido ? "mantido como no original" : "reescrita segura aplicada"}
          </span>
          <span className="block">
            Original: “<Marcado frase={a.original} trechos={a.trechos} />”
          </span>
          <span className="block">Sugestão: “{a.corrigido}”</span>
          <span className="block">Motivo: {a.motivos.join("; ")}.</span>
          <button type="button" className="btn ghost mt-1 inline-flex min-h-[36px] items-center px-3 text-xs" onClick={() => alternarManter(a.original)}>
            {a.mantido ? "Usar a sugestão segura" : "Manter original"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemChecagem({ c, children }: { c: ChecagemItem; children?: React.ReactNode }) {
  const [aberto, setAberto] = useState(c.id === "linguagem" && c.status === "atencao");
  const Icone = c.status === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <li className="rounded-lg border" style={{ borderColor: c.status === "ok" ? "var(--good-border)" : "var(--warn-border)", background: c.status === "ok" ? "var(--good-bg)" : "var(--warn-bg)" }}>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex min-h-[44px] w-full items-start gap-2 p-3 text-left">
        <Icone size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: c.status === "ok" ? "var(--good-text)" : "var(--warn)" }} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>
            {c.titulo}: {c.status === "ok" ? "passou" : "atenção"}
          </span>
          <span className="block text-sm" style={{ color: "var(--text-dim)" }}>
            {c.resumo}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden className="mt-1 shrink-0" style={{ transform: aberto ? "rotate(180deg)" : undefined }} />
      </button>
      {aberto && children}
      {aberto && !children && c.detalhes.length > 0 && (
        <ul className="space-y-1 px-3 pb-3 pl-9 text-xs leading-relaxed" style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>
          {c.detalhes.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
