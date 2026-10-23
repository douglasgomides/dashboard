import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns2, CalendarPlus, Link2, ImagePlus, Loader2, Download, Copy } from "lucide-react";
import { gerarArtes, listarArtes, revisarArte } from "./data";
import { Painel, Selo } from "@/components/visual";
import type {
  CreativeAdaptation,
  CreativeAnalysis,
  CreativeAsset,
} from "@/lib/creative-intelligence/contracts";
import { pendingSlides, deliveryCaption, deliveryFiles, preparePostImage } from "@/lib/creative-intelligence/delivery";
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
        <ArtesSlides clientId={adaptation.client_id} adaptacaoId={adaptation.id} doc={doc} editable={editable} />
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
            Os briefings orientam a produção. Confira acima as artes geradas para este carrossel. Roteiros de vídeo exigem gravação e edição pela equipe.
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

/** Geração em lotes pequenos: cada lote salvo aparece e uma retomada pede apenas o que falta. */
function ArtesSlides({ clientId, adaptacaoId, doc, editable }: { clientId: string; adaptacaoId: string; doc: CreativeAdaptation["document"]; editable: boolean }) {
  const qc = useQueryClient();
  const chave = ["creative-artes", clientId, adaptacaoId];
  const [gerando, setGerando] = useState<number[] | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const q = useQuery({ queryKey: chave, queryFn: () => listarArtes(clientId, adaptacaoId), staleTime: 240_000, refetchInterval: gerando ? 5000 : 240_000, retry: false, enabled: editable });
  const artes = q.data ?? [];
  const faltam = pendingSlides(doc.units, artes);
  const total = doc.units.length;
  const bloqueado = !!gerando || !!revisando || baixando;
  async function gerar(slides = faltam) {
    if (!slides.length) return;
    setGerando(slides);
    setAviso(null);
    let prontas = 0;
    try {
      for (let i = 0; i < slides.length; i += 4) {
        const lote = slides.slice(i, i + 4);
        setGerando(slides.slice(i));
        const r = await gerarArtes(clientId, adaptacaoId, lote);
        prontas += r.geradas;
        await qc.invalidateQueries({ queryKey: chave });
        if (r.erros.length) throw new Error(`${prontas} arte(s) salvas nesta solicitação. ${r.erros.join(" · ")} As artes prontas foram preservadas. Use Refazer no slide com erro ou gere os slides que faltam.`);
      }
      setAviso(`${prontas} arte(s) salvas. Confira as imagens e baixe o post com a legenda.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(null);
      await qc.invalidateQueries({ queryKey: chave });
    }
  }
  async function revisar(id: string, status: "aprovada" | "descartada") {
    setRevisando(id); setAviso(null);
    try { await revisarArte(clientId, id, status); } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
    finally { setRevisando(null); await qc.invalidateQueries({ queryKey: chave }); }
  }
  async function copiarLegenda() {
    try { await navigator.clipboard.writeText(deliveryCaption(doc)); setAviso("Legenda copiada."); }
    catch { setAviso("Não foi possível copiar. Abra ‘Legenda, CTA e revisão’ abaixo e copie o texto."); }
  }
  function salvar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = nome; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function baixar(slide?: number) {
    setBaixando(true); setAviso(null);
    try {
      // Renova as URLs privadas antes do download; um erro não dispara outra geração paga.
      const atuais = await listarArtes(clientId, adaptacaoId);
      const selecionadas = slide ? atuais.filter(a => a.position === slide) : atuais;
      if (!selecionadas.length || (!slide && pendingSlides(doc.units, atuais).length)) throw new Error("Ainda faltam artes. Gere os slides pendentes antes de baixar o post completo.");
      const imagens: { position: number; bytes: Uint8Array }[] = [];
      let bytes = 0;
      for (const a of selecionadas) {
        const response = await fetch(a.url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error("Não foi possível baixar uma das artes. Tente novamente; as imagens salvas foram preservadas.");
        const image = new Uint8Array(await response.arrayBuffer());
        bytes += image.byteLength;
        if (bytes > 100 * 1024 * 1024) throw new Error("O pacote excede 100 MB. Baixe as artes individualmente.");
        imagens.push({ position: a.position, bytes: await preparePostImage(image) });
      }
      if (slide) salvar(new Blob([imagens[0].bytes as BlobPart], { type: "image/png" }), `slide-${String(slide).padStart(2, "0")}.png`);
      else {
        const { zipSync, strToU8 } = await import("fflate");
        const files = deliveryFiles(doc, imagens);
        const entries: Record<string, Uint8Array> = { "legenda.txt": strToU8(files.caption), "revisao.txt": strToU8(files.review) };
        for (const image of files.images) entries[image.name] = image.bytes;
        salvar(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: "application/zip" }), "post-adaptado.zip");
      }
      setAviso(slide ? "Arte baixada." : "Post baixado: artes em ordem e legenda no arquivo ZIP. Revise antes de publicar.");
    } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
    finally { setBaixando(false); }
  }
  return (
    <section className="mb-5 rounded-lg border p-3" style={{ borderColor: "var(--border)" }} aria-label="Arte dos slides">
      <h3 className="flex items-center gap-1.5 font-semibold"><ImagePlus size={16} aria-hidden /> Preparar post · artes e legenda</h3>
      <p className="mt-2 text-sm" role="status">Texto adaptado · {total - faltam.length} de {total} artes prontas · {artes.filter(a => a.status === "aprovada").length} revisadas</p>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        {faltam.length ? "Falta gerar as imagens para ter o post completo. Cada lote salvo aparece abaixo; você pode retomar somente os slides pendentes." : "Artes e legenda disponíveis para baixar. Confira o texto e o enquadramento antes de publicar."}
        {" "}Download vertical para o feed (1080 × 1350 px), sem cortar o conteúdo. A geração tem orçamento reservado e teto diário por clínica. A geração tem custo e pode levar alguns minutos. Nada é publicado automaticamente.
      </p>
      {editable && <div className="mt-3 flex flex-wrap gap-2">
        {!!faltam.length && <button className="btn" type="button" disabled={bloqueado || q.isPending || q.isError} onClick={() => gerar()}>
          {gerando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
          {gerando ? `Gerando artes · ${gerando.length} pendentes…` : artes.length ? `Gerar ${faltam.length} arte(s) que faltam` : `Gerar arte dos ${total} slides`}
        </button>}
        {!faltam.length && <button className="btn" type="button" disabled={bloqueado || q.isPending || q.isError} onClick={() => gerar(doc.units.map(u => u.position))}>
          {gerando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
          {gerando ? `Refazendo artes · ${gerando.length} pendentes…` : "Refazer todas as artes"}
        </button>}
        <button className="btn" type="button" disabled={bloqueado || q.isPending || q.isError || !!faltam.length} onClick={() => baixar()}><Download size={15} aria-hidden />{baixando ? "Preparando download…" : "Baixar post (artes + legenda)"}</button>
        <button className="btn" type="button" onClick={() => copiarLegenda()}><Copy size={15} aria-hidden />Copiar legenda</button>
      </div>}
      {!editable && <p className="mt-2 text-sm">A equipe Doctor Creator prepara e revisa as artes desta proposta.</p>}
      {aviso && <p className="mt-2 text-sm" role="status">{aviso}</p>}
      {q.isError && <div role="alert" className="mt-2 text-sm"><p style={{ color: "var(--crit)" }}>Não consegui carregar as artes. Confira as imagens existentes antes de solicitar uma nova geração.</p><button type="button" className="btn" disabled={q.isFetching} onClick={() => void q.refetch()}>Carregar artes novamente</button></div>}
      {artes.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {artes.map((a) => (
            <figure key={a.id} className="space-y-1.5">
              <a href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={`Arte do slide ${a.position}`} className="w-full rounded-md border" style={{ borderColor: "var(--border)" }} loading="lazy" /></a>
              <figcaption className="flex flex-wrap items-center gap-1.5 text-xs">
                <Selo cor={a.status === "aprovada" ? "var(--good)" : "var(--warn)"}>Slide {a.position} · {a.status === "aprovada" ? "aprovada" : "rascunho"}</Selo>
                {editable && a.status !== "aprovada" && <button type="button" className="underline" disabled={bloqueado} onClick={() => revisar(a.id, "aprovada")}>Aprovar</button>}
                {editable && <button type="button" className="underline" disabled={bloqueado} onClick={() => baixar(a.position)}>Baixar slide {a.position}</button>}
                {editable && <button type="button" className="underline" disabled={bloqueado} onClick={() => gerar([a.position])}>Refazer</button>}
                {editable && <button type="button" className="underline" disabled={bloqueado} style={{ color: "var(--muted)" }} onClick={() => revisar(a.id, "descartada")}>Descartar</button>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
