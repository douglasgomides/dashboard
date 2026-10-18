import { FileText } from "lucide-react";
import { BotaoCopiar } from "@/components/botao-copiar";
import { Painel } from "@/components/visual";
import type { CreativeAnalysis } from "@/lib/creative-intelligence/contracts";
import { spokenScript } from "@/lib/creative-intelligence/reference-script";

export function ReferenceScript({
  transcript,
}: {
  transcript: CreativeAnalysis["transcript"];
}) {
  const text = spokenScript(transcript);
  return (
    <Painel
      icone={FileText}
      titulo="Roteiro falado original"
      resumo="As palavras extraídas do áudio do Reel, na ordem em que foram ditas."
    >
      {text ? (
        <>
          <p
            className="whitespace-pre-wrap text-base leading-relaxed"
            aria-label="Fala completa do Reel original"
          >
            {text}
          </p>
          <div className="mt-4">
            <BotaoCopiar texto={text} rotulo="Copiar roteiro original completo" />
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Transcrição automática. Confira nomes e termos no áudio antes de adaptar.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Conferir falas com tempos ({transcript.length} trechos)
            </summary>
            <div className="mt-3 space-y-3" aria-label="Transcrição temporal">
              {transcript.map((s, i) => (
                <p key={i} className="text-sm">
                  <b>{s.start.toFixed(1)}–{s.end.toFixed(1)}s</b>{" "}{s.text}
                </p>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="note">
          A fala original está indisponível nesta análise. Confira se o vídeo tem
          áudio e se a transcrição foi concluída. Descrições de cenas e textos na
          tela continuam na análise visual.
        </p>
      )}
    </Painel>
  );
}
