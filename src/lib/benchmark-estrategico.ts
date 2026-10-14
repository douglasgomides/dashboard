// Benchmark estratégico entre clientes (admin): o cliente contra a mediana e o top 25% de um grupo
// comparável (especialidade, tamanho de conta), por formato e por objetivo do conteúdo.
//
// Regras:
// - Cada cliente entra com a PRÓPRIA mediana (mínimo de posts), e o grupo usa medianas dessas medianas.
//   Assim uma conta com milhares de posts não decide sozinha.
// - Comparação em taxas (engajamento e salvamento sobre o alcance, alcance sobre seguidores) quando o
//   tamanho de conta varia; número absoluto aparece, mas não decide o veredito.
// - Com menos de MIN_CLIENTES no grupo, a conclusão é marcada como limitada em vez de inventada.

export type Formato = "reels" | "carrossel" | "estatico" | "stories";
export type Objetivo = "percepcao" | "confianca" | "venda" | "multiplicacao";
export type Metrica = "alcance" | "alcanceSeg" | "salvamentos" | "compartilhamentos" | "comentarios" | "engajamento" | "taxaSalvamento";

export interface PostBench {
  client_id: string;
  formato: Formato | string | null;
  objetivo: string | null;
  tema?: string | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  comments: number | null;
  likes: number | null;
}

export interface ClienteBench {
  id: string;
  nome: string;
  especialidade: string | null;
  seguidores: number | null;
}

export const MIN_POSTS = 3;
export const MIN_CLIENTES = 3;

export const ROTULO_FORMATO: Record<Formato, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Estático", stories: "Stories" };
export const ROTULO_OBJETIVO: Record<Objetivo, string> = { percepcao: "Percepção", confianca: "Confiança", venda: "Venda", multiplicacao: "Autoridade/multiplicação" };
export const ROTULO_METRICA: Record<Metrica, string> = {
  alcance: "Alcance",
  alcanceSeg: "Alcance ÷ seguidores",
  salvamentos: "Salvamentos",
  compartilhamentos: "Compartilhamentos",
  comentarios: "Comentários",
  engajamento: "Taxa de engajamento",
  taxaSalvamento: "Taxa de salvamento",
};
// Métricas que decidem o veredito (não dependem do tamanho da conta).
export const METRICAS_TAXA: Metrica[] = ["alcanceSeg", "engajamento", "taxaSalvamento"];
export const METRICAS: Metrica[] = ["alcance", "alcanceSeg", "salvamentos", "compartilhamentos", "comentarios", "engajamento", "taxaSalvamento"];

// Especialidade é texto livre no cadastro ("Ginecologista — Menopausa…"): agrupa pela área.
export function grupoEspecialidade(s: string | null | undefined): string {
  const t = (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/gineco|mulher|endometri|menopausa|obstet/.test(t)) return "Ginecologia";
  if (/dermato|pele|capilar/.test(t)) return "Dermatologia";
  if (/oftalm|glaucoma|catarata|retina/.test(t)) return "Oftalmologia";
  if (/nutr|endocrin/.test(t)) return "Nutrologia/Endocrinologia";
  if (/cardio/.test(t)) return "Cardiologia";
  if (/ortop/.test(t)) return "Ortopedia";
  if (/pediat/.test(t)) return "Pediatria";
  if (/psiq/.test(t)) return "Psiquiatria";
  if (/pl[aá]stic/.test(t)) return "Cirurgia plástica";
  return "Outras";
}

// Faixas de tamanho iguais às do benchmark de mercado de Reels (Socialinsider).
export function faixaTamanho(seg: number | null | undefined): string {
  if (seg == null || seg <= 0) return "Sem dado";
  if (seg < 5000) return "Até 5 mil";
  if (seg < 10000) return "5 a 10 mil";
  if (seg < 50000) return "10 a 50 mil";
  if (seg < 100000) return "50 a 100 mil";
  return "100 mil+";
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// Percentil com interpolação linear (p em 0..1).
export function percentil(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const i = (o.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return o[lo] + (o[hi] - o[lo]) * (i - lo);
}

type Valores = Record<Metrica, number | null>;

/** Medianas de um cliente num recorte (ou null se tem menos de MIN_POSTS posts com alcance). */
export function medianasDoCliente(posts: PostBench[], seguidores: number | null): (Valores & { posts: number }) | null {
  const ps = posts.filter((p) => p.reach != null && Number(p.reach) > 0);
  if (ps.length < MIN_POSTS) return null;
  const n = (v: number | null) => Number(v ?? 0);
  const inter = (p: PostBench) => n(p.likes) + n(p.comments) + n(p.saved) + n(p.shares);
  const temSalvo = ps.some((p) => p.saved != null);
  return {
    posts: ps.length,
    alcance: mediana(ps.map((p) => n(p.reach))),
    alcanceSeg: seguidores && seguidores > 0 ? mediana(ps.map((p) => n(p.reach) / seguidores)) : null,
    salvamentos: temSalvo ? mediana(ps.map((p) => n(p.saved))) : null,
    compartilhamentos: mediana(ps.map((p) => n(p.shares))),
    comentarios: mediana(ps.map((p) => n(p.comments))),
    engajamento: mediana(ps.map((p) => inter(p) / n(p.reach))),
    taxaSalvamento: temSalvo ? mediana(ps.map((p) => n(p.saved) / n(p.reach))) : null,
  };
}

export interface Recorte {
  formato?: string;
  objetivo?: string;
}

function noRecorte(p: PostBench, r: Recorte): boolean {
  return (!r.formato || p.formato === r.formato) && (!r.objetivo || p.objetivo === r.objetivo);
}

export type Posicao = "top" | "acima" | "abaixo" | "sem_dado";

export interface LinhaComparacao {
  metrica: Metrica;
  cliente: number | null;
  medianaGrupo: number | null;
  top25: number | null;
  posicao: Posicao;
}

export interface Comparacao {
  recorte: Recorte;
  postsCliente: number;
  clientesNoGrupo: number;
  limitado: boolean; // grupo pequeno: conclusão com cautela
  linhas: LinhaComparacao[];
  // Saldo nas métricas de taxa: +1 por métrica acima da mediana, +2 no top 25%, -1 abaixo.
  saldo: number;
}

function posicao(v: number | null, med: number | null, p75: number | null): Posicao {
  if (v == null || med == null) return "sem_dado";
  if (p75 != null && v >= p75 && v > med) return "top";
  return v >= med ? "acima" : "abaixo";
}

/** Compara um cliente com o grupo (os outros clientes) num recorte. Null se o cliente não tem posts suficientes. */
export function comparar(posts: PostBench[], clientes: ClienteBench[], alvo: string, grupo: string[], recorte: Recorte): Comparacao | null {
  const segDe = new Map(clientes.map((c) => [c.id, c.seguidores]));
  const doAlvo = medianasDoCliente(posts.filter((p) => p.client_id === alvo && noRecorte(p, recorte)), segDe.get(alvo) ?? null);
  if (!doAlvo) return null;
  const outros = grupo
    .filter((id) => id !== alvo)
    .map((id) => medianasDoCliente(posts.filter((p) => p.client_id === id && noRecorte(p, recorte)), segDe.get(id) ?? null))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const linhas = METRICAS.map((m) => {
    const vals = outros.map((o) => o[m]).filter((x): x is number => x != null);
    const med = mediana(vals);
    const p75 = vals.length >= MIN_CLIENTES ? percentil(vals, 0.75) : null;
    return { metrica: m, cliente: doAlvo[m], medianaGrupo: med, top25: p75, posicao: posicao(doAlvo[m], med, p75) };
  });
  const saldo = linhas.filter((l) => METRICAS_TAXA.includes(l.metrica)).reduce((s, l) => s + (l.posicao === "top" ? 2 : l.posicao === "acima" ? 1 : l.posicao === "abaixo" ? -1 : 0), 0);
  return { recorte, postsCliente: doAlvo.posts, clientesNoGrupo: outros.length, limitado: outros.length < MIN_CLIENTES, linhas, saldo };
}

export interface Respostas {
  padrao: { veredito: "acima" | "abaixo" | "na_media" | "sem_dado"; texto: string };
  repetir: string[];
  perdendo: string[];
  oportunidade: string | null;
  temasFortes: { tema: string; posts: number; taxaSalvamento: number }[];
  limitado: boolean;
}

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const rotRecorte = (r: Recorte) => [r.formato ? ROTULO_FORMATO[r.formato as Formato] ?? r.formato : null, r.objetivo ? ROTULO_OBJETIVO[r.objetivo as Objetivo] ?? r.objetivo : null].filter(Boolean).join(" · ") || "Geral";

/** As quatro perguntas do benchmark, respondidas só com o que os dados sustentam. */
export function responder(posts: PostBench[], clientes: ClienteBench[], alvo: string, grupo: string[]): Respostas {
  const geral = comparar(posts, clientes, alvo, grupo, {});
  const formatos = (["reels", "carrossel", "estatico", "stories"] as const).map((f) => comparar(posts, clientes, alvo, grupo, { formato: f })).filter((c): c is Comparacao => !!c && !c.limitado);
  const objetivos = (["percepcao", "confianca", "venda", "multiplicacao"] as const).map((o) => comparar(posts, clientes, alvo, grupo, { objetivo: o })).filter((c): c is Comparacao => !!c && !c.limitado);
  const recortes = [...formatos, ...objetivos];

  let padrao: Respostas["padrao"];
  if (!geral || geral.clientesNoGrupo === 0) padrao = { veredito: "sem_dado", texto: "Sem posts suficientes deste cliente ou do grupo para comparar." };
  else {
    const eng = geral.linhas.find((l) => l.metrica === "engajamento")!;
    const sal = geral.linhas.find((l) => l.metrica === "taxaSalvamento")!;
    const veredito = geral.saldo >= 2 ? "acima" : geral.saldo <= -2 ? "abaixo" : "na_media";
    const partes = [
      eng.cliente != null && eng.medianaGrupo != null ? `engajamento ${pct(eng.cliente)} contra ${pct(eng.medianaGrupo)} do grupo` : null,
      sal.cliente != null && sal.medianaGrupo != null ? `salvamento ${pct(sal.cliente)} contra ${pct(sal.medianaGrupo)}` : null,
    ].filter(Boolean);
    padrao = {
      veredito,
      texto: `${veredito === "acima" ? "Acima do padrão" : veredito === "abaixo" ? "Abaixo do padrão" : "Na média do grupo"}: ${partes.join("; ") || "taxas próximas da mediana"}.${geral.limitado ? ` Grupo pequeno (${geral.clientesNoGrupo} clientes): leia como sinal, não como regra.` : ""}`,
    };
  }

  const repetir = recortes
    .filter((c) => c.saldo >= 2)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 3)
    .map((c) => {
      const top = c.linhas.filter((l) => METRICAS_TAXA.includes(l.metrica) && l.posicao === "top").map((l) => ROTULO_METRICA[l.metrica].toLowerCase());
      return `${rotRecorte(c.recorte)}: ${top.length ? `no top 25% em ${top.join(" e ")}` : "acima do grupo nas taxas"} (${c.postsCliente} posts).`;
    });

  const perdendo = recortes
    .filter((c) => c.saldo <= -2)
    .sort((a, b) => a.saldo - b.saldo || b.postsCliente - a.postsCliente)
    .slice(0, 3)
    .map((c) => {
      const baixo = c.linhas.filter((l) => METRICAS_TAXA.includes(l.metrica) && l.posicao === "abaixo").map((l) => `${ROTULO_METRICA[l.metrica].toLowerCase()} ${l.cliente != null ? pct(l.cliente) : "—"} (grupo ${l.medianaGrupo != null ? pct(l.medianaGrupo) : "—"})`);
      return `${rotRecorte(c.recorte)}: abaixo em ${baixo.join(", ")} em ${c.postsCliente} posts.`;
    });

  // Oportunidade: formato em que o GRUPO salva mais (taxa de salvamento) e o cliente posta pouco ou fica abaixo.
  const postsDoAlvo = posts.filter((p) => p.client_id === alvo);
  let oportunidade: string | null = null;
  const candidatos = (["reels", "carrossel", "estatico"] as const)
    .map((f) => {
      const c = comparar(posts, clientes, alvo, grupo, { formato: f });
      const segDe = new Map(clientes.map((x) => [x.id, x.seguidores]));
      const outros = grupo.filter((id) => id !== alvo).map((id) => medianasDoCliente(posts.filter((p) => p.client_id === id && p.formato === f), segDe.get(id) ?? null)).filter(Boolean) as Valores[];
      const medGrupo = mediana(outros.map((o) => o.taxaSalvamento).filter((x): x is number => x != null));
      const usados = postsDoAlvo.filter((p) => p.formato === f).length;
      const sal = c?.linhas.find((l) => l.metrica === "taxaSalvamento");
      return { f, medGrupo, usados, abaixo: sal?.posicao === "abaixo", clientes: outros.length };
    })
    .filter((x) => x.medGrupo != null && x.clientes >= MIN_CLIENTES && (x.usados < MIN_POSTS || x.abaixo))
    .sort((a, b) => (b.medGrupo ?? 0) - (a.medGrupo ?? 0));
  if (candidatos[0]) {
    const c = candidatos[0];
    oportunidade = c.usados < MIN_POSTS
      ? `${ROTULO_FORMATO[c.f]}: no grupo é o formato que mais gera salvamento (${pct(c.medGrupo!)}), e este cliente quase não usa (${c.usados} posts no período).`
      : `${ROTULO_FORMATO[c.f]}: o grupo salva ${pct(c.medGrupo!)} e este cliente fica abaixo. Revisar gancho e utilidade dos posts nesse formato.`;
  }

  // Temas do próprio cliente com taxa de salvamento acima da mediana dele (o que repetir em pauta).
  const porTema = new Map<string, PostBench[]>();
  for (const p of postsDoAlvo) if (p.tema && p.reach && p.saved != null) porTema.set(p.tema, [...(porTema.get(p.tema) ?? []), p]);
  const medCliente = mediana(postsDoAlvo.filter((p) => p.reach && p.saved != null).map((p) => Number(p.saved) / Number(p.reach)));
  const temasFortes = [...porTema.entries()]
    .filter(([, ps]) => ps.length >= 2)
    .map(([tema, ps]) => ({ tema, posts: ps.length, taxaSalvamento: mediana(ps.map((p) => Number(p.saved) / Number(p.reach))) ?? 0 }))
    .filter((t) => medCliente != null && t.taxaSalvamento > medCliente * 1.2)
    .sort((a, b) => b.taxaSalvamento - a.taxaSalvamento)
    .slice(0, 3);

  return { padrao, repetir, perdendo, oportunidade, temasFortes, limitado: !geral || geral.limitado };
}

/** Ids do grupo de comparação: mesma especialidade e/ou mesma faixa de tamanho ("" = todos). */
export function montarGrupo(clientes: ClienteBench[], f: { especialidade?: string; tamanho?: string }): string[] {
  return clientes
    .filter((c) => (!f.especialidade || grupoEspecialidade(c.especialidade) === f.especialidade) && (!f.tamanho || faixaTamanho(c.seguidores) === f.tamanho))
    .map((c) => c.id);
}

export function fmtMetrica(m: Metrica, v: number | null): string {
  if (v == null) return "—";
  if (m === "alcanceSeg" || m === "engajamento" || m === "taxaSalvamento") return pct(v);
  return Math.round(v).toLocaleString("pt-BR");
}
