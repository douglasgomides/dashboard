// Planejador de conteúdo: ideia → pauta → plano da semana → produzida → publicada → medida.
// Regras puras (sem banco); a tela grava em pautas_conteudo.
import type { Ideia } from "@/lib/hub-conteudo";
import { adaptationSchema } from "./creative-intelligence/contracts";
import { adaptationBrief, creativeAdaptationId } from "./creative-intelligence/editorial";

export type FormatoPauta = "reels" | "carrossel" | "estatico" | "stories";
export type ObjetivoPauta = "alcance" | "salvamento" | "conversa" | "autoridade";
export type StatusPauta = "nova" | "escolhida" | "produzida" | "publicada" | "medida";
export type OrigemPauta = "duvida" | "tema" | "formato" | "post" | "dado" | "manual";

export interface Pauta {
  id: string;
  client_id: string;
  ideia_id: string | null;
  titulo: string;
  formato: FormatoPauta;
  objetivo: ObjetivoPauta;
  status: StatusPauta;
  motivo: string | null;
  origem_tipo: OrigemPauta;
  origem_texto: string | null;
  gancho: string | null;
  roteiro: string[];
  cta: string | null;
  aviso: string | null;
  dia: string | null; // AAAA-MM-DD
  post_id: string | null;
  criado_em?: string;
  atualizado_em?: string;
}

export type NovaPauta = Omit<Pauta, "id" | "criado_em" | "atualizado_em">;

export const STATUS: StatusPauta[] = ["nova", "escolhida", "produzida", "publicada", "medida"];
export const ROTULO_STATUS: Record<StatusPauta, string> = { nova: "Nova", escolhida: "Escolhida", produzida: "Produzida", publicada: "Publicada", medida: "Medida" };
export const ROTULO_FORMATO: Record<FormatoPauta, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Estático", stories: "Stories" };
export const ROTULO_OBJETIVO_PAUTA: Record<ObjetivoPauta, string> = {
  alcance: "Alcance",
  salvamento: "Salvamento",
  conversa: "Conversa",
  autoridade: "Autoridade",
};
export const ROTULO_ORIGEM: Record<OrigemPauta, string> = {
  duvida: "Dúvida de pacientes",
  tema: "Tema que o público salva",
  formato: "Formato que mais alcança",
  post: "Post que deu certo",
  dado: "Dado do painel",
  manual: "Criada pela equipe",
};

/** Texto livre de formato ("Reels", "Carrossel (5 cards)", "Formato de maior alcance: Reels") → formato da pauta. */
export function formatoDe(texto: string | null | undefined): FormatoPauta {
  const t = (texto ?? "").toLowerCase();
  if (/stor/.test(t)) return "stories";
  if (/carross/.test(t)) return "carrossel";
  if (/est[aá]tic|imagem|foto/.test(t)) return "estatico";
  return "reels";
}

/** Ideia → pauta pronta para gravar. Objetivo "venda" da ideia vira "conversa" (o passo que o post consegue gerar). */
export function ideiaParaPauta(i: Ideia, clientId: string, extra: Partial<NovaPauta> = {}): NovaPauta {
  const objetivo: ObjetivoPauta = i.objetivo === "venda" ? "conversa" : i.objetivo;
  const origem: OrigemPauta = i.regra === "pergunta" ? "duvida" : i.regra === "tema" ? "tema" : "formato";
  return {
    client_id: clientId,
    ideia_id: i.id,
    titulo: i.titulo,
    formato: formatoDe(i.formato),
    objetivo,
    status: "escolhida",
    motivo: i.porQueTestar || null,
    origem_tipo: origem,
    origem_texto: i.evidencia || null,
    gancho: i.gancho || null,
    roteiro: i.roteiro ?? [],
    cta: i.cta || null,
    aviso: i.avisoSeguranca ?? null,
    dia: null,
    post_id: null,
    ...extra,
  };
}

/** "Gerar roteiro": o roteiro completo, pronto para a gravação ou para o designer, a partir da pauta. */
export function roteiroCompleto(p: Pick<Pauta, "titulo" | "formato" | "objetivo" | "gancho" | "roteiro" | "cta" | "aviso" | "motivo"> & Partial<Pick<Pauta, "ideia_id">>, creativeDocument?: unknown): string {
  if (creativeAdaptationId(p.ideia_id ?? null)) {
    const parsed = adaptationSchema.safeParse(creativeDocument);
    if (parsed.success) return adaptationBrief({ document: parsed.data });
    // Versões antigas ainda preservam os trechos salvos; não inventar capa ou falas adicionais.
    return [p.titulo, ...p.roteiro, p.cta, p.aviso].filter(Boolean).join("\n\n");
  }
  const passos = p.roteiro.length ? p.roteiro : ["Explique o tema em uma frase simples.", "Dê um exemplo do dia a dia do paciente.", "Diga o que a pessoa deve observar ou fazer."];
  const estrutura =
    p.formato === "carrossel"
      ? ["Card 1 (capa): " + (p.gancho ?? p.titulo), ...passos.map((s, k) => `Card ${k + 2}: ${s}`), `Último card: ${p.cta ?? "Salve este post para consultar depois."}`]
      : p.formato === "estatico"
        ? [`Arte: ${p.gancho ?? p.titulo}`, `Legenda: ${passos.join(" ")}`, `Fechamento da legenda: ${p.cta ?? "Salve para consultar depois."}`]
        : p.formato === "stories"
          ? [`Story 1: ${p.gancho ?? p.titulo}`, ...passos.map((s, k) => `Story ${k + 2}: ${s}`), `Último story (caixa de pergunta ou link): ${p.cta ?? "Me conta sua dúvida."}`]
          : [`0 a 3 s (gancho, falando para a câmera): ${p.gancho ?? p.titulo}`, ...passos.map((s, k) => `Parte ${k + 1}: ${s}`), `Final (CTA): ${p.cta ?? "Salve e mande para quem precisa ver."}`];
  return [
    `Pauta: ${p.titulo}`,
    `Formato: ${ROTULO_FORMATO[p.formato]} · Objetivo: ${ROTULO_OBJETIVO_PAUTA[p.objetivo]}`,
    p.motivo ? `Por que fazer: ${p.motivo}` : "",
    "",
    "Roteiro:",
    ...estrutura,
    p.aviso ? `\nAtenção (segurança médica): ${p.aviso}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Os 7 dias a partir de `hoje` (AAAA-MM-DD), com o nome do dia. */
export function seteDias(hoje: string): { data: string; rotulo: string }[] {
  const NOMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const [a, m, d] = hoje.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(a, m - 1, d + i));
    const iso = dt.toISOString().slice(0, 10);
    return { data: iso, rotulo: `${NOMES[dt.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
  });
}

/** Primeiro dia útil (seg–sex) da semana sem pauta, para "adicionar ao plano da semana". */
export function proximoDiaLivre(pautas: Pick<Pauta, "dia">[], hoje: string): string {
  const dias = seteDias(hoje);
  const ocupados = new Set(pautas.map((p) => p.dia).filter(Boolean));
  const util = dias.filter((d) => !/^(Sáb|Dom)/.test(d.rotulo));
  return (util.find((d) => !ocupados.has(d.data)) ?? util[0] ?? dias[0]).data;
}

/** Plano da semana: pautas por dia (dentro dos 7 dias), mais as sem dia e as de fora da semana. */
export function montarSemana(pautas: Pauta[], hoje: string) {
  const dias = seteDias(hoje);
  const dentro = new Set(dias.map((d) => d.data));
  return {
    dias: dias.map((d) => ({ ...d, pautas: pautas.filter((p) => p.dia === d.data) })),
    semDia: pautas.filter((p) => !p.dia),
    foraDaSemana: pautas.filter((p) => p.dia && !dentro.has(p.dia)),
    formatos: (Object.keys(ROTULO_FORMATO) as FormatoPauta[]).map((f) => ({ formato: f, n: pautas.filter((p) => p.dia && dentro.has(p.dia) && p.formato === f).length })),
  };
}

export function contarStatus(pautas: Pick<Pauta, "status">[]): Record<StatusPauta, number> {
  const c: Record<StatusPauta, number> = { nova: 0, escolhida: 0, produzida: 0, publicada: 0, medida: 0 };
  for (const p of pautas) c[p.status]++;
  return c;
}

/** Plano em texto para colar no grupo da equipe. */
export function semanaEmTexto(pautas: Pauta[], hoje: string): string {
  const s = montarSemana(pautas, hoje);
  const linhas = s.dias.map((d) =>
    d.pautas.length ? `${d.rotulo}: ${d.pautas.map((p) => `${ROTULO_FORMATO[p.formato]} · ${p.titulo} (${ROTULO_STATUS[p.status].toLowerCase()})`).join(" | ")}` : `${d.rotulo}: livre`,
  );
  return ["Plano de conteúdo da semana", ...linhas].join("\n");
}
