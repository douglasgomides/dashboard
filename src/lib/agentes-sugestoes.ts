// Regras puras dos agentes Recuperação de pacientes, Gestor de anúncios e Roteirista de conteúdo
// (api/_lib/agentes.ts). Aqui fica o que é decidido por regra e testado (quem entra na lista, qual campanha tem sinal)
// e a validação do que a IA escreve: CFM, dado pessoal, formato. A IA escreve; o servidor confere; uma pessoa aprova.
import { textoSemDadoPessoal } from "./brand-brain.js";
import { ferirCFM } from "./campanhas-ia.js";

const txt = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Sem travessão (padrão de escrita da Doctor Creator). */
const semTravessao = (t: string) => t.replace(/\s*[—–]\s*|\s+-\s+/g, ", ");
const lista = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.map((i) => semTravessao(txt(i, max))).filter((s) => s.length >= 2).slice(0, n) : []);
const ok = (t: string) => !ferirCFM(t) && textoSemDadoPessoal(t);

// ---------------------------------------------------------------- Recuperação de pacientes

export interface ResumoCandidato {
  conversa_id: string;
  ultima_msg_em: string | null;
  ate_msg_em: string | null;
  resumo: Record<string, any>;
}
export interface Candidato { conversa_id: string; dias: number; prioridade: number; motivo: "aguardando_clinica" | "pediu_preco" | "interesse" }

/** Quem entra na lista do dia: conversa comercial, não agendou, com interesse real ou esperando a clínica, parada de
 *  1 a 21 dias, com leitura da IA em dia (sem mensagem nova depois da leitura) e sem sugestão nos últimos 14 dias. */
export function escolherRecuperaveis(xs: ResumoCandidato[], jaSugeridas: Set<string>, agora = Date.now(), limite = 12): Candidato[] {
  const out: Candidato[] = [];
  for (const x of xs) {
    const r = x.resumo ?? {};
    if (r.comercial === false || r.etapa === "agendou" || r.situacao === "agendou" || r.etapa === "nao_e_paciente") continue;
    if (jaSugeridas.has(x.conversa_id) || !x.ultima_msg_em) continue;
    const ult = Date.parse(x.ultima_msg_em);
    if (x.ate_msg_em && ult - Date.parse(x.ate_msg_em) > 3_600_000) continue; // conversa andou depois da leitura
    const dias = (agora - ult) / 86_400_000;
    if (dias < 1 || dias > 21) continue;
    const esperando = r.situacao === "aguardando_clinica";
    if (!esperando && r.recuperavel !== true) continue;
    const motivo = esperando ? "aguardando_clinica" : r.preco_pedido === true ? "pediu_preco" : "interesse";
    out.push({ conversa_id: x.conversa_id, dias: Math.floor(dias), prioridade: (motivo === "aguardando_clinica" ? 30 : motivo === "pediu_preco" ? 20 : 10) - Math.min(9, Math.floor(dias / 3)), motivo });
  }
  return out.sort((a, b) => b.prioridade - a.prioridade || a.dias - b.dias).slice(0, limite);
}

export interface MensagemRecuperacao { conversa_id: string; mensagem: string; por_que: string }

/** A mensagem tem que ser de uma conversa da lista, curta, sem preço/promoção/garantia e sem telefone ou e-mail.
 *  O nome entra pela tela ([nome]), nunca pela IA. */
// A IA não conhece a agenda: data, dia da semana ou horário concretos na mensagem são inventados.
const AGENDA_INVENTADA = /\b\d{1,2}\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}(:\d{2}|h\d{0,2})\b|\b(segunda|ter[çc]a|quarta|quinta|sexta)(-feira)?\b|\bs[áa]bado\b/i;

export function validarRecuperacao(bruto: unknown, ids: Set<string>): { ok: MensagemRecuperacao[]; descartes: string[] } {
  const saida: MensagemRecuperacao[] = [];
  const descartes: string[] = [];
  const itens = Array.isArray((bruto as any)?.mensagens) ? (bruto as any).mensagens as unknown[] : [];
  const vistos = new Set<string>();
  for (const x of itens) {
    const i = (x ?? {}) as Record<string, unknown>;
    const id = String(i.conversa_id ?? "");
    const mensagem = semTravessao(txt(i.mensagem, 600));
    if (!ids.has(id) || vistos.has(id)) { descartes.push(`${id.slice(0, 8)}: conversa fora da lista ou repetida`); continue; }
    if (mensagem.length < 30) { descartes.push(`${id.slice(0, 8)}: mensagem curta`); continue; }
    if (AGENDA_INVENTADA.test(mensagem)) { descartes.push(`${id.slice(0, 8)}: inventou data ou horário`); continue; }
    if (/\b(est[áa]|segue|fica|ficou)\s+(confirmad|agendad|marcad|remarcad|cancelad)/i.test(mensagem)) { descartes.push(`${id.slice(0, 8)}: afirmou estado de agendamento`); continue; }
    const cfm = ferirCFM(mensagem);
    if (cfm) { descartes.push(`${id.slice(0, 8)}: fere o CFM (${cfm})`); continue; }
    if (!textoSemDadoPessoal(mensagem)) { descartes.push(`${id.slice(0, 8)}: dado pessoal`); continue; }
    vistos.add(id);
    saida.push({ conversa_id: id, mensagem: /^\s*(oi|ol[áa])\b/i.test(mensagem) && !/\[nome\]/i.test(mensagem) ? mensagem.replace(/^\s*(oi|ol[áa])\b[!,.]?/i, "Oi, [nome]!") : mensagem, por_que: semTravessao(txt(i.por_que, 240)) });
  }
  return { ok: saida, descartes };
}

// ---------------------------------------------------------------- Gestor de anúncios

export interface LinhaAds { campaign_id: string | null; date: string; spend: number | null; impressions: number | null; reach: number | null; frequency: number | null; leads: number | null; conversations: number | null; link_clicks: number | null }
export type TipoSinal = "sem_resultado" | "custo_subiu" | "fadiga" | "escalar";
export interface SinalAds {
  campanha_id: string; campanha: string; tipo: TipoSinal; prioridade: number;
  gasto7: number; resultados7: number; custo7: number | null; custoAntes: number | null; frequencia7: number | null; evidencias: string[];
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Compara os últimos 7 dias com os 7 anteriores, por campanha. Resultado = conversas + leads. Só campanha com gasto
 *  relevante entra; os limites são conservadores para não gerar alarme com pouco dado. */
export function diagnosticarAnuncios(linhas: LinhaAds[], nomes: Record<string, string>, hoje: string): SinalAds[] {
  const dia = (d: string) => Math.round((Date.parse(hoje) - Date.parse(d)) / 86_400_000);
  type Acc = { gasto: number; res: number; imp: number; freqImp: number };
  const novo = (): Acc => ({ gasto: 0, res: 0, imp: 0, freqImp: 0 });
  const por = new Map<string, { a: Acc; b: Acc }>();
  for (const l of linhas) {
    if (!l.campaign_id) continue;
    const d = dia(l.date);
    if (d < 0 || d >= 14) continue;
    const g = por.get(l.campaign_id) ?? { a: novo(), b: novo() };
    const acc = d < 7 ? g.a : g.b;
    acc.gasto += Number(l.spend ?? 0);
    acc.res += Number(l.conversations ?? 0) + Number(l.leads ?? 0);
    const imp = Number(l.impressions ?? 0);
    acc.imp += imp;
    acc.freqImp += Number(l.frequency ?? 0) * imp;
    por.set(l.campaign_id, g);
  }
  const conta = [...por.values()].reduce((s, g) => ({ gasto: s.gasto + g.a.gasto, res: s.res + g.a.res }), { gasto: 0, res: 0 });
  const custoConta = conta.res > 0 ? conta.gasto / conta.res : null;
  const sinais: SinalAds[] = [];
  for (const [id, { a, b }] of por) {
    if (a.gasto < 30) continue;
    const custo7 = a.res > 0 ? a.gasto / a.res : null;
    const custoAntes = b.res > 0 ? b.gasto / b.res : null;
    const freq = a.imp > 0 ? a.freqImp / a.imp : null;
    const base = { campanha_id: id, campanha: nomes[id] ?? `Campanha ${id}`, gasto7: Math.round(a.gasto * 100) / 100, resultados7: a.res, custo7, custoAntes, frequencia7: freq };
    const ev = [`Últimos 7 dias: ${brl(a.gasto)} investidos, ${a.res} resultado${a.res === 1 ? "" : "s"} (conversas + leads)${custo7 ? `, ${brl(custo7)} por resultado` : ""}.`];
    if (custoAntes) ev.push(`7 dias anteriores: ${brl(b.gasto)}, ${b.res} resultados, ${brl(custoAntes)} por resultado.`);
    if (custoConta) ev.push(`Média da conta nos últimos 7 dias: ${brl(custoConta)} por resultado.`);
    if (freq) ev.push(`Frequência média: ${freq.toFixed(1)}.`);
    const limiteSem = Math.max(80, (custoConta ?? 40) * 3);
    if (a.res === 0 && a.gasto >= limiteSem) sinais.push({ ...base, tipo: "sem_resultado", prioridade: 40, evidencias: ev });
    else if (custo7 && custoAntes && b.res >= 5 && custo7 > custoAntes * 1.4) sinais.push({ ...base, tipo: "custo_subiu", prioridade: 30, evidencias: ev });
    else if (freq && freq >= 3.2 && a.gasto >= 50) sinais.push({ ...base, tipo: "fadiga", prioridade: 20, evidencias: ev });
    else if (custo7 && custoConta && a.res >= 10 && custo7 <= custoConta * 0.7 && (freq ?? 0) < 2.5) sinais.push({ ...base, tipo: "escalar", prioridade: 25, evidencias: ev });
  }
  return sinais.sort((x, y) => y.prioridade - x.prioridade || y.gasto7 - x.gasto7).slice(0, 8);
}

export interface CopyAnuncio { gancho: string; texto: string; cta: string }
export interface RecomendacaoAds { campanha_id: string; titulo: string; acao: string; passos: string[]; copies: CopyAnuncio[] }

/** A IA escreve o plano e as copies; o servidor confere CFM e dado pessoal. Copy que fere o CFM sai, a recomendação fica. */
export function validarAnuncios(bruto: unknown, ids: Set<string>): { ok: RecomendacaoAds[]; descartes: string[] } {
  const saida: RecomendacaoAds[] = [];
  const descartes: string[] = [];
  const itens = Array.isArray((bruto as any)?.recomendacoes) ? (bruto as any).recomendacoes as unknown[] : [];
  for (const x of itens) {
    const i = (x ?? {}) as Record<string, unknown>;
    const id = String(i.campanha_id ?? "");
    if (!ids.has(id) || saida.some((s) => s.campanha_id === id)) { descartes.push(`${id}: campanha fora da lista ou repetida`); continue; }
    const titulo = semTravessao(txt(i.titulo, 140)), acao = semTravessao(txt(i.acao, 600));
    const passos = lista(i.passos, 6, 240);
    if (titulo.length < 8 || acao.length < 20 || passos.length < 2) { descartes.push(`${id}: recomendação incompleta`); continue; }
    if (![titulo, acao, ...passos].every(textoSemDadoPessoal)) { descartes.push(`${id}: dado pessoal`); continue; }
    const copies: CopyAnuncio[] = [];
    for (const c of Array.isArray(i.copies) ? (i.copies as Record<string, unknown>[]).slice(0, 3) : []) {
      const cp = { gancho: semTravessao(txt(c?.gancho, 160)), texto: semTravessao(txt(c?.texto, 700)), cta: semTravessao(txt(c?.cta, 120)) };
      if (cp.gancho.length < 8 || cp.texto.length < 30) continue;
      if (![cp.gancho, cp.texto, cp.cta].every(ok)) { descartes.push(`${id}: uma copy saiu (CFM ou dado pessoal)`); continue; }
      copies.push(cp);
    }
    saida.push({ campanha_id: id, titulo, acao, passos, copies });
  }
  return { ok: saida, descartes };
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export interface CenaReels { fala: string; tela: string; visual: string }
export interface SlideCarrossel { titulo: string; texto: string }
export interface PecaConteudo {
  formato: "reels" | "carrossel";
  titulo: string;
  objetivo: "alcance" | "salvamento" | "conversa" | "autoridade";
  gancho: string;
  cenas: CenaReels[];
  slides: SlideCarrossel[];
  legenda: string;
  cta: string;
  hashtags: string[];
  por_que: string;
  evidencias: string[];
  brain: string[];
}

const OBJETIVOS = ["alcance", "salvamento", "conversa", "autoridade"] as const;

/** Peça pronta para gravar ou montar: Reels com 3 a 10 cenas, carrossel com 5 a 10 slides, legenda e chamada.
 *  Tudo passa pelo CFM e pelo filtro de dado pessoal; travessão vira vírgula. */
export function validarConteudo(bruto: unknown, chavesBrain: string[], titulosAnteriores: string[] = []): { ok: PecaConteudo[]; descartes: string[] } {
  const saida: PecaConteudo[] = [];
  const descartes: string[] = [];
  const brainOk = new Set(chavesBrain);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  const vistos = new Set(titulosAnteriores.map(norm));
  const itens = Array.isArray((bruto as any)?.pecas) ? (bruto as any).pecas as unknown[] : [];
  for (const x of itens) {
    const i = (x ?? {}) as Record<string, any>;
    const formato = i.formato === "carrossel" ? "carrossel" : i.formato === "reels" ? "reels" : null;
    const titulo = semTravessao(txt(i.titulo, 120));
    const rot = titulo || "(sem título)";
    if (!formato) { descartes.push(`${rot}: formato inválido`); continue; }
    const p: PecaConteudo = {
      formato, titulo,
      objetivo: (OBJETIVOS as readonly string[]).includes(i.objetivo) ? i.objetivo : "salvamento",
      gancho: semTravessao(txt(i.gancho, 160)),
      cenas: (Array.isArray(i.cenas) ? i.cenas : []).slice(0, 10).map((c: any) => ({ fala: semTravessao(txt(c?.fala, 400)), tela: semTravessao(txt(c?.tela, 120)), visual: semTravessao(txt(c?.visual, 200)) })).filter((c: CenaReels) => c.fala.length >= 5),
      slides: (Array.isArray(i.slides) ? i.slides : []).slice(0, 10).map((s: any) => ({ titulo: semTravessao(txt(s?.titulo, 120)), texto: semTravessao(txt(s?.texto, 400)) })).filter((s: SlideCarrossel) => s.titulo.length >= 3),
      legenda: semTravessao(typeof i.legenda === "string" ? i.legenda.trim().slice(0, 2200) : ""),
      cta: semTravessao(txt(i.cta, 160)),
      hashtags: lista(i.hashtags, 8, 40).map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
      por_que: semTravessao(txt(i.por_que, 400)),
      evidencias: lista(i.evidencias, 4, 240),
      brain: lista(i.brain, 6, 80).filter((k) => brainOk.has(k)),
    };
    if (titulo.length < 8 || p.gancho.length < 8) { descartes.push(`${rot}: falta título ou gancho`); continue; }
    if (formato === "reels" && p.cenas.length < 3) { descartes.push(`${rot}: Reels com menos de 3 cenas`); continue; }
    if (formato === "carrossel" && p.slides.length < 5) { descartes.push(`${rot}: carrossel com menos de 5 slides`); continue; }
    if (p.legenda.length < 80 || !p.cta) { descartes.push(`${rot}: falta legenda ou chamada`); continue; }
    if (!p.evidencias.length && !p.brain.length) { descartes.push(`${rot}: sem dado nem item do Brain que sustente`); continue; }
    const textos = [titulo, p.gancho, p.legenda, p.cta, ...p.cenas.flatMap((c) => [c.fala, c.tela]), ...p.slides.flatMap((s) => [s.titulo, s.texto])];
    const cfm = textos.map(ferirCFM).find(Boolean);
    if (cfm) { descartes.push(`${rot}: fere o CFM (${cfm})`); continue; }
    if (!textos.every(textoSemDadoPessoal)) { descartes.push(`${rot}: dado pessoal`); continue; }
    const k = norm(titulo);
    if (vistos.has(k)) { descartes.push(`${rot}: repetida`); continue; }
    vistos.add(k);
    saida.push(p);
  }
  return { ok: saida, descartes };
}

/** Texto único para copiar e mandar para quem grava ou monta (WhatsApp, Notion, Canva). */
export function pecaParaTexto(p: PecaConteudo): string {
  const partes = [`${p.formato === "reels" ? "REELS" : "CARROSSEL"}: ${p.titulo}`, "", `Gancho: ${p.gancho}`, ""];
  if (p.formato === "reels") p.cenas.forEach((c, n) => partes.push(`Cena ${n + 1}`, `Fala: ${c.fala}`, ...(c.tela ? [`Texto na tela: ${c.tela}`] : []), ...(c.visual ? [`Imagem: ${c.visual}`] : []), ""));
  else p.slides.forEach((s, n) => partes.push(`Slide ${n + 1}: ${s.titulo}`, ...(s.texto ? [s.texto] : []), ""));
  partes.push(`Chamada: ${p.cta}`, "", "Legenda:", p.legenda, ...(p.hashtags.length ? ["", p.hashtags.join(" ")] : []));
  return partes.join("\n");
}
