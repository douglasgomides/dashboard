// As respostas dos blocos do "Ver tudo" de Resultados da clínica (quick-ver-tudo, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica (nunca outras clínicas), sem jargão e sem promessa.
// Módulo puro.
import { checarFraseCinco } from "./cinco-segundos";
import { enfase, faltaDado, inteiro, porCento, primeiraQueCabe, reais, type CabecaDoBloco } from "./cabeca-do-bloco";

/** O dinheiro do período: faturamento das vendas com valor; sem ele, o investimento em anúncio de aquisição; sem os dois, Falta dado. */
export function cabecaDoDinheiro(e: { faturamento: { valor: number; vendas: number } | null; investido: number | null }): CabecaDoBloco {
  if (e.faturamento && e.faturamento.vendas > 0) {
    const v = e.faturamento.vendas;
    return primeiraQueCabe([[enfase(inteiro(v)), { texto: `${v === 1 ? " venda somou" : " vendas somaram"} ${reais(e.faturamento.valor)} no período.` }]], "neutro", "nenhuma venda com valor neste período");
  }
  if (e.investido != null && e.investido > 0) {
    return primeiraQueCabe([[enfase(reais(e.investido)), { texto: " investidos em anúncio de aquisição no período." }]], "neutro", "nenhuma venda com valor neste período");
  }
  return faltaDado("nenhuma venda com valor neste período");
}

/**
 * Todas as análises do período: quantas ações a semana pede (a lista "O que fazer nesta semana"), com o título do resumo do período quando
 * ele cabe e passa nas guardas.
 */
export function cabecaDasAnalises(e: { titulo: string | null; acoesDaSemana: number }): CabecaDoBloco {
  const n = e.acoesDaSemana;
  const acoes = n === 1 ? " ação para esta semana." : " ações para esta semana.";
  const titulo = e.titulo?.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "") ?? "";
  const comTitulo = titulo && checarFraseCinco(titulo).length === 0 ? [{ texto: `${titulo}: ` }, enfase(inteiro(n)), { texto: acoes }] : null;
  if (n <= 0) return primeiraQueCabe([titulo ? [{ texto: `${titulo}: ` }, enfase("nenhuma"), { texto: " ação urgente esta semana." }] : null, [enfase("Nenhuma"), { texto: " ação urgente esta semana." }]], "neutro", "sem análise neste período");
  return primeiraQueCabe([comTitulo, [enfase(inteiro(n)), { texto: acoes }]], "atencao", "sem análise neste período");
}

/** Resultados do Instagram: o alcance do período e a mudança contra o período anterior (quando há). */
export function cabecaDoInstagramDoPeriodo(e: { alcance: number | null; variacaoPct: number | null; unico: boolean }): CabecaDoBloco {
  if (e.alcance == null || e.alcance <= 0) return faltaDado("sem dado do Instagram neste período");
  const quem = e.unico ? "pessoas" : "de alcance, somando os dias";
  const v = e.variacaoPct;
  if (v != null && Math.abs(v) >= 3) {
    return primeiraQueCabe(
      [[enfase(inteiro(e.alcance)), { texto: ` ${quem}: ${porCento(Math.abs(v) / 100)} ${v > 0 ? "acima" : "abaixo"} do período anterior.` }]],
      v > 0 ? "bom" : "ruim",
      "sem dado do Instagram neste período",
    );
  }
  return primeiraQueCabe([[enfase(inteiro(e.alcance)), { texto: ` ${quem}${v != null ? ", igual ao período anterior." : " no período."}` }]], "neutro", "sem dado do Instagram neste período");
}

/** Retorno do investimento: o retorno quando dá para calcular; senão quantos itens faltam; senão o motivo. */
export function cabecaDoRetorno(e: { calculavel: boolean; roi: number | null; pendentes: number; motivo: string | null }): CabecaDoBloco {
  if (e.calculavel && e.roi != null) {
    const pct = `${e.roi >= 0 ? "+" : "−"}${inteiro(Math.abs(e.roi) * 100)}%`;
    return primeiraQueCabe([[{ texto: "O retorno do investimento no período foi de " }, enfase(pct), { texto: "." }]], e.roi >= 0 ? "bom" : "ruim", "falta dado para o retorno");
  }
  if (e.pendentes > 0) {
    return primeiraQueCabe([[{ texto: "Para o retorno aparecer, faltam " }, enfase(inteiro(e.pendentes)), { texto: e.pendentes === 1 ? " item." : " itens." }]], "atencao", "falta dado para o retorno");
  }
  return faltaDado(e.motivo ?? "falta dado para calcular o retorno");
}

/** O que ajuda a explicar o resultado: quantas análises e quantas pedem atenção. */
export function cabecaDasExplicacoes(e: { total: number; pedemAtencao: number }): CabecaDoBloco {
  if (e.total <= 0) return faltaDado("ainda não há dado suficiente para explicar o resultado");
  return primeiraQueCabe(
    [[enfase(inteiro(e.pedemAtencao)), { texto: ` de ${inteiro(e.total)} análises do período ${e.pedemAtencao === 1 ? "pede" : "pedem"} atenção.` }]],
    e.pedemAtencao > 0 ? "atencao" : "bom",
    "ainda não há dado suficiente para explicar o resultado",
  );
}
