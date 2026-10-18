import type { CreativeAnalysis } from "./contracts";

type Transcript = CreativeAnalysis["transcript"];

/** Somente a fala reconhecida no áudio; nunca usa a descrição de uma cena. */
export function spokenScript(transcript: Transcript) {
  return transcript.map((s) => s.text.trim()).filter(Boolean).join(" ");
}

/** Um segmento que cruza a borda continua inteiro, com seus tempos originais. */
export function speechInRange(
  transcript: Transcript,
  start: number,
  end: number,
) {
  return transcript.filter((s) => s.end > start && s.start < end);
}

/** Os índices ligam a análise visual à fala sem resumir ou duplicar a fonte. */
export function reelScriptReference(
  analysis: Pick<CreativeAnalysis, "transcript" | "result">,
) {
  return {
    available: !!spokenScript(analysis.transcript),
    segments: analysis.transcript.map((s, index) => ({ index, ...s })),
    blocks: analysis.result.scenes.map((scene, i) => ({
      original_position: i + 1,
      transcript_indices: analysis.transcript.flatMap((s, index) =>
        s.end > scene.start && s.start < scene.end ? [index] : [],
      ),
    })),
  };
}

export function reelScriptInstructions(
  analysis: Pick<CreativeAnalysis, "transcript" | "result">,
) {
  const reference = reelScriptReference(analysis);
  return `ROTEIRO FALADO ORIGINAL — transcrição do áudio, em ordem, com as palavras reconhecidas e seus tempos: ${JSON.stringify(reference)}.
Esta é a fonte primária da fala. scene.narration é uma análise e pode resumir a cena; não a trate como transcrição literal. on_screen_text é texto visual, não fala confirmada. Leia TODOS os segmentos antes de adaptar. Os transcript_indices de cada bloco apontam para segmentos completos; um segmento que cruza dois blocos aparece na fonte apenas uma vez. Preserve a continuidade do argumento, a relação entre pergunta e resposta e o encerramento; não repita uma fala por ela cruzar a borda de um bloco. Adapte o texto falado para o novo tema e o Brand Brain, usando a estrutura como referência. Não apenas descreva o que a pessoa deveria dizer: cada copy deve conter as palavras que a pessoa vai falar. Não copie expressão autoral de terceiros. Se available=false, a fala original está indisponível: não a reconstrua a partir da descrição visual e registre essa lacuna nas mudanças justificadas.\n`;
}
