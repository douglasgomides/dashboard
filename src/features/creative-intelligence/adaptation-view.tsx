import { useState } from "react";
import { Columns2, CalendarPlus, Link2 } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import type {
  CreativeAdaptation,
  CreativeAnalysis,
  CreativeAsset,
} from "@/lib/creative-intelligence/contracts";
import { PrivateAsset, FactList } from "./analysis-view";
import { BotaoCopiar } from "@/components/botao-copiar";
import { speechInRange, spokenScript } from "@/lib/creative-intelligence/reference-script";

export function AdaptationView({
  adaptation,
  analysis,
  assets,
  posts,
  editable,
  busy,
  onPlanner,
  onLink,
  onProduce,
}: {
  adaptation: CreativeAdaptation;
  analysis?: CreativeAnalysis;
  assets: CreativeAsset[];
  posts: {
    id: string;
    caption: string | null;
    posted_at: string | null;
    format: string | null;
    instagram_account_id: string;
  }[];
  editable: boolean;
  busy: boolean;
  onPlanner: () => void;
  onLink: (postId: string) => void;
  onProduce?: () => void;
}) {
  const [selected, setSelected] = useState(1),
    [postId, setPostId] = useState("");
  const doc = adaptation.document,
    unit = doc.units.find((u) => u.position === selected) ?? doc.units[0];
  const slide = analysis?.result.slides.find(
      (s) => s.position === unit.original_position,
    ),
    scene = analysis?.result.scenes[unit.original_position - 1];
  const originalSpeech = scene && analysis
      ? speechInRange(analysis.transcript, scene.start, scene.end)
      : [],
    adaptedScript = doc.units.map((u) => u.copy).join("\n\n");
  const evidence =
    assets.find((a) => a.id === slide?.asset_id) ||
    assets.find((a) => scene?.evidence_asset_ids.includes(a.id));
  const options = posts.filter(
    (p) =>
      p.instagram_account_id === adaptation.account_id &&
      p.format === doc.format &&
      p.posted_at &&
      Date.parse(p.posted_at) >= Date.parse(adaptation.created_at),
  );
  return (
    <Painel
      icone={Columns2}
      titulo={doc.title}
      resumo={`Novo tema: ${doc.theme} · Objetivo: ${doc.objective}`}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {onProduce && <button type="button" className="btn" onClick={onProduce}>{editable ? "Produzir esta adaptação" : "Ver produção desta adaptação"}</button>}
        <Selo>Proposta para revisão</Selo>
        <Selo>
          {adaptation.published_post_id
            ? "Publicação vinculada"
            : adaptation.pauta_id
              ? "Pauta no planejador"
              : "Ainda não publicada"}
        </Selo>
      </div>
      {doc.format === "reels" && (
        <div className="mb-5 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-semibold">Roteiro adaptado completo</h3>
          <p className="my-3 whitespace-pre-wrap text-base leading-relaxed" aria-label="Fala completa do roteiro adaptado">
            {adaptedScript}
          </p>
          <BotaoCopiar texto={adaptedScript} rotulo="Copiar roteiro adaptado completo" />
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Proposta para gravação. Revise o texto antes de produzir.
          </p>
        </div>
      )}
      <div
        className="mb-4 flex flex-wrap gap-2"
        aria-label="Selecionar unidade da adaptação"
      >
        {doc.units.map((u) => (
          <button
            className="btn"
            type="button"
            key={u.position}
            aria-pressed={u.position === unit.position}
            onClick={() => setSelected(u.position)}
          >
            {doc.format === "carrossel" ? "Slide" : "Bloco"} {u.position}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">
            {doc.format === "reels" ? "Fala original" : "Original"} · {unit.original_position}
          </h3>
          {evidence && <PrivateAsset asset={evidence} />}
          <p className="mt-3 whitespace-pre-wrap text-sm">
            {doc.format === "reels"
              ? spokenScript(originalSpeech) || "Não há fala transcrita neste bloco."
              : slide?.copy.full_text || "Confira a análise original."}
          </p>
          {doc.format === "reels" && originalSpeech.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Áudio original: {originalSpeech[0].start.toFixed(1)}–{originalSpeech.at(-1)!.end.toFixed(1)}s.
              Trechos que cruzam a borda do bloco são exibidos inteiros.
            </p>
          )}
          <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
            {unit.structural_reference}
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Adaptação · {unit.narrative_role}</h3>
          {unit.start !== null && unit.end !== null && (
            <Selo>
              {unit.start}–{unit.end}s
            </Selo>
          )}
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {unit.copy}
          </p>
          {[
            ["Briefing de imagem", unit.image_brief],
            ["Briefing de layout", unit.layout_brief],
            ["Gravação", unit.recording_brief],
            ["Edição", unit.editing_brief],
            ["Texto na tela", unit.on_screen_text],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <h4 className="text-sm font-semibold">{k}</h4>
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                  {v}
                </p>
              </div>
            ))}
          <FactList
            title="Mudanças justificadas"
            items={unit.justified_changes}
          />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Os briefings orientam a produção. Imagens e vídeo da adaptação ainda
            precisam ser produzidos.
          </p>
        </div>
      </div>
      <details
        className="my-5 rounded-lg border p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <summary className="cursor-pointer font-semibold">
          Legenda, CTA e revisão
        </summary>
        <div className="mt-3 space-y-4">
          <p className="whitespace-pre-wrap text-sm">{doc.caption}</p>
          <p>
            <b>CTA:</b> {doc.cta}
          </p>
          <FactList
            title="Princípios preservados"
            items={doc.preserved_principles}
          />
          <FactList
            title="Mudanças estruturais"
            items={doc.justified_changes}
          />
          <FactList
            title="Revisão médica e regulatória"
            items={doc.medical_review_flags}
          />
          <FactList
            title="Alegações clínicas a verificar"
            items={doc.clinical_claims_requiring_verification}
          />
        </div>
      </details>
      {editable && (
        <div className="flex flex-wrap items-end gap-3">
          <button
            className="btn"
            type="button"
            onClick={onPlanner}
            disabled={busy || !!adaptation.pauta_id}
          >
            <CalendarPlus size={15} aria-hidden />
            {adaptation.pauta_id
              ? "Já está no planejador"
              : "Enviar como pauta"}
          </button>
          {!adaptation.published_post_id && (
            <>
              <label className="min-w-0 flex-1 text-sm">
                Publicação efetiva
                <select
                  className="field mt-1 w-full"
                  value={postId}
                  onChange={(e) => setPostId(e.target.value)}
                >
                  <option value="">Selecione depois de publicar</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.posted_at?.slice(0, 10)} ·{" "}
                      {p.caption?.slice(0, 90) || p.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn"
                type="button"
                disabled={!postId || busy}
                onClick={() => onLink(postId)}
              >
                <Link2 size={15} aria-hidden />
                Vincular publicação
              </button>
            </>
          )}
        </div>
      )}
    </Painel>
  );
}
