// Lógica pura das páginas Conteúdo, Ideias e Relatório do Hub.
// Sem React e sem acesso ao banco: recebe linhas já lidas e devolve resultado
// determinístico (sem IA). Isso permite testar com dado real via `npx tsx`.
import { computeDuvidasFrequentes, fmtFormatKey, median } from "@/lib/report-metrics";
import { confiancaPorAmostra, type Confianca, type Insight, type Limitacao } from "@/lib/insight";
import { analisarVozDoPaciente, assuntoDoTexto, confiancaDoGrupo, type GrupoDuvida, type ResultadoVoz } from "@/lib/voz-do-paciente";
import { MIN_POSTS_CONCLUSAO, confiancaPorPosts } from "@/lib/metricas";
import { soPerguntas, classificarComentario } from "@/lib/classificar-comentario";
import { hojeBrasilia } from "@/lib/status-fonte";
import { chaveTema, normalizarTemas, rotuloDoTema } from "@/lib/classificacao-post";
import { LIMITES } from "@/lib/limites";

// ---------- datas ----------
const DAY_MS = 86400000;
const isoToMs = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").getTime();
const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function fmtDiaBR(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = isoToMs(start); t <= isoToMs(end); t += DAY_MS) out.push(msToIso(t));
  return out;
}

function toRanges(days: string[]): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  for (const d of days) {
    const last = ranges[ranges.length - 1];
    if (last && isoToMs(d) - isoToMs(last.to) === DAY_MS) last.to = d;
    else ranges.push({ from: d, to: d });
  }
  return ranges;
}

export function fmtRanges(ranges: { from: string; to: string }[], max = 4): string {
  const parts = ranges.slice(0, max).map((r) => (r.from === r.to ? fmtDiaBR(r.from) : `${fmtDiaBR(r.from)} a ${fmtDiaBR(r.to)}`));
  if (ranges.length > max) parts.push(`e mais ${ranges.length - max} trecho(s)`);
  return parts.join(", ");
}

// ---------- seguidores + projeção ----------
export const PROJECAO_MIN_COBERTURA = 0.6;
export const PROJECAO_MIN_DIAS = 5;
export const PROJECAO_HORIZONTE = 30;

export interface FollowerPoint {
  date: string;
  followers: number;
}

export interface FollowerAnalysis {
  expectedDays: number;
  daysWithData: number;
  coverage: number; // 0..1
  points: FollowerPoint[];
  firstDate: string | null;
  lastDate: string | null;
  gaps: { from: string; to: string }[]; // dias sem dado entre o 1º dado e o fim efetivo do período
  semColetaAntes: { from: string; to: string } | null; // início do período até o 1º dado
  delta: number | null; // último - primeiro
  projection:
    | { ok: true; slopePerDay: number; atEnd: number; projected: number; target: string; line: { date: string; followers: number }[] }
    | { ok: false; reason: string };
}

function regress(points: FollowerPoint[]) {
  const t0 = isoToMs(points[0].date);
  const xs = points.map((p) => (isoToMs(p.date) - t0) / DAY_MS);
  const ys = points.map((p) => p.followers);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx, t0, xLast: xs[n - 1] };
}

function coverageOf(points: FollowerPoint[], start: string, end: string) {
  const expected = Math.max(1, daysBetween(start, end).length);
  return { expected, coverage: points.filter((p) => p.date >= start && p.date <= end).length / expected };
}

// ---------- seguidor bruto x líquido ----------
// Bruto = novos seguidores do dia (é o número do "Seguidores" no Insights da Meta e do app do Instagram).
// Saíram = deixaram de seguir ou saíram do Instagram. Líquido = bruto - saíram (o que de fato mudou no total).
// A Meta leva ~2 dias para fechar um dia: dia aberto aparece à parte e não entra nas somas.
export const DIAS_PARA_FECHAR = 2;

export interface GrowthDay {
  date: string;
  novos: number | null; // bruto; null = não medido
  saidas: number | null; // null = não medido
  liquido: number | null;
  aberto: boolean; // a Meta ainda não fechou o dia
}

export interface GrowthAnalysis {
  days: GrowthDay[];
  novos: number; // bruto, só dias fechados com saída medida
  saidas: number;
  liquido: number;
  diasMedidos: number;
  diasFechados: number; // dias fechados do período que têm algum dado
  diasSemSaida: number; // fechados, sem saída gravada (histórico anterior à coleta)
  diasSemGanhos: number; // fechados, sem ganhos gravados
  diasAbertos: number;
  novosTodosFechados: number; // bruto de todos os dias fechados, medidos ou não (compara com o Instagram)
  taxaSaida: number | null; // saíram / bruto, 0..1
}

export function analyzeGrowth(
  metrics: { date: string; new_followers?: number | null; unfollowers?: number | null }[],
  start: string,
  end: string,
  today: string = hojeBrasilia(),
): GrowthAnalysis {
  const ultimoFechado = msToIso(isoToMs(today) - DIAS_PARA_FECHAR * DAY_MS);
  const days: GrowthDay[] = [];
  for (const m of metrics) {
    if (m.date < start || m.date > end || m.date > today) continue;
    const aberto = m.date > ultimoFechado;
    const saidas = m.unfollowers == null ? null : Number(m.unfollowers);
    if (m.new_followers == null && saidas == null) continue;
    const novos = m.new_followers == null ? null : Number(m.new_followers);
    days.push({ date: m.date, novos, saidas, liquido: saidas == null || novos == null ? null : novos - saidas, aberto });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const fechados = days.filter((d) => !d.aberto);
  const medidos = fechados.filter((d) => d.saidas != null && d.novos != null);
  const novos = medidos.reduce((a, d) => a + (d.novos ?? 0), 0);
  const saidas = medidos.reduce((a, d) => a + (d.saidas ?? 0), 0);
  return {
    days,
    novos,
    saidas,
    liquido: novos - saidas,
    diasMedidos: medidos.length,
    diasFechados: fechados.length,
    diasSemSaida: fechados.filter((d) => d.saidas == null).length,
    diasSemGanhos: fechados.filter((d) => d.novos == null).length,
    diasAbertos: days.length - fechados.length,
    novosTodosFechados: fechados.reduce((a, d) => a + (d.novos ?? 0), 0),
    taxaSaida: novos > 0 ? saidas / novos : null,
  };
}

export function analyzeFollowers(
  metrics: { date: string; followers_count: number | null }[],
  start: string,
  end: string,
  today: string = hojeBrasilia(),
): FollowerAnalysis {
  const effEnd = end > today ? today : end;
  const byDate = new Map<string, number>();
  for (const m of metrics) {
    if (m.followers_count != null && m.date >= start && m.date <= effEnd) byDate.set(m.date, Number(m.followers_count));
  }
  const points = Array.from(byDate.entries())
    .map(([date, followers]) => ({ date, followers }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const all = daysBetween(start, effEnd);
  const expectedDays = Math.max(1, all.length);
  const daysWithData = points.length;
  const coverage = daysWithData / expectedDays;
  const firstDate = points[0]?.date ?? null;
  const lastDate = points[points.length - 1]?.date ?? null;
  const missing = all.filter((d) => !byDate.has(d));
  const semColetaAntes =
    firstDate && firstDate > start ? { from: start, to: msToIso(isoToMs(firstDate) - DAY_MS) } : null;
  const gaps = toRanges(missing.filter((d) => (firstDate ? d > firstDate : false)));
  const delta = points.length >= 2 ? points[points.length - 1].followers - points[0].followers : null;

  let projection: FollowerAnalysis["projection"];
  if (daysWithData === 0) {
    projection = { ok: false, reason: "Nenhum dia do período tem contagem de seguidores gravada." };
  } else if (daysWithData < PROJECAO_MIN_DIAS || coverage < PROJECAO_MIN_COBERTURA) {
    const faltam: string[] = [];
    if (daysWithData < PROJECAO_MIN_DIAS) faltam.push(`mínimo de ${PROJECAO_MIN_DIAS} dias com dado (há ${daysWithData})`);
    if (coverage < PROJECAO_MIN_COBERTURA)
      faltam.push(
        `pelo menos ${Math.round(PROJECAO_MIN_COBERTURA * 100)}% dos dias do período (há ${daysWithData} de ${expectedDays}, ${Math.round(coverage * 100)}%)`,
      );
    let reason = `Não projetamos: faltam ${faltam.join(" e ")}.`;
    if (gaps.length > 0) reason += ` Dias sem coleta depois de ${fmtDiaBR(firstDate!)}: ${fmtRanges(gaps)}.`;
    if (semColetaAntes) reason += ` Sem coleta de ${fmtRanges([semColetaAntes])}.`;
    // Dica: o recorte dos últimos 30 dias pode já atender a regra.
    const s30 = msToIso(isoToMs(effEnd) - 29 * DAY_MS);
    const c30 = coverageOf(points, s30, effEnd);
    if (points.filter((p) => p.date >= s30).length >= PROJECAO_MIN_DIAS && c30.coverage >= PROJECAO_MIN_COBERTURA) {
      reason += " Nos últimos 30 dias a série já é suficiente: troque o período no cabeçalho.";
    }
    projection = { ok: false, reason };
  } else {
    const { slope, intercept, t0, xLast } = regress(points);
    const lastDay = points[points.length - 1].date;
    const projected = Math.max(0, Math.round(slope * (xLast + PROJECAO_HORIZONTE) + intercept));
    const target = msToIso(isoToMs(lastDay) + PROJECAO_HORIZONTE * DAY_MS);
    const line = [0, PROJECAO_HORIZONTE].map((h) => ({
      date: msToIso(isoToMs(lastDay) + h * DAY_MS),
      followers: Math.max(0, Math.round(slope * (xLast + h) + intercept)),
    }));
    void t0;
    projection = {
      ok: true,
      slopePerDay: slope,
      atEnd: Math.max(0, Math.round(slope * xLast + intercept)),
      projected,
      target,
      line,
    };
  }

  return { expectedDays, daysWithData, coverage, points, firstDate, lastDate, gaps, semColetaAntes, delta, projection };
}

// ---------- formato e tema ----------
export interface GroupStat {
  key: string;
  label: string;
  count: number;
  reachMedian: number;
  reachMean: number;
  savedMean: number;
  savedMedian: number;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function groupStats(posts: any[], keyOf: (p: any) => string | null, labelOf: (k: string) => string): GroupStat[] {
  const g = new Map<string, { reach: number[]; saved: number[]; n: number }>();
  for (const p of posts) {
    const k = keyOf(p);
    if (!k) continue;
    const e = g.get(k) ?? { reach: [], saved: [], n: 0 };
    e.n++;
    if (p.reach != null) e.reach.push(Number(p.reach));
    if (p.saved != null) e.saved.push(Number(p.saved));
    g.set(k, e);
  }
  return Array.from(g.entries())
    .map(([key, e]) => ({
      key,
      label: labelOf(key),
      count: e.n,
      reachMedian: Math.round(median(e.reach)),
      reachMean: Math.round(mean(e.reach)),
      savedMean: Math.round(mean(e.saved) * 10) / 10,
      savedMedian: median(e.saved),
    }))
    .sort((a, b) => b.reachMedian - a.reachMedian);
}

// Mínimo para chamar um formato de melhor/pior: regra única de src/lib/metricas.ts (8 posts).
export const MIN_POSTS_FORMATO = MIN_POSTS_CONCLUSAO;
export const MIN_POSTS_REGRAS: number = LIMITES.amostra.conteudo.postsRegras;
export const MIN_PERGUNTAS: number = LIMITES.amostra.conteudo.perguntas;
// Tema só entra se a mediana de salvos for pelo menos 25% acima da da conta (evita ruído de 1 ou 2 salvos).
export const MARGEM_TEMA = 1.25;

export function analyzeFormatsAndTemas(postsBrutos: any[]) {
  // Mesmo tema com ou sem acento ou maiúscula conta uma vez só (chaveTema), em todas as telas.
  const posts = normalizarTemas(postsBrutos.map((p) => ({ ...p, tema: p.tema ?? null })));
  const porFormato = groupStats(
    posts,
    (p) => p.format ?? "não classificado",
    (k) => fmtFormatKey(k),
  );
  const porTema = groupStats(
    posts,
    (p) => (p.tema ? String(p.tema) : null),
    (k) => k,
  );
  const comTema = posts.filter((p) => p.tema).length;
  const elegiveis = porFormato.filter((f) => f.key !== "não classificado" && f.count >= MIN_POSTS_FORMATO);
  const melhorFormato = elegiveis.length >= 1 ? elegiveis[0] : null;
  return {
    total: posts.length,
    comTema,
    porFormato,
    porTema,
    melhorFormato,
    melhorFormatoMotivo:
      melhorFormato || posts.length === 0
        ? null
        : `Nenhum formato classificado tem ${MIN_POSTS_FORMATO}+ posts no período (amostra mínima para apontar o melhor).`,
  };
}

// ---------- ideias ----------
// Uma ideia só nasce de (a) um grupo de dúvida real feito por 2+ pessoas diferentes, já sem
// ruído (lib/voz-do-paciente.ts), ou (b) tema/formato que rendeu acima da conta no período.
// Nunca de um comentário solto. Gancho, roteiro e CTA são modelos fixos preenchidos com o
// tema e a intenção: determinísticos e revisados para a CFM 2.336/2023.
export type ObjetivoIdeia = "alcance" | "salvamento" | "conversa" | "venda";
export const ROTULO_OBJETIVO: Record<ObjetivoIdeia, string> = {
  alcance: "Alcance (chegar em gente nova)",
  salvamento: "Salvamento (conteúdo de consulta)",
  conversa: "Conversa (comentários e direct)",
  venda: "Venda (levar para a consulta)",
};

export interface Ideia {
  id: string;
  regra: "pergunta" | "tema" | "formato" | "identificacao";
  titulo: string; // título claro do post
  tema: string;
  formato: string; // formato recomendado
  objetivo: ObjetivoIdeia;
  confianca: Confianca;
  motivoConfianca: string;
  evidencia: string; // números usados
  porQueTestar: string;
  gancho: string; // primeira frase pronta
  roteiro: string[]; // 3 a 5 passos
  cta: string;
  avisoSeguranca?: string; // CFM / segurança médica
  grupoId?: string; // grupo de dúvida de origem
  pessoas?: number;
  comentarioIds?: string[]; // comentários que sustentam a ideia (para cruzar a regra nova com a original)
  exemplos?: string[]; // 2 a 3 comentários reais, para a equipe validar se a leitura faz sentido
  regraOriginal?: boolean; // ideia gerada pela regra original (477eb43), mostrada junto das novas
  // campos usados pelo relatório e pelo PDF
  funil: string;
  estagio: string;
  acao: string;
  porque: string;
}

export interface IdeiasResult {
  ideias: Ideia[];
  faltas: string[]; // o que falta para cada regra sem dado
  totalPosts: number;
  totalPerguntas: number; // perguntas reais, depois da triagem
  totalComentarios: number; // comentários lidos antes da triagem
  pedidosDeCuidado: number; // pessoas que pediram dose/remédio (não viram ideia)
}

const FUNIL_ROTULO: Record<string, string> = {
  C0: "C0, alcance",
  C1: "C1, educar e atrair seguidores",
  C2: "C2, solução e captação",
  C3: "C3, prova e remarketing",
};
const ESTAGIO_ROTULO: Record<string, string> = {
  percepcao: "Percepção",
  confianca: "Confiança",
  venda: "Venda",
  multiplicacao: "Multiplicação",
};

function moda(values: (string | null | undefined)[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) if (v > n) ((best = k), (n = v));
  return best;
}

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtD1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const DIACRITICOS_RE = new RegExp("[\\u0300-\\u036f]", "g");
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS_RE, "");

function tokens(s: string): Set<string> {
  return new Set(
    semAcento(s)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

// Post da própria conta que mais se parece com o assunto (palavras em comum), para a ideia trazer evidência.
function postParecido(texto: string, posts: any[]): { legenda: string; salvos: number } | null {
  const alvo = tokens(texto);
  let melhor: { legenda: string; salvos: number; pontos: number } | null = null;
  for (const p of posts) {
    if (p.saved == null || !p.caption) continue;
    const cap = tokens(String(p.caption) + " " + String(p.tema ?? ""));
    let pontos = 0;
    for (const w of alvo) if (cap.has(w)) pontos++;
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && Number(p.saved) > melhor.salvos))) {
      melhor = { legenda: String(p.caption).split("\n")[0].trim(), salvos: Number(p.saved), pontos };
    }
  }
  return melhor ? { legenda: melhor.legenda, salvos: melhor.salvos } : null;
}

const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Roteiros por intenção da dúvida. Linguagem simples, sem promessa, sem dose, sem preço.
function roteiroDaDuvida(g: GrupoDuvida): { objetivo: ObjetivoIdeia; roteiro: string[]; cta: string } {
  const t = g.termo;
  switch (g.intencao) {
    case "preco":
    case "agendamento":
      return {
        objetivo: "venda",
        roteiro: [
          "Abrir com a situação de quem quer marcar e não sabe como funciona (sem ler comentário).",
          "Contar o que acontece na primeira consulta: conversa, exame físico, o que o médico olha.",
          "Dizer quanto tempo costuma durar e o que é bom levar (exames antigos, lista de remédios em uso).",
          "Mostrar as formas de atendimento que existem de verdade (presencial, online) e como agendar.",
        ],
        cta: "Para valores e horários, chame no direct que a equipe responde.",
      };
    case "medo":
      return {
        objetivo: "alcance",
        roteiro: [
          `Nomear o medo que apareceu nos comentários sobre ${t}.`,
          "Explicar, em termos gerais, o que se sabe hoje, sem prometer nada e sem citar remédio.",
          "Dizer quem precisa de mais cuidado e por que isso é avaliado caso a caso.",
          "Mostrar como é a conversa sobre riscos e benefícios dentro da consulta.",
          "Fechar convidando a mandar o vídeo para quem tem o mesmo receio.",
        ],
        cta: "Mande para alguém que tem esse mesmo medo.",
      };
    case "objecao":
      return {
        objetivo: "conversa",
        roteiro: [
          `Ler a objeção real ("isso não é para mim") sobre ${t}.`,
          "Explicar por que tanta gente pensa assim.",
          "Mostrar que existem caminhos diferentes, sem citar nome de remédio e sem garantir resultado.",
          "Reforçar que a escolha é feita em avaliação individual.",
        ],
        cta: "Comente \"quero entender\" que a equipe te explica como funciona a avaliação.",
      };
    case "comparacao":
      return {
        objetivo: "salvamento",
        roteiro: [
          "Mostrar as opções que as pessoas compararam nos comentários.",
          "Explicar para que serve cada uma, em linhas gerais.",
          "Listar o que muda a escolha (idade, histórico, objetivo, outros tratamentos).",
          "Deixar claro por que não existe \"melhor para todo mundo\".",
        ],
        cta: "Salve para levar essa lista na sua próxima consulta.",
      };
    default:
      return {
        objetivo: "salvamento",
        roteiro: [
          "Abrir com a situação do dia a dia que gera essa dúvida (sem ler o comentário de ninguém).",
          `Explicar em palavras simples o básico sobre ${t.replace(/^(o|a|os|as) /, "")} e por que a dúvida é tão comum.`,
          "Mostrar o que o médico costuma avaliar antes de indicar qualquer caminho (histórico, sintomas, exames).",
          "Dizer quais sinais pedem avaliação logo.",
          "Fechar convidando a deixar outras dúvidas nos comentários.",
        ],
        cta: "Salve para consultar depois e mande para quem tem a mesma dúvida.",
      };
  }
}

const AVISO_GERAL = "Conteúdo educativo: sem promessa de resultado, sem nome de remédio e sem responder caso individual.";

function ideiaDeGrupo(g: GrupoDuvida, i: number, posts: any[]): Ideia {
  const { objetivo, roteiro, cta } = roteiroDaDuvida(g);
  const post = g.sugestaoPost!;
  const confianca = confiancaDoGrupo(g.pessoas);
  const parecido = postParecido(`${g.termo} ${g.rotulo} ${g.exemplos.map((e) => e.texto).join(" ")}`, posts);
  const ex = g.exemplos[0]?.texto ?? "";
  const evidencia =
    `${g.pessoas} pessoas diferentes perguntaram sobre isso (${g.comentarios} comentário(s), depois de tirar ruído). Ex.: "${cortar(ex, 90)}".` +
    (parecido ? ` Um post parecido da conta, "${cortar(parecido.legenda, 60)}", teve ${fmtN(parecido.salvos)} salvamentos.` : "");
  const comercial = g.intencao === "preco" || g.intencao === "agendamento";
  const porQueTestar = comercial
    ? "Quem pergunta valor ou horário está perto de marcar. Um conteúdo que explica a consulta responde todo mundo de uma vez e tira a dúvida de quem ainda não perguntou."
    : `Quando ${g.pessoas} pessoas fazem a mesma pergunta, muitas outras têm a mesma dúvida e não comentaram. Post que responde dúvida real costuma ser salvo e compartilhado.`;
  const titulo = post.titulo;
  return {
    id: `pergunta-${i}`,
    regra: "pergunta",
    titulo,
    tema: g.rotulo,
    formato: post.formato,
    objetivo,
    confianca,
    motivoConfianca: `${g.pessoas} pessoa(s) diferente(s); 5 ou mais dá confiança alta`,
    evidencia,
    porQueTestar,
    gancho: post.gancho,
    roteiro,
    cta,
    avisoSeguranca: g.avisoCfm ?? AVISO_GERAL,
    grupoId: g.id,
    pessoas: g.pessoas,
    comentarioIds: g.itens.map((x) => x.comentario.id),
    exemplos: g.exemplos.slice(0, 3).map((e) => cortar(e.texto, 160)),
    funil: comercial ? FUNIL_ROTULO.C2 : FUNIL_ROTULO.C1,
    estagio: comercial ? ESTAGIO_ROTULO.venda : ESTAGIO_ROTULO.confianca,
    acao: `${post.formato}: ${titulo}.`,
    porque: evidencia,
  };
}

export function buildIdeias(
  posts: any[],
  perguntas: { id: string; text: string; like_count: number | null; instagram_post_id?: string | null; author_username?: string | null }[],
  opcoes: { donos?: string[]; voz?: ResultadoVoz } = {},
): IdeiasResult {
  const ideias: Ideia[] = [];
  const faltas: string[] = [];
  const voz = opcoes.voz ?? analisarVozDoPaciente(perguntas, { donos: opcoes.donos });
  const pedidosDeCuidado = voz.gruposCuidado.reduce((a, g) => a + g.pessoas, 0);

  // (a) dúvida real repetida por 2+ pessoas (já sem ruído)
  const grupos = voz.grupos.filter((g) => g.sugestaoPost);
  if (voz.mantidos.length < MIN_PERGUNTAS) {
    faltas.push(
      `Regra "dúvida repetida": dos ${voz.total} comentários lidos, ${voz.mantidos.length} são perguntas reais de pacientes; precisa de ${MIN_PERGUNTAS} ou mais.`,
    );
  } else if (grupos.length === 0) {
    faltas.push(`Regra "dúvida repetida": há ${voz.mantidos.length} perguntas reais, mas nenhum assunto foi perguntado por 2 pessoas diferentes ou mais.`);
  }
  // Dúvidas de conteúdo primeiro; a de preço/agendamento entra uma vez só.
  const conteudo = grupos.filter((g) => g.intencao !== "preco" && g.intencao !== "agendamento").slice(0, 5);
  const comercial = grupos.find((g) => g.intencao === "preco" || g.intencao === "agendamento");
  for (const [i, g] of [...conteudo, ...(comercial ? [comercial] : [])].entries()) ideias.push(ideiaDeGrupo(g, i, posts));
  if (pedidosDeCuidado > 0) {
    faltas.push(
      `${pedidosDeCuidado} pessoa(s) pediram dose ou nome de remédio: isso não vira post (é prescrição sem consulta). A resposta de segurança está na tela Dúvidas.`,
    );
  }

  // (b) e (c) exigem amostra mínima
  if (posts.length < MIN_POSTS_REGRAS) {
    const f = `há ${posts.length} post(s) no período; precisa de ${MIN_POSTS_REGRAS} ou mais`;
    faltas.push(`Regra "tema que mais salva": ${f}.`);
    faltas.push(`Regra "formato que mais alcança": ${f}.`);
  } else {
    const savedValid = posts.filter((p) => p.saved != null).map((p) => Number(p.saved));
    const baseSaved = median(savedValid);
    const temas = new Map<string, any[]>();
    for (const p of posts) if (p.tema) (temas.get(p.tema) ?? temas.set(p.tema, []).get(p.tema)!).push(p);
    if (temas.size === 0) {
      faltas.push('Regra "tema que mais salva": nenhum post do período está classificado por tema (classificar na aba Posts).');
    } else {
      const achados = Array.from(temas.entries())
        .filter(([, ps]) => ps.length >= MIN_POSTS_CONCLUSAO)
        .map(([tema, ps]) => ({ tema, ps, med: median(ps.filter((p) => p.saved != null).map((p) => Number(p.saved))) }))
        .filter((t) => t.med > 0 && t.med >= baseSaved * MARGEM_TEMA)
        .sort((a, b) => b.med - a.med)
        .slice(0, 4);
      if (achados.length === 0) {
        faltas.push(`Regra "tema que mais salva": nenhum tema com ${MIN_POSTS_CONCLUSAO}+ posts teve o post típico 25% acima do post típico da conta em salvamentos.`);
      }
      for (const [i, t] of achados.entries()) {
        const fm = moda(t.ps.map((p) => p.format));
        const formato = fm ? fmtFormatKey(fm) : "Carrossel";
        const assunto = assuntoDoTexto(t.tema);
        const evidencia = `${t.ps.length} posts sobre "${t.tema}": o post típico teve ${fmtD1(t.med)} salvamentos, contra ${fmtD1(baseSaved)} do post típico da conta no período.`;
        ideias.push({
          id: `tema-${i}`,
          regra: "tema",
          titulo: `${t.tema}: 3 pontos que ainda não apareceram no perfil`,
          tema: t.tema,
          formato,
          objetivo: "salvamento",
          confianca: confiancaPorPosts(t.ps.length),
          motivoConfianca: `${t.ps.length} posts sobre o tema (8 a 19 = confiança média, 20+ alta)`,
          evidencia,
          porQueTestar: "Esse tema já é guardado pelo seu público para consultar depois. Uma variação com ângulo novo aproveita um interesse comprovado.",
          gancho: `${t.tema}: 3 coisas que eu ainda não te contei por aqui.`,
          roteiro: [
            `Abrir com uma situação do dia a dia ligada a ${t.tema.toLowerCase()}.`,
            "Ponto 1: algo que as pessoas costumam confundir, com um exemplo prático.",
            "Ponto 2: um sinal que merece atenção e quando procurar avaliação.",
            "Ponto 3: um hábito simples que ajuda, sem prometer resultado.",
            "Fechar pedindo para salvar.",
          ],
          cta: "Salve para não esquecer e mande para quem precisa ver.",
          avisoSeguranca: assunto?.sensivel ?? AVISO_GERAL,
          funil: FUNIL_ROTULO[moda(t.ps.map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
          estagio: ESTAGIO_ROTULO[moda(t.ps.map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
          acao: `${formato}: variação do tema "${t.tema}" com outro ângulo, caso ou pergunta.`,
          porque: evidencia,
        });
      }
    }

    const fmts = groupStats(
      posts,
      (p) => p.format ?? null,
      (k) => fmtFormatKey(k),
    ).filter((f) => f.count >= MIN_POSTS_FORMATO);
    if (fmts.length === 0) {
      faltas.push(`Regra "formato que mais alcança": nenhum formato classificado tem ${MIN_POSTS_FORMATO}+ posts no período.`);
    } else if (fmts[0].reachMedian <= median(posts.filter((p) => p.reach != null).map((p) => Number(p.reach)))) {
      // O formato com mais alcance entre os que têm amostra mínima ficou abaixo do post típico da conta: não é "o que mais alcança".
      faltas.push(`Regra "formato que mais alcança": entre os formatos com ${MIN_POSTS_FORMATO}+ posts, nenhum alcança mais que o post típico da conta.`);
    } else {
      const best = fmts[0];
      const overall = median(posts.filter((p) => p.reach != null).map((p) => Number(p.reach)));
      const doFormato = posts.filter((p) => p.format === best.key && p.tema);
      const melhorTema = moda(
        [...doFormato].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 3).map((p) => p.tema),
      );
      const termo = melhorTema ? melhorTema.toLowerCase() : "a sua saúde";
      const assunto = melhorTema ? assuntoDoTexto(melhorTema) : null;
      const evidencia = `${best.label}: o post típico alcançou ${fmtN(best.reachMedian)} pessoas em ${best.count} posts, contra ${fmtN(overall)} do post típico da conta toda.`;
      ideias.push({
        id: "formato-0",
        regra: "formato",
        titulo: `Novo ${best.label}${melhorTema ? ` sobre ${melhorTema}` : ""} para chegar em gente nova`,
        tema: melhorTema ?? "Tema livre",
        formato: best.label,
        objetivo: "alcance",
        confianca: confiancaPorPosts(best.count),
        motivoConfianca: `${best.count} posts nesse formato no período`,
        evidencia,
        porQueTestar: "É o formato que mais leva os seus posts para pessoas que ainda não te seguem. Repetir o formato com um tema forte é o teste mais barato de alcance.",
        gancho: `Uma coisa sobre ${termo} que pouca gente sabe.`,
        roteiro: [
          "Primeiros 3 segundos: a frase do gancho, olhando para a câmera ou em texto grande.",
          `Explicar o ponto principal sobre ${termo} com um exemplo do dia a dia.`,
          "Dar uma orientação geral e segura, sem prometer resultado.",
          "Fechar convidando a seguir o perfil para mais conteúdo como esse.",
        ],
        cta: "Siga o perfil para mais conteúdos como este.",
        avisoSeguranca: assunto?.sensivel ?? AVISO_GERAL,
        funil: FUNIL_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
        estagio: ESTAGIO_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
        acao: `Novo conteúdo em ${best.label}${melhorTema ? ` sobre "${melhorTema}"` : ""}.`,
        porque: evidencia,
      });
    }
  }
  return { ideias, faltas, totalPosts: posts.length, totalPerguntas: voz.mantidos.length, totalComentarios: voz.total, pedidosDeCuidado };
}

/** A ideia no formato único de insight do Hub (área "ideias"). */
export function ideiaParaInsight(i: Ideia): Insight {
  return {
    id: `ideia-${i.id}`,
    area: "ideias",
    tom: i.regra === "pergunta" ? "atencao" : "bom",
    titulo: i.titulo,
    diagnostico: i.porQueTestar,
    evidencia: i.evidencia,
    confianca: i.confianca,
    motivoConfianca: i.motivoConfianca,
    impacto: i.objetivo === "venda" || (i.pessoas ?? 0) >= 5 ? "alto" : "medio",
    impactoTexto: ROTULO_OBJETIVO[i.objetivo],
    acao: {
      texto: `Produzir em ${i.formato}. Gancho: ${i.gancho}`,
      rota: i.regra === "pergunta" ? "/$clientId/duvidas" : undefined,
      botao: i.regra === "pergunta" && i.pessoas ? `Ver as ${i.pessoas} pessoas que perguntaram` : undefined,
    },
    responsavel: "social_media",
    risco: i.avisoSeguranca,
  };
}

export function faltasParaLimitacoes(faltas: string[]): Limitacao[] {
  return faltas.map((texto, k) => ({ id: `ideias-falta-${k}`, area: "ideias", texto, resolve: /classificar/.test(texto) ? "social_media" : "equipe_hub" }));
}

export function ideiaParaTexto(i: Ideia): string {
  return [
    `Ideia: ${i.titulo}`,
    i.regraOriginal ? `Origem: regra original (${REGRA_ORIGINAL_ROTULO[i.regra]})` : "",
    i.tema && i.tema !== i.titulo ? `Tema: ${i.tema}` : "",
    `Formato: ${i.formato}`,
    `Funil: ${i.funil}`,
    `Estágio: ${i.estagio}`,
    `Objetivo: ${ROTULO_OBJETIVO[i.objetivo]}`,
    `Confiança: ${i.confianca}`,
    `Por que vale testar: ${i.porQueTestar}`,
    `Evidência: ${i.evidencia}`,
    `O que fazer: ${i.acao}`,
    i.porque && i.porque !== i.evidencia ? `Por quê: ${i.porque}` : "",
    `Gancho: ${i.gancho}`,
    i.roteiro.length ? `Roteiro:` : "",
    ...i.roteiro.map((r, k) => `${k + 1}. ${r}`),
    i.cta ? `CTA: ${i.cta}` : "",
    i.avisoSeguranca ? `Atenção: ${i.avisoSeguranca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- ideias pela REGRA ORIGINAL (477eb43) ----------
// As regras de geração do baseline continuam disponíveis e são mostradas na tela Ideias como
// "regra original", sem repetir o que a regra nova já trouxe. Diferenças principais (veja a matriz
// docs/auditoria, R4): a pergunta repetida usa a detecção original (is_question, sem triagem nova) e o
// agrupamento original (Jaccard ≥ 0,4, conta comentários, não pessoas); o título é o texto do
// comentário; formato e ação vêm do tipo da dúvida; funil C1 e estágio Confiança. Tema e formato têm os
// mesmos limites da regra nova (só o formato padrão do tema era "A definir").
export const REGRA_ORIGINAL_ROTULO: Record<Ideia["regra"], string> = {
  identificacao: "Tema que gera identificação",
  pergunta: "Pergunta repetida",
  tema: "Tema que salva mais",
  formato: "Formato de maior alcance",
};

type TipoDuvida = "preco" | "como_agendar" | "uso" | "sintoma" | "resultado" | "geral";

function tipoDaDuvida(texto: string): TipoDuvida {
  const t = semAcento(texto);
  if (/\b(quanto (custa|e|fica|sai)|valor|preco|parcel|pagamento|custa)\b/.test(t)) return "preco";
  if (/\b(onde|como (faco|fazer|compro|comprar|agendo|agendar|marco|marcar)|agendar|marcar|comprar|link)\b/.test(t)) return "como_agendar";
  if (/\b(posso|pode|tomar|dose|quantas?|de quanto em quanto|junto com|misturar|usar)\b/.test(t)) return "uso";
  if (/\b(dor|sangr|menstru|calor|sintoma|queda|inchac|ansied|sono|libido|cansaco)\b/.test(t)) return "sintoma";
  if (/\b(resultado|funciona|demora|quanto tempo|em quanto tempo|ja faz)\b/.test(t)) return "resultado";
  return "geral";
}

const cortarOriginal = (t: string) => {
  const x = t.replace(/\s+/g, " ").trim();
  return x.length > 160 ? x.slice(0, 157) + "..." : x;
};

/** Abertura do vídeo pelo tipo de dúvida, sem copiar o comentário. */
function ganchoDaDuvida(tipo: TipoDuvida, texto: string): string {
  const assunto = assuntoDoTexto(texto)?.rotulo?.toLowerCase() ?? null;
  const sobre = assunto ? ` sobre ${assunto}` : "";
  switch (tipo) {
    case "preco":
      return "O que está incluído numa avaliação, e por que ela é diferente de uma consulta rápida.";
    case "como_agendar":
      return "Agendar a sua avaliação é mais simples do que parece: são 3 passos.";
    case "uso":
      return `Antes de usar qualquer coisa${sobre}, entenda isto.`;
    case "sintoma":
      return `Esse sinal${sobre} merece atenção. Te explico quando procurar avaliação.`;
    case "resultado":
      return `Quanto tempo leva para ver diferença${sobre}? A resposta honesta.`;
    default:
      return assunto ? `${assunto.charAt(0).toUpperCase() + assunto.slice(1)}: o que quase ninguém te explica direito.` : "A dúvida que mais chega aqui, respondida sem enrolação.";
  }
}

// Cada tipo de dúvida pede um conteúdo diferente (antes todas viravam o mesmo carrossel).
const MODELO_POR_TIPO: Record<TipoDuvida, { formato: string; acao: string }> = {
  preco: {
    formato: "Reels",
    acao: "Reels curto explicando o que está incluído na avaliação e como funciona o atendimento, sem preço promocional e sem urgência.",
  },
  como_agendar: {
    formato: "Reels",
    acao: "Reels ou story com o passo a passo, em 3 passos, de como agendar a avaliação.",
  },
  uso: {
    formato: "Carrossel",
    acao: "Carrossel de perguntas e respostas sobre o uso, com aviso claro de que cada caso depende de avaliação médica.",
  },
  sintoma: {
    formato: "Reels",
    acao: "Reels sobre os sinais que merecem atenção e quando procurar avaliação, sem prometer resultado.",
  },
  resultado: {
    formato: "Carrossel",
    acao: "Carrossel sobre o que esperar e em quanto tempo costuma haver mudança, sem garantia e sem antes e depois.",
  },
  geral: {
    formato: "Carrossel",
    acao: "Conteúdo que responde a dúvida com clareza e termina convidando para conversar.",
  },
};

// Versão original do "post parecido": compara só com a legenda (a nova compara legenda + tema).
function postParecidoOriginal(texto: string, posts: any[]): { legenda: string; salvos: number } | null {
  const alvo = tokens(texto);
  let melhor: { legenda: string; salvos: number; pontos: number } | null = null;
  for (const p of posts) {
    if (p.saved == null || !p.caption) continue;
    const cap = tokens(String(p.caption));
    let pontos = 0;
    for (const w of alvo) if (cap.has(w)) pontos++;
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && Number(p.saved) > melhor.salvos))) {
      melhor = { legenda: String(p.caption).split("\n")[0].trim(), salvos: Number(p.saved), pontos };
    }
  }
  return melhor ? { legenda: melhor.legenda, salvos: melhor.salvos } : null;
}

const POR_QUE_ORIGINAL: Record<Ideia["regra"], string> = {
  identificacao: "Elogios e relatos pessoais de pessoas diferentes nos posts do mesmo tema.",
  pergunta: "Regra original: a mesma dúvida apareceu 2 vezes ou mais nos comentários marcados como pergunta (agrupamento por palavras em comum, contando comentários).",
  tema: "Regra original: tema com 8+ posts (amostra mínima desde out/2026) em que a mediana de salvos ficou 25% ou mais acima da mediana da conta.",
  formato: "Regra original: formato com 8+ posts (amostra mínima desde out/2026), a maior mediana de alcance e acima do post típico da conta.",
};

export interface IdeiasOriginaisResult {
  ideias: Ideia[];
  faltas: string[];
  totalPosts: number;
  totalPerguntas: number;
}

/**
 * Regras de geração de ideias do baseline (477eb43), com o mesmo cálculo. `perguntas` deve vir da
 * detecção original (is_question + `filtrarPerguntasOriginal`). Os campos novos do cartão (gancho,
 * roteiro, CTA, confiança) são preenchidos só com o que a regra original já tinha.
 */
export function buildIdeiasRegraOriginal(
  posts: any[],
  comentariosDetectados: { id: string; text: string; like_count: number | null; instagram_post_id?: string | null }[],
): IdeiasOriginaisResult {
  const ideias: Ideia[] = [];
  const faltas: string[] = [];
  // Só "pergunta" entra (classificar-comentario.ts): elogio, relato e marcação de amigo não são dúvida.
  const perguntas = soPerguntas(comentariosDetectados);

  // (a) pergunta repetida
  if (perguntas.length < MIN_PERGUNTAS) {
    faltas.push(
      `Regra "pergunta repetida": há ${perguntas.length} pergunta(s) de paciente nos comentários do período; precisa de ${MIN_PERGUNTAS} ou mais.`,
    );
  } else {
    const clusters = computeDuvidasFrequentes(perguntas, { threshold: 0.4, minSize: 2 });
    if (clusters.length === 0) {
      faltas.push(
        `Regra "pergunta repetida": há ${perguntas.length} perguntas, mas nenhuma se repete (nenhuma dúvida apareceu 2 vezes ou mais).`,
      );
    }
    const fmtsConta = groupStats(posts, (p) => p.format ?? null, (k) => fmtFormatKey(k)).filter((f) => f.count >= MIN_POSTS_FORMATO);
    const melhorDaConta = fmtsConta[0] ?? null;
    for (const [i, c] of clusters.slice(0, 5).entries()) {
      const texto = c.representative.text.replace(/\s+/g, " ").trim();
      const curto = texto.length > 90 ? texto.slice(0, 87) + "..." : texto;
      const tipo = tipoDaDuvida(texto);
      const modelo = MODELO_POR_TIPO[tipo];
      const parecido = postParecidoOriginal(texto, posts);
      const formato = tipo === "geral" && melhorDaConta ? melhorDaConta.label : modelo.formato;
      const evidencia = parecido
        ? ` Um post parecido, "${parecido.legenda.length > 60 ? parecido.legenda.slice(0, 57) + "..." : parecido.legenda}", teve ${fmtN(parecido.salvos)} salvamentos.`
        : "";
      const tema = texto.length > 120 ? texto.slice(0, 117) + "..." : texto;
      const porque = `${c.count} pessoas perguntaram algo parecido nos comentários do período (ex.: "${curto}").${evidencia}`;
      ideias.push({
        id: `original-pergunta-${i}`,
        regra: "pergunta",
        regraOriginal: true,
        titulo: tema,
        tema,
        funil: FUNIL_ROTULO.C1,
        estagio: ESTAGIO_ROTULO.confianca,
        formato,
        acao: modelo.acao,
        porque,
        objetivo: tipo === "preco" || tipo === "como_agendar" ? "venda" : "salvamento",
        confianca: confiancaDoGrupo(c.count),
        motivoConfianca: `${c.count} comentário(s) parecidos; a regra original conta comentários, não pessoas (a mesma pessoa pode contar 2 vezes)`,
        evidencia: porque,
        porQueTestar: POR_QUE_ORIGINAL.pergunta,
        // Gancho é a abertura do vídeo para o paciente: nunca o comentário copiado nem "apareceu N vezes".
        gancho: ganchoDaDuvida(tipo, texto),
        roteiro: [],
        cta: "",
        avisoSeguranca: AVISO_GERAL,
        comentarioIds: c.items.map((x) => x.id),
        exemplos: c.items.slice(0, 3).map((x) => cortarOriginal(x.text)),
        pessoas: c.count,
      });
    }
  }

  // (b) e (c) exigem amostra mínima
  if (posts.length < MIN_POSTS_REGRAS) {
    const f = `há ${posts.length} post(s) no período; precisa de ${MIN_POSTS_REGRAS} ou mais`;
    faltas.push(`Regra "tema com salvos acima da média": ${f}.`);
    faltas.push(`Regra "formato de maior alcance": ${f}.`);
  } else {
    const savedValid = posts.filter((p) => p.saved != null).map((p) => Number(p.saved));
    const baseSaved = median(savedValid);
    const temas = new Map<string, any[]>();
    for (const p of posts) if (p.tema) (temas.get(p.tema) ?? temas.set(p.tema, []).get(p.tema)!).push(p);
    if (temas.size === 0) {
      faltas.push('Regra "tema com salvos acima da média": nenhum post do período está classificado por tema (classificar na aba Posts).');
    } else {
      const achados = Array.from(temas.entries())
        .filter(([, ps]) => ps.length >= MIN_POSTS_CONCLUSAO)
        .map(([tema, ps]) => ({ tema, ps, med: median(ps.filter((p) => p.saved != null).map((p) => Number(p.saved))) }))
        .filter((t) => t.med > 0 && t.med >= baseSaved * MARGEM_TEMA)
        .sort((a, b) => b.med - a.med)
        .slice(0, 4);
      if (achados.length === 0) {
        faltas.push(`Regra "tema com salvos acima da média": nenhum tema com ${MIN_POSTS_CONCLUSAO}+ posts tem mediana de salvos 25% acima da mediana da conta no período.`);
      }
      for (const [i, t] of achados.entries()) {
        const fm = moda(t.ps.map((p) => p.format));
        const porque = `${t.ps.length} posts sobre "${t.tema}" tiveram mediana de ${fmtD1(t.med)} salvos, contra ${fmtD1(baseSaved)} da conta no período.`;
        ideias.push({
          id: `original-tema-${i}`,
          regra: "tema",
          regraOriginal: true,
          titulo: t.tema,
          tema: t.tema,
          funil: FUNIL_ROTULO[moda(t.ps.map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
          estagio: ESTAGIO_ROTULO[moda(t.ps.map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
          formato: fm ? fmtFormatKey(fm) : "A definir",
          acao: `Variação do tema "${t.tema}" com outro ângulo, caso ou pergunta.`,
          porque,
          objetivo: "salvamento",
          confianca: confiancaPorPosts(t.ps.length),
          motivoConfianca: `${t.ps.length} posts sobre o tema`,
          evidencia: porque,
          porQueTestar: POR_QUE_ORIGINAL.tema,
          gancho: "",
          roteiro: [],
          cta: "",
          avisoSeguranca: assuntoDoTexto(t.tema)?.sensivel ?? AVISO_GERAL,
        });
      }
    }

    const fmts = groupStats(
      posts,
      (p) => p.format ?? null,
      (k) => fmtFormatKey(k),
    ).filter((f) => f.count >= MIN_POSTS_FORMATO);
    if (fmts.length === 0) {
      faltas.push(`Regra "formato de maior alcance": nenhum formato classificado tem ${MIN_POSTS_FORMATO}+ posts no período.`);
    } else if (fmts[0].reachMedian <= median(posts.filter((p) => p.reach != null).map((p) => Number(p.reach)))) {
      // O formato com mais alcance entre os que têm amostra mínima ficou abaixo do post típico da conta: não é "o que mais alcança".
      faltas.push(`Regra "formato de maior alcance": entre os formatos com ${MIN_POSTS_FORMATO}+ posts, nenhum alcança mais que o post típico da conta.`);
    } else {
      const best = fmts[0];
      const overall = median(posts.filter((p) => p.reach != null).map((p) => Number(p.reach)));
      const doFormato = posts.filter((p) => p.format === best.key && p.tema);
      const melhorTema = moda(
        [...doFormato].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 3).map((p) => p.tema),
      );
      const porque = `${best.label} tem o maior alcance por post: mediana de ${fmtN(best.reachMedian)} em ${best.count} posts, contra ${fmtN(overall)} da conta toda.`;
      ideias.push({
        id: "original-formato-0",
        regra: "formato",
        regraOriginal: true,
        titulo: melhorTema ?? "Tema livre",
        tema: melhorTema ?? "Tema livre",
        funil: FUNIL_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
        estagio: ESTAGIO_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
        formato: best.label,
        acao: `Novo conteúdo em ${best.label}${melhorTema ? ` sobre "${melhorTema}"` : ""}.`,
        porque,
        objetivo: "alcance",
        confianca: confiancaPorPosts(best.count),
        motivoConfianca: `${best.count} posts nesse formato no período`,
        evidencia: porque,
        porQueTestar: POR_QUE_ORIGINAL.formato,
        gancho: "",
        roteiro: [],
        cta: "",
        avisoSeguranca: (melhorTema ? assuntoDoTexto(melhorTema)?.sensivel : null) ?? AVISO_GERAL,
      });
    }
  }
  return { ideias, faltas, totalPosts: posts.length, totalPerguntas: perguntas.length };
}

export interface CruzamentoRegraOriginal {
  extras: Ideia[]; // ideias da regra original que a regra nova não trouxe
  repetidas: { original: Ideia; nova: Ideia }[]; // já aparecem na lista nova
  diferencas: string[]; // onde as duas regras chegaram à mesma ideia com algum detalhe diferente
}

const sobreposicao = (a: string[] = [], b: string[] = []) => {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  const comuns = a.filter((x) => sb.has(x)).length;
  return comuns / Math.min(a.length, b.length);
};

/**
 * Tira da regra original o que a regra nova já trouxe: pergunta com metade ou mais dos mesmos
 * comentários, mesmo tema, mesmo formato. Nada some em silêncio: as repetidas e as diferenças de
 * detalhe voltam listadas. Se a voz (triagem nova) for passada, a ideia original montada sobre
 * comentários que a triagem nova marcou como pedido de dose ou remédio ganha o aviso de cuidado.
 */
export function ideiasOriginaisSemRepetir(novas: Ideia[], originais: Ideia[], voz?: ResultadoVoz | null): CruzamentoRegraOriginal {
  const extras: Ideia[] = [];
  const repetidas: { original: Ideia; nova: Ideia }[] = [];
  const diferencas: string[] = [];
  const idsCuidado = new Set((voz?.gruposCuidado ?? []).flatMap((g) => g.itens.map((x) => x.comentario.id)));
  const igual = (a: string, b: string) => semAcento(a).trim() === semAcento(b).trim();

  for (const o of originais) {
    let nova: Ideia | undefined;
    if (o.regra === "pergunta") {
      nova = novas.find((n) => n.regra === "pergunta" && sobreposicao(o.comentarioIds, n.comentarioIds) >= 0.5);
    } else if (o.regra === "tema") {
      nova = novas.find((n) => n.regra === "tema" && igual(n.tema, o.tema));
      if (nova && !igual(nova.formato, o.formato))
        diferencas.push(`Tema "${o.tema}": a regra original indicava o formato "${o.formato}"; a nova indica "${nova.formato}".`);
    } else {
      nova = novas.find((n) => n.regra === "formato" && igual(n.formato, o.formato));
      if (nova && !igual(nova.tema, o.tema)) diferencas.push(`Formato ${o.formato}: a regra original sugeria o tema "${o.tema}"; a nova sugere "${nova.tema}".`);
    }
    if (nova) {
      repetidas.push({ original: o, nova });
      continue;
    }
    if (o.regra === "pergunta" && (o.comentarioIds ?? []).some((id) => idsCuidado.has(id))) {
      extras.push({
        ...o,
        avisoSeguranca:
          "Parte destes comentários pede dose ou nome de remédio (a triagem nova não transforma isso em post). Responder sem dose e sem nome de remédio; o post, se feito, é educativo e geral. " +
          AVISO_GERAL,
      });
    } else extras.push(o);
  }
  return { extras, repetidas, diferencas };
}

// ---------- plano de 7 dias a partir das ideias ----------
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Distribui as ideias da lista em dias de publicação (segunda, terça, quarta, quinta e sexta), com os
// outros dias para responder comentários e mensagens. Só usa o que a lista já traz: sem ideia nova,
// sem número inventado. Ideias vindas de dúvidas de pacientes vêm primeiro.
// Com `manterOrdem`, usa a ordem recebida (a tela Ideias põe as da regra original depois das novas).
// Ideia da regra original sai na linha do jeito original: "Formato. O que fazer".
export function montarPlano7Dias(ideias: Ideia[], horaSugerida?: number | null, opcoes: { manterOrdem?: boolean } = {}): string {
  if (ideias.length === 0) return "";
  const ordem = opcoes.manterOrdem ? [...ideias] : [...ideias].sort((a, b) => Number(b.regra === "pergunta") - Number(a.regra === "pergunta"));
  const dias = [0, 1, 2, 3, 4];
  const linhas = DIAS_SEMANA.map((dia, i) => {
    const k = dias.indexOf(i);
    if (k < 0) return `${dia}: sem publicação nova. Responder comentários e mensagens que chegaram na semana.`;
    const ideia = ordem[k];
    if (!ideia) return `${dia}: espaço livre. Reaproveitar o post de melhor resultado do período em outro formato.`;
    const hora = horaSugerida != null ? `, por volta das ${horaSugerida}h` : "";
    if (ideia.regraOriginal) return `${dia}${hora}: ${ideia.formato}. ${ideia.acao} (regra original)`;
    return `${dia}${hora}: ${ideia.formato}. ${ideia.titulo}. Gancho: ${ideia.gancho}`;
  });
  return ["Plano de conteúdo da semana", ...linhas].join("\n");
}


// ---------------------------------------------------------------- tema que gera identificação

export const MIN_PESSOAS_IDENTIFICACAO: number = LIMITES.amostra.conteudo.pessoasIdentificacao;

/**
 * Elogios e relatos pessoais (classificar-comentario.ts) nos posts do mesmo tema viram a ideia
 * "Tema que gera identificação": o público se reconhece nesse assunto. Não usa perguntas (essas vão para
 * "Pergunta repetida"). Mínimo de 3 pessoas diferentes por tema. Mostra 2 a 3 comentários reais.
 */
export function ideiasDeIdentificacao(
  comentarios: { id: string; text: string; author_username?: string | null; instagram_posts?: { tema?: string | null } | null }[],
): { ideias: Ideia[]; faltas: string[] } {
  const porChave = new Map<string, { grafias: string[]; autores: Set<string>; itens: { id: string; text: string; tipo: string }[] }>();
  for (const c of comentarios) {
    const tema = c.instagram_posts?.tema?.trim();
    const chave = chaveTema(tema);
    if (!tema || !chave) continue;
    const tipo = classificarComentario(c.text);
    if (tipo !== "elogio" && tipo !== "relato") continue;
    const g = porChave.get(chave) ?? { grafias: [], autores: new Set<string>(), itens: [] };
    g.grafias.push(tema);
    g.autores.add((c.author_username ?? c.id).toLowerCase());
    g.itens.push({ id: c.id, text: c.text, tipo });
    porChave.set(chave, g);
  }
  const porTema = new Map([...porChave.values()].map((g) => [rotuloDoTema(g.grafias), g] as const));
  const grupos = [...porTema.entries()].filter(([, g]) => g.autores.size >= MIN_PESSOAS_IDENTIFICACAO).sort((a, b) => b[1].autores.size - a[1].autores.size).slice(0, 3);
  const faltas: string[] = grupos.length
    ? []
    : [`Regra "tema que gera identificação": nenhum tema teve elogio ou relato pessoal de ${MIN_PESSOAS_IDENTIFICACAO} pessoas diferentes (posts sem tema não entram).`];
  const ideias = grupos.map(([tema, g], i): Ideia => {
    const relatos = g.itens.filter((x) => x.tipo === "relato").length;
    // Relato primeiro nos exemplos: mostra melhor por que o tema toca as pessoas.
    const exemplos = [...g.itens].sort((a, b) => (a.tipo === b.tipo ? b.text.length - a.text.length : a.tipo === "relato" ? -1 : 1)).slice(0, 3).map((x) => cortarOriginal(x.text));
    const porque = `${g.autores.size} pessoas diferentes se identificaram nos posts sobre "${tema}" (${relatos} relato(s) pessoal(is) e ${g.itens.length - relatos} elogio(s)).`;
    return {
      id: `identificacao-${i}`,
      regra: "identificacao",
      titulo: `${tema}: a história de quem passa por isso`,
      tema,
      formato: "Reels",
      objetivo: "alcance",
      confianca: g.autores.size >= 10 ? "alta" : g.autores.size >= 5 ? "media" : "baixa",
      motivoConfianca: `${g.autores.size} pessoas diferentes (5+ = média, 10+ = alta)`,
      evidencia: porque,
      porQueTestar: "Quando o público se reconhece num assunto, o conteúdo é compartilhado e traz gente nova parecida com quem já segue. É conteúdo de topo de funil (C1).",
      gancho: `Se você já passou por isso com ${tema.toLowerCase()}, saiba que não é só com você.`,
      roteiro: [
        "Abrir com uma cena comum a quem vive esse problema (sem expor ninguém).",
        "Mostrar que é frequente e por que acontece, em palavras simples.",
        "Dizer o que costuma ajudar e quando vale procurar avaliação, sem prometer resultado.",
        "Fechar convidando a mandar para alguém que vai se identificar.",
      ],
      cta: "Mande para alguém que vai se identificar.",
      avisoSeguranca: AVISO_GERAL,
      comentarioIds: g.itens.map((x) => x.id),
      exemplos,
      pessoas: g.autores.size,
      funil: FUNIL_ROTULO.C1,
      estagio: ESTAGIO_ROTULO.percepcao,
      acao: `Reels: ${tema}, a história de quem passa por isso.`,
      porque,
    };
  });
  return { ideias, faltas };
}
