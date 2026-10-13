// Voz do paciente: triagem, classificação e agrupamento dos comentários antes de virarem
// dúvida (tela Dúvidas) ou ideia de conteúdo (tela Ideias).
//
// Lógica pura e determinística: sem IA, sem banco, sem React. Recebe as linhas de
// instagram_comments já lidas e devolve o que ficou, o que saiu (com o motivo) e os
// grupos de dúvida com sugestões de post, de resposta e de abordagem comercial.
// Testável com `npx tsx scripts/test-voz-do-paciente.ts`.
//
// Regra de ouro: um comentário só vira dúvida se for uma pergunta (ou pedido) real,
// feita por alguém que não é o próprio perfil nem outro profissional de saúde.
// Na dúvida entre "é ruído" e "é pergunta", o comentário sai e fica listado com o
// motivo, para a equipe conferir. Pedido de dose ou remédio nunca vira ideia de post:
// vira grupo de "cuidado médico".
//
// Textos seguem a Resolução CFM 2.336/2023: sem promessa de resultado, sem preço em
// público, sem nome de remédio, sem diagnóstico pelos comentários.

import type { Confianca, Insight, Limitacao } from "@/lib/insight";

// ---------- normalização ----------
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
export const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
const HANDLE = /@[\w.]+/g;
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/gu;

function semMencoes(t: string): string {
  return t.replace(HANDLE, " ").replace(/\s+/g, " ").trim();
}
function letras(t: string): string {
  return t.replace(/[^a-z0-9]/g, "");
}
function palavras(t: string): string[] {
  return t
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// ---------- tipos ----------
export interface ComentarioBruto {
  id: string;
  text: string;
  author_username?: string | null;
  like_count?: number | null;
  instagram_post_id?: string | null;
  commented_at?: string | null;
}

export type MotivoExclusao =
  | "vazio_ou_curto"
  | "so_emoji"
  | "so_mencao"
  | "spam_ou_promocao"
  | "do_proprio_perfil"
  | "profissional_de_saude"
  | "conversa_entre_seguidores"
  | "pergunta_para_seguidores"
  | "piada_ou_ironia"
  | "sem_pergunta"
  | "repetido";

export const ROTULO_MOTIVO: Record<MotivoExclusao, { titulo: string; explicacao: string }> = {
  vazio_ou_curto: {
    titulo: "Curto demais para entender",
    explicacao: "Menos de 3 palavras ou sem assunto (ex.: \"E aí??\", \"Faz musculação?\"). Sem o contexto do post, não dá para saber o que a pessoa quer.",
  },
  so_emoji: { titulo: "Só emoji", explicacao: "O comentário não tem nenhuma palavra." },
  so_mencao: { titulo: "Só marcou alguém", explicacao: "A pessoa marcou um amigo (\"@fulana olha isso\"), sem pergunta." },
  spam_ou_promocao: {
    titulo: "Propaganda ou spam",
    explicacao: "Link, divulgação de marca, aplicativo, sorteio ou convite para seguir outro perfil.",
  },
  do_proprio_perfil: { titulo: "Resposta do próprio perfil", explicacao: "Comentário feito pela conta do(a) médico(a)." },
  profissional_de_saude: {
    titulo: "Outro profissional de saúde",
    explicacao: "Quem escreveu se apresenta como médico(a), nutricionista, fisioterapeuta, psicólogo(a) etc. (no @ ou no texto). É opinião de colega, não dúvida de paciente.",
  },
  conversa_entre_seguidores: {
    titulo: "Conversa entre seguidores",
    explicacao: "Começa marcando outra pessoa (\"@maria como você fez?\"): a pergunta é para ela, não para o perfil.",
  },
  pergunta_para_seguidores: {
    titulo: "Pergunta para os outros seguidores",
    explicacao: "\"Alguém sente isso?\", \"Quem usa tal coisa?\": pede experiência de outras pessoas, não orientação do perfil.",
  },
  piada_ou_ironia: { titulo: "Piada ou ironia", explicacao: "Tem risada (kkk, rsrs, 😂) e não pede nada de verdade." },
  sem_pergunta: {
    titulo: "Não pergunta nada",
    explicacao: "Desabafo, relato, elogio ou opinião, sem pergunta nem pedido. Vale ler, mas não é dúvida.",
  },
  repetido: { titulo: "Repetido", explicacao: "A mesma pessoa escreveu a mesma pergunta mais de uma vez: conta só uma." },
};

export type Intencao = "duvida_clinica" | "preco" | "agendamento" | "medo" | "objecao" | "comparacao";
export const ROTULO_INTENCAO: Record<Intencao, string> = {
  duvida_clinica: "Dúvida de saúde",
  preco: "Pergunta de preço",
  agendamento: "Quer ser atendido(a)",
  medo: "Medo ou receio",
  objecao: "Acha que não é para si",
  comparacao: "Comparando opções",
};

export type Nivel = "alta" | "media" | "baixa";
export type RiscoTipo = "automedicacao" | "diagnostico_individual" | "preco_publico" | "sensivel";

export interface Assunto {
  id: string;
  rotulo: string; // título do grupo ("Cortisol alto")
  termo: string; // como entra numa frase ("o cortisol alto")
  tema: string; // tema mais amplo
  sensivel?: string; // aviso CFM específico do assunto
}

export interface ComentarioAnalisado<T extends ComentarioBruto = ComentarioBruto> {
  comentario: T;
  textoLimpo: string; // sem @ e com espaços normalizados
  pessoa: string; // chave de pessoa distinta
  semAutor: boolean;
  intencao: Intencao;
  assunto: Assunto | null;
  riscos: RiscoTipo[];
}

export interface ComentarioExcluido<T extends ComentarioBruto = ComentarioBruto> {
  comentario: T;
  motivo: MotivoExclusao;
}

export interface GrupoDuvida<T extends ComentarioBruto = ComentarioBruto> {
  id: string;
  rotulo: string;
  tema: string;
  termo: string;
  intencao: Intencao;
  cuidadoMedico: boolean; // pedido de dose/remédio: não vira post, resposta é de segurança
  pessoas: number; // pessoas distintas
  comentarios: number;
  itens: ComentarioAnalisado<T>[];
  exemplos: { texto: string; autor: string; curtidas: number }[]; // 2 a 3, @ anonimizado
  resumo: string;
  urgenciaComercial: Nivel;
  potencialConteudo: Nivel;
  riscos: RiscoTipo[];
  avisoCfm?: string;
  sugestaoPost: { formato: string; titulo: string; gancho: string } | null;
  sugestaoResposta: string;
  abordagemComercial?: string;
}

export interface ResultadoVoz<T extends ComentarioBruto = ComentarioBruto> {
  total: number;
  mantidos: ComentarioAnalisado<T>[];
  excluidos: ComentarioExcluido<T>[];
  porMotivo: Partial<Record<MotivoExclusao, number>>;
  grupos: GrupoDuvida<T>[]; // grupos com 2+ pessoas (dúvidas e intenção comercial)
  gruposCuidado: GrupoDuvida<T>[]; // pedidos de dose/remédio (qualquer tamanho)
  avulsas: ComentarioAnalisado<T>[]; // perguntas válidas que ninguém mais fez
  pessoasSemAutor: number;
  limitacoes: Limitacao[];
}

export interface OpcoesVoz {
  donos?: string[]; // @ do próprio perfil
  ignorarProfissionais?: boolean; // padrão true; perfis para médicos (ex.: Doctor Creator) podem querer false
  minPessoas?: number; // tamanho mínimo de grupo (padrão 2)
  limiarSimilaridade?: number; // para agrupar perguntas sem assunto conhecido (padrão 0.34)
}

// ---------- regras de triagem ----------
const SPAM: RegExp[] = [
  /https?:\/\/|www\.|\.com(\.br)?\b/,
  /\blink (na|da) bio\b/,
  /\bacess(e|a) (o|nosso|meu) (link|perfil|site)/,
  /\bsig(a|am) (o |a )?(@|nosso|nossa|meu|minha|perfil|pagina)/,
  /\b(seja|ser) (nosso|nossa) (parceir|revendedor|afiliad)/,
  /\bsomos (a|o|uma|um) \w+/,
  /\be uma plataforma\b|\bplataforma (completa|de gestao)\b/,
  /\b(nosso|nossa) (app|aplicativo|plataforma|marca|loja|curso|ebook|livro)\b/,
  /\bcom o \w+ app\b/,
  /\bcupom\b|\bdesconto de\b|\bfrete gratis\b/,
  /\bsorteio\b|\bconcorr(e|endo|er) a\b/,
  /\bja (me )?segue\b|\bme segu(e|a) la\b|\bnao te vi por la\b|\bsegue (a|o) (pagina|perfil|conta)\b/,
  /\bchama no (direct|dm|whats)|\bmanda (um )?(direct|dm)\b.*\b(parceria|divulg)/,
  /\brenda extra\b|\bganhe dinheiro\b|\btrabalhe de casa\b/,
  /\blivro que (organizei|escrevi|lancei)\b/,
];

const PROFISSIONAL_HANDLE = /^(dr|dra|doutor|doutora)[._a-z]|(^|[._])(dr|dra)[._]|nutri(cionista)?([._]|$)|nutri$|fisio|psicolog|psiquiatr|enferm|farmac|fono|odonto|dentista|medic[oa]([._]|$)|[._]med$|ginecolog|dermato|endocrino|pediatra/;
const PROFISSIONAL_TEXTO =
  /\bsou (medic[oa]|nutricionista|fisioterapeuta|psicolog[oa]|enfermeir[oa]|farmaceutic[oa]|dentista|ginecologista|dermatologista|endocrinologista|pediatra|nutrologa?o?)\b|\bcomo (medic[oa]|nutricionista|fisioterapeuta|profissional (da|de) saude)\b|\b(crm|crn|crefito|crp|coren)[-\s/]?[a-z]{0,2}\s?\d{3,}/;

const RISADA = /k{3,}|(ha){2,}|(rs){2,}|\u{1F602}|\u{1F923}|\u{1F606}|\u{1F605}/u;
const PARA_SEGUIDORES = /^(e )?(alguem|quem (ai|aqui|mais)|alguma (de voces|amiga)|meninas|gente,? alguem)\b/;

const INTERROGATIVO =
  /\b(qual|quais|como|onde|aonde|quando|quanto|quantos|quantas|por que|porque|pq|o que|oque|pode|posso|podemos|serve|servem|funciona|existe|tem (algum|alguma|como|problema|risco|cura|jeito|tratamento|exame)|e normal|e verdade|sera|devo|deveria|precisa|preciso|indica|faz mal|ajuda|vale a pena|da (para|pra)|atende|e (o|a|os|as) \w+|tem que|consigo|interfere|altera|substitui|e seguro|e possivel|e indicado|cura)\b|\b(ne|correto|certo|confere)\W*$/;
// Começa com palavra de pergunta, mesmo sem "?" ("Aonde comprar estas cápsulas").
const COMECA_PERGUNTANDO = /^(e )?(qual|quais|como|onde|aonde|quando|quanto|quantos|quantas|o que|por que|pode|posso|existe|tem como|indica|serve)\b/;
const PEDIDO =
  /\b(gostaria de saber|queria saber|quero saber|quero entender|me (diz|diga|fala|fale|explica|explique|indica|indique|ajuda|ajude|tira)|pode(ria)? (indicar|explicar|falar|fazer|dar|passar|me|comentar|esclarecer)|indica (algum|alguma|um|uma)|faz (um|uma) (post|video|conteudo|live)|tem como|preciso saber|tenho (uma )?duvida|minha duvida|tira (uma )?duvida|duvidas?:)\b/;

// Pedido comercial claro: fica mesmo sem "?" e mesmo curto ("Qual valor", "Atende on-line?").
const PRECO_FORTE =
  /\b(qual|quais|quanto|saber|informa|informar|passa|passar|manda|mandar|tem)\b.{0,25}\b(valor|valores|preco|precos|custa|custo)\b|^(e )?(o |qual )?(valor|preco)\b|\b(valor|preco)\s*\??$|\bquanto (custa|e a|e o|fica|sai|cobra|ta|esta)\b|\bquanto\b.{0,15}\b(consulta|sessao|avaliacao|procedimento)\b|\bvalor (da|do|de sua|de uma|da sua) (consulta|sessao|procedimento|tratamento|cirurgia|avaliacao|aplicacao)/;
const NAO_PRECO = /\bvalor(es)? (de referencia|normal|ideal|aconselhado|bom|minimo|maximo)\b|\bvlr aconselhado\b|\b(meu|minha|o seu|a sua) .{0,15}(deu|esta|estava) /;
const AGENDA_FORTE =
  /\b(quero|gostaria de|queria|como (faco|faz) (para|pra)|onde (eu )?(posso|consigo))\b.{0,20}\b(agendar|marcar|consulta|consultar|ser (sua )?paciente|ser atendid|me consultar|atendimento)\b|\b(atende|atendem|faz|fazem) (online|on-line|on line|por convenio|convenio|plano de saude|pelo plano|em [a-z]{4,})\b|\bonde (fica|atende|e o consultorio|e a clinica)\b|\bqual (o )?(endereco|telefone|whats|contato)\b|\b(tem|teria) (horario|agenda|vaga)\b|\b(indica|conhece) (algum|alguma|um|uma) (medic|ginecolog|dermato|endocrino|especialista|profissional)/;

const MEDO = /\b(medo|receio|risco|riscos|perigo|perigoso|grave|cancer|faz mal|efeitos? colatera|seguro|seguranca|contraindica|contra indica|vicia|assust|trombose|infarto|avc)\b/;
const OBJECAO =
  /\b(nao funciona|nao acredito|caro|cara demais|nao tenho (dinheiro|condic)|assalariad|nao posso (fazer|tomar|usar|repor)|nao pode (fazer|tomar|usar)|quem nao pode|ja tentei|nao adiantou|nao deu certo|vale a pena|funciona mesmo|sera que funciona|pelo sus|plano nao cobre)\b/;
const COMPARACAO =
  /\b(diferenca entre|versus|vs|melhor que|pior que|qual (e |seria )?(o |a )?melhor|qual \w+ (e )?melhor|qual melhor|melhor (forma|marca|opcao|horario|fase)|ou (o|a) \w+\?|\w{4,} ou (o |a )?\w{4,}( \w+)?\s*\?)/;

// Pedido de dose, remédio ou compra: automedicação. Não vira post; vira grupo de cuidado.
const AUTOMEDICACAO =
  /\b(qual|quais|que) (a |o )?(dose|dosagem)\b|\bdosage(m|ns)\b|\bdose (certa|ideal|diaria)\b|\bquant(o|os|as) (mg|mcg|ui|gotas|comprimidos|capsulas|pumps|vezes ao dia)\b|\b\d+ ?(mg|mcg|ui)\b.*\?|\bo que (devo )?tomar\b|\bqual (remedio|medicamento|suplemento|marca|formula)\b|\b(que|qual|quais) (devo |posso )?(tomar|usar)\b|\bqual tomar\b|\b(posso|pode|podemos) tomar\b|\b(como|forma de|horario (de|pra|para)) tomar\b|\b(onde|aonde) (comprar|compro|encontr|acho|vende)\b|\bformula (certa|com)\b|\bmanipul(ar|ado|ada)\b.*\?|\bsem receita\b|\b(bom|boa|melhor) (para|pra) tomar\b|\b(recomenda|indica)\s*\?|\bqual (foi )?(o|a) (probiotico|suplemento|remedio|colageno|magnesio|ferro|vitamina|marca)\b|\b(passa|passar|manda) (a |o )?(receita|formula|protocolo)\b/;
const DIAGNOSTICO =
  /\b(meu|minha|meus|minhas) (exame|exames|resultado|fsh|tsh|ferritina|vitamina d|nivel|taxa|cortisol|glicose|hemograma)\b|\b(deu|esta em|estava em|esta|ficou) \d+([.,]\d+)?\b|\bsera que (e|eu tenho|tenho)\b|\bo que (sera que )?(eu )?tenho\b|\be grave\b|\bno meu caso\b|\bo que (eu )?(devo|faco|posso) fazer\b|\btodos? (os )?meus exames\b/;

// ---------- assuntos (agrupamento por tema) ----------
// Ordem importa: o primeiro que bate define o assunto. Do mais específico para o mais geral.
const AVISO_HORMONIO = "Hormônios: não citar nome de remédio nem dose; deixar claro que a indicação depende de avaliação individual.";
const AVISO_PESO = "Emagrecimento: não prometer quilos perdidos nem citar nome de remédio (como as \"canetas\"); sem antes e depois.";
const AVISO_ESTETICA = "Procedimentos: sem antes e depois sensacionalista, sem promessa de resultado e sem preço no post.";
const AVISO_SUPLEMENTO = "Suplementos: não indicar marca nem dose em post ou comentário; cada caso depende de exames e avaliação.";

const ASSUNTOS: (Assunto & { re: RegExp })[] = [
  { id: "cortisol", rotulo: "Cortisol alto e estresse", termo: "o cortisol alto", tema: "Estresse e cortisol", re: /\bcortisol\b/ },
  { id: "tireoide", rotulo: "Tireoide", termo: "a tireoide", tema: "Tireoide", re: /\btireoide|hipotireoid|hipertireoid|\btsh\b/ },
  { id: "ossos", rotulo: "Saúde dos ossos (osteopenia e osteoporose)", termo: "a saúde dos ossos", tema: "Ossos", re: /osteopenia|osteoporose|densitometria|\bossos?\b/ },
  { id: "fogachos", rotulo: "Fogachos (ondas de calor)", termo: "os fogachos", tema: "Sintomas da menopausa", re: /fogach|ondas? de calor|suor noturno|calorao/ },
  { id: "sono", rotulo: "Sono e insônia", termo: "o sono", tema: "Sono", re: /insonia|\bdormir\b|\bsono\b|acordo (de|toda|todos)|acordar de madrugada/ },
  { id: "libido", rotulo: "Libido e vida sexual", termo: "a libido e a vida sexual", tema: "Saúde íntima", re: /libido|relacao sexual|ressecamento|secura vaginal|lubrifica|dor na relacao|atrofia vaginal|incontinencia/ },
  { id: "cabelo", rotulo: "Queda e cuidados com o cabelo", termo: "a queda de cabelo", tema: "Cabelo", re: /cabelo|calvicie|caspa|couro cabeludo|shampoo|alopecia/ },
  { id: "peso", rotulo: "Emagrecimento e peso", termo: "o emagrecimento", tema: "Emagrecimento", sensivel: AVISO_PESO, re: /emagrec|perder peso|eliminar peso|ganhar peso|gordura|barriga|\bcaneta|ozempic|mounjaro|tirzepatida|semaglutida|\bquilos?\b|\bkg\b|obesidade/ },
  { id: "exames", rotulo: "Exames de sangue e hormonais", termo: "os exames", tema: "Exames", re: /\bexames?\b|\bfsh\b|ferritina|hemograma|leucocit|neutrofil|valor de referencia|check.?up/ },
  { id: "hormonios", rotulo: "Reposição hormonal", termo: "a reposição hormonal", tema: "Hormônios", sensivel: AVISO_HORMONIO, re: /reposicao|\btrh\b|terapia hormonal|hormoni|hormona|estradiol|estrogenio|estriol|progesterona|testosterona|\btesto\b|implante hormonal|\bgel\b.*hormon/ },
  { id: "suplementos", rotulo: "Suplementos e vitaminas", termo: "os suplementos", tema: "Suplementos", sensivel: AVISO_SUPLEMENTO, re: /suplement|magnesio|vitamina|colageno|creatina|\bwhey\b|omega|\bferro\b|probiotico|carnitina|carretina|zinco|complexo b|biotina|melatonina|ashwagandha|\bmaca\b/ },
  { id: "menopausa", rotulo: "Menopausa e climatério", termo: "a menopausa", tema: "Menopausa", re: /menopausa|climaterio|perimenopausa|menopausad/ },
  { id: "ciclo", rotulo: "Menstruação, ciclo e útero", termo: "o ciclo menstrual", tema: "Saúde da mulher", re: /menstrua|sangramento|\bciclo\b|\btpm\b|colica|endometriose|mioma|ovario|utero|histerectomia|anticoncepcional|\bdiu\b/ },
  { id: "pele", rotulo: "Cuidados com a pele", termo: "os cuidados com a pele", tema: "Pele", re: /\bpele\b|mancha|melasma|\bacne\b|espinha|\bporos?\b|rosacea|oleos|hidratante|protetor solar|filtro solar|retino|serum|\bcreme\b|cosmetic|dermatite|olheira|ruga/ },
  { id: "procedimentos", rotulo: "Procedimentos estéticos", termo: "os procedimentos estéticos", tema: "Procedimentos", sensivel: AVISO_ESTETICA, re: /\blaser\b|peeling|botox|toxina|preenchimento|bioestimulador|radiofrequencia|harmoniza|\bco2\b|ultraformer|\blipo|cirurgia plastica|protese|silicone|abdominoplastia|rinoplastia|blefaroplastia|lifting/ },
  { id: "intestino", rotulo: "Intestino e digestão", termo: "o intestino", tema: "Intestino", re: /intestin|constip|\bpreso\b|gases|estufad|inchaco abdominal|refluxo|gastrite/ },
  { id: "humor", rotulo: "Humor, ansiedade e tristeza", termo: "a ansiedade e o humor", tema: "Saúde emocional", re: /ansiedade|depress|tristeza|irritab|\bhumor\b|angustia|choro|panico/ },
  { id: "coracao", rotulo: "Pressão, coração e colesterol", termo: "a pressão e o coração", tema: "Coração", re: /pressao (alta|arterial)|hipertens|palpitac|coracao acelerado|taquicardia|colesterol|triglicerid/ },
  { id: "olhos", rotulo: "Visão e cirurgias dos olhos", termo: "a visão", tema: "Olhos", re: /miopia|catarata|\boculos\b|lente|retina|\bgrau\b|refrativa|ceratocone|glaucoma/ },
  { id: "dor", rotulo: "Dores no corpo e articulações", termo: "as dores no corpo", tema: "Dor", re: /dor(es)? (nas?|no|nos) (perna|pe|pes|costa|articula|joelho|coluna|corpo|cabeca)|artrose|enxaqueca|fibromialgia/ },
  { id: "treino", rotulo: "Exercício e musculação", termo: "o exercício", tema: "Exercício", re: /musculacao|treino|academia|exercicio|caminhada/ },
  { id: "marketing", rotulo: "Regras do CFM e marketing médico", termo: "as regras de publicidade médica", tema: "Marketing médico", re: /\bcfm\b|\bcrm\b|resolucao (do )?cfm|2\.?336|publicidade|anuncio|\breels\b|stories|seguidores|marketing|\bbio\b/ },
];

const STOP = new Set(
  "para como esse essa isso aquele aquela muito muita sobre onde quando quanto quanta quais qual quem porque tem tenho pode posso poderia gostaria queria ainda voce estou estar fazer vai algum alguma outro outra mais mesmo tambem entao agora depois antes pela pelo tudo nada cada todo toda todos todas dela dele elas eles minha meu meus minhas seus suas sua seu doutora doutor obrigada obrigado favor gente aqui assim isso esta estao fica ficar seria sera deve devo precisa preciso existe usar tomar faco".split(
    " ",
  ),
);
function tokensSignificativos(t: string): Set<string> {
  return new Set(
    palavras(t)
      .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w))
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / (a.size + b.size - i);
}

// ---------- classificação de um comentário ----------
export function classificarIntencao(t: string): Intencao {
  if (PRECO_FORTE.test(t) && !NAO_PRECO.test(t)) return "preco";
  if (AGENDA_FORTE.test(t) || /\b(agendar|marcar (uma )?consulta|consulta (online|on-line)|teleconsulta|convenio)\b/.test(t)) return "agendamento";
  if (MEDO.test(t)) return "medo";
  if (OBJECAO.test(t)) return "objecao";
  if (COMPARACAO.test(t)) return "comparacao";
  return "duvida_clinica";
}

export function assuntoDoTexto(t: string): Assunto | null {
  const n = normalizar(t);
  for (const a of ASSUNTOS) if (a.re.test(n)) return { id: a.id, rotulo: a.rotulo, termo: a.termo, tema: a.tema, sensivel: a.sensivel };
  return null;
}

function riscosDoTexto(t: string, intencao: Intencao, assunto: Assunto | null): RiscoTipo[] {
  const r: RiscoTipo[] = [];
  if (AUTOMEDICACAO.test(t) && intencao !== "preco" && intencao !== "agendamento") r.push("automedicacao");
  if (DIAGNOSTICO.test(t)) r.push("diagnostico_individual");
  if (intencao === "preco") r.push("preco_publico");
  if (assunto?.sensivel) r.push("sensivel");
  return r;
}

const ehDono = (autor: string | null | undefined, donos: string[]) =>
  !!autor && donos.some((d) => d && normalizar(d).replace(/^@/, "") === normalizar(autor).replace(/^@/, ""));

/** Decide se um comentário fica. Não olha os outros comentários (repetição é tratada no conjunto). */
export function triarComentario(
  texto: string,
  autor: string | null | undefined,
  { donos = [], ignorarProfissionais = true }: Pick<OpcoesVoz, "donos" | "ignorarProfissionais"> = {},
): { ok: true; textoLimpo: string; t: string } | { ok: false; motivo: MotivoExclusao } {
  const bruto = (texto ?? "").replace(/\s+/g, " ").trim();
  const t0 = normalizar(bruto);
  if (!letras(t0.replace(EMOJI, "")).length) return { ok: false, motivo: bruto.length ? "so_emoji" : "vazio_ou_curto" };
  if (ehDono(autor, donos)) return { ok: false, motivo: "do_proprio_perfil" };
  if (SPAM.some((r) => r.test(t0))) return { ok: false, motivo: "spam_ou_promocao" };
  if (ignorarProfissionais && ((autor && PROFISSIONAL_HANDLE.test(normalizar(autor))) || PROFISSIONAL_TEXTO.test(t0)))
    return { ok: false, motivo: "profissional_de_saude" };

  const mencoes = bruto.match(HANDLE) ?? [];
  const mencionaDono = mencoes.some((m) => ehDono(m.slice(1), donos));
  const textoLimpo = semMencoes(bruto.replace(EMOJI, " "));
  const t = normalizar(textoLimpo);
  const ws = palavras(t);
  if (mencoes.length > 0 && (ws.length <= 3 || /^(olha|ve|veja|vem|olhaa+|isso|kkk)/.test(t)) && !t.includes("?") && !mencionaDono)
    return { ok: false, motivo: "so_mencao" };
  if (ws.length === 0) return { ok: false, motivo: "so_mencao" };
  if (/^@/.test(bruto) && !ehDono((mencoes[0] ?? "").slice(1), donos) && !mencionaDono) return { ok: false, motivo: "conversa_entre_seguidores" };

  const comercial = (PRECO_FORTE.test(t) && !NAO_PRECO.test(t)) || AGENDA_FORTE.test(t);
  if (comercial) return { ok: true, textoLimpo, t };

  if (ws.length < 3 || letras(t).length < 10) return { ok: false, motivo: "vazio_ou_curto" };
  if (PARA_SEGUIDORES.test(t)) return { ok: false, motivo: "pergunta_para_seguidores" };
  if (RISADA.test(t0)) return { ok: false, motivo: "piada_ou_ironia" };

  // Pergunta real: "?" numa frase com palavra de pergunta, ou um pedido explícito.
  const frasesComPergunta = textoLimpo.split(/(?<=[?!.])\s+/).filter((f) => f.includes("?"));
  const temPergunta = frasesComPergunta.some((f) => INTERROGATIVO.test(normalizar(f)));
  const comecaPerguntando = COMECA_PERGUNTANDO.test(t) && !/^(e )?como (se|assim)\b/.test(t);
  if (!temPergunta && !PEDIDO.test(t) && !comecaPerguntando) return { ok: false, motivo: "sem_pergunta" };
  return { ok: true, textoLimpo, t };
}

// ---------- anonimização ----------
export function anonimizarAutor(autor: string | null | undefined): string {
  const a = (autor ?? "").replace(/^@/, "").trim();
  if (!a) return "pessoa sem @";
  return `@${a.slice(0, 2)}•••`;
}
export function anonimizarTexto(t: string): string {
  return t.replace(HANDLE, "@…").replace(/\s+/g, " ").trim();
}
const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ---------- textos dos grupos (modelos determinísticos, seguros pela CFM 2.336/2023) ----------
function resumoDoGrupo(intencao: Intencao, a: { rotulo: string; termo: string }, cuidado: boolean): string {
  if (cuidado) return `Pedem dose, nome de remédio ou suplemento sobre ${a.termo} para usar por conta própria.`;
  switch (intencao) {
    case "preco":
      return "Querem saber o valor da consulta ou do tratamento.";
    case "agendamento":
      return "Querem saber como agendar, se há atendimento online ou por convênio, ou onde fica o consultório.";
    case "medo":
      return `Têm medo dos riscos ligados a ${a.termo} e querem saber se é seguro.`;
    case "objecao":
      return `Acham que ${a.termo} não serve para elas (já tentaram, não podem ou acham caro).`;
    case "comparacao":
      return `Querem comparar opções sobre ${a.termo} e saber qual é melhor.`;
    default:
      return `Querem entender melhor ${a.termo}: como funciona, o que influencia e o que costuma ser avaliado.`;
  }
}

const AVISO_AUTOMEDICACAO =
  "Cuidado médico: não indicar dose, marca ou remédio nos comentários nem em post. Prescrição só depois de avaliação individual (Código de Ética Médica e CFM 2.336/2023).";
const AVISO_DIAGNOSTICO = "Não dar diagnóstico pelos comentários: responder de forma geral e convidar para avaliação.";
const AVISO_PRECO = "Não divulgar preço em post ou comentário público (CFM 2.336/2023): passar valores só no privado.";

function avisoDoGrupo(riscos: RiscoTipo[], assunto: Assunto | null): string | undefined {
  const partes: string[] = [];
  if (riscos.includes("automedicacao")) partes.push(AVISO_AUTOMEDICACAO);
  if (riscos.includes("diagnostico_individual")) partes.push(AVISO_DIAGNOSTICO);
  if (riscos.includes("preco_publico")) partes.push(AVISO_PRECO);
  if (assunto?.sensivel) partes.push(assunto.sensivel);
  return partes.length ? partes.join(" ") : undefined;
}

export function respostaSugerida(intencao: Intencao, termo: string, riscos: RiscoTipo[], cuidado: boolean): string {
  if (cuidado)
    return "Oi! Entendo a vontade de resolver logo. Dose e escolha de remédio ou suplemento dependem dos seus exames, do seu histórico e do que você já usa, por isso não é seguro indicar por aqui. Converse com o médico que te acompanha. Se quiser uma avaliação com a gente, é só chamar no direct que a equipe explica como funciona.";
  if (intencao === "preco")
    return "Oi! Obrigada pelo interesse. Por regra do Conselho de Medicina, não passamos valores aqui nos comentários. Vamos te chamar no direct com as informações da consulta.";
  if (intencao === "agendamento")
    return "Oi! Que bom que você quer ser atendida. Vamos te chamar no direct com os horários e as formas de atendimento disponíveis.";
  const diag = riscos.includes("diagnostico_individual")
    ? " Pelo comentário não dá para dizer o que acontece no seu caso: isso precisa de consulta e, às vezes, de exames."
    : "";
  switch (intencao) {
    case "medo":
      return `Oi! Faz todo sentido ter essa preocupação. Riscos e benefícios sobre ${termo} mudam de pessoa para pessoa e são avaliados em consulta, com seu histórico e seus exames.${diag} Vou trazer um conteúdo explicando o que é avaliado antes de qualquer indicação.`;
    case "objecao":
      return `Oi! Entendo. Cada caso tem caminhos diferentes e, mesmo quando uma opção não serve, outras podem ser conversadas em consulta.${diag} Vale levar essa dúvida para um médico de confiança.`;
    case "comparacao":
      return `Oi! Não existe uma opção melhor para todo mundo: a escolha depende do objetivo e do histórico de cada pessoa.${diag} Vou explicar as diferenças principais em um post. Para saber o que faz sentido para você, só em avaliação.`;
    default:
      return `Oi! Ótima pergunta, muita gente tem essa dúvida sobre ${termo}.${diag || " A resposta depende do histórico de cada pessoa, por isso não dá para orientar caso a caso por aqui."} Vou preparar um conteúdo explicando o que costuma ser avaliado. Se quiser uma avaliação individual, chame no direct.`;
  }
}

function abordagemComercial(intencao: Intencao): string | undefined {
  if (intencao === "preco")
    return "Responder no direct no mesmo dia: como funciona a consulta, o que está incluído (tempo, exames que olha, retorno), formas de atendimento e o link ou telefone para agendar. Valor só no privado. Anotar a pessoa como contato quente.";
  if (intencao === "agendamento")
    return "Responder no direct no mesmo dia com os próximos horários, se há atendimento online e como agendar. Se perguntou de convênio, explicar com clareza o que é aceito. Anotar a pessoa como contato quente.";
  return undefined;
}

function formatoParaIntencao(intencao: Intencao): string {
  return intencao === "medo" || intencao === "objecao" || intencao === "preco" || intencao === "agendamento" ? "Reels" : "Carrossel";
}

function sugestaoPost(intencao: Intencao, a: { rotulo: string; termo: string }, exemplo: string, n: number, sensivel: boolean) {
  const ex = cortar(exemplo, 90);
  switch (intencao) {
    case "preco":
    case "agendamento":
      return { formato: "Reels ou Stories", titulo: "Como funciona a consulta, do agendamento ao retorno", gancho: "Muita gente pergunta como funciona a consulta. Te mostro o passo a passo." };
    case "medo":
      return { formato: "Reels", titulo: `${a.rotulo}: é seguro? O que é mito e o que merece atenção`, gancho: `Tem medo quando o assunto é ${a.termo}? Vamos separar o que é mito do que precisa de atenção.` };
    case "objecao":
      return { formato: "Reels", titulo: `"Isso não é para mim": o que dá para fazer sobre ${a.termo}`, gancho: `"Isso não é para mim." Se você já pensou assim sobre ${a.termo}, fica até o fim.` };
    case "comparacao":
      return { formato: "Carrossel", titulo: `${a.rotulo}: qual opção é melhor?`, gancho: `Qual é melhor? A resposta honesta sobre ${a.termo} é: depende. E eu te mostro do quê.` };
    default:
      return {
        formato: "Carrossel",
        titulo: `${a.rotulo}: respondendo a dúvida que mais aparece`,
        // Assunto sensível (hormônio, peso, suplemento, procedimento): não cita a pergunta, que pode trazer nome de produto.
        gancho: sensivel
          ? `${n >= 3 ? `Perguntas sobre ${a.termo} apareceram ${n} vezes nos comentários.` : `Recebi perguntas sobre ${a.termo} nos comentários.`} Antes de qualquer decisão, entenda isto.`
          : n >= 3
            ? `"${ex}" Perguntas assim apareceram ${n} vezes nos comentários. Vamos falar sobre ${a.termo}.`
            : `"${ex}" Vamos falar sobre ${a.termo}.`,
      };
  }
}

/** A pergunta mais curta e legível do grupo, para abrir o post (sem @, sem "Dra.", um "?" só). */
export function perguntaCurta(itens: { textoLimpo: string; comentario: { like_count?: number | null } }[]): string {
  const cands = itens
    .map((i) => {
      const frases = i.textoLimpo.split(/(?<=[?!.])\s+/);
      let f = frases.find((x) => x.includes("?")) ?? frases[0] ?? "";
      f = f
        .replace(/\s+\?/g, "?")
        .replace(/[?!]{2,}/g, "?")
        .replace(/^(dra|dr|doutora|doutor)\.?,?\s+/i, "")
        .trim();
      f = f.charAt(0).toUpperCase() + f.slice(1);
      return { f, n: palavras(normalizar(f)).length, likes: i.comentario.like_count ?? 0 };
    })
    .filter((c) => c.n >= 4 && c.n <= 14);
  cands.sort((a, b) => b.likes - a.likes || a.f.length - b.f.length);
  return cands[0]?.f ?? cortar(itens[0]?.textoLimpo ?? "", 90);
}

// ---------- análise do conjunto ----------
function pessoaDe(c: ComentarioBruto): { chave: string; semAutor: boolean } {
  const a = (c.author_username ?? "").trim().replace(/^@/, "").toLowerCase();
  return a ? { chave: a, semAutor: false } : { chave: `anon:${c.id}`, semAutor: true };
}

const NIVEL_N: Record<Nivel, number> = { alta: 3, media: 2, baixa: 1 };

export function analisarVozDoPaciente<T extends ComentarioBruto>(comentarios: T[], opcoes: OpcoesVoz = {}): ResultadoVoz<T> {
  const { donos = [], ignorarProfissionais = true, minPessoas = 2, limiarSimilaridade = 0.34 } = opcoes;
  const mantidos: ComentarioAnalisado<T>[] = [];
  const excluidos: ComentarioExcluido<T>[] = [];
  const vistos: { pessoa: string; post: string; tokens: Set<string>; norm: string; semAutor: boolean }[] = [];

  for (const c of comentarios) {
    const tri = triarComentario(c.text, c.author_username, { donos, ignorarProfissionais });
    if (!tri.ok) {
      excluidos.push({ comentario: c, motivo: tri.motivo });
      continue;
    }
    const { chave, semAutor } = pessoaDe(c);
    const tokens = tokensSignificativos(tri.t);
    const norm = letras(tri.t);
    const post = c.instagram_post_id ?? "";
    // Mesma pessoa repetindo (ou, sem @, o mesmo texto no mesmo post): conta uma vez só.
    const dup = vistos.some((v) =>
      semAutor ? v.semAutor && v.post === post && v.norm === norm : v.pessoa === chave && (v.norm === norm || jaccard(v.tokens, tokens) >= 0.5),
    );
    if (dup) {
      excluidos.push({ comentario: c, motivo: "repetido" });
      continue;
    }
    vistos.push({ pessoa: chave, post, tokens, norm, semAutor });
    const intencao = classificarIntencao(tri.t);
    const assunto = assuntoDoTexto(tri.textoLimpo);
    mantidos.push({ comentario: c, textoLimpo: tri.textoLimpo, pessoa: chave, semAutor, intencao, assunto, riscos: riscosDoTexto(tri.t, intencao, assunto) });
  }

  // Agrupamento: comercial por intenção; cuidado médico por assunto; o resto por assunto + intenção
  // (dúvida e comparação juntas; medo e objeção separados, porque pedem post diferente).
  const chaves = new Map<string, ComentarioAnalisado<T>[]>();
  const semAssunto: ComentarioAnalisado<T>[] = [];
  for (const m of mantidos) {
    let k: string | null;
    if (m.intencao === "preco" || m.intencao === "agendamento") k = `com:${m.intencao}`;
    else if (m.riscos.includes("automedicacao")) k = `cuidado:${m.assunto?.id ?? "geral"}`;
    else if (m.assunto) k = `${m.assunto.id}:${m.intencao === "comparacao" ? "duvida_clinica" : m.intencao}`;
    else k = null;
    if (k) (chaves.get(k) ?? chaves.set(k, []).get(k)!).push(m);
    else semAssunto.push(m);
  }
  // Sem assunto conhecido: junta por palavras em comum (compara com o primeiro item do grupo).
  const extras: { tokens: Set<string>; itens: ComentarioAnalisado<T>[] }[] = [];
  for (const m of semAssunto) {
    const tk = tokensSignificativos(normalizar(m.textoLimpo));
    let melhor: { g: (typeof extras)[number]; s: number } | null = null;
    for (const g of extras) {
      const s = jaccard(tk, g.tokens);
      if (s >= limiarSimilaridade && (!melhor || s > melhor.s)) melhor = { g, s };
    }
    if (melhor) melhor.g.itens.push(m);
    else extras.push({ tokens: tk, itens: [m] });
  }
  extras.forEach((g, i) => chaves.set(`livre:${i}`, g.itens));

  const grupos: GrupoDuvida<T>[] = [];
  const gruposCuidado: GrupoDuvida<T>[] = [];
  const avulsas: ComentarioAnalisado<T>[] = [];
  for (const [k, itens] of chaves) {
    const pessoas = new Set(itens.map((i) => i.pessoa)).size;
    const cuidado = k.startsWith("cuidado:");
    if (!cuidado && pessoas < minPessoas) {
      avulsas.push(...itens);
      continue;
    }
    const contagem = new Map<Intencao, number>();
    for (const i of itens) contagem.set(i.intencao, (contagem.get(i.intencao) ?? 0) + 1);
    // Intenção do grupo: a mais frequente; empate fica com "dúvida de saúde" (o post mais seguro).
    const intencao = k.startsWith("com:")
      ? (k.slice(4) as Intencao)
      : [...contagem.entries()].sort((a, b) => b[1] - a[1] || Number(b[0] === "duvida_clinica") - Number(a[0] === "duvida_clinica"))[0][0];
    const assunto = itens.find((i) => i.assunto)?.assunto ?? null;
    let base: { rotulo: string; termo: string; tema: string };
    if (k.startsWith("com:")) base = { rotulo: intencao === "preco" ? "Valor da consulta ou do tratamento" : "Como agendar e ser atendido(a)", termo: "a consulta", tema: "Atendimento" };
    else if (assunto) base = assunto;
    else if (cuidado) base = { rotulo: "Remédios e suplementos", termo: "remédios e suplementos", tema: "Automedicação" };
    else {
      const freq = new Map<string, number>();
      for (const i of itens) for (const w of tokensSignificativos(normalizar(i.textoLimpo))) freq.set(w, (freq.get(w) ?? 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "outros assuntos";
      base = { rotulo: `Dúvidas sobre "${top}"`, termo: `"${top}"`, tema: "Outros assuntos" };
    }
    const riscos = Array.from(new Set(itens.flatMap((i) => i.riscos)));
    const ordenados = [...itens].sort((a, b) => (b.comentario.like_count ?? 0) - (a.comentario.like_count ?? 0) || a.textoLimpo.length - b.textoLimpo.length);
    // Exemplos: pessoas diferentes, textos curtos e legíveis primeiro.
    const exemplos: GrupoDuvida<T>["exemplos"] = [];
    const usadas = new Set<string>();
    for (const i of [...ordenados].sort((a, b) => Number(a.textoLimpo.length > 160) - Number(b.textoLimpo.length > 160))) {
      if (usadas.has(i.pessoa)) continue;
      usadas.add(i.pessoa);
      exemplos.push({ texto: cortar(anonimizarTexto(i.textoLimpo), 180), autor: anonimizarAutor(i.comentario.author_username), curtidas: i.comentario.like_count ?? 0 });
      if (exemplos.length === 3) break;
    }
    const comercial = intencao === "preco" || intencao === "agendamento";
    const urgenciaComercial: Nivel = comercial ? "alta" : intencao === "objecao" || intencao === "comparacao" ? "media" : "baixa";
    const potencialConteudo: Nivel = cuidado || comercial ? "baixa" : pessoas >= 3 ? "alta" : "media";
    const aviso = avisoDoGrupo(cuidado ? Array.from(new Set([...riscos, "automedicacao" as RiscoTipo])) : riscos.filter((r) => r !== "automedicacao"), assunto);
    const g: GrupoDuvida<T> = {
      id: k,
      rotulo: cuidado ? `Pedem dose ou remédio: ${base.rotulo.toLowerCase()}` : base.rotulo,
      tema: base.tema,
      termo: base.termo,
      intencao,
      cuidadoMedico: cuidado,
      pessoas,
      comentarios: itens.length,
      itens: ordenados,
      exemplos,
      resumo: resumoDoGrupo(intencao, base, cuidado),
      urgenciaComercial,
      potencialConteudo,
      riscos: cuidado ? Array.from(new Set([...riscos, "automedicacao" as RiscoTipo])) : riscos.filter((r) => r !== "automedicacao"),
      avisoCfm: aviso,
      sugestaoPost: cuidado ? null : sugestaoPost(intencao, base, perguntaCurta(ordenados), pessoas, !!assunto?.sensivel),
      sugestaoResposta: respostaSugerida(intencao, base.termo, riscos, cuidado),
      abordagemComercial: abordagemComercial(intencao),
    };
    (cuidado ? gruposCuidado : grupos).push(g);
  }
  const ordem = (a: GrupoDuvida<T>, b: GrupoDuvida<T>) =>
    b.pessoas - a.pessoas || NIVEL_N[b.urgenciaComercial] - NIVEL_N[a.urgenciaComercial] || a.rotulo.localeCompare(b.rotulo);
  grupos.sort(ordem);
  gruposCuidado.sort(ordem);

  const porMotivo: Partial<Record<MotivoExclusao, number>> = {};
  for (const e of excluidos) porMotivo[e.motivo] = (porMotivo[e.motivo] ?? 0) + 1;
  const pessoasSemAutor = mantidos.filter((m) => m.semAutor).length;

  const limitacoes: Limitacao[] = [];
  if (mantidos.length > 0 && pessoasSemAutor / mantidos.length > 0.3) {
    limitacoes.push({
      id: "voz-sem-autor",
      area: "ideias",
      texto: `${pessoasSemAutor} de ${mantidos.length} perguntas vieram sem o @ de quem escreveu. Cada uma conta como uma pessoa diferente, então "quantas pessoas" pode estar um pouco acima do real.`,
      resolve: "equipe_hub",
      comoResolver: "Revisar a coleta de comentários para trazer o @ do autor.",
    });
  }
  const prof = porMotivo.profissional_de_saude ?? 0;
  if (ignorarProfissionais && comentarios.length >= 10 && prof / comentarios.length > 0.25) {
    limitacoes.push({
      id: "voz-profissionais",
      area: "ideias",
      texto: `${prof} de ${comentarios.length} comentários são de outros profissionais de saúde e ficaram de fora. Se este perfil fala com médicos (e não com pacientes), as dúvidas deles são o público e a leitura muda.`,
      resolve: "equipe_hub",
    });
  }
  if (comentarios.length > 0 && mantidos.length < 5) {
    limitacoes.push({
      id: "voz-pouco-volume",
      area: "ideias",
      texto: `Só ${mantidos.length} pergunta(s) real(is) de ${comentarios.length} comentário(s) lido(s) no período. Com tão pouco, nenhum grupo é confiável.`,
      resolve: "social_media",
      comoResolver: "Aumentar o período ou terminar posts com uma pergunta para o público.",
    });
  }
  return { total: comentarios.length, mantidos, excluidos, porMotivo, grupos, gruposCuidado, avulsas, pessoasSemAutor, limitacoes };
}

// ---------- confiança e insights ----------
export function confiancaDoGrupo(pessoas: number): Confianca {
  return pessoas >= 5 ? "alta" : pessoas >= 3 ? "media" : "baixa";
}

/** Conclusões da Central de voz do paciente no formato único do Hub. */
export function insightsDaVoz(r: ResultadoVoz, rotaDuvidas = "/$clientId/duvidas"): Insight[] {
  const out: Insight[] = [];
  const comerciais = r.grupos.filter((g) => g.intencao === "preco" || g.intencao === "agendamento");
  const nCom = comerciais.reduce((a, g) => a + g.pessoas, 0);
  if (nCom > 0) {
    out.push({
      id: "voz-comercial",
      area: "comercial",
      tom: "atencao",
      titulo: `${nCom} pessoa(s) perguntaram preço ou como agendar nos comentários`,
      diagnostico: "Quem pergunta valor ou horário já está perto de marcar. Se a resposta demora ou não vem, essa pessoa costuma procurar outro lugar.",
      evidencia: comerciais.map((g) => `${g.rotulo}: ${g.pessoas} pessoa(s)`).join("; "),
      confianca: confiancaDoGrupo(nCom),
      motivoConfianca: `${nCom} pessoa(s) diferente(s)`,
      impacto: "alto",
      impactoTexto: "conversas que podem virar consulta",
      acao: { texto: "Chamar cada pessoa no direct hoje, com como funciona a consulta e como agendar. Valor só no privado.", rota: rotaDuvidas, botao: `Ver as ${nCom} pessoas` },
      responsavel: "atendimento",
      risco: AVISO_PRECO,
    });
  }
  const top = r.grupos.find((g) => g.potencialConteudo !== "baixa");
  if (top) {
    out.push({
      id: `voz-top-${top.id}`,
      area: "ideias",
      tom: "bom",
      titulo: `A dúvida que mais se repete: ${top.rotulo.toLowerCase()} (${top.pessoas} pessoas)`,
      diagnostico: `${top.resumo} Quando várias pessoas perguntam a mesma coisa, um post que responde costuma ser salvo e compartilhado.`,
      evidencia: `${top.pessoas} pessoas diferentes, ${top.comentarios} comentário(s). Ex.: "${top.exemplos[0]?.texto ?? ""}"`,
      confianca: confiancaDoGrupo(top.pessoas),
      motivoConfianca: `${top.pessoas} pessoa(s) diferente(s) depois de tirar ruído`,
      impacto: top.pessoas >= 5 ? "alto" : "medio",
      acao: { texto: `Publicar: ${top.sugestaoPost?.titulo ?? top.rotulo} (${top.sugestaoPost?.formato ?? "Carrossel"}).`, rota: "/$clientId/ideias", botao: "Ver a ideia pronta" },
      responsavel: "social_media",
      risco: top.avisoCfm,
    });
  }
  const nCuidado = r.gruposCuidado.reduce((a, g) => a + g.pessoas, 0);
  if (nCuidado > 0) {
    out.push({
      id: "voz-cuidado",
      area: "ideias",
      tom: "atencao",
      titulo: `${nCuidado} pessoa(s) pediram dose ou nome de remédio nos comentários`,
      diagnostico: "Responder com dose ou marca em público é prescrever sem consulta. A resposta precisa ser de segurança, convidando para avaliação.",
      evidencia: r.gruposCuidado.map((g) => `${g.rotulo}: ${g.pessoas}`).join("; "),
      confianca: "alta",
      impacto: "medio",
      acao: { texto: "Usar a resposta de segurança pronta e não indicar dose, marca ou remédio.", rota: rotaDuvidas, botao: "Ver as respostas de segurança" },
      responsavel: "medico",
      risco: AVISO_AUTOMEDICACAO,
    });
  }
  return out;
}

/** Texto do grupo para copiar (pauta para a equipe). */
export function grupoParaTexto(g: GrupoDuvida): string {
  return [
    `Dúvida: ${g.rotulo} (${g.pessoas} pessoas)`,
    `Resumo: ${g.resumo}`,
    `Exemplos: ${g.exemplos.map((e) => `"${e.texto}"`).join(" | ")}`,
    g.sugestaoPost ? `Sugestão de post: ${g.sugestaoPost.titulo} (${g.sugestaoPost.formato}). Gancho: ${g.sugestaoPost.gancho}` : "Sem post: é pedido de dose ou remédio.",
    `Resposta para o comentário: ${g.sugestaoResposta}`,
    g.abordagemComercial ? `Abordagem comercial: ${g.abordagemComercial}` : "",
    g.avisoCfm ? `Atenção: ${g.avisoCfm}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
