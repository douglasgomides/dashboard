// De onde vêm os pacientes › Instagram (Conteúdo × Comercial) (quick-ver-tudo-abas, João 13/11/2026). A "Leitura do período" saiu da aba:
// o que ela dizia e a aba ainda não mostra virou descoberta (leitura-em-descobertas.ts), e cada bloco que ficou nos Detalhes abre com UMA
// frase daqui, tirada dos dados do PRÓPRIO bloco, com o número em destaque. Sem dado, "Falta dado". Só números desta clínica, sem jargão,
// sem promessa, e o cruzamento continua dizendo "coincidência, não prova" (a origem por post não é medida). Módulo puro.
import type { Descoberta } from "./cinco-segundos";
import { enfase, faltaDado, inteiro, porCento, primeiraQueCabe, reais, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Muda quando uma regra daqui muda. */
export const VERSAO_REGRAS_VER_TUDO_CONTEUDO_COMERCIAL = 1;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

/** Os fatos que os 4 cartões do topo já dizem com outras palavras (conversas em dia com post × sem post). */
export const JA_DITOS_NO_TOPO = ["efeito-post", "efeito-sem-par"] as const;

/**
 * A descoberta que só repete o aviso "origem por post não medida" dos Detalhes sai (o aviso fica, com o porquê e quem resolve); as outras
 * ficam. `aviso` é o texto do aviso (SEM_LEITURA_ORIGEM_POR_POST).
 */
export function semRepetirOAviso(itens: readonly Descoberta[], aviso: string): Descoberta[] {
  const a = normal(aviso);
  // A frase do passo pode vir cortada em 90 caracteres ("…por post (falta dado."): basta falar da origem por post.
  const repete = (t: string) => t.includes(a) || (t.includes("origem") && t.includes("por post"));
  return itens.filter((d) => !repete(normal(`${d.frase} ${d.acao.rotulo} ${d.porque.titulo}`)));
}

/**
 * Os temas que uma descoberta à vista já mostra COM o número ("Canetas emagrecedoras (30)" no número em destaque) não voltam na lista
 * "Pedem, mas não teve post" dos Detalhes. Só o passo ("Publicar um post sobre…") não basta: o número continua na lista.
 */
export function temasJaDitos<T extends { tema: string }>(temas: readonly T[], visiveis: readonly Descoberta[]): T[] {
  const texto = normal(visiveis.map((d) => d.impacto ?? "").join(" "));
  return temas.filter((t) => !texto.includes(normal(t.tema)));
}

/** Tema do post × assunto da conversa: o assunto que mais trouxe gente, e quantos agendaram. */
export function cabecaDosTemas(temas: readonly { tema: string; quem: number; agendaram: number }[], unidade: "pessoas" | "conversas"): CabecaDoBloco {
  const validos = temas.filter((t) => t.quem > 0);
  if (!validos.length) return faltaDado("ainda sem temas lidos neste período");
  const maior = validos.reduce((a, b) => (b.quem > a.quem ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `"${maior.tema}" é o assunto que mais trouxe gente: ` }, enfase(`${inteiro(maior.quem)} ${unidade}`), { texto: `, ${inteiro(maior.agendaram)} agendaram.` }],
      [{ texto: `"${maior.tema}" trouxe mais gente: ` }, enfase(`${inteiro(maior.quem)} ${unidade}`), { texto: "." }],
      [enfase(`${inteiro(maior.quem)} ${unidade}`), { texto: " chegaram falando do assunto que mais trouxe gente." }],
    ],
    "neutro",
    "ainda sem temas lidos neste período",
  );
}

/** Dia da semana e hora: onde começam mais conversas. */
export function cabecaDaGrade(grade: readonly { dow: number; hora: number; conversas: number }[]): CabecaDoBloco {
  const comConversa = grade.filter((g) => g.conversas > 0);
  if (!comConversa.length) return faltaDado("nenhuma conversa começou neste período");
  const pico = comConversa.reduce((a, b) => (b.conversas > a.conversas ? b : a));
  return primeiraQueCabe(
    [[{ texto: `Mais conversas começam ${DIAS[pico.dow] ?? "num dia"} perto das ${pico.hora}h: ` }, enfase(inteiro(pico.conversas)), { texto: "." }]],
    "neutro",
    "nenhuma conversa começou neste período",
  );
}

/** Posts que atraem quem quer comprar: quantos comentários pedem preço, horário ou contato, e em quantos posts. */
export function cabecaDosComentariosDeCompra(c: { total: number; compra: number; posts_com_compra: number } | null): CabecaDoBloco {
  if (!c) return faltaDado("não deu para ler os comentários agora");
  if (!(c.total > 0)) return faltaDado("nenhum comentário guardado neste período");
  if (c.compra <= 0) return primeiraQueCabe([[enfase("Nenhum"), { texto: ` dos ${inteiro(c.total)} comentários pede preço, horário ou contato.` }]], "neutro", "sem comentários");
  return primeiraQueCabe(
    [
      [enfase(`${inteiro(c.compra)} de ${inteiro(c.total)}`), { texto: ` comentários, em ${inteiro(c.posts_com_compra)} posts, pedem preço, horário ou contato.` }],
      [enfase(`${inteiro(c.compra)} de ${inteiro(c.total)}`), { texto: " comentários pedem preço, horário ou contato." }],
    ],
    "neutro",
    "nenhum comentário guardado neste período",
  );
}

/** Etapa do funil por semana: a semana com mais conversas. */
export function cabecaDasSemanas(semanas: readonly { semana: string; conversas: number }[]): CabecaDoBloco {
  if (semanas.length < 2) return faltaDado("menos de 2 semanas com etapa do funil no período");
  const maior = semanas.reduce((a, b) => (b.conversas > a.conversas ? b : a));
  if (!(maior.conversas > 0)) return faltaDado("nenhuma conversa nas semanas do período");
  const dia = `${maior.semana.slice(8, 10)}/${maior.semana.slice(5, 7)}`;
  return primeiraQueCabe([[{ texto: `A semana de ${dia} teve mais conversas: ` }, enfase(inteiro(maior.conversas)), { texto: "." }]], "neutro", "nenhuma conversa nas semanas do período");
}

/**
 * Tempo da primeira resposta × agendamento: a faixa em que menos gente agendou (a melhor já pode estar numa descoberta). "Não é prova"
 * continua no "Como ler" do bloco.
 */
export function cabecaDaResposta(faixas: readonly { rotulo: string; conversas: number; agendaram: number }[], minimo: number): CabecaDoBloco {
  const medidas = faixas.filter((f) => f.conversas >= minimo);
  if (medidas.length < 2) return faltaDado(`poucas conversas em horário comercial para comparar (mínimo de ${minimo})`);
  const pior = medidas.reduce((a, b) => (b.agendaram / b.conversas < a.agendaram / a.conversas ? b : a));
  return primeiraQueCabe(
    [[{ texto: `${pior.rotulo}: só ` }, enfase(porCento(pior.agendaram / pior.conversas)), { texto: ` agendaram, em ${inteiro(pior.conversas)} conversas.` }]],
    "atencao",
    "poucas conversas em horário comercial para comparar",
  );
}

/** Tema da conversa × venda fechada: o tema que mais faturou (só com valor preenchido no CRM). */
export function cabecaDaVendaPorTema(temas: readonly { tema: string; ganhos: number; receita: number }[]): CabecaDoBloco {
  if (!temas.length) return faltaDado("ainda sem conversas com tema lido no período");
  const comValor = temas.filter((t) => t.receita > 0);
  if (comValor.length) {
    const maior = comValor.reduce((a, b) => (b.receita > a.receita ? b : a));
    return primeiraQueCabe(
      [[{ texto: `"${maior.tema}" faturou mais: ` }, enfase(reais(maior.receita)), { texto: ` em ${inteiro(maior.ganhos)} ${maior.ganhos === 1 ? "venda" : "vendas"}.` }]],
      "bom",
      "sem valor de venda preenchido no CRM",
    );
  }
  const maisVendas = temas.reduce((a, b) => (b.ganhos > a.ganhos ? b : a));
  if (maisVendas.ganhos <= 0) return faltaDado("nenhuma conversa com tema virou venda marcada no CRM");
  return primeiraQueCabe([[{ texto: `"${maisVendas.tema}" teve mais vendas: ` }, enfase(inteiro(maisVendas.ganhos)), { texto: "; o valor não foi preenchido." }]], "neutro", "sem venda marcada");
}

/** Uma lista em barras (objeções, assuntos): o item que mais aparece. */
export function cabecaDoMaisComum(itens: readonly { nome: string; n: number }[], o: { oQue: string; unidade: string; vazio: string }): CabecaDoBloco {
  const validos = itens.filter((i) => i.n > 0);
  if (!validos.length) return faltaDado(o.vazio);
  const maior = validos.reduce((a, b) => (b.n > a.n ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `"${maior.nome}" é ${o.oQue}: ` }, enfase(`${inteiro(maior.n)} ${o.unidade}`), { texto: "." }],
      [enfase(`${inteiro(maior.n)} ${o.unidade}`), { texto: ` no item que mais aparece.` }],
    ],
    "neutro",
    o.vazio,
  );
}
