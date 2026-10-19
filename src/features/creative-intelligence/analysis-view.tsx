import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Layers, Film, Fingerprint, ShieldCheck } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import {
  COVERAGE_LABEL,
  type CreativeAnalysis,
  type CreativeAsset,
  type CreativeSource,
} from "@/lib/creative-intelligence/contracts";
import { signedAsset } from "./data";
import { supabase } from "@/integrations/supabase/client";
import { BotaoCopiar } from "@/components/botao-copiar";

/** Copy inteira do carrossel: texto de todos os slides, em ordem, mais a legenda completa da publicação. */
function CopyCompleta({ analysis, source }: { analysis: CreativeAnalysis; source: CreativeSource }) {
  const legenda = useQuery({
    queryKey: ["creative-legenda", source.post_id],
    enabled: !!source.post_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("instagram_posts").select("caption").eq("id", source.post_id!).maybeSingle();
      if (error) throw error;
      return (data?.caption as string | null) ?? null;
    },
  });
  const slides = [...analysis.result.slides].sort((a, b) => a.position - b.position);
  const textoLegenda = source.post_id ? legenda.data ?? "" : source.title;
  const tudo = [
    ...slides.map((s) => `Slide ${s.position}\n${s.copy.full_text || "(sem texto legível)"}`),
    textoLegenda ? `Legenda\n${textoLegenda}` : "",
  ].filter(Boolean).join("\n\n");
  return (
    <Painel icone={FileText} titulo="Copy completa do carrossel" resumo={`Texto de todos os ${slides.length} slides, na ordem, e a legenda da publicação.`}>
      <div className="mb-3"><BotaoCopiar texto={tudo} rotulo="Copiar copy inteira" /></div>
      <ol className="space-y-3">
        {slides.map((s) => (
          <li key={s.position} className="text-sm">
            <span className="font-semibold">Slide {s.position}</span>
            <p className="mt-1 whitespace-pre-wrap">{s.copy.full_text || "Nenhum texto legível identificado."}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="font-semibold">Legenda</span>
        <p className="mt-1 whitespace-pre-wrap">{legenda.isLoading ? "Carregando legenda…" : textoLegenda || "Publicação sem legenda."}</p>
      </div>
    </Painel>
  );
}

export function PrivateAsset({
  asset,
  video = false,
}: {
  asset: CreativeAsset;
  video?: boolean;
}) {
  const q = useQuery({
    queryKey: ["creative-asset", asset.client_id, asset.account_id, asset.id],
    queryFn: () => signedAsset(asset),
    staleTime: 180_000,
    refetchInterval: 180_000,
    gcTime: 240_000,
    retry: false,
  });
  if (q.isError)
    return (
      <p className="note">
        Arquivo privado indisponível. Reabra a análise para renovar o acesso.
      </p>
    );
  if (!q.data)
    return (
      <div
        className="min-h-28 animate-pulse rounded-lg"
        style={{ background: "var(--surface-2)" }}
        aria-label="Carregando arquivo privado"
      />
    );
  return video ? (
    <video
      className="max-h-[540px] w-full rounded-lg"
      src={q.data}
      controls
      preload="metadata"
      aria-label="Vídeo original"
    />
  ) : (
    <img
      className="mx-auto max-h-[600px] w-full rounded-lg object-contain"
      src={q.data}
      alt={`Evidência original ${asset.kind === "frame" ? `em ${asset.time_seconds}s` : `do slide ${asset.position}`}`}
      loading="lazy"
    />
  );
}
export function FactList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul
        className="list-disc space-y-1 pl-4 text-sm"
        style={{ color: "var(--text-dim)" }}
      >
        {items.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    </div>
  );
}
export function AnalysisView({
  analysis,
  source,
  assets,
}: {
  analysis: CreativeAnalysis;
  source: CreativeSource;
  assets: CreativeAsset[];
}) {
  const [position, setPosition] = useState(1),
    [sceneIndex, setSceneIndex] = useState(0);
  const c = analysis.coverage,
    r = analysis.result,
    slide = r.slides.find((s) => s.position === position) ?? r.slides[0],
    scene = r.scenes[sceneIndex] ?? r.scenes[0];
  const original = assets.find((a) => a.kind === "video"),
    image = assets.find((a) => a.id === slide?.asset_id),
    frame = scene
      ? assets.find((a) => scene.evidence_asset_ids.includes(a.id))
      : null;
  return (
    <div className="space-y-5">
      <Painel
        icone={ShieldCheck}
        titulo="O que foi efetivamente analisado"
        resumo="A cobertura é calculada pelos arquivos e etapas concluídas."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Selo cor={c.status === "completa" ? "var(--good)" : "var(--warn)"}>
            {COVERAGE_LABEL[c.status]}
          </Selo>
          <a
            href={source.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Ver publicação original
          </a>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {analysis.model} · {analysis.version} · US${" "}
            {Number(analysis.cost_usd).toFixed(4)}
          </span>
        </div>
        <dl className="my-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt>Arquivos obtidos</dt>
            <dd className="text-xl font-semibold">
              {c.acquired_assets} / {c.expected_assets ?? "não confirmado"}
            </dd>
          </div>
          <div>
            <dt>Itens analisados</dt>
            <dd className="text-xl font-semibold">{c.analysed_assets}</dd>
          </div>
          <div>
            <dt>Duração processada</dt>
            <dd className="text-xl font-semibold">
              {c.duration_seconds === null
                ? "—"
                : `${c.duration_seconds.toFixed(1)}s`}
            </dd>
          </div>
          <div>
            <dt>Confiança do modelo</dt>
            <dd className="text-xl font-semibold">
              {Math.round(r.confidence * 100)}%
            </dd>
          </div>
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactList title="Componentes ausentes" items={c.missing} />
          <FactList title="Limites da leitura" items={c.limitations} />
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          Confiança declarada pelo modelo; não é validação estatística nem
          comprovação clínica.
        </p>
      </Painel>
      {r.format === "carrossel" && r.slides.length > 0 && <CopyCompleta analysis={analysis} source={source} />}
      {r.format === "carrossel" && slide ? (
        <Painel icone={Layers} titulo="Carrossel · leitura por slide">
          <div
            className="mb-4 flex flex-wrap gap-2"
            aria-label="Selecionar slide"
          >
            {r.slides.map((s) => (
              <button
                className="btn"
                key={s.position}
                type="button"
                aria-pressed={s.position === slide.position}
                onClick={() => setPosition(s.position)}
              >
                Slide {s.position}
              </button>
            ))}
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div>
              {image ? (
                <PrivateAsset asset={image} />
              ) : (
                <p>Arquivo não disponível nesta versão.</p>
              )}
            </div>
            <div className="space-y-4">
              <Selo>{slide.copy.narrative_role}</Selo>
              <div>
                <h3 className="font-semibold">Texto extraído da imagem</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {slide.copy.full_text || "Nenhum texto legível identificado."}
                </p>
              </div>
              <FactList
                title="Hierarquia textual"
                items={slide.copy.hierarchy}
              />
              <FactList
                title="Construção persuasiva"
                items={slide.copy.persuasive_elements}
              />
              <div>
                <h4 className="font-semibold">Composição para o designer</h4>
                <p className="mt-1 text-sm">{slide.visual.designer_brief}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="text-sm">
                  <b>Tipografia aproximada</b>
                  <p>{slide.visual.typography}</p>
                </div>
                <div className="text-sm">
                  <b>Cor e contraste</b>
                  <p>
                    {slide.visual.palette.join(" · ")} · {slide.visual.contrast}
                  </p>
                </div>
              </div>
              <FactList
                title="Incertezas"
                items={[
                  ...slide.copy.extraction_uncertainties,
                  ...slide.uncertainties,
                ]}
              />
            </div>
          </div>
        </Painel>
      ) : null}
      {r.format === "reels" ? (
        <Painel icone={Film} titulo="Reels · fala, cenas e edição">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              {original ? (
                <PrivateAsset asset={original} video />
              ) : (
                <p>Vídeo original indisponível.</p>
              )}
              <div
                className="mt-4 max-h-80 space-y-3 overflow-auto"
                aria-label="Transcrição temporal"
              >
                {analysis.transcript.map((s, i) => (
                  <p key={i} className="text-sm">
                    <b>
                      {s.start.toFixed(1)}–{s.end.toFixed(1)}s
                    </b>{" "}
                    {s.text}
                  </p>
                ))}
                {!analysis.transcript.length && (
                  <p className="note">
                    Nenhuma fala transcrita. Confira os limites e a presença de
                    áudio.
                  </p>
                )}
              </div>
            </div>
            <div>
              {scene ? (
                <>
                  <label className="block text-sm font-semibold">
                    Bloco do vídeo
                    <select
                      className="field mt-2 w-full"
                      value={sceneIndex}
                      onChange={(e) => setSceneIndex(Number(e.target.value))}
                    >
                      {r.scenes.map((s, i) => (
                        <option key={i} value={i}>
                          {s.start.toFixed(1)}–{s.end.toFixed(1)}s ·{" "}
                          {s.narrative_role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="my-3">
                    {frame && <PrivateAsset asset={frame} />}
                  </div>
                  <dl className="space-y-3 text-sm">
                    {[
                      ["Texto na tela", scene.on_screen_text],
                      ["Take e câmera", `${scene.shot} · ${scene.camera}`],
                      ["Edição observada", scene.editing],
                      ["Transições", scene.transitions],
                      [
                        "Relação entre imagem e fala",
                        scene.visual.image_text_relationship,
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-semibold">{k}</dt>
                        <dd>{v || "Não identificado com segurança."}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4">
                    <FactList
                      title="Incertezas do bloco"
                      items={scene.uncertainties}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </Painel>
      ) : null}
      <Painel icone={Fingerprint} titulo="DNA de conteúdo" resumo={r.summary}>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-4">
            <h3 className="font-semibold">Copy e narrativa</h3>
            <p className="text-sm">{r.dna.hook_pattern}</p>
            <FactList title="Progressão" items={r.dna.narrative_sequence} />
            <FactList title="Retenção" items={r.dna.retention_techniques} />
            <p className="text-sm">
              <b>CTA:</b> {r.dna.cta_pattern}
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="font-semibold">Sistema visual</h3>
            <p className="text-sm">{r.dna.visual_system.designer_brief}</p>
            <FactList
              title="Hierarquia"
              items={r.dna.visual_system.hierarchy}
            />
            <FactList title="Edição" items={r.dna.editing_pattern} />
          </div>
          <div className="space-y-4">
            <h3 className="font-semibold">O que reutilizar</h3>
            <FactList
              title="Princípios estruturais"
              items={r.dna.reusable_principles}
            />
            <FactList
              title="Elementos do tema original"
              items={r.dna.theme_specific_elements}
            />
            <FactList title="Incertezas" items={r.dna.uncertainties} />
          </div>
        </div>
      </Painel>
      <Painel icone={FileText} titulo="Revisão médica">
        <FactList title="Pontos a revisar" items={r.medical_review_flags} />
        <p className="mt-2 text-sm">
          A análise descreve o conteúdo de referência e não verifica, por si só,
          a validade científica das alegações.
        </p>
      </Painel>
    </div>
  );
}
