// As respostas dos blocos do "Ver tudo" de Instagram › Desempenho (quick-ver-tudo, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão (nada de "mediana" na frase) e sem
// promessa (a linha tracejada da evolução é estimativa e nunca entra na frase). Módulo puro.
import { diaCurto, enfase, faltaDado, inteiro, porCento, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Evolução de seguidores: de quanto para quanto, só nos dias medidos (a estimativa não entra). Menos de 60% dos dias: Falta dado. */
export function cabecaDaEvolucaoDeSeguidores(e: { primeiro: number | null; ultimo: number | null; cobertura: number }): CabecaDoBloco {
  if (e.primeiro == null || e.ultimo == null) return faltaDado("menos de 2 dias com contagem de seguidores no período");
  if (e.cobertura < 0.6) return faltaDado(`só ${Math.round(e.cobertura * 100)}% dos dias têm contagem de seguidores (mínimo 60%)`);
  const sobe = e.ultimo > e.primeiro;
  const igual = e.ultimo === e.primeiro;
  return primeiraQueCabe(
    [[{ texto: igual ? "Os seguidores ficaram em " : `Os seguidores ${sobe ? "subiram" : "caíram"} de ${inteiro(e.primeiro)} para ` }, enfase(inteiro(e.ultimo)), { texto: " no período." }]],
    igual ? "neutro" : sobe ? "bom" : "ruim",
    "menos de 2 dias com contagem de seguidores no período",
  );
}

/** Cobertura da contagem: quantos dias do período têm a contagem de seguidores. */
export function cabecaDaCobertura(e: { dias: number; esperados: number }): CabecaDoBloco {
  if (e.esperados <= 0) return faltaDado("período sem dias");
  return primeiraQueCabe([[enfase(`${inteiro(e.dias)} de ${inteiro(e.esperados)}`), { texto: " dias do período têm contagem de seguidores." }]], e.dias / e.esperados >= 0.6 ? "bom" : "atencao", "período sem dias");
}

/** Crescimento bruto × líquido: quantos saíram e que parte de quem entrou isso é. */
export function cabecaDoBrutoLiquido(e: { novos: number; saidas: number; diasMedidos: number }): CabecaDoBloco {
  if (e.diasMedidos <= 0) return faltaDado("sem dias medidos no período");
  if (e.novos <= 0) return primeiraQueCabe([[{ texto: "Nenhum seguidor novo medido; saíram " }, enfase(inteiro(e.saidas)), { texto: "." }]], "ruim", "sem dias medidos no período");
  return primeiraQueCabe(
    [[{ texto: `Entraram ${inteiro(e.novos)} e saíram ` }, enfase(inteiro(e.saidas)), { texto: `: ${porCento(e.saidas / e.novos)} de quem entrou.` }]],
    e.saidas > e.novos ? "ruim" : "neutro",
    "sem dias medidos no período",
  );
}

/** Seguidores por semana: a semana com mais seguidores novos (só semanas medidas; a semana sem dado nunca vira zero). */
export function cabecaDasSemanas(semanas: readonly { semana: string; novos: number | null; completa: boolean }[]): CabecaDoBloco {
  const medidas = semanas.filter((s): s is { semana: string; novos: number; completa: boolean } => s.novos != null);
  if (medidas.length < 2) return faltaDado("menos de 2 semanas com seguidores novos medidos");
  const melhor = medidas.reduce((a, b) => (b.novos > a.novos ? b : a));
  return primeiraQueCabe(
    [[{ texto: `A semana de ${diaCurto(melhor.semana)} trouxe mais seguidores novos: ` }, enfase(inteiro(melhor.novos)), { texto: "." }]],
    "neutro",
    "menos de 2 semanas com seguidores novos medidos",
  );
}

/** Alcance por formato e por tema: quantas pessoas o post típico do formato que mais alcança atinge (só grupos com amostra suficiente). */
export function cabecaDoAlcancePorFormato(formatos: readonly { nome: string; alcanceTipico: number; posts: number }[], minimoDePosts: number): CabecaDoBloco {
  const validos = formatos.filter((f) => f.posts >= minimoDePosts && f.alcanceTipico > 0);
  if (validos.length === 0) return faltaDado(`nenhum formato tem ${minimoDePosts} posts ou mais no período`);
  const melhor = validos.reduce((a, b) => (b.alcanceTipico > a.alcanceTipico ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `O post típico de ${melhor.nome} chega a ` }, enfase(inteiro(melhor.alcanceTipico)), { texto: " pessoas." }],
      [{ texto: "O post típico do formato que mais alcança chega a " }, enfase(inteiro(melhor.alcanceTipico)), { texto: " pessoas." }],
    ],
    "neutro",
    `nenhum formato tem ${minimoDePosts} posts ou mais no período`,
  );
}
