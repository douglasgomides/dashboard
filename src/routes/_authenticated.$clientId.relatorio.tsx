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
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsResumo,
  getWtsVolumeDiario,
} from "@/lib/client-data";
import { getResumoPeriodo } from "@/lib/audiencia";
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
      const [{ linhas, cadastro }, whatsapp] = await Promise.all([getAdsCampanhasPeriodo(clientId, start, end), getAtendimentosWhatsapp(clientId, start, end)]);
      return { diag: aplicarRastreio(diagnosticarAds(linhas, cadastro, start, end), whatsapp), diasComDado: Array.from(new Set(linhas.filter((l) => Number(l.spend) > 0 || Number(l.impressions) > 0).map((l) => String(l.date).slice(0, 10)))) };
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
      const [resumo, dias] = await Promise.all([getCrmResumoPeriodo(clientId, start, end), getCrmLeadsPorDiaPeriodo(clientId, start, end)]);
      return { resumo, diasComDado: dias.filter((d) => Number(d.total) > 0).map((d) => String(d.dia).slice(0, 10)) };
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
      alcanceUnico: periodoIg.data?.dados?.alcance_unico ?? null,
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
    <div className="hpagehead">
      <h2>Relatório</h2>
      <p>Texto pronto para enviar ao cliente, em 3 versões do mesmo conteúdo conferido. Período: {periodLabel}.</p>
    </div>
  );

  if (loading) return <div>{head}<Carregando texto="Conferindo os dados e montando o relatório…" /></div>;
  if (erro || !envio) return <div>{head}<ErroCarga texto="Falha ao ler os dados do período. Tente novamente em instantes." /></div>;
  if (!temIg && !temAds && !temWts && !temCrm) {
    return (
      <div>
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
      setErroPdf(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  const semDado = SECOES.every((s) => envio.conteudoCompleto[s.id].length === 0 || s.id === "limitacoes");
  const tudoDesmarcado = !semDado && SECOES.every((s) => envio.conteudo[s.id].length === 0);
  const btn = "btn inline-flex min-h-[44px] items-center justify-center gap-1.5 px-4 text-sm";
  const alternarManter = (original: string) => setManterCfm((cur) => (cur.includes(original) ? cur.filter((x) => x !== original) : [...cur, original]));

  return (
    <div className="space-y-4">
      {head}

      {envio.omitidos.length > 0 && <NaoIncluido omitidos={envio.omitidos} />}

      {envio.blocos.length > 0 && <OQueEntra envio={envio} excluidos={excluidos} setExcluidos={setExcluidos} />}

      <Checagem envio={envio} alternarManter={alternarManter} />

      <section className="card" aria-labelledby="rel-tom">
        <h2 id="rel-tom">Tom e blocos do texto</h2>
        <p className="sub">Mesmo conteúdo conferido, dito de outro jeito. Trocar refaz o texto (a edição manual é perdida).</p>
        <div role="radiogroup" aria-label="Tom do texto" className="mt-2 grid gap-2 sm:grid-cols-4">
          {([["padrao", { nome: "Padrão", descricao: "O texto de sempre, sem ajuste de tom." }], ...(Object.entries(ROTULO_TOM) as [Tom, { nome: string; descricao: string }][])] as [Tom | "padrao", { nome: string; descricao: string }][]).map(([id, r]) => (
            <button key={id} type="button" role="radio" aria-checked={tom === id} onClick={() => setTom(id)} className="rounded-lg border p-2.5 text-left" style={{ borderColor: tom === id ? "var(--accent)" : "var(--border)", background: tom === id ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)" }}>
              <span className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>{r.nome}</span>
              <span className="block text-xs" style={{ color: "var(--text-dim)" }}>{r.descricao}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-1.5 text-sm">
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
          <details className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            <summary className="cursor-pointer font-medium">Ver as pendências que entram</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>
        )}
      </section>

      {semDado ? (
        <SemFonte titulo="Sem dado para montar o texto" texto="Nenhuma seção tem dado neste período, então o relatório ficaria vazio. Troque o período no cabeçalho." />
      ) : tudoDesmarcado ? (
        <SemFonte titulo="Nada marcado para enviar" texto="Todas as seções foram desmarcadas em “O que entra no texto”. Marque ao menos uma para montar as versões." />
      ) : (
        <section className="card" aria-labelledby="rel-versoes">
          <h2 id="rel-versoes">Versões para enviar</h2>
          <p className="sub">Mesmo conteúdo nas três: resumo, vitórias, pontos de atenção, ações, próximos testes e dados incompletos.</p>
          <div role="tablist" aria-label="Versão do relatório" className="mt-3 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
            {(
              [
                ["whatsapp", "WhatsApp"],
                ["executiva", "Reunião"],
                ["pdf", "PDF"],
              ] as [Versao, string][]
            ).map(([id, rot]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={versao === id}
                onClick={() => setVersao(id)}
                className="min-h-[44px] rounded-md text-sm font-semibold"
                style={versao === id ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "var(--text-dim)" }}
              >
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
              <button type="button" className={`${btn} pri`} onClick={() => copiar(textoWhats, "whatsapp")} disabled={!textoWhats.trim()}>
                <Copy size={15} aria-hidden /> {copiado === "whatsapp" ? "Copiado" : "Copiar para WhatsApp"}
              </button>
            </EditorVersao>
          )}

          {versao === "executiva" && (
            <EditorVersao id="rel-exec" rotulo="Versão executiva para reunião: pontos principais e 3 decisões" texto={textoExec} setTexto={setTextoExec} gerado={gerados?.executiva ?? envio.executiva} linhas={18} previa="doc">
              <button type="button" className={`${btn} pri`} onClick={() => copiar(textoExec, "executiva")} disabled={!textoExec.trim()}>
                <Copy size={15} aria-hidden /> {copiado === "executiva" ? "Copiado" : "Copiar versão executiva"}
              </button>
            </EditorVersao>
          )}

          {versao === "pdf" && (
            <div className="mt-3">
              <p className="sub">
                A primeira página traz o achado do período, os números principais e as 6 seções com a evidência de cada ponto; depois vem o detalhamento de Instagram, anúncios, WhatsApp e CRM. A mensagem de WhatsApp, como estiver editada, vai no fim. O que foi desmarcado em “O que entra no texto” fica fora do PDF e é registrado na página de metodologia.
              </p>
              <ol className="mt-2 space-y-1 text-sm" style={{ color: "var(--text)" }}>
                {SECOES.map((s) => {
                  const n = envio.conteudo[s.id].length;
                  const fora = envio.conteudoCompleto[s.id].length - n;
                  return (
                    <li key={s.id}>
                      <b>{s.titulo}</b>{" "}
                      <span style={{ color: "var(--text-dim)" }}>
                        ({n} {n === 1 ? "item" : "itens"}
                        {fora > 0 ? `; ${fora} desmarcado${fora === 1 ? "" : "s"}` : ""})
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`${btn} pri`} onClick={baixarPdf} disabled={gerandoPdf}>
                  <FileDown size={15} aria-hidden /> {gerandoPdf ? "Gerando o PDF…" : "Baixar PDF detalhado"}
                </button>
              </div>
              {erroPdf && (
                <p className="mt-2 text-sm" style={{ color: "var(--crit)" }}>
                  {erroPdf}
                </p>
              )}
            </div>
          )}
          <p className="note">O envio direto pelo WhatsApp é fase 2. Hoje: copie e cole na conversa do cliente.</p>
        </section>
      )}

      {envio.insights.length > 0 && (
        <section aria-labelledby="rel-recs">
          <h2 id="rel-recs" className="mb-2 text-sm font-semibold">
            Recomendações que passaram na checagem
          </h2>
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

// Baseline (hub-relatorio.ts `omitidos`): o que ficou fora por falta de dado, agora com os casos novos.
function NaoIncluido({ omitidos }: { omitidos: string[] }) {
  const [todos, setTodos] = useState(false);
  const LIMITE = 6;
  const lista = todos ? omitidos : omitidos.slice(0, LIMITE);
  return (
    <section className="card" aria-labelledby="rel-omitidos" style={{ borderColor: "var(--warn)" }}>
      <h2 id="rel-omitidos">Não incluído por falta de dado</h2>
      <p className="sub">Estes pontos ficaram fora das 3 versões porque não há dado suficiente no período. Não é erro do texto.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--text)" }}>
        {lista.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      {omitidos.length > LIMITE && (
        <button type="button" className="btn ghost mt-2 inline-flex min-h-[40px] items-center gap-1 px-3 text-sm" onClick={() => setTodos(!todos)} aria-expanded={todos}>
          <ChevronDown size={14} aria-hidden style={{ transform: todos ? "rotate(180deg)" : undefined }} />
          {todos ? "Mostrar menos" : `Ver todos (${omitidos.length})`}
        </button>
      )}
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
    <section className="card" aria-labelledby="rel-entra">
      <h2 id="rel-entra">O que entra no texto</h2>
      <p className="sub">Desmarque o que não faz sentido enviar a este cliente. Vale para as 3 versões (WhatsApp, reunião e PDF). Trocar a seleção refaz o texto (a edição manual é perdida).</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {secoes.map((s) => (
          <label key={s.id} className="inline-flex min-h-[36px] items-center gap-2 text-sm">
            <input type="checkbox" checked={!excluidos.includes(`secao:${s.id}`)} onChange={(ev) => alternar(`secao:${s.id}`, ev.target.checked)} />
            {s.titulo} <span style={{ color: "var(--text-faint)" }}>({envio.conteudoCompleto[s.id].length})</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn ghost mt-2 inline-flex min-h-[40px] items-center gap-1 px-3 text-sm" onClick={() => setDetalhe(!detalhe)} aria-expanded={detalhe}>
        <ChevronDown size={14} aria-hidden style={{ transform: detalhe ? "rotate(180deg)" : undefined }} />
        {detalhe ? "Esconder os blocos" : "Escolher bloco a bloco"}
      </button>
      {detalhe && (
        <div className="mt-2 space-y-3">
          {secoes.map((s) => {
            const secaoFora = excluidos.includes(`secao:${s.id}`);
            return (
              <fieldset key={s.id} disabled={secaoFora} style={{ opacity: secaoFora ? 0.55 : 1 }}>
                <legend className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>
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
            <button type="button" className="btn ghost inline-flex min-h-[40px] items-center gap-1.5 px-3 text-sm" onClick={() => setExcluidos(() => [])}>
              <RotateCcw size={14} aria-hidden /> Incluir tudo de novo
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Checagem({ envio, alternarManter }: { envio: RelatorioEnvio; alternarManter: (original: string) => void }) {
  const ok = envio.checagem.filter((c) => c.status === "ok").length;
  return (
    <section className="card" aria-labelledby="rel-checagem">
      <h2 id="rel-checagem" className="flex items-center gap-2">
        <ShieldCheck size={18} aria-hidden /> Checagem antes de enviar
      </h2>
      <p className="sub">
        {ok} de {envio.checagem.length} itens sem ressalva. O que está em atenção já foi tratado no texto (reescrito com sugestão segura ou escrito como limitação; nada é apagado); confira antes de mandar.
      </p>
      <ul className="mt-3 space-y-2">
        {envio.checagem.map((c) => (
          <ItemChecagem key={c.id} c={c}>
            {c.id === "linguagem" && envio.alteracoes.length > 0 ? <AlteracoesCFM alteracoes={envio.alteracoes} alternarManter={alternarManter} /> : null}
          </ItemChecagem>
        ))}
      </ul>
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
