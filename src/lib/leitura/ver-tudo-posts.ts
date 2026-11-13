// As respostas dos blocos dos Detalhes de Instagram › Posts (quick-ver-tudo-abas, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão (nada de "mediana", "taxa de
// salvamento", "engajamento" ou "hook rate" na frase: "post típico", "de quem viu", "interações") e sem promessa. Módulo puro.
import { enfase, faltaDado, inteiro, primeiraQueCabe, umaCasa, type CabecaDoBloco } from "./cabeca-do-bloco";

/** "4,2%" de uma fração (0,042). */
const pctDeFracao = (f: number) => `${umaCasa(f * 100)}%`;

/** Ranking de posts: quantos posts do período não tiveram nenhum salvamento (o Top 5 à vista já mostra os mais salvos). */
export function cabecaDoRanking(salvos: readonly (number | null)[]): CabecaDoBloco {
  const falta = "nenhum post com salvamentos medidos no período";
  const medidos = salvos.filter((s): s is number => s != null);
  if (medidos.length === 0) return faltaDado(falta);
  const zerados = medidos.filter((s) => s <= 0).length;
  if (zerados === 0) return primeiraQueCabe([[{ texto: "Todos os " }, enfase(inteiro(medidos.length)), { texto: " posts do período tiveram salvamento." }]], "bom", falta);
  return primeiraQueCabe([[enfase(inteiro(zerados)), { texto: ` dos ${inteiro(medidos.length)} posts do período não tiveram nenhum salvamento.` }]], "atencao", falta);
}

/** Explorador de posts: o post de maior alcance do período (a lista abre por alcance). */
export function cabecaDoExplorador(alcances: readonly (number | null)[]): CabecaDoBloco {
  const medidos = alcances.filter((a): a is number => a != null && a > 0);
  if (medidos.length === 0) return faltaDado("nenhum post com alcance medido no período");
  return primeiraQueCabe([[{ texto: "O post de maior alcance do período chegou a " }, enfase(inteiro(Math.max(...medidos))), { texto: " pessoas." }]], "neutro", "nenhum post com alcance medido no período");
}

/** Próximos ângulos: o tema cujo post típico salvou mais que o post típico da conta. */
export function cabecaDosProximosAngulos(e: { angulos: readonly { tema: string; medianSaved: number; baseline: number }[]; temasComAmostra: number; minimoDePosts: number }): CabecaDoBloco {
  if (e.angulos.length === 0) {
    return faltaDado(e.temasComAmostra === 0 ? `nenhum tema tem ${e.minimoDePosts} posts ou mais no período` : "nenhum tema salvou mais que o post típico da conta");
  }
  const a = e.angulos[0];
  return primeiraQueCabe(
    [
      [{ texto: `O post típico de "${a.tema}" salvou ` }, enfase(umaCasa(a.medianSaved)), { texto: `, contra ${umaCasa(a.baseline)} da conta.` }],
      [{ texto: "O tema que mais salva teve " }, enfase(umaCasa(a.medianSaved)), { texto: ` salvamentos por post, contra ${umaCasa(a.baseline)}.` }],
    ],
    "bom",
    "nenhum tema salvou mais que o post típico da conta",
  );
}

/** O que repetir e o que revisar: quantos temas ficam acima e abaixo do post típico da conta. */
export function cabecaDoRepetirOuRevisar(e: { temSuficiente: boolean; repetir: number; revisar: number; temasComAmostra: number; minimoDePosts: number; minimoDeTemas: number }): CabecaDoBloco {
  if (!e.temSuficiente) {
    return faltaDado(e.temasComAmostra === 0 ? `nenhum tema tem ${e.minimoDePosts} posts ou mais no período` : `só ${e.temasComAmostra} de ${e.minimoDeTemas} temas com posts suficientes para comparar`);
  }
  return primeiraQueCabe(
    [[enfase(inteiro(e.repetir)), { texto: `${e.repetir === 1 ? " tema para repetir" : " temas para repetir"} e ${inteiro(e.revisar)} para revisar.` }]],
    e.repetir > 0 ? "bom" : "atencao",
    "sem temas para comparar",
  );
}

/** Conceitos vencedores, quem mais salva, quem mais circula: o maior "de quem viu" da lista. `verbo` no passado ("salvou"). */
export function cabecaDaParteDeQuemViu(taxas: readonly number[], verbo: string, motivoDaFalta: string): CabecaDoBloco {
  const medidas = taxas.filter((t) => Number.isFinite(t) && t > 0);
  if (medidas.length === 0) return faltaDado(motivoDaFalta);
  return primeiraQueCabe([[{ texto: "No melhor post, " }, enfase(pctDeFracao(Math.max(...medidas))), { texto: ` de quem viu ${verbo}.` }]], "neutro", motivoDaFalta);
}

/** Salvamentos por tema e formato: a combinação que mais salva (só com posts suficientes). */
export function cabecaDaCombinacaoMaisSalva(combinacoes: readonly { nome: string; salvosPorPost: number }[], minimoDePosts: number): CabecaDoBloco {
  const falta = `nenhuma combinação tem ${minimoDePosts} posts ou mais no período`;
  if (combinacoes.length === 0) return faltaDado(falta);
  const melhor = combinacoes.reduce((a, b) => (b.salvosPorPost > a.salvosPorPost ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `${melhor.nome} é a combinação mais salva: ` }, enfase(umaCasa(melhor.salvosPorPost)), { texto: " por post." }],
      [{ texto: "A combinação mais salva tem " }, enfase(umaCasa(melhor.salvosPorPost)), { texto: " salvamentos por post." }],
    ],
    "neutro",
    falta,
  );
}

/** Melhores ganchos: quantas interações teve o post de melhor abertura. */
export function cabecaDosGanchos(interacoes: readonly (number | null)[]): CabecaDoBloco {
  const medidas = interacoes.filter((i): i is number => i != null && i > 0);
  if (medidas.length === 0) return faltaDado("nenhum post com interações medidas no período");
  return primeiraQueCabe([[{ texto: "O post de melhor abertura teve " }, enfase(inteiro(Math.max(...medidas))), { texto: " interações." }]], "neutro", "nenhum post com interações medidas");
}

/** Tema dentro de cada formato: a célula com mais interação por alcance (só com posts suficientes). `taxa` já em %. */
export function cabecaDoTemaNoFormato(celulas: readonly { tema: string; formato: string; taxa: number; posts: number }[], minimoDePosts: number): CabecaDoBloco {
  const falta = `nenhuma combinação de tema e formato tem ${minimoDePosts} posts ou mais`;
  const validas = celulas.filter((c) => c.posts >= minimoDePosts && c.taxa > 0);
  if (validas.length === 0) return faltaDado(falta);
  const melhor = validas.reduce((a, b) => (b.taxa > a.taxa ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `"${melhor.tema}" em ${melhor.formato}: ` }, enfase(`${umaCasa(melhor.taxa)}%`), { texto: " de quem viu interagiu, o maior." }],
      [{ texto: "Na melhor combinação, " }, enfase(`${umaCasa(melhor.taxa)}%`), { texto: " de quem viu interagiu." }],
    ],
    "neutro",
    falta,
  );
}

/** Retenção dos Reels: quanto o Reel típico segura nos 3 primeiros segundos. `segura` já em %. */
export function cabecaDaRetencao(e: { reels: number; comDado: number; segura: number | null }): CabecaDoBloco {
  if (e.reels <= 0) return faltaDado("nenhum Reel no período");
  if (e.comDado <= 0 || e.segura == null) return faltaDado("a Meta não entrega o tempo assistido dos Reels desta conta");
  return primeiraQueCabe([[{ texto: "O Reel típico segura " }, enfase(`${umaCasa(e.segura)}%`), { texto: " de quem começa a ver nos 3 primeiros segundos." }]], "neutro", "sem dado de retenção");
}
