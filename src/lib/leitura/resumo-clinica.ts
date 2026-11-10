// Resumo da clínica (D-07, LEIT-06): o topo de Resultados da clínica em 3 linhas, montado por regra a partir dos fatos
// de todas as áreas (conteúdo, anúncios, comercial, ideias e resumo) que fatosDeResultados já calcula:
//   - O que aconteceu: o fato de maior peso;
//   - O que mais preocupa: o fato ruim ou de atenção de maior peso (ressalva do dado só se não houver outro);
//   - Ação da semana: um passo só, o de maior prioridade, com verbo da lista e quem resolve.
// Cada linha passa pelo mesmo filtro de linguagem da leitura (montarTexto), então nada que reprove chega à tela, e o
// número que sustenta cada frase vem ao lado. Com o portão negado, o resumo diz o mesmo motivo. Módulo puro.
import type { Area } from "@/lib/insight";
import { montarTexto } from "./texto";
import type { FatosDaTela, Fato, LinhaTexto, PassoFato, PassoTexto, TextoDoResumo } from "./tipos";

export interface EntradaResumo {
  fatos: FatosDaTela;
  /** Os fatos de Resultados separados pelas áreas do resultado. */
  porArea: Record<Area, Fato[]>;
  /** Passos por ordem de prioridade; o primeiro que passa no filtro é a ação da semana. */
  passos: PassoFato[];
}

const ORDEM_TOM: Record<Fato["tom"], number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };
const porPeso = (a: Fato, b: Fato) => b.peso - a.peso || ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom];

/**
 * A linha de um fato, depois do filtro de linguagem e só com número ao lado. Reaproveita montarTexto para a regra
 * ser uma só: um fato que reprova ali nunca aparece aqui.
 */
function linhaDoFato(base: FatosDaTela, f: Fato): LinhaTexto | null {
  const t = montarTexto({ ...base, portao: { ok: true }, fatos: [f], proximoPasso: null, outrosPassos: [] });
  return t.tipo === "leitura" ? t.aconteceu : null;
}

/** O primeiro fato da lista que vira linha de verdade. */
function primeiraLinha(base: FatosDaTela, lista: Fato[]): LinhaTexto | null {
  for (const f of lista) {
    const linha = linhaDoFato(base, f);
    if (linha) return linha;
  }
  return null;
}

export function resumirClinica(e: EntradaResumo): TextoDoResumo {
  // Portão negado: o resumo é a leitura da tela e diz o mesmo motivo, o conserto e quem resolve.
  if (!e.fatos.portao.ok) {
    const t = montarTexto(e.fatos);
    if (t.tipo === "sem_leitura") return { tipo: "sem_leitura", motivo: t.motivo, passo: t.passo };
  }

  const vistos = new Set<string>();
  const todos = Object.values(e.porArea)
    .flat()
    .filter((f) => (vistos.has(f.id) ? false : (vistos.add(f.id), true)));

  const conclusoes = todos.filter((f) => !f.ressalva && f.tom !== "neutro").sort(porPeso);
  const aconteceu = primeiraLinha(e.fatos, conclusoes);
  if (!aconteceu) {
    // Sem nenhuma conclusão aproveitável, a ressalva do dado aparece (honesta) em vez de nada; sem ela, sem leitura.
    const ressalva = primeiraLinha(e.fatos, todos.filter((f) => f.ressalva && f.tom !== "neutro").sort(porPeso));
    if (!ressalva) {
      const t = montarTexto({ ...e.fatos, portao: { ok: true }, fatos: [], proximoPasso: null, outrosPassos: [] });
      return t.tipo === "sem_leitura"
        ? { tipo: "sem_leitura", motivo: t.motivo, passo: t.passo }
        : { tipo: "resumo", aconteceu: null, preocupa: null, acao: null, semAcaoMotivo: null };
    }
    const { acao, motivo } = acaoDaSemana(e, ressalva);
    return { tipo: "resumo", aconteceu: ressalva, preocupa: null, acao, semAcaoMotivo: motivo };
  }

  // O que mais preocupa: ruim antes de atenção, maior peso primeiro; a ressalva do dado só entra na falta de outro.
  const preocupantes = (lista: Fato[]) => lista.filter((f) => (f.tom === "ruim" || f.tom === "atencao") && f.id !== aconteceu.fatoId);
  const conclusoesRuins = preocupantes(conclusoes).sort(porPeso);
  const ressalvas = preocupantes(todos.filter((f) => f.ressalva)).sort(porPeso);
  const preocupa = primeiraLinha(e.fatos, conclusoesRuins) ?? primeiraLinha(e.fatos, ressalvas);

  const { acao, motivo } = acaoDaSemana(e, aconteceu);
  return { tipo: "resumo", aconteceu, preocupa, acao, semAcaoMotivo: motivo };
}

/** Um passo só, o primeiro da lista de prioridade que passa no filtro (verbo da lista, frase limpa). */
function acaoDaSemana(e: EntradaResumo, aconteceu: LinhaTexto): { acao: PassoTexto | null; motivo: string | null } {
  const fato: Fato = { id: aconteceu.fatoId, tom: aconteceu.tom, peso: 3, frase: aconteceu.frase, numeros: aconteceu.numeros };
  const [primeiro, ...resto] = e.passos;
  const t = montarTexto({ ...e.fatos, portao: { ok: true }, fatos: [fato], proximoPasso: primeiro ?? null, outrosPassos: resto });
  if (t.tipo !== "leitura") return { acao: null, motivo: "nenhuma ação passou nas regras neste período" };
  return { acao: t.proximoPasso, motivo: t.semPassoMotivo };
}
