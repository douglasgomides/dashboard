// Estrategista de Campanhas: regras compartilhadas entre o agente que propõe (api/_lib/agentes.ts, fluxo
// "campanhas_estrategia") e a aba Campanhas. A IA propõe estratégias, pacotes e abordagens cruzando o Brand Brain com os
// dados da clínica; aqui o servidor descarta o que fere o CFM, tem dado pessoal ou não diz de onde veio.
// Nada é enviado nem publicado: uma pessoa aprova, executa e registra o resultado.
import { textoSemDadoPessoal } from "./brand-brain.js";

export const TIPOS_IDEIA = {
  pacote: "Pacote ou programa de cuidado",
  captacao: "Captação de pacientes novos",
  anuncio: "Anúncio",
  conteudo: "Conteúdo e autoridade",
  reativacao: "Reativação de leads",
  retorno: "Retorno e acompanhamento",
  atendimento: "Abordagem no atendimento",
  parceria: "Parceria e indicação",
  evento: "Evento ou ação presencial",
} as const;
export type TipoIdeia = keyof typeof TIPOS_IDEIA;

export const ESFORCOS = ["baixo", "medio", "alto"] as const;
export type Esforco = (typeof ESFORCOS)[number];

export const ESTADOS_IDEIA = { proposta: "Proposta", aprovada: "Aprovada", em_andamento: "Em andamento", concluida: "Concluída", descartada: "Descartada" } as const;
export type EstadoIdeia = keyof typeof ESTADOS_IDEIA;

export interface IdeiaCampanha {
  tipo: TipoIdeia;
  titulo: string;
  publico: string;
  oferta: string | null; // pacote/programa descrito pelo que inclui, nunca por preço
  canal: string;
  mensagem: string | null; // texto pronto para a equipe adaptar
  porque: string;
  evidencias: string[]; // números e fatos dos dados da clínica
  brain: string[]; // chaves do Brand Brain usadas (memoria.chave)
  passos: string[];
  metrica: string;
  esforco: Esforco;
  prazo_dias: number;
}

// Termos que o CFM (Resolução 2.336/2023 e Código de Ética) não aceita em publicidade médica: preço, desconto,
// promoção, brinde, sorteio, antes e depois, garantia ou promessa de resultado. Vale para oferta, mensagem e título.
const PROIBIDOS: [RegExp, string][] = [
  [/r\$\s?\d|\d+\s?reais\b|\bpre[çc]os?\s+(especial|promocional|reduzido|fechado)\b/i, "preço"],
  [/\bdesconto|\d+\s?%\s?(off|de desconto)|\boff\b/i, "desconto"],
  [/\bpromo[çc]/i, "promoção"],
  [/\bgr[aá]tis\b|\bgratuit[oa]s?\b|\bde gra[çc]a\b|\bcortesia\b/i, "grátis ou cortesia"],
  [/\bbrindes?\b|\bsorteios?\b|\bde presente\b|\bpresentear|\bpresente de\b|\bcupom|\bvoucher/i, "brinde, sorteio, cupom ou presente"],
  [/antes\s+e\s+depois/i, "antes e depois"],
  [/\bgarant(ia|ido|ida|imos|e)\b|\bresultados?\s+(garantid|certo|definitiv)|\b100\s?%\s?(eficaz|seguro|garantid)/i, "garantia de resultado"],
  [/\bblack\s?friday\b|\bqueima\b|\bliquida[çc][aã]o\b|\bimperd[ií]ve(l|is)\b|\b[uú]ltimas vagas\b|\bs[oó] hoje\b/i, "apelo comercial"],
  [/\bcombo\b|\bleve\s+\d|\bpague\s+\d|\bparcel(a|e)\s+em\b/i, "condição comercial"],
];

/** Devolve o motivo se o texto fere o CFM, ou null. */
export function ferirCFM(t: string): string | null {
  for (const [re, motivo] of PROIBIDOS) if (re.test(t)) return motivo;
  return null;
}

const txt = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lista = (x: unknown, maxItens: number, maxTexto: number) => (Array.isArray(x) ? x.map((i) => txt(i, maxTexto)).filter((s) => s.length >= 3).slice(0, maxItens) : []);

/** Filtra a resposta da IA. Só fica a ideia com título, público, porquê com evidência, passos e métrica, sem termo
 *  proibido pelo CFM e sem dado pessoal. Chaves do Brain que não existem são removidas (a IA não pode inventar fonte). */
export function validarIdeias(bruto: unknown, chavesBrain: string[], titulosAnteriores: string[] = []): { ok: IdeiaCampanha[]; descartes: string[] } {
  const ok: IdeiaCampanha[] = [];
  const descartes: string[] = [];
  const itens = Array.isArray((bruto as { ideias?: unknown })?.ideias) ? (bruto as { ideias: unknown[] }).ideias : [];
  const brainOk = new Set(chavesBrain);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  const vistos = new Set(titulosAnteriores.map(norm));
  for (const x of itens) {
    const i = (x ?? {}) as Record<string, unknown>;
    const titulo = txt(i.titulo, 140);
    const rotulo = titulo || "(sem título)";
    const tipo = String(i.tipo ?? "") as TipoIdeia;
    if (!(tipo in TIPOS_IDEIA)) { descartes.push(`${rotulo}: tipo inválido (${tipo || "vazio"})`); continue; }
    const ideia: IdeiaCampanha = {
      tipo,
      titulo,
      publico: txt(i.publico, 300),
      oferta: txt(i.oferta, 500) || null,
      canal: txt(i.canal, 120) || "A definir",
      mensagem: txt(i.mensagem, 700) || null,
      porque: txt(i.porque, 600),
      evidencias: lista(i.evidencias, 5, 240),
      brain: lista(i.brain, 6, 80).filter((k) => brainOk.has(k)),
      passos: lista(i.passos, 7, 260),
      metrica: txt(i.metrica, 200),
      esforco: (ESFORCOS as readonly string[]).includes(String(i.esforco)) ? (i.esforco as Esforco) : "medio",
      prazo_dias: Math.min(90, Math.max(3, Math.round(Number(i.prazo_dias) || 30))),
    };
    if (titulo.length < 8) { descartes.push(`${rotulo}: título curto`); continue; }
    if (!ideia.publico || !ideia.porque || !ideia.metrica) { descartes.push(`${rotulo}: falta público, porquê ou métrica`); continue; }
    if (ideia.passos.length < 2) { descartes.push(`${rotulo}: menos de 2 passos`); continue; }
    if (!ideia.evidencias.length && !ideia.brain.length) { descartes.push(`${rotulo}: sem evidência dos dados nem item do Brain`); continue; }
    if (tipo === "pacote" && !ideia.oferta) { descartes.push(`${rotulo}: pacote sem descrição do que inclui`); continue; }
    // O que vai ao paciente (título, oferta, mensagem, público) passa pelo CFM. Passos são instrução interna e podem
    // citar orçamento de anúncio; evidências podem citar o ticket médio.
    const publicos = [titulo, ideia.oferta ?? "", ideia.mensagem ?? "", ideia.publico];
    const cfm = publicos.map(ferirCFM).find(Boolean);
    if (cfm) { descartes.push(`${rotulo}: fere o CFM (${cfm})`); continue; }
    if (![...publicos, ideia.porque, ...ideia.evidencias, ...ideia.passos].every(textoSemDadoPessoal)) { descartes.push(`${rotulo}: parece ter dado pessoal`); continue; }
    const k = norm(titulo);
    if (vistos.has(k)) { descartes.push(`${rotulo}: repetida`); continue; }
    vistos.add(k);
    ok.push(ideia);
  }
  return { ok, descartes };
}
