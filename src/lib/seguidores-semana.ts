// Seguidores por semana e posts impulsionados (orgânico × pago). Lógica pura (teste: scripts/test-seguidores-semana.ts).
//
// Seguidores: por semana (segunda a domingo), novos seguidores e deixaram de seguir (a Meta só manda
// "deixaram de seguir" dos últimos ~28 dias; antes disso fica "sem dado", nunca zero) e o saldo pela
// contagem total (último dia da semana menos último dia da semana anterior), junto com o gasto em
// impulsionamento na mesma semana, para ver se as semanas de mais verba trazem mais seguidores.
//
// Posts impulsionados: campanhas que a Meta cria ao impulsionar um post se chamam "Post do Instagram: <início
// da legenda>..." ou "Publicação do Instagram: ...". O post é achado pelo início da legenda; quando vários
// posts começam igual, vale o publicado mais perto ANTES do primeiro gasto da campanha.

export interface DiaSeguidores {
  date: string;
  followers_count: number | null;
  new_followers: number | null;
  unfollowers: number | null;
}

export interface SemanaSeguidores {
  semana: string; // segunda-feira
  dias: number;
  novos: number | null;
  perderam: number | null; // null: a Meta não informou nessa semana
  saldo: number | null; // pela contagem total
  gastoImpulsionamento: number;
  completa: boolean; // 7 dias de dado
}

export function inicioDaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function seguidoresPorSemana(dias: DiaSeguidores[], gastoPorDia: Map<string, number> = new Map()): SemanaSeguidores[] {
  const porSemana = new Map<string, DiaSeguidores[]>();
  for (const d of [...dias].sort((a, b) => a.date.localeCompare(b.date))) {
    const s = inicioDaSemana(d.date);
    const l = porSemana.get(s) ?? [];
    l.push(d);
    porSemana.set(s, l);
  }
  const gastoSemana = new Map<string, number>();
  for (const [dia, v] of gastoPorDia) gastoSemana.set(inicioDaSemana(dia), (gastoSemana.get(inicioDaSemana(dia)) ?? 0) + v);
  const semanas = [...porSemana.keys()].sort();
  let ultimoTotalAnterior: number | null = null;
  return semanas.map((s) => {
    const l = porSemana.get(s)!;
    const soma = (k: "new_followers" | "unfollowers") => {
      const v = l.map((d) => d[k]).filter((x): x is number => x !== null && x !== undefined);
      return v.length ? v.reduce((a, b) => a + Number(b), 0) : null;
    };
    const totais = l.map((d) => d.followers_count).filter((x): x is number => x !== null && x !== undefined);
    const ultimo = totais.length ? Number(totais[totais.length - 1]) : null;
    const saldo = ultimo !== null && ultimoTotalAnterior !== null ? ultimo - ultimoTotalAnterior : null;
    if (ultimo !== null) ultimoTotalAnterior = ultimo;
    return {
      semana: s,
      dias: l.length,
      novos: soma("new_followers"),
      perderam: soma("unfollowers"),
      saldo,
      gastoImpulsionamento: Math.round((gastoSemana.get(s) ?? 0) * 100) / 100,
      completa: l.length >= 7,
    };
  });
}

// ---------------------------------------------------------------- posts impulsionados

const RE_IMPULSIONADO = /^(Post|Publica[cç][aã]o) do Instagram:\s*/i;

export function ehImpulsionamento(nomeCampanha: string | null | undefined): boolean {
  return !!nomeCampanha && RE_IMPULSIONADO.test(nomeCampanha);
}

const normalizar = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

export function prefixoDaCampanha(nome: string): string {
  return normalizar(nome.replace(RE_IMPULSIONADO, "").replace(/(\.\.\.|…)\s*$/, ""));
}

export interface PostIg {
  id: string;
  caption: string | null;
  posted_at: string;
  permalink?: string | null;
  thumbnail_url?: string | null;
  reach: number | null;
  views?: number | null;
  saved?: number | null;
  engagement?: number | null;
}

export interface LinhaGasto {
  date: string;
  campaign_id: string;
  spend: number | null;
  impressions: number | null;
  link_clicks: number | null;
  clicks?: number | null;
}

export interface Impulsionado {
  campaign_id: string;
  campanha: string;
  post: PostIg | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  primeiroDia: string | null;
  ultimoDia: string | null;
  alcanceOrganico: number | null; // alcance do post no Instagram
  custoPorMilImpressoes: number | null;
}

export function postsImpulsionados(campanhas: { campaign_id: string; name: string | null }[], linhas: LinhaGasto[], posts: PostIg[]): Impulsionado[] {
  const agreg = new Map<string, { gasto: number; imp: number; cliques: number; ini: string | null; fim: string | null }>();
  for (const l of linhas) {
    const a = agreg.get(l.campaign_id) ?? { gasto: 0, imp: 0, cliques: 0, ini: null, fim: null };
    const g = Number(l.spend) || 0;
    a.gasto += g;
    a.imp += Number(l.impressions) || 0;
    a.cliques += Number(l.link_clicks ?? l.clicks) || 0;
    if (g > 0) {
      if (!a.ini || l.date < a.ini) a.ini = l.date;
      if (!a.fim || l.date > a.fim) a.fim = l.date;
    }
    agreg.set(l.campaign_id, a);
  }
  const postsN = posts.filter((p) => p.caption).map((p) => ({ p, cap: normalizar(p.caption!) }));
  const out: Impulsionado[] = [];
  for (const c of campanhas) {
    if (!ehImpulsionamento(c.name)) continue;
    const a = agreg.get(c.campaign_id);
    if (!a || a.gasto <= 0) continue;
    const pref = prefixoDaCampanha(c.name!);
    const candidatos = pref.length >= 6 ? postsN.filter((x) => x.cap.startsWith(pref)).map((x) => x.p) : [];
    const ate = a.ini ?? "9999-12-31";
    const antes = candidatos.filter((p) => p.posted_at.slice(0, 10) <= ate).sort((x, y) => y.posted_at.localeCompare(x.posted_at));
    const post = antes[0] ?? candidatos.sort((x, y) => y.posted_at.localeCompare(x.posted_at))[0] ?? null;
    out.push({
      campaign_id: c.campaign_id,
      campanha: c.name!,
      post,
      gasto: Math.round(a.gasto * 100) / 100,
      impressoes: a.imp,
      cliques: a.cliques,
      primeiroDia: a.ini,
      ultimoDia: a.fim,
      alcanceOrganico: post?.reach ?? null,
      custoPorMilImpressoes: a.imp > 0 ? (a.gasto / a.imp) * 1000 : null,
    });
  }
  return out.sort((x, y) => y.gasto - x.gasto);
}
