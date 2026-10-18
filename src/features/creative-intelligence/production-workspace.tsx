import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Plus,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import {
  newDocument,
  productionDocumentSchema,
  renderSlideSvg,
  slideLayout,
  fittedFont,
  applySlideImage,
  type ProductionDocument,
  type ProductionProject,
  type VideoDocument,
  type MediaRef,
} from "@/lib/creative-intelligence/production";
import {
  applyReferenceSlides,
  referenceApproved,
} from "@/lib/creative-intelligence/reference-design";
import type { CreativeAdaptation } from "@/lib/creative-intelligence/contracts";
import { enqueue, cancelJob } from "./data";
import { CAPTION_BACKGROUND, hasEmbeddedCaptions, readableCaptionAccent } from "@/lib/creative-intelligence/caption-style";
import {
  createProduction,
  listProductions,
  readProduction,
  saveProduction,
  uploadProduction,
  productionUrls,
  originalProductionImages,
  mediaKey,
  approvedProductionBrand,
} from "./production-data";
import "./production.css";

type Props = {
  clientId: string;
  accountId: string;
  editable: boolean;
  healthy: boolean;
  capabilities: Record<string, boolean>;
  adaptations: CreativeAdaptation[];
};
export function ProductionWorkspace(props: Props) {
  const { clientId, accountId, adaptations, editable } = props;
  const qc = useQueryClient();
  const [selected, setSelected] = useState(""),
    [adaptation, setAdaptation] = useState("");
  const projects = useQuery({
    queryKey: ["productions", clientId, accountId],
    queryFn: () => listProductions(clientId, accountId),
  });
  const create = useMutation({
    mutationFn: async (format: "carrossel" | "reels") => {
      const a = adaptations.find((a) => a.id === adaptation);
      const document = newDocument(format, a);
      if (document.format === "carrossel")
        document.brand = {
          ...document.brand,
          ...(await approvedProductionBrand(clientId)),
        };
      return createProduction(clientId, accountId, document, a?.id || null);
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({
        queryKey: ["productions", clientId, accountId],
      });
      setSelected(id);
    },
  });
  const project = projects.data?.find((p) => p.id === selected);
  const chosen = adaptations.find((a) => a.id === adaptation);
  return (
    <section className="production" aria-label="Estúdio de produção">
      <div className="production-intro">
        <div>
          <span className="production-eyebrow">DA ESTRUTURA À PEÇA</span>
          <h2>Estúdio de produção</h2>
          <p>
            Adapte o carrossel preservando o modelo original ou envie uma
            gravação para preparar a edição. Cada revisão mantém o material
            anterior.
          </p>
        </div>
        <Clapperboard size={32} aria-hidden />
      </div>
      <div className="production-create">
        <label>
          Começar com uma adaptação
          <select
            value={adaptation}
            onChange={(e) => setAdaptation(e.target.value)}
          >
            <option value="">Projeto em branco / gravação própria</option>
            {adaptations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.document.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={
            !editable || create.isPending || chosen?.document.format === "reels"
          }
          onClick={() => create.mutate("carrossel")}
        >
          <Plus size={15} />
          Carrossel
        </button>
        <button
          className="btn"
          disabled={
            !editable ||
            create.isPending ||
            chosen?.document.format === "carrossel"
          }
          onClick={() => create.mutate("reels")}
        >
          <Film size={15} />
          Vídeo
        </button>
      </div>
      {(projects.error || create.error) && (
        <p role="alert">{(projects.error || create.error)?.message}</p>
      )}
      {projects.isLoading && <p>Lendo projetos…</p>}
      <div
        className="production-projects"
        role="group"
        aria-label="Projetos de produção"
      >
        {projects.data?.map((p) => (
          <button
            key={p.id}
            aria-pressed={p.id === selected}
            onClick={() => setSelected(p.id)}
          >
            <span>{p.format === "carrossel" ? "CARROSSEL" : "VÍDEO"}</span>
            {p.title}
            <small>Revisão {p.current_revision}</small>
          </button>
        ))}
      </div>
      {project ? (
        <ProjectEditor
          key={`${clientId}:${accountId}:${project.id}`}
          {...props}
          project={project}
        />
      ) : (
        !projects.isLoading && (
          <div className="production-empty">
            <ImagePlus size={28} aria-hidden />
            <p>Escolha uma adaptação ou crie seu primeiro projeto.</p>
            <small>
              As peças ficam privadas nesta clínica. Publicação e envio externo
              não fazem parte deste estúdio.
            </small>
          </div>
        )
      )}
    </section>
  );
}

function ProjectEditor({
  project,
  ...props
}: Props & { project: ProductionProject }) {
  const { clientId, accountId, editable, healthy, capabilities } = props,
    qc = useQueryClient();
  const [document, setDocument] = useState<ProductionDocument | null>(null),
    [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false),
    [slide, setSlide] = useState(0),
    [rights, setRights] = useState(false),
    [notice, setNotice] = useState(""),
    [jobId, setJobId] = useState(""),
    [designMode, setDesignMode] = useState<"reference" | "editable" | null>(
      null,
    );
  const undo = useRef<ProductionDocument[]>([]),
    redo = useRef<ProductionDocument[]>([]),
    saving = useRef<Promise<number> | null>(null),
    editVersion = useRef(0);
  const documentRef = useRef(document);
  documentRef.current = document;
  const detail = useQuery({
    queryKey: ["production", clientId, accountId, project.id],
    queryFn: () => readProduction(clientId, accountId, project.id),
    refetchInterval: (q) =>
      q.state.data?.jobs.some((j) =>
        ["queued", "retry", "running"].includes(j.status),
      )
        ? 3000
        : false,
  });
  useEffect(() => {
    if (
      detail.data?.revisions[0] &&
      (!document ||
        (!dirty &&
          !saving.current &&
          detail.data.revisions[0].revision > revision))
    ) {
      setDocument(detail.data.revisions[0].document);
      setRevision(detail.data.revisions[0].revision);
    }
  }, [detail.data, document, dirty, revision]);
  const signed = useQuery({
    queryKey: [
      "production-urls",
      clientId,
      accountId,
      project.id,
      detail.data?.media.map((m) => m.id).join(","),
    ],
    queryFn: () =>
      productionUrls(clientId, accountId, detail.data?.media || []),
    enabled: !!detail.data,
    refetchInterval: 180000,
  });
  const originals = useQuery({
    queryKey: ["production-originals", clientId, accountId, project.source_id],
    queryFn: () =>
      originalProductionImages(clientId, accountId, project.source_id),
    refetchInterval: 180000,
  });
  const urls = { ...originals.data?.urls, ...signed.data },
    key = ["production", clientId, accountId, project.id];
  function edit(next: ProductionDocument) {
    if (!editable || !documentRef.current) return;
    undo.current = [...undo.current.slice(-39), documentRef.current];
    redo.current = [];
    editVersion.current++;
    documentRef.current = next;
    setDocument(next);
    if (next.format === "carrossel")
      setSlide((i) => Math.min(i, next.slides.length - 1));
    setDirty(true);
    setNotice("");
  }
  const save = useMutation({
    mutationFn: async () => {
      if (saving.current) return saving.current;
      if (!document) return revision;
      const parsed = productionDocumentSchema.parse(document),
        v = editVersion.current;
      const pending = saveProduction(clientId, project.id, revision, parsed)
        .then((n) => {
          setRevision(n);
          if (editVersion.current === v) setDirty(false);
          return n;
        })
        .finally(() => {
          saving.current = null;
        });
      saving.current = pending;
      return pending;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({
        queryKey: ["productions", clientId, accountId],
      });
    },
  });
  const autoSave = save.mutate;
  useEffect(() => {
    if (!editable || !dirty || save.isPending || save.error) return;
    const t = setTimeout(() => autoSave(), 2500);
    return () => clearTimeout(t);
  }, [editable, dirty, document, save.isPending, save.error, autoSave]);
  const upload = useMutation({
    mutationFn: async ({
      file,
      target,
    }: {
      file: File;
      target: "slide" | "logo" | "video";
    }) => {
      if (!rights)
        throw new Error("Confirme a autorização de uso do material.");
      if (!document) throw new Error("Projeto indisponível");
      const id = await uploadProduction(clientId, project.id, file),
        ref = { origin: "production" as const, id };
      const current = documentRef.current;
      if (!current) throw new Error("Projeto indisponível");
      if (target === "video" && current.format === "reels")
        edit({
          ...current,
          source: ref,
          duration: null,
          transcript: [],
          cuts: [],
          visualCoverage: "not_analysed",
          motion: undefined,
          sourceHasCaptions: undefined,
        });
      else if (current.format === "carrossel")
        edit(
          target === "logo"
            ? { ...current, brand: { ...current.brand, logo: ref } }
            : applySlideImage(current, slide, ref),
        );
      await qc.invalidateQueries({ queryKey: key });
    },
  });
  const run = useMutation({
    mutationFn: async (
      request:
        | "production_prepare"
        | "production_render"
        | "production_image"
        | {
            kind: "production_image";
            full_slide: true;
            all_slides?: true;
            reference?: MediaRef;
            references?: { slide_index: number; reference: MediaRef }[];
          },
    ) => {
      const { kind, ...input } =
        typeof request === "string" ? { kind: request } : request;
      if (!document) throw new Error("Projeto indisponível");
      const r = dirty
        ? await save.mutateAsync()
        : saving.current
          ? await saving.current
          : revision;
      return enqueue(clientId, accountId, kind, {
        project_id: project.id,
        revision: r,
        ...(kind === "production_image" && !("all_slides" in input)
          ? { slide_index: slide }
          : {}),
        ...input,
      });
    },
    onSuccess: (id) => {
      setJobId(id);
      setNotice(
        "Solicitação registrada. A prévia será exibida aqui quando o worker concluir.",
      );
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({
        queryKey: ["creative-progress", clientId, accountId],
      });
    },
  });
  const output =
      detail.data?.outputs.find((o) => o.job_id === jobId) ||
      detail.data?.outputs.find(
        (o) => o.revision === revision && o.kind === "production_prepare",
      ),
    currentOutputs =
      detail.data?.outputs.filter(
        (o) => o.revision === revision || o.result.reference_slides?.length,
      ) || [];
  const error =
    detail.error ||
    save.error ||
    upload.error ||
    run.error ||
    signed.error ||
    originals.error;
  const originalMedia = originals.data?.media || [];
  const faithful = designMode
    ? designMode === "reference"
    : !!project.source_id ||
      (document?.format === "carrossel" &&
        document.slides.some((s) => s.renderMode === "reference"));
  function referenceFor(index: number): MediaRef | null {
    if (document?.format !== "carrossel") return null;
    const s = document.slides[index];
    const previous = detail.data?.outputs
      .flatMap((o) => o.result.reference_slides || [])
      .find((c) => c.media_id === s.image?.id);
    if (s.renderMode === "reference" && previous) return previous.reference;
    if (s.image?.origin === "creative") return s.image;
    const position =
      props.adaptations.find((a) => a.id === project.adaptation_id)?.document
        .units[index]?.original_position || index + 1;
    const own = originalMedia.find(
      (m) => m.kind === "image" && m.position === position,
    );
    if (own) return { origin: "creative", id: own.id };
    return s.renderMode !== "reference" ? s.image : null;
  }
  const reference = referenceFor(slide);
  const fullReady =
    document?.format === "carrossel" &&
    document.slides.every(
      (s) =>
        s.renderMode === "reference" && s.renderedCopy === s.copy && s.image,
    );

  function fileInput(target: "slide" | "logo" | "video") {
    return (
      <label className="production-file">
        {upload.isPending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <ImagePlus size={15} />
        )}{" "}
        {target === "video"
          ? "Enviar gravação"
          : target === "logo"
            ? "Enviar logo / assinatura"
            : faithful
              ? "Enviar modelo original autorizado"
              : "Trocar imagem"}
        <input
          type="file"
          accept={
            target === "video"
              ? "video/mp4,video/quicktime"
              : "image/jpeg,image/png,image/webp"
          }
          disabled={!editable || !rights || upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate({ file, target });
            e.currentTarget.value = "";
          }}
        />
      </label>
    );
  }
  if (!document)
    return (
      <p role={detail.error ? "alert" : undefined}>
        {detail.error?.message || "Abrindo o projeto…"}
      </p>
    );
  const busy = save.isPending || upload.isPending || run.isPending,
    workerReady = editable && healthy;
  return (
    <div className="production-editor">
      <div className="production-toolbar">
        <div>
          <b>{document.title}</b>
          <small>
            {dirty
              ? "Alterações aguardando salvamento"
              : `Revisão ${revision} salva`}{" "}
            · {editable ? "Edição da equipe" : "Somente leitura"}
          </small>
        </div>
        <div className="production-buttons">
          <button
            className="btn"
            aria-label="Desfazer edição"
            disabled={!editable || !undo.current.length || busy}
            onClick={() => {
              const prev = undo.current.pop();
              if (prev) {
                redo.current.push(document);
                editVersion.current++;
                setDocument(prev);
                setDirty(true);
              }
            }}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn"
            aria-label="Refazer edição"
            disabled={!editable || !redo.current.length || busy}
            onClick={() => {
              const next = redo.current.pop();
              if (next) {
                undo.current.push(document);
                editVersion.current++;
                setDocument(next);
                setDirty(true);
              }
            }}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="btn"
            disabled={!editable || !dirty || busy}
            onClick={() => save.mutate()}
          >
            <Save size={15} />
            {save.isPending ? "Salvando…" : "Salvar revisão"}
          </button>
        </div>
      </div>
      {error && (
        <p className="production-error" role="alert">
          {error.message}
          {save.error && (
            <button
              className="btn"
              onClick={() => {
                if (!save.error.message.includes("Outra pessoa")) {
                  save.reset();
                  return;
                }
                void readProduction(clientId, accountId, project.id)
                  .then((latest) => {
                    if (latest.revisions[0]) {
                      setRevision(latest.revisions[0].revision);
                      save.reset();
                      setNotice(
                        "Sua edição será salva em uma nova revisão. A versão da outra pessoa permanece no histórico.",
                      );
                    }
                  })
                  .catch(() =>
                    setNotice(
                      "Não foi possível ler a revisão atual. Sua edição local foi preservada.",
                    ),
                  );
              }}
            >
              {save.error.message.includes("Outra pessoa")
                ? "Salvar minha edição como nova revisão"
                : "Tentar salvar novamente"}
            </button>
          )}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div
        className="production-jobs"
        role="group"
        aria-label="Trabalhos de produção"
      >
        {detail.data?.jobs.slice(0, 4).map((j) => (
          <div key={j.id}>
            <p role={j.status === "failed" ? "alert" : "status"}>
              {j.message || j.status}
            </p>
            {["queued", "running", "retry"].includes(j.status) && (
              <>
                <progress
                  value={j.progress}
                  max={100}
                  aria-label="Progresso da produção"
                />
                {editable && (
                  <button
                    className="btn"
                    onClick={() => {
                      void cancelJob(clientId, j.id)
                        .then(() => qc.invalidateQueries({ queryKey: key }))
                        .catch(() =>
                          setNotice(
                            "Não foi possível cancelar agora. Tente novamente.",
                          ),
                        );
                    }}
                  >
                    Cancelar trabalho
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {!healthy && (
        <p className="production-note">
          O worker está indisponível. Você pode editar e salvar; preparar ou
          renderizar exige o worker conectado.
        </p>
      )}
      <div className="production-common">
        <label>
          Título do projeto
          <input
            value={document.title}
            maxLength={240}
            disabled={!editable}
            onChange={(e) => edit({ ...document, title: e.target.value })}
          />
        </label>
        <label className="production-check">
          <input
            type="checkbox"
            checked={rights}
            disabled={!editable}
            onChange={(e) => setRights(e.target.checked)}
          />
          Tenho autorização para usar os arquivos enviados. Não enviarei
          consultas, prontuários ou dados de pacientes.
        </label>
      </div>
      {document.format === "carrossel" ? (
        <div className="production-grid">
          <div className="production-preview">
            <div
              className="production-slide-nav"
              role="group"
              aria-label="Slides"
            >
              {document.slides.map((s, i) => (
                <button
                  key={s.id}
                  aria-pressed={i === slide}
                  onClick={() => setSlide(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            {faithful && document.slides[slide]?.renderMode !== "reference" ? (
              reference && urls[mediaKey(reference)] ? (
                <img
                  className="production-slide"
                  src={urls[mediaKey(reference)]}
                  alt={`Modelo original do slide ${slide + 1}`}
                />
              ) : (
                <p>Escolha ou envie a arte original para preservar o modelo.</p>
              )
            ) : (
              <SlidePreview document={document} slide={slide} urls={urls} />
            )}
            <p className="production-note">
              {faithful
                ? document.slides[slide]?.renderMode === "reference"
                  ? "Arte completa aplicada. Confira texto, fotografia e assinatura antes de exportar."
                  : "Este é o modelo original. Gere a prévia para ver a nova copy dentro da arte."
                : "Composição editável: confira a quebra das linhas na prévia."}
            </p>
          </div>
          <div className="production-controls">
            <label>
              Produção do carrossel
              <select
                value={faithful ? "reference" : "editable"}
                disabled={!editable || busy}
                onChange={(e) =>
                  setDesignMode(e.target.value as "reference" | "editable")
                }
              >
                <option value="reference">Manter modelo da referência</option>
                <option value="editable">Composição editável (avançado)</option>
              </select>
            </label>
            <label>
              Texto do slide {slide + 1}
              <textarea
                rows={7}
                maxLength={2400}
                disabled={!editable}
                value={document.slides[slide]?.copy || ""}
                onChange={(e) =>
                  edit({
                    ...document,
                    slides: document.slides.map((s, i) =>
                      i === slide ? { ...s, copy: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            {!faithful && (
              <>
                <div className="production-two">
                  <label>
                    Tamanho do texto
                    <input
                      type="range"
                      min="30"
                      max="84"
                      value={document.slides[slide]?.fontSize || 54}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          slides: document.slides.map((s, i) =>
                            i === slide
                              ? { ...s, fontSize: Number(e.target.value) }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="btn"
                    disabled={!editable}
                    onClick={() => {
                      const l = slideLayout(document, slide);
                      edit({
                        ...document,
                        slides: document.slides.map((s, i) =>
                          i === slide
                            ? {
                                ...s,
                                fontSize: fittedFont(s.copy, l.width, l.height),
                              }
                            : s,
                        ),
                      });
                    }}
                  >
                    Ajustar texto ao espaço
                  </button>
                  <label>
                    Composição
                    <select
                      value={document.slides[slide]?.layout || "editorial"}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          slides: document.slides.map((s, i) =>
                            i === slide
                              ? {
                                  ...s,
                                  layout: e.target.value as
                                    "editorial" | "split",
                                }
                              : s,
                          ),
                        })
                      }
                    >
                      <option value="editorial">Imagem abaixo</option>
                      <option value="split">Imagem ao lado</option>
                    </select>
                  </label>
                </div>
                <div className="production-two">
                  <label>
                    Alinhamento
                    <select
                      value={document.slides[slide]?.align || "left"}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          slides: document.slides.map((s, i) =>
                            i === slide
                              ? {
                                  ...s,
                                  align: e.target.value as "left" | "center",
                                }
                              : s,
                          ),
                        })
                      }
                    >
                      <option value="left">À esquerda</option>
                      <option value="center">Centralizado</option>
                    </select>
                  </label>
                  <label>
                    Enquadramento da imagem
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={document.slides[slide]?.imageFocus || 0}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          slides: document.slides.map((s, i) =>
                            i === slide
                              ? { ...s, imageFocus: Number(e.target.value) }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )}
            {fileInput("slide")}
            {originalMedia.some((m) => m.kind === "image") && (
              <label>
                Imagem da própria referência
                <select
                  value={
                    document.slides[slide]?.image?.origin === "creative"
                      ? document.slides[slide].image!.id
                      : ""
                  }
                  disabled={!editable}
                  onChange={(e) => {
                    if (e.target.value)
                      edit({
                        ...document,
                        slides: document.slides.map((s, i) =>
                          i === slide
                            ? {
                                ...s,
                                image: {
                                  origin: "creative",
                                  id: e.target.value,
                                },
                                renderMode: "editable",
                                renderedCopy: undefined,
                              }
                            : s,
                        ),
                      });
                  }}
                >
                  <option value="">Escolher imagem própria</option>
                  {originalMedia
                    .filter((m) => m.kind === "image")
                    .map((m, i) => (
                      <option key={m.id} value={m.id}>
                        Arquivo original {i + 1}
                      </option>
                    ))}
                </select>
                <small>
                  {faithful
                    ? "O slide completo será enviado como modelo. A IA substituirá a copy e adaptará a fotografia preservando a composição."
                    : "Use uma imagem de apoio sem texto para esta composição editável."}
                </small>
              </label>
            )}
            <label>
              {faithful
                ? "Imagem e ajustes para o novo tema"
                : "Briefing da imagem"}
              <textarea
                rows={3}
                maxLength={4000}
                disabled={!editable}
                value={document.slides[slide]?.imagePrompt || ""}
                onChange={(e) =>
                  edit({
                    ...document,
                    slides: document.slides.map((s, i) =>
                      i === slide ? { ...s, imagePrompt: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <button
              className="btn production-primary"
              disabled={
                !workerReady ||
                !(faithful
                  ? capabilities.production_reference
                  : capabilities.production_image) ||
                busy ||
                (faithful && !reference)
              }
              onClick={() =>
                faithful && reference
                  ? run.mutate({
                      kind: "production_image",
                      full_slide: true,
                      reference,
                    })
                  : run.mutate("production_image")
              }
            >
              {faithful
                ? "Gerar slide mantendo o modelo"
                : "Criar / adaptar imagem deste slide"}
            </button>
            {faithful && (
              <>
                <small>
                  A arte será gerada inteira. Confira e aplique a primeira
                  página antes de produzir as demais. Ajustes são feitos na copy
                  e no briefing, seguidos de uma nova geração.
                </small>
                <button
                  className="btn"
                  disabled={
                    !workerReady ||
                    !capabilities.production_reference ||
                    busy ||
                    document.slides[0].renderMode !== "reference" ||
                    document.slides[0].renderedCopy !==
                      document.slides[0].copy ||
                    fullReady ||
                    document.slides.some((_, i) => !referenceFor(i))
                  }
                  onClick={() =>
                    run.mutate({
                      kind: "production_image",
                      full_slide: true,
                      all_slides: true,
                      references: document.slides.map((_, i) => ({
                        slide_index: i,
                        reference: referenceFor(i)!,
                      })),
                    })
                  }
                >
                  Gerar restante do carrossel
                </button>
              </>
            )}
            {!(faithful
              ? capabilities.production_reference
              : capabilities.production_image) && (
              <small>
                Este worker ainda não confirmou a geração{" "}
                {faithful ? "da arte completa com referência" : "de imagem"}. As
                revisões continuam disponíveis.
              </small>
            )}
            {!faithful && (
              <details>
                <summary>Identidade visual</summary>
                <label>
                  Nome da marca
                  <input
                    value={document.brand.name}
                    disabled={!editable}
                    onChange={(e) =>
                      edit({
                        ...document,
                        brand: { ...document.brand, name: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Assinatura
                  <input
                    value={document.brand.signature}
                    disabled={!editable}
                    onChange={(e) =>
                      edit({
                        ...document,
                        brand: { ...document.brand, signature: e.target.value },
                      })
                    }
                  />
                </label>
                <div className="production-colors">
                  {(["background", "ink", "accent"] as const).map((k, i) => (
                    <label key={k}>
                      {["Fundo", "Texto", "Destaque"][i]}
                      <input
                        type="color"
                        value={document.brand[k]}
                        disabled={!editable}
                        onChange={(e) =>
                          edit({
                            ...document,
                            brand: { ...document.brand, [k]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Tipografia
                  <select
                    value={document.brand.font}
                    disabled={!editable}
                    onChange={(e) =>
                      edit({
                        ...document,
                        brand: {
                          ...document.brand,
                          font: e.target.value as "sans" | "serif",
                        },
                      })
                    }
                  >
                    <option value="sans">Sem serifa</option>
                    <option value="serif">Com serifa</option>
                  </select>
                </label>
                {fileInput("logo")}
              </details>
            )}
          </div>
        </div>
      ) : (
        <div className="production-video">
          <div className="production-video-source">
            <h3>Gravação original</h3>
            {fileInput("video")}
            <small>MP4 ou MOV · até 200 MiB · até três minutos</small>
            {originalMedia.some((m) => m.kind === "video") && (
              <button
                className="btn"
                disabled={!editable || busy}
                onClick={() =>
                  edit({
                    ...document,
                    source: {
                      origin: "creative",
                      id: originalMedia.find((m) => m.kind === "video")!.id,
                    },
                    duration: null,
                    transcript: [],
                    cuts: [],
                    motion: undefined,
                    sourceHasCaptions: undefined,
                    visualCoverage: "not_analysed",
                  })
                }
              >
                Usar vídeo da própria referência
              </button>
            )}
            <label className="production-check">
              <input
                type="checkbox"
                checked={!!document.motionRequested}
                disabled={!editable || busy || !capabilities.production_motion}
                onChange={(e) =>
                  edit({
                    ...document,
                    motionRequested: e.target.checked,
                    motion: undefined,
                  })
                }
              />
              Edição visual com Remotion, orientada pela referência
            </label>
            {!capabilities.production_motion && (
              <small>
                O worker de composição visual ainda não está habilitado neste
                ambiente.
              </small>
            )}
            {document.motion && (
              <details>
                <summary>Direção de edição e evidências da referência</summary>
                {document.motion.reference_performance && (
                  <p className="production-note">
                    Referência observada:{" "}
                    {document.motion.reference_performance.saved?.toLocaleString(
                      "pt-BR",
                    ) ?? "—"}{" "}
                    salvamentos · alcance{" "}
                    {document.motion.reference_performance.reach?.toLocaleString(
                      "pt-BR",
                    ) ?? "—"}
                    .{" "}
                    {document.motion.reference_performance.relative_multiple?.toFixed(
                      1,
                    ) ?? "—"}
                    × a mediana para{" "}
                    {document.motion.reference_performance.objective}, em{" "}
                    {document.motion.reference_performance.baseline_count}{" "}
                    publicações comparáveis. Impulsionamento não confirmado; a
                    comparação não demonstra que a edição causou o resultado.
                  </p>
                )}

                <ul>
                  {document.motion.observations.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <p className="production-note">
                  Leitura visual amostral ·{" "}
                  {document.motion.timing === "provider_words"
                    ? "fala com tempos por palavra"
                    : "sem nova legenda por palavra"}
                </p>
                <ul>
                  {document.motion.limitations.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </details>
            )}
            {document.source && urls[mediaKey(document.source)] && (
              <video
                controls
                preload="metadata"
                src={urls[mediaKey(document.source)]}
                aria-label="Gravação original"
              />
            )}
            {document.recordingBrief.length > 0 && (
              <details>
                <summary>Roteiro adaptado para a gravação</summary>
                {document.recordingBrief.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </details>
            )}
            <label>
              Duração desejada
              <input
                type="number"
                min="15"
                max="180"
                value={document.goalSeconds}
                disabled={!editable}
                onChange={(e) =>
                  edit({ ...document, goalSeconds: Number(e.target.value) })
                }
              />
            </label>
            <button
              className="btn"
              disabled={
                !workerReady ||
                !document.source ||
                !capabilities.production_video_plan ||
                busy
              }
              onClick={() => run.mutate("production_prepare")}
            >
              Preparar edição com IA
            </button>
            <p className="production-note">
              A IA propõe cortes sobre a fala real. A leitura visual é amostral;
              revise contexto e transições.
            </p>
          </div>
          <div className="production-cuts">
            <div className="production-two">
              <label>
                Formato
                <select
                  value={document.aspect}
                  disabled={!editable}
                  onChange={(e) =>
                    edit({
                      ...document,
                      aspect: e.target.value as VideoDocument["aspect"],
                    })
                  }
                >
                  <option>9:16</option>
                  <option>1:1</option>
                  <option>16:9</option>
                </select>
              </label>
              <label>
                Tamanho das legendas
                <input
                  type="range"
                  min="20"
                  max="56"
                  value={document.subtitleSize}
                  disabled={!editable || hasEmbeddedCaptions(document)}
                  onChange={(e) =>
                    edit({ ...document, subtitleSize: Number(e.target.value) })
                  }
                />
                <small>{document.subtitleSize} px · novos projetos começam em 48 px</small>
              </label>
            </div>
            <label className="production-check">
              <input
                type="checkbox"
                checked={hasEmbeddedCaptions(document)}
                disabled={!editable}
                onChange={(e) => edit({ ...document, sourceHasCaptions: e.target.checked })}
              />
              O vídeo original já possui legendas ou títulos
            </label>
            {hasEmbeddedCaptions(document) && (
              <p className="production-notice">
                As legendas do original serão preservadas. Não será adicionada outra
                camada. O tamanho acima não altera texto já gravado na imagem.
              </p>
            )}
            <label className="production-check">
              <input
                type="checkbox"
                checked={document.subtitles}
                disabled={!editable || hasEmbeddedCaptions(document)}
                onChange={(e) =>
                  edit({ ...document, subtitles: e.target.checked })
                }
              />
              Adicionar legendas ao vídeo
            </label>
            {!hasEmbeddedCaptions(document) && document.subtitles && (
              <div className="my-4">
                <p className="mb-2 text-xs">Prévia de tamanho e contraste · largura de celular</p>
                <div
                  aria-label="Prévia de leitura das legendas"
                  style={{ width: "100%", maxWidth: 360 }}
                >
                  <svg viewBox="0 0 720 300" className="block w-full" role="img" aria-label="Exemplo de legenda com o tamanho escolhido">
                    <rect width="720" height="300" rx="16" fill="#e5e7eb" />
                    <rect x="60" y="80" width="600" height="140" rx="8" fill={CAPTION_BACKGROUND} />
                    <g fontFamily="Arial, sans-serif" fontSize={document.subtitleSize} fontWeight="700" textAnchor="middle" fill="#fff">
                      <text x="360" y="137">Informação <tspan fill={readableCaptionAccent(document.motion?.accent || "#D4B464")}>clara</tspan></text>
                      <text x="360" y="195">para decidir.</text>
                    </g>
                  </svg>
                </div>
                <small>
                  {document.motionRequested
                    ? "O tamanho escolhido também será aplicado pelo Remotion."
                    : "Sem Remotion, o tempo das frases curtas é estimado dentro de cada trecho transcrito."}
                  {document.subtitleSize < 40 ? " Abaixo de 40 px, a leitura no celular pode ficar pequena." : ""}
                </small>
              </div>
            )}
            <h3>Cortes da edição</h3>
            {document.cuts.length === 0 && (
              <p>Envie a gravação e prepare uma proposta de edição.</p>
            )}
            {document.cuts.map((c, i) => (
              <div key={c.id} className="production-cut">
                <strong>{c.label}</strong>
                <div className="production-two">
                  <label>
                    Início (s)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.start}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          cuts: document.cuts.map((cut, j) =>
                            i === j
                              ? { ...cut, start: Number(e.target.value) }
                              : cut,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Fim (s)
                    <input
                      type="number"
                      step="0.01"
                      value={c.end}
                      disabled={!editable}
                      onChange={(e) =>
                        edit({
                          ...document,
                          cuts: document.cuts.map((cut, j) =>
                            i === j
                              ? { ...cut, end: Number(e.target.value) }
                              : cut,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <p>{c.reason}</p>
                <button
                  className="btn"
                  disabled={!editable}
                  onClick={() =>
                    edit({
                      ...document,
                      cuts: document.cuts.filter((_c, j) => i !== j),
                    })
                  }
                >
                  Retirar trecho da edição
                </button>
              </div>
            ))}
            <details>
              <summary>
                Transcrição e legendas ({document.transcript.length} trechos)
              </summary>
              {document.transcript.map((s, i) => (
                <label key={i}>
                  {s.start.toFixed(2)}–{s.end.toFixed(2)} s
                  <textarea
                    rows={2}
                    disabled={!editable}
                    value={s.text}
                    onChange={(e) =>
                      edit({
                        ...document,
                        transcript: document.transcript.map((t, j) =>
                          i === j ? { ...t, text: e.target.value } : t,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </details>
          </div>
        </div>
      )}
      <label>
        Legenda da publicação
        <textarea
          rows={3}
          disabled={!editable}
          maxLength={6000}
          value={document.caption}
          onChange={(e) => edit({ ...document, caption: e.target.value })}
        />
      </label>
      <div className="production-render">
        <p>
          Prévia para revisão da equipe: confira a copy, as alegações médicas e,
          no vídeo, a fala e o contexto dos cortes antes de publicar.
        </p>
        <button
          className="btn production-primary"
          disabled={
            !workerReady ||
            !capabilities.production_render ||
            busy ||
            (document.format === "reels" &&
              (!document.cuts.length ||
                (!!document.motionRequested &&
                  (!document.motion || !capabilities.production_motion)))) ||
            (document.format === "carrossel" && faithful && !fullReady)
          }
          onClick={() => run.mutate("production_render")}
        >
          {run.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Clapperboard size={16} />
          )}
          Gerar prévia / exportação
        </button>
        <small>
          {document.format === "carrossel" && faithful && !fullReady
            ? "Aplique a arte de todas as páginas para exportar o carrossel completo mantendo o modelo."
            : "Renderiza a revisão salva. Alterações posteriores exigem uma nova prévia."}
        </small>
      </div>
      {output?.result.document && (
        <div className="production-proposal">
          <h3>Proposta de edição pronta</h3>
          {output.result.document.format === "reels" && (
            <p>
              {output.result.document.cuts.length} cortes ·{" "}
              {output.result.document.cuts
                .reduce((n, c) => n + c.end - c.start, 0)
                .toFixed(1)}{" "}
              segundos · leitura visual amostral
            </p>
          )}
          <button
            className="btn"
            disabled={!editable || busy}
            onClick={() => {
              edit(productionDocumentSchema.parse(output.result.document));
              setNotice(
                "Proposta aplicada ao editor. Revise os cortes e gere uma prévia.",
              );
            }}
          >
            Aplicar proposta ao editor
          </button>
        </div>
      )}
      <div className="production-results">
        {currentOutputs.map((o) => (
          <div key={o.job_id}>
            <p>
              <b>
                {o.kind === "production_render"
                  ? "Exportação"
                  : o.kind === "production_image"
                    ? o.result.reference_slides
                      ? "Arte completa para conferência"
                      : "Imagem proposta"
                    : "Análise da gravação"}
              </b>{" "}
              · revisão {o.revision}
            </p>
            {o.result.warnings?.map((warning, i) => (
              <p className="production-note" key={i}>
                {warning}
              </p>
            ))}
            {!!o.result.reference_slides?.length &&
              document.format === "carrossel" && (
                <>
                  <p className="production-note">
                    Conferência automática de texto, composição e identidade.
                    Revise visualmente; a aprovação continua com a equipe.
                  </p>
                  <button
                    className="btn"
                    disabled={
                      !editable ||
                      busy ||
                      !o.result.reference_slides.some(
                        (c) =>
                          referenceApproved(c.quality) &&
                          document.slides[c.slide_index]?.copy === c.copy,
                      )
                    }
                    onClick={() => {
                      edit(
                        applyReferenceSlides(
                          document,
                          o.result.reference_slides!.filter(
                            (c) =>
                              referenceApproved(c.quality) &&
                              document.slides[c.slide_index]?.copy === c.copy,
                          ),
                        ),
                      );
                      setNotice(
                        "Artes aplicadas. A exportação preservará as imagens completas, sem recompor o layout.",
                      );
                    }}
                  >
                    Aplicar artes conferidas (
                    {
                      o.result.reference_slides.filter(
                        (c) =>
                          referenceApproved(c.quality) &&
                          document.slides[c.slide_index]?.copy === c.copy,
                      ).length
                    }
                    /{o.result.reference_slides.length})
                  </button>
                </>
              )}
            {(o.result.media_ids || []).map((id) => {
              const m = detail.data?.media.find((m) => m.id === id),
                url = urls[`production:${id}`],
                candidate = o.result.reference_slides?.find(
                  (c) => c.media_id === id,
                );
              if (!m || !url || m.purpose === "frame") return null;
              return (
                <div className="production-result" key={id}>
                  {m.mime.startsWith("image/") && (
                    <img src={url} alt="Peça produzida para revisão" />
                  )}
                  {m.mime.startsWith("video/") && (
                    <video
                      controls
                      preload="metadata"
                      src={url}
                      aria-label="Prévia da edição"
                    />
                  )}
                  <a
                    className="btn"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={14} />
                    {m.purpose === "archive"
                      ? "Baixar carrossel ZIP"
                      : m.purpose === "subtitle"
                        ? "Baixar legendas SRT"
                        : "Abrir arquivo"}
                  </a>
                  {candidate && document.format === "carrossel" && (
                    <>
                      <small>
                        Slide {candidate.slide_index + 1} · texto{" "}
                        {candidate.quality.text_matches
                          ? "conferido"
                          : "divergente"}{" "}
                        · modelo{" "}
                        {candidate.quality.layout_preserved &&
                        candidate.quality.identity_preserved
                          ? "preservado na análise"
                          : "precisa de ajuste"}
                      </small>
                      {!referenceApproved(candidate.quality) && (
                        <p role="alert">
                          Revise e gere outra prévia.{" "}
                          {candidate.quality.issues.join(" ")}
                        </p>
                      )}
                      <button
                        className="btn"
                        disabled={
                          !editable ||
                          busy ||
                          !referenceApproved(candidate.quality) ||
                          document.slides[candidate.slide_index]?.copy !==
                            candidate.copy
                        }
                        onClick={() => {
                          edit(applyReferenceSlides(document, [candidate]));
                          setSlide(candidate.slide_index);
                        }}
                      >
                        Aplicar arte ao slide {candidate.slide_index + 1}
                      </button>
                    </>
                  )}
                  {!candidate &&
                    m.purpose === "image" &&
                    document.format === "carrossel" &&
                    editable && (
                      <button
                        className="btn"
                        onClick={() =>
                          edit(
                            applySlideImage(document, slide, {
                              origin: "production",
                              id,
                            }),
                          )
                        }
                      >
                        Aplicar ao slide {slide + 1}
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <details>
        <summary>Revisões anteriores e recuperação</summary>
        {detail.data?.revisions.map((r) => (
          <button
            className="btn"
            key={r.id}
            disabled={!editable || busy}
            onClick={() => {
              edit(r.document);
              setNotice(
                `Conteúdo da revisão ${r.revision} recuperado como nova edição.`,
              );
            }}
          >
            Recuperar revisão {r.revision}
          </button>
        ))}
      </details>
      <details>
        <summary>Cuidados desta peça</summary>
        <ul>
          {document.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SlidePreview({
  document,
  slide,
  urls,
}: {
  document: Extract<ProductionDocument, { format: "carrossel" }>;
  slide: number;
  urls: Record<string, string>;
}) {
  const index = Math.min(slide, document.slides.length - 1),
    layout = slideLayout(document, index);
  const current = document.slides[index];
  if (
    current.renderMode === "reference" &&
    (current.renderedCopy !== current.copy ||
      !current.image ||
      !urls[mediaKey(current.image)])
  )
    return (
      <div className="production-overflow" role="alert">
        {current.renderedCopy !== current.copy
          ? "A copy mudou. Gere uma nova arte antes de exportar este slide."
          : "Carregando a arte privada do slide…"}
      </div>
    );
  if (layout.overflow)
    return (
      <div className="production-overflow" role="alert">
        O texto não cabe no slide {index + 1}. Reduza a fonte ou ajuste a copy.
        A exportação ficará bloqueada até corrigir.
      </div>
    );
  const svg = renderSlideSvg(document, index, (r) => urls[mediaKey(r)] || null);
  // Markup exclusivo do template local: conteúdo textual escapa XML e URLs vêm do Storage autenticado.
  // SVG inline permite carregar as imagens privadas assinadas; SVG em <img> bloquearia subrecursos.
  return (
    <div
      className="production-slide"
      role="img"
      aria-label={`Prévia do slide ${index + 1}: ${document.slides[index].copy}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
