// Camada de inteligência dos agentes: filtro de ruído, aprendizado com o resultado real e autocrítica.
//
// 1. Filtro: antes de qualquer agente ler, o que não gera valor sai (emoji, marcação de amigo, elogio solto, conversa
//    não comercial, post sem alcance). Cada leitura diz quanto entrou e quanto foi descartado como ruído.
// 2. Aprendizado: o sistema compara grupos com o dado real da própria clínica (posts, conversas, anúncios e o resultado
//    das sugestões anteriores) e escreve lições com número e tamanho da amostra. Ninguém precisa marcar nada.
//    Só vira lição o que tem amostra mínima e diferença grande; a lição é recalculada todo dia e some se deixar de valer.
// 3. Medição: o sistema descobre sozinho se uma peça sugerida foi publicada (e como foi) e o que aconteceu com a
//    campanha depois da recomendação.
// 4. Autocrítica: um segundo agente dá nota a cada item antes de chegar à equipe; o que fica abaixo do corte é descartado.
// Regra explicável, sem IA, para tudo que é número. A IA só escreve e critica.

import { classificarComentario, type TipoComentario } from "./classificar-comentario.js";

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/\s+/g, " ").trim();
const pct = (x: number) => `${(100 * x).toLocaleString("pt-BR", { maximumFractionDigits: x < 0.1 ? 1 : 0 })}%`;
const vezes = (x: number) => `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}x`;
const reais = (x: number) => `R$ ${x.toLocaleString("pt-BR", { maximumFractionDigits: x < 100 ? 2 : 0, minimumFractionDigits: x < 100 ? 2 : 0 })}`;
export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------- 1. filtro de ruído

export interface Filtro { lidos: number; uteis: number; ruido: number; motivos: Record<string, number> }
const novoFiltro = (): Filtro => ({ lidos: 0, uteis: 0, ruido: 0, motivos: {} });
function descarta(f: Filtro, motivo: string) { f.ruido++; f.motivos[motivo] = (f.motivos[motivo] ?? 0) + 1; }

const ROTULO_RUIDO: Record<TipoComentario | "repetido" | "curto", string> = {
  pergunta: "pergunta", relato: "relato", elogio: "elogio solto", marcacao: "marcação de amigo", outro: "emoji, piada ou spam", repetido: "repetido", curto: "curto demais",
};

/** Comentários que ensinam algo: perguntas e relatos (o que o público quer saber e vive). Elogio, marcação, emoji e
 *  repetição saem. */
export function filtrarComentarios<T extends { text: string }>(rows: T[], aceitar: TipoComentario[] = ["pergunta", "relato"]): { uteis: (T & { tipo: TipoComentario })[]; filtro: Filtro } {
  const f = novoFiltro();
  const vistos = new Set<string>();
  const uteis: (T & { tipo: TipoComentario })[] = [];
  for (const r of rows) {
    f.lidos++;
    const n = norm(r.text).replace(/@[\w.]+/g, "").replace(/[^a-z0-9 ]/g, "").trim();
    if (n.length < 12) { descarta(f, ROTULO_RUIDO.curto); continue; }
    const tipo = classificarComentario(r.text);
    if (!aceitar.includes(tipo)) { descarta(f, ROTULO_RUIDO[tipo]); continue; }
    const chave = n.split(" ").slice(0, 8).join(" ");
    if (vistos.has(chave)) { descarta(f, ROTULO_RUIDO.repetido); continue; }
    vistos.add(chave);
    f.uteis++;
    uteis.push({ ...r, tipo });
  }
  return { uteis, filtro: f };
}

export interface ResumoConversa {
  comercial?: boolean | null; situacao?: string | null; etapa?: string | null; resumo?: string | null; interesse?: string | null;
  falhas?: string[] | null; objecoes?: string[] | null; origem?: string | null; preco_pedido?: boolean | null; preco_apresentado?: boolean | null;
  atendimento?: { nota_0a10?: number | null } | null; [k: string]: unknown;
}

/** Conversas que servem para aprender venda: só as comerciais, com leitura completa. */
export function filtrarConversas<T extends ResumoConversa>(rows: T[]): { uteis: T[]; filtro: Filtro } {
  const f = novoFiltro();
  const uteis: T[] = [];
  for (const r of rows) {
    f.lidos++;
    if (!r || typeof r !== "object") { descarta(f, "leitura vazia"); continue; }
    if (r.comercial !== true) { descarta(f, r.comercial === false ? "não comercial (paciente antigo, recado, fornecedor)" : "sem classificação"); continue; }
    if (!r.situacao && !r.etapa) { descarta(f, "leitura incompleta"); continue; }
    f.uteis++;
    uteis.push(r);
  }
  return { uteis, filtro: f };
}

export interface PostMetricas { format: string | null; tema: string | null; caption: string | null; reach: number | null; saved: number | null; shares: number | null; posted_at?: string | null; permalink?: string | null }

/** Posts com alcance suficiente para comparar (abaixo de 100 de alcance, a taxa é sorte). */
export function filtrarPosts<T extends PostMetricas>(rows: T[], alcanceMin = 100): { uteis: T[]; filtro: Filtro } {
  const f = novoFiltro();
  const uteis: T[] = [];
  for (const p of rows) {
    f.lidos++;
    if (p.reach == null || p.saved == null) { descarta(f, "sem métrica"); continue; }
    if (p.reach < alcanceMin) { descarta(f, `alcance abaixo de ${alcanceMin}`); continue; }
    f.uteis++;
    uteis.push(p);
  }
  return { uteis, filtro: f };
}

export function somarFiltros(...fs: Filtro[]): Filtro {
  const t = novoFiltro();
  for (const f of fs) { t.lidos += f.lidos; t.uteis += f.uteis; t.ruido += f.ruido; for (const [k, v] of Object.entries(f.motivos)) t.motivos[k] = (t.motivos[k] ?? 0) + v; }
  return t;
}
export function textoFiltro(f: Filtro): string {
  if (!f.lidos) return "nada para ler";
  const top = Object.entries(f.motivos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  return `leu ${f.lidos}, aproveitou ${f.uteis}${f.ruido ? `, descartou ${f.ruido} como ruído (${top})` : ""}`;
}

// ---------------------------------------------------------------- 2. lições

export type AgenteLicao = "conteudo" | "recuperacao" | "anuncios" | "campanhas";
export interface Licao {
  agente: AgenteLicao;
  chave: string; // estável: a mesma lição recalculada atualiza a linha, não duplica
  texto: string; // pronto para o prompt e para a tela
  evidencia: string[];
  n: number; // tamanho da amostra
  efeito: number; // lift (1,8 = 80% melhor) ou diferença em pontos (0,25 = 25 p.p.)
  sinal: "faz" | "evita";
  confianca: "alta" | "media";
  origem: "posts" | "conversas" | "anuncios" | "resultados";
}

export type Gancho = "pergunta" | "numero" | "erro_mito" | "voce" | "historia" | "chamada" | "afirmacao";
export const ROTULO_GANCHO: Record<Gancho, string> = {
  pergunta: "começa com pergunta", numero: "começa com número ou lista", erro_mito: "começa com erro comum ou mito",
  voce: "fala direto com \"você\" / \"se você\"", historia: "começa contando um caso ou história",
  chamada: "começa pedindo para salvar ou mandar para alguém", afirmacao: "começa com afirmação",
};

/** Tipo de abertura pela primeira linha da legenda (que costuma ser o gancho falado). */
export function tipoGancho(caption: string | null): Gancho {
  const linha = norm((caption ?? "").split(/\n/).find((l) => l.trim().length > 3) ?? "").slice(0, 160);
  if (!linha) return "afirmacao";
  if (/^(salva|salve|manda|mande|envia|envie|compartilha|compartilhe|marca|marque|segue|siga)\b/.test(linha)) return "chamada";
  if (/\b(erro|erros|mito|mitos|verdade ou|nao faca|pare de|evite|cuidado com|ninguem te conta|ninguem fala)\b/.test(linha)) return "erro_mito";
  if (/^\d|\b\d+ (coisas|sinais|dicas|passos|motivos|erros|formas|habitos|alimentos|sintomas)\b|\b(tres|quatro|cinco) (coisas|sinais|dicas|passos|motivos)\b/.test(linha)) return "numero";
  if (/\?/.test(linha.slice(0, 120))) return "pergunta";
  if (/^(quando eu|uma paciente|um paciente|essa paciente|esse paciente|hoje atendi|ontem atendi|historia|caso real|recebi uma)/.test(linha)) return "historia";
  if (/^(voce|vc|se voce|se vc|sabe aquela|ja reparou|ja sentiu)\b/.test(linha)) return "voce";
  return "afirmacao";
}

const ROT_FORMATO: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Post estático" };

/** Taxa de salvamento (salvos / alcance): o sinal de que o post tem valor para quem viu. Compartilhamento fica de fora
 *  de propósito: humor viraliza (muito compartilhamento) sem trazer paciente, e distorceria as lições. */
export const taxaSalvamento = (p: PostMetricas) => Number(p.saved ?? 0) / Math.max(1, Number(p.reach ?? 0));

/** Conteúdo: o que faz o público desta clínica SALVAR. */
export function licoesConteudo(posts: PostMetricas[], minGrupo = 6): Licao[] {
  const { uteis } = filtrarPosts(posts);
  if (uteis.length < 12) return [];
  const taxa = taxaSalvamento;
  const base = mediana(uteis.map(taxa));
  if (base <= 0) return [];
  const out: Licao[] = [];
  const grupo = (nome: string, chave: string, xs: PostMetricas[], comoFazer: string) => {
    if (xs.length < minGrupo || xs.length > uteis.length - minGrupo) return;
    const m = mediana(xs.map(taxa));
    const lift = m / base;
    if (lift >= 1.3 || lift <= 0.7) {
      const faz = lift >= 1.3;
      out.push({
        agente: "conteudo", chave: `conteudo:${chave}`, origem: "posts", n: xs.length, efeito: Number(lift.toFixed(2)), sinal: faz ? "faz" : "evita",
        confianca: xs.length >= 15 ? "alta" : "media",
        texto: faz
          ? `${nome} faz o público salvar ${vezes(lift)} mais que a média da clínica (${pct(m)} contra ${pct(base)} do alcance, ${xs.length} posts). ${comoFazer}`
          : `${nome} é salvo ${pct(1 - lift)} menos que a média (${pct(m)} contra ${pct(base)} do alcance, ${xs.length} posts). Use menos ou mude o ângulo.`,
        evidencia: [...xs].sort((a, b) => taxa(b) - taxa(a)).slice(0, 2).map((p) => `"${(p.caption ?? "").split(/\n/)[0].slice(0, 90)}" (${pct(taxa(p))})`),
      });
    }
  };
  const por = <K extends string>(f: (p: PostMetricas) => K | null) => {
    const m = new Map<K, PostMetricas[]>();
    for (const p of uteis) { const k = f(p); if (k) m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  };
  for (const [fmt, xs] of por((p) => p.format as string | null)) grupo(ROT_FORMATO[fmt] ?? fmt, `formato:${fmt}`, xs, "Priorize esse formato.");
  for (const [g, xs] of por((p) => tipoGancho(p.caption))) grupo(`Abertura que ${ROTULO_GANCHO[g]}`, `gancho:${g}`, xs, "Use esse tipo de gancho.");
  for (const [t, xs] of por((p) => { const t = p.tema ? norm(p.tema).slice(0, 40) : ""; return t && !["nulo", "null", "outro", "outros"].includes(t) ? t : null; })) grupo(`O tema "${t}"`, `tema:${t}`, xs, "Faça mais peças nesse tema, com ângulos novos.");
  const tam = por((p) => ((p.caption ?? "").length >= 600 ? "longa" : (p.caption ?? "").length > 0 ? "curta" : null));
  for (const [t, xs] of tam) grupo(t === "longa" ? "Legenda longa (600+ caracteres)" : "Legenda curta", `legenda:${t}`, xs, t === "longa" ? "Vale entregar conteúdo na legenda." : "Seja direto na legenda.");
  // Os ganchos dos posts campeões viram referência de estilo (não para copiar).
  const top = [...uteis].sort((a, b) => taxa(b) - taxa(a)).slice(0, 5).filter((p) => taxa(p) >= base * 2);
  if (top.length >= 3) out.push({
    agente: "conteudo", chave: "conteudo:campeoes", origem: "posts", n: uteis.length, efeito: Number((mediana(top.map(taxa)) / base).toFixed(2)), sinal: "faz", confianca: "alta",
    texto: `Os posts campeões da clínica (pelo menos 2x a média de salvamento) abrem assim; siga o estilo, não copie.`,
    evidencia: top.map((p) => `"${(p.caption ?? "").split(/\n/)[0].slice(0, 100)}" (${ROT_FORMATO[p.format ?? ""] ?? p.format}, ${pct(taxa(p))})`),
  });
  return out.sort((a, b) => Math.abs(Math.log(b.efeito)) - Math.abs(Math.log(a.efeito))).slice(0, 8);
}

const ROT_FALHA: Record<string, string> = {
  sem_follow_up: "a clínica não fez follow-up", demora: "a clínica demorou para responder", sem_resposta: "a pessoa ficou sem resposta",
  sem_cta: "a clínica não convidou para agendar", informacao_inconsistente: "a informação foi inconsistente",
};
const agendou = (r: ResumoConversa) => r.situacao === "agendou" || r.etapa === "agendou";

/** Atendimento: o que separa quem agenda de quem não agenda nas conversas desta clínica. */
export function licoesComerciais(resumos: ResumoConversa[], minGrupo = 8): Licao[] {
  const { uteis } = filtrarConversas(resumos);
  if (uteis.length < 25) return [];
  const out: Licao[] = [];
  const taxa = (xs: ResumoConversa[]) => (xs.length ? xs.filter(agendou).length / xs.length : 0);
  const compara = (chave: string, com: ResumoConversa[], sem: ResumoConversa[], quando: string, comoFazer: string, ruimQuandoCom: boolean) => {
    if (com.length < minGrupo || sem.length < minGrupo) return;
    const a = taxa(com), b = taxa(sem);
    const dif = a - b;
    if (Math.abs(dif) < 0.12) return;
    // Só a direção esperada vira lição (falha que "ajuda" ou boa prática que "atrapalha" é ruído estatístico).
    if (ruimQuandoCom ? dif >= 0 : dif <= 0) return;
    out.push({
      agente: "recuperacao", chave: `comercial:${chave}`, origem: "conversas", n: com.length + sem.length, efeito: Number(Math.abs(dif).toFixed(2)),
      sinal: ruimQuandoCom ? "evita" : "faz", confianca: com.length >= 20 && sem.length >= 20 ? "alta" : "media",
      texto: `Quando ${quando}, ${pct(a)} agendaram, contra ${pct(b)} nas outras conversas (${com.length} e ${sem.length} conversas). ${comoFazer}`,
      evidencia: [`taxa geral de agendamento: ${pct(taxa(uteis))} de ${uteis.length} conversas comerciais`],
    });
  };
  for (const [falha, rot] of Object.entries(ROT_FALHA)) {
    const com = uteis.filter((r) => (r.falhas ?? []).includes(falha));
    const sem = uteis.filter((r) => !(r.falhas ?? []).includes(falha));
    compara(`falha:${falha}`, com, sem, rot, falha === "sem_cta" ? "Termine sempre com convite claro para agendar." : falha === "sem_follow_up" ? "Retome em até 24 horas quem parou de responder." : "Responda rápido e não deixe ninguém sem retorno.", true);
  }
  const notadas = uteis.filter((r) => typeof r.atendimento?.nota_0a10 === "number");
  compara("nota_atendimento", notadas.filter((r) => Number(r.atendimento!.nota_0a10) >= 7), notadas.filter((r) => Number(r.atendimento!.nota_0a10) < 7),
    "o atendimento foi bem avaliado pela auditoria (nota 7 ou mais)", "A qualidade da conversa decide: acolher, explicar e conduzir.", false);
  const pediram = uteis.filter((r) => r.preco_pedido === true);
  compara("preco_apresentado", pediram.filter((r) => r.preco_apresentado === true), pediram.filter((r) => r.preco_apresentado !== true),
    "a pessoa pediu o valor e a clínica respondeu com o valor", "Quem pergunta o valor quer a resposta: informe com contexto do que está incluído.", false);
  // Objeções que mais travam
  const obj = new Map<string, ResumoConversa[]>();
  for (const r of uteis) for (const o of r.objecoes ?? []) { const k = norm(String(o)).slice(0, 40); if (k) obj.set(k, [...(obj.get(k) ?? []), r]); }
  for (const [o, xs] of [...obj.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
    const resto = uteis.filter((r) => !xs.includes(r));
    compara(`objecao:${o}`, xs, resto, `aparece a objeção "${o}"`, "Prepare uma resposta pronta para essa objeção.", true);
  }
  // Origem
  const orig = new Map<string, ResumoConversa[]>();
  for (const r of uteis) { const k = norm(String(r.origem ?? "")).replace("indicação", "indicacao"); if (k && k !== "desconhecida" && k !== "null") orig.set(k, [...(orig.get(k) ?? []), r]); }
  for (const [o, xs] of orig) compara(`origem:${o}`, xs, uteis.filter((r) => !xs.includes(r)), `a pessoa chegou por ${o.replace("_", " ")}`, "Dê prioridade a esse canal na resposta e na captação.", false);
  return out.sort((a, b) => b.efeito - a.efeito).slice(0, 8);
}

export interface LinhaCampanha { campaign_id: string | null; spend: number | null; leads: number | null; conversations: number | null }

/** Anúncios: quanto custa um resultado em cada campanha (30 dias) e quais são referência ou desperdício. */
export function licoesAnuncios(linhas: LinhaCampanha[], nomes: Record<string, string>): Licao[] {
  const por = new Map<string, { gasto: number; res: number }>();
  for (const l of linhas) {
    if (!l.campaign_id) continue;
    const p = por.get(l.campaign_id) ?? { gasto: 0, res: 0 };
    p.gasto += Number(l.spend ?? 0); p.res += Number(l.conversations ?? 0) + Number(l.leads ?? 0);
    por.set(l.campaign_id, p);
  }
  const comRes = [...por.entries()].filter(([, p]) => p.gasto >= 50 && p.res >= 5).map(([id, p]) => ({ id, ...p, cpr: p.gasto / p.res }));
  const out: Licao[] = [];
  if (comRes.length >= 3) {
    const med = mediana(comRes.map((c) => c.cpr));
    for (const c of comRes) {
      const lift = med / c.cpr;
      if (lift >= 1.5) out.push({
        agente: "anuncios", chave: `anuncios:referencia:${c.id}`, origem: "anuncios", n: c.res, efeito: Number(lift.toFixed(2)), sinal: "faz", confianca: c.res >= 20 ? "alta" : "media",
        texto: `"${nomes[c.id] ?? c.id}" traz resultado por ${reais(c.cpr)}, ${vezes(lift)} mais barato que a mediana da conta (${reais(med)}, 30 dias, ${c.res} resultados). Use o público e o criativo dela como referência.`,
        evidencia: [`gasto ${reais(c.gasto)}, ${c.res} conversas ou leads`],
      });
    }
  }
  for (const [id, p] of por) if (p.gasto >= 150 && p.res === 0) out.push({
    agente: "anuncios", chave: `anuncios:desperdicio:${id}`, origem: "anuncios", n: 0, efeito: p.gasto, sinal: "evita", confianca: p.gasto >= 400 ? "alta" : "media",
    texto: `"${nomes[id] ?? id}" gastou ${reais(p.gasto)} em 30 dias sem nenhuma conversa ou lead registrado. Não repita esse público ou criativo sem mudar a abordagem (ou confira o rastreio).`,
    evidencia: [`gasto ${reais(p.gasto)}, 0 resultados`],
  });
  return out.sort((a, b) => (b.sinal === "faz" ? b.efeito : 0) - (a.sinal === "faz" ? a.efeito : 0)).slice(0, 6);
}

export interface SugestaoMedida { agente: string; tipo: string; estado: string; resultado: string | null; conteudo?: { objetivo?: string; formato?: string } | null }

/** Resultado das próprias sugestões (medido sozinho): o agente aprende com o que ele mesmo propôs. */
export function licoesResultados(xs: SugestaoMedida[]): Licao[] {
  const out: Licao[] = [];
  const rec = xs.filter((x) => x.agente === "recuperacao" && x.resultado && ["enviada", "respondeu", "agendou"].includes(x.resultado));
  if (rec.length >= 10) {
    const resp = (ys: SugestaoMedida[]) => ys.filter((y) => y.resultado === "respondeu" || y.resultado === "agendou").length / Math.max(1, ys.length);
    const geral = resp(rec);
    const tipos = new Map<string, SugestaoMedida[]>();
    for (const r of rec) tipos.set(r.tipo, [...(tipos.get(r.tipo) ?? []), r]);
    for (const [t, ys] of tipos) {
      if (ys.length < 5) continue;
      const a = resp(ys);
      if (Math.abs(a - geral) < 0.1) continue;
      const rot = t === "aguardando_clinica" ? "quem estava esperando resposta da clínica" : t === "pediu_preco" ? "quem pediu o valor" : "quem teve interesse e parou";
      out.push({ agente: "recuperacao", chave: `resultado:recuperacao:${t}`, origem: "resultados", n: ys.length, efeito: Number(Math.abs(a - geral).toFixed(2)), sinal: a > geral ? "faz" : "evita",
        confianca: ys.length >= 15 ? "alta" : "media",
        texto: `Dos casos com contato vinculado para ${rot}, ${pct(a)} tiveram resposta observada (referência: ${pct(geral)}, ${ys.length} casos). Associação observada; não demonstra efeito causal da abordagem. ${a > geral ? "Priorize esse grupo." : "Mude a abordagem para esse grupo: mais curta e com pergunta fácil."}`,
        evidencia: [`${ys.filter((y) => y.resultado === "agendou").length} agendaram`] });
    }
  }
  const pub = xs.filter((x) => x.agente === "conteudo" && x.resultado?.startsWith("publicado"));
  if (pub.length >= 4) {
    const acima = pub.filter((x) => /acima/.test(x.resultado ?? "")).length;
    out.push({ agente: "conteudo", chave: "resultado:conteudo:publicadas", origem: "resultados", n: pub.length, efeito: Number((acima / pub.length).toFixed(2)), sinal: acima / pub.length >= 0.5 ? "faz" : "evita",
      confianca: pub.length >= 10 ? "alta" : "media",
      texto: `${pub.length} roteiros dos agentes foram publicados; ${acima} ficaram acima da média de salvamento da clínica.`, evidencia: [] });
  }
  return out;
}

/** Bloco para o prompt: só lições ativas, mais fortes primeiro. */
export function licoesParaPrompt(ls: Pick<Licao, "texto" | "evidencia" | "sinal" | "confianca">[], max = 8): string {
  if (!ls.length) return "";
  const xs = [...ls].sort((a, b) => (a.confianca === b.confianca ? 0 : a.confianca === "alta" ? -1 : 1)).slice(0, max);
  return `### O que os dados desta clínica já ensinaram (aprendido sozinho, com número; siga o que é "FAÇA" e evite o que é "EVITE")\n${xs.map((l) => `- ${l.sinal === "faz" ? "FAÇA" : "EVITE"}: ${l.texto}${l.evidencia.length ? ` Exemplos: ${l.evidencia.slice(0, 3).join("; ")}.` : ""}`).join("\n")}`;
}

// ---------------------------------------------------------------- 3. medição automática

const palavras = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3));
function parecido(a: string, b: string): number {
  const A = palavras(a), B = palavras(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / Math.min(A.size, B.size);
}

/** Acha o post publicado que nasceu de um roteiro sugerido (publicado depois e com o mesmo gancho ou título). */
export function casarPublicacao<P extends PostMetricas & { posted_at: string | null }>(s: { titulo: string; gancho?: string | null; criado_em: string }, posts: P[], corte = 0.5): P | null {
  const ini = Date.parse(s.criado_em), fim = ini + 45 * 86_400_000;
  let melhor: P | null = null, nota = 0;
  for (const p of posts) {
    const t = p.posted_at ? Date.parse(p.posted_at) : NaN;
    if (!(t >= ini && t <= fim)) continue;
    const cap = (p.caption ?? "").slice(0, 400);
    const n = Math.max(s.gancho ? parecido(s.gancho, cap) : 0, parecido(s.titulo, cap));
    if (n > nota) { nota = n; melhor = p; }
  }
  return nota >= corte ? melhor : null;
}

/** Texto do resultado de uma peça publicada, comparando com a mediana da clínica. */
export function resultadoPublicacao(p: PostMetricas, medianaClinica: number): string {
  const taxa = taxaSalvamento(p);
  const rel = medianaClinica > 0 ? taxa / medianaClinica : 0;
  return `publicado: ${rel >= 1 ? "acima" : "abaixo"} da média (${pct(taxa)} de salvamento, ${rel ? vezes(rel) : "?"} a mediana; alcance ${Number(p.reach ?? 0).toLocaleString("pt-BR")})`;
}

/** O que aconteceu com a campanha nos 7 dias depois da recomendação (observado, não prova que a ação foi feita). */
export function resultadoCampanha(antes: LinhaCampanha[], depois: LinhaCampanha[]): string | null {
  const soma = (xs: LinhaCampanha[]) => xs.reduce((s, l) => ({ g: s.g + Number(l.spend ?? 0), r: s.r + Number(l.conversations ?? 0) + Number(l.leads ?? 0) }), { g: 0, r: 0 });
  const a = soma(antes), d = soma(depois);
  if (d.g < 1 && a.g >= 1) return "depois de 7 dias: campanha sem gasto (pausada ou parada)";
  if (a.g < 1 || d.g < 1) return null;
  if (!a.r || !d.r) return `depois de 7 dias: ${d.r} resultados com ${reais(d.g)} (antes: ${a.r} com ${reais(a.g)})`;
  const ca = a.g / a.r, cd = d.g / d.r, v = (cd - ca) / ca;
  const dir = Math.abs(v) < 0.1 ? "estável" : v < 0 ? `caiu ${pct(-v)}` : `subiu ${pct(v)}`;
  return `depois de 7 dias: custo por resultado ${dir} (${reais(ca)} → ${reais(cd)})`;
}

// ---------------------------------------------------------------- 4. autocrítica

export const SISTEMA_CRITICO = `Você é o diretor exigente da Doctor Creator. Avalie cada item preparado por outro agente para uma clínica médica, antes de chegar à equipe.
Dê uma nota de 0 a 10 considerando, com o mesmo peso:
1. Específico: usa um dado real desta clínica (número, dúvida, objeção, campanha). Genérico que serviria para qualquer clínica = nota baixa.
2. Pronto para usar: a equipe consegue copiar e usar sem reescrever.
3. Natural: soa como gente falando, sem clichê de marketing nem cara de IA.
4. Chance de resultado: segue as lições aprendidas e tem um motivo claro para funcionar.
Qualquer coisa que fira o CFM (preço, desconto, promessa, antes e depois), invente fato ou faça diagnóstico = nota 0.
Em "motivo", diga em até 15 palavras o que mais pesou.
Responda SOMENTE JSON: {"notas":[{"i":0,"nota":8,"motivo":"..."}]}`;

export interface NotaCritica { i: number; nota: number; motivo: string }

export function lerNotas(bruto: unknown, total: number): Map<number, NotaCritica> {
  const m = new Map<number, NotaCritica>();
  const xs = (bruto as { notas?: unknown })?.notas;
  if (!Array.isArray(xs)) return m;
  for (const x of xs as Record<string, unknown>[]) {
    const i = Number(x?.i), nota = Number(x?.nota);
    if (!Number.isInteger(i) || i < 0 || i >= total || !Number.isFinite(nota) || m.has(i)) continue;
    m.set(i, { i, nota: Math.max(0, Math.min(10, Math.round(nota))), motivo: String(x?.motivo ?? "").slice(0, 160) });
  }
  return m;
}

/** Aplica a crítica: abaixo do corte sai (com o motivo registrado). Se a crítica falhou ou não avaliou um item, ele
 *  passa sem nota (melhor entregar do que perder trabalho por erro de outro modelo). */
export function aplicarCritica<T>(itens: T[], notas: Map<number, NotaCritica>, corte = 6): { ok: (T & { nota: number | null; critica: string | null })[]; descartes: string[] } {
  const ok: (T & { nota: number | null; critica: string | null })[] = [];
  const descartes: string[] = [];
  itens.forEach((it, i) => {
    const n = notas.get(i);
    if (n && n.nota < corte) { descartes.push(`autocrítica (nota ${n.nota}): ${n.motivo}`); return; }
    ok.push({ ...it, nota: n?.nota ?? null, critica: n?.motivo || null });
  });
  return { ok, descartes };
}
