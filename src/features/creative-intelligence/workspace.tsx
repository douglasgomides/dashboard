import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  Fingerprint,
  Layers,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import { useClientRole } from "@/hooks/use-client-role";
import { getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange } from "@/lib/date-range";
import {
  rankForObjective,
  type PerformancePost,
} from "@/lib/creative-intelligence/performance";
import {
  COVERAGE_LABEL,
  EVIDENCE_LABEL,
  type Objective,
  type CreativeStructure,
  type CreativeJob,
} from "@/lib/creative-intelligence/contracts";
import {
  listAccounts,
  readWorkspace,
  readJobProgress,
  readWorkerHealth,
  readAssets,
  enqueue,
  cancelJob,
  toPlanner,
  linkPublication,
} from "./data";
import { AnalysisView } from "./analysis-view";
import { AdaptationView } from "./adaptation-view";
import { ReferenceScript } from "./reference-script";
import { ProductionWorkspace } from "./production-workspace";
import "./workspace.css";

const parentRoute = getRouteApi("/_authenticated/$clientId");
const TABS = [
  { id: "acervo", label: "Conteúdos em destaque", icon: Trophy },
  { id: "analises", label: "Análises e DNA", icon: Fingerprint },
  { id: "biblioteca", label: "Biblioteca e adaptações", icon: BookOpen },
  { id: "producao", label: "Estúdio de produção", icon: Layers },
  { id: "radar", label: "Radar de mercado", icon: Search },
  { id: "aprendizado", label: "Aprendizado", icon: ChartNoAxesCombined },
] as const;
const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "salvamento", label: "Salvamentos por alcance" },
  { id: "alcance", label: "Alcance" },
  { id: "compartilhamento", label: "Compartilhamentos por alcance" },
  { id: "seguidores", label: "Seguidores por alcance" },
  { id: "conversa", label: "Conversões comerciais atribuídas" },
];
const number = (n: unknown) =>
  typeof n === "number" ? n.toLocaleString("pt-BR") : "—";
export function CreativeWorkspace({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("acervo"),
    [account, setAccount] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [objective, setObjective] = useState<Objective>("salvamento"),
    [format, setFormat] = useState(""),
    [structureId, setStructureId] = useState(""),
    [adaptationId, setAdaptationId] = useState(""),
    [theme, setTheme] = useState(""),
    [partial, setPartial] = useState(false),
    [query, setQuery] = useState(""),
    [platform, setPlatform] = useState("instagram"),
    [country, setCountry] = useState("BR"),
    [language, setLanguage] = useState("pt"),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [libraryQuery, setLibraryQuery] = useState(""),
    [searchJob, setSearchJob] = useState("");
  const { podeEditar } = useClientRole(clientId),
    qc = useQueryClient(),
    dates = resolveDateRange(parentRoute.useSearch());
  const accounts = useQuery({
      queryKey: ["creative-accounts", clientId],
      queryFn: () => listAccounts(clientId),
    }),
    accountId = account || accounts.data?.[0]?.id || "";
  const posts = useQuery({
    queryKey: ["creative-posts", clientId, dates.start, dates.end],
    queryFn: () => getPostsForAnalytics(clientId, dates.start, dates.end),
  });
  const workspace = useQuery({
    queryKey: ["creative-workspace", clientId, accountId],
    enabled: !!accountId,
    queryFn: () => readWorkspace(clientId, accountId),
    staleTime: 30_000,
  });
  const progress = useQuery({
    queryKey: ["creative-progress", clientId, accountId],
    enabled: !!accountId,
    queryFn: () => readJobProgress(clientId, accountId),
    refetchInterval: 5000,
  });
  const workerHealth = useQuery({
    queryKey: ["creative-worker-health", clientId, accountId],
    enabled: !!accountId,
    queryFn: readWorkerHealth,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const completed = progress.data
    ?.filter((j) => ["completed", "failed", "cancelled"].includes(j.status))
    .map((j) => `${j.id}:${j.status}`)
    .join("|");
  useEffect(() => {
    if (completed)
      void qc.invalidateQueries({
        queryKey: ["creative-workspace", clientId, accountId],
      });
  }, [completed, qc, clientId, accountId]);
  const w = workspace.data
    ? {
        ...workspace.data,
        jobs: workspace.data.jobs.map((j) => ({
          ...j,
          ...progress.data?.find((p) => p.id === j.id),
        })),
      }
    : undefined;
  const source = w?.sources.find((s) => s.id === sourceId) ?? w?.sources[0];
  const analysis = w?.analyses.find((a) => a.source_id === source?.id);
  const assetIds = analysis
    ? (w?.jobs.find((j) => j.id === analysis.job_id)?.output?.asset_ids as
        string[] | undefined)
    : undefined;
  const assets = useQuery({
    queryKey: [
      "creative-assets",
      clientId,
      accountId,
      source?.id,
      analysis?.id,
    ],
    enabled: !!source,
    queryFn: () => readAssets(clientId, accountId, source!.id, assetIds),
  });
  const analysisStructure = w?.structures.find(
    (s) => s.analysis_id === analysis?.id,
  );
  const selectedStructure =
    w?.structures.find((s) => s.id === structureId) ??
    w?.structures.find((s) => s.analysis_id === analysis?.id) ??
    w?.structures[0];
  const structureAnalysis = w?.analyses.find(
    (a) => a.id === selectedStructure?.analysis_id,
  );
  const adaptation =
    w?.adaptations.find((a) => a.id === adaptationId) ??
    w?.adaptations.find((a) => a.structure_id === selectedStructure?.id);
  const adaptationAnalysis = w?.analyses.find(
    (a) => a.id === adaptation?.analysis_id,
  );
  const comparisonSource = w?.sources.find(
    (s) => s.id === adaptationAnalysis?.source_id,
  );
  const comparisonAssets = useQuery({
    queryKey: [
      "creative-comparison-assets",
      clientId,
      accountId,
      comparisonSource?.id,
      adaptationAnalysis?.id,
    ],
    enabled: !!comparisonSource && tab === "biblioteca",
    queryFn: () => readAssets(clientId, accountId, comparisonSource!.id),
  });
  const rankings = useMemo(
    () =>
      rankForObjective(
        ((posts.data ?? []) as PerformancePost[]).filter(
          (p) =>
            p.instagram_account_id === accountId &&
            ["carrossel", "reels"].includes(p.format ?? "") &&
            (!format || p.format === format),
        ),
        objective,
      ),
    [posts.data, accountId, format, objective],
  );
  const successfulSearch = w?.jobs.find(
    (j) => j.id === searchJob && j.status === "completed",
  );
  const semanticIds = successfulSearch
    ? (successfulSearch.output?.matches as { id: string }[] | undefined)?.map(
        (m) => m.id,
      )
    : undefined;
  const visibleStructures = (w?.structures ?? []).filter((s) =>
    semanticIds
      ? semanticIds.includes(s.id)
      : `${s.title} ${s.theme} ${JSON.stringify(s.dna)}`
          .toLocaleLowerCase("pt-BR")
          .includes(libraryQuery.toLocaleLowerCase("pt-BR")),
  );
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({
        queryKey: ["creative-workspace", clientId, accountId],
      }),
      qc.invalidateQueries({
        queryKey: ["creative-progress", clientId, accountId],
      }),
    ]);
  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["pautas", clientId] });
    },
  });
  const dispatch = (fn: () => Promise<unknown>) => action.mutate(fn);
  const workerState = workerHealth.data ?? w?.health;
  const healthy =
    !!workerState?.seen_at && Date.now() - Date.parse(workerState.seen_at) < 120_000;
  const canAnalyse = podeEditar && healthy && !!workerState?.capabilities?.vision;
  const busy = action.isPending;
  function chooseStructure(s: CreativeStructure) {
    setStructureId(s.id);
    setSourceId(s.source_id);
    setAdaptationId("");
    setPartial(false);
    setTab("biblioteca");
  }
  function resetAccount(id: string) {
    setAccount(id);
    setSourceId("");
    setStructureId("");
    setAdaptationId("");
    setSearchJob("");
    setPartial(false);
  }
  return (
    <div className="creative-workspace space-y-6">
      <header className="creative-heading">
        <div>
          <span className="creative-eyebrow">
            CONTEÚDO · INTELIGÊNCIA APLICADA
          </span>
          <h1>Inteligência Criativa</h1>
          <p>
            Entenda a estrutura das suas melhores publicações. Transforme
            evidências em novos conteúdos para testar.
          </p>
        </div>
        <label className="text-sm">
          Conta analisada
          <select
            className="field mt-1 w-full"
            value={accountId}
            onChange={(e) => resetAccount(e.target.value)}
          >
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ig_username
                  ? `@${a.ig_username}`
                  : `Instagram · ${a.id.slice(-6)}`}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="creative-principles">
        <span>
          <ShieldCheck size={16} aria-hidden />
          Biblioteca privada da clínica
        </span>
        <span>
          <Layers size={16} aria-hidden />
          Evidências por slide e cena
        </span>
        <span>
          <Activity size={16} aria-hidden />
          Resultados observados, sem promessas
        </span>
      </div>
      {(accounts.isError || posts.isError || workspace.isError) && (
        <div role="alert" className="creative-notice">
          {accounts.error?.message ||
            posts.error?.message ||
            workspace.error?.message}
          <button
            className="btn ml-3"
            onClick={() => {
              void accounts.refetch();
              void workspace.refetch();
              void posts.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!accounts.isLoading && !accounts.data?.length && !accounts.isError && (
        <p className="creative-notice">
          Conecte uma conta Instagram deste cliente para começar. A conexão
          existente em Integrações será reutilizada.
        </p>
      )}
      {workspace.isLoading && (
        <p role="status" className="flex items-center gap-2">
          <Loader2 className="animate-spin" size={16} />
          Carregando biblioteca privada…
        </p>
      )}
      {!!w && !canAnalyse && (
        <p className="creative-notice">
          {podeEditar
            ? "O processamento de mídia ainda não está disponível neste ambiente. As análises já concluídas continuam acessíveis."
            : "Seu acesso permite consultar as evidências. Novas análises e adaptações são solicitadas pelos responsáveis da clínica."}
        </p>
      )}
      {action.isError && (
        <p role="alert" className="creative-notice">
          {action.error.message}
        </p>
      )}
      <nav
        className="creative-tabs"
        aria-label="Áreas da Inteligência Criativa"
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "producao" && <ProductionWorkspace key={`${clientId}:${accountId}`} clientId={clientId} accountId={accountId} editable={podeEditar} healthy={healthy} capabilities={workerState?.capabilities || {}} adaptations={w?.adaptations || []} />}
      {tab === "acervo" && (
        <Painel
          icone={Trophy}
          titulo="O que se destaca nesta conta"
          resumo="Escolha o objetivo. Alcance, salvamentos, seguidores e conversões permanecem separados."
        >
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Objetivo
              <select
                className="field mt-1 w-full"
                value={objective}
                onChange={(e) => setObjective(e.target.value as Objective)}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Formato
              <select
                className="field mt-1 w-full"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="">Carrosséis e Reels</option>
                <option value="carrossel">Carrosséis</option>
                <option value="reels">Reels</option>
              </select>
            </label>
          </div>
          {objective === "conversa" ? (
            <p className="creative-notice">
              Não há atribuição comercial verificável nesta leitura.
              Visualizações e curtidas não serão apresentadas como pacientes
              adquiridos.
            </p>
          ) : null}
          <div className="creative-post-grid">
            {rankings.slice(0, 20).map(({ post, evidence }, i) => {
              const linked = w?.sources.find((s) => s.post_id === post.id),
                report = w?.analyses.find((a) => a.source_id === linked?.id),
                active = w?.jobs.some(
                  (j) =>
                    j.input.post_id === post.id &&
                    ["queued", "running", "retry"].includes(j.status),
                );
              return (
                <article className="creative-post" key={post.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="creative-rank">{i + 1}</span>
                    <Selo>
                      {post.format === "reels" ? "Reels" : "Carrossel"}
                    </Selo>
                  </div>
                  {typeof post.thumbnail_url === "string" && (
                    <img
                      src={post.thumbnail_url}
                      loading="lazy"
                      alt="Prévia da publicação; a análise utilizará os arquivos completos"
                      className="creative-thumb"
                    />
                  )}
                  <h3>
                    {String(post.caption || "Publicação sem legenda").slice(
                      0,
                      150,
                    )}
                  </h3>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {post.posted_at?.slice(0, 10)} ·{" "}
                    {String(post.tema || "Tema não classificado")}
                  </p>
                  <dl className="creative-metrics">
                    <div>
                      <dt>Alcance</dt>
                      <dd>{number(post.reach)}</dd>
                    </div>
                    <div>
                      <dt>Salvos</dt>
                      <dd>{number(post.saved)}</dd>
                    </div>
                    <div>
                      <dt>Compart.</dt>
                      <dd>{number(post.shares)}</dd>
                    </div>
                  </dl>
                  <p className="text-sm">
                    <b>
                      {evidence.relative_multiple !== null
                        ? `${evidence.relative_multiple.toFixed(2)}× a mediana`
                        : "Comparação indisponível"}
                    </b>
                    <br />
                    <span style={{ color: "var(--text-dim)" }}>
                      {evidence.baseline_count} publicações comparáveis ·
                      confiança {evidence.confidence}
                    </span>
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer">
                      Critérios e limites
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {evidence.limitations.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {report ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setSourceId(linked!.id);
                          setStructureId("");
                          setPartial(false);
                          setTab("analises");
                        }}
                      >
                        Ver análise · {COVERAGE_LABEL[report.coverage.status]}
                      </button>
                    ) : (
                      <button
                        className="btn"
                        type="button"
                        disabled={!canAnalyse || busy || active}
                        onClick={() =>
                          dispatch(() =>
                            enqueue(clientId, accountId, "analyse", {
                              post_id: post.id,
                            }),
                          )
                        }
                      >
                        {active
                          ? "Em processamento"
                          : "Analisar mídia original"}
                        <ArrowRight size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!rankings.length && !posts.isLoading && (
            <p className="note">
              Nenhum carrossel ou Reel disponível no período e na conta
              selecionados. Ajuste o período no filtro do Nexo.
            </p>
          )}
        </Painel>
      )}
      {tab === "analises" && (
        <div className="space-y-4">
          <label className="block text-sm">
            Publicação analisada
            <select
              className="field mt-1 w-full"
              value={source?.id ?? ""}
              onChange={(e) => {
                setSourceId(e.target.value);
                setStructureId("");
                setPartial(false);
              }}
            >
              {w?.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.format} · {s.title || s.external_id}
                </option>
              ))}
            </select>
          </label>
          {analysis && source ? (
            <>
              <AnalysisView
                key={analysis.id}
                analysis={analysis}
                source={source}
                assets={assets.data ?? []}
              />
              {analysisStructure && (
                <button
                  className="btn"
                  onClick={() => chooseStructure(analysisStructure)}
                >
                  Adaptar esta estrutura
                  <ArrowRight size={15} aria-hidden />
                </button>
              )}
            </>
          ) : (
            <p className="creative-notice">
              Selecione uma publicação em “Conteúdos em destaque” e solicite a
              leitura dos arquivos originais. As evidências aparecerão aqui após
              o processamento.
            </p>
          )}
        </div>
      )}
      {tab === "biblioteca" && (
        <div className="space-y-5">
          <Painel
            icone={BookOpen}
            titulo="Estruturas da clínica"
            resumo="Cada estrutura preserva origem, análise e evidências. A biblioteca pública de Inspiração continua separada."
          >
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch(async () => {
                  setSearchJob(
                    await enqueue(clientId, accountId, "search", {
                      query: libraryQuery,
                    }),
                  );
                });
              }}
            >
              <label className="min-w-0 flex-1 text-sm">
                Buscar tema, narrativa ou composição
                <input
                  className="field mt-1 w-full"
                  value={libraryQuery}
                  onChange={(e) => {
                    setLibraryQuery(e.target.value);
                    setSearchJob("");
                  }}
                  placeholder="Ex.: quebra de crença com contraste visual"
                />
              </label>
              <button
                className="btn self-end"
                disabled={!canAnalyse || busy || libraryQuery.trim().length < 2}
              >
                Buscar por significado
              </button>
            </form>
            <div className="grid gap-3 md:grid-cols-2">
              {visibleStructures.map((s) => (
                <button
                  type="button"
                  className="creative-structure text-left"
                  key={s.id}
                  aria-pressed={s.id === selectedStructure?.id}
                  onClick={() => chooseStructure(s)}
                >
                  <Selo>{EVIDENCE_LABEL[s.state]}</Selo>
                  <h3 className="mt-2 font-semibold">{s.title || s.theme}</h3>
                  <p className="mt-1 text-sm">{s.dna.hook_pattern}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    {s.format} · {s.theme}
                  </p>
                </button>
              ))}
            </div>
            {!visibleStructures.length && (
              <p className="note">
                Nenhuma estrutura encontrada. Analise uma mídia original para
                iniciar sua biblioteca privada.
              </p>
            )}
          </Painel>
          {selectedStructure && (
            <Painel
              icone={Network}
              titulo="Laboratório de adaptação"
              resumo={`Estrutura de origem: ${selectedStructure.theme}`}
            >
              {structureAnalysis?.result.format === "reels" && (
                <div className="mb-5">
                  <ReferenceScript transcript={structureAnalysis.transcript} />
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  dispatch(() =>
                    enqueue(clientId, accountId, "adapt", {
                      structure_id: selectedStructure.id,
                      theme,
                      objective,
                      allow_partial: partial,
                    }),
                  );
                }}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Novo tema
                    <input
                      className="field mt-1 w-full"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      minLength={3}
                      maxLength={500}
                      required
                      placeholder="Ex.: mudanças do sono no climatério"
                    />
                  </label>
                  <label className="text-sm">
                    Objetivo
                    <select
                      className="field mt-1 w-full"
                      value={objective}
                      onChange={(e) =>
                        setObjective(e.target.value as Objective)
                      }
                    >
                      {OBJECTIVES.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {structureAnalysis?.coverage.status !== "completa" && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={partial}
                      onChange={(e) => setPartial(e.target.checked)}
                    />
                    Entendo que a análise de origem é parcial. Quero uma
                    proposta que preserve e sinalize essas limitações.
                  </label>
                )}
                <button
                  className="btn"
                  disabled={
                    !canAnalyse ||
                    busy ||
                    theme.trim().length < 3 ||
                    (structureAnalysis?.coverage.status !== "completa" &&
                      !partial)
                  }
                >
                  Criar proposta para revisão
                  <ArrowRight size={15} aria-hidden />
                </button>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  O Brand Brain aprovado orienta o tom e o posicionamento. A
                  proposta requer revisão médica antes de ser produzida ou
                  publicada.
                </p>
              </form>
            </Painel>
          )}
          {!!w?.adaptations.length && (
            <label className="block text-sm">
              Adaptação para comparar
              <select
                className="field mt-1 w-full"
                value={adaptation?.id ?? ""}
                onChange={(e) => setAdaptationId(e.target.value)}
              >
                {w.adaptations.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.document.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {adaptation && (
            <AdaptationView
              key={adaptation.id}
              adaptation={adaptation}
              analysis={adaptationAnalysis}
              assets={comparisonAssets.data ?? []}
              posts={(posts.data ?? []) as any}
              editable={podeEditar}
              busy={busy}
              onPlanner={() =>
                dispatch(() => toPlanner(clientId, adaptation.id))
              }
              onLink={(postId) =>
                dispatch(() => linkPublication(clientId, adaptation.id, postId))
              }
            />
          )}
        </div>
      )}
      {tab === "radar" && (
        <Painel
          icone={Search}
          titulo="Radar de mercado"
          resumo="Encontre referências públicas para comparar com o repertório desta conta."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch(() =>
                enqueue(clientId, accountId, "discover", {
                  platform,
                  query,
                  country,
                  language,
                  since: since || null,
                  until: until || null,
                  format: format || null,
                }),
              );
            }}
          >
            <label className="block text-sm">
              Tema, especialidade, problema, palavra-chave, hashtag ou perfil
              <input
                className="field mt-1 w-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                maxLength={200}
                required
                placeholder="Ex.: menopausa"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Plataforma
                <select
                  className="field mt-1 w-full"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="instagram">Instagram · hashtags</option>
                  <option value="tiktok">TikTok · busca pública</option>
                </select>
              </label>
              <label className="text-sm">
                País desejado
                <input
                  className="field mt-1 w-full"
                  value={country}
                  maxLength={2}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                />
              </label>
              <label className="text-sm">
                Idioma desejado
                <input
                  className="field mt-1 w-full"
                  value={language}
                  maxLength={10}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Desde
                <input
                  className="field mt-1 w-full"
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Até
                <input
                  className="field mt-1 w-full"
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Formato
                <select
                  className="field mt-1 w-full"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="carrossel">Carrosséis</option>
                  <option value="reels">Vídeos</option>
                </select>
              </label>
            </div>
            <button
              className="btn"
              disabled={
                !podeEditar ||
                !healthy ||
                !workerState?.capabilities?.external_search ||
                busy
              }
            >
              Pesquisar referências públicas
            </button>
          </form>
          {!workerState?.capabilities?.external_search && (
            <p className="creative-notice mt-4">
              A coleta externa ainda precisa ser habilitada e homologada neste
              ambiente. Nenhum resultado demonstrativo será apresentado como
              pesquisa real.
            </p>
          )}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {w?.discoveries.map((d) => (
              <article className="creative-structure" key={d.id}>
                <Selo>Popularidade observada</Selo>
                <h3 className="mt-2 font-semibold">{d.title}</h3>
                <p className="my-2 text-sm">
                  {d.platform} · {number(d.metadata.views)} visualizações ·{" "}
                  {number(d.metadata.likes)} curtidas
                </p>
                <a
                  className="underline"
                  href={d.canonical_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Conferir referência original
                </a>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Aceleração, país e idioma ainda não confirmados. Uma
                  observação não comprova tendência.
                </p>
              </article>
            ))}
          </div>
        </Painel>
      )}
      {tab === "aprendizado" && (
        <Painel
          icone={ChartNoAxesCombined}
          titulo="O que aconteceu depois da adaptação"
          resumo="A medição começa após o vínculo com uma publicação real. Criar pauta não conta como publicar."
        >
          {!w?.observations.length ? (
            <p className="note">
              Ainda não há medições de adaptações publicadas. Vincule a
              publicação real no comparador para acompanhar D1, D3, D7 e D28.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Publicação</th>
                    <th>Janela</th>
                    <th>Qualidade da observação</th>
                    <th>Alcance</th>
                    <th>Salvos</th>
                    <th>Compart.</th>
                  </tr>
                </thead>
                <tbody>
                  {w.observations.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {w.adaptations.find((a) => a.id === o.adaptation_id)
                          ?.document.title || "Adaptação"}
                      </td>
                      <td>D{o.window_day}</td>
                      <td>
                        {
                          (
                            {
                              within_window: "Dentro da janela",
                              late: "Fora da janela",
                              stale: "Métrica desatualizada",
                              missing: "Sem métrica confirmada",
                            } as Record<string, string>
                          )[o.quality]
                        }
                      </td>
                      <td>{number(o.metrics.reach)}</td>
                      <td>{number(o.metrics.saved)}</td>
                      <td>{number(o.metrics.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
            O histórico anterior à coleta não é reconstruído. Comparações
            observacionais não comprovam causalidade; estruturas não recebem
            validação definitiva por um único resultado.
          </p>
        </Painel>
      )}
      {!!w?.jobs.length && (
        <details
          className="creative-jobs"
          open={w.jobs.some((j) =>
            ["running", "queued", "retry"].includes(j.status),
          )}
        >
          <summary className="cursor-pointer font-semibold">
            Processamento e custos ·{" "}
            {
              w.jobs.filter((j) =>
                ["running", "queued", "retry"].includes(j.status),
              ).length
            }{" "}
            em andamento
          </summary>
          <div className="mt-3 space-y-3">
            {w.jobs.slice(0, 12).map((j) => (
              <JobRow
                key={j.id}
                job={j}
                editable={podeEditar}
                busy={busy}
                cancel={() => dispatch(() => cancelJob(clientId, j.id))}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
function JobRow({
  job,
  editable,
  busy,
  cancel,
}: {
  job: CreativeJob;
  editable: boolean;
  busy: boolean;
  cancel: () => void;
}) {
  const active = ["running", "queued", "retry"].includes(job.status);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {
            {
              analyse: "Análise de mídia",
              adapt: "Adaptação",
              discover: "Pesquisa externa",
              search: "Busca semântica",
              measure: "Medição",
              production_prepare: "Proposta de edição de vídeo",
              production_render: "Renderização de peça",
              production_image: "Imagem do slide",
            }[job.kind]
          }{" "}
          · {job.progress}%
        </p>
        <p className="text-sm" role="status">
          {job.message}
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          US$ {Number(job.cost_usd).toFixed(4)} registrados · US${" "}
          {Number(job.reserved_usd).toFixed(4)} reservados · teto US${" "}
          {Number(job.budget_usd).toFixed(2)}
        </p>
      </div>
      {active && editable && (
        <button className="btn" type="button" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
      )}
    </div>
  );
}
