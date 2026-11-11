// Fatos dos anúncios e dos links (Phase 3.1.1, plano 04): Resultados dos anúncios (anuncios) e Links rastreados (links), as duas
// abas de "De onde vêm os pacientes" que faltavam. Módulo puro, como fatos-comercial.ts: recebe o que as telas já calculam (o
// diagnóstico dos anúncios, o plano de ação, os insights e os números por link) e devolve os fatos. Não consulta nada, não
// importa React nem banco e não usa IA.
// Honestidade (D-05, T-03.1.1-08): o portão do rastreio roda ANTES de qualquer fato. Com 7.391 cliques e 29 conversas (caso
// Doctor Creator) a leitura diz "Sem leitura", explica que o rastreio está suspeito e manda o conserto para o gestor de
// tráfego; nunca diz que a campanha não rende, porque o defeito é da medição. A leitura não usa CTR, CPC, CPM, CPL nem ROAS:
// o termo técnico fica nas tabelas dos Detalhes.
import { LIMITES } from "@/lib/limites";
import { avaliarRastreio } from "@/lib/rastreio-anuncios";
import type { CampanhaDiag, DiagnosticoAds } from "@/lib/anuncios-objetivo";
import type { Insight } from "@/lib/insight";
import { deInsight, passoDeTexto, verboDoTexto } from "./adaptadores";
import { nega, portaoDoPeriodo } from "./portao";
import { periodoAnterior, type Fato, type FatosDaTela, type PassoFato, type Portao, type TelaId } from "./tipos";

/** Muda quando uma regra de fato dos anúncios ou dos links muda. */
export const VERSAO_REGRAS_ANUNCIOS = 1;

const int = (n: number) => Math.round(n).toLocaleString("pt-BR");
/** Aspas curtas para o nome de campanha ou de link (texto da equipe: só entra como texto e passa no filtro de linguagem). */
const aspas = (s: string) => `“${s.length > 48 ? `${s.slice(0, 47)}…` : s}”`;

interface PeriodoDaEntrada {
  de: string;
  ate: string;
  hoje: string;
}

// ===================================================================================================================
// Resultados dos anúncios (anuncios)
// ===================================================================================================================

/** O total do período que a tela lê de ads_resumo (a mesma fonte do comparativo da conta). */
export interface ResumoDeAnuncios {
  gasto: number;
  conversas: number;
  cliquesLink: number;
}

export interface EntradaFatosAnuncios extends PeriodoDaEntrada {
  /** O diagnóstico que diagnosticarAds e aplicarRastreio devolvem; null = a leitura falhou ou ainda não existe. */
  diag: DiagnosticoAds | null;
  /** planoDeAcao(diag): o item 1 vira o único próximo passo. */
  plano?: Insight[];
  /** insightsDeAnuncios(diag): o plano mais a leitura do custo por conversa. */
  insights?: Insight[];
  /** Total do período e do período anterior (mesmo tamanho). Sem o anterior a leitura não compara. */
  atual?: ResumoDeAnuncios | null;
  anterior?: ResumoDeAnuncios | null;
}

/** Quanto muda para a variação deixar de ser "no mesmo nível": a mesma régua de 5% do comparativo da conta. */
const LIMIAR_DE_VARIACAO = 0.05;

/** O passo de um item do plano, curto e com verbo da lista (a frase longa do plano continua nos Detalhes). */
function passoDoPlano(i: Insight, campanhas: CampanhaDiag[]): PassoFato | null {
  const quem = i.responsavel;
  const base = { quem, fatoId: i.id };
  const nome = (prefixo: string) => {
    const id = i.id.slice(prefixo.length);
    const c = campanhas.find((x) => x.campaign_id === id);
    return c ? aspas(c.campanha) : null;
  };
  const verbo = verboDoTexto(i.acao?.texto ?? "");
  if (i.id.startsWith("anuncios-cortar-")) {
    const n = nome("anuncios-cortar-");
    if (n) return verbo === "pausar" ? { ...base, verbo: "pausar", texto: `a campanha ${n}` } : { ...base, verbo: "revisar", texto: `a verba da campanha ${n}` };
  }
  if (i.id.startsWith("anuncios-escalar-")) {
    const n = nome("anuncios-escalar-");
    if (n) return { ...base, verbo: "reforçar", texto: `a verba da campanha ${n} em passos de 20%` };
  }
  if (i.id.startsWith("anuncios-revisar-")) {
    const n = nome("anuncios-revisar-");
    if (n) return { ...base, verbo: "revisar", texto: `${/público/i.test(i.titulo) ? "o público" : "o criativo"} da campanha ${n}` };
  }
  if (i.id === "anuncios-entre-objetivos") return { ...base, verbo: "revisar", texto: "para onde vai a verba entre os objetivos das campanhas" };
  if (!i.acao?.texto?.trim()) return null;
  const { verbo: v, texto } = passoDeTexto(i.acao.texto);
  return { ...base, verbo: v, texto };
}

/** Variação contra o período anterior, já em texto ("+21%", "−33%"). null sem base de comparação. */
function variacaoDeConversas(atual: number | null | undefined, antes: number | null | undefined): { pct: number; texto: string } | null {
  if (atual == null || antes == null || !Number.isFinite(atual) || !Number.isFinite(antes) || antes <= 0) return null;
  const v = atual / antes - 1;
  const pct = Math.round(Math.abs(v) * 100);
  return { pct: v, texto: `${v >= 0 ? "+" : "−"}${pct}%` };
}

export function fatosDosAnuncios(e: EntradaFatosAnuncios): FatosDaTela {
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const d = e.diag;
  const tem = !!d && d.gasto > 0;
  const temComparacao = !!e.atual && !!e.anterior;

  // Portão (D-03, D-05): o rastreio decide antes de qualquer conclusão. A conta de avaliarRastreio roda aqui mesmo, sobre os
  // números do diagnóstico; o rastreio que o diagnóstico já traz (com os atendimentos do WhatsApp) também vale.
  let portao: Portao;
  if (!d || d.gasto <= 0) {
    portao = portaoDoPeriodo({
      periodoAte: fim,
      hoje: e.hoje,
      semDado: { motivo: d ? "os anúncios não tiveram gasto neste período" : "a leitura dos anúncios não chegou", quem: "equipe_hub" },
    });
  } else {
    const perfil = d.cliquesPerfil ?? 0;
    const cliquesFora = d.cliquesLink - perfil;
    const conferido = avaliarRastreio({ cliquesLink: cliquesFora, cliquesPerfil: perfil, conversas: d.conversas });
    if (conferido.suspeito || d.rastreio?.suspeito) {
      portao = nega(
        "rastreio_suspeito",
        `o rastreio das conversas dos anúncios está suspeito (${int(cliquesFora)} cliques no link e só ${int(d.conversas)} ${d.conversas === 1 ? "conversa contada" : "conversas contadas"})`,
        { verbo: "corrigir", texto: "o rastreio das conversas dos anúncios", quem: "gestor_trafego" },
      );
    } else {
      portao = portaoDoPeriodo({ periodoAte: fim, hoje: e.hoje });
    }
  }

  const fatos: Fato[] = [];
  let proximoPasso: PassoFato | null = null;
  const outrosPassos: PassoFato[] = [];

  if (d && tem && portao.ok) {
    // O que aconteceu: as conversas iniciadas pelos anúncios, com o número ao lado e a variação quando há período anterior.
    const v = temComparacao ? variacaoDeConversas(e.atual!.conversas, e.anterior!.conversas) : null;
    const numero = `${int(d.conversas)} ${d.conversas === 1 ? "conversa" : "conversas"}`;
    if (v) {
      const sobe = v.pct >= LIMIAR_DE_VARIACAO;
      const cai = v.pct <= -LIMIAR_DE_VARIACAO;
      fatos.push({
        id: "conversas",
        tom: cai ? "ruim" : "bom",
        peso: 3,
        frase: sobe
          ? "As conversas iniciadas pelos anúncios subiram em relação ao período anterior."
          : cai
            ? "As conversas iniciadas pelos anúncios caíram em relação ao período anterior."
            : "As conversas iniciadas pelos anúncios ficaram no mesmo nível do período anterior.",
        numeros: [{ chave: "conversas", exibicao: `${numero} (${v.texto} contra o período anterior)`, valor: d.conversas }],
        n: d.conversas,
      });
    } else {
      fatos.push({
        id: "conversas",
        tom: d.conversas > 0 ? "bom" : "neutro",
        peso: 3,
        frase: d.conversas > 0 ? "Os anúncios iniciaram conversas no período." : "Nenhuma conversa foi iniciada pelos anúncios neste período.",
        numeros: [{ chave: "conversas", exibicao: numero, valor: d.conversas }],
        n: d.conversas,
      });
    }

    // O plano de ação e o custo por conversa que a tela já calcula: os insights viram fatos, sem regra nova.
    const plano = e.plano ?? [];
    const idsDoPlano = new Set(plano.map((i) => i.id));
    for (const i of e.insights ?? plano) {
      if (i.id === "anuncios-rastreio-suspeito") continue;
      const { fato, passo } = deInsight(i);
      // As conversas abrem a leitura (é o que o médico quer saber primeiro); o resto do plano explica o porquê.
      fatos.push({ ...fato, peso: Math.min(fato.peso, 2) as 1 | 2 });
      if (!idsDoPlano.has(i.id) && passo) outrosPassos.push(passo);
    }
    // Um só próximo passo (D-05): o item 1 do plano; os outros itens vão para "ver mais".
    const passos = plano.map((i) => passoDoPlano(i, d.campanhas)).filter((p): p is PassoFato => p != null);
    proximoPasso = passos[0] ?? null;
    outrosPassos.unshift(...passos.slice(1));
  }

  return {
    tela: "anuncios" satisfies TelaId,
    versaoRegras: VERSAO_REGRAS_ANUNCIOS,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: temComparacao ? periodoAnterior(e.de, fim) : null },
    portao,
    fatos,
    proximoPasso,
    outrosPassos,
  };
}

// ===================================================================================================================
// Links rastreados (links)
// ===================================================================================================================

/** Um link e o que a tela já carrega dele no período. O rótulo é o nome que a equipe deu ou o lugar do link. */
export interface LinhaDeLink {
  rotulo: string;
  cliques: number;
  conversas: number;
  agendou: number;
  vendas: number;
}

export interface EntradaFatosLinks extends PeriodoDaEntrada {
  /** Os links com as contagens do período; null = a leitura falhou ou ainda não existe; [] = nenhum link criado. */
  links: LinhaDeLink[] | null;
}

export function fatosDosLinks(e: EntradaFatosLinks): FatosDaTela {
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const links = e.links ?? [];
  const cliques = links.reduce((s, l) => s + l.cliques, 0);
  const conversas = links.reduce((s, l) => s + l.conversas, 0);

  let portao: Portao;
  if (e.links == null) {
    portao = portaoDoPeriodo({ periodoAte: fim, hoje: e.hoje, semDado: { motivo: "a leitura dos links não chegou", quem: "equipe_hub" } });
  } else if (links.length === 0) {
    portao = nega("sem_dado", "ainda não há link rastreado para esta clínica", { verbo: "publicar", texto: "o primeiro link rastreado, o da bio", quem: "equipe_hub" });
  } else if (cliques + conversas <= 0) {
    portao = nega("sem_dado", "os links ainda não tiveram cliques neste período", { verbo: "conferir", texto: "se os links rastreados estão na bio e nos stories", quem: "social_media" });
  } else {
    portao = portaoDoPeriodo({ periodoAte: fim, hoje: e.hoje });
  }

  const fatos: Fato[] = [];
  let proximoPasso: PassoFato | null = null;

  if (portao.ok) {
    const minimo = LIMITES.leitura.grupoMinimo;
    if (conversas > minimo) {
      // O link líder só é afirmado com a base de grupoMinimo conversas ligadas aos links (nunca com 2 ou 3).
      const lider = [...links].sort((a, b) => b.conversas - a.conversas || b.cliques - a.cliques)[0];
      fatos.push({
        id: "conversas-links",
        tom: "bom",
        peso: 2,
        frase: "Os links rastreados registraram conversas no período.",
        numeros: [{ chave: "conversas", exibicao: `${int(conversas)} ${conversas === 1 ? "conversa" : "conversas"} em ${int(cliques)} ${cliques === 1 ? "clique" : "cliques"}`, valor: conversas }],
        n: conversas,
      });
      fatos.push({
        id: "link-lider",
        tom: "bom",
        peso: 3,
        frase: `O link com mais conversas é ${aspas(lider.rotulo)}.`,
        numeros: [{ chave: "link_lider", exibicao: `${int(lider.conversas)} de ${int(conversas)} conversas`, valor: lider.conversas }],
        n: conversas,
      });
      proximoPasso = { verbo: "reforçar", texto: `o link ${aspas(lider.rotulo)}`, quem: "social_media", fatoId: "link-lider" };
    } else {
      // Base pequena: diz que ainda não dá para apontar o link que mais rende (nunca nomeia um link com 2 ou 3 conversas).
      fatos.push({
        id: "base-pequena-links",
        tom: "atencao",
        peso: 2,
        ressalva: true,
        frase: "Ainda são poucas conversas ligadas aos links para dizer qual deles rende mais.",
        numeros: [{ chave: "conversas", exibicao: `${int(conversas)} ${conversas === 1 ? "conversa" : "conversas"}`, valor: conversas }],
        n: conversas,
      });
      proximoPasso = { verbo: "conferir", texto: "se todos os links rastreados estão na bio e nos stories", quem: "social_media", fatoId: "base-pequena-links" };
    }
  }

  return {
    tela: "links" satisfies TelaId,
    versaoRegras: VERSAO_REGRAS_ANUNCIOS,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: null },
    portao,
    fatos,
    proximoPasso,
    outrosPassos: [],
  };
}
