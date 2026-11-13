// As respostas dos blocos do "Ver tudo" da Carteira (quick-ver-tudo, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO bloco, com o
// número em destaque; lendo ou sem dado, "Falta dado". A Carteira é a tela da equipe com todas as clínicas: aqui a contagem é da carteira
// (quantas clínicas têm fonte com problema), nunca uma clínica medida contra as outras (D-02). Módulo puro.
import { enfase, faltaDado, inteiro, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Os contadores da carteira: quantas clínicas têm fonte atrasada, parada ou com erro. */
export function cabecaDosContadores(e: { comProblema: number | null; total: number }): CabecaDoBloco {
  if (e.comProblema == null) return faltaDado("lendo as fontes das clínicas");
  if (e.total <= 0) return faltaDado("nenhuma clínica cadastrada");
  if (e.comProblema === 0) return primeiraQueCabe([[enfase("Nenhuma"), { texto: ` das ${inteiro(e.total)} clínicas tem fonte atrasada, parada ou com erro.` }]], "bom", "nenhuma clínica cadastrada");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.comProblema)} de ${inteiro(e.total)}`), { texto: e.comProblema === 1 ? " clínicas tem fonte atrasada, parada ou com erro." : " clínicas têm fonte atrasada, parada ou com erro." }]],
    "atencao",
    "nenhuma clínica cadastrada",
  );
}

/**
 * Diagnóstico das fontes: QUAIS fontes estão em vermelho (a descoberta do topo já diz quantas). Com muitas, a que mais aparece e quantas.
 * `fontes` é o nome de cada fonte em vermelho, uma vez por clínica ("Anúncios", "CRM", "CRM").
 */
export function cabecaDoDiagnosticoDasFontes(fontes: readonly string[] | null): CabecaDoBloco {
  if (fontes == null) return faltaDado("lendo o status das fontes");
  if (fontes.length === 0) return primeiraQueCabe([[enfase("Nenhuma"), { texto: " fonte em vermelho: tudo ligado tem dado de até 3 dias." }]], "bom", "lendo o status das fontes");
  const contagem = new Map<string, number>();
  for (const f of fontes) contagem.set(f, (contagem.get(f) ?? 0) + 1);
  const nomes = [...contagem.keys()];
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  const maisComum = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  return primeiraQueCabe(
    [
      [{ texto: nomes.length === 1 ? "A fonte em vermelho é " : "As fontes em vermelho são " }, enfase(lista), { texto: "." }],
      [{ texto: `${maisComum[0]} é a que mais está em vermelho: ` }, enfase(`${inteiro(maisComum[1])} ${maisComum[1] === 1 ? "clínica" : "clínicas"}`), { texto: "." }],
    ],
    "ruim",
    "lendo o status das fontes",
  );
}
