// Cruzamento leads (CRM) x engajamento (Instagram) x anúncio (Meta).
//
// A pergunta que nenhuma aba respondia: o lead que chega no CRM acompanha o
// conteúdo orgânico ou a verba de anúncio? E quais posts vieram antes dos
// picos de lead? Sem identificar a pessoa (isso é a Jornada), a única leitura
// honesta é temporal: comparar as séries dia a dia e os 2 dias depois de cada
// post. É correlação, não causa — e o texto diz isso.
//
// Lógica pura, testável com `npx tsx scripts/test-cruzamento.ts`.
import { median } from "@/lib/report-metrics";
import { confiancaPorAmostra, type Insight, type Limitacao } from "@/lib/insight";

export interface EntradaCruzamento {
  start: string;
  end: string;
  leadsPorDia: { dia: string; total: number }[];
  diario: { date: string; reach?: number | null; total_interactions?: number | null }[];
  adsPorDia?: { dia: string; gasto: number | null; conversas?: number | null }[];
  posts: { id?: string; caption?: string | null; posted_at?: string | null; engagement?: number | null; reach?: number | null; permalink?: string | null; format?: string | null }[];
}

export interface DiaLead {
  dia: string;
  posts: EntradaCruzamento["posts"];
  leads48h: number;
  base48h: number;
  vezes: number; // leads nas 48h ÷ o normal de 48h
  comAnuncioForte: boolean;
}

export interface Cruzamento {
  dias: number;
  leadsTotal: number;
  corrOrganico: number | null; // Spearman, janelas de 3 dias
  corrAnuncio: number | null;
  diasDePico: DiaLead[]; // dias com post seguidos de pico de lead
  postsQueMaisEngajaram: EntradaCruzamento["posts"];
  sobreposicao: number; // quantos dos 5 posts que mais engajaram caíram num dia de pico
  postsPorDia: number;
  insights: Insight[];
  limitacoes: Limitacao[];
}

export const MIN_DIAS_CORRELACAO = 21;
export const MIN_LEADS = 20;
export const PICO = 1.5;

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").getTime();
const brDia = (ts: string) => new Date(new Date(ts).getTime() - 3 * 3600000).toISOString().slice(0, 10); // posted_at UTC → dia em Brasília
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const legenda = (p: { caption?: string | null }) => {
  const t = String(p.caption ?? "").split("\n")[0].trim();
  return t ? `“${t.slice(0, 50)}${t.length > 50 ? "…" : ""}”` : "um post";
};

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length).fill(0);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const m = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = m;
    i = j + 1;
  }
  return r;
}
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

const forca = (r: number) => (Math.abs(r) >= 0.5 ? "forte" : Math.abs(r) >= 0.3 ? "moderada" : "fraca");

export function cruzar(e: EntradaCruzamento): Cruzamento {
  const limitacoes: Limitacao[] = [];
  const insights: Insight[] = [];
  const dias: string[] = [];
  for (let t = ms(e.start); t <= ms(e.end); t += DAY) dias.push(iso(t));

  const leads = new Map(e.leadsPorDia.map((l) => [l.dia.slice(0, 10), Number(l.total) || 0]));
  const org = new Map(e.diario.filter((d) => d.total_interactions != null).map((d) => [d.date, Number(d.total_interactions) || 0]));
  const ads = new Map((e.adsPorDia ?? []).map((a) => [a.dia.slice(0, 10), Number(a.gasto) || 0]));
  const leadsTotal = dias.reduce((s, d) => s + (leads.get(d) ?? 0), 0);

  const vazio: Cruzamento = { dias: dias.length, leadsTotal, corrOrganico: null, corrAnuncio: null, diasDePico: [], postsQueMaisEngajaram: [], sobreposicao: 0, postsPorDia: 0, insights, limitacoes };
  if (e.leadsPorDia.length === 0) {
    limitacoes.push({ id: "cruz-sem-crm", area: "comercial", texto: "Sem leads do CRM neste período: não dá para saber se o conteúdo ou o anúncio está trazendo paciente.", resolve: "equipe_hub", comoResolver: "Conectar o CRM ou o WhatsApp da clínica ao painel." });
    return vazio;
  }
  if (leadsTotal < MIN_LEADS) {
    limitacoes.push({ id: "cruz-poucos-leads", area: "comercial", texto: `Só ${leadsTotal} leads no período: pouco para cruzar com o Instagram (precisa de ${MIN_LEADS}+).`, resolve: "equipe_hub", comoResolver: "Escolher um período maior." });
    return vazio;
  }

  // 1. Correlação em janelas de 3 dias (o lead costuma vir 0–2 dias depois do estímulo).
  const comAmbos = dias.filter((d) => org.has(d));
  // Lead cai no fim de semana (clínica fechada), e o engajamento também oscila
  // por dia da semana. Sem tirar esse efeito, quaisquer duas séries parecem
  // ligadas. Cada valor é dividido pelo típico do mesmo dia da semana.
  const semSazonal = (vals: Map<string, number>, ds: string[]) => {
    const porDow = new Map<number, number[]>();
    for (const d of ds) {
      const w = new Date(ms(d)).getUTCDay();
      porDow.set(w, [...(porDow.get(w) ?? []), vals.get(d) ?? 0]);
    }
    const out = new Map<string, number>();
    for (const d of ds) {
      const m = median(porDow.get(new Date(ms(d)).getUTCDay()) ?? []);
      out.set(d, m > 0 ? (vals.get(d) ?? 0) / m : 0);
    }
    return out;
  };
  const janela = (m: Map<string, number>, d: string) => [0, 1, 2].reduce((s, k) => s + (m.get(iso(ms(d) - k * DAY)) ?? 0), 0);
  let corrOrganico: number | null = null;
  let corrAnuncio: number | null = null;
  if (comAmbos.length >= MIN_DIAS_CORRELACAO) {
    const Ld = semSazonal(leads, dias);
    const Od = semSazonal(org, dias);
    const Ad = semSazonal(ads, dias);
    const L = comAmbos.map((d) => Ld.get(d) ?? 0);
    corrOrganico = spearman(comAmbos.map((d) => janela(Od, d)), L);
    const gastos = comAmbos.map((d) => ads.get(d) ?? 0);
    const gastoMedio = gastos.reduce((s, x) => s + x, 0) / gastos.length;
    const dp = Math.sqrt(gastos.reduce((s, x) => s + (x - gastoMedio) ** 2, 0) / gastos.length);
    // Verba quase igual todo dia não tem variação para comparar: a correlação
    // sairia perto de zero e pareceria "anúncio não traz lead", o que é falso.
    if (gastoMedio > 0 && dp / gastoMedio >= 0.25) corrAnuncio = spearman(comAmbos.map((d) => janela(Ad, d)), L);
    else if (gastoMedio > 0)
      limitacoes.push({ id: "cruz-verba-estavel", area: "anuncios", texto: "A verba de anúncio foi quase a mesma todo dia, então não dá para medir dia a dia quanto do lead vem do anúncio.", resolve: "gestor_trafego", comoResolver: "Para medir: usar link ou mensagem de entrada diferente no anúncio, ou marcar a origem 'anúncio' no CRM." });
  } else {
    limitacoes.push({ id: "cruz-poucos-dias", area: "comercial", texto: `Só ${comAmbos.length} dias com dado do Instagram e do CRM juntos: precisa de ${MIN_DIAS_CORRELACAO}+ para ver se um acompanha o outro.`, resolve: "equipe_hub", comoResolver: "O Instagram guarda só ~30 dias por dia; o histórico cresce com a coleta diária." });
  }

  // 2. Dias com post x leads nas 48h seguintes (dia do post + dia seguinte).
  // Por DIA, não por post: quem posta 2–3 vezes por dia não tem como separar o
  // efeito de cada post, e dar o mesmo número a todos enganava.
  const leads48 = (d: string) => (leads.get(d) ?? 0) + (leads.get(iso(ms(d) + DAY)) ?? 0);
  const base = median(dias.slice(0, -1).map(leads48));
  const gastoMed = median([...ads.values()].filter((x) => x > 0));
  const porDia = new Map<string, EntradaCruzamento["posts"]>();
  for (const p of e.posts) {
    if (!p.posted_at) continue;
    const d = brDia(p.posted_at);
    if (d < e.start || d >= e.end) continue; // o último dia não tem o "dia seguinte"
    porDia.set(d, [...(porDia.get(d) ?? []), p]);
  }
  const diasComPost: DiaLead[] = [...porDia.entries()].map(([dia, ps]) => {
    const l = leads48(dia);
    const gasto2 = (ads.get(dia) ?? 0) + (ads.get(iso(ms(dia) + DAY)) ?? 0);
    return { dia, posts: ps, leads48h: l, base48h: base, vezes: base > 0 ? l / base : 0, comAnuncioForte: gastoMed > 0 && gasto2 > gastoMed * 2 * 1.5 };
  });
  const postsPorDia = diasComPost.length ? diasComPost.reduce((s, d) => s + d.posts.length, 0) / diasComPost.length : 0;
  const diasDePico = diasComPost.filter((x) => x.vezes >= PICO && x.leads48h - x.base48h >= 3).sort((a, b) => b.vezes - a.vezes).slice(0, 5);
  const todosPosts = diasComPost.flatMap((d) => d.posts);
  const engajaram = todosPosts.filter((p) => p.engagement != null).sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0)).slice(0, 5);
  const picos = new Set(diasDePico.map((d) => d.dia));
  const sobreposicao = engajaram.filter((p) => picos.has(brDia(p.posted_at!))).length;

  const confCorr = confiancaPorAmostra(comAmbos.length, MIN_DIAS_CORRELACAO, comAmbos.length / dias.length);
  const riscoCorr = "Correlação mostra que as duas coisas sobem e descem juntas, não prova que uma causa a outra. Feriado, campanha de anúncio e sazonalidade mexem nos dois ao mesmo tempo.";

  // Insight A: o lead acompanha o quê?
  if (corrOrganico != null) {
    const temAds = corrAnuncio != null;
    const anuncioPuxa = temAds && corrAnuncio! >= 0.3 && corrAnuncio! >= corrOrganico + 0.15;
    const organicoPuxa = corrOrganico >= 0.3 && (!temAds || corrOrganico >= corrAnuncio! + 0.15);
    const evid = `Em ${comAmbos.length} dias: lead x engajamento orgânico ${corrOrganico.toFixed(2)}${temAds ? `; lead x gasto em anúncio ${corrAnuncio!.toFixed(2)}` : ""} (de -1 a 1; acima de 0,3 já é relação real). ${int(leadsTotal)} leads no período.`;
    if (organicoPuxa) {
      insights.push({
        id: "cruz-organico", area: "resumo", tom: "bom",
        titulo: "Os leads acompanham o engajamento do Instagram.",
        diagnostico: `Nos dias em que o perfil teve mais interação, entraram mais leads nos 2 dias seguintes (relação ${forca(corrOrganico)}). O conteúdo orgânico está trazendo paciente, não só curtida.`,
        evidencia: evid, confianca: confCorr, motivoConfianca: `${comAmbos.length} dias com Instagram e CRM juntos`,
        impacto: "alto", acao: { texto: "Manter a frequência de posts e repetir os assuntos dos posts que vieram antes dos picos de lead (lista abaixo).", rota: "/$clientId/posts", botao: "Ver os posts do período" },
        responsavel: "social_media", risco: riscoCorr,
      });
    } else if (anuncioPuxa) {
      insights.push({
        id: "cruz-anuncio", area: "resumo", tom: "atencao",
        titulo: "Os leads acompanham a verba de anúncio, não o engajamento orgânico.",
        diagnostico: `Quando o anúncio gasta mais, entram mais leads (relação ${forca(corrAnuncio!)}). O engajamento dos posts quase não mexe no número de leads (relação ${forca(corrOrganico)}). Hoje o paciente chega pelo anúncio; o conteúdo está gerando audiência, mas pouco contato.`,
        evidencia: evid, confianca: confCorr, motivoConfianca: `${comAmbos.length} dias com Instagram, anúncio e CRM juntos`,
        impacto: "alto", acao: { texto: "Colocar chamada para o WhatsApp em 1 de cada 3 posts (\"me chama no direct com a palavra X\") e medir se os leads orgânicos sobem em 3 semanas.", rota: "/$clientId/ideias", botao: "Ver ideias com chamada para conversa" },
        responsavel: "social_media", risco: riscoCorr + " Pausar o anúncio derruba os leads: não corte verba com base nesta leitura sozinha.",
      });
    } else {
      insights.push({
        id: "cruz-nenhum", area: "resumo", tom: "atencao",
        titulo: "Os leads não acompanham nem o engajamento nem a verba de anúncio dia a dia.",
        diagnostico: "O número de leads sobe e desce sem relação clara com o Instagram ou com o anúncio. Normalmente isso quer dizer que a maior parte dos leads vem de outro lugar (indicação, Google, paciente antigo) ou que a data do lead no CRM não é a data do primeiro contato.",
        evidencia: evid, confianca: confCorr === "alta" ? "media" : confCorr,
        impacto: "medio", acao: { texto: "Preencher a origem do lead no CRM por 30 dias para saber de onde o paciente vem.", rota: "/$clientId/crm-painel", botao: "Ver o checklist do CRM" },
        responsavel: "comercial", risco: riscoCorr,
      });
    }
  }

  // Insight B: o que engaja x o que vem antes de lead.
  if (diasDePico.length > 0 && engajaram.length >= 3) {
    const top = diasDePico[0];
    const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    const descDia = (d: DiaLead) => (d.posts.length === 1 ? legenda(d.posts[0]) : `${d.posts.length} posts em ${dm(d.dia)} (${d.posts.map(legenda).join(", ")})`);
    const misturado = postsPorDia > 1.5;
    const vz = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    insights.push({
      id: "cruz-posts", area: "conteudo", tom: sobreposicao === 0 ? "atencao" : "bom",
      titulo: sobreposicao === 0
        ? "Os posts que mais engajam não são os que vêm antes de lead."
        : `${sobreposicao} dos 5 posts que mais engajaram ${sobreposicao === 1 ? "saiu num dia seguido" : "saíram em dias seguidos"} de pico de lead.`,
      diagnostico: (sobreposicao === 0
        ? `Os 5 posts com mais curtidas e comentários saíram em dias normais de lead. Já depois de ${descDia(top)} entraram ${top.leads48h} leads em 48h, ${vz(top.vezes)}x o normal. Curtida mede interesse; lead mede intenção de marcar — costumam ser assuntos diferentes.`
        : `Nesses dias engajamento e lead andaram juntos: são assuntos que atraem e convertem. O maior pico veio depois de ${descDia(top)}: ${top.leads48h} leads em 48h, ${vz(top.vezes)}x o normal.`) +
        (misturado ? ` Como o perfil publica ${vz(postsPorDia)} posts por dia, a leitura é do dia, não de um post isolado.` : ""),
      evidencia: diasDePico.map((d) => `${dm(d.dia)} (${d.posts.length} post${d.posts.length > 1 ? "s" : ""}): ${d.leads48h} leads em 48h, normal ${int(d.base48h)}${d.comAnuncioForte ? " — anúncio forte nesses dias" : ""}`).join(" · "),
      confianca: misturado || diasDePico.some((d) => d.comAnuncioForte) ? "baixa" : confiancaPorAmostra(diasComPost.length, 10),
      motivoConfianca: `${diasComPost.length} dias com post; lead contado no dia do post e no seguinte${misturado ? "; vários posts por dia" : ""}`,
      impacto: "alto",
      acao: { texto: top.posts.length === 1 ? `Fazer mais 2 posts no assunto de ${legenda(top.posts[0])} nas próximas 2 semanas, publicados sozinhos no dia, para confirmar se trazem lead.` : `Testar por 2 semanas um post por dia nos assuntos de ${dm(top.dia)}, para separar qual deles traz lead.`, rota: "/$clientId/posts", botao: "Ver os posts desses dias" },
      responsavel: "social_media",
      risco: "Correlação no tempo, não prova de causa. Dias com anúncio forte estão marcados.",
    });
  }

  return { dias: dias.length, leadsTotal, corrOrganico, corrAnuncio, diasDePico, postsQueMaisEngajaram: engajaram, sobreposicao, postsPorDia, insights, limitacoes };
}
