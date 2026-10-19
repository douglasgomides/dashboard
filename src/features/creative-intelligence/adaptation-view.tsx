import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns2, CalendarPlus, Link2, ImagePlus, Loader2 } from "lucide-react";
import { gerarArtes, listarArtes, revisarArte } from "./data";
import { Painel, Selo } from "@/components/visual";
import type {
  CreativeAdaptation,
  CreativeAnalysis,
  CreativeAsset,
} from "@/lib/creative-intelligence/contracts";
import { PrivateAsset, FactList } from "./analysis-view";

export function AdaptationView({
  adaptation,
  analysis,
  assets,
  posts,
  editable,
  busy,
  onPlanner,
  onLink,
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
}) {
  const [selected, setSelected] = useState(1),
    [postId, setPostId] = useState("");
  const doc = adaptation.document,
    unit = doc.units.find((u) => u.position === selected) ?? doc.units[0];
  const slide = analysis?.result.slides.find(
      (s) => s.position === unit.original_position,
    ),
    scene = analysis?.result.scenes[unit.original_position - 1];
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
        <Selo>Proposta para revisão</Selo>
        <Selo>
          {adaptation.published_post_id
            ? "Publicação vinculada"
            : adaptation.pauta_id
              ? "Pauta no planejador"
              : "Ainda não publicada"}
        </Selo>
      </div>
      {doc.format === "carrossel" && (
        <ArtesSlides clientId={adaptation.client_id} adaptacaoId={adaptation.id} total={doc.units.length} editable={editable} />
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
            Original · {unit.original_position}
          </h3>
          {evidence && <PrivateAsset asset={evidence} />}
          <p className="mt-3 whitespace-pre-wrap text-sm">
            {slide?.copy.full_text ||
              scene?.narration ||
              "Confira a análise original."}
          </p>
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

/** Arte dos slides: gera como rascunho, mostra lado a lado e deixa a equipe aprovar ou descartar. */
function ArtesSlides({ clientId, adaptacaoId, total, editable }: { clientId: string; adaptacaoId: string; total: number; editable: boolean }) {
  const qc = useQueryClient();
  const chave = ["creative-artes", clientId, adaptacaoId];
  const q = useQuery({ queryKey: chave, queryFn: () => listarArtes(clientId, adaptacaoId), staleTime: 300_000 });
  const [gerando, setGerando] = useState<number[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  async function gerar(slides?: number[]) {
    setGerando(slides ?? Array.from({ length: total }, (_, i) => i + 1));
    setAviso(null);
    try {
      const r = await gerarArtes(clientId, adaptacaoId, slides);
      setAviso(r.erros.length ? `${r.geradas} arte(s) prontas. Falharam: ${r.erros.join(" · ")}` : `${r.geradas} arte(s) prontas para revisão.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(null);
      await qc.invalidateQueries({ queryKey: chave });
    }
  }
  async function revisar(id: string, status: "aprovada" | "descartada") {
    try { await revisarArte(clientId, id, status); } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
    await qc.invalidateQueries({ queryKey: chave });
  }
  const artes = q.data ?? [];
  return (
    <section className="mb-5 rounded-lg border p-3" style={{ borderColor: "var(--border)" }} aria-label="Arte dos slides">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold"><ImagePlus size={16} aria-hidden /> Arte dos slides (rascunho)</h3>
        {editable && (
          <button className="btn" type="button" disabled={!!gerando} onClick={() => gerar()}>
            {gerando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
            {gerando ? `Gerando ${gerando.length} arte(s)… pode levar 1 a 3 min` : artes.length ? "Gerar todas de novo" : `Gerar arte dos ${total} slides`}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Rascunho feito por IA a partir do briefing de cada slide. Revise texto e imagem (CFM) antes de usar. Custo aproximado de US$ 0,06 por arte, com teto diário por clínica.
      </p>
      {aviso && <p className="mt-2 text-sm" role="status">{aviso}</p>}
      {q.isError && <p className="mt-2 text-sm" style={{ color: "var(--crit)" }}>Não consegui carregar as artes.</p>}
      {artes.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {artes.map((a) => (
            <figure key={a.id} className="space-y-1.5">
              <a href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={`Arte do slide ${a.position}`} className="w-full rounded-md border" style={{ borderColor: "var(--border)" }} loading="lazy" /></a>
              <figcaption className="flex flex-wrap items-center gap-1.5 text-xs">
                <Selo cor={a.status === "aprovada" ? "var(--good)" : "var(--warn)"}>Slide {a.position} · {a.status === "aprovada" ? "aprovada" : "rascunho"}</Selo>
                {editable && a.status !== "aprovada" && <button type="button" className="underline" onClick={() => revisar(a.id, "aprovada")}>Aprovar</button>}
                {editable && <button type="button" className="underline" disabled={!!gerando} onClick={() => gerar([a.position])}>Refazer</button>}
                {editable && <button type="button" className="underline" style={{ color: "var(--muted)" }} onClick={() => revisar(a.id, "descartada")}>Descartar</button>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
