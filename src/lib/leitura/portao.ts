// Portão de honestidade da leitura (D-03): com dado incompleto ou não confiável, a leitura diz o problema e para.
// Nunca conclui em cima de número ruim. Função pura, no mesmo estilo de piorSelo (src/lib/selo.ts): devolve o primeiro
// motivo que nega, em português simples, com o passo para consertar e quem resolve.
import { LIMITES } from "@/lib/limites";
import type { Rastreio } from "@/lib/rastreio-anuncios";
import type { Selo } from "@/lib/selo";
import { hojeBrasilia, type StatusFonte } from "@/lib/status-fonte";
import type { Responsavel } from "@/lib/insight";
import type { CodigoNegacao, PassoFato, Portao } from "./tipos";

export interface EntradaPortao {
  /** Último dia do período lido (o menor entre o fim escolhido e hoje, já sem os dias que a Meta ainda fecha). */
  periodoAte: string;
  /** Hoje, no fuso de Brasília. Sem ele, usa o de agora. */
  hoje?: string;
  /** A tela não tem dado nenhum para este período. */
  semDado?: { motivo: string; quem: Responsavel } | null;
  /** Fontes que a leitura usa. `status` é o da régua única (status-fonte.ts); `ultimoDado` é o último dia com dado. */
  fontes?: { nome: string; status: StatusFonte | null; ultimoDado?: string | null }[];
  rastreio?: Rastreio | null;
  selo?: Selo | null;
  /** As etapas do funil do CRM estão fora de ordem (ex.: mais fechamentos do que agendamentos). */
  funilInconsistente?: boolean;
  /** Quantos problemas graves de dado na origem a tela já detectou. */
  problemasAltos?: number;
  /** Tamanho da amostra que sustenta a conclusão. */
  n?: number;
}

const DIA = 86_400_000;
const ms = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const diasEntre = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DIA);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Monta a negação: motivo leigo (sem número inventado) e um passo com verbo da lista e responsável. */
export function nega(codigo: CodigoNegacao, motivo: string, passo: PassoFato): Portao {
  return { ok: false, codigo, motivo, passo };
}

export function portaoDoPeriodo(e: EntradaPortao): Portao {
  const hoje = e.hoje ?? hojeBrasilia();
  const ontem = iso(ms(hoje) - DIA);

  // 1. falta de dado
  if (e.semDado) {
    return nega("sem_dado", e.semDado.motivo, { verbo: "conferir", texto: "a conexão das fontes", quem: e.semDado.quem });
  }

  // 2. fonte parada: status vermelho, ou último dado mais de 1 dia antes do menor entre o fim do período e ontem
  const referencia = e.periodoAte < ontem ? e.periodoAte : ontem;
  for (const f of e.fontes ?? []) {
    const parada = f.status?.cor === "vermelho";
    const atrasada = !!f.ultimoDado && diasEntre(referencia, f.ultimoDado) > 1;
    if (!parada && !atrasada) continue;
    const desde = f.ultimoDado ?? null;
    const quando = desde ? `desde ${ddmm(desde)}` : f.status?.data ? `desde ${f.status.data}` : null;
    const motivo = quando ? `o ${f.nome} está sem dado novo ${quando}` : `o ${f.nome} está sem dado`;
    return nega("fonte_parada", motivo, { verbo: "conferir", texto: `a conexão do ${f.nome}`, quem: "equipe_hub" });
  }

  // 3. rastreio suspeito (caso Doctor Creator: 7.391 cliques e 29 conversas)
  if (e.rastreio?.suspeito) {
    return nega("rastreio_suspeito", "o rastreio das conversas dos anúncios está suspeito", {
      verbo: "corrigir",
      texto: "o rastreio das conversas",
      quem: "gestor_trafego",
    });
  }

  // 4. selo ilegível
  if (e.selo?.nivel === "ilegivel") {
    return nega("selo_ilegivel", e.selo.motivo, { verbo: "corrigir", texto: "o dado que falta", quem: "equipe_hub" });
  }

  // 5. funil fora de ordem
  if (e.funilInconsistente) {
    return nega("funil_fora_de_ordem", "as etapas do funil estão fora de ordem", {
      verbo: "corrigir",
      texto: "a marcação das etapas do CRM",
      quem: "comercial",
    });
  }

  // 6. erro de dado na origem
  if ((e.problemasAltos ?? 0) > 0) {
    return nega("erro_de_dado", "há dado com erro na origem", { verbo: "corrigir", texto: "o dado na origem", quem: "equipe_hub" });
  }

  // 7. amostra pequena
  const minimo = LIMITES.leitura.grupoMinimo;
  if (e.n != null && e.n < minimo) {
    return nega("amostra_pequena", `a amostra é pequena (${e.n}, menos de ${minimo})`, {
      verbo: "conferir",
      texto: "de novo com um período maior",
      quem: "equipe_hub",
    });
  }

  return { ok: true };
}

/** O primeiro portão negado de uma lista (cada fonte da tela pode ter o seu), ou ok. */
export function piorPortao(lista: Portao[]): Portao {
  return lista.find((p) => !p.ok) ?? { ok: true };
}
