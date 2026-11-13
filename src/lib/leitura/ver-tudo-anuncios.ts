// As respostas dos blocos do "Ver tudo" de Anúncios (quick-ver-tudo, 13/11/2026): cada bloco abre com UMA frase tirada dos dados do
// PRÓPRIO bloco, com o número em destaque. Só dados medidos desta clínica; sem dado, "Falta dado". Nunca compara com outras clínicas,
// sem jargão (nada de CPL, CTR, "mediana") e sem promessa. Módulo puro.
import { comMaiuscula, diaCurto, enfase, faltaDado, maiorItem, melhorDiaDaSemana, diaDePico, inteiro, porCento, primeiraQueCabe, reais, umaCasa, vezes, type CabecaDoBloco } from "./cabeca-do-bloco";

// A comparação com o período anterior é regra de todas as telas: mora em cabeca-do-bloco.ts.
export { cabecaDoComparativo, type LinhaDoComparativo } from "./cabeca-do-bloco";

/** Um dia de anúncio (os mesmos números do gráfico por dia). */
export interface DiaDoBloco {
  dia: string;
  gasto: number;
  conversas: number;
}

/** Nome de campanha que cabe na frase (entre aspas); nome longo demais faz a regra usar a frase sem nome. */
const nome = (t: string) => `“${t.replace(/\s+/g, " ").trim()}”`;

/** Investimento e conversas por dia: o dia da semana que mais traz conversa (quando se destaca), senão o dia de pico, senão "parecidas". */
export function cabecaDoDiaADia(dias: readonly DiaDoBloco[]): CabecaDoBloco {
  const serie = dias.map((d) => ({ dia: d.dia, valor: d.conversas }));
  const semana = melhorDiaDaSemana(serie);
  if (semana && semana.media >= semana.mediaGeral * 1.1) {
    return primeiraQueCabe([[{ texto: `${comMaiuscula(semana.dia)} é o dia com mais conversas: ` }, enfase(umaCasa(semana.media)), { texto: " em média." }]], "neutro", "poucos dias com conversa");
  }
  const pico = diaDePico(serie);
  if (pico && pico.valor >= pico.media * 1.5) {
    const gasto = dias.find((d) => d.dia === pico.dia)?.gasto;
    return primeiraQueCabe(
      [
        [{ texto: `O dia de mais conversas foi ${diaCurto(pico.dia)}: ` }, enfase(inteiro(pico.valor)), { texto: gasto != null ? `, com ${reais(gasto)} investidos.` : "." }],
        [{ texto: `O dia de mais conversas foi ${diaCurto(pico.dia)}: ` }, enfase(inteiro(pico.valor)), { texto: "." }],
      ],
      "neutro",
      "poucos dias com conversa",
    );
  }
  if (pico) {
    return primeiraQueCabe([[{ texto: "As conversas vieram parecidas todo dia: " }, enfase(umaCasa(pico.media)), { texto: " por dia, em média." }]], "neutro", "poucos dias com conversa");
  }
  return faltaDado("poucos dias com conversa para comparar um dia com o outro");
}

/** Do anúncio à conversa: de cada 100 cliques no link, quantos viram conversa. */
export function cabecaDoAnuncioAConversa(e: { aparicoes: number; cliques: number; conversas: number }): CabecaDoBloco {
  if (e.cliques <= 0) return faltaDado("nenhum clique no link no período");
  const porCem = (e.conversas / e.cliques) * 100;
  return primeiraQueCabe([[{ texto: "De cada 100 cliques no link, " }, enfase(umaCasa(porCem)), { texto: porCem === 1 ? " vira conversa." : " viram conversa." }]], porCem >= 5 ? "bom" : "neutro", "nenhum clique no link no período");
}

export interface CampanhaDoBloco {
  campanha: string;
  gasto: number;
  conversas: number;
  /** O resultado do objetivo da campanha (conversa, clique, cadastro, aparições). */
  resultados: number;
  custoPorConversa: number | null;
  /** O diagnóstico marcou a campanha sem nenhum resultado do objetivo dela ("Atrai mas não converte" ou "Sem tração"). */
  semResultado?: boolean;
}

/** Onde a verba foi gasta: a campanha que mais gastou, com a fatia da verba e das conversas. */
export function cabecaDeOndeFoiAVerba(campanhas: readonly CampanhaDoBloco[]): CabecaDoBloco {
  const total = campanhas.reduce((s, c) => s + c.gasto, 0);
  const conversas = campanhas.reduce((s, c) => s + c.conversas, 0);
  const maior = maiorItem(campanhas.map((c) => ({ nome: c.campanha, valor: c.gasto })), 1);
  if (!maior || total <= 0) return faltaDado("nenhum investimento por campanha no período");
  const c = campanhas.find((x) => x.campanha === maior.nome)!;
  const fatia = porCento(c.gasto / total);
  const dasConversas = conversas > 0 ? ` e ${porCento(c.conversas / conversas)} das conversas` : "";
  return primeiraQueCabe(
    [
      [{ texto: `${nome(c.campanha)} levou ` }, enfase(fatia), { texto: ` da verba${dasConversas}.` }],
      [{ texto: "A campanha que mais gastou levou " }, enfase(fatia), { texto: ` da verba${dasConversas}.` }],
    ],
    "neutro",
    "nenhum investimento por campanha no período",
  );
}

/**
 * Diagnóstico das campanhas: a campanha com conversa mais cara contra a típica da conta (quando passa de 1,5×); senão a que mais gastou
 * sem trazer resultado do objetivo; senão a que trouxe mais conversas, com o custo de cada uma.
 */
export function cabecaDasCampanhas(campanhas: readonly CampanhaDoBloco[], custoTipico: number | null): CabecaDoBloco {
  if (campanhas.length === 0) return faltaDado("nenhuma campanha com gasto no período");
  if (custoTipico != null && custoTipico > 0) {
    const cara = [...campanhas].filter((c) => c.conversas > 0 && c.custoPorConversa != null).sort((a, b) => b.custoPorConversa! - a.custoPorConversa!)[0];
    const x = cara ? vezes(cara.custoPorConversa!, custoTipico) : null;
    if (cara && x && cara.custoPorConversa! >= custoTipico * 1.5) {
      return primeiraQueCabe(
        [
          [{ texto: `${nome(cara.campanha)} custou ` }, enfase(x), { texto: ` a típica da conta: ${reais(cara.custoPorConversa!)} por conversa.` }],
          [{ texto: "A conversa mais cara custou " }, enfase(x), { texto: ` a típica da conta: ${reais(cara.custoPorConversa!)}.` }],
        ],
        "ruim",
        "nenhuma campanha com conversa no período",
      );
    }
  }
  const total = campanhas.reduce((s, c) => s + c.gasto, 0);
  const semResultado = campanhas.filter((c) => (c.semResultado || (c.resultados <= 0 && c.conversas <= 0)) && c.gasto > 0);
  if (semResultado.length > 0 && total > 0) {
    const gasto = semResultado.reduce((s, c) => s + c.gasto, 0);
    const uma = semResultado.length === 1 ? semResultado[0] : null;
    return primeiraQueCabe(
      [
        uma ? [{ texto: `${nome(uma.campanha)} levou ` }, enfase(porCento(gasto / total)), { texto: ` da verba (${reais(gasto)}) sem nenhum resultado.` }] : null,
        [enfase(porCento(gasto / total)), { texto: ` da verba (${reais(gasto)}) foi para campanhas sem nenhum resultado.` }],
      ],
      "ruim",
      "nenhuma campanha com gasto no período",
    );
  }
  const melhor = [...campanhas].filter((c) => c.conversas > 0).sort((a, b) => b.conversas - a.conversas)[0];
  if (melhor && melhor.custoPorConversa != null) {
    return primeiraQueCabe(
      [
        [{ texto: `${nome(melhor.campanha)} trouxe ` }, enfase(inteiro(melhor.conversas)), { texto: ` conversas, a ${reais(melhor.custoPorConversa)} cada.` }],
        [{ texto: "A campanha que mais trouxe conversa trouxe " }, enfase(inteiro(melhor.conversas)), { texto: "." }],
      ],
      "bom",
      "nenhuma campanha com conversa no período",
    );
  }
  return faltaDado("nenhuma campanha com conversa no período");
}

export interface ObjetivoDoBloco {
  nome: string;
  gasto: number;
  conversas: number;
}

/**
 * Para onde foi a verba, por objetivo: quando a conversa de um objetivo saiu mais cara que a do mais barato, quantas vezes; senão o
 * objetivo que levou mais verba, com as conversas que trouxe.
 */
export function cabecaPorObjetivo(objetivos: readonly ObjetivoDoBloco[], comparacao: { caro: string; barato: string; vezes: number | null } | null): CabecaDoBloco {
  if (comparacao?.vezes != null && comparacao.vezes >= 1.5) {
    const x = `${umaCasa(comparacao.vezes)}×`;
    return primeiraQueCabe([[{ texto: `A conversa de ${comparacao.caro} custou ` }, enfase(x), { texto: ` a de ${comparacao.barato}.` }]], "atencao", "nenhum objetivo com gasto no período");
  }
  const total = objetivos.reduce((s, o) => s + o.gasto, 0);
  const maior = maiorItem(objetivos.map((o) => ({ nome: o.nome, valor: o.gasto })), 1);
  if (!maior || total <= 0) return faltaDado("nenhum objetivo com gasto no período");
  const o = objetivos.find((x) => x.nome === maior.nome)!;
  return primeiraQueCabe(
    [
      [{ texto: `${comMaiuscula(o.nome)} levou ` }, enfase(porCento(o.gasto / total)), { texto: ` da verba e trouxe ${inteiro(o.conversas)} ${o.conversas === 1 ? "conversa" : "conversas"}.` }],
      [{ texto: "O objetivo que mais gastou levou " }, enfase(porCento(o.gasto / total)), { texto: " da verba." }],
    ],
    "neutro",
    "nenhum objetivo com gasto no período",
  );
}

/** O plano: quantas campanhas pedem mudança de verba agora (contadas do próprio plano). */
export function cabecaDoPlano(itens: number, suspeito: boolean): CabecaDoBloco {
  if (suspeito) return faltaDado("o rastreio das conversas está suspeito; corrigir antes de mexer na verba");
  if (itens <= 0) return primeiraQueCabe([[enfase("Nenhuma"), { texto: " campanha pede mudança de verba agora." }]], "bom", "sem plano no período");
  return primeiraQueCabe([[enfase(inteiro(itens)), { texto: itens === 1 ? " campanha pede mudança de verba agora." : " campanhas pedem mudança de verba agora." }]], "atencao", "sem plano no período");
}

/** Qualidade do lead por campanha: quantos leads do período trazem a campanha de origem (sem isso, o lead não se liga ao anúncio). */
export function cabecaDaQualidadeDosLeads(e: { leadsDoPeriodo: number; leadsComCampanha: number }): CabecaDoBloco {
  if (e.leadsDoPeriodo <= 0) return faltaDado("nenhum lead do CRM no período");
  return primeiraQueCabe(
    [[{ texto: "Dos leads do período, " }, enfase(`${inteiro(e.leadsComCampanha)} de ${inteiro(e.leadsDoPeriodo)}`), { texto: " trazem a campanha de origem." }]],
    e.leadsComCampanha === 0 ? "atencao" : "neutro",
    "nenhum lead do CRM no período",
  );
}

/** Posts impulsionados: quantos e quanto somaram. */
export function cabecaDosImpulsionados(itens: readonly { gasto: number }[]): CabecaDoBloco {
  if (itens.length === 0) return faltaDado("nenhum post impulsionado no período");
  const total = itens.reduce((s, i) => s + i.gasto, 0);
  return primeiraQueCabe(
    [[enfase(inteiro(itens.length)), { texto: `${itens.length === 1 ? " post impulsionado somou" : " posts impulsionados somaram"} ${reais(total)} no período.` }]],
    "neutro",
    "nenhum post impulsionado no período",
  );
}

/** O que o painel ainda não consegue dizer: quantas lacunas. */
export function cabecaDasLimitacoes(n: number): CabecaDoBloco {
  if (n <= 0) return primeiraQueCabe([[enfase("Nada"), { texto: " fica sem medir nestes anúncios." }]], "bom", "sem lista de limitações");
  return primeiraQueCabe([[{ texto: "O painel ainda não mede " }, enfase(inteiro(n)), { texto: n === 1 ? " coisa destes anúncios." : " coisas destes anúncios." }]], "atencao", "sem lista de limitações");
}
