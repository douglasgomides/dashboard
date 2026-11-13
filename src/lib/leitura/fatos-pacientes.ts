// Fatos de Pacientes do período (D1, "onde perco paciente") e das telas ainda em construção. Módulo puro: recebe o que
// usePacientesPeriodo e o histórico diário já carregaram e devolve os fatos; não consulta nada e não usa IA.
// LGPD (T-03.1-09): a lista de pessoas (listas, paraChamarAgora) NÃO é entrada daqui. Só números agregados viram fato,
// então nome e telefone de paciente nunca chegam à leitura.
import { METRICAS_META, ROTULO_META, leituraDoPeriodo, type MetricaMeta, type NumerosLeitura } from "@/lib/inteligencia-resultados";
import type { PacientesPeriodo } from "@/lib/pacientes";
import { hojeBrasilia } from "@/lib/status-fonte";
import { deLeituraResultados, fatoDeEtapaQueCresce, paresQueCrescem } from "./adaptadores";
import { periodosDeComparacao } from "./fatos-resultados";
import { portaoDoPeriodo } from "./portao";
import { LIMITES } from "@/lib/limites";
import type { Fato, FatosDaTela, PassoFato, TelaId } from "./tipos";

/** Muda quando uma regra de fato de Pacientes muda. */
export const VERSAO_REGRAS_PACIENTES = 2;

export interface EntradaFatosPacientes {
  /** O que o banco devolveu: só `numeros` e os avisos são lidos; `listas` (pessoas) nunca. */
  dados: PacientesPeriodo;
  de: string;
  ate: string;
  hoje: string;
  /** Soma dos dias do período atual e do anterior (histórico diário): é daqui que sai a variação. */
  somaAtual?: Record<string, number | null> | null;
  somaAntes?: Record<string, number | null> | null;
  /** Metas do mês em curso e quanto já foi feito neste mês (null = não medido). */
  metas?: Partial<Record<MetricaMeta, { meta: number; atual: number | null }>>;
}

const f = (n: number) => n.toLocaleString("pt-BR");

/** As etapas do funil, em ordem. */
const ETAPAS = [
  { chave: "mandaram_mensagem", rotulo: "Chamaram" },
  { chave: "agendaram", rotulo: "Agendaram" },
  { chave: "compareceram", rotulo: "Foram na consulta" },
  { chave: "fecharam", rotulo: "Fecharam" },
] as const;
type ChaveEtapa = (typeof ETAPAS)[number]["chave"];
/** Sem um destes três não dá para ler o funil: a leitura diz o motivo e para. */
const PRINCIPAIS: ChaveEtapa[] = ["mandaram_mensagem", "agendaram", "fecharam"];

const semPonto = (t: string) => t.trim().replace(/[.\s]+$/, "");

/** O passo de cada etapa de maior perda: sempre um grupo de pessoas, nunca um nome. */
function passoDaPerda(de: ChaveEtapa, para: ChaveEtapa): PassoFato {
  const base = { quem: "comercial" as const, fatoId: "maior-perda" };
  if (para === "agendaram") return { ...base, verbo: "responder", texto: "quem chamou e ainda não agendou", motivo: "A maior perda está entre quem chamou e quem agendou." };
  if (para === "compareceram") return { ...base, verbo: "ligar para", texto: "quem agendou e ainda não foi à consulta", motivo: "A maior perda está entre quem agendou e quem foi à consulta." };
  return {
    ...base,
    verbo: "ligar para",
    texto: de === "compareceram" ? "quem foi à consulta e ainda não fechou" : "quem agendou e ainda não fechou",
    motivo: de === "compareceram" ? "A maior perda está entre quem foi à consulta e quem fechou." : "A maior perda está entre quem agendou e quem fechou.",
  };
}

export function fatosDePacientes(e: EntradaFatosPacientes): FatosDaTela {
  const numeros = e.dados.numeros ?? ({} as PacientesPeriodo["numeros"]);
  const valor = (k: ChaveEtapa): number | null => {
    const v = numeros[k]?.valor;
    return v == null ? null : Number(v);
  };
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const comparacao = periodosDeComparacao(e.de, e.ate, e.hoje);
  const fatos: Fato[] = [];
  const outros: PassoFato[] = [];

  // Portão (D-03): número principal sem medida e amostra pequena. Etapa fora de ordem não nega (D-01): vira fato de equipe.
  const semMedidaPrincipal = PRINCIPAIS.find((k) => valor(k) == null);
  const portao = portaoDoPeriodo({
    periodoAte: fim,
    hoje: e.hoje,
    semDado: semMedidaPrincipal
      ? {
          motivo: semPonto(numeros[semMedidaPrincipal]?.motivo_sem_dado ?? "") || "a fonte não respondeu",
          quem: numeros[semMedidaPrincipal]?.responsavel ?? "equipe_hub",
        }
      : null,
    n: valor("mandaram_mensagem") ?? undefined,
  });

  // O que não foi medido vira ressalva "Sem dado" (nunca 0) e um passo para conferir a fonte.
  for (const etapa of ETAPAS) {
    const n = numeros[etapa.chave];
    if (!n || n.valor != null) continue;
    const id = `sem-medida-${etapa.chave}`;
    const motivo = n.motivo_sem_dado?.trim() || "A fonte não respondeu.";
    fatos.push({ id, tom: "atencao", peso: 1, ressalva: true, frase: `${etapa.rotulo} não foi medido neste período: ${motivo}`, numeros: [{ chave: etapa.chave, exibicao: "Sem dado" }] });
    outros.push({ verbo: "conferir", texto: `a fonte do número "${etapa.rotulo}"`, quem: n.responsavel ?? "equipe_hub", motivo, fatoId: id });
  }

  // Etapa maior que a anterior medida (D-01, com 5 ou mais na de depois, como a regra antiga): fato para a equipe conferir a
  // marcação no CRM, com os dois números medidos, e um passo só da equipe (nunca o próximo passo da tela).
  const valores = Object.fromEntries(ETAPAS.map((et) => [et.chave, valor(et.chave)])) as Record<ChaveEtapa, number | null>;
  for (const par of paresQueCrescem(valores, ETAPAS)) {
    const { fato, passo } = fatoDeEtapaQueCresce(par);
    fatos.push(fato);
    outros.push(passo);
  }

  // D1: a etapa de maior perda (só com os três números principais medidos).
  let proximoPasso: PassoFato | null = null;
  if (!semMedidaPrincipal) {
    const medidas = ETAPAS.filter((et) => valor(et.chave) != null);
    let melhor: { de: (typeof ETAPAS)[number]; para: (typeof ETAPAS)[number]; perda: number } | null = null;
    for (let i = 0; i + 1 < medidas.length; i++) {
      const a = valor(medidas[i].chave)!, b = valor(medidas[i + 1].chave)!;
      // Base menor que a amostra mínima ou etapa que cresce (fora de ordem) não dizem nada sobre perda.
      if (a < LIMITES.leitura.grupoMinimo || b > a) continue;
      const perda = (a - b) / a;
      if (perda > 0 && (!melhor || perda > melhor.perda)) melhor = { de: medidas[i], para: medidas[i + 1], perda };
    }
    if (melhor) {
      const a = valor(melhor.de.chave)!, b = valor(melhor.para.chave)!;
      fatos.push({
        id: "maior-perda",
        tom: "atencao",
        peso: 3,
        frase: `A maior perda está entre "${melhor.de.rotulo}" e "${melhor.para.rotulo}".`,
        numeros: [{ chave: "maior_perda", exibicao: `De ${f(a)} para ${f(b)} pessoas`, valor: b }],
        n: a,
      });
      proximoPasso = passoDaPerda(melhor.de.chave, melhor.para.chave);
    }
  }

  // Variação com o período anterior, com as mesmas bases mínimas de leituraDoPeriodo. Número principal sem medida fica fora.
  if (e.somaAtual && e.somaAntes) {
    const atual: NumerosLeitura = {}, antes: NumerosLeitura = {};
    for (const k of ["mandaram_mensagem", "agendaram", "fecharam"] as const) {
      atual[k] = valor(k) == null ? null : (e.somaAtual[k] ?? null);
      antes[k] = valor(k) == null ? null : (e.somaAntes[k] ?? null);
    }
    fatos.push(...deLeituraResultados(leituraDoPeriodo(atual, antes), atual));
  }

  // Metas do mês: dita como fato ("28 de 40, faltam 12"). Sem projeção, sem previsão e sem a palavra risco.
  for (const k of METRICAS_META) {
    const m = e.metas?.[k];
    if (!m || !(m.meta > 0)) continue;
    const id = `meta-${k}`;
    if (m.atual == null) {
      fatos.push({ id, tom: "atencao", peso: 1, ressalva: true, frase: `${ROTULO_META[k]} neste mês não foi medido, então a meta não pode ser acompanhada.`, numeros: [{ chave: id, exibicao: "Sem dado" }] });
      continue;
    }
    const faltam = Math.max(m.meta - m.atual, 0);
    fatos.push({
      id,
      tom: faltam === 0 ? "bom" : "neutro",
      peso: 1,
      frase: `${ROTULO_META[k]} neste mês: ${f(m.atual)} de ${f(m.meta)}${faltam > 0 ? `, faltam ${f(faltam)}` : ", meta batida"}.`,
      numeros: [{ chave: id, exibicao: `${f(m.atual)} de ${f(m.meta)}`, valor: m.atual }],
    });
  }

  return {
    tela: "pacientes",
    versaoRegras: VERSAO_REGRAS_PACIENTES,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: { de: comparacao.anterior.start, ate: comparacao.anterior.end } },
    portao,
    fatos,
    proximoPasso,
    outrosPassos: outros,
  };
}

/** O que cada tela ainda sem fonte diz que falta (texto do corpo da tela). */
export const EM_CONSTRUCAO: Partial<Record<TelaId, { falta: string }>> = {
  consultas: { falta: "a fonte que mostra quem virou consulta" },
  vendas: { falta: "a fonte que mostra quem virou venda" },
  automacoes: { falta: "a fonte que mostra as automações" },
};

/** Tela sem fonte ligada: não há o que ler. A leitura diz isso, o passo para consertar e quem resolve. */
export function fatosEmConstrucao(tela: TelaId, periodo?: { de: string; ate: string }): FatosDaTela {
  const hoje = hojeBrasilia();
  const de = periodo?.de ?? hoje;
  const ate = periodo?.ate ?? hoje;
  return {
    tela,
    versaoRegras: VERSAO_REGRAS_PACIENTES,
    tipoPeriodo: "periodo",
    periodo: { de, ate, anterior: null },
    portao: portaoDoPeriodo({ periodoAte: ate, hoje, semDado: { motivo: "a tela ainda não tem a fonte ligada", quem: "equipe_hub" } }),
    fatos: [],
    proximoPasso: null,
    outrosPassos: [],
  };
}
