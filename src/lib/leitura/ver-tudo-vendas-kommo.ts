// As respostas dos blocos dos Detalhes de De onde vêm › Por origem (quick-ver-tudo-abas, 13/11/2026): UMA frase tirada dos dados do
// PRÓPRIO bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica (nunca outras clínicas), sem jargão e sem
// promessa. O "ganho" do CRM pode ser só agendamento: a frase diz "ganhos", nunca "vendas". Módulo puro.
import { enfase, faltaDado, inteiro, maiorItem, porCento, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Fatia de cada origem: a origem com a maior parte dos leads. */
export function cabecaDaFatiaDeCadaOrigem(fatias: readonly { rotulo: string; valor: number }[]): CabecaDoBloco {
  const falta = "nenhuma origem com leads no CRM";
  const maior = maiorItem(
    fatias.filter((f) => f.rotulo !== "Outras origens").map((f) => ({ nome: f.rotulo, valor: f.valor })),
    1,
  );
  if (!maior) return faltaDado(falta);
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const parte = porCento(maior.valor / total);
  return primeiraQueCabe(
    [
      [{ texto: `"${maior.nome}" tem ` }, enfase(parte), { texto: " dos leads do CRM." }],
      [{ texto: "A maior origem tem " }, enfase(parte), { texto: " dos leads do CRM." }],
    ],
    "neutro",
    falta,
  );
}

/**
 * A tabela por fonte só fica nos Detalhes quando mostra o que o gráfico do topo não mostra: as origens que não cabem nele ou os cards
 * fechados sem resultado. A frase diz isso.
 */
export function cabecaDaTabelaPorFonte(e: { origens: number; noGrafico: number; leadsForaDoGrafico: number; fechados: number }): CabecaDoBloco {
  const falta = "nenhuma origem além das do gráfico";
  const fora = e.origens - e.noGrafico;
  if (fora > 0) {
    return primeiraQueCabe(
      [[{ texto: `${inteiro(fora)} ${fora === 1 ? "origem não cabe" : "origens não cabem"} no gráfico e ${fora === 1 ? "soma" : "somam"} ` }, enfase(inteiro(e.leadsForaDoGrafico)), { texto: " leads." }]],
      "neutro",
      falta,
    );
  }
  if (e.fechados > 0) {
    return primeiraQueCabe([[enfase(inteiro(e.fechados)), { texto: " cards foram fechados no CRM sem dizer se ganharam ou perderam." }]], "atencao", falta);
  }
  return faltaDado(falta);
}

/** Por tipo de procedimento: o procedimento com mais ganhos (sem ganho, o com mais leads). */
export function cabecaDoProcedimento(linhas: readonly { chave: string; total: number; ganhos: number }[], naoInformado: string): CabecaDoBloco {
  const falta = "o CRM não tem o tipo de procedimento preenchido nos cards";
  const informados = linhas.filter((l) => l.chave !== naoInformado);
  const porGanho = maiorItem(informados.map((l) => ({ nome: l.chave, valor: l.ganhos })), 1);
  if (porGanho) {
    return primeiraQueCabe(
      [
        [{ texto: `"${porGanho.nome}" é o procedimento com mais ganhos: ` }, enfase(inteiro(porGanho.valor)), { texto: "." }],
        [{ texto: "O procedimento com mais ganhos tem " }, enfase(inteiro(porGanho.valor)), { texto: "." }],
      ],
      "neutro",
      falta,
    );
  }
  const porLead = maiorItem(informados.map((l) => ({ nome: l.chave, valor: l.total })), 1);
  if (!porLead) return faltaDado(falta);
  return primeiraQueCabe(
    [
      [{ texto: `"${porLead.nome}" é o procedimento com mais leads: ` }, enfase(inteiro(porLead.valor)), { texto: ", nenhum com ganho." }],
      [{ texto: "Nenhum procedimento tem ganho; o maior tem " }, enfase(inteiro(porLead.valor)), { texto: " leads." }],
    ],
    "atencao",
    falta,
  );
}

/** Leads por etapa (todos os funis): a etapa com mais cards. */
export function cabecaDasEtapas(linhas: readonly { pipeline: string; etapa: string; total: number }[]): CabecaDoBloco {
  const falta = "o CRM não devolveu as etapas";
  const maior = maiorItem(linhas.map((l) => ({ nome: l.etapa, valor: l.total })), 1);
  if (!maior) return faltaDado(falta);
  return primeiraQueCabe(
    [
      [{ texto: `A etapa com mais cards é "${maior.nome}": ` }, enfase(inteiro(maior.valor)), { texto: ` de ${inteiro(maior.total)}.` }],
      [{ texto: "A etapa com mais cards tem " }, enfase(inteiro(maior.valor)), { texto: ` de ${inteiro(maior.total)}.` }],
    ],
    "neutro",
    falta,
  );
}
