/**
 * Classificação automática de "tema" por palavra-chave, uma regra por
 * conta Windsor (cada cliente tem um vocabulário e uma taxonomia própria —
 * não faz sentido um dicionário global). As palavras foram extraídas lendo
 * as legendas reais já classificadas manualmente, não inventadas.
 *
 * first-match-wins: regras mais específicas primeiro, catch-all por último.
 * Nunca classifica sem confiança — se nada bater, fica null pra revisão
 * manual em vez de arriscar uma tag errada.
 */

interface TemaRule {
  tema: string;
  keywords: string[];
}

const DOUGLAS_GOMIDES: TemaRule[] = [
  {
    tema: "Club e ecossistema de marketing medico",
    keywords: ["comenta \"club\"", "comente \"club\"", "ecossistema de marketing médico", "club de marketing médico", "clube de marketing médico"],
  },
  {
    tema: "Prompts e IA para conteudo",
    keywords: ["prompt", "megaprompt", "comenta claude", "comente claude", "arsenal", "chatgpt", "skills de marketing médico", "30 dias de conteúdo"],
  },
  {
    tema: "Regulacao CFM",
    keywords: ["cfm", "normas do cfm", "fiscalização", "permite e proíbe"],
  },
  {
    tema: "Vida pessoal e paternidade",
    keywords: ["filho", "paternidade", "ser pai", "parto", "gravidez", "gestação", "contrações", "nascimento", "leon"],
  },
  {
    tema: "Atendimento e vendas na clinica",
    keywords: ["leia a legenda", "convênio", "desconto", "orçamento", "vou pensar", "vou marcar mês que vem"],
  },
  {
    tema: "Carreira medica e reflexao",
    keywords: ["carreira médica", "residência", "especialização", "formação médica", "faculdade de medicina", "vagas de medicina"],
  },
  {
    tema: "Desinformacao e postura profissional",
    keywords: ["charlatão", "desinformação", "promessas milagrosas", "acreditar em tudo que vê"],
  },
  {
    tema: "Autoridade digital e redes sociais",
    keywords: ["newsjacking"],
  },
  {
    tema: "Bastidores e pessoal",
    keywords: ["terreno que eu comprei", "home office", "doctor creators", "domingão"],
  },
  {
    tema: "Reflexoes e motivacional",
    keywords: ["hábito de nos comparar", "momento perfeito", "vale a pena"],
  },
];

const LANA_TORRES: TemaRule[] = [
  {
    tema: "Reposicao hormonal",
    keywords: ["reposição hormonal", "implante hormonal"],
  },
  {
    tema: "Suplementacao",
    keywords: ["suplement", "creatina", "magnésio", "biodisponibilidade"],
  },
  {
    tema: "Hormonios e testosterona",
    keywords: ["testosterona"],
  },
  {
    tema: "Saude intima e relacionamento",
    keywords: ["saúde íntima", "região íntima", "laser íntimo", "ressecamento", "ardência", "tpm", "casal", "parceiro"],
  },
  {
    tema: "Exames e biomarcadores",
    keywords: ["exame de sangue", "exames", "biomarcador", "marcadores", "colesterol", "ferritina", "estradiol", "glicose"],
  },
  {
    tema: "Emagrecimento",
    keywords: ["emagrec", "tirzepatida", "composição corporal", "perder peso"],
  },
  {
    tema: "Longevidade e estilo de vida",
    keywords: ["longevidade", "envelhec", "idade biológica", "relógio biológico"],
  },
  {
    tema: "Humor e entretenimento",
    keywords: ["barbie da menopausa", "signo", "😂"],
  },
  {
    tema: "Bastidores e pessoal",
    keywords: ["tocantins", "disney", "orlando", "noronha", "100 mil"],
  },
  {
    tema: "Sintomas da menopausa/perimenopausa",
    keywords: ["menopausa", "perimenopausa", "climatério", "fogacho", "ondas de calor", "tdpm"],
  },
];

// Extraídas lendo as 398 legendas reais dela e medindo a cobertura de cada
// regra antes de escrever qualquer coisa aqui. A ordem importa: a oferta
// (arsenal/prompt/Claude) vem antes de CFM porque boa parte dos posts de
// arsenal menciona "dentro das normas do CFM" de passagem — o assunto é a
// oferta, não a norma.
//
// Cobertura medida: 66% dos posts. Dos que sobram, 51 têm legenda que é só
// "Siga @doctorcreators" — o tema mora na arte, não no texto, e forçar uma
// tag ali seria inventar. Ficam null de propósito.
const DOCTOR_CREATOR: TemaRule[] = [
  {
    tema: "Prompts e IA para conteudo",
    keywords: ["arsenal", "prompt", "claude", "30 dias de conteúdo"],
  },
  {
    tema: "Comunidade DCI e Club",
    keywords: ["comente dci", "comenta dci", "comente “dci”", "comente club", "comenta club",
               "comente “club”", "comunidade com mais de", "doctor creator club"],
  },
  {
    tema: "Regulacao CFM",
    keywords: ["cfm", "fiscalização", "pode e não pode", "pode ou não fazer",
               "permitem e proíbem", "permite e proíbe"],
  },
  {
    tema: "IA na pratica medica",
    keywords: ["inteligência artificial", "ia na saúde", "ia está entrando"],
  },
  {
    tema: "Carreira e realidade da medicina",
    keywords: ["vale a pena", "abandon", "nem tudo são flores", "plantão",
               "carreira médica", "em voz baixa"],
  },
  {
    tema: "Autoridade e marca medica",
    keywords: ["ser creator", "marca médica", "constrói autoridade", "o que postar"],
  },
  {
    tema: "Consultorio e relacao com paciente",
    keywords: ["consultório", "medicina também é relacionamento", "novos pacientes",
               "depoimento de paciente"],
  },
];

const RULES_BY_WINDSOR_ACCOUNT: Record<string, TemaRule[]> = {
  "17841400869970479": DOUGLAS_GOMIDES, // douglasgomides
  "17841401061134951": LANA_TORRES, // dralanatorres
  "17841458525811009": DOCTOR_CREATOR, // doctorcreators
};

export function classifyTema(windsorAccountId: string, caption: string | null | undefined): string | null {
  if (!caption) return null;
  const rules = RULES_BY_WINDSOR_ACCOUNT[windsorAccountId];
  if (!rules) return null;
  const lower = caption.toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.tema;
  }
  return null;
}
