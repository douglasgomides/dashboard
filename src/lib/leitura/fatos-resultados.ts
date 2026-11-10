// Fatos de Resultados da clínica (versão fina do 03.1-01; o 03.1-03 completa com as outras fontes e o resumo).
// Módulo puro: recebe o Resultado que useResultado já montou e devolve os fatos. Não importa cliente de banco, não
// consulta e não chama IA, para a leitura sair na hora, no navegador, sem custo e sem lentidão.
import type { Resultado } from "@/lib/resultado";
import type { Rastreio } from "@/lib/rastreio-anuncios";
import type { Selo } from "@/lib/selo";
import type { DadosRoi } from "@/lib/roi";
import type { NumerosLeitura } from "@/lib/inteligencia-resultados";
import type { Area, Responsavel } from "@/lib/insight";
import { deInsight } from "./adaptadores";
import { portaoDoPeriodo } from "./portao";
import { periodoAnterior, type Fato, type FatosDaTela, type PassoFato } from "./tipos";

/** Muda quando uma regra de fato muda; fica no resultado para as telas saberem de que regra veio a leitura. */
export const VERSAO_REGRAS_RESULTADOS = 1;

export interface EntradaFatosResultados {
  resultado: Resultado;
  /** Início e fim do período escolhido na tela. */
  de: string;
  ate: string;
  /** Hoje, no fuso de Brasília. */
  hoje: string;
  /** Opcionais: o 03.1-03 liga quando a tela passar a carregar essas fontes. */
  rastreio?: Rastreio | null;
  selo?: Selo | null;
  funil?: FunilDoPeriodo | null;
  roi?: DadosRoi | null;
}

/** Esboço do RED (o tipo completo vem no GREEN). */
export interface FunilDoPeriodo {
  atual: NumerosLeitura;
  anterior?: NumerosLeitura | null;
  semMedida?: { chave: string; rotulo: string; motivo: string; quem: Responsavel }[];
}

/** Esboço do RED: ainda não separa os fatos por área. */
export function fatosDeResultadosComAreas(e: EntradaFatosResultados): { fatos: FatosDaTela; porArea: Record<Area, Fato[]> } {
  return { fatos: fatosDeResultados(e), porArea: { resumo: [], conteudo: [], anuncios: [], comercial: [], ideias: [] } };
}

const DIA = 86_400_000;
const ms = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Quantos insights viram fato (os de maior prioridade; o resultado já vem ordenado). */
const MAX_INSIGHTS = 3;

export function fatosDeResultados(e: EntradaFatosResultados): FatosDaTela {
  const { resultado: r } = e;
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const cob = r.cobertura;

  // Portão (D-03). O dia que a Meta ainda está fechando (hoje e ontem) não conta como atraso: o fim do período para
  // a conferência é o fim menos os dias abertos.
  const ateFechado = iso(ms(fim) - cob.diasAbertos * DIA);
  const problemasAltos = r.insights.filter((i) => i.id.startsWith("dado-") && i.tom === "ruim").length;
  const portao = portaoDoPeriodo({
    periodoAte: ateFechado,
    hoje: e.hoje,
    semDado: cob.diasComDado === 0 ? { motivo: "o Instagram não tem nenhum dia com dado neste período", quem: "equipe_hub" } : null,
    fontes: [{ nome: "Instagram", status: null, ultimoDado: cob.ultimoDado }],
    rastreio: e.rastreio ?? null,
    selo: e.selo ?? null,
    problemasAltos,
    n: cob.diasComDado,
  });

  // Fatos: até 3 insights (por prioridade) e os alertas da cobertura como fatos de atenção.
  const fatos: Fato[] = [];
  const passos: PassoFato[] = [];
  for (const i of r.insights.filter((x) => !x.id.startsWith("dado-")).slice(0, MAX_INSIGHTS)) {
    const { fato, passo } = deInsight(i);
    fatos.push(fato);
    if (passo) passos.push(passo);
  }
  r.cobertura.alertas.forEach((a, k) => {
    fatos.push({
      id: `cobertura-${k}`,
      tom: a.tom,
      peso: 1,
      frase: a.texto,
      ressalva: true,
      numeros: [{ chave: "dias_com_dado", exibicao: `${cob.diasComDado} de ${cob.diasPeriodo} dias com dado` }],
      n: cob.diasComDado,
    });
  });

  // Um próximo passo só (D-05): o da próxima ação do resultado; as outras ações da semana ficam em "ver mais".
  const principal = r.proximaAcao ? deInsight(r.proximaAcao) : null;
  const proximoPasso = principal?.passo ?? null;
  if (principal && !fatos.some((f) => f.id === principal.fato.id)) fatos.push(principal.fato);
  const outrosPassos = [...passos, ...r.semana.filter((i) => i !== r.proximaAcao).map((i) => deInsight(i).passo)]
    .filter((p): p is PassoFato => p != null)
    .filter((p, k, lista) => lista.findIndex((x) => x.fatoId === p.fatoId) === k)
    .filter((p) => p.fatoId !== proximoPasso?.fatoId);

  return {
    tela: "resultados",
    versaoRegras: VERSAO_REGRAS_RESULTADOS,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: periodoAnterior(e.de, fim) },
    portao,
    fatos,
    proximoPasso,
    outrosPassos,
  };
}
