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

// Extraídas lendo as legendas dela e medindo a cobertura de cada regra antes
// de escrever, como as anteriores. O perfil é quase inteiro sobre menopausa,
// então "menopausa" sozinha nao separa nada — as regras especificas vem
// primeiro e a de sintomas fica por ultimo, como rede.
//
// Cobertura: 74% dos posts dos ultimos 90 dias. No acervo inteiro cai para
// 49%, e isso e esperado: ela tem post desde 2011 e o conteudo antigo e de
// ginecologia geral, de antes de se especializar em menopausa. Nao vale
// escrever regra para conteudo que ninguem vai consultar.
const JULIANA_PAOLA: TemaRule[] = [
  {
    // Serie numerada ("Edicao 12 para o homem que...") — e a linha editorial
    // de maior alcance dela, com folga. Vem primeiro porque esses posts
    // tambem falam de menopausa e cairiam na rede de sintomas.
    tema: "Menopausa e o casal",
    keywords: ["para o marido", "pro marido", "para o seu marido", "para o homem",
               "seu marido", "do casal", "namoro na menopausa"],
  },
  {
    // Paciente desacreditada no consultorio. Linha forte e facil de perder:
    // a maioria desses posts nao diz "menopausa" em lugar nenhum.
    tema: "Quando a paciente nao e ouvida",
    keywords: ["ignorada no consultório", "não está ficando louca", "segunda opinião",
               "sem ter sido ouvida", "mandada embora", "não está exagerando",
               "consulta de 15 minutos", "sendo tratada como", "ninguém ter avaliado"],
  },
  {
    tema: "Suplementos e nutrientes",
    keywords: ["magnésio", "vitamina d", "vitamina b", "creatina", "ômega", "omega-3",
               "coq10", "ubiquinol", "suplement", "colágeno", "zinco", "melatonina",
               "berberina", "mitocôndria"],
  },
  {
    tema: "Exames e investigacao hormonal",
    keywords: ["exame", "hemograma", "dosagem", "tsh", "ferritina"],
  },
  {
    tema: "Tratamento da menopausa",
    keywords: ["fezolinetanto", "veoza", "reposição hormonal", "terapia hormonal",
               "tratamento não hormonal", "estradiol", "progesterona"],
  },
  {
    tema: "Metabolismo e composicao corporal",
    keywords: ["insulina", "emagrec", "gordura abdominal", "metabolismo",
               "massa muscular", "sarcopenia"],
  },
  {
    // Rede final: pega o que fala de menopausa sem se encaixar nas anteriores.
    tema: "Sintomas da menopausa",
    keywords: ["fogacho", "perimenopausa", "transição menopausal", "climatério",
               "insônia", "sono ruim", "libido", "ressecamento", "menopausa"],
  },
];

const RULES_BY_WINDSOR_ACCOUNT: Record<string, TemaRule[]> = {
  "17841400869970479": DOUGLAS_GOMIDES, // douglasgomides
  "17841401061134951": LANA_TORRES, // dralanatorres
  "17841458525811009": DOCTOR_CREATOR, // doctorcreators
  "17841400575430051": JULIANA_PAOLA, // drajulianapaola
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
