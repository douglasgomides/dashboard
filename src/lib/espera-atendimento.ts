// Tempo de espera do WhatsApp com o rótulo do que ele é (auditoria 2 de 01/11/2026).
//
// - "1ª resposta": da 1ª mensagem do paciente até a 1ª mensagem de uma pessoa da clínica, calculada pelas mensagens
//   (wts_resumo.espera_*; WTS e Digisac). Só aparece com pelo menos LIMITES.amostra.conversas.esperaMedida atendimentos
//   medidos: antes, 1 atendimento em 50 virava "Rápido" e "metade dos pacientes" (Dra. Rafaela).
// - "Tempo na fila (WTS)": o timeWait da WTS (wts_resumo.fila_*). A doc da Helena não define o campo e ele NÃO é o tempo
//   até a 1ª resposta (na Dra. Juliana Paola dava metade do real). Mostrado só quando a 1ª resposta não tem amostra, com
//   esse nome e o aviso.
// - Nada disso: "não medido" (sem nenhum) ou "amostra pequena" (alguns, menos que o mínimo).
import { LIMITES } from "./limites.js";

export interface ResumoEspera {
  atendimentos?: number | null;
  espera_mediana_seg?: number | null;
  espera_cobertura?: number | null;
  fila_mediana_seg?: number | null;
  fila_cobertura?: number | null;
}

export type Espera =
  | { tipo: "resposta"; seg: number; medidos: number; total: number; rotulo: string; nota: string }
  | { tipo: "fila"; seg: number; medidos: number; total: number; rotulo: string; nota: string; respostaMedidos: number }
  | { tipo: "sem"; seg: null; medidos: number; total: number; rotulo: string; nota: string };

export const AMOSTRA_ESPERA = LIMITES.amostra.conversas.esperaMedida;
export const ROTULO_RESPOSTA = "Espera até a 1ª resposta";
export const ROTULO_FILA = "Tempo na fila (medido pela WTS)";
export const NOTA_FILA = "É o tempo de espera que a WTS calcula (timeWait). A WTS não define o que ele mede e ele não é o tempo até a 1ª resposta.";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const temValor = (v: unknown) => v !== null && v !== undefined && Number.isFinite(Number(v));

export function esperaDoAtendimento(r: ResumoEspera | null | undefined, minimo: number = AMOSTRA_ESPERA): Espera {
  const total = num(r?.atendimentos);
  const medidos = num(r?.espera_cobertura);
  if (temValor(r?.espera_mediana_seg) && medidos >= minimo) {
    return { tipo: "resposta", seg: num(r?.espera_mediana_seg), medidos, total, rotulo: ROTULO_RESPOSTA, nota: `mediana de ${medidos.toLocaleString("pt-BR")} atendimentos medidos pelas mensagens${total > medidos ? `, de ${total.toLocaleString("pt-BR")}` : ""}` };
  }
  const fila = num(r?.fila_cobertura);
  if (temValor(r?.fila_mediana_seg) && fila >= minimo) {
    return { tipo: "fila", seg: num(r?.fila_mediana_seg), medidos: fila, total, rotulo: ROTULO_FILA, nota: `${NOTA_FILA} 1ª resposta ${medidos > 0 ? `medida em só ${medidos.toLocaleString("pt-BR")} atendimento${medidos === 1 ? "" : "s"} (mínimo ${minimo})` : "ainda não medida"}.`, respostaMedidos: medidos };
  }
  return {
    tipo: "sem", seg: null, medidos, total, rotulo: ROTULO_RESPOSTA,
    nota: medidos > 0 ? `amostra pequena: ${medidos.toLocaleString("pt-BR")} atendimento${medidos === 1 ? "" : "s"} medido${medidos === 1 ? "" : "s"} (mínimo ${minimo})` : "não medido",
  };
}

/** Só a 1ª resposta com amostra (para selo de "rápido/lento", metas e frases sobre o paciente). null nos outros casos. */
export function primeiraRespostaConfiavel(r: ResumoEspera | null | undefined, minimo: number = AMOSTRA_ESPERA): number | null {
  const e = esperaDoAtendimento(r, minimo);
  return e.tipo === "resposta" ? e.seg : null;
}
