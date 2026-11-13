// A leitura do período nas abas das pastas (quick-ver-tudo-abas, João 13/11/2026: "essa leitura do período eu não to gostando... muito
// pequeno, muita informação pra ler e não passa nada de informação"). As abas das pastas (Destaques, Posts, Público, Por origem, Links)
// não têm veredito azul (A-02: a aba guarda o desenho dela). A caixa "Leitura do período" sai do topo; cada fato dela que a aba ainda não
// mostra vira um cartão de descoberta pela MESMA conversão das 8 telas principais (descobertasDaLeitura): o próximo passo vira a ação e
// o "Ver mais" vira mais descobertas. No máximo 3 à vista, no topo da aba; o resto mora nos Detalhes da aba.
// Sem leitura (portão fechado), a aba não perde o aviso: UMA descoberta "Falta dado: motivo", com o passo que resolve como ação.
// Módulo puro: sem React, banco ou rede.
import { DESCOBERTAS_A_VISTA, caberEm90, checarDescoberta, type Descoberta } from "./cinco-segundos";
import { ABRIR_VER_TUDO, descobertasDaLeitura, juntarDescobertas } from "./leitura-em-descobertas";
import { montarTexto } from "./texto";
import { ROTULO_RESPONSAVEL } from "../insight";
import type { FatosDaTela, PassoTexto } from "./tipos";

/** Muda quando uma regra desta conversão muda. */
export const VERSAO_REGRAS_LEITURA_DAS_ABAS = 1;

export interface EntradaDaLeituraDaAba {
  /** Os fatos da leitura da aba (os mesmos que a LeituraDaTela recebia). null = sem fatos (carregando ou sem dado). */
  fatos: FatosDaTela | null;
  /** O que a aba já mostra à vista: título, número e legenda dos cartões, o gráfico principal, o corpo. */
  textoDoTopo?: readonly string[];
  /** Fatos que a aba já diz com outras palavras (por id). */
  jaDitos?: readonly string[];
}

export interface LeituraDaAba {
  /** No máximo 3, no topo da aba. */
  visiveis: Descoberta[];
  /** As que passam das 3, nos Detalhes da aba. */
  resto: Descoberta[];
}

const PASSO_PADRAO: PassoTexto = { frase: "Conferir a conexão das fontes.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: ROTULO_RESPONSAVEL.equipe_hub };
const semPonto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");

/**
 * "Falta dado: motivo" como descoberta: a leitura antiga dizia o motivo e o passo que resolve; a aba continua dizendo, no mesmo desenho
 * das outras descobertas (nada some, nenhum zero de mentira). As barras do "Por quê?" são listradas: nada foi medido.
 */
export function descobertaDaFalta(motivo: string, passo: PassoTexto): Descoberta {
  const frase = caberEm90(`Falta dado: ${semPonto(motivo)}`);
  return {
    id: "leitura-falta-dado",
    tom: "atencao",
    selo: "Falta dado",
    frase,
    quem: passo.rotuloQuem,
    acao: { rotulo: semPonto(passo.frase), local: ABRIR_VER_TUDO },
    origem: "proximo-passo",
    porque: {
      titulo: frase.endsWith("…") ? `Falta dado: ${semPonto(motivo)}.` : "O que a aba precisa para ler o período",
      barras: [
        { rotulo: "Medido no período", exibicao: "Falta dado", fracao: 0, faltou: true },
        { rotulo: "Período anterior", exibicao: "Falta dado", fracao: 0, faltou: true },
      ],
    },
  };
}

/**
 * As descobertas da leitura da aba: as que a aba ainda não mostra, na ordem da leitura (a "ruim" sobe, como nas telas principais), até
 * 3 à vista e o resto nos Detalhes. Sem fatos (carregando): nenhuma. Sem leitura: a descoberta "Falta dado".
 */
export function leituraDaAba(e: EntradaDaLeituraDaAba): LeituraDaAba {
  if (!e.fatos) return { visiveis: [], resto: [] };
  const texto = montarTexto(e.fatos);
  if (texto.tipo === "sem_leitura") {
    const falta = descobertaDaFalta(texto.motivo, texto.passo);
    return { visiveis: checarDescoberta(falta).length === 0 ? [falta] : [], resto: [] };
  }
  const todas = juntarDescobertas([], descobertasDaLeitura({ fatos: e.fatos, descobertas: [], textoDoTopo: e.textoDoTopo, jaDitos: e.jaDitos }));
  return { visiveis: todas.slice(0, DESCOBERTAS_A_VISTA), resto: todas.slice(DESCOBERTAS_A_VISTA) };
}

/** Sem fatos e sem carregar (nenhum dado no período): o mesmo aviso que a leitura antiga dava. */
export function leituraDaAbaSemDado(): LeituraDaAba {
  return { visiveis: [descobertaDaFalta("não há dado neste período", PASSO_PADRAO)], resto: [] };
}
