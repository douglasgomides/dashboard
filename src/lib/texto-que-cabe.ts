import { chaveTema, normalizarTema } from "./classificacao-post";
import { fmtNum } from "./format";

// Texto que cabe: regras puras de exibição (sem IA, sem consulta). O dado do banco não muda; só como aparece.

const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Número em formato curto para espaço apertado (números sobre a miniatura): 999, "1,0 mil", "52,9 mil",
 * "529 mil", "1,0 mi". O arredondamento que chega na faixa de cima sobe de faixa. Sem dado: "—".
 */
export function numeroCurto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(n);
  if (Math.abs(v) < 1000) return v.toLocaleString("pt-BR");
  const mil = v / 1000;
  if (mil < 100) {
    const r = Math.round(mil * 10) / 10;
    if (r < 100) return `${umaCasa(r)} mil`;
    return "100 mil";
  }
  const inteiro = Math.round(mil);
  if (inteiro < 1000) return `${inteiro} mil`;
  return `${umaCasa(Math.round((v / 1_000_000) * 10) / 10)} mi`;
}

/** Número inteiro com separador de milhar; sem valor é "Sem dado", nunca 0. */
export function numeroOuSemDado(n: number | null | undefined): string {
  return n == null ? "Sem dado" : fmtNum(n);
}

const FORMATO_DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "dd/mm" no dia de Brasília. Sem data ou data inválida: "Sem data". */
export function dataDiaMes(iso: string | null | undefined): string {
  if (!iso) return "Sem data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sem data";
  return FORMATO_DIA_MES.format(d);
}

/** Temas do classificador que perderam o acento na gravação: chave do tema (sem acento) -> nome com acento. */
export const ROTULO_DOS_TEMAS: Record<string, string> = {
  "atendimento e vendas na clinica": "Atendimento e vendas na clínica",
  "autoridade e marca medica": "Autoridade e marca médica",
  "carreira medica e reflexao": "Carreira médica e reflexão",
  "club e ecossistema de marketing medico": "Club e ecossistema de marketing médico",
  "consultorio e relacao com paciente": "Consultório e relação com paciente",
  "desinformacao e postura profissional": "Desinformação e postura profissional",
  "exames e investigacao hormonal": "Exames e investigação hormonal",
  "hormonios e testosterona": "Hormônios e testosterona",
  "ia na pratica medica": "IA na prática médica",
  "metabolismo e composicao corporal": "Metabolismo e composição corporal",
  "prompts e ia para conteudo": "Prompts e IA para conteúdo",
  "quando a paciente nao e ouvida": "Quando a paciente não é ouvida",
  "reflexoes e motivacional": "Reflexões e motivacional",
  "regulacao cfm": "Regulação CFM",
  "reposicao hormonal": "Reposição hormonal",
  "saude intima e relacionamento": "Saúde íntima e relacionamento",
  "suplementacao": "Suplementação",
};

/** Tema para mostrar na tela, com acento. O filtro, as chaves e os agrupamentos seguem com o texto do banco. */
export function temaParaExibir(tema: string | null | undefined): string | null {
  const limpo = normalizarTema(tema);
  if (!limpo) return null;
  return ROTULO_DOS_TEMAS[chaveTema(limpo)] ?? limpo;
}
