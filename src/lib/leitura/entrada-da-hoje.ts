// A entrada da leitura da Hoje (Phase 3.1.1, plano 05; 03.1.1.1, plano 08): o que a tela Hoje monta a partir das consultas que Resultados da
// clínica já faz, movido para cá SEM mudar o comportamento para que a Hoje e o Fechamento do mês ("3 apostas para o próximo mês") usem a
// MESMA regra. Módulo sem React, sem banco, sem rede e sem IA; recebe o que a tela já carregou e devolve a EntradaHoje e as ações.
import { variacoes } from "@/lib/diagnostico-estrategico";
import { analyzeGrowth } from "@/lib/hub-conteudo";
import { lerPeriodo } from "@/lib/leitura-periodo";
import type { PacientesPeriodo } from "@/lib/pacientes";
import type { Resultado } from "@/lib/resultado";
import type { DadosRoi } from "@/lib/roi";
import { tomDaFonte, type LinhaFonte } from "@/lib/saude-fontes";
import { barrasDoPorque, checarDescoberta, checarFraseCinco, type Descoberta } from "./cinco-segundos";
import { fatosDePacientes } from "./fatos-pacientes";
import { fatosDeResultadosComAreas, type FunilDoPeriodo } from "./fatos-resultados";
import type { AcaoDaHoje, EntradaHoje, FonteDoDado } from "./fatos-hoje";
import { fatosDePublicacoes, fatosDoInstagram } from "./fatos-instagram";
import type { FatosDaTela, TelaId, TomFato } from "./tipos";

const C = "/_authenticated/$clientId";

const ROTULO_DA_FONTE: Record<string, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM", atendimento: "WhatsApp" };
const ORDEM_DAS_FONTES = ["instagram", "anuncios", "crm", "atendimento"];

/** A hora (de São Paulo) da última leitura bem-sucedida da fonte, "03:30", quando o banco a traz. */
function horaDaFonte(l: LinhaFonte): string | null {
  if (!l.last_success_at) return null;
  const t = new Date(l.last_success_at);
  return Number.isNaN(t.getTime()) ? null : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}

/** Fontes com dado, na ordem do selo de frescura da casca, com o tom pela regra única (âmbar com mais de 1 dia). */
export function fontesDoCliente(linhas: LinhaFonte[] | undefined): (FonteDoDado & { hora: string | null })[] {
  return ORDEM_DAS_FONTES.map((f) => (linhas ?? []).find((l) => l.fonte === f))
    .filter((l): l is LinhaFonte => !!l && !!l.data_ate)
    .map((l) => ({ fonte: ROTULO_DA_FONTE[l.fonte] ?? l.fonte, tom: tomDaFonte(l), ate: l.data_ate, hora: horaDaFonte(l) }));
}

/** Tudo o que a Hoje (e o Fechamento do mês) já tem carregado quando monta a leitura. */
export interface DadosDaEntradaDaHoje {
  /** O resultado do período (useResultado.r). */
  resultado: Resultado;
  start: string;
  end: string;
  /** Hoje, no fuso de Brasília. */
  hoje: string;
  /** O funil do período e as somas diárias dos dois períodos. */
  funil: { funil: FunilDoPeriodo | null; atual: Record<string, number | null>; antes: Record<string, number | null> };
  roi: DadosRoi | null | undefined;
  pessoas: PacientesPeriodo | null | undefined;
  /** As linhas do Instagram (posts, período e período anterior) chegam como o banco devolve. */
  posts: any[] | null | undefined;
  metricas: any[] | null | undefined;
  anterior: any[] | null | undefined;
  temIg: boolean;
  fontes: readonly FonteDoDado[];
}

/**
 * A EntradaHoje: os fatos de Resultados mais as fontes extras que Resultados já carrega (Pacientes do período, publicações e Desempenho do
 * Instagram), nesta ordem. É a conta que a Hoje sempre fez, só que em um lugar que as duas telas importam.
 */
export function montarEntradaDaHoje(d: DadosDaEntradaDaHoje): EntradaHoje {
  const { resultado: r, start, end, hoje, funil, roi, pessoas, posts, metricas, anterior, temIg, fontes } = d;
  const feitos = fatosDeResultadosComAreas({ resultado: r, de: start, ate: end, hoje, funil: funil.funil, roi: roi ?? null });
  // Fontes extras, só de dados que os hooks já trazem: Pacientes do período, publicações e Desempenho do Instagram.
  const extras: { tela: TelaId; rota: string; fatos: FatosDaTela }[] = [];
  if (pessoas) {
    extras.push({ tela: "pacientes", rota: `${C}/pacientes`, fatos: fatosDePacientes({ dados: pessoas, de: start, ate: end, hoje, somaAtual: funil.atual, somaAntes: funil.antes }) });
  }
  if (temIg && posts) {
    extras.push({ tela: "posts", rota: `${C}/posts`, fatos: fatosDePublicacoes({ de: start, ate: end, hoje, posts }) });
    if (metricas) {
      // Desempenho: a mesma leitura de conteudo.tsx (função pura sobre os dias e os posts que useResultado já trouxe).
      const dias = anterior ?? [];
      const comp = variacoes(metricas, dias);
      const cresc = analyzeGrowth(metricas, start, end);
      extras.push({
        tela: "conteudo",
        rota: `${C}/conteudo`,
        fatos: fatosDoInstagram(lerPeriodo({ diario: metricas, diarioAnterior: dias, posts }), {
          de: start,
          ate: end,
          hoje,
          posts,
          diario: metricas,
          anteriorMedido: dias.some((x: { reach?: number | null }) => x.reach != null),
          variacaoLimitada: comp.limitada && comp.motivo ? { motivo: comp.motivo } : null,
          crescimento: cresc ? { novos: cresc.novos, saidas: cresc.saidas, liquido: cresc.liquido, diasMedidos: cresc.diasMedidos } : null,
        }),
      });
    }
  }
  return { fatos: feitos.fatos, porArea: feitos.porArea, insights: r.insights, limitacoes: r.limitacoes, extras, fontes };
}

/** O selo de cada tom da ação: sempre com o sinal (▲ ▼ ! ●) ao lado, nunca só a cor. */
const SELO_DO_TOM: Record<TomFato, string> = { bom: "Bom sinal", atencao: "Atenção", ruim: "Para resolver", neutro: "Para conferir" };

/**
 * Uma ação da Hoje vira uma descoberta (D-01): a frase é a legenda da regra (uma frase de até 90 caracteres, ou a manchete quando não há
 * legenda), o número em jogo vai no chip (só quando é um número medido e curto) e o "Por quê?" abre as barras da regra, completadas com
 * barras listradas "Falta dado" até 2 (nunca zero). A ação só navega para a aba de origem. null quando a frase não passa nas guardas.
 * O Fechamento do mês usa esta mesma função: as 3 apostas são as 3 primeiras descobertas da Hoje.
 */
export function descobertaDaAcao(a: AcaoDaHoje): Descoberta | null {
  const legenda = a.legenda?.trim();
  const manchete = a.destaque.trim();
  const frase = legenda && checarFraseCinco(legenda).length === 0 ? legenda : checarFraseCinco(manchete).length === 0 ? manchete : null;
  if (!frase) return null;
  const impacto = a.destaqueEhNumero && frase !== manchete && checarFraseCinco(manchete, 40).length === 0 ? manchete : undefined;
  const d: Descoberta = {
    id: a.id,
    tom: a.tom,
    selo: SELO_DO_TOM[a.tom],
    frase,
    quem: a.rotuloQuem,
    ...(impacto ? { impacto } : {}),
    acao: { rotulo: a.frase.replace(/\.$/, ""), rota: a.rota },
    porque: {
      titulo: "O que explica",
      barras: barrasDoPorque(a.barras, a.destaqueEhNumero ? { rotulo: "Medido no período", exibicao: manchete } : null),
      obs: `Só dados desta clínica · ${a.contexto}`,
    },
  };
  return checarDescoberta(d).length === 0 ? d : null;
}
