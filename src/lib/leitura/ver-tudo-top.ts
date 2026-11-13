// As respostas dos blocos dos Detalhes de Instagram › Destaques (quick-ver-tudo-abas, 13/11/2026): UMA frase tirada dos dados do
// PRÓPRIO bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão (nada de "mediana" ou "taxa
// de salvamento" na frase) e sem promessa. Módulo puro.
import { enfase, faltaDado, inteiro, primeiraQueCabe, vezes, type CabecaDoBloco } from "./cabeca-do-bloco";

export interface LugarDoTop {
  /** O valor da métrica escolhida (salvamentos, alcance...). */
  valor: number;
  /** O mesmo valor, como a tela escreve ("10", "1,2%"). */
  texto: string;
}

/**
 * Distância entre os primeiros: o 1º lugar fora da curva (1,5 vez o 2º ou mais) ou, quando as colunas são parecidas, de quanto a quanto
 * vão os primeiros. `metrica` em minúsculas ("salvamentos").
 */
export function cabecaDaDistancia(lugares: readonly LugarDoTop[], metrica: string): CabecaDoBloco {
  const falta = "menos de 2 publicações com a métrica escolhida";
  if (lugares.length < 2) return faltaDado(falta);
  const [primeiro, segundo] = lugares;
  const ultimo = lugares[lugares.length - 1];
  const x = segundo.valor > 0 && primeiro.valor >= segundo.valor * 1.5 ? vezes(primeiro.valor, segundo.valor) : null;
  if (x) {
    return primeiraQueCabe(
      [
        [{ texto: "O 1º lugar tem " }, enfase(x), { texto: ` o 2º em ${metrica}: foi fora da curva.` }],
        [{ texto: "O 1º lugar tem " }, enfase(x), { texto: " o número do 2º: foi fora da curva." }],
      ],
      "neutro",
      falta,
    );
  }
  return primeiraQueCabe(
    [
      [{ texto: `Do 1º ao ${lugares.length}º lugar, ${metrica} de ` }, enfase(primeiro.texto), { texto: ` a ${ultimo.texto}: o resultado se repete.` }],
      [{ texto: `Do 1º ao ${lugares.length}º lugar, de ` }, enfase(primeiro.texto), { texto: ` a ${ultimo.texto}: o resultado se repete.` }],
    ],
    "bom",
    falta,
  );
}

/**
 * O que os melhores têm em comum: quantos padrões passaram da diferença mínima. Sem padrão, "Falta dado" com o motivo curto (o aviso do
 * bloco, logo abaixo, traz o motivo inteiro: a cabeça não o repete).
 */
export function cabecaDosPadroes(frases: readonly string[], motivoVazio: string | null, diferencaMinima: number): CabecaDoBloco {
  if (frases.length === 0) {
    if (motivoVazio && /^Só há/.test(motivoVazio)) return faltaDado("poucas publicações no grupo para comparar");
    return faltaDado(`nada separa os melhores do resto em ${diferencaMinima} pontos ou mais`);
  }
  return primeiraQueCabe(
    [[{ texto: "Os melhores têm " }, enfase(inteiro(frases.length)), { texto: frases.length === 1 ? " traço em comum que o resto não tem." : " traços em comum que o resto não tem." }]],
    "neutro",
    "sem padrão claro",
  );
}

/** Do 4º lugar em diante: de quanto a quanto vai o resto da lista. */
export function cabecaDoRestoDaLista(lugares: readonly LugarDoTop[], metrica: string): CabecaDoBloco {
  const falta = "a lista tem só os 3 do pódio";
  if (lugares.length <= 3) return faltaDado(falta);
  const quarto = lugares[3];
  const ultimo = lugares[lugares.length - 1];
  return primeiraQueCabe(
    [
      [{ texto: `Do 4º ao ${lugares.length}º lugar, de ` }, enfase(quarto.texto), { texto: ` a ${ultimo.texto} ${metrica}.` }],
      [{ texto: `Do 4º ao ${lugares.length}º lugar, de ` }, enfase(quarto.texto), { texto: ` a ${ultimo.texto}.` }],
    ],
    "neutro",
    falta,
  );
}

/** Stories no ar agora: o que mais alcança, lido ao vivo da Meta. */
export function cabecaDosStoriesNoAr(e: { ok: boolean; alcances: readonly (number | null)[] } | null): CabecaDoBloco {
  if (!e || !e.ok) return faltaDado("a Meta não devolveu os stories agora");
  if (e.alcances.length === 0) return primeiraQueCabe([[enfase("0"), { texto: " stories no ar neste momento." }]], "neutro", "a Meta não devolveu os stories agora");
  const medidos = e.alcances.filter((a): a is number => a != null);
  if (medidos.length === 0) return faltaDado("a Meta não devolveu o alcance dos stories no ar");
  const maior = Math.max(...medidos);
  return primeiraQueCabe([[{ texto: "O story no ar que mais alcança chegou a " }, enfase(inteiro(maior)), { texto: maior === 1 ? " pessoa." : " pessoas." }]], "neutro", "a Meta não devolveu os stories agora");
}
