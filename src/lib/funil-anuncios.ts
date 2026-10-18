// Régua de anúncios por etapa do funil da Doctor Creator (C1, C2, C3). Testes em scripts/test-funil-anuncios.ts.
//
// C1: fala do TEMA (ex.: menopausa) sem falar de serviço. Quase sempre campanha de visita ao perfil. Indicador: custo
//     por seguidor; até R$ 1,50 mantém.
// C2: tema ligado a um serviço (ex.: laser íntimo). Também visita ao perfil; indicador: seguidor, aceitando custo maior.
// C3: remarketing, depoimentos, cases → página de conversão ou mensagem. Indicador: conversa, lead e agendamento.
// Mensagem direta gera muito lead desqualificado; o lead mais qualificado costuma vir de quem visitou o perfil e clicou
// no link da bio ou nos stories (medido pelos links rastreados).
//
// A Meta não entrega seguidor por campanha na API usada aqui. O seguidor de cada campanha é ESTIMADO: os novos
// seguidores do dia são rateados entre as campanhas de perfil pelos cliques no perfil de cada uma. Como inclui o
// seguidor orgânico do dia, o custo real é um pouco maior; a tela e o agente dizem isso.

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export type Etapa = "C1" | "C2" | "C3";
export interface ReguaEtapas { c1MaxSeguidor: number; c2MaxSeguidor: number }
export const REGUA_PADRAO: ReguaEtapas = { c1MaxSeguidor: 1.5, c2MaxSeguidor: 3 };

/** "Publicação do Instagram: O laser íntimo é um..." → "o laser intimo e um" (para achar o post pela legenda). */
export function inicioDaLegenda(nomeCampanha: string): string | null {
  const m = nomeCampanha.match(/^(?:publica[çc][ãa]o|post)\s+do\s+instagram:\s*(.+)$/i);
  if (!m) return null;
  const t = norm(m[1].replace(/(\.{3}|…)\s*$/, ""));
  return t.length >= 8 ? t : null;
}

export interface PostEtapa { caption: string | null; funnel_stage: string | null }

/** Etapa da campanha: 1) etiqueta no nome ([C1], TOPO, REMARKETING...); 2) objetivo de conversão = C3;
 *  3) etapa do post impulsionado (classificada pela IA nos posts); null se não der para saber. */
export function etapaDaCampanha(nome: string, objetivo: string | null, posts: PostEtapa[]): { etapa: Etapa | null; como: "nome" | "objetivo" | "post" | null } {
  const n = norm(nome);
  if (/\bc1\b|\btopo\b/.test(n)) return { etapa: "C1", como: "nome" };
  if (/\bc2\b|\bmeio\b/.test(n)) return { etapa: "C2", como: "nome" };
  if (/\bc3\b|\bfundo\b|\bremarketing\b|\brmkt\b|\bdepoimento|\bcase\b/.test(n)) return { etapa: "C3", como: "nome" };
  if (objetivo && /MESSAGES|OUTCOME_LEADS|OUTCOME_SALES|LEAD_GENERATION|CONVERSIONS/.test(objetivo)) return { etapa: "C3", como: "objetivo" };
  const ini = inicioDaLegenda(nome);
  if (ini) {
    const p = posts.find((x) => x.caption && norm(x.caption).startsWith(ini));
    const st = p?.funnel_stage;
    if (st === "C1" || st === "C0") return { etapa: "C1", como: "post" };
    if (st === "C2") return { etapa: "C2", como: "post" };
    if (st === "C3") return { etapa: "C3", como: "post" };
  }
  return { etapa: null, como: null };
}

export interface LinhaDia { campaign_id: string; date: string; spend: number; link_clicks: number }
export interface SeguidoresDia { date: string; novos: number }

/** Seguidores estimados por campanha de perfil (rateio dos novos seguidores do dia pelos cliques no perfil). */
export function seguidoresEstimados(linhas: LinhaDia[], seguidores: SeguidoresDia[], campanhasPerfil: Set<string>): Map<string, number> {
  const novosDia = new Map(seguidores.map((s) => [s.date, Math.max(0, Number(s.novos ?? 0))]));
  const cliquesDia = new Map<string, number>();
  for (const l of linhas) if (campanhasPerfil.has(l.campaign_id)) cliquesDia.set(l.date, (cliquesDia.get(l.date) ?? 0) + Number(l.link_clicks ?? 0));
  const out = new Map<string, number>();
  for (const l of linhas) {
    if (!campanhasPerfil.has(l.campaign_id)) continue;
    const total = cliquesDia.get(l.date) ?? 0, novos = novosDia.get(l.date);
    if (!total || novos == null) continue;
    out.set(l.campaign_id, (out.get(l.campaign_id) ?? 0) + (novos * Number(l.link_clicks ?? 0)) / total);
  }
  return out;
}

export type VeredictoSeguidor = "manter" | "escalar" | "revisar" | "pausar" | "pouco_dado";
/** Veredito pelo custo por seguidor (C1 e C2). Escalar só com folga grande e volume; pausar só bem acima do teto. */
export function avaliarSeguidor(etapa: "C1" | "C2", gasto: number, seguidores: number, regua: ReguaEtapas = REGUA_PADRAO): { veredicto: VeredictoSeguidor; custo: number | null; teto: number } {
  const teto = etapa === "C1" ? regua.c1MaxSeguidor : regua.c2MaxSeguidor;
  if (gasto < 30 || seguidores < 10) return { veredicto: "pouco_dado", custo: seguidores > 0 ? gasto / seguidores : null, teto };
  const custo = gasto / seguidores;
  if (custo <= teto * 0.6 && seguidores >= 40) return { veredicto: "escalar", custo, teto };
  if (custo <= teto) return { veredicto: "manter", custo, teto };
  if (custo <= teto * 1.5) return { veredicto: "revisar", custo, teto };
  return { veredicto: "pausar", custo, teto };
}
