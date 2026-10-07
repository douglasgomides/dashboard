// Horário dos posts do próprio cliente: quando o que ele publicou rendeu mais. Somado ao mapa de seguidores online
// (Meta), fecha a recomendação de quando publicar. Mediana, não média, e só com amostra mínima.
import { brazilWeekdayAndHour, median } from "@/lib/report-metrics";
import { DIAS_SEMANA } from "@/lib/audiencia";

export interface SlotDePost {
  dia: number;
  hora: number;
  posts: number;
  mediana: number;
}

export const MIN_POSTS_POR_HORA = 3;

// Melhor hora do dia por mediana de engajamento (qualquer dia da semana), com pelo menos MIN_POSTS_POR_HORA posts.
export function horasDosPosts(posts: any[]): { hora: number; posts: number; mediana: number }[] {
  const porHora = new Map<number, number[]>();
  for (const p of posts) {
    if (!p.posted_at || p.engagement == null) continue;
    const { hour } = brazilWeekdayAndHour(p.posted_at);
    porHora.set(hour, [...(porHora.get(hour) ?? []), Number(p.engagement)]);
  }
  return [...porHora.entries()]
    .filter(([, v]) => v.length >= MIN_POSTS_POR_HORA)
    .map(([hora, v]) => ({ hora, posts: v.length, mediana: median(v) }))
    .sort((a, b) => b.mediana - a.mediana);
}

export function diasDosPosts(posts: any[]): { dia: number; posts: number; mediana: number }[] {
  const porDia = new Map<number, number[]>();
  for (const p of posts) {
    if (!p.posted_at || p.engagement == null) continue;
    const { weekday } = brazilWeekdayAndHour(p.posted_at);
    porDia.set(weekday, [...(porDia.get(weekday) ?? []), Number(p.engagement)]);
  }
  return [...porDia.entries()]
    .filter(([, v]) => v.length >= MIN_POSTS_POR_HORA)
    .map(([dia, v]) => ({ dia, posts: v.length, mediana: median(v) }))
    .sort((a, b) => b.mediana - a.mediana);
}

// Texto único que cruza as duas fontes. Sem inventar: só diz o que cada fonte sustenta.
export function recomendacaoDeHorario(opts: { janelas?: { dia: number; hora: number; online: number }[]; horasPosts: { hora: number; posts: number; mediana: number }[]; diasPosts: { dia: number; posts: number; mediana: number }[] }): string[] {
  const out: string[] = [];
  const { janelas, horasPosts, diasPosts } = opts;
  if (janelas && janelas.length) {
    const j = janelas[0];
    out.push(`Os seguidores ficam mais online ${DIAS_SEMANA[j.dia].toLowerCase()} às ${j.hora}h (cerca de ${j.online.toLocaleString("pt-BR")} online ao mesmo tempo).`);
  }
  if (horasPosts.length) {
    const h = horasPosts[0];
    out.push(`Seus posts renderam mais quando publicados às ${h.hora}h: engajamento mediano de ${Math.round(h.mediana).toLocaleString("pt-BR")}, em ${h.posts} posts.`);
  }
  if (diasPosts.length) {
    const d = diasPosts[0];
    out.push(`O dia com melhor engajamento mediano nos seus posts foi ${DIAS_SEMANA[d.dia].toLowerCase()} (${d.posts} posts).`);
  }
  if (janelas && janelas.length && horasPosts.length) {
    const horaOnline = janelas[0].hora;
    const horaPost = horasPosts[0].hora;
    if (Math.abs(horaOnline - horaPost) >= 3) {
      out.push(`O horário em que os posts renderam mais (${horaPost}h) é diferente do pico de seguidores online (${horaOnline}h). Vale testar publicar perto de ${horaOnline}h e comparar com os resultados atuais.`);
    }
  }
  return out;
}
