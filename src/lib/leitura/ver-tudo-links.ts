// As respostas dos blocos dos Detalhes de De onde vêm › Links (quick-ver-tudo-abas, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão, sem promessa e sem causa que o dado não
// prova (o link "tem" vendas; nunca "trouxe"). Módulo puro.
import { enfase, faltaDado, inteiro, maiorItem, porCento, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Do clique à venda: a passagem que mais perde, em "de cada 100". Sem clique, "Falta dado". */
export function cabecaDoCliqueAVenda(e: { cliques: number; conversas: number; agendou: number; vendas: number }): CabecaDoBloco {
  if (e.cliques <= 0) return faltaDado("nenhum clique nos links no período");
  const passagens = [
    { de: e.cliques, para: e.conversas, frase: (n: string) => [{ texto: "De cada 100 cliques, " }, enfase(n), { texto: " viram conversa." }] },
    { de: e.conversas, para: e.agendou, frase: (n: string) => [{ texto: "De cada 100 conversas, " }, enfase(n), { texto: " agendaram." }] },
    { de: e.agendou, para: e.vendas, frase: (n: string) => [{ texto: "De cada 100 que agendaram, " }, enfase(n), { texto: " viraram venda." }] },
  ].filter((p) => p.de > 0 && p.para <= p.de);
  if (passagens.length === 0) return faltaDado("nenhuma conversa ligada aos links no período");
  const pior = passagens.reduce((a, b) => (b.para / b.de < a.para / a.de ? b : a));
  return primeiraQueCabe([pior.frase(inteiro(Math.round((pior.para / pior.de) * 100)))], "atencao", "nenhuma conversa ligada aos links no período");
}

export interface LugarDoBloco {
  nome: string;
  cliques: number;
  conversas: number;
  agendou: number;
  vendas: number;
}

/** Mínimo de cliques para um lugar disputar "vira mais conversa" (um lugar com 3 cliques não ganha). */
export const MIN_CLIQUES_DO_LUGAR = 20;

/**
 * Por lugar, em números: o que o gráfico do topo não mostra. O lugar com mais vendas; sem venda, com mais agendamentos; sem agendamento,
 * o que mais vira conversa por clique (só com cliques suficientes).
 */
export function cabecaPorLugar(lugares: readonly LugarDoBloco[]): CabecaDoBloco {
  const falta = "nenhum lugar com venda, agendamento ou cliques suficientes";
  for (const [campo, rotulo] of [
    ["vendas", "vendas"],
    ["agendou", "agendamentos"],
  ] as const) {
    const maior = maiorItem(lugares.map((l) => ({ nome: l.nome, valor: l[campo] })), 1);
    if (maior) {
      return primeiraQueCabe(
        [
          [{ texto: `${maior.nome} tem mais ${rotulo}: ` }, enfase(inteiro(maior.valor)), { texto: ` de ${inteiro(maior.total)}.` }],
          [{ texto: `O lugar com mais ${rotulo} tem ` }, enfase(inteiro(maior.valor)), { texto: ` de ${inteiro(maior.total)}.` }],
        ],
        "neutro",
        falta,
      );
    }
  }
  const comBase = lugares.filter((l) => l.cliques >= MIN_CLIQUES_DO_LUGAR);
  if (comBase.length < 2) return faltaDado(falta);
  const melhor = comBase.reduce((a, b) => (b.conversas / b.cliques > a.conversas / a.cliques ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `${melhor.nome} vira mais conversa: ` }, enfase(porCento(melhor.conversas / melhor.cliques)), { texto: " dos cliques." }],
      [{ texto: "O lugar que mais vira conversa tem " }, enfase(porCento(melhor.conversas / melhor.cliques)), { texto: " dos cliques." }],
    ],
    "neutro",
    falta,
  );
}

/**
 * Todos os links: quantos links ativos ficaram sem conversa no período (o link com mais conversas, pelo nome, já é descoberta no topo
 * da aba e não se repete aqui).
 */
export function cabecaDosLinks(links: readonly { conversas: number; ativo: boolean }[]): CabecaDoBloco {
  const falta = "nenhum link criado para esta clínica";
  if (links.length === 0) return faltaDado(falta);
  const ativos = links.filter((l) => l.ativo);
  if (ativos.length === 0) return primeiraQueCabe([[{ texto: "Nenhum dos " }, enfase(inteiro(links.length)), { texto: links.length === 1 ? " link está ativo." : " links está ativo." }]], "atencao", falta);
  const semConversa = ativos.filter((l) => l.conversas <= 0).length;
  if (semConversa > 0) {
    return primeiraQueCabe(
      [[enfase(inteiro(semConversa)), { texto: ` dos ${inteiro(ativos.length)} links ativos ${semConversa === 1 ? "ficou" : "ficaram"} sem conversa no período.` }]],
      "atencao",
      falta,
    );
  }
  return primeiraQueCabe(
    [ativos.length === 1 ? [enfase("1"), { texto: " link ativo, com conversa no período." }] : [{ texto: "Os " }, enfase(inteiro(ativos.length)), { texto: " links ativos tiveram conversa no período." }]],
    "bom",
    falta,
  );
}
