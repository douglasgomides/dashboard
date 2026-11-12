// Fatos das telas de Marketing, parte Instagram (Phase 3.1, plano 05): Analisar desempenho, Encontrar destaques,
// Público do Instagram, Consultar publicações e Conteúdo × Comercial. Módulo puro: recebe o que cada tela já carregou
// (achados de lerPeriodo, posts, números da Meta, retorno do cruzamento) e devolve os fatos. Só regra fixa: sem IA, sem
// consulta nova e sem guardar nada.
//
// Privacidade (LEIT-01): o fato leva só contagens, formato e data. Legenda, comentário e nome de seguidor nunca entram.
// Atribuição (LEIT-07): "trouxe X% dos contatos" nunca sai daqui. Sem origem por post medida, com a cobertura visível,
// guardaOrigemPorPost não libera e a leitura diz "Sem leitura: origem por post não medida".
import { LIMITES } from "@/lib/limites";
import { MIN_POSTS_CONCLUSAO } from "@/lib/metricas";
import { MIN_POSTS_LEITURA, nomeLeigoDoFormato, type Achado, type Leitura } from "@/lib/leitura-periodo";
import type { Responsavel } from "@/lib/insight";
import { FOLGA_META_INSTAGRAM, type StatusFonte } from "@/lib/status-fonte";
import {
  efeitoComparavel,
  efeitoPorDiaDaSemana,
  juntarTemas,
  quem,
  quemAgendou,
  temasSemPost,
  MIN_COMENTARIOS_COMPRA,
  MIN_CONVERSAS_FAIXA,
  MIN_CONVERSAS_TEMA,
  MIN_DIAS,
  type DadosCruzamento,
  type DadosProfundos,
} from "@/lib/conteudo-comercial";
import { deAchado } from "./adaptadores";
import { nega, piorPortao, portaoDoPeriodo } from "./portao";
import { periodoAnterior, type BarraDoFato, type Fato, type FatosDaTela, type PassoFato, type Portao, type TelaId, type TomFato } from "./tipos";

/** Muda quando uma regra de fato do Instagram muda. */
export const VERSAO_REGRAS_INSTAGRAM = 1;

const DIA = 86_400_000;
const ms = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const f = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct1 = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const pct0 = (v: number) => `${Math.round(v * 100).toLocaleString("pt-BR")}%`;
const ate = (d: string, hoje: string) => (d > hoje ? hoje : d);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mínimo de dias medidos para o saldo de seguidores virar fato (mesmo piso da projeção de seguidores, hub-conteudo). */
export const MIN_DIAS_SALDO = 5;

// ---------- peças comuns ----------
export interface PostLeitura {
  format?: string | null;
  reach?: number | null;
  saved?: number | null;
  posted_at?: string | null;
  tema?: string | null;
}

const NOME_FORMATO: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Imagem" };
const UM_FORMATO: Record<string, string> = { reels: "um Reels", carrossel: "um carrossel", estatico: "uma imagem" };
const nomeFormato = (fm?: string | null) => (fm ? NOME_FORMATO[fm] ?? fm : "Formato não informado");
const umFormato = (fm?: string | null) => (fm ? UM_FORMATO[fm] ?? "um post" : "um post");
const diaDoPost = (p: PostLeitura) => (p.posted_at ? new Date(Date.parse(p.posted_at) - 3 * 3600_000).toISOString().slice(0, 10) : null);

const ORDEM_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

interface PassoComPeso {
  passo: PassoFato;
  tom: TomFato;
  peso: number;
}

/** Primeiro o que corrige (ruim, atenção), depois o que repete (bom), como lerPeriodo ordena as ações. */
function ordenarPassos(lista: PassoComPeso[]): { principal: PassoFato | null; outros: PassoFato[] } {
  const ordem = [...lista].sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom] || b.peso - a.peso).map((x) => x.passo);
  const unicos = ordem.filter((p, k) => ordem.findIndex((x) => x.fatoId === p.fatoId && x.texto === p.texto) === k);
  return { principal: unicos[0] ?? null, outros: unicos.slice(1) };
}

/** Quando a leitura conclui e nenhuma regra pede correção: conferir de novo no próximo período. */
const PASSO_SEM_CORRECAO: PassoFato = {
  verbo: "conferir",
  texto: "de novo no próximo período se o resultado se mantém",
  quem: "social_media",
  motivo: "Nada pede correção agora.",
  fatoId: "sem-correcao",
};

function montar(args: {
  tela: TelaId;
  de: string;
  ate: string;
  portao: Portao;
  fatos: Fato[];
  passos: PassoComPeso[];
  anterior?: { de: string; ate: string } | null;
  fim?: string;
  extraFinal?: PassoFato[];
}): FatosDaTela {
  const passos = [...args.passos];
  // Toda leitura que conclui algo traz um próximo passo (LEIT-02). Quando nada pede correção, o passo é conferir de novo.
  if (!passos.length && args.portao.ok && args.fatos.some((x) => x.tom !== "neutro" && !x.ressalva)) {
    passos.push({ passo: PASSO_SEM_CORRECAO, tom: "bom", peso: 0 });
  }
  const { principal, outros } = ordenarPassos(passos);
  return {
    tela: args.tela,
    versaoRegras: VERSAO_REGRAS_INSTAGRAM,
    tipoPeriodo: "periodo",
    periodo: { de: args.de, ate: args.fim ?? args.ate, anterior: args.anterior ?? null },
    portao: args.portao,
    fatos: args.fatos,
    proximoPasso: principal,
    outrosPassos: [...outros, ...(args.extraFinal ?? [])],
  };
}

/** Poucos posts: a leitura diz o número e quem resolve (D-03). 0 posts é falta de dado, não amostra pequena. */
function portaoDePosts(nPosts: number): Portao {
  if (nPosts === 0) {
    return nega("sem_dado", "nenhum post do Instagram neste período", { verbo: "conferir", texto: "a sincronização dos posts do Instagram", quem: "equipe_hub" });
  }
  if (nPosts < MIN_POSTS_LEITURA) {
    return nega("amostra_pequena", `poucos posts no período (${nPosts}, o mínimo é ${MIN_POSTS_LEITURA})`, {
      verbo: "publicar",
      texto: "mais posts antes de ler o desempenho",
      quem: "social_media",
    });
  }
  return { ok: true };
}

/** Tela do Instagram quando o cliente não tem o Instagram ligado: "Sem leitura:", o motivo e quem resolve. */
export function fatosSemInstagram(tela: TelaId, periodo: { de: string; ate: string }, hoje: string): FatosDaTela {
  return montar({
    tela,
    de: periodo.de,
    ate: periodo.ate,
    fim: ate(periodo.ate, hoje),
    portao: portaoDoPeriodo({ periodoAte: ate(periodo.ate, hoje), hoje, semDado: { motivo: "o Instagram deste cliente ainda não está ligado", quem: "equipe_hub" } }),
    fatos: [],
    passos: [],
  });
}

// ---------- Analisar desempenho e Encontrar destaques ----------
export interface EntradaFatosInstagram {
  de: string;
  ate: string;
  /** Hoje, no fuso de Brasília. */
  hoje: string;
  /** Posts do período (só contagens, formato e data entram nos fatos). */
  posts: PostLeitura[];
  /** Dias do Instagram com alcance medido. Quando vem, a fonte parada nega a leitura. */
  diario?: { date: string; reach?: number | null }[];
  /** O período anterior tem dias medidos: só então o subtítulo diz "comparado com". */
  anteriorMedido?: boolean;
  /** A comparação com o período anterior é limitada (variacoes de diagnostico-estrategico): vira ressalva, nunca conclusão. */
  variacaoLimitada?: { motivo: string } | null;
  statusDaFonte?: StatusFonte | null;
  /** Saldo de seguidores do período (analyzeGrowth): novos, saídas e dias medidos. */
  crescimento?: { novos: number; saidas: number; liquido: number; diasMedidos: number } | null;
}

/** Achados de lerPeriodo que falam do Instagram (os de anúncio e de atendimento são de outras telas). */
const ACHADOS_CONTEUDO = ["ritmo", "concentracao", "formato", "seguir", "constancia"];
const ACHADOS_TOP = ["concentracao", "formato", "seguir"];

/** Frases próprias onde o texto do achado cairia em filtro (causa sem prova, "único") ou trataria como previsão. */
function fraseDoAchado(a: Achado, base: string): string {
  if (a.id === "seguir") {
    return a.titulo.includes("não foi o que mais alcançou")
      ? "O post que mais fez a pessoa seguir o perfil não foi o de maior alcance."
      : "O post de maior alcance foi também o que mais fez a pessoa seguir o perfil.";
  }
  if (a.id === "concentracao") return `Um só post concentrou ${a.titulo.split(" ")[0]} do alcance dos posts do período.`;
  return base;
}

/** O número que sustenta a frase: o `base` do achado. Base longa demais fica só no primeiro trecho. */
function numeroDoAchado(a: Achado, atual: Fato): Fato["numeros"] {
  if (atual.numeros.length) return atual.numeros;
  const trecho = a.base.split(" · ")[0].trim();
  return trecho ? [{ chave: "base", exibicao: trecho.length > 200 ? `${trecho.slice(0, 197)}...` : trecho }] : [];
}

/** O passo de cada achado, com verbo da lista e quem resolve. Texto curto e leigo, sem a frase longa da regra. */
function passoDoAchado(a: Achado): PassoFato | null {
  const base = { quem: "social_media" as Responsavel, fatoId: a.id };
  switch (a.id) {
    case "ritmo":
      if (a.tom === "bom") return { ...base, verbo: "reforçar", texto: "o tema e o formato dos posts que mais alcançaram", motivo: "O alcance subiu dentro do período." };
      if (a.acao) return { ...base, verbo: "revisar", texto: "os posts do trecho fraco e do trecho forte do período", motivo: "O alcance caiu dentro do período." };
      return null;
    case "concentracao":
      return { ...base, verbo: "publicar", texto: "mais posts do mesmo tema do post que mais alcançou, em outros formatos", motivo: "O alcance do período dependeu de um post só." };
    case "formato":
      return { ...base, verbo: "reforçar", texto: "o formato que mais alcança nos próximos posts", motivo: "Esse formato levou o perfil a mais gente no período." };
    case "seguir":
      return { ...base, verbo: "reforçar", texto: "o assunto do post que mais fez a pessoa seguir o perfil", motivo: "Esse post fez mais gente seguir o perfil por pessoa alcançada." };
    case "constancia":
      return { ...base, verbo: "publicar", texto: "posts de reserva para as semanas cheias de consultório", motivo: "O perfil ficou dias sem publicar." };
    default:
      return null;
  }
}

function portaoDoInstagram(e: EntradaFatosInstagram): Portao {
  const fim = ate(e.ate, e.hoje);
  const comDado = (e.diario ?? []).filter((d) => d.reach != null).map((d) => d.date.slice(0, 10)).sort();
  const base: Portao = e.diario
    ? portaoDoPeriodo({
        // A Meta leva dias para fechar um dia de métricas: esses dias não contam como atraso.
        periodoAte: iso(ms(fim) - FOLGA_META_INSTAGRAM * DIA),
        hoje: e.hoje,
        semDado: comDado.length === 0 ? { motivo: "o Instagram não tem nenhum dia com dado neste período", quem: "equipe_hub" } : null,
        fontes: [{ nome: "Instagram", status: e.statusDaFonte ?? null, ultimoDado: comDado[comDado.length - 1] ?? null }],
      })
    : { ok: true };
  return piorPortao([base, portaoDePosts(e.posts.length)]);
}

/**
 * Fatos de Analisar desempenho (tela "conteudo") e de Encontrar destaques (tela "top"). As conclusões vêm dos achados de
 * lerPeriodo (ritmo do alcance, dependência de um post, formato, o que faz seguir, constância); o saldo de seguidores e o
 * post de maior alcance entram como fatos próprios. Nenhuma frase fala de projeção, previsão ou ritmo futuro.
 */
export function fatosDoInstagram(leitura: Pick<Leitura, "achados">, e: EntradaFatosInstagram, tela: "conteudo" | "top" = "conteudo"): FatosDaTela {
  const fim = ate(e.ate, e.hoje);
  const ids = tela === "top" ? ACHADOS_TOP : ACHADOS_CONTEUDO;
  const fatos: Fato[] = [];
  const passos: PassoComPeso[] = [];

  for (const a of leitura.achados.filter((x) => ids.includes(x.id))) {
    const { fato } = deAchado(a);
    const final: Fato = { ...fato, frase: fraseDoAchado(a, fato.frase), numeros: numeroDoAchado(a, fato) };
    fatos.push(final);
    const passo = passoDoAchado(a);
    if (passo) passos.push({ passo, tom: a.tom, peso: final.peso });
  }

  // Saldo de seguidores no período: o que a tela de desempenho mais mostra.
  const c = e.crescimento;
  if (tela === "conteudo" && c && c.diasMedidos >= MIN_DIAS_SALDO) {
    const abs = Math.abs(c.liquido);
    const numeros = [{ chave: "saldo", exibicao: `${c.liquido >= 0 ? "+" : "−"}${f(abs)} seguidores`, valor: c.liquido }];
    const entrouSaiu = `entraram ${f(c.novos)} e saíram ${f(c.saidas)}`;
    const fato: Fato =
      c.liquido > 0
        ? { id: "saldo-seguidores", tom: "bom", peso: 2, frase: `O perfil ganhou ${f(abs)} seguidores no período: ${entrouSaiu}.`, numeros }
        : c.liquido < 0
          ? { id: "saldo-seguidores", tom: "ruim", peso: 3, frase: `O perfil perdeu ${f(abs)} seguidores no período: ${entrouSaiu}.`, numeros }
          : { id: "saldo-seguidores", tom: "atencao", peso: 1, frase: `O número de seguidores ficou igual no período: ${entrouSaiu}.`, numeros };
    fatos.push(fato);
    if (c.liquido < 0) {
      passos.push({
        passo: { verbo: "revisar", texto: "os posts e os assuntos do período em que o perfil perdeu seguidores", quem: "social_media", motivo: "Saíram mais seguidores do que entraram.", fatoId: fato.id },
        tom: "ruim",
        peso: 3,
      });
    }
  }

  // Post de maior alcance (Encontrar destaques), sem afirmar causa: só o número e o formato.
  const comAlcance = e.posts.filter((p) => Number(p.reach) > 0);
  if (tela === "top" && comAlcance.length >= MIN_POSTS_LEITURA) {
    const topo = [...comAlcance].sort((a, b) => Number(b.reach) - Number(a.reach))[0];
    const dia = diaDoPost(topo);
    const fato: Fato = {
      id: "maior-alcance",
      tom: "bom",
      peso: 3,
      frase: `O post que mais alcançou foi ${umFormato(topo.format)}${dia ? `, publicado em ${ddmm(dia)}` : ""}.`,
      numeros: [{ chave: "alcance", exibicao: `${f(Number(topo.reach))} contas`, valor: Number(topo.reach) }],
    };
    fatos.push(fato);
    passos.push({
      passo: { verbo: "reforçar", texto: "o formato e o assunto do post que mais alcançou", quem: "social_media", motivo: "Foi o post de maior alcance do período.", fatoId: fato.id },
      tom: "bom",
      peso: 3,
    });
  }

  // Comparação limitada: ressalva do dado, nunca conclusão.
  const diasComDado = (e.diario ?? []).filter((d) => d.reach != null).length;
  if (tela === "conteudo" && e.variacaoLimitada && diasComDado > 0) {
    fatos.push({
      id: "variacao-limitada",
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: `A comparação com o período anterior é limitada: ${e.variacaoLimitada.motivo.replace(/\.$/, "").replace(/^./, (x) => x.toLowerCase())}.`,
      numeros: [{ chave: "dias_com_dado", exibicao: `${diasComDado} dias com dado` }],
      n: diasComDado,
    });
  }

  return montar({
    tela,
    de: e.de,
    ate: e.ate,
    fim,
    portao: portaoDoInstagram(e),
    fatos,
    passos,
    anterior: e.anteriorMedido && tela === "conteudo" ? periodoAnterior(e.de, fim) : null,
  });
}

// ---------- Consultar publicações ----------
export interface EntradaFatosPublicacoes {
  de: string;
  ate: string;
  hoje: string;
  posts: PostLeitura[];
}

/** Taxa de salvamento mediana de cada formato com a amostra mínima de conclusão (8 posts). */
function formatosComAmostra(posts: PostLeitura[]): { formato: string; taxa: number; n: number }[] {
  const grupos = new Map<string, number[]>();
  for (const p of posts) {
    if (!p.format || !(Number(p.reach) > 0)) continue;
    const l = grupos.get(p.format) ?? [];
    l.push(Number(p.saved ?? 0) / Number(p.reach));
    grupos.set(p.format, l);
  }
  return [...grupos.entries()]
    .filter(([, l]) => l.length >= MIN_POSTS_CONCLUSAO)
    .map(([formato, l]) => ({ formato, taxa: mediana(l), n: l.length }))
    .sort((a, b) => b.taxa - a.taxa);
}

export function fatosDePublicacoes(e: EntradaFatosPublicacoes): FatosDaTela {
  const fim = ate(e.ate, e.hoje);
  const fatos: Fato[] = [];
  const passos: PassoComPeso[] = [];
  const portao = portaoDePosts(e.posts.length);

  const grupos = formatosComAmostra(e.posts);
  if (grupos.length >= 2 && grupos[0].taxa > grupos[1].taxa) {
    const [a, b] = grupos;
    const fato: Fato = {
      id: "formato-melhor-taxa",
      tom: "bom",
      peso: 2,
      manchete: `${nomeLeigoDoFormato(a.formato)} foi mais salvo`,
      frase: `${nomeFormato(a.formato)} foi o formato com mais salvamentos por pessoa alcançada, à frente de ${nomeFormato(b.formato)}.`,
      numeros: [{ chave: "taxa", exibicao: `${pct1(a.taxa)} contra ${pct1(b.taxa)} (${a.n} e ${b.n} posts)`, valor: a.taxa }],
      n: a.n,
    };
    fatos.push(fato);
    passos.push({
      passo: { verbo: "reforçar", texto: `o formato ${nomeFormato(a.formato)} nos próximos posts`, quem: "social_media", motivo: "Foi o formato com mais salvamentos por pessoa alcançada.", fatoId: fato.id },
      tom: "bom",
      peso: 2,
    });
  } else if (grupos.length === 1) {
    fatos.push({
      id: "formato-sem-comparacao",
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: `Só ${nomeFormato(grupos[0].formato)} tem ${MIN_POSTS_CONCLUSAO} posts ou mais no período, então os formatos não entram em comparação.`,
      numeros: [{ chave: "posts", exibicao: `${grupos[0].n} posts` }],
      n: grupos[0].n,
    });
  }

  // O post mais salvo do período.
  const salvos = e.posts.filter((p) => Number(p.saved) > 0).sort((a, b) => Number(b.saved) - Number(a.saved));
  if (salvos.length) {
    const p = salvos[0];
    const fato: Fato = {
      id: "post-mais-salvo",
      tom: "bom",
      peso: 2,
      frase: `O post mais salvo foi ${umFormato(p.format)}.`,
      numeros: [{ chave: "salvamentos", exibicao: `${f(Number(p.saved))} salvamentos`, valor: Number(p.saved) }],
    };
    fatos.push(fato);
    passos.push({
      passo: { verbo: "reforçar", texto: "o assunto do post mais salvo", quem: "social_media", motivo: "Foi o post que mais pessoas guardaram no período.", fatoId: fato.id },
      tom: "bom",
      peso: 2,
    });
  }

  // Posts sem tema: as análises por assunto ficam vazias.
  const semTema = e.posts.filter((p) => !p.tema).length;
  if (e.posts.length > 0 && semTema / e.posts.length >= 0.3) {
    const fato: Fato = {
      id: "posts-sem-tema",
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: "Muitos posts estão sem tema, então as análises por assunto ficam vazias.",
      numeros: [{ chave: "sem_tema", exibicao: `${semTema} de ${e.posts.length} posts` }],
      n: e.posts.length,
    };
    fatos.push(fato);
    passos.push({
      passo: { verbo: "corrigir", texto: "o tema dos posts que estão sem classificação", quem: "social_media", motivo: "Sem tema, não dá para comparar os assuntos.", fatoId: fato.id, soEquipe: true },
      tom: "atencao",
      peso: 1,
    });
  }

  return montar({ tela: "posts", de: e.de, ate: e.ate, fim, portao, fatos, passos });
}

// ---------- Público do Instagram ----------
export interface EntradaFatosPublico {
  /** A janela da Meta (fixa, não segue o período escolhido na tela). */
  de: string;
  ate: string;
  hoje: string;
  dias: number;
  /** Seguidores por faixa etária ("13-17", "18-24", ..., "U" = não informada). null = a Meta não devolveu. */
  faixas: { chave: string; valor: number }[] | null;
  alcance: { seguidores: number; nao_seguidores: number } | null;
  saldo: { seguiram: number; deixaram_de_seguir: number; saldo: number } | null;
  /** A janela com mais seguidores online (dia 0 = domingo). */
  janelaOnline: { dia: number; hora: number; online: number } | null;
}

const NO_DIA = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];

export function fatosDoPublico(e: EntradaFatosPublico): FatosDaTela {
  const minimo = LIMITES.leitura.grupoMinimo;
  const fim = ate(e.ate, e.hoje);
  const fatos: Fato[] = [];
  const passos: PassoComPeso[] = [];

  // Faixa etária que mais segue: só com a amostra mínima na própria faixa.
  const conhecidas = (e.faixas ?? []).filter((x) => x.chave !== "U");
  const totalFaixas = (e.faixas ?? []).reduce((s, x) => s + x.valor, 0);
  const topo = conhecidas.length ? conhecidas.reduce((m, x) => (x.valor > m.valor ? x : m)) : null;
  if (topo && topo.valor >= minimo && totalFaixas > 0) {
    fatos.push({
      id: "faixa-dominante",
      tom: "bom",
      peso: 1,
      frase: `A faixa de ${topo.chave} anos é a que mais segue o perfil.`,
      numeros: [{ chave: "faixa", exibicao: `${pct0(topo.valor / totalFaixas)} dos seguidores (${f(topo.valor)} de ${f(totalFaixas)})`, valor: topo.valor }],
      n: topo.valor,
    });
  }

  // Alcance fora da base: quanto do alcance foi de quem ainda não segue.
  if (e.alcance) {
    const total = e.alcance.seguidores + e.alcance.nao_seguidores;
    if (total >= minimo) {
      const parte = e.alcance.nao_seguidores / total;
      const tom: TomFato = parte >= 0.5 ? "bom" : parte < 0.2 ? "atencao" : "neutro";
      const fato: Fato = {
        id: "alcance-fora-da-base",
        tom,
        peso: 2,
        frase: `${pct0(parte)} do alcance dos últimos ${e.dias} dias foi de quem ainda não segue o perfil.`,
        numeros: [{ chave: "fora_da_base", exibicao: `${f(e.alcance.nao_seguidores)} de ${f(total)} contas`, valor: e.alcance.nao_seguidores }],
        n: total,
      };
      fatos.push(fato);
      if (tom === "atencao") {
        passos.push({
          passo: { verbo: "publicar", texto: "conteúdo pensado para quem ainda não segue o perfil", quem: "social_media", motivo: "O alcance foi quase todo de quem já segue.", fatoId: fato.id },
          tom,
          peso: 2,
        });
      }
    }
  }

  // Saldo de seguidores na janela da Meta.
  if (e.saldo && e.saldo.seguiram + e.saldo.deixaram_de_seguir >= minimo) {
    const s = e.saldo;
    const abs = Math.abs(s.saldo);
    const entrouSaiu = `${f(s.seguiram)} entraram e ${f(s.deixaram_de_seguir)} saíram`;
    const numeros = [{ chave: "saldo", exibicao: `${s.saldo >= 0 ? "+" : "−"}${f(abs)} seguidores`, valor: s.saldo }];
    const fato: Fato =
      s.saldo > 0
        ? { id: "saldo-publico", tom: "bom", peso: 2, frase: `Nos últimos ${e.dias} dias o perfil ganhou ${f(abs)} seguidores: ${entrouSaiu}.`, numeros }
        : s.saldo < 0
          ? { id: "saldo-publico", tom: "ruim", peso: 3, frase: `Nos últimos ${e.dias} dias o perfil perdeu ${f(abs)} seguidores: ${entrouSaiu}.`, numeros }
          : { id: "saldo-publico", tom: "atencao", peso: 1, frase: `Nos últimos ${e.dias} dias o número de seguidores ficou igual: ${entrouSaiu}.`, numeros };
    fatos.push(fato);
    if (s.saldo < 0) {
      passos.push({
        passo: { verbo: "revisar", texto: "os posts e os assuntos dos dias em que mais gente deixou de seguir", quem: "social_media", motivo: "Saíram mais seguidores do que entraram.", fatoId: fato.id },
        tom: "ruim",
        peso: 3,
      });
    }
  }

  // A janela com mais seguidores online (Meta, horário de Brasília).
  if (e.janelaOnline && e.janelaOnline.online > 0) {
    const j = e.janelaOnline;
    const quando = `${NO_DIA[j.dia] ?? "num dia da semana"}, perto das ${j.hora}h`;
    const fato: Fato = {
      id: "janela-online",
      tom: "bom",
      peso: 1,
      frase: `Os seguidores ficam mais online ${quando}.`,
      numeros: [{ chave: "online", exibicao: `${f(j.online)} seguidores online em média`, valor: j.online }],
    };
    fatos.push(fato);
    passos.push({
      passo: { verbo: "publicar", texto: `perto das ${j.hora}h ${NO_DIA[j.dia] ?? ""}, quando mais seguidores estão online`.replace(/\s+,/g, ","), quem: "social_media", motivo: "É a janela com mais seguidores online, segundo a Meta.", fatoId: fato.id },
      tom: "bom",
      peso: 1,
    });
  }

  const semNada = !e.faixas && !e.alcance && !e.saldo && !e.janelaOnline;
  const portao = portaoDoPeriodo({
    periodoAte: fim,
    hoje: e.hoje,
    semDado: semNada ? { motivo: "a Meta não devolveu os dados do público", quem: "equipe_hub" } : null,
  });
  return montar({ tela: "audiencia", de: e.de, ate: e.ate, fim, portao, fatos, passos });
}

// ---------- Conteúdo × Comercial ----------

/** O que a guarda precisa para liberar uma afirmação de origem por post. */
export interface EntradaOrigemPorPost {
  /** A origem de cada contato foi medida por post (hoje nenhuma fonte mede). */
  medida?: boolean;
  /** Parte dos contatos com origem por post conhecida (0 a 1). Precisa ficar visível junto da afirmação. */
  cobertura?: number | null;
}

export type GuardaOrigemPorPost = { liberado: true; cobertura: number } | { liberado: false; motivo: string; passo: PassoFato };

/**
 * Só libera falar de origem por post quando a origem por post está medida e a cobertura chega ao mínimo de origem do ROI
 * (LIMITES.roi.origemMinima). Hoje nenhuma fonte traz origem por post: devolve o motivo "origem por post não medida" e o
 * passo para quem resolve (decisão aberta 8 do João; T-03.1-13).
 */
export function guardaOrigemPorPost(entrada?: EntradaOrigemPorPost | null): GuardaOrigemPorPost {
  const cobertura = entrada?.cobertura;
  if (entrada?.medida === true && cobertura != null && cobertura >= LIMITES.roi.origemMinima) return { liberado: true, cobertura };
  return {
    liberado: false,
    motivo: "origem por post não medida",
    passo: {
      verbo: "conferir",
      texto: "como medir a origem de cada contato por post (sem leitura: origem por post não medida)",
      quem: "equipe_hub",
      motivo: "Sem isso, a tela não diz qual post originou cada conversa.",
      fatoId: "origem-por-post",
      soEquipe: true,
    },
  };
}

/** O texto que a tela mostra no aviso fixo da atribuição por post. */
export const SEM_LEITURA_ORIGEM_POR_POST = "Sem leitura: origem por post não medida";

export interface EntradaFatosConteudoComercial {
  de: string;
  ate: string;
  hoje: string;
  dados: DadosCruzamento & { cobertura: { conversas: number; lidas: number; sem_texto: number; com_tema: number; posts: number } };
  profundos?: DadosProfundos | null;
  origemPorPost?: EntradaOrigemPorPost | null;
}

const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const mediaTxt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

export function fatosConteudoComercial(e: EntradaFatosConteudoComercial): FatosDaTela {
  const fim = ate(e.ate, e.hoje);
  const d = e.dados;
  const c = d.cobertura;
  const fatos: Fato[] = [];
  const passos: PassoComPeso[] = [];

  // Portão: sem conversa nenhuma, ou poucos posts, a leitura não conclui.
  const portao = piorPortao([
    portaoDoPeriodo({
      periodoAte: fim,
      hoje: e.hoje,
      semDado: c.conversas === 0 ? { motivo: "nenhuma conversa nova chegou no WhatsApp neste período", quem: "equipe_hub" } : null,
    }),
    portaoDePosts(c.posts),
  ]);

  // 1. Postar muda o volume de conversas? Só entre dias equivalentes (mesmo dia da semana). É coincidência no tempo.
  const ef = efeitoPorDiaDaSemana(d.dias ?? []);
  if (efeitoComparavel(ef)) {
    const dif = ef.mediaSem > 0 ? Math.round(((ef.mediaCom - ef.mediaSem) / ef.mediaSem) * 100) : null;
    const maior = Math.max(ef.mediaCom, ef.mediaSem);
    const rel = (v: number) => (maior > 0 ? Math.min(1, Math.max(0, v / maior)) : 0);
    // Duas barras (quick 261112-e8e): a regra calcula a proporção, a tela só desenha.
    const barras: BarraDoFato[] = [
      { rotulo: "Com post", exibicao: `${mediaTxt(ef.mediaCom)} por dia`, fracao: rel(ef.mediaCom) },
      { rotulo: "Sem post", exibicao: `${mediaTxt(ef.mediaSem)} por dia`, fracao: rel(ef.mediaSem) },
    ];
    const antigo = { chave: "conversas_por_dia", exibicao: `${mediaTxt(ef.mediaCom)} contra ${mediaTxt(ef.mediaSem)} conversas por dia`, valor: ef.mediaCom };
    if (dif == null || Math.abs(dif) < 10) {
      const frase = "Conversas parecidas nos dias com post e nos dias sem post do mesmo dia da semana.";
      fatos.push({ id: "efeito-post", tom: "atencao", peso: 1, frase, comparacao: { frase, barras }, numeros: [antigo], n: ef.diasCom });
    } else if (dif > 0) {
      // O destaque leigo vem primeiro ("+25% de conversas"); o número antigo fica como segundo número.
      const numeros = [{ chave: "conversas_variacao", exibicao: `+${dif}% de conversas`, valor: dif }, antigo];
      const frase = "Dias com post tiveram mais conversas que o mesmo dia sem post.";
      const fato: Fato = { id: "efeito-post", tom: "bom", peso: 2, frase, comparacao: { frase, barras }, numeros, n: ef.diasCom };
      fatos.push(fato);
      passos.push({ passo: { verbo: "publicar", texto: "também nos dias úteis de agenda vazia", quem: "social_media", motivo: "Os dias com post tiveram mais conversas; pode haver anúncio ou feriado no mesmo dia.", fatoId: fato.id }, tom: "bom", peso: 2 });
    } else {
      const numeros = [{ chave: "conversas_variacao", exibicao: `−${-dif}% de conversas`, valor: dif }, antigo];
      const frase = "Dias com post tiveram menos conversas que o mesmo dia sem post.";
      const fato: Fato = { id: "efeito-post", tom: "atencao", peso: 2, frase, comparacao: { frase, barras }, numeros, n: ef.diasCom };
      fatos.push(fato);
      passos.push({ passo: { verbo: "revisar", texto: "os posts para incluir uma chamada direta para o WhatsApp", quem: "social_media", motivo: "O conteúdo não acompanhou o volume de conversas no período.", fatoId: fato.id }, tom: "atencao", peso: 2 });
    }
  } else {
    fatos.push({
      id: "efeito-sem-par",
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: "Faltam dias para comparar dias com e sem post.",
      // Duas barras: quantos dias há de cada lado contra o mínimo; o que faltou é listrado.
      comparacao: {
        frase: "Faltam dias para comparar dias com e sem post.",
        barras: [
          { rotulo: "Dias com post", exibicao: `${ef.diasCom} de ${MIN_DIAS}`, fracao: Math.min(1, ef.diasCom / MIN_DIAS), ...(ef.diasCom < MIN_DIAS ? { faltou: true } : {}) },
          { rotulo: "Dias sem post", exibicao: `${ef.diasSem} de ${MIN_DIAS}`, fracao: Math.min(1, ef.diasSem / MIN_DIAS), ...(ef.diasSem < MIN_DIAS ? { faltou: true } : {}) },
        ],
      },
      numeros: [{ chave: "dias_com_par", exibicao: `${ef.diasCom} com post e ${ef.diasSem} sem post` }],
    });
  }

  const temas = juntarTemas(d.temas);

  // 2. Assunto em que mais gente que chamou agendou (amostra mínima de pessoas).
  const comAmostra = temas.filter((t) => quem(t) >= MIN_CONVERSAS_TEMA).sort((a, b) => quemAgendou(b) / quem(b) - quemAgendou(a) / quem(a) || quem(b) - quem(a));
  if (comAmostra.length) {
    const t = comAmostra[0];
    const fato: Fato = {
      id: "tema-que-agenda",
      tom: "bom",
      peso: 2,
      frase: `"${t.tema}" é o assunto em que mais gente que chamou acabou agendando.`,
      numeros: [{ chave: "agendaram", exibicao: `${Math.round((quemAgendou(t) / quem(t)) * 100)}% (${quemAgendou(t)} de ${quem(t)} pessoas)`, valor: quemAgendou(t) }],
      n: quem(t),
    };
    fatos.push(fato);
    if (t.posts < 2) {
      passos.push({ passo: { verbo: "publicar", texto: `mais posts sobre ${t.tema}`, quem: "social_media", motivo: "É o assunto em que mais gente agenda e quase não aparece no feed.", fatoId: fato.id }, tom: "bom", peso: 2 });
    }
  }

  // 3. Procura sem conteúdo: pauta pronta.
  const semPost = temasSemPost(temas, 2);
  if (semPost.length) {
    const t = semPost[0];
    const fato: Fato = {
      id: "demanda-sem-post",
      tom: "atencao",
      peso: 2,
      frase: "Pessoas chamaram sobre assuntos que não tiveram post, nem de assunto parecido, no período.",
      numeros: [{ chave: "pessoas", exibicao: `${semPost.slice(0, 3).map((x) => `${x.tema} (${quem(x)})`).join(", ")}` }],
      n: quem(t),
    };
    fatos.push(fato);
    passos.push({ passo: { verbo: "publicar", texto: `um post sobre ${t.tema}`, quem: "social_media", motivo: "Quem chamou já mostrou que quer saber desse assunto.", fatoId: fato.id }, tom: "atencao", peso: 2 });
  }

  // 4. Horário: quando o paciente chama contra quando o post sai.
  const totalPosts = d.grade.reduce((s, g) => s + g.posts, 0);
  const totalConv = d.grade.reduce((s, g) => s + g.conversas, 0);
  if (totalConv >= 20 && totalPosts >= 5) {
    const ordem = [...d.grade].filter((g) => g.conversas > 0).sort((a, b) => b.conversas - a.conversas);
    const topo: typeof ordem = [];
    for (let soma = 0, i = 0; i < ordem.length && soma < totalConv / 2; i++) {
      topo.push(ordem[i]);
      soma += ordem[i].conversas;
    }
    const chaves = new Set(topo.map((g) => `${g.dow}-${g.hora}`));
    const postsNoTopo = d.grade.filter((g) => chaves.has(`${g.dow}-${g.hora}`)).reduce((s, g) => s + g.posts, 0);
    const p = topo[0];
    const parte = postsNoTopo / totalPosts;
    const fato: Fato = {
      id: "pico-de-conversas",
      tom: parte >= 0.25 ? "bom" : "atencao",
      peso: 1,
      frase: `O pico de conversas é ${DIA_SEMANA[p.dow]}, perto das ${p.hora}h.`,
      numeros: [{ chave: "posts_no_pico", exibicao: `${pct0(parte)} dos posts saíram nas faixas de mais conversa` }],
      n: totalConv,
    };
    fatos.push(fato);
    if (parte < 0.25) {
      passos.push({ passo: { verbo: "publicar", texto: `perto das ${p.hora}h de ${DIA_SEMANA[p.dow]}, o pico de conversas`, quem: "social_media", motivo: "Poucos posts saem perto dos horários em que mais gente chama.", fatoId: fato.id }, tom: "atencao", peso: 1 });
    }
  }

  // 5. Comentários que pedem horário ou contato, no próprio post (ligação direta, sem atribuição de contato).
  const pr = e.profundos;
  if (pr && pr.comentarios.compra >= MIN_COMENTARIOS_COMPRA && pr.comentarios.total > 0) {
    fatos.push({
      id: "comentarios-de-compra",
      tom: "bom",
      peso: 1,
      frase: "Há comentários que pedem horário, contato ou o material da legenda, no próprio post.",
      numeros: [{ chave: "comentarios", exibicao: `${f(pr.comentarios.compra)} de ${f(pr.comentarios.total)} comentários` }],
      n: pr.comentarios.total,
    });
  }

  // 6. Tempo de resposta contra agendamento, em horário comercial: correlação, não prova.
  if (pr) {
    const faixa = new Map(pr.resposta.map((r) => [r.faixa, r]));
    const rapida = faixa.get("1_ate_15min");
    const lentas = [faixa.get("3_1_a_4h"), faixa.get("4_mais_de_4h")].filter(Boolean) as DadosProfundos["resposta"];
    const lentaN = lentas.reduce((s, r) => s + r.conversas, 0);
    const lentaA = lentas.reduce((s, r) => s + r.agendaram, 0);
    if (rapida && rapida.conversas >= MIN_CONVERSAS_FAIXA && lentaN >= MIN_CONVERSAS_FAIXA) {
      const tr = Math.round((rapida.agendaram / rapida.conversas) * 100);
      const tl = Math.round((lentaA / lentaN) * 100);
      if (tr > tl) {
        const fato: Fato = {
          id: "resposta-rapida",
          tom: "atencao",
          peso: 2,
          frase: "Quem foi respondido em até 15 min agendou mais; não é prova ainda.",
          // Duas barras (a regra calcula): quem foi respondido em até 15 min contra quem esperou mais de 1 hora.
          comparacao: {
            frase: "Quem foi respondido em até 15 min agendou mais; não é prova ainda.",
            barras: [
              { rotulo: "Até 15 min", exibicao: `${tr}%`, fracao: Math.max(tr, tl) > 0 ? tr / Math.max(tr, tl) : 0 },
              { rotulo: "Mais de 1 h", exibicao: `${tl}%`, fracao: Math.max(tr, tl) > 0 ? tl / Math.max(tr, tl) : 0 },
            ],
          },
          numeros: [{ chave: "agendaram", exibicao: `${tr}% contra ${tl}% agendaram` }],
          n: rapida.conversas + lentaN,
        };
        fatos.push(fato);
        passos.push({ passo: { verbo: "corrigir", texto: "o atendimento para responder em até 15 minutos no horário comercial", quem: "atendimento", motivo: "Quem esperou mais de 1 hora agendou menos no período.", fatoId: fato.id }, tom: "atencao", peso: 2 });
      }
    }
  }

  // A leitura das conversas pela IA ainda incompleta: os números por assunto valem só para o que já foi lido.
  const lidasPct = c.conversas > 0 ? Math.round((Math.min(c.conversas, c.lidas + c.sem_texto) / c.conversas) * 100) : 0;
  if (c.conversas > 0 && lidasPct < 90) {
    fatos.push({
      id: "leitura-incompleta",
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: "As conversas ainda não foram todas lidas, então os números por assunto estão incompletos.",
      numeros: [{ chave: "lidas", exibicao: `${lidasPct}% das conversas lidas` }],
      n: c.conversas,
    });
  }

  // Origem por post: a guarda decide. Hoje nenhuma fonte mede, então fica como "Sem leitura: origem por post não medida"
  // no fim de "Ver mais", com quem resolve. Nunca vira "trouxe X% dos contatos".
  const guarda = guardaOrigemPorPost(e.origemPorPost);
  const extraFinal: PassoFato[] = guarda.liberado ? [] : [guarda.passo];

  return montar({ tela: "conteudo-comercial", de: e.de, ate: e.ate, fim, portao, fatos, passos, extraFinal });
}
