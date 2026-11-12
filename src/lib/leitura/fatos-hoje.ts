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
import type { BarraDoFato, Fato, FatosDaTela, Numeral, PassoFato, PassoTexto, TelaId, TomFato, VerboPasso } from "./tipos";

/** Muda quando uma regra da Hoje muda. */
export const VERSAO_REGRAS_HOJE = 3;

/** Quantas ações a Hoje mostra, no máximo (D-01: de 3 a 5). */
const MAXIMO_DE_ACOES = 5;

/** Quantas ações da equipe a linha "Para a equipe" mostra, no máximo. */
const MAXIMO_PARA_EQUIPE = 3;

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

/** Quantos caracteres a manchete do Próximo e dos cartões pode ter (D-07: frase curta que o médico lê de relance). */
export const MAX_CARACTERES_DA_MANCHETE = 40;

/** Quantos caracteres a legenda (a frase embaixo da manchete) pode ter: uma frase só. O que passa vai para o "Ver números". */
export const MAX_CARACTERES_DA_LEGENDA = 90;

/** Quantos caracteres tem o número de contexto do subtítulo do cartão ("10 posts"). */
const MAX_CARACTERES_DO_CONTEXTO = 24;

/** Quantas ações de uma mesma área cabem na Hoje, contando o Próximo (as vagas que sobram vão para a próxima área). */
export const MAXIMO_POR_AREA = 2;

/**
 * Jargão que o médico leigo não lê: mediana (mediano, medianos, medianas), siglas de tráfego (CTR, CPC, CPM, CPL, ROAS), "salvamento"
 * seguido de porcentagem ("salvamento 0,5%"), "taxa de salvamento" e o sinal de divisão "÷" (conta de dentro do app). O número
 * técnico inteiro vai para o "Ver números" fechado.
 */
export const JARGAO_DA_HOJE = /(?<!\p{L})(median[oa]s?|CTR|CPC|CPM|CPL|ROAS)(?!\p{L})|(?<!\p{L})salvamentos?\s+\d[\d.,]*\s*%|taxa de salvamento|÷/iu;

/**
 * Problemas de um texto que vai para a Hoje (vazio = pode ir): os do filtro de linguagem de toda a leitura (checarTextoDaLeitura),
 * o jargão da Hoje, as 2 guardas da Phase 9 e, quando `max` vem, o tamanho. A regra nunca encurta um texto no meio de uma palavra:
 * o que reprova é descartado.
 */
export function checarTextoDaHoje(texto: string, max?: number): string[] {
  const t = texto.replace(/\s+/g, " ").trim();
  const problemas = [...checarTextoDaLeitura(t)];
  const jargao = JARGAO_DA_HOJE.exec(t);
  if (jargao) problemas.push(`jargão da Hoje: "${jargao[0]}"`);
  if (GUARDA_DE_TEXTO_DA_HOJE.test(t)) problemas.push("texto dos 4 números da Phase 9");
  if (GUARDA_DE_NUMERO_DA_HOJE.test(t)) problemas.push("número de agendamento, venda, consulta ou contato");
  if (max != null && t.length > max) problemas.push(`mais de ${max} caracteres`);
  return problemas;
}

/** true quando o texto é uma frase só (nenhum ponto, exclamação ou interrogação no meio). */
const umaFrase = (t: string) => t.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean).length === 1;

/** Legenda possível: passa no filtro da Hoje com o máximo de 90 caracteres e é uma frase só. */
const legendaValida = (t: string) => checarTextoDaHoje(t, MAX_CARACTERES_DA_LEGENDA).length === 0 && umaFrase(t);

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

/** As 4 áreas da Hoje; no máximo MAXIMO_POR_AREA ações de cada. */
export type AreaDaHoje = "instagram" | "anuncios" | "comercial" | "resultados";

/**
 * Ids de fato que dizem o mesmo achado e por isso formam uma família só (a Hoje mostra uma ação por família). O id que não está
 * aqui é a própria família. Cada linha diz de onde vem o id.
 */
export const FAMILIA_DO_FATO: Readonly<Record<string, string>> = {
  formato: "formato", // src/lib/leitura-periodo.ts:203 (regra de formatos: id "formato", vira insight de Resultados)
  "formato-melhor-taxa": "formato", // src/lib/leitura/fatos-instagram.ts:346 (publicações: formato com mais salvamentos por pessoa)
  "formato-sem-comparacao": "formato", // src/lib/leitura/fatos-instagram.ts:361 (publicações: só um formato com amostra)
};

export interface AcaoDaHoje {
  /** Id do fato de origem. */
  id: string;
  /** "Conferir a conexão do Instagram." (verbo da lista + complemento + ponto). */
  frase: string;
  verbo: VerboPasso;
  quem: Responsavel;
  rotuloQuem: string;
  /** O primeiro número do fato de origem, que sustenta a ação (a origem do destaque; pode ser técnico e ficar no "Ver números"). */
  numero: Numeral;
  /** A manchete: até 40 caracteres, leiga. Um número do fato, a manchete que a regra escreveu ou a primeira oração da frase do fato. */
  destaque: string;
  /** true quando o destaque é um número do fato (o desenho o mostra grande); false quando é texto. */
  destaqueEhNumero: boolean;
  /** A legenda embaixo da manchete: uma frase de até 90 caracteres (a da comparação ou a do fato). null quando o destaque já é a frase inteira ou a frase passou do limite. */
  legenda: string | null;
  /** Barras de comparação (a regra calcula a proporção; a tela só desenha). Só quando o fato traz comparação que passa nas guardas. */
  barras?: readonly BarraDoFato[];
  /** Subtítulo do cartão: "30 dias" ou "30 dias · 10 posts" (D-07: o número de contexto). */
  contexto: string;
  /** Outro número leigo do fato (até 40 caracteres), que vai na pílula de variação do cartão. */
  outroNumero?: Numeral;
  /** Texto inteiro dos números que não couberam na manchete por serem longos ou técnicos: vão num "Ver números" fechado. */
  numerosTecnicos: string[];
  /** A área da Hoje da ação (Instagram, Anúncios, Comercial ou Resultados), pela aba para onde ela aponta. */
  areaHoje: AreaDaHoje;
  /** O achado de origem, para o Próximo e os cartões nunca repetirem a mesma coisa (FAMILIA_DO_FATO). */
  familia: string;
  tom: TomFato;
  /** routeId de uma linha do registro (a aba de onde a ação saiu). */
  rota: string;
  area?: Area;
  tela: TelaId;
  /** Arrumação interna da equipe (PassoFato.soEquipe): nunca vai para o médico; só para a linha "Para a equipe". */
  soEquipe: boolean;
}

export type HojeDaClinica =
  | { tipo: "sem_leitura"; motivo: string; passo: PassoTexto }
  | { tipo: "acoes"; proxima: AcaoDaHoje | null; outras: AcaoDaHoje[]; paraEquipe: AcaoDaHoje[]; aviso: string | null };

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

const AREA_PELA_ABA: Record<string, AreaDaHoje> = {
  conteudo: "instagram", top: "instagram", posts: "instagram", audiencia: "instagram", ideias: "instagram", "conteudo-comercial": "instagram",
  anuncios: "anuncios", campanhas: "anuncios", links: "anuncios",
  pacientes: "comercial", consultas: "comercial", vendas: "comercial", "crm-painel": "comercial", jornada: "comercial",
  "vendas-kommo": "comercial", atendimento: "comercial", "central-atendimento": "comercial", "crm-contatos": "comercial",
};
const AREA_PELA_AREA: Record<Area, AreaDaHoje> = { conteudo: "instagram", ideias: "instagram", anuncios: "anuncios", comercial: "comercial", resumo: "resultados" };

/** A área da Hoje pela aba final da ação (subcaminho da rota). Aba fora do mapa: vale a Area do fato; sem ela, Resultados. */
function areaDaHoje(rota: string, area: Area | undefined): AreaDaHoje {
  const sub = rota.startsWith(`${C}/`) ? rota.slice(C.length + 1).replace(/\/+$/, "") : rota === C ? "" : rota;
  if (sub === "") return "resultados";
  return AREA_PELA_ABA[sub] ?? (area ? AREA_PELA_AREA[area] : "resultados");
}

const diasDoPeriodo = (de: string, ate: string) => Math.max(1, Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000) + 1);

/** Onde um número longo se parte em trechos inteiros: "640 atendimentos; espera mediana até a 1ª resposta 47 min". */
const TRECHOS_DO_NUMERO = /;\s| · |,\s/;

/** "Estático leva longe, Carrossel faz guardar." vira "Estático leva longe" (trecho antes do primeiro separador); sem separador, a frase inteira. */
function primeiraOracao(frase: string): { oracao: string; inteira: boolean } {
  const t = frase.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const corte = /, |: | · | — |; /.exec(t);
  return corte ? { oracao: t.slice(0, corte.index).trim(), inteira: false } : { oracao: t, inteira: true };
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
  const fraseDoFato = t.aconteceu.frase;
  // Guardas da Phase 9 (como no plano 05) e jargão da Hoje: a frase da ação pode falar de consulta, mas nunca dos 4 números.
  for (const texto of [frase, fraseDoFato, numero.exibicao]) if (GUARDA_DE_TEXTO_DA_HOJE.test(texto)) return null;
  for (const texto of [fraseDoFato, numero.exibicao]) if (GUARDA_DE_NUMERO_DA_HOJE.test(texto)) return null;
  for (const texto of [frase, fraseDoFato]) if (JARGAO_DA_HOJE.test(texto)) return null;

  // Números do fato que passam nas 2 guardas da Phase 9 (os outros nunca aparecem).
  const liberados = t.aconteceu.numeros.filter((n) => !GUARDA_DE_TEXTO_DA_HOJE.test(n.exibicao) && !GUARDA_DE_NUMERO_DA_HOJE.test(n.exibicao));
  const leigo = (n: Numeral, max: number) => checarTextoDaHoje(n.exibicao, max).length === 0;

  // A manchete, nesta ordem: (a) um número curto e leigo; (b) a manchete escrita pela regra; (c) a primeira oração da frase do fato.
  let destaque: string | null = null;
  let destaqueEhNumero = false;
  let legenda: string | null = fraseDoFato;
  let fraseDoFatoFicouDeFora = false;
  let numeroDoDestaque: Numeral | undefined;
  const numeroCurto = liberados.find((n) => leigo(n, MAX_CARACTERES_DA_MANCHETE));
  if (numeroCurto) {
    destaque = numeroCurto.exibicao.trim();
    destaqueEhNumero = true;
    numeroDoDestaque = numeroCurto;
  } else if (c.fato.manchete && checarTextoDaHoje(c.fato.manchete, MAX_CARACTERES_DA_MANCHETE).length === 0) {
    destaque = c.fato.manchete.trim();
    // Manchete que começa por algarismo ou R$ ("R$ 20,00 por conversa") é um número: o desenho a mostra grande.
    destaqueEhNumero = /^(R\$\s?)?\d/.test(destaque);
  } else {
    const { oracao, inteira } = primeiraOracao(fraseDoFato);
    if (oracao && checarTextoDaHoje(oracao, MAX_CARACTERES_DA_MANCHETE).length === 0) {
      destaque = oracao;
      if (inteira) legenda = null;
    } else {
      // (a2) Último recurso, para a Ação da semana de Resultados não ficar de fora da Hoje: um trecho inteiro do número (entre
      // "; ", " · " ou ", ") que começa por algarismo ou R$, curto e leigo ("640 atendimentos; espera mediana …" dá "640 atendimentos").
      // O número técnico inteiro continua em numerosTecnicos. Nunca corta no meio de uma palavra.
      for (const n of liberados) {
        const trecho = n.exibicao.split(TRECHOS_DO_NUMERO).map((x) => x.trim()).find((x) => /^(R\$\s?)?\d/.test(x) && checarTextoDaHoje(x, MAX_CARACTERES_DA_MANCHETE).length === 0);
        if (trecho) {
          destaque = trecho;
          destaqueEhNumero = true;
          numeroDoDestaque = n;
          break;
        }
      }
    }
  }
  // Nenhuma passou: a candidata não vira ação (a regra nunca encurta no meio de uma palavra).
  if (destaque == null) return null;

  // A legenda, nesta ordem: (i) a frase da comparação do fato, com as barras (frase e cada rótulo e exibição passam nas guardas);
  // (ii) a frase do fato quando é uma só e tem até 90 caracteres; (iii) nenhuma, e a frase inteira vai para o "Ver números".
  const comp = c.fato.comparacao;
  let barras: readonly BarraDoFato[] | undefined;
  if (comp && comp.barras.length > 0 && legendaValida(comp.frase) && comp.barras.every((b) => checarTextoDaHoje(b.rotulo).length === 0 && checarTextoDaHoje(b.exibicao).length === 0)) {
    legenda = comp.frase.trim();
    barras = comp.barras;
  } else if (legenda != null && !legendaValida(legenda)) {
    legenda = null;
    fraseDoFatoFicouDeFora = true;
  }

  // Contexto do subtítulo: "30 dias" e, quando sobra um número leigo e curto, "30 dias · 10 posts".
  const dias = diasDoPeriodo(c.base.periodo.de, c.base.periodo.ate);
  const doContexto = liberados.find((n) => n !== numeroDoDestaque && leigo(n, MAX_CARACTERES_DO_CONTEXTO));
  const contexto = `${dias} ${dias === 1 ? "dia" : "dias"}${doContexto ? ` · ${doContexto.exibicao.trim()}` : ""}`;
  const outroNumero = liberados.find((n) => n !== numeroDoDestaque && n !== doContexto && leigo(n, MAX_CARACTERES_DA_MANCHETE));
  const numerosTecnicos = [
    ...(fraseDoFatoFicouDeFora ? [fraseDoFato.trim()] : []),
    ...liberados.filter((n) => !leigo(n, MAX_CARACTERES_DA_MANCHETE)).map((n) => n.exibicao.trim()),
  ];

  const rota = rotaDoRegistro(c.rotaDoInsight) ?? c.rotaPadrao;
  return {
    id: c.fato.id,
    frase,
    verbo: t.proximoPasso.verbo,
    quem: t.proximoPasso.quem,
    rotuloQuem: t.proximoPasso.rotuloQuem,
    numero,
    destaque,
    destaqueEhNumero,
    legenda,
    ...(barras ? { barras } : {}),
    contexto,
    ...(outroNumero ? { outroNumero } : {}),
    numerosTecnicos,
    areaHoje: areaDaHoje(rota, c.area),
    familia: FAMILIA_DO_FATO[c.fato.id] ?? c.fato.id,
    tom: c.fato.tom,
    rota,
    area: c.area,
    tela: c.tela,
    soEquipe: c.passo.soEquipe === true,
  };
}

// ---------- a lista ----------

/**
 * Sem leitura quando o portão de Resultados nega (mesmo motivo, passo e responsável do resumo da clínica). Com o portão ok:
 * o Próximo é a "Ação da semana" do resumo da clínica quando ela entra (senão, a primeira da lista); as outras vêm por peso,
 * depois tom (ruim, atenção, bom, neutro), depois a ordem das fontes e a ordem dentro de cada uma. Ação sem manchete leiga,
 * sem número ao lado, repetida (mesma frase, mesmo fato ou mesma família de achado) ou excluída não entra, e a regra nunca
 * inventa uma para completar 3. No máximo MAXIMO_POR_AREA por área (o Próximo conta) e 5 no total: o que sobra de vaga vai para
 * a próxima área por peso. Ação soEquipe nunca entra na lista do médico: vai para paraEquipe (até 3).
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

  // As ações da equipe (arrumação interna do dado) saem da lista do médico: a Ação da semana e o Próximo só vêm das do médico.
  const doMedico = emOrdem.filter(({ acao }) => !acao.soEquipe);
  const daEquipe = emOrdem.filter(({ acao }) => acao.soEquipe);

  // Mesma frase, mesmo fato ou mesma família (o mesmo achado dito de outro jeito) viram uma só em cada lista: fica a melhor colocada.
  const semRepeticao = (lista: typeof emOrdem) => {
    const frases = new Set<string>();
    const ids = new Set<string>();
    const familias = new Set<string>();
    return lista.filter(({ acao }) => {
      if (frases.has(acao.frase) || ids.has(acao.id) || familias.has(acao.familia)) return false;
      frases.add(acao.frase);
      ids.add(acao.id);
      familias.add(acao.familia);
      return true;
    });
  };

  // Na mesma ordem, cada ação entra se a área dela ainda tem menos de MAXIMO_POR_AREA (o Próximo conta para a área dele), até 5:
  // as vagas que sobram vão para a próxima área por peso. A lista da equipe não passa por este limite.
  const porArea = new Map<AreaDaHoje, number>();
  const escolhidas = semRepeticao(doMedico).filter(({ acao }) => {
    if ((porArea.get(acao.areaHoje) ?? 0) >= MAXIMO_POR_AREA) return false;
    porArea.set(acao.areaHoje, (porArea.get(acao.areaHoje) ?? 0) + 1);
    return true;
  }).slice(0, MAXIMO_DE_ACOES);
  const [proxima, ...outras] = escolhidas.map((x) => x.acao);
  const paraEquipe = semRepeticao(daEquipe).slice(0, MAXIMO_PARA_EQUIPE).map((x) => x.acao);

  // houveExcluidas vem só de excluido(): passo da equipe não liga o motivo "dependem de números que ainda não têm selo".
  const aviso = avisoDePoucasAcoes(escolhidas.length, {
    fontes: e.fontes,
    houveExcluidas: candidatas.some((c) => excluido(c.fato)),
  });
  return { tipo: "acoes", proxima: proxima ?? null, outras, paraEquipe, aviso };
}

// ---------- aviso de poucas ações ----------

const PIOR_TOM: Partial<Record<TomFato, number>> = { atencao: 1, ruim: 2 };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Palavra com artigo, do jeito que a frase pede ("o Instagram", "o CRM", "o WhatsApp", "os anúncios"). */
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function comArtigo(fonte: string): string {
  return /^an[uú]ncios$/i.test(fonte) ? "os anúncios" : `o ${fonte}`;
}

/**
 * null com 3 ou mais ações. Com 0 a 2, só o motivo (o total "N ações esta semana" do topo já diz quantas são), com inicial
 * maiúscula e ponto. O motivo, nesta ordem: (1) a pior fonte que não está em dia ("O Instagram está sem dado novo desde dd/mm.");
 * (2) houve candidata tirada pelas exclusões ("As outras ações dependem de números que ainda não têm selo."); (3) os números do
 * período não pediram mais ações. Passa no filtro de linguagem; se não passar, a frase genérica do item 3. Nunca diz "não tem
 * dado" quando o dado existe e a regra só não pediu ação.
 */
export function avisoDePoucasAcoes(n: number, contexto: { fontes?: readonly FonteDoDado[]; houveExcluidas?: boolean } = {}): string | null {
  if (n >= 3) return null;
  const atrasadas = (contexto.fontes ?? []).filter((f) => (PIOR_TOM[f.tom] ?? 0) > 0);
  const pior = atrasadas.reduce<FonteDoDado | null>((a, f) => (a == null || (PIOR_TOM[f.tom] ?? 0) > (PIOR_TOM[a.tom] ?? 0) ? f : a), null);
  const motivos = [
    pior ? `${cap(comArtigo(pior.fonte))} ${/^an[uú]ncios$/i.test(pior.fonte) ? "estão" : "está"} sem dado novo${pior.ate ? ` desde ${ddmm(pior.ate)}` : ""}` : null,
    contexto.houveExcluidas ? "As outras ações dependem de números que ainda não têm selo" : null,
    n === 0 ? "Os números deste período não pediram nenhuma ação" : "Os números deste período não pediram mais ações",
  ].filter((m): m is string => m != null);
  const frases = motivos.map((m) => `${m}.`);
  return frases.find((f) => checarTextoDaLeitura(f).length === 0) ?? frases[frases.length - 1];
}

// ---------- saudação ----------

/** 5 a 11 "Bom dia", 12 a 17 "Boa tarde", de 18 às 4 "Boa noite". */
export function saudacaoDaHora(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  return hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
}

/**
 * O nome que a saudação usa. clients.name é o nome da CLÍNICA e o app não guarda o nome do médico sem consulta nova, então a
 * saudação só diz um nome quando o texto já começa por título de médico (Dr, Dr., Dra, Dra., Doutor, Doutora, palavra inteira):
 * devolve o título como foi escrito mais o primeiro nome inteiro ("Dra. Lana Ribeiro" vira "Dra. Lana"). Em qualquer outro
 * caso (nome de clínica, só um nome, só o título, vazio), null: a saudação fica só em "Bom dia". Nunca corta no meio do nome.
 */
export function nomeDaSaudacao(nome: string | null | undefined): string | null {
  const m = /^(Dra?\.?|Doutora?)\s+(\p{L}[\p{L}'’-]*)/iu.exec((nome ?? "").trim().replace(/\s+/g, " "));
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Hora cheia (0 a 23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora);
  return Number(h);
}
