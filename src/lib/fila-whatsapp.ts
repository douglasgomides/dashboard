// Fila do WhatsApp (WTS) com o dado do próprio cliente (RPC wts_fila_do_cliente).
//
// Auditoria de 30/10/2026: "Em andamento agora" contava conversas antigas nunca encerradas (Dra. Marcella: 462 em
// outubro, 353 abertas havia mais de 7 dias), e a tela tinha texto fixo de outro cliente ("as duas médicas", "216
// conversas fechadas no mesmo minuto"). Os avisos agora saem do dado de cada cliente e só aparecem quando valem.

export interface FilaWhatsapp {
  abertas7d: number;
  abertasAntigas: number;
  encerradas: number;
  maiorLote: number;
  encerradasEmLote: number;
  contaCompartilhadaCom: string[];
}

// Encerramento em lote: 5 ou mais conversas fechadas no mesmo minuto.
export const LOTE_MIN_CONVERSAS = 5;
// O aviso de lote só aparece quando pesa: 20% dos encerramentos e um lote de 10 ou mais.
export const LOTE_FRACAO_AVISO = 0.2;
export const LOTE_MAIOR_AVISO = 10;

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function lerFilaWhatsapp(bruto: unknown): FilaWhatsapp | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  return {
    abertas7d: n(r.abertas_7d),
    abertasAntigas: n(r.abertas_antigas),
    encerradas: n(r.encerradas),
    maiorLote: n(r.maior_lote),
    encerradasEmLote: n(r.encerradas_em_lote),
    contaCompartilhadaCom: Array.isArray(r.conta_compartilhada_com) ? r.conta_compartilhada_com.map(String) : [],
  };
}

const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

/** Frase sobre encerramento em lote, só quando o dado do cliente mostra isso. */
export function avisoLote(f: FilaWhatsapp): string | null {
  if (f.encerradas <= 0) return null;
  const frac = f.encerradasEmLote / f.encerradas;
  if (frac < LOTE_FRACAO_AVISO || f.maiorLote < LOTE_MAIOR_AVISO) return null;
  return `${Math.round(frac * 100)}% dos encerramentos deste período aconteceram em lote (${LOTE_MIN_CONVERSAS} ou mais conversas fechadas no mesmo minuto); o maior teve ${int(f.maiorLote)} conversas.`;
}

/** Aviso de conta do WTS ligada a mais de um cliente, pelo cadastro. */
export function avisoContaCompartilhada(f: FilaWhatsapp): string | null {
  if (!f.contaCompartilhadaCom.length) return null;
  return `A conta do WhatsApp deste cliente também está ligada a ${f.contaCompartilhadaCom.join(", ")}. Estes números são da conta inteira (mesma recepção, mesma equipe), não só deste médico.`;
}

/** Ação para a fila esquecida: conversas abertas há mais de 7 dias. */
export function avisoFilaEsquecida(f: FilaWhatsapp): string | null {
  if (f.abertasAntigas <= 0) return null;
  return `${int(f.abertasAntigas)} ${f.abertasAntigas === 1 ? "conversa está aberta" : "conversas estão abertas"} no WhatsApp há mais de 7 dias, sem ninguém encerrar. Não são pacientes sendo atendidos agora: a equipe precisa encerrar ou retomar ${f.abertasAntigas === 1 ? "essa conversa" : "essas conversas"}.`;
}
