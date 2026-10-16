// SAP · Banco de anúncios: modelos que já funcionam (padrões, não cópias) e as peças de cada clínica, por etapa do
// funil de conteúdo: C1 (ganhar seguidor), C2 (autoridade e consideração), C3 (remarketing para a conversa).
// Os modelos vêm da pesquisa de 2026 (CFM 2.336/2023, política de saúde da Meta, dados de criativos em saúde) e
// complementam a Biblioteca de Anúncios por Categoria (05.04). Lógica pura (teste: scripts/test-sap-anuncios.ts).

export type Etapa = "C1" | "C2" | "C3";
export type Formato = "imagem" | "carrossel" | "reels" | "bastidor" | "depoimento";
export type Semaforo = "verde" | "amarelo" | "vermelho";

export interface ModeloAnuncio {
  codigo: string; // BA-01...
  nome: string;
  etapas: Etapa[];
  formato: Formato[];
  /** true = vai para a gravação dirigida (05.07); false = cabe no banco sem rosto (05.05). */
  rosto: boolean;
  roteiro: string[];
  gancho: string; // exemplo em ginecologia / reposição hormonal
  porque: string;
  cuidados: string; // CFM e Meta
  semaforo: Semaforo;
}

const M = (codigo: string, nome: string, etapas: Etapa[], formato: Formato[], rosto: boolean, roteiro: string[], gancho: string, porque: string, cuidados: string, semaforo: Semaforo = "verde"): ModeloAnuncio =>
  ({ codigo, nome, etapas, formato, rosto, roteiro, gancho, porque, cuidados, semaforo });

export const MODELOS: ModeloAnuncio[] = [
  M("BA-01", "Mito-verdade relâmpago", ["C1"], ["reels"], false,
    ["Mito na tela + \"Mito.\"", "Por que as pessoas acreditam (1 frase)", "O que a ciência mostra (2 frases)", "\"Siga para mais verdades sobre saúde da mulher.\""],
    "\"Reposição hormonal dá câncer.\" Essa frase fez muita mulher sofrer à toa.",
    "O mito é a principal barreira de adesão (só 19,5% já usaram terapia hormonal); formato curto gera retenção e compartilhamento.",
    "Não dizer que \"não tem risco\": depende da avaliação. Sem nome de medicamento."),
  M("BA-02", "3 sinais (lista de reconhecimento)", ["C1"], ["reels", "carrossel"], false,
    ["Promessa de lista", "Um sinal por bloco, com exemplo do dia a dia", "\"Se identificou? Salve e mostre para uma amiga.\""],
    "3 sinais de que o corpo entrou na perimenopausa, e quase ninguém liga um ao outro.",
    "Gera identificação sem acusar quem assiste; salvar e enviar alimentam o alcance.",
    "Escrever em 3ª pessoa (\"muitas mulheres...\"), nunca \"você tem\" (a Meta reprova). Fechar com \"só a avaliação confirma\"."),
  M("BA-03", "Frase-tese estática (sem rosto)", ["C1", "C3"], ["imagem"], false,
    ["Frase curta e contraintuitiva (até 7 palavras)", "Subtítulo explicando em 1 linha", "Nome, especialidade, CRM e RQE no rodapé"],
    "Calorão não é frescura. É hormônio.",
    "Imagem única é o formato que mais dura no ar; barata de produzir e garante campanha no ar sem gravação.",
    "Dados obrigatórios no rodapé. Sem foto de paciente."),
  M("BA-04", "A pergunta que toda paciente faz", ["C1", "C2"], ["reels"], true,
    ["\"A pergunta que eu mais ouço no consultório é...\"", "Resposta direta em 1 frase", "A nuance (\"depende de...\")", "\"Comenta a sua dúvida que eu respondo no próximo vídeo.\""],
    "A pergunta que eu mais ouço de mulheres de 50 anos: \"Ainda dá tempo de começar a reposição?\"",
    "Linguagem real de paciente, autoridade sem arrogância; os comentários viram pauta (BA-12).",
    "Não prometer resultado nem definir conduta para todas."),
  M("BA-05", "Erro comum", ["C1"], ["reels", "carrossel"], false,
    ["\"O erro que eu mais vejo...\"", "O erro, sem julgar", "Por que prejudica", "O que fazer no lugar, de forma geral"],
    "O erro mais comum de quem entra na menopausa: achar que é só aguentar.",
    "Aversão à perda e ensino prático.",
    "Não ridicularizar paciente nem colega; não recomendar automedicação."),
  M("BA-06", "Critério da médica", ["C2"], ["reels"], true,
    ["\"Eu não começo nenhuma reposição sem...\"", "Os 2 ou 3 critérios ou exames, em linguagem simples", "\"É isso que separa um tratamento seguro de um palpite.\"", "\"Quer entender se faz sentido para você? Me chama.\""],
    "Eu não prescrevo hormônio para nenhuma paciente sem olhar estas 3 coisas.",
    "Mostra método e segurança, diferencia de soluções milagrosas e filtra o paciente certo.",
    "Não nomear medicamento nem implante comercial; não atacar outros profissionais."),
  M("BA-07", "Bastidor da primeira consulta", ["C2", "C3"], ["bastidor"], false,
    ["\"Como é a primeira consulta comigo.\"", "Chegada e acolhimento", "Conversa longa e exame", "Plano explicado", "\"Agende pela mensagem.\""],
    "Minha primeira consulta dura mais de uma hora. Te mostro por quê.",
    "Reduz a ansiedade da primeira vez, objeção escondida comum em ginecologia.",
    "Pode mostrar estrutura e equipamento; paciente só com termo de imagem (05.12)."),
  M("BA-08", "Objeção-resposta sem rodeio", ["C2", "C3"], ["reels"], true,
    ["3 objeções na tela (\"engorda?\", \"dá câncer?\", \"é para sempre?\")", "Resposta curta e honesta para cada uma", "\"A resposta certa para o seu caso só sai na consulta. Me chama.\""],
    "Reposição engorda? Dá câncer? É para sempre? Respondendo sem rodeio.",
    "Ataca de frente o que trava o agendamento; converte bem em remarketing.",
    "Respostas com nuance e contraindicações. Nada de \"100% seguro\"."),
  M("BA-09", "Para quem é e para quem não é", ["C2"], ["carrossel", "reels"], false,
    ["\"[Procedimento]: para quem é e para quem NÃO é.\"", "3 indicações", "3 situações em que não se indica", "\"Na avaliação a gente vê em qual grupo você está.\""],
    "Laser íntimo não é para todas. Eu explico quando eu indico e quando eu digo não.",
    "O \"não\" gera confiança, filtra lead e diferencia de quem só vende procedimento.",
    "Sem \"rejuvenescimento garantido\" e sem antes e depois; técnica reconhecida pelo CFM."),
  M("BA-10", "Expectativa realista", ["C2"], ["reels"], true,
    ["\"Quanto tempo leva para sentir diferença?\"", "Linha do tempo geral (semanas e meses)", "\"Varia de pessoa para pessoa porque...\"", "Convite para mensagem"],
    "Quanto tempo a reposição leva para fazer efeito? A resposta honesta.",
    "Honestidade gera confiança e reduz abandono do tratamento.",
    "Sempre dizer que varia; prazo nunca vira promessa."),
  M("BA-11", "Jornada de paciente (sem resultado)", ["C3"], ["depoimento"], true,
    ["\"Eu demorei X anos para procurar ajuda.\"", "O que a travava", "Como foi ser ouvida na consulta", "Sem números de melhora; a legenda convida para a conversa"],
    "\"Eu achava que sentir aquilo era normal para a minha idade.\" (paciente)",
    "Prova social de processo, não de resultado, para quem já está em dúvida.",
    "Termo de imagem (05.12); sem \"a melhor médica\", sem \"me curou\" e sem repetir o formato de forma sistemática. Pede ciente do médico.", "amarelo"),
  M("BA-12", "Médica responde comentário", ["C1", "C2"], ["reels"], true,
    ["Print do comentário anonimizado (\"Doutora, com 52 ainda dá tempo?\")", "Resposta em 20 segundos", "\"Manda a sua pergunta aqui.\""],
    "Recebi esse comentário e preciso responder em público.",
    "Formato nativo, reaproveita a pauta da audiência e puxa comentários.",
    "Apagar nome e foto de quem comentou."),
  M("BA-13", "Checklist de segurança", ["C1", "C2"], ["carrossel", "reels"], false,
    ["\"Antes de começar qualquer reposição, pergunte isso ao seu médico.\"", "4 ou 5 perguntas", "\"Médico bom responde todas.\"", "Seguir ou mensagem"],
    "5 perguntas para fazer antes de começar qualquer tratamento hormonal.",
    "Coloca a médica como referência de segurança; alto salvamento.",
    "Sem atacar colegas nem citar marca."),
  M("BA-14", "Quem responde no WhatsApp", ["C3"], ["bastidor"], false,
    ["\"Oi, eu sou a [nome], quem responde a sua mensagem.\"", "O que acontece quando a pessoa chama", "\"Sem robô e sem pressão: é só tirar a dúvida.\"", "Botão do WhatsApp"],
    "Quando alguém manda mensagem para a clínica, quem responde sou eu.",
    "Tira o medo de \"vão me empurrar algo\" e aumenta a conversa no clique.",
    "Sem preço nem condição especial. Termo de imagem (05.12) da colaboradora."),
  M("BA-15", "Convite direto do remarketing", ["C3"], ["reels", "imagem"], true,
    ["\"Se você tem visto meus vídeos sobre [tema]...\"", "\"...e ainda está em dúvida se é o seu caso...\"", "\"...me manda uma mensagem e a gente conversa.\"", "Nome, CRM e RQE"],
    "Se você chegou até aqui pelos meus vídeos, esse recado é para você.",
    "Fala com quem já consumiu conteúdo e tem um único passo claro.",
    "Não presumir a condição (\"já que você está na menopausa\"). Falar do conteúdo visto. Público com nome neutro."),
];

export const ETAPA_INFO: Record<Etapa, { nome: string; objetivo: string; regra: string }> = {
  C1: { nome: "C1 · Atrair", objetivo: "Ganhar seguidor certo", regra: "Patrocinar o post orgânico que mais trouxe seguidor; medir custo por seguidor." },
  C2: { nome: "C2 · Autoridade", objetivo: "Mostrar método e segurança", regra: "Patrocinar se ainda trouxer seguidor, mesmo um pouco mais caro, ou se a retenção do vídeo for boa." },
  C3: { nome: "C3 · Remarketing", objetivo: "Levar quem já viu para a conversa", regra: "Público de engajamento com nome neutro; medir custo por conversa e por consulta realizada." },
};

/** Política da casa (mais restritiva que a CFM 2.336, que permite valor e promoção sem sorteio nem venda casada). */
export const POLITICA_CASA = [
  "Sem preço, desconto ou promoção na peça (política da Doctor Creator: protege a conta e o posicionamento).",
  "Sem garantia de resultado e sem antes e depois.",
  "Nome, especialidade, CRM e RQE em toda peça.",
  "Gancho em 3ª pessoa ou na voz da médica: a Meta reprova \"Você sofre de...?\".",
];

// ---------------------------------------------------------------- peças por clínica

export type StatusPeca = "ideia" | "producao" | "aprovado" | "no_ar" | "pausado" | "arquivado";
export const ROTULO_STATUS: Record<StatusPeca, string> = { ideia: "Ideia", producao: "Em produção", aprovado: "Aprovada", no_ar: "No ar", pausado: "Pausada", arquivado: "Arquivada" };

export interface Peca {
  id: string;
  modelo: string | null;
  titulo: string;
  etapa: Etapa;
  formato: Formato;
  rosto: boolean;
  ganchos: string[];
  semaforo: Semaforo;
  ciente_em: string | null;
  status: StatusPeca;
  arquivo_url: string | null;
  campaign_id: string | null;
  reprovacao_meta: string | null;
  atualizado_em?: string | null;
}

/** Pode ir para "aprovada"? Vermelho nunca; amarelo só com o ciente do médico. */
export function podeAprovar(p: Pick<Peca, "semaforo" | "ciente_em">): { ok: boolean; motivo?: string } {
  if (p.semaforo === "vermelho") return { ok: false, motivo: "Semáforo vermelho: a peça não pode ser aprovada. Ajuste a copy." };
  if (p.semaforo === "amarelo" && !p.ciente_em) return { ok: false, motivo: "Semáforo amarelo: registre a data do ciente do médico antes de aprovar." };
  return { ok: true };
}

const PRONTA: StatusPeca[] = ["aprovado", "no_ar", "pausado"];
export const pronta = (p: Peca) => PRONTA.includes(p.status);

/** Item 16 do cronograma: pelo menos 6 peças sem rosto e os vídeos editados, aprovados. */
export function contagemCriativos(pecas: Peca[]) {
  const ativas = pecas.filter((p) => p.status !== "arquivado");
  const semRosto = ativas.filter((p) => !p.rosto && pronta(p)).length;
  const videos = ativas.filter((p) => p.rosto && pronta(p)).length;
  const videosPlanejados = ativas.filter((p) => p.rosto).length;
  return { semRosto, metaSemRosto: 6, videos, videosPlanejados };
}

/** Item 21 do cronograma: todas as peças da campanha com semáforo verde, ou amarelo com ciente. */
export function pecasAprovadas(pecas: Peca[]): { ok: boolean; pendentes: number; total: number } {
  const ativas = pecas.filter((p) => p.status !== "arquivado" && p.status !== "ideia");
  const pendentes = ativas.filter((p) => !podeAprovar(p).ok || !pronta(p)).length;
  return { ok: ativas.length > 0 && pendentes === 0, pendentes, total: ativas.length };
}

// ---------------------------------------------------------------- números (por campanha da Meta)

export interface NumerosCampanha { campaign_id: string; gasto: number; conversas: number; cliques: number; impressoes: number; dias: number; ultimos7Gasto: number; ultimos7Conversas: number; anteriores7Gasto: number; anteriores7Conversas: number }

export type Selo = "vencedor" | "cansou" | "aprendendo" | null;

/** Selo de C3 pela conversa: custo por conversa ≤ mediana da clínica e 7+ dias no ar = vencedor; custo por conversa
 *  subiu 30%+ na última semana com a mesma verba = cansou (regra de fadiga V3). C1/C2 dependem de seguidores, que a
 *  Meta não entrega por campanha: ficam "aprendendo" até o Gestor marcar. */
export function seloDaPeca(p: Peca, n: NumerosCampanha | undefined, medianaCustoConversa: number | null): Selo {
  if (!n || n.gasto <= 0) return null;
  if (n.dias < 7) return "aprendendo";
  const cpAtual = n.ultimos7Conversas > 0 ? n.ultimos7Gasto / n.ultimos7Conversas : null;
  const cpAntes = n.anteriores7Conversas > 0 ? n.anteriores7Gasto / n.anteriores7Conversas : null;
  if (cpAtual !== null && cpAntes !== null && cpAtual >= cpAntes * 1.3) return "cansou";
  if (p.etapa !== "C3") return "aprendendo";
  const cp = n.conversas > 0 ? n.gasto / n.conversas : null;
  if (cp !== null && medianaCustoConversa !== null && cp <= medianaCustoConversa) return "vencedor";
  return null;
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Placar do modelo entre clínicas: quantas peças, quantas no ar, quantas reprovadas pela Meta. */
export function placarModelos(pecas: (Peca & { clinica_id: string })[]): Map<string, { clinicas: number; pecas: number; noAr: number; reprovadas: number }> {
  const m = new Map<string, { clinicas: Set<string>; pecas: number; noAr: number; reprovadas: number }>();
  for (const p of pecas) {
    if (!p.modelo) continue;
    const a = m.get(p.modelo) ?? { clinicas: new Set<string>(), pecas: 0, noAr: 0, reprovadas: 0 };
    a.clinicas.add(p.clinica_id); a.pecas++; if (p.status === "no_ar") a.noAr++; if (p.reprovacao_meta) a.reprovadas++;
    m.set(p.modelo, a);
  }
  return new Map([...m].map(([k, v]) => [k, { clinicas: v.clinicas.size, pecas: v.pecas, noAr: v.noAr, reprovadas: v.reprovadas }]));
}

/** Avisos automáticos na copy (antes de mandar para o médico). Não substitui a revisão humana. */
export function avisosCopy(texto: string): string[] {
  const t = texto.toLowerCase();
  const out: string[] = [];
  if (/r\$\s?\d|\bpre[çc]o\b|\bdesconto\b|promo[çc][ãa]o|\boff\b|% de desconto/.test(t)) out.push("Fala de preço, desconto ou promoção: política da casa não permite.");
  if (/\bgarant|100% segur|sem risco|resultado garantido|definitiv/.test(t)) out.push("Promete resultado ou segurança total.");
  if (/\bvoc[êe] (sofre|tem|luta|est[áa] com|sente)\b/.test(t)) out.push("Gancho em 2ª pessoa sobre a saúde de quem vê: a Meta reprova. Use 3ª pessoa ou a voz da médica.");
  if (/antes e depois/.test(t)) out.push("Antes e depois: só com as condições da CFM 2.336 e ciente do médico.");
  if (/\bo melhor\b|\ba melhor\b|n[ºo°] ?1|\bnúmero 1\b/.test(t)) out.push("Superlativo de superioridade (\"o melhor\", \"nº 1\").");
  return out;
}
