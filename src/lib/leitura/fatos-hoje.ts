// Ações da tela "O que fazer hoje" (Phase 3.1.1, plano 05). Módulo puro, no mesmo molde de resumo-clinica.ts: recebe os
// fatos que as leituras já calculam e devolve de 0 a 5 ações da semana por regra fixa. Sem banco, sem consulta, sem React
// e sem IA (D-05): tudo sai de modelos de frase passados pelo mesmo filtro de linguagem de sempre (montarTexto).
//
// É a primeira versão da tela Hoje da Phase 9 (D-06): a mesma rota. Os 4 números da Phase 9 (Agendaram, Fecharam, Chamaram e
// Foram) NÃO aparecem aqui: o rótulo final deles (decisão aberta 1 do João) e a frase-resumo (decisão 9) ainda são dele.
// Por isso os fatos que contam essas etapas ficam fora (EXCLUIDOS_DA_HOJE e CHAVES_EXCLUIDAS_DA_HOJE), e a frase e o número
// de destaque de cada ação passam por duas guardas de texto.
//
// Fontes (W3, decisão registrada): só fatos de consultas que Resultados da clínica já faz pelas mesmas chaves de cache.
// A Hoje nunca pede dado novo: a entrada não fica mais pesada que Resultados.
import type { Area, Insight, Limitacao, Responsavel } from "@/lib/insight";
import { REGISTRO_DE_TELAS } from "@/lib/registro-de-telas";
import { deInsight } from "./adaptadores";
import { resumirClinica } from "./resumo-clinica";
import { checarTextoDaLeitura, frasePasso, montarTexto } from "./texto";
import type { Fato, FatosDaTela, Numeral, PassoFato, PassoTexto, TelaId, TomFato, VerboPasso } from "./tipos";

/** Muda quando uma regra da Hoje muda. */
export const VERSAO_REGRAS_HOJE = 1;

/** Quantas ações a Hoje mostra, no máximo (D-01: de 3 a 5). */
const MAXIMO_DE_ACOES = 5;

const C = "/_authenticated/$clientId";

/** Aba padrão de cada área de Resultados, para a ação que não traz destino próprio (ou cujo destino saiu do registro). */
export const ROTA_DA_AREA: Record<Area, string> = {
  resumo: `${C}/`,
  conteudo: `${C}/conteudo`,
  anuncios: `${C}/anuncios`,
  comercial: `${C}/pacientes`,
  ideias: `${C}/ideias`,
};

// ---------- o que a Hoje nunca mostra (decisões abertas 1 e 9 do João, D-06) ----------

/**
 * Ids de fato (e de insight) que nunca viram ação. Cada linha diz de onde vem o id.
 * Os prefixos "mudou-" e "sem-medida-" estão em PREFIXOS_EXCLUIDOS_DA_HOJE.
 */
export const EXCLUIDOS_DA_HOJE: readonly string[] = [
  "leads", // src/lib/resultado.ts:359 e :369 (Novos contatos no CRM = contagem de quem chamou)
  "entraram", // src/lib/comercial.ts:403 (etapa do funil comercial: quem entrou)
  "atendidos", // src/lib/comercial.ts:411 (etapa do funil comercial: quem foi atendido)
  "agendaram", // src/lib/comercial.ts:420 (etapa do funil comercial: quem agendou)
  "compraram", // src/lib/comercial.ts:429 (etapa do funil comercial: quem comprou)
  "maior-perda", // src/lib/leitura/fatos-pacientes.ts:110 (perda entre as etapas chamou, agendou, foi e fechou)
  // Achados pelo grep em src/lib/cruzamento.ts (insights que entram em Resultado.insights): a evidência é o total de
  // contatos novos do período ("N leads no período", "X leads em 48h").
  "cruz-organico", // src/lib/cruzamento.ts:194 (evidência: "... N leads no período")
  "cruz-anuncio", // src/lib/cruzamento.ts:203 (mesma evidência)
  "cruz-nenhum", // src/lib/cruzamento.ts:212 (mesma evidência)
  "cruz-posts", // src/lib/cruzamento.ts:230 (evidência: "dd/mm: N leads em 48h")
];

/** Prefixos de id que nunca viram ação. */
export const PREFIXOS_EXCLUIDOS_DA_HOJE: readonly string[] = [
  "mudou-", // src/lib/leitura/adaptadores.ts:112 (variação de quem chamou, agendou e fechou)
  "sem-medida-", // src/lib/leitura/fatos-resultados.ts:51 e fatos-pacientes.ts:87 ("sem-medida-{chave}" de etapa do funil)
  // Achados pelo grep em src/lib/comercial.ts (insightsComerciais, ids "comercial:{tipo}:{nome}"): contam quem chamou, agendou,
  // foi e fechou ("N agendaram de M leads", maior perda entre etapas, leads parados). Só as telas comerciais os leem; ficam
  // fora por garantia, caso um dia entrem em Resultado.insights.
  "comercial:", // comercial.ts:678 (performance:agendamento), :726 (maior-perda-*), :753 (parados), :773 (sem-dono), :794, :822, :850, :871, :896 a :922
];

/** Chaves de Numeral (Numeral.chave) que nunca viram o número de uma ação: são as 4 etapas da Phase 9 e as contagens de contato. */
export const CHAVES_EXCLUIDAS_DA_HOJE: readonly string[] = [
  "mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam", "vendas", "leads",
];

/** Guarda de texto: frase, legenda e número de cada ação (os 4 números da Phase 9 dentro de uma frase). */
export const GUARDA_DE_TEXTO_DA_HOJE = /\b(agendaram|fecharam|chamaram|compareceram)\b|foram (a|à|na) consulta/i;

/** Guarda de número: só os números de destaque (número, legenda e número do Próximo). Nada de agendamento, venda ou contato novo. */
export const GUARDA_DE_NUMERO_DA_HOJE = /\b(agendamentos?|vendas?|consultas?|comparecimentos?|contatos novos|novos contatos|leads?)\b/i;

function excluido(f: Fato): boolean {
  if (EXCLUIDOS_DA_HOJE.includes(f.id)) return true;
  if (PREFIXOS_EXCLUIDOS_DA_HOJE.some((p) => f.id.startsWith(p))) return true;
  return f.numeros.some((n) => CHAVES_EXCLUIDAS_DA_HOJE.includes(n.chave));
}

// ---------- tipos ----------

export interface FonteDoDado {
  /** "Instagram", "CRM", "WhatsApp" ou "anúncios". */
  fonte: string;
  tom: TomFato;
  /** Último dia com dado (AAAA-MM-DD), null quando a fonte não diz. */
  ate: string | null;
}

export interface EntradaHoje {
  /** Fatos de Resultados da clínica (a leitura da tela de entrada). Com o portão negado, a Hoje diz o mesmo motivo. */
  fatos: FatosDaTela;
  /** Os mesmos fatos separados pelas áreas do resultado. */
  porArea: Record<Area, Fato[]>;
  /** Insights do resultado: dão o destino (acao.rota) de cada ação e as ações que não entraram na lista de passos. */
  insights: readonly Insight[];
  limitacoes?: readonly Limitacao[];
  /** Fatos de outras telas que Resultados já carrega (Pacientes do período, publicações, Desempenho), nesta ordem. */
  extras?: readonly { tela: TelaId; rota: string; fatos: FatosDaTela }[];
  /** Estado das fontes (client-sync-status): só para dizer o motivo de uma lista curta. */
  fontes?: readonly FonteDoDado[];
}

export interface AcaoDaHoje {
  /** Id do fato de origem. */
  id: string;
  /** "Conferir a conexão do Instagram." (verbo da lista + complemento + ponto). */
  frase: string;
  verbo: VerboPasso;
  quem: Responsavel;
  rotuloQuem: string;
  /** O primeiro número do fato de origem, que sustenta a ação. */
  numero: Numeral;
  /** A frase do fato de origem (o que aconteceu), que fica embaixo do número. */
  legenda: string;
  /** O segundo número do fato, quando existe e passa nas duas guardas (vai na pílula de variação do cartão). */
  outroNumero?: Numeral;
  tom: TomFato;
  /** routeId de uma linha do registro (a aba de onde a ação saiu). */
  rota: string;
  area?: Area;
  tela: TelaId;
}

export type HojeDaClinica =
  | { tipo: "sem_leitura"; motivo: string; passo: PassoTexto }
  | { tipo: "acoes"; proxima: AcaoDaHoje | null; outras: AcaoDaHoje[]; aviso: string | null };

// ---------- destino de cada ação ----------

/** Linha do registro que a pessoa pode abrir hoje: nem tirada, nem rota que só redireciona. */
function rotaViva(rota: string): boolean {
  return REGISTRO_DE_TELAS.some((t) => t.rota === rota && !t.busca && t.situacao !== "tirada" && !t.soRedireciona);
}

/**
 * A rota que as regras gravam em acao.rota ("/$clientId/posts", "posts", "/$clientId/crm-painel") vira routeId do registro.
 * Destino que saiu do registro (agentes, tirada em 11/11/2026) ou que não existe devolve null: quem chama usa a aba da área.
 */
function rotaDoRegistro(bruta: string | undefined): string | null {
  if (!bruta?.trim()) return null;
  const r = bruta.trim();
  // /conversas só redireciona para atendimento.
  if (r === "/$clientId/conversas") return `${C}/atendimento`;
  const sub = r.startsWith("/$clientId/") ? r.slice("/$clientId/".length) : r.replace(/^\/+/, "");
  const id = sub ? `${C}/${sub}` : null;
  return id && rotaViva(id) ? id : null;
}

// ---------- candidatas ----------

interface Candidata {
  fato: Fato;
  passo: PassoFato;
  /** 0 = Resultados; 1 em diante = os extras, na ordem em que vieram. */
  fonte: number;
  ordem: number;
  base: FatosDaTela;
  tela: TelaId;
  rotaPadrao: string;
  area?: Area;
  rotaDoInsight?: string;
}

const ORDEM_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

function areaDoFato(porArea: Record<Area, Fato[]>, id: string, insights: readonly Insight[], limitacoes: readonly Limitacao[]): Area | undefined {
  const achada = (Object.keys(porArea) as Area[]).find((a) => porArea[a].some((f) => f.id === id));
  return achada ?? insights.find((i) => i.id === id)?.area ?? limitacoes.find((l) => l.id === id)?.area;
}

function candidatasDeResultados(e: EntradaHoje): Candidata[] {
  const limitacoes = e.limitacoes ?? [];
  const lista: Candidata[] = [];
  const vistos = new Set<string>();
  const passos = [e.fatos.proximoPasso, ...e.fatos.outrosPassos].filter((p): p is PassoFato => p != null);
  const poe = (fato: Fato, passo: PassoFato) => {
    const chave = `${fato.id}|${frasePasso(passo)}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    const insight = e.insights.find((i) => i.id === fato.id);
    const area = areaDoFato(e.porArea, fato.id, e.insights, limitacoes);
    lista.push({
      fato,
      passo,
      fonte: 0,
      ordem: lista.length,
      base: e.fatos,
      tela: "resultados",
      rotaPadrao: ROTA_DA_AREA[area ?? "resumo"],
      area,
      rotaDoInsight: insight?.acao?.rota,
    });
  };
  for (const passo of passos) {
    // O fato de origem do passo. Sem fato (e sem insight com esse id) não há o que sustentar a ação: ela não entra.
    const fato = (passo.fatoId ? e.fatos.fatos.find((f) => f.id === passo.fatoId) : undefined)
      ?? (() => {
        const i = passo.fatoId ? e.insights.find((x) => x.id === passo.fatoId) : undefined;
        return i ? deInsight(i).fato : undefined;
      })();
    if (fato) poe(fato, passo);
  }
  // Insights com ação própria que a lista de passos não trouxe: mesma tradução (deInsight), mesma regra.
  for (const i of e.insights) {
    const { fato, passo } = deInsight(i);
    if (passo) poe(fato, passo);
  }
  return lista;
}

function candidatasDoExtra(x: NonNullable<EntradaHoje["extras"]>[number], fonte: number): Candidata[] {
  // Fonte com o portão negado não entra: a leitura dela diria "Sem leitura", nunca uma ação.
  if (!x.fatos.portao.ok) return [];
  const passos = [x.fatos.proximoPasso, ...x.fatos.outrosPassos].filter((p): p is PassoFato => p != null);
  const lista: Candidata[] = [];
  for (const passo of passos) {
    const fato = passo.fatoId ? x.fatos.fatos.find((f) => f.id === passo.fatoId) : undefined;
    if (!fato) continue;
    lista.push({ fato, passo, fonte, ordem: lista.length, base: x.fatos, tela: x.tela, rotaPadrao: x.rota });
  }
  return lista;
}

/** A ação pronta, ou null quando a candidata não passa nas exclusões, nas guardas ou no filtro de linguagem. */
function acaoDaCandidata(c: Candidata): AcaoDaHoje | null {
  if (excluido(c.fato)) return null;
  // A mesma regra de linguagem de toda a leitura: fato e passo passam por montarTexto, um único filtro.
  const t = montarTexto({ ...c.base, portao: { ok: true }, fatos: [c.fato], proximoPasso: c.passo, outrosPassos: [] });
  if (t.tipo !== "leitura" || !t.proximoPasso) return null;
  const numero = t.aconteceu.numeros[0];
  if (!numero) return null;
  const frase = t.proximoPasso.frase;
  const legenda = t.aconteceu.frase;
  for (const texto of [frase, legenda, numero.exibicao]) if (GUARDA_DE_TEXTO_DA_HOJE.test(texto)) return null;
  for (const texto of [legenda, numero.exibicao]) if (GUARDA_DE_NUMERO_DA_HOJE.test(texto)) return null;
  const outroNumero = t.aconteceu.numeros.slice(1).find((n) => !GUARDA_DE_TEXTO_DA_HOJE.test(n.exibicao) && !GUARDA_DE_NUMERO_DA_HOJE.test(n.exibicao));
  return {
    id: c.fato.id,
    frase,
    verbo: t.proximoPasso.verbo,
    quem: t.proximoPasso.quem,
    rotuloQuem: t.proximoPasso.rotuloQuem,
    numero,
    ...(outroNumero ? { outroNumero } : {}),
    legenda,
    tom: c.fato.tom,
    rota: rotaDoRegistro(c.rotaDoInsight) ?? c.rotaPadrao,
    area: c.area,
    tela: c.tela,
  };
}

// ---------- a lista ----------

/**
 * Sem leitura quando o portão de Resultados nega (mesmo motivo, passo e responsável do resumo da clínica). Com o portão ok:
 * o Próximo é a "Ação da semana" do resumo da clínica quando ela entra (senão, a primeira da lista); as outras vêm por peso,
 * depois tom (ruim, atenção, bom, neutro), depois a ordem das fontes e a ordem dentro de cada uma. No máximo 5. Ação sem
 * número ao lado, repetida (mesma frase ou mesmo fato) ou excluída não entra, e a regra nunca inventa uma para completar 3.
 */
export function acoesDaHoje(e: EntradaHoje): HojeDaClinica {
  if (!e.fatos.portao.ok) {
    const t = montarTexto(e.fatos);
    if (t.tipo === "sem_leitura") return { tipo: "sem_leitura", motivo: t.motivo, passo: t.passo };
  }

  const candidatas = [...candidatasDeResultados(e), ...(e.extras ?? []).flatMap((x, k) => candidatasDoExtra(x, k + 1))];
  const ordenadas = candidatas
    .map((c) => ({ c, acao: acaoDaCandidata(c) }))
    .filter((x): x is { c: Candidata; acao: AcaoDaHoje } => x.acao != null)
    .sort((a, b) => b.c.fato.peso - a.c.fato.peso || ORDEM_TOM[a.c.fato.tom] - ORDEM_TOM[b.c.fato.tom] || a.c.fonte - b.c.fonte || a.c.ordem - b.c.ordem);

  // O Próximo: a "Ação da semana" de Resultados da clínica, quando ela está entre as válidas. Ela vem primeiro mesmo que outra
  // fonte traga o mesmo fato com peso maior (o Próximo da Hoje tem de ser a mesma frase do resumo de Resultados).
  const passosDeResultados = [e.fatos.proximoPasso, ...e.fatos.outrosPassos].filter((p): p is PassoFato => p != null);
  const resumo = resumirClinica({ fatos: e.fatos, porArea: e.porArea, passos: passosDeResultados });
  const fraseDaSemana = resumo.tipo === "resumo" ? resumo.acao?.frase : undefined;
  const daSemana = fraseDaSemana ? ordenadas.find(({ c, acao }) => c.fonte === 0 && acao.frase === fraseDaSemana) : undefined;
  const emOrdem = daSemana ? [daSemana, ...ordenadas.filter((x) => x !== daSemana)] : ordenadas;

  // Mesma frase ou mesmo fato viram uma só (fica a melhor colocada).
  const frases = new Set<string>();
  const ids = new Set<string>();
  const unicas = emOrdem.filter(({ acao }) => {
    if (frases.has(acao.frase) || ids.has(acao.id)) return false;
    frases.add(acao.frase);
    ids.add(acao.id);
    return true;
  });

  const escolhidas = unicas.slice(0, MAXIMO_DE_ACOES);
  const [proxima, ...outras] = escolhidas.map((x) => x.acao);

  const aviso = avisoDePoucasAcoes(escolhidas.length, {
    fontes: e.fontes,
    houveExcluidas: candidatas.some((c) => excluido(c.fato)),
  });
  return { tipo: "acoes", proxima: proxima ?? null, outras, aviso };
}

// ---------- aviso de poucas ações ----------

const PIOR_TOM: Partial<Record<TomFato, number>> = { atencao: 1, ruim: 2 };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Palavra com artigo, do jeito que a frase pede ("o Instagram", "o CRM", "o WhatsApp", "os anúncios"). */
function comArtigo(fonte: string): string {
  return /^an[uú]ncios$/i.test(fonte) ? "os anúncios" : `o ${fonte}`;
}

/**
 * null com 3 ou mais ações. Com 0 a 2: "Poucas ações nesta semana: {motivo}". O motivo, nesta ordem: (1) a pior fonte que não
 * está em dia ("o Instagram está sem dado novo desde dd/mm"); (2) houve candidata tirada pelas exclusões; (3) o que as leituras
 * deste período pediram. Passa no filtro de linguagem; se não passar, a frase genérica do item 3.
 */
export function avisoDePoucasAcoes(n: number, contexto: { fontes?: readonly FonteDoDado[]; houveExcluidas?: boolean } = {}): string | null {
  if (n >= 3) return null;
  const atrasadas = (contexto.fontes ?? []).filter((f) => (PIOR_TOM[f.tom] ?? 0) > 0);
  const pior = atrasadas.reduce<FonteDoDado | null>((a, f) => (a == null || (PIOR_TOM[f.tom] ?? 0) > (PIOR_TOM[a.tom] ?? 0) ? f : a), null);
  const motivos = [
    pior ? `${comArtigo(pior.fonte)} está sem dado novo${pior.ate ? ` desde ${ddmm(pior.ate)}` : ""}` : null,
    contexto.houveExcluidas ? "as outras ações dependem de números que ainda não têm selo" : null,
    n === 0 ? "as leituras deste período não pediram nenhuma ação" : `as leituras deste período pediram só ${n} ${n === 1 ? "ação" : "ações"}`,
  ].filter((m): m is string => m != null);
  const frases = motivos.map((m) => `Poucas ações nesta semana: ${m}.`);
  return frases.find((f) => checarTextoDaLeitura(f).length === 0) ?? frases[frases.length - 1];
}

// ---------- saudação ----------

/** 5 a 11 "Bom dia", 12 a 17 "Boa tarde", de 18 às 4 "Boa noite". */
export function saudacaoDaHora(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  return hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
}

/** Até as 2 primeiras palavras do nome cadastrado ("Dra. Lana Ribeiro" vira "Dra. Lana"); sem nome, null. */
export function nomeDaSaudacao(nome: string | null | undefined): string | null {
  const palavras = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  return palavras.length ? palavras.slice(0, 2).join(" ") : null;
}

/** Hora cheia (0 a 23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora);
  return Number(h);
}
