// Lógica pura das páginas Conteúdo, Ideias e Relatório do Hub.
// Sem React e sem acesso ao banco: recebe linhas já lidas e devolve resultado
// determinístico (sem IA). Isso permite testar com dado real via `npx tsx`.
import { computeDuvidasFrequentes, fmtFormatKey, median } from "@/lib/report-metrics";

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

export function analyzeFollowers(
  metrics: { date: string; followers_count: number | null }[],
  start: string,
  end: string,
  today: string = msToIso(Date.now()),
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
    const projected = Math.round(slope * (xLast + PROJECAO_HORIZONTE) + intercept);
    const target = msToIso(isoToMs(lastDay) + PROJECAO_HORIZONTE * DAY_MS);
    const line = [0, PROJECAO_HORIZONTE].map((h) => ({
      date: msToIso(isoToMs(lastDay) + h * DAY_MS),
      followers: Math.round(slope * (xLast + h) + intercept),
    }));
    void t0;
    projection = {
      ok: true,
      slopePerDay: slope,
      atEnd: Math.round(slope * xLast + intercept),
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

export const MIN_POSTS_FORMATO = 3;
export const MIN_POSTS_REGRAS = 8;
export const MIN_PERGUNTAS = 3;
// Tema só entra se a mediana de salvos for pelo menos 25% acima da da conta (evita ruído de 1 ou 2 salvos).
export const MARGEM_TEMA = 1.25;

export function analyzeFormatsAndTemas(posts: any[]) {
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
export interface Ideia {
  id: string;
  regra: "pergunta" | "tema" | "formato";
  tema: string;
  funil: string;
  estagio: string;
  formato: string;
  acao: string;
  porque: string;
}

export interface IdeiasResult {
  ideias: Ideia[];
  faltas: string[]; // o que falta para cada regra sem dado
  totalPosts: number;
  totalPerguntas: number;
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


// ---------- ideias a partir de dúvidas: tipo da pergunta, gancho e post parecido ----------
const DIACRITICOS_RE = new RegExp("[̀-ͯ]", "g");
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS_RE, "");

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

function tokens(s: string): Set<string> {
  return new Set(
    semAcento(s)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

// Post da própria conta que mais se parece com a pergunta (palavras em comum), para a ideia trazer evidência.
function postParecido(texto: string, posts: any[]): { legenda: string; salvos: number } | null {
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

export function buildIdeias(
  posts: any[],
  perguntas: { id: string; text: string; like_count: number | null; instagram_post_id?: string }[],
): IdeiasResult {
  const ideias: Ideia[] = [];
  const faltas: string[] = [];

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
      const parecido = postParecido(texto, posts);
      const formato = tipo === "geral" && melhorDaConta ? melhorDaConta.label : modelo.formato;
      const evidencia = parecido
        ? ` Um post parecido, "${parecido.legenda.length > 60 ? parecido.legenda.slice(0, 57) + "..." : parecido.legenda}", teve ${fmtN(parecido.salvos)} salvamentos.`
        : "";
      ideias.push({
        id: `pergunta-${i}`,
        regra: "pergunta",
        tema: texto.length > 120 ? texto.slice(0, 117) + "..." : texto,
        funil: FUNIL_ROTULO.C1,
        estagio: ESTAGIO_ROTULO.confianca,
        formato,
        acao: `${modelo.acao} Gancho possível: "${curto}"`,
        porque: `${c.count} pessoas perguntaram algo parecido nos comentários do período (ex.: "${curto}").${evidencia}`,
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
        .filter(([, ps]) => ps.length >= 2)
        .map(([tema, ps]) => ({ tema, ps, med: median(ps.filter((p) => p.saved != null).map((p) => Number(p.saved))) }))
        .filter((t) => t.med > 0 && t.med >= baseSaved * MARGEM_TEMA)
        .sort((a, b) => b.med - a.med)
        .slice(0, 4);
      if (achados.length === 0) {
        faltas.push('Regra "tema com salvos acima da média": nenhum tema com 2+ posts tem mediana de salvos 25% acima da mediana da conta no período.');
      }
      for (const [i, t] of achados.entries()) {
        const fm = moda(t.ps.map((p) => p.format));
        ideias.push({
          id: `tema-${i}`,
          regra: "tema",
          tema: t.tema,
          funil: FUNIL_ROTULO[moda(t.ps.map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
          estagio: ESTAGIO_ROTULO[moda(t.ps.map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
          formato: fm ? fmtFormatKey(fm) : "A definir",
          acao: `Variação do tema "${t.tema}" com outro ângulo, caso ou pergunta.`,
          porque: `${t.ps.length} posts sobre "${t.tema}" tiveram mediana de ${fmtD1(t.med)} salvos, contra ${fmtD1(baseSaved)} da conta no período.`,
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
    } else {
      const best = fmts[0];
      const overall = median(posts.filter((p) => p.reach != null).map((p) => Number(p.reach)));
      const doFormato = posts.filter((p) => p.format === best.key && p.tema);
      const melhorTema = moda(
        [...doFormato].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 3).map((p) => p.tema),
      );
      ideias.push({
        id: "formato-0",
        regra: "formato",
        tema: melhorTema ?? "Tema livre",
        funil: FUNIL_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.funnel_stage)) ?? ""] ?? "Não classificado",
        estagio: ESTAGIO_ROTULO[moda(posts.filter((p) => p.format === best.key).map((p) => p.methodology_stage)) ?? ""] ?? "Não classificado",
        formato: best.label,
        acao: `Novo conteúdo em ${best.label}${melhorTema ? ` sobre "${melhorTema}"` : ""}.`,
        porque: `${best.label} tem o maior alcance por post: mediana de ${fmtN(best.reachMedian)} em ${best.count} posts, contra ${fmtN(overall)} da conta toda.`,
      });
    }
  }
  return { ideias, faltas, totalPosts: posts.length, totalPerguntas: perguntas.length };
}

export function ideiaParaTexto(i: Ideia): string {
  return [
    `Ideia: ${i.tema}`,
    `Formato: ${i.formato}`,
    `Funil: ${i.funil}`,
    `Estágio: ${i.estagio}`,
    `O que fazer: ${i.acao}`,
    `Por quê: ${i.porque}`,
  ].join("\n");
}

// ---------- plano de 7 dias a partir das ideias ----------
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Distribui as ideias da lista em dias de publicação (segunda, terça, quarta, quinta e sexta), com os
// outros dias para responder comentários e mensagens. Só usa o que a lista já traz: sem ideia nova,
// sem número inventado. Ideias vindas de dúvidas de pacientes vêm primeiro.
export function montarPlano7Dias(ideias: Ideia[], horaSugerida?: number | null): string {
  if (ideias.length === 0) return "";
  const ordem = [...ideias].sort((a, b) => Number(b.regra === "pergunta") - Number(a.regra === "pergunta"));
  const dias = [0, 1, 2, 3, 4];
  const linhas = DIAS_SEMANA.map((dia, i) => {
    const k = dias.indexOf(i);
    if (k < 0) return `${dia}: sem publicação nova. Responder comentários e mensagens que chegaram na semana.`;
    const ideia = ordem[k];
    if (!ideia) return `${dia}: espaço livre. Reaproveitar o post de melhor resultado do período em outro formato.`;
    return `${dia}${horaSugerida != null ? `, por volta das ${horaSugerida}h` : ""}: ${ideia.formato}. ${ideia.acao}`;
  });
  return ["Plano de conteúdo da semana", ...linhas].join("\n");
}
